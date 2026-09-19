import crypto from "node:crypto";

import type { AuthenticatedUser, Role } from "@systemboq/shared-types";

import { hashAccessToken } from "../../lib/access-token";
import { anonymizedEmail } from "../../lib/anonymized";
import { writeAuditLog } from "../../lib/audit-log";
import { createNotification, notifyStaff } from "../../lib/notifications";
import { hashPassword, verifyPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { AuthError } from "./auth.error";
import type { RegisterCustomerInput, UpdateProfileInput } from "./auth.schemas";
import { verifySecondFactor } from "./twofactor.service";

// re-export เพื่อความเข้ากันได้กับที่อื่นที่ import { AuthError } from "./auth.service"
export { AuthError };

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12);
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;
// อายุ session ครึ่งทาง (ผ่านรหัสผ่านแล้วแต่ยังไม่กรอกรหัส 2FA) — สั้น ๆ พอให้กรอกรหัสจากแอปทัน
const TWO_FACTOR_PENDING_TTL_MS = 5 * 60_000;

// hash หลอกแบบตายตัว ใช้เพื่อให้เวลาในการล็อกอินใกล้เคียงกันไม่ว่าบัญชีจะมีอยู่จริงหรือไม่
// ลดโอกาสที่จะกวาดหาบัญชีได้จากเวลาที่ตอบกลับ
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHR5c2FsdA$4B9sJd7fJ3aQpVJq5s5eQoQdF3H4E8Km9RxwYyq0F8w";

interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

// สร้าง error สถานะถูกล็อก (423) พร้อมวินาทีที่เหลือ เพื่อให้ frontend นับถอยหลังได้แม่นยำ
// ตัดคำว่า "กรุณาลองใหม่ภายหลัง" ออก เพราะ UI จะแสดงเวลาที่เหลือชัดเจนอยู่แล้ว
function lockedError(lockedUntil: Date): AuthError {
  const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
  return new AuthError(
    "บัญชีถูกล็อกชั่วคราวเนื่องจากพยายามเข้าสู่ระบบผิดหลายครั้ง",
    423,
    retryAfterSeconds,
  );
}

// แจ้งเตือนเมื่อบัญชีเพิ่งถูกล็อก เพื่อให้เจ้าตัวรู้ว่าอาจมีคนพยายามเดารหัส:
// บัญชีพนักงาน → กระจายให้แอดมิน/เจ้าของทุกคน (รับรู้การโจมตีบัญชีภายใน) — บัญชีลูกค้า → แจ้งเจ้าของบัญชีเอง
async function notifyAccountLocked(user: { id: string; email: string; role: string }): Promise<void> {
  if (user.role === "OWNER" || user.role === "ADMIN") {
    await notifyStaff(
      `บัญชีพนักงาน ${user.email} ถูกล็อกชั่วคราว ${LOCK_DURATION_MINUTES} นาที เนื่องจากมีการพยายามเข้าสู่ระบบผิด ${MAX_FAILED_ATTEMPTS} ครั้งติดต่อกัน`,
    );
    return;
  }
  await createNotification({
    userId: user.id,
    message: `บัญชีของคุณถูกล็อกชั่วคราว ${LOCK_DURATION_MINUTES} นาที เนื่องจากมีการพยายามเข้าสู่ระบบผิดหลายครั้ง หากไม่ใช่คุณ โปรดเปลี่ยนรหัสผ่านหรือติดต่อทีมงาน`,
  });
}

function toAuthenticatedUser(user: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  totpEnabled: boolean;
}): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as Role,
    twoFactorEnabled: user.totpEnabled,
  };
}

export async function registerCustomer(
  input: RegisterCustomerInput,
): Promise<AuthenticatedUser> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AuthError("อีเมลนี้ถูกใช้งานแล้ว", 409);
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      role: "CUSTOMER",
      customerProfile: {
        create: {
          phone: input.phone,
          address: input.address ?? null,
        },
      },
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "REGISTER",
    entityType: "User",
    entityId: user.id,
  });

  return toAuthenticatedUser(user);
}

