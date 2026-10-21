import crypto from "node:crypto";

import { normalizeEmail } from "@systemboq/shared-types";

import { composeMail } from "../../lib/mail-template";
import { sendMail } from "../../lib/mailer";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit-log";
import { hashSignupTicket, isReplaceableSignup, REPLACEABLE_SIGNUP } from "../../lib/unverified-signups";

import { AuthError } from "./auth.error";

/**
 * ยืนยันอีเมลของลูกค้าที่สมัครเอง — ส่งรหัส 6 หลักไปที่อีเมล แล้วให้กรอกกลับมา
 *
 * นี่คือวิธีเดียวที่พิสูจน์ได้ว่าอีเมลมีอยู่จริงและเป็นของคนที่กำลังสมัคร การตรวจรูปแบบและ
 * การถาม DNS (lib/email-domain.ts) เป็นแค่การกรองขยะ ไม่ใช่การพิสูจน์
 *
 * **บัญชีที่ทีมงานสร้างให้ไม่ต้องยืนยัน** — ลิงก์เข้าใช้ส่งทาง LINE/โทรศัพท์ ไม่ได้ส่งทางเมล
 * บังคับยืนยันจะกลายเป็นลูกค้าตั้งรหัสเสร็จแล้วโดนถามหารหัสจากเมลที่ไม่เคยเปิด
 */

/** รหัสหมดอายุใน 15 นาที — นานพอให้เดินไปเปิดเมลในมือถือ สั้นพอที่รหัสหลุดแล้วไม่มีประโยชน์ */
const CODE_TTL_MS = 15 * 60_000;
/** กรอกผิดได้ 5 ครั้งต่อรหัสหนึ่งชุด — กันไล่เดา 000000-999999 */
const MAX_ATTEMPTS = 5;
/** กดขอรหัสใหม่ได้ทุก 60 วินาที — กันใช้ระบบเรายิงเมลถล่มคนอื่น */
const RESEND_COOLDOWN_MS = 60_000;

/** เลขสุ่มแบบเข้ารหัส ไม่ใช่ Math.random — และ randomInt ไม่มีปัญหา modulo bias */
function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * เก็บเป็นแฮช ไม่ใช่ตัวเลขจริง ด้วยเหตุผลเดียวกับรหัสผ่าน — คนที่อ่านฐานข้อมูลได้ต้องยืนยัน
 * อีเมลแทนคนอื่นไม่ได้ · ใช้ SHA-256 ไม่ใช่ bcrypt เพราะรหัสอายุ 15 นาทีและมีเพดานจำนวนครั้ง
 * ที่กรอกผิดอยู่แล้ว การถ่วงเวลาแบบ bcrypt จึงไม่ได้เพิ่มอะไรนอกจากหน่วงทุกคำขอ
 */
function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/** signup = ลูกค้าสมัครเอง · staff-recovery = พนักงานตั้งอีเมลไว้กู้รหัสผ่าน (ข้อความในเมลต่างกัน) */
export type VerificationPurpose = "signup" | "staff-recovery";

function verificationEmail(code: string, fullName: string, email: string, purpose: VerificationPurpose = "signup") {
  if (purpose === "staff-recovery") {
    return composeMail(`รหัสยืนยันอีเมล ${code}`, {
      preheader: `รหัสยืนยันของคุณคือ ${code} หมดอายุใน 15 นาที`,
      recipientName: fullName,
      account: email,
      topic: "ยืนยันอีเมลสำหรับกู้รหัสผ่าน",
      paragraphs: [
        "ใช้รหัสนี้ในหน้า “บัญชีของฉัน” ที่เปิดค้างไว้ เพื่อยืนยันว่าอีเมลนี้เป็นของคุณ หลังยืนยันแล้ว ถ้าลืมรหัสผ่าน คุณขอลิงก์ตั้งรหัสใหม่มาที่อีเมลนี้ได้เอง",
      ],
      code,
      notes: [
        "รหัสหมดอายุใน 15 นาที และใช้ได้ครั้งเดียว",
        "ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร อีเมลนี้จะไม่ถูกผูกกับบัญชีใด",
      ],
    });
  }
  return composeMail(`รหัสยืนยันอีเมล ${code}`, {
    preheader: `รหัสยืนยันของคุณคือ ${code} หมดอายุใน 15 นาที`,
    recipientName: fullName,
    account: email,
    topic: "ยืนยันอีเมลของคุณ",
    paragraphs: ["ใช้รหัสนี้ในหน้าที่เปิดค้างไว้ เพื่อยืนยันอีเมลและเริ่มใช้งานบัญชีของคุณ"],
    code,
    notes: [
      "รหัสหมดอายุใน 15 นาที และใช้ได้ครั้งเดียว",
      "ถ้าคุณไม่ได้สมัครสมาชิก ไม่ต้องทำอะไร บัญชีนี้จะใช้งานไม่ได้ถ้าไม่มีการยืนยัน",
    ],
  });
}

export interface SendCodeResult {
  /** false = ยังอยู่ในช่วงพัก ต้องรออีก retryAfterSeconds วินาที */
  sent: boolean;
  retryAfterSeconds: number;
}

