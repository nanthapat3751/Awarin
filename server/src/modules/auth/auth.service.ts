import crypto from "node:crypto";

import type { AuthenticatedUser, Role } from "@systemboq/shared-types";

import { hashAccessToken } from "../../lib/access-token";
import { anonymizedEmail } from "../../lib/anonymized";
import { writeAuditLog } from "../../lib/audit-log";
import { createNotification, notifyStaff } from "../../lib/notifications";
import { hashPassword, verifyPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { collectUploadFilenames, deleteUploadedFiles } from "../../lib/uploaded-files";
import { isReplaceableSignup, newSignupTicket } from "../../lib/unverified-signups";

import { AuthError } from "./auth.error";
import type { RegisterCustomerInput, UpdateProfileInput } from "./auth.schemas";
import { newPasswordProblem } from "./new-password";
import { alertTwoFactorLocked } from "./two-factor-lock-alert";
import {
  clearTwoFactorFailures,
  reserveTwoFactorAttempt,
  TWO_FACTOR_SESSION_MAX_ATTEMPTS,
  verifySecondFactor,
} from "./twofactor.service";

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
async function notifyAccountLocked(user: {
  id: string;
  email: string | null;
  username: string | null;
  role: string;
}): Promise<void> {
  if (user.role === "OWNER" || user.role === "ADMIN") {
    await notifyStaff(
      `บัญชีพนักงาน ${user.username ?? user.email ?? user.id} ถูกล็อกชั่วคราว ${LOCK_DURATION_MINUTES} นาที เนื่องจากมีการพยายามเข้าสู่ระบบผิด ${MAX_FAILED_ATTEMPTS} ครั้งติดต่อกัน`,
    );
    return;
  }
  await createNotification({
    userId: user.id,
    message: `บัญชีของคุณถูกล็อกชั่วคราว ${LOCK_DURATION_MINUTES} นาที เนื่องจากมีการพยายามเข้าสู่ระบบผิดหลายครั้ง หากไม่ใช่คุณ โปรดเปลี่ยนรหัสผ่านหรือติดต่อทีมงาน`,
  });
}

export function toAuthenticatedUser(user: {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  username: string | null;
  fullName: string;
  role: string;
  totpEnabled: boolean;
  avatarUrl: string | null;
  jobTitle: string | null;
  workPhone: string | null;
  mustChangePassword: boolean;
}): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.email != null && user.emailVerifiedAt != null,
    username: user.username,
    fullName: user.fullName,
    role: user.role as Role,
    twoFactorEnabled: user.totpEnabled,
    avatarUrl: user.avatarUrl,
    jobTitle: user.jobTitle,
    workPhone: user.workPhone,
    mustChangePassword: user.mustChangePassword,
  };
}

/**
 * สมัครสมาชิก — คืนตั๋วแก้อีเมล (signupTicket) ให้เบราว์เซอร์ที่สมัครเก็บไว้ด้วย
 *
 * **อีเมลที่สมัครค้างไว้แต่ไม่เคยยืนยัน ไม่ขวางเจ้าของตัวจริง:** ถ้ามีคนพิมพ์อีเมลของคนอื่นผิดไว้
 * เดิมเจ้าของอีเมลจริงจะสมัครไม่ได้ตลอดไป ("อีเมลนี้ถูกใช้งานแล้ว") ตอนนี้สมัครทับได้ — บัญชีค้าง
 * ถูกแทนที่ทั้งก้อน (ชื่อ รหัสผ่าน เบอร์ ล้างของค้างทุกอย่าง) และรหัสยืนยันไปที่อีเมลนั้นเสมอ
 * คนที่พิมพ์ผิดจึงยึดบัญชีไม่ได้ · ทับได้เฉพาะบัญชีที่ไม่มีของที่พนักงานผูกไว้ (lib/unverified-signups.ts)
 */