export async function login(
  input: { email: string; password: string; allowedRoles: Role[] } & RequestMeta,
): Promise<{
  user: AuthenticatedUser;
  token: string;
  expiresAt: Date;
  twoFactorRequired: boolean;
}> {
  const genericError = new AuthError("อีเมลหรือรหัสผ่านไม่ถูกต้อง", 401);
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user || !input.allowedRoles.includes(user.role as Role)) {
    await verifyPassword(DUMMY_HASH, input.password);
    throw genericError;
  }

  if (!user.active) {
    throw new AuthError("บัญชีนี้ถูกระงับการใช้งาน", 403);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await writeAuditLog({
      userId: user.id,
      action: "LOGIN_BLOCKED_LOCKED",
      entityType: "User",
      entityId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
    });
    throw lockedError(user.lockedUntil);
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) {
    // ถ้าเพิ่งพ้นล็อกรอบก่อน (lockedUntil เป็นอดีต — เพราะถ้ายังไม่หมดจะถูกดักด้านบนไปแล้ว) ให้เริ่ม
    // นับใหม่จาก 0 ไม่สะสมทบจากรอบเดิม มิฉะนั้นพิมพ์ผิดครั้งเดียวหลังหมดล็อกจะโดนล็อกซ้ำทันที
    const failedAttempts = (user.lockedUntil ? 0 : user.failedAttempts) + 1;
    const shouldLock = failedAttempts >= MAX_FAILED_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60_000)
          : null,
      },
    });
    await writeAuditLog({
      userId: user.id,
      action: "LOGIN_FAILED",
      entityType: "User",
      entityId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
    });
    // เพิ่งถูกล็อกในครั้งนี้ → แจ้งเตือน. เป็นผลข้างเคียงแบบ best-effort: ถ้าล้มเหลวต้องไม่ทำให้
    // การล็อกอิน (ที่ต้องตอบ error รหัสผิดตามปกติ) กลายเป็น 500
    if (shouldLock) {
      await notifyAccountLocked(user).catch(() => undefined);
    }
    throw genericError;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedAttempts: 0,
      lockedUntil: null,
      // บันทึกวันเข้าระบบล่าสุดลงคอลัมน์ ไม่ใช่ปล่อยให้ไปคำนวณจาก AuditLog ทีหลัง —
      // AuditLog ถูกไล่ลบทุก 1 ปี ค่าที่คำนวณจากมันจะกลายเป็น "ยังไม่เคยเข้า" เองเมื่อเวลาผ่านไป
      //
      // เขียนตรงนี้ทั้งที่ยังอาจติดขั้น 2FA อยู่ เพราะถือว่ารหัสผ่านถูกต้องแล้ว = มีคนเข้าถึงบัญชีนี้
      // ได้จริง ซึ่งเป็นสิ่งที่พนักงานต้องเห็นในคอลัมน์ "เข้าระบบล่าสุด" (แถวใน AuditLog ยังแยก
      // LOGIN_PENDING_2FA กับ LOGIN_SUCCESS ไว้ตามเดิมสำหรับการตรวจสอบย้อนหลัง)
      lastLoginAt: new Date(),
    },
  });

  // ถ้าเปิด 2FA ไว้ ยังไม่ออก session เต็ม — ออก session ครึ่งทาง (pending) อายุสั้น แล้วรอผู้ใช้
  // กรอกรหัสจากแอปในขั้นที่สอง (resolveSession จะยังไม่ถือว่าล็อกอินจนกว่าจะยืนยันสำเร็จ)
  const twoFactorRequired = user.totpEnabled;
  const session = twoFactorRequired
    ? await createSession(user.id, user.sessionVersion, input, {
        pendingTwoFactor: true,
        ttlMs: TWO_FACTOR_PENDING_TTL_MS,
      })
    : await createSession(user.id, user.sessionVersion, input);

  await writeAuditLog({
    userId: user.id,
    action: twoFactorRequired ? "LOGIN_PENDING_2FA" : "LOGIN_SUCCESS",
    entityType: "User",
    entityId: user.id,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { user: toAuthenticatedUser(user), twoFactorRequired, ...session };
}

async function createSession(
  userId: string,
  sessionVersion: number,
  meta: RequestMeta,
  opts?: { pendingTwoFactor?: boolean; ttlMs?: number },
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("hex");
  const ttlMs = opts?.ttlMs ?? SESSION_TTL_HOURS * 60 * 60_000;
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.session.create({
    data: {
      id: token,
      userId,
      sessionVersion,
      expiresAt,
      pendingTwoFactor: opts?.pendingTwoFactor ?? false,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });

  return { token, expiresAt };
}

export async function resolveSession(token: string): Promise<AuthenticatedUser | null> {
  const session = await prisma.session.findUnique({
    where: { id: token },
    include: { user: true },
  });
  if (!session) return null;

  const expired = session.expiresAt < new Date();
  const revoked = session.sessionVersion !== session.user.sessionVersion;
  const disabled = !session.user.active;

  if (expired || revoked || disabled) {
    await prisma.session.delete({ where: { id: token } }).catch(() => undefined);
    return null;
  }

  // session ครึ่งทางที่ยังไม่ยืนยัน 2FA ยังไม่ถือว่าล็อกอิน — แต่ไม่ลบทิ้ง เพราะ endpoint ยืนยัน
  // 2FA ต้องใช้ session นี้ต่อ (มันจะหมดอายุเองภายในไม่กี่นาที)
  if (session.pendingTwoFactor) return null;

  return toAuthenticatedUser(session.user);
}

/**
 * ขั้นที่สองของการล็อกอินเมื่อเปิด 2FA: รับ token ของ session ครึ่งทาง + รหัสจากแอป (หรือรหัสสำรอง)
 * ตรวจว่า session ยัง pending/ไม่หมดอายุ/ไม่ถูกเพิกถอน แล้วยืนยันปัจจัยที่สอง เมื่อผ่านจะปลด flag
 * pending และต่ออายุ session เป็นปกติ (token เดิม) — คืน user + วันหมดอายุใหม่
 */
export async function completeTwoFactor(
  token: string,
  code: string,
  meta: RequestMeta,
): Promise<{ user: AuthenticatedUser; expiresAt: Date }> {
  const invalid = new AuthError("เซสชันไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่", 401);
  const session = await prisma.session.findUnique({
    where: { id: token },
    include: { user: true },
  });
  if (!session?.pendingTwoFactor) throw invalid;

  if (
    session.expiresAt < new Date() ||
    session.sessionVersion !== session.user.sessionVersion ||
    !session.user.active
  ) {
    await prisma.session.delete({ where: { id: token } }).catch(() => undefined);
    throw invalid;
  }

  const ok = await verifySecondFactor(session.userId, code);
  if (!ok) {
    await writeAuditLog({
      userId: session.userId,
      action: "2FA_FAILED",
      entityType: "User",
      entityId: session.userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    throw new AuthError("รหัสยืนยันไม่ถูกต้อง", 401);
  }

  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60_000);
  await prisma.session.update({
    where: { id: token },
    data: { pendingTwoFactor: false, expiresAt },
  });

  await writeAuditLog({
    userId: session.userId,
    action: "LOGIN_SUCCESS",
    entityType: "User",
    entityId: session.userId,
    details: { via: "2fa" },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return { user: toAuthenticatedUser(session.user), expiresAt };
}

export async function logout(token: string): Promise<void> {
  await prisma.session.delete({ where: { id: token } }).catch(() => undefined);
}

// ── ลิงก์เข้าใช้ครั้งเดียว (ทีมงานสร้างบัญชีให้ลูกค้าแล้วส่งลิงก์ให้ตั้งรหัสผ่านเอง) ──

const ACCESS_LINK_INVALID = "ลิงก์นี้ใช้ไม่ได้แล้วหรือหมดอายุ กรุณาขอลิงก์ใหม่จากทีมงาน";

// ตรวจ token จาก DB ว่ายังใช้ได้ (ยังไม่ถูกใช้ + ไม่หมดอายุ + บัญชียังใช้งานได้) — ใช้ร่วมกันทั้ง
// การเปิดหน้า (info) และตอนตั้งรหัส (redeem)
async function findUsableAccessToken(raw: string) {
  const token = await prisma.accountAccessToken.findUnique({
    where: { tokenHash: hashAccessToken(raw) },
    include: { user: true },
  });
  if (!token || token.usedAt || token.expiresAt < new Date() || !token.user.active) {
    throw new AuthError(ACCESS_LINK_INVALID, 400);
  }
  return token;
}

/** ฝั่งลูกค้า: เปิดลิงก์ — คืนชื่อ/อีเมลของบัญชีปลายทางเพื่อยืนยันก่อนตั้งรหัส (ไม่แตะสถานะ token) */
export async function getAccessTokenInfo(raw: string): Promise<{ email: string; fullName: string }> {
  const token = await findUsableAccessToken(raw);
  return { email: token.user.email, fullName: token.user.fullName };
}

/**
 * ฝั่งลูกค้า: ตั้งรหัสผ่านผ่านลิงก์ แล้วออก session เต็มให้เข้าระบบทันที (auto-login) —
 * mark token ว่าใช้แล้ว, เผา token อื่นที่ยังไม่ถูกใช้ของบัญชีนี้ทิ้ง, และ bump sessionVersion
 * (เพื่อกรณี reset รหัส: session เดิมของบัญชีจะถูกตัดทันที)
 */
export async function redeemAccessToken(
  raw: string,
  newPassword: string,
  meta: RequestMeta,
  address?: string,
): Promise<{ user: AuthenticatedUser; token: string; expiresAt: Date }> {
  const accessToken = await findUsableAccessToken(raw);
  const passwordHash = await hashPassword(newPassword);

  // บัญชีลูกค้าที่ทีมงานสร้างจากคำขอมี CustomerProfile (พร้อมเบอร์โทร) อยู่แล้ว — upsert ไว้เผื่อ
  // บัญชีที่ไม่มีโปรไฟล์ด้วย เก็บที่อยู่เฉพาะเมื่อลูกค้ากรอกมา (ไม่ทับของเดิมด้วยค่าว่าง)
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: accessToken.userId },
      data: { passwordHash, sessionVersion: { increment: 1 }, failedAttempts: 0, lockedUntil: null },
    });
    await tx.accountAccessToken.update({
      where: { id: accessToken.id },
      data: { usedAt: new Date() },
    });
    await tx.accountAccessToken.deleteMany({
      where: { userId: accessToken.userId, usedAt: null },
    });
    if (address !== undefined) {
      await tx.customerProfile.upsert({
        where: { userId: accessToken.userId },
        create: { userId: accessToken.userId, address },
        update: { address },
      });
    }
    return updated;
  });

  const session = await createSession(user.id, user.sessionVersion, meta);

  await writeAuditLog({
    userId: user.id,
    action: "ACCESS_LINK_REDEEMED",
    entityType: "User",
    entityId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return { user: toAuthenticatedUser(user), ...session };
}

/** การเพิ่มค่า sessionVersion ทำให้ session อื่นทั้งหมดของผู้ใช้คนนี้ใช้ไม่ได้ทันที */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  });
}

