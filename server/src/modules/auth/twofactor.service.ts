import { writeAuditLog } from "../../lib/audit-log";
import { verifyPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import {
  buildOtpAuthUri,
  buildQrDataUrl,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  totpStep,
} from "../../lib/totp";
import { AuthError } from "./auth.error";

interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

// ── เพดานกรอกรหัสผิดต่อบัญชี ──
// limiter ที่ route นับต่อไอพี คนที่รู้รหัสผ่านแล้วสลับไอพีก็เดาต่อได้ไม่จำกัด จึงต้องนับที่บัญชีด้วย
// ผิดครบ 10 ครั้งระงับ 15 นาที จากนั้นทุก ๆ 5 ครั้งที่ผิดต่อโดยไม่เคยผ่าน ระงับนานขึ้นเท่าตัว (สูงสุด 1 วัน)
// คนกรอกพลาดจริงแทบไม่มีทางถึงรอบสอง แต่คนเดาถูกบีบเหลือไม่กี่ครั้งต่อวัน
const TWO_FACTOR_LOCK_AFTER = 10;
const TWO_FACTOR_LOCK_EVERY = 5;
const TWO_FACTOR_LOCK_BASE_MINUTES = 15;
const TWO_FACTOR_LOCK_MAX_MINUTES = 24 * 60;
// ยกกำลังได้ไม่เกินนี้ (15 × 2^7 เกิน 1 วันแล้ว) — ไม่งั้นตัวนับสูงมาก ๆ ทำ power() ล้นจน SQL error
const TWO_FACTOR_LOCK_MAX_DOUBLINGS = 7;
/** กรอกผิดในเซสชันครึ่งทางเดียวกันได้กี่ครั้งก่อนต้องกรอกรหัสผ่านใหม่ */
export const TWO_FACTOR_SESSION_MAX_ATTEMPTS = 5;

/**
 * จองสิทธิ์กรอกรหัส 2FA หนึ่งครั้ง "ก่อน" ตรวจรหัส — UPDATE คำสั่งเดียว นับ +1 และถ้าครั้งนี้ถึงเกณฑ์
 * ก็ตั้งเวลาระงับทันที คำขอที่ยิงมาพร้อมกันจึงหลุดเกินเพดานไม่ได้ (แถวถูกล็อกระหว่าง UPDATE
 * คำขอถัดไปเห็นเวลาระงับแล้วไม่ผ่าน WHERE) ใช้ได้ถูกต้องแม้รัน API หลายตัว
 *
 * คืน null = บัญชีถูกระงับอยู่ (ไม่ต้องตรวจรหัสเลย) · คืน lockedUntil เมื่อครั้งนี้เป็นครั้งที่ทำให้ถูกระงับ
 * ยืนยันผ่านแล้วต้องเรียก clearTwoFactorFailures — ครั้งที่จองไว้ (รวมถึงเวลาระงับที่เพิ่งตั้ง) จะถูกล้าง
 */
export async function reserveTwoFactorAttempt(
  userId: string,
): Promise<{ lockedUntil: Date | null } | null> {
  const rows = await prisma.$queryRaw<{ twoFactorLockedUntil: Date | null }[]>`
    UPDATE "User" SET
      "twoFactorFailedCount" = "twoFactorFailedCount" + 1,
      "twoFactorLockedUntil" = CASE
        WHEN "twoFactorFailedCount" + 1 >= ${TWO_FACTOR_LOCK_AFTER}::int
         AND ("twoFactorFailedCount" + 1 - ${TWO_FACTOR_LOCK_AFTER}::int) % ${TWO_FACTOR_LOCK_EVERY}::int = 0
          THEN (now() AT TIME ZONE 'UTC') + make_interval(mins => LEAST(
            ${TWO_FACTOR_LOCK_BASE_MINUTES}::int * power(2, LEAST(
              ("twoFactorFailedCount" + 1 - ${TWO_FACTOR_LOCK_AFTER}::int) / ${TWO_FACTOR_LOCK_EVERY}::int,
              ${TWO_FACTOR_LOCK_MAX_DOUBLINGS}::int)),
            ${TWO_FACTOR_LOCK_MAX_MINUTES}::int)::int)
        ELSE NULL
      END
    WHERE "id" = ${userId}
      AND ("twoFactorLockedUntil" IS NULL OR "twoFactorLockedUntil" <= (now() AT TIME ZONE 'UTC'))
    RETURNING "twoFactorLockedUntil"`;
  if (rows.length === 0) return null;
  return { lockedUntil: rows[0].twoFactorLockedUntil };
}

/** ยืนยันผ่านแล้ว — ล้างตัวนับ/เวลาระงับ (รวมครั้งที่เพิ่งจองไว้) */
export async function clearTwoFactorFailures(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorFailedCount: 0, twoFactorLockedUntil: null },
  });
}