/**
 * สร้างรหัสใหม่แล้วส่งไปที่อีเมลของบัญชีนั้น — ทับรหัสเดิมเสมอ (หนึ่งบัญชีมีได้ครั้งละหนึ่งรหัส)
 *
 * โยน AuthError เฉพาะกรณีที่ส่งเมลไม่ออกจริง ๆ ส่วน "ยังอยู่ในช่วงพัก" คืนเป็นค่าปกติ
 * เพราะเป็นสถานะที่ผู้ใช้ต้องเห็นเป็นนาฬิกานับถอยหลัง ไม่ใช่ข้อผิดพลาด
 */
export async function sendVerificationCode(
  user: {
    id: string;
    email: string | null;
    fullName: string;
  },
  purpose: VerificationPurpose = "signup",
): Promise<SendCodeResult> {
  if (!user.email) throw new AuthError("บัญชีนี้ไม่มีอีเมล", 400);

  const existing = await prisma.emailVerification.findUnique({ where: { userId: user.id } });
  if (existing) {
    const waited = Date.now() - existing.sentAt.getTime();
    if (waited < RESEND_COOLDOWN_MS) {
      return { sent: false, retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - waited) / 1000) };
    }
  }

  const code = generateCode();
  const data = {
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
    attempts: 0,
    sentAt: new Date(),
  };
  await prisma.emailVerification.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  const ok = await sendMail({ to: user.email, ...(await verificationEmail(code, user.fullName, user.email, purpose)) });
  if (!ok) {
    // ลบรหัสทิ้ง ไม่งั้นช่วงพัก 60 วินาทีจะไปกันไม่ให้ผู้ใช้กดลองใหม่ ทั้งที่ยังไม่เคยได้รหัสเลย
    await prisma.emailVerification.delete({ where: { userId: user.id } }).catch(() => undefined);
    throw new AuthError("ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", 502);
  }

  return { sent: true, retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000) };
}

/** หาบัญชีลูกค้าที่ยังไม่ยืนยันจากอีเมล — คืน null ถ้าไม่มีหรือยืนยันไปแล้ว */
export async function findUnverifiedCustomer(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true, email: true, fullName: true, role: true, emailVerifiedAt: true, active: true },
  });
  if (user?.role !== "CUSTOMER" || user.emailVerifiedAt !== null) return null;
  return user;
}

/**
 * ตรวจรหัสที่กรอกมา — ถูกต้องแล้วบัญชีใช้งานได้ทันที
 *
 * ข้อความผิดพลาดตั้งใจให้เหมือนกันทุกกรณีที่ "ยืนยันไม่ผ่าน" (ไม่มีบัญชี / รหัสผิด / หมดอายุ)
 * เพื่อไม่ให้ใช้ปลายทางนี้ไล่ถามว่าอีเมลไหนมีบัญชีอยู่ในระบบ — ยกเว้นกรณีกรอกผิดครบโควตา
 * ที่ต้องบอกตรง ๆ เพราะผู้ใช้ต้องรู้ว่าให้กดขอรหัสใหม่
 */
export async function confirmEmailCode(email: string, code: string): Promise<void> {
  const failed = new AuthError("รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว", 400);
  const user = await findUnverifiedCustomer(email);
  if (!user) throw failed;
  await confirmCodeForUser(user.id, code);
}

/**
 * แกนกลางของการตรวจรหัส 6 หลักของบัญชีหนึ่ง (ลูกค้าที่สมัครเอง / พนักงานที่ตั้งอีเมลกู้รหัส)
 * ถูกแล้วบันทึกว่าอีเมลยืนยันแล้ว · ข้อความผิดพลาดเหมือนกันทุกกรณียกเว้นกรอกผิดครบโควตา
 */
export async function confirmCodeForUser(userId: string, code: string): Promise<void> {
  const failed = new AuthError("รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว", 400);
  const user = { id: userId };

  const row = await prisma.emailVerification.findUnique({ where: { userId: user.id } });
  if (!row) throw failed;

  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.emailVerification.delete({ where: { userId: user.id } });
    throw failed;
  }

  // จองสิทธิ์ลองหนึ่งครั้ง **ก่อน** เทียบรหัส — เช็ค attempts จากแถวที่อ่านไว้แล้วค่อย +1 ตอนผิด ทำให้
  // คำขอที่ยิงพร้อมกัน (หลายเครื่องหลัง load balancer) ผ่านด่านไปหมดก่อนมีใครนับ เดาได้เกิน 5 ครั้ง
  // UPDATE ... WHERE attempts < 5 เป็นคำสั่งเดียว Postgres ล็อกแถวให้ ได้สิทธิ์ครบ 5 ครั้งพอดี
  const reserved = await prisma.emailVerification.updateMany({
    where: { userId: user.id, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count === 0) {
    throw new AuthError("กรอกรหัสผิดหลายครั้งเกินไป กรุณากดขอรหัสใหม่", 429);
  }

  // timingSafeEqual ต้องการบัฟเฟอร์ยาวเท่ากัน — แฮชเป็น hex ความยาวคงที่อยู่แล้ว
  const given = Buffer.from(hashCode(code), "hex");
  const want = Buffer.from(row.codeHash, "hex");
  const match = given.length === want.length && crypto.timingSafeEqual(given, want);

  if (!match) throw failed;

  await prisma.$transaction([
    // ตั๋วแก้อีเมลหมดหน้าที่แล้ว — อีเมลนี้พิสูจน์แล้วว่าเป็นของจริง
    prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(), signupTicketHash: null } }),
    prisma.emailVerification.delete({ where: { userId: user.id } }),
  ]);

  await writeAuditLog({
    userId: user.id,
    action: "VERIFY_EMAIL",
    entityType: "User",
    entityId: user.id,
  });
}