/**
 * ตรวจรหัสผ่านปัจจุบัน ตั้งรหัสผ่านใหม่ และยกเลิก session ที่มีอยู่ทั้งหมด (เพิ่ม sessionVersion
 * — cookie ของอุปกรณ์อื่นจะใช้ไม่ได้ทันทีในการตรวจครั้งถัดไป) ก่อนออก session ใหม่หนึ่งอันให้
 * อุปกรณ์ที่เรียกใช้งานนี้
 */
export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string } & RequestMeta,
): Promise<{ token: string; expiresAt: Date }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const passwordOk = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!passwordOk) {
    throw new AuthError("รหัสผ่านปัจจุบันไม่ถูกต้อง", 401);
  }

  const newPasswordHash = await hashPassword(input.newPassword);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: newPasswordHash,
      sessionVersion: { increment: 1 },
    },
  });

  const session = await createSession(updated.id, updated.sessionVersion, {
    ip: input.ip,
    userAgent: input.userAgent,
  });

  await writeAuditLog({
    userId: updated.id,
    action: "CHANGE_PASSWORD",
    entityType: "User",
    entityId: updated.id,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return session;
}

/**
 * สิทธิ์ขอลบข้อมูลตาม PDPA ทำแบบทำให้ไม่ระบุตัวตน (anonymize) แทนการลบถาวร: แถวของ Project,
 * Quote, Contract, Lead และ AuditLog อ้างอิงผู้ใช้คนนี้อยู่ และธุรกิจจริงจำเป็นต้องเก็บสิ่ง
 * เหล่านั้นไว้ด้วยเหตุผลด้านบัญชี/กฎหมาย จึงล้างเฉพาะฟิลด์ข้อมูลส่วนบุคคล ปิดใช้งานบัญชี และ
 * ยกเลิก session ทั้งหมด
 */
export async function deleteMyAccount(userId: string, currentPassword: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const passwordOk = await verifyPassword(user.passwordHash, currentPassword);
  if (!passwordOk) {
    throw new AuthError("รหัสผ่านไม่ถูกต้อง", 401);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        email: anonymizedEmail(userId),
        fullName: "ลูกค้าที่ลบบัญชี",
        active: false,
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.customerProfile.updateMany({
      where: { userId },
      data: {
        phone: null,
        address: null,
        // ข้อมูลนิติบุคคลก็ต้องล้างด้วย — ชื่อผู้ประสานงานและเลขประจำตัวผู้เสียภาษีเป็นข้อมูล
        // ที่ระบุตัวบุคคลได้เช่นกัน ถ้าลืมล้างตรงนี้ คำขอลบข้อมูลจะเหลือร่องรอยค้างอยู่
        customerType: "INDIVIDUAL",
        companyName: null,
        taxId: null,
        branch: null,
        contactPerson: null,
      },
    }),
    // บันทึกการติดต่อเป็นข้อความที่พนักงานพิมพ์เกี่ยวกับ "คนคนนี้" โดยเฉพาะ — ไม่ใช่เอกสารทาง
    // บัญชีที่กฎหมายบังคับให้เก็บ (ดูข้อจำกัดของสิทธิขอลบข้อมูล ข้อ 10 ในนโยบาย) จึงต้องลบไปด้วย
    // ไม่งั้นคำขอลบข้อมูลจะเหลือร่องรอยส่วนตัวค้างอยู่ในระบบ
    prisma.customerNote.deleteMany({ where: { customerId: userId } }),
  ]);

  await writeAuditLog({
    userId,
    action: "DELETE_ACCOUNT",
    entityType: "User",
    entityId: userId,
  });
}