/**
 * จดว่ารหัสจากแอปของช่วง `step` ถูกใช้แล้ว — สำเร็จเฉพาะเมื่อยังไม่เคยใช้ช่วงนี้หรือช่วงที่ใหม่กว่า
 * UPDATE คำสั่งเดียว สองคำขอที่ส่งรหัสเดียวกันมาพร้อมกันจึงผ่านได้คำขอเดียว
 * `data` = สิ่งที่ต้องเขียนพร้อมกัน (เช่น เปิดใช้ 2FA) เพื่อไม่ให้มีจังหวะที่จดแล้วแต่ยังไม่เปิด
 */
async function consumeTotpStep(
  userId: string,
  step: number,
  data: { totpEnabled?: boolean; twoFactorBackupCodes?: string[] } = {},
): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { ...data, totpLastStep: step },
  });
  return count === 1;
}

const REUSED_CODE_MESSAGE = "รหัสนี้ถูกใช้ไปแล้ว กรุณารอรหัสถัดไปในแอปแล้วกรอกใหม่";

export interface TwoFactorStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

export async function getTwoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { totpEnabled: true, twoFactorBackupCodes: true },
  });
  return {
    enabled: user.totpEnabled,
    backupCodesRemaining: user.twoFactorBackupCodes.length,
  };
}

/**
 * เริ่มตั้งค่า 2FA: สร้าง secret ใหม่เก็บไว้ (ยังไม่เปิดใช้จริงจนกว่าจะยืนยันรหัสจากแอป) แล้วคืน
 * QR + secret ให้ผู้ใช้สแกน/กรอกลงแอป Authenticator
 */
export async function startTotpSetup(
  userId: string,
  accountEmail: string,
): Promise<{ otpauthUri: string; qrDataUrl: string; secret: string }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { totpEnabled: true },
  });
  if (user.totpEnabled) {
    throw new AuthError("บัญชีนี้เปิดใช้ 2FA อยู่แล้ว", 400);
  }

  const secret = generateTotpSecret();
  // secret ใหม่ = รหัสชุดใหม่ ช่วงที่จดไว้ของ secret เก่าไม่เกี่ยวแล้ว (ไม่ล้าง = ปิดแล้วเปิดใหม่
  // ภายใน 90 วิ จะเปิดไม่ได้เพราะรหัสแรกของ secret ใหม่ดูเหมือน "ใช้ไปแล้ว")
  await prisma.user.update({ where: { id: userId }, data: { totpSecret: secret, totpLastStep: null } });

  const otpauthUri = buildOtpAuthUri(accountEmail, secret);
  const qrDataUrl = await buildQrDataUrl(otpauthUri);
  return { otpauthUri, qrDataUrl, secret };
}

/**
 * ยืนยันรหัสจากแอปเพื่อเปิดใช้ 2FA จริง แล้วสร้างรหัสสำรอง (คืนตัวจริงครั้งเดียวให้ผู้ใช้เก็บ)
 */
