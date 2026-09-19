import { writeAuditLog } from "../../lib/audit-log";
import { verifyPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import {
  buildOtpAuthUri,
  buildQrDataUrl,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  verifyTotp,
} from "../../lib/totp";
import { AuthError } from "./auth.error";

interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

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
  await prisma.user.update({ where: { id: userId }, data: { totpSecret: secret } });

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
  if (!verifyTotp(token, user.totpSecret)) {
    throw new AuthError("รหัสยืนยันไม่ถูกต้อง", 400);
  }

  const { plain, hashed } = generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: true, twoFactorBackupCodes: hashed },
  });

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
  if (!verifyTotp(token, user.totpSecret)) {
    throw new AuthError("รหัสยืนยันไม่ถูกต้อง", 400);
  }

  const { plain, hashed } = generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorBackupCodes: hashed },
  });

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

/**
 * ตรวจปัจจัยที่สองระหว่างล็อกอิน: ลองรหัส TOTP จากแอปก่อน ถ้าไม่ผ่านลองรหัสสำรอง (ใช้แล้วลบทิ้ง
 * ทันที — ใช้ได้ครั้งเดียว) คืน true เมื่อผ่านทางใดทางหนึ่ง
 */
export async function verifySecondFactor(userId: string, code: string): Promise<boolean> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { totpSecret: true, twoFactorBackupCodes: true },
  });
  if (!user.totpSecret) return false;

  if (verifyTotp(code, user.totpSecret)) return true;

  const hashed = hashBackupCode(code);
  if (user.twoFactorBackupCodes.includes(hashed)) {
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorBackupCodes: user.twoFactorBackupCodes.filter((c) => c !== hashed) },
    });
    return true;
  }

  return false;
}