/** ข้อมูลติดต่อของลูกค้า — ที่อยู่และชื่อนิติบุคคลใช้พิมพ์ช่อง "ผู้ว่าจ้าง" บนใบเสนอราคา/สัญญา */
export interface CustomerProfileFields {
  phone: string | null;
  address: string | null;
  customerType: "INDIVIDUAL" | "COMPANY";
  companyName: string | null;
  taxId: string | null;
  branch: string | null;
  contactPerson: string | null;
}

function toProfileFields(profile: {
  phone: string | null;
  address: string | null;
  customerType: string;
  companyName: string | null;
  taxId: string | null;
  branch: string | null;
  contactPerson: string | null;
} | null): CustomerProfileFields {
  return {
    phone: profile?.phone ?? null,
    address: profile?.address ?? null,
    customerType: profile?.customerType === "COMPANY" ? "COMPANY" : "INDIVIDUAL",
    companyName: profile?.companyName ?? null,
    taxId: profile?.taxId ?? null,
    branch: profile?.branch ?? null,
    contactPerson: profile?.contactPerson ?? null,
  };
}

export async function getCustomerProfile(userId: string): Promise<CustomerProfileFields> {
  return toProfileFields(await prisma.customerProfile.findUnique({ where: { userId } }));
}

/**
 * ลูกค้าแก้ข้อมูลติดต่อของตัวเอง — upsert เผื่อบัญชีที่ยังไม่มีโปรไฟล์ อัปเดตเฉพาะช่องที่ส่งมา
 * (undefined = ไม่แตะ, null ของ address = ล้างค่า) เพื่อให้แก้ทีละช่องได้โดยไม่ลบอีกช่องทิ้ง
 */