export async function registerCustomer(
  input: RegisterCustomerInput,
): Promise<{ user: AuthenticatedUser; signupTicket: string }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing && !(await isReplaceableSignup(existing.id))) {
    throw new AuthError("อีเมลนี้ถูกใช้งานแล้ว", 409);
  }

  const passwordHash = await hashPassword(input.password);
  const ticket = newSignupTicket();
  const now = new Date();

  let user;
  if (existing) {
    user = await prisma.$transaction(async (tx) => {
      // ของค้างทุกอย่างของคนก่อนหน้าต้องตาย — รหัสยืนยัน/ลิงก์ตั้งรหัสที่ส่งไปแล้ว ไม่ใช่ของคนใหม่
      await tx.emailVerification.deleteMany({ where: { userId: existing.id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: existing.id } });
      await tx.session.deleteMany({ where: { userId: existing.id } });
      await tx.knownDevice.deleteMany({ where: { userId: existing.id } });
      await tx.notification.deleteMany({ where: { userId: existing.id } });
      await tx.customerProfile.upsert({
        where: { userId: existing.id },
        create: { userId: existing.id, phone: input.phone, address: input.address ?? null },
        update: {
          phone: input.phone,
          address: input.address ?? null,
          customerType: "INDIVIDUAL",
          companyName: null,
          taxId: null,
          branch: null,
          contactPerson: null,
        },
      });
      return tx.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          passwordChangedAt: now,
          fullName: input.fullName,
          avatarUrl: null,
          failedAttempts: 0,
          lockedUntil: null,
          lastLoginAt: null,
          sessionVersion: { increment: 1 },
          signupTicketHash: ticket.hash,
          signupEmailChanges: 0,
          // นับวันสมัครใหม่ — กำหนดลบอัตโนมัติเริ่มนับจากการสมัครครั้งนี้
          createdAt: now,
        },
      });
    });
  } else {
    user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        passwordChangedAt: now,
        fullName: input.fullName,
        role: "CUSTOMER",
        signupTicketHash: ticket.hash,
        customerProfile: {
          create: {
            phone: input.phone,
            address: input.address ?? null,
          },
        },
      },
    });
  }

  await writeAuditLog({
    userId: user.id,
    action: existing ? "REGISTER_REPLACED_UNVERIFIED" : "REGISTER",
    entityType: "User",
    entityId: user.id,
  });

  return { user: toAuthenticatedUser(user), signupTicket: ticket.raw };
}

/**
 * จองสิทธิ์ลองรหัสหนึ่งครั้งแบบ atomic — คืน null ถ้าบัญชีถูกล็อกอยู่ (หรือครั้งที่จองไว้ครบเพดานแล้ว)
 *
 * เดิมอ่านจำนวนครั้งที่ผิดมา +1 แล้วเขียนกลับหลังตรวจรหัส: คำขอที่ยิงพร้อมกัน (ง่ายมากเมื่อมี API
 * หลายตัวหลัง load balancer) อ่านได้เลขเดียวกันแล้วเขียนทับกัน + ทุกคำขอผ่านด่านล็อกไปก่อน
 * แล้วค่อยตรวจรหัส (argon2 ใช้เวลา ~100ms) — เดาได้เกิน 5 ครั้งก่อนโดนล็อก
 *
 * ตอนนี้ Postgres ล็อกแถวให้ คำสั่งเดียวทั้งเช็คและนับ: ครั้งที่ 5 ตั้ง lockedUntil ทันทีตั้งแต่ยังไม่รู้ผล
 * (ถ้ารหัสถูก ขั้นสำเร็จจะล้างให้เอง) คำขอที่ 6 ที่วิ่งพร้อมกันจึงไม่ได้ลองเลย
 *
 * ล็อกที่หมดอายุแล้ว = เริ่มนับ 1 ใหม่ ไม่สะสมทบรอบเดิม (พิมพ์ผิดครั้งเดียวหลังหมดล็อกต้องไม่โดนล็อกซ้ำ)
 * เวลาเทียบเป็น UTC เพราะคอลัมน์เป็น timestamp ไม่มีโซนเวลา — now() เฉย ๆ ขึ้นกับ TimeZone ของ DB
 */
async function reserveLoginAttempt(userId: string): Promise<{ lockedNow: boolean } | null> {
  const rows = await prisma.$queryRaw<{ failedAttempts: number }[]>`
    UPDATE "User" SET
      "failedAttempts" = CASE WHEN "lockedUntil" IS NOT NULL THEN 1 ELSE "failedAttempts" + 1 END,
      "lockedUntil" = CASE
        WHEN (CASE WHEN "lockedUntil" IS NOT NULL THEN 1 ELSE "failedAttempts" + 1 END) >= ${MAX_FAILED_ATTEMPTS}
          THEN (now() AT TIME ZONE 'UTC') + make_interval(mins => ${LOCK_DURATION_MINUTES}::int)
        ELSE NULL
      END
    WHERE "id" = ${userId}
      AND ("lockedUntil" IS NULL OR "lockedUntil" <= (now() AT TIME ZONE 'UTC'))
      AND ("lockedUntil" IS NOT NULL OR "failedAttempts" < ${MAX_FAILED_ATTEMPTS})
    RETURNING "failedAttempts"`;
  if (rows.length === 0) return null;
  return { lockedNow: Number(rows[0].failedAttempts) >= MAX_FAILED_ATTEMPTS };
}