/** แก้อีเมลจากหน้ายืนยันได้กี่ครั้งต่อการสมัครหนึ่งครั้ง */
export const MAX_SIGNUP_EMAIL_CHANGES = 3;

/**
 * แก้อีเมลที่พิมพ์ผิดจากหน้ายืนยัน — ไม่ต้องกรอกฟอร์มสมัครใหม่ทั้งหมด
 *
 * ต้องมีตั๋วที่ได้ตอนสมัคร (เก็บในเบราว์เซอร์ที่สมัคร) — ไม่งั้นใครก็พิมพ์อีเมลคนอื่นมาขอย้ายบัญชี
 * ที่รอยืนยันอยู่ไปเป็นอีเมลตัวเองได้ · ทำได้เฉพาะบัญชีที่ยังไม่ยืนยัน และมีเพดานจำนวนครั้ง
 *
 * อีเมลใหม่ชนกับบัญชีอื่น: ถ้าเป็นบัญชีค้างที่ไม่เคยยืนยัน (แทนที่ได้) ลบอันนั้นทิ้งแล้วย้ายมา
 * — หลักเดียวกับสมัครทับ (registerCustomer) · ถ้าเป็นบัญชีจริง ตอบ "ถูกใช้งานแล้ว" เหมือนตอนสมัคร
 */
export async function changeSignupEmail(
  currentEmail: string,
  ticket: string,
  newEmail: string,
): Promise<{ email: string; codeSent: boolean }> {
  const denied = new AuthError("แก้อีเมลจากหน้านี้ไม่ได้แล้ว กรุณาสมัครใหม่ด้วยอีเมลที่ถูกต้อง", 400);
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(currentEmail) },
    select: { id: true, role: true, emailVerifiedAt: true, signupTicketHash: true, signupEmailChanges: true, fullName: true },
  });
  if (user?.role !== "CUSTOMER" || user.emailVerifiedAt !== null || !user.signupTicketHash) throw denied;
  const want = Buffer.from(user.signupTicketHash, "hex");
  const given = Buffer.from(hashSignupTicket(ticket), "hex");
  if (want.length !== given.length || !crypto.timingSafeEqual(want, given)) throw denied;

  if (user.signupEmailChanges >= MAX_SIGNUP_EMAIL_CHANGES) {
    throw new AuthError(`แก้อีเมลได้ไม่เกิน ${MAX_SIGNUP_EMAIL_CHANGES} ครั้ง กรุณาสมัครใหม่ด้วยอีเมลที่ถูกต้อง`, 429);
  }
  const target = normalizeEmail(newEmail);
  if (target === normalizeEmail(currentEmail)) throw new AuthError("อีเมลใหม่เหมือนอีเมลเดิม", 400);

  const other = await prisma.user.findUnique({ where: { email: target }, select: { id: true } });
  if (other && !(await isReplaceableSignup(other.id))) throw new AuthError("อีเมลนี้ถูกใช้งานแล้ว", 409);

  await prisma.$transaction(async (tx) => {
    if (other) await tx.user.deleteMany({ where: { id: other.id, ...REPLACEABLE_SIGNUP } });
    // ย้ายอีเมล + นับครั้ง แบบมีเงื่อนไข — ยิงพร้อมกันก็เกินเพดานไม่ได้
    const moved = await tx.user.updateMany({
      where: { id: user.id, emailVerifiedAt: null, signupEmailChanges: { lt: MAX_SIGNUP_EMAIL_CHANGES } },
      data: { email: target, signupEmailChanges: { increment: 1 } },
    });
    if (moved.count !== 1) throw denied;
    // รหัสที่ส่งไปอีเมลเดิมใช้ไม่ได้แล้ว และไม่ต้องรอช่วงพัก 60 วินาทีของอีเมลเดิม
    await tx.emailVerification.deleteMany({ where: { userId: user.id } });
  });

  await writeAuditLog({
    userId: user.id,
    action: "SIGNUP_EMAIL_CHANGED",
    entityType: "User",
    entityId: user.id,
    details: { change: user.signupEmailChanges + 1 },
  });

  let codeSent = true;
  try {
    codeSent = (await sendVerificationCode({ id: user.id, email: target, fullName: user.fullName })).sent;
  } catch {
    codeSent = false;
  }
  return { email: target, codeSent };
}