export async function activateTotp(
  userId: string,
  token: string,
  meta: RequestMeta,
): Promise<{ backupCodes: string[] }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true },
  });
  if (user.totpEnabled) {
    throw new AuthError("บัญชีนี้เปิดใช้ 2FA อยู่แล้ว", 400);
  }
  if (!user.totpSecret) {
    throw new AuthError("ยังไม่ได้เริ่มตั้งค่า 2FA กรุณาเริ่มใหม่", 400);
  }
  const step = totpStep(token, user.totpSecret);
  if (step === null) {
    throw new AuthError("รหัสยืนยันไม่ถูกต้อง", 400);
  }

  const { plain, hashed } = generateBackupCodes();
  if (!(await consumeTotpStep(userId, step, { totpEnabled: true, twoFactorBackupCodes: hashed }))) {
    throw new AuthError(REUSED_CODE_MESSAGE, 400);
  }

  await writeAuditLog({
    userId,
    action: "2FA_ENABLED",
    entityType: "User",
    entityId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return { backupCodes: plain };
}

/**
 * เพิ่มอุปกรณ์ (มือถือเครื่องอื่น) หลังเปิด 2FA แล้ว: ยืนยันรหัสผ่านปัจจุบัน แล้วโชว์ QR ของ
 * secret "เดิม" ซ้ำให้สแกนด้วยเครื่องใหม่ — สำคัญมากที่ต้องใช้ secret เดิม (ไม่ generateTotpSecret
 * ใหม่) เพราะ TOTP ใช้ secret ร่วมกัน เครื่องเก่าจึงยังสร้างรหัสได้ตรงกันต่อไป ไม่พัง
 */
export async function revealTotpForNewDevice(
  userId: string,
  accountEmail: string,
  currentPassword: string,
  meta: RequestMeta,
): Promise<{ otpauthUri: string; qrDataUrl: string; secret: string }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true, totpEnabled: true, totpSecret: true },
  });
  if (!user.totpEnabled || !user.totpSecret) {
    throw new AuthError("บัญชีนี้ยังไม่ได้เปิดใช้ 2FA", 400);
  }
  // การเผย secret ซ้ำเป็นการกระทำที่อ่อนไหว (ใครเห็นก็ clone รหัสได้) — จึงต้องยืนยันรหัสผ่านก่อน
  // (ระดับเดียวกับการปิด 2FA) แล้วบันทึก audit ไว้
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AuthError("รหัสผ่านไม่ถูกต้อง", 401);
  }

  const otpauthUri = buildOtpAuthUri(accountEmail, user.totpSecret);
  const qrDataUrl = await buildQrDataUrl(otpauthUri);

  await writeAuditLog({
    userId,
    action: "2FA_DEVICE_ADDED",
    entityType: "User",
    entityId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return { otpauthUri, qrDataUrl, secret: user.totpSecret };
}

/** ปิด 2FA — ต้องยืนยันรหัสผ่านปัจจุบัน แล้วล้าง secret + รหัสสำรองทิ้ง */
export async function disableTotp(
  userId: string,
  currentPassword: string,
  meta: RequestMeta,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AuthError("รหัสผ่านไม่ถูกต้อง", 401);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecret: null, twoFactorBackupCodes: [] },
  });

  await writeAuditLog({
    userId,
    action: "2FA_DISABLED",
    entityType: "User",
    entityId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

/** สร้างรหัสสำรองชุดใหม่ (แทนที่ของเดิมทั้งหมด) — ต้องยืนยันรหัสจากแอปก่อน */
export async function regenerateBackupCodes(
  userId: string,
  token: string,
  meta: RequestMeta,
): Promise<{ backupCodes: string[] }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true },
  });
  if (!user.totpEnabled || !user.totpSecret) {
    throw new AuthError("บัญชีนี้ยังไม่ได้เปิดใช้ 2FA", 400);
  }
  const step = totpStep(token, user.totpSecret);
  if (step === null) {
    throw new AuthError("รหัสยืนยันไม่ถูกต้อง", 400);
  }

  const { plain, hashed } = generateBackupCodes();
  if (!(await consumeTotpStep(userId, step, { twoFactorBackupCodes: hashed }))) {
    throw new AuthError(REUSED_CODE_MESSAGE, 400);
  }

  await writeAuditLog({
    userId,
    action: "2FA_BACKUP_REGENERATED",
    entityType: "User",
    entityId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return { backupCodes: plain };
}

/** ผลตรวจปัจจัยที่สอง — "reused" = รหัสจากแอปถูกต้องแต่ช่วงเวลานั้นถูกใช้ไปแล้ว */
export type SecondFactorResult = "ok" | "invalid" | "reused";

/**
 * ตรวจปัจจัยที่สองระหว่างล็อกอิน: ลองรหัส TOTP จากแอปก่อน ถ้าไม่ผ่านลองรหัสสำรอง
 * ทั้งสองแบบใช้ได้ครั้งเดียว และตัดสินด้วย UPDATE คำสั่งเดียว (ส่งซ้ำพร้อมกันผ่านได้คำขอเดียว)
 */
export async function verifySecondFactor(userId: string, code: string): Promise<SecondFactorResult> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { totpSecret: true },
  });
  if (!user.totpSecret) return "invalid";

  const step = totpStep(code, user.totpSecret);
  if (step !== null) return (await consumeTotpStep(userId, step)) ? "ok" : "reused";

  // ลบรหัสสำรองออกจากรายการพร้อมเช็คว่ายังอยู่ในคำสั่งเดียว — เดิมอ่าน → กรอง → เขียนกลับ
  // สองคำขอที่ส่งรหัสเดียวกันมาพร้อมกันอ่านเจอทั้งคู่ เลยใช้รหัสเดียวได้สองครั้ง
  const hashed = hashBackupCode(code);
  const removed = await prisma.$executeRaw`
    UPDATE "User" SET "twoFactorBackupCodes" = array_remove("twoFactorBackupCodes", ${hashed})
    WHERE "id" = ${userId} AND ${hashed} = ANY("twoFactorBackupCodes")`;
  return removed === 1 ? "ok" : "invalid";
}