async function blockedWhileLocked(userId: string, lockedUntil: Date, meta: RequestMeta): Promise<never> {
  await writeAuditLog({
    userId,
    action: "LOGIN_BLOCKED_LOCKED",
    entityType: "User",
    entityId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  throw lockedError(lockedUntil);
}

/**
 * กุญแจที่ใช้ค้นหาบัญชี — พนักงานเป็น username ลูกค้าเป็น email
 * แยกเป็นชนิดข้อมูลแทนที่จะรับสองช่องแล้วเช็คว่าอันไหนไม่ว่าง เพื่อให้ลืมส่งไม่ได้
 */
export type LoginCredential = { kind: "username"; value: string } | { kind: "email"; value: string };

export async function login(
  input: { credential: LoginCredential; password: string; allowedRoles: Role[] } & RequestMeta,
): Promise<{
  user: AuthenticatedUser;
  token: string;
  expiresAt: Date;
  twoFactorRequired: boolean;
}> {
  // ข้อความต้องไม่บอกว่าผิดที่ช่องไหน (กันไล่เดาว่าบัญชีนี้มีอยู่จริงไหม) แต่ต้องเรียกชื่อช่อง
  // ให้ตรงกับที่ผู้ใช้เพิ่งพิมพ์ ไม่งั้นพนักงานจะงงว่าอีเมลอะไรในเมื่อกรอกชื่อผู้ใช้
  const genericError = new AuthError(
    input.credential.kind === "username"
      ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
      : "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    401,
  );
  const user = await prisma.user.findUnique({
    where:
      input.credential.kind === "username"
        ? { username: input.credential.value }
        : { email: input.credential.value },
  });

  if (!user || !input.allowedRoles.includes(user.role as Role)) {
    await verifyPassword(DUMMY_HASH, input.password);
    throw genericError;
  }

  if (!user.active) {
    throw new AuthError("บัญชีนี้ถูกระงับการใช้งาน", 403);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await blockedWhileLocked(user.id, user.lockedUntil, input);
  }

  // จองสิทธิ์ลองหนึ่งครั้ง **ก่อน** ตรวจรหัส (ดู reserveLoginAttempt) — ค่าที่อ่านไว้ข้างบนเก่าได้ทุกเมื่อ
  // ถ้ามีคำขออื่นของบัญชีเดียวกันวิ่งอยู่บน API ตัวอื่น
  const attempt = await reserveLoginAttempt(user.id);
  if (!attempt) {
    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { lockedUntil: true } });
    await blockedWhileLocked(
      user.id,
      fresh?.lockedUntil ?? new Date(Date.now() + LOCK_DURATION_MINUTES * 60_000),
      input,
    );
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) {
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
    if (attempt?.lockedNow) {
      await notifyAccountLocked(user).catch(() => undefined);
    }
    throw genericError;
  }

  // ลูกค้าที่สมัครเองแต่ยังไม่ยืนยันอีเมล เข้าระบบไม่ได้ — นี่คือจุดที่ทำให้ "เมลปลอมสมัครไม่ได้"
  // เป็นจริง (สมัครได้ แต่บัญชีใช้ไม่ได้จนกว่าจะเปิดเมลนั้นได้จริง)
  //
  // เช็คหลังตรวจรหัสผ่านผ่านแล้วโดยตั้งใจ ถ้าเช็คก่อนจะกลายเป็นช่องให้คนนอกไล่ถามว่าอีเมลไหน
  // มีบัญชีอยู่ในระบบ โดยไม่ต้องรู้รหัสผ่านเลย
  //
  // บัญชีที่ทีมงานสร้างให้มี emailVerifiedAt ตั้งแต่ต้น และพนักงานไม่เข้าเงื่อนไขนี้ (role ไม่ใช่
  // CUSTOMER) — เงื่อนไข role จึงต้องมี ไม่งั้นพนักงานทุกคนจะล็อกอินไม่ได้
  if (user.role === "CUSTOMER" && user.emailVerifiedAt === null) {
    // รหัสถูกแล้ว ไม่ใช่การเดา — คืนครั้งที่จองไว้ ไม่งั้นลูกค้าที่ยังไม่ยืนยันอีเมลแต่ลองเข้า 5 ครั้งจะล็อกตัวเอง
    await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } });
    await writeAuditLog({
      userId: user.id,
      action: "LOGIN_BLOCKED_UNVERIFIED",
      entityType: "User",
      entityId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
    });
    throw new AuthError("ยังไม่ได้ยืนยันอีเมล กรุณายืนยันอีเมลก่อนเข้าใช้งาน", 403);
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