export async function updateCustomerProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<CustomerProfileFields> {
  // "" จากฟอร์มหมายถึงล้างค่า เก็บเป็น null เสมอ (ช่องว่างในฐานข้อมูลมีรูปแบบเดียว)
  const blank = (v: string | null | undefined) => (v === undefined ? undefined : v || null);
  const data = {
    phone: input.phone,
    address: blank(input.address),
    customerType: input.customerType,
    companyName: blank(input.companyName),
    taxId: blank(input.taxId),
    branch: blank(input.branch),
    contactPerson: blank(input.contactPerson),
  };
  const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

  const current = await prisma.customerProfile.findUnique({ where: { userId } });
  // กฎเดียวกับฝั่งพนักงาน: ตรวจสถานะปลายทาง ไม่ใช่เฉพาะช่องที่ส่งมา — ระบุว่าเป็นนิติบุคคลได้
  // ก็ต่อเมื่อผลลัพธ์มีชื่อนิติบุคคลจริง ไม่งั้นเอกสารจะออกในนามชื่อคนทั้งที่บอกว่าเป็นบริษัท
  const finalType = input.customerType ?? current?.customerType ?? "INDIVIDUAL";
  const finalCompanyName =
    input.companyName !== undefined ? input.companyName : (current?.companyName ?? null);
  if (finalType === "COMPANY" && !finalCompanyName) {
    throw new AuthError("เลือกผู้ว่าจ้างเป็นนิติบุคคล ต้องกรอกชื่อนิติบุคคลด้วย", 400);
  }

  const profile = await prisma.customerProfile.upsert({
    where: { userId },
    create: { userId, ...patch },
    update: patch,
  });

  await writeAuditLog({
    userId,
    action: "UPDATE_PROFILE",
    entityType: "User",
    entityId: userId,
  });

  return toProfileFields(profile);
}