const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60_000;

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

  // "ใช้งานล่าสุด" ในหน้าอุปกรณ์ที่เข้าสู่ระบบ — ทุกคำขอผ่านตรงนี้ จึงเขียนไม่ถี่กว่าทุก 5 นาที
  // พลาดก็ไม่เป็นไร (ค่านี้ใช้แสดงผลอย่างเดียว) ต้องไม่ทำให้คำขอที่ล็อกอินถูกต้องกลายเป็น error
  const seenAt = session.lastSeenAt ?? session.createdAt;
  if (Date.now() - seenAt.getTime() > LAST_SEEN_WRITE_INTERVAL_MS) {
    await prisma.session
      .update({ where: { id: token }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

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
  const invalid = new AuthError("เซสชันไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่", 401, undefined, {
    restartLogin: true,
  });
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

  const audit = (action: string, details?: Record<string, unknown>) =>
    writeAuditLog({
      userId: session.userId,
      action,
      entityType: "User",
      entityId: session.userId,
      details,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  // ถูกระงับแล้วเซสชันครึ่งทางนี้ (อายุ 5 นาที) ไม่มีทางใช้ทัน ทิ้งไปเลย ครบเวลาค่อยกรอกรหัสผ่านใหม่
  const suspended = async (lockedUntil: Date): Promise<never> => {
    await prisma.session.delete({ where: { id: token } }).catch(() => undefined);
    throw new AuthError(
      "กรอกรหัสยืนยันผิดหลายครั้ง ระบบระงับการยืนยันตัวตนของบัญชีนี้ชั่วคราว",
      423,
      Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000)),
      { restartLogin: true },
    );
  };

  // จองครั้งก่อนตรวจรหัส — เพดานต่อบัญชี (ดู reserveTwoFactorAttempt)
  const reserved = await reserveTwoFactorAttempt(session.userId);
  if (!reserved) {
    await audit("2FA_BLOCKED_LOCKED");
    const { twoFactorLockedUntil } = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: { twoFactorLockedUntil: true },
    });
    return suspended(twoFactorLockedUntil ?? new Date());
  }

  const result = await verifySecondFactor(session.userId, code);
  if (result !== "ok") {
    await audit("2FA_FAILED", { reason: result });
    if (reserved.lockedUntil) {
      await audit("2FA_LOCKED", { until: reserved.lockedUntil.toISOString() });
      // ระงับรอบนี้ = รหัสผ่านถูกแต่รหัส 6 หลักผิดจนครบเพดาน → บอกเจ้าของบัญชีและ OWNER/ADMIN (ล้มก็ไม่ขวางการตอบ 423)
      await alertTwoFactorLocked(session.user, reserved.lockedUntil).catch(() => undefined);
      return suspended(reserved.lockedUntil);
    }
    const counted = await prisma.session
      .update({ where: { id: token }, data: { twoFactorAttempts: { increment: 1 } }, select: { twoFactorAttempts: true } })
      .catch(() => null);
    if (!counted || counted.twoFactorAttempts >= TWO_FACTOR_SESSION_MAX_ATTEMPTS) {
      await prisma.session.delete({ where: { id: token } }).catch(() => undefined);
      throw new AuthError("กรอกรหัสยืนยันผิดหลายครั้ง กรุณาเข้าสู่ระบบใหม่อีกครั้ง", 401, undefined, {
        restartLogin: true,
      });
    }
    throw new AuthError(
      result === "reused" ? "รหัสนี้ถูกใช้ไปแล้ว กรุณารอรหัสถัดไปในแอปแล้วกรอกใหม่" : "รหัสยืนยันไม่ถูกต้อง",
      401,
    );
  }

  await clearTwoFactorFailures(session.userId);

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
  // ลิงก์นี้ออกให้บัญชีลูกค้าเท่านั้น ซึ่งบังคับมีอีเมลเสมอ — `?? ""` กันชนิดข้อมูลไว้ ไม่ใช่เคสจริง
  return { email: token.user.email ?? "", fullName: token.user.fullName };
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
  const linkProblem = await newPasswordProblem(accessToken.user, newPassword);
  if (linkProblem !== null) throw new AuthError(linkProblem, 400);
  const passwordHash = await hashPassword(newPassword);

  // บัญชีลูกค้าที่ทีมงานสร้างจากคำขอมี CustomerProfile (พร้อมเบอร์โทร) อยู่แล้ว — upsert ไว้เผื่อ
  // บัญชีที่ไม่มีโปรไฟล์ด้วย เก็บที่อยู่เฉพาะเมื่อลูกค้ากรอกมา (ไม่ทับของเดิมด้วยค่าว่าง)
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: accessToken.userId },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        sessionVersion: { increment: 1 },
        failedAttempts: 0,
        lockedUntil: null,
      },
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

  const newProblem = await newPasswordProblem(user, input.newPassword);
  if (newProblem !== null) throw new AuthError(newProblem, 400);

  const newPasswordHash = await hashPassword(input.newPassword);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: newPasswordHash,
      passwordChangedAt: new Date(),
      sessionVersion: { increment: 1 },
      // ปลดธงบังคับเปลี่ยนรหัส — ตรงนี้คือทางเดียวที่ปลดได้ เพราะเป็นทางเดียวที่เจ้าตัวต้องพิสูจน์
      // ว่ารู้รหัสปัจจุบันแล้วตั้งรหัสใหม่ด้วยตัวเอง (ไม่มีใครอื่นรู้รหัสใหม่นี้)
      mustChangePassword: false,
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
        // รูปหน้าคือข้อมูลส่วนบุคคลชัด ๆ — ล้างลิงก์ แล้วลบไฟล์ทิ้งหลังธุรกรรมผ่าน (ข้างล่าง)
        avatarUrl: null,
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
  if (user.avatarUrl) deleteUploadedFiles(collectUploadFilenames(user.avatarUrl));

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

export async function getAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
  return toAuthenticatedUser(await prisma.user.findUniqueOrThrow({ where: { id: userId } }));
}

/** เวลาที่ตั้ง/เปลี่ยนรหัสผ่านล่าสุด · null = ไม่รู้ (บัญชีก่อนมีคอลัมน์นี้) */
export async function getPasswordChangedAt(userId: string): Promise<Date | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordChangedAt: true } });
  return user?.passwordChangedAt ?? null;
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
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true } });
  // กฎเดียวกับฝั่งพนักงาน: ตรวจสถานะปลายทาง ไม่ใช่เฉพาะช่องที่ส่งมา — ระบุว่าเป็นนิติบุคคลได้
  // ก็ต่อเมื่อผลลัพธ์มีชื่อนิติบุคคลจริง ไม่งั้นเอกสารจะออกในนามชื่อคนทั้งที่บอกว่าเป็นบริษัท
  const finalType = input.customerType ?? current?.customerType ?? "INDIVIDUAL";
  const finalCompanyName =
    input.companyName !== undefined ? input.companyName : (current?.companyName ?? null);
  if (finalType === "COMPANY" && !finalCompanyName) {
    throw new AuthError("เลือกผู้ว่าจ้างเป็นนิติบุคคล ต้องกรอกชื่อนิติบุคคลด้วย", 400);
  }

  const renamed = input.fullName !== undefined && input.fullName !== owner.fullName;
  const [profile] = await prisma.$transaction([
    prisma.customerProfile.upsert({
      where: { userId },
      create: { userId, ...patch },
      update: patch,
    }),
    ...(renamed ? [prisma.user.update({ where: { id: userId }, data: { fullName: input.fullName } })] : []),
  ]);

  await writeAuditLog({
    userId,
    action: "UPDATE_PROFILE",
    entityType: "User",
    entityId: userId,
    // ชื่อเปลี่ยน = ชื่อผู้ว่าจ้างบนเอกสารที่ยังไม่ตรึงเปลี่ยนตาม ทีมงานต้องย้อนดูได้ว่าเดิมชื่ออะไร
    ...(renamed ? { details: { fullName: { from: owner.fullName, to: input.fullName } } } : {}),
  });

  return toProfileFields(profile);
}
