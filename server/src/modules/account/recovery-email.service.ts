import type { AuthenticatedUser } from "@systemboq/shared-types";

import { writeAuditLog } from "../../lib/audit-log";
import { verifyPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { AuthError } from "../auth/auth.error";
import { toAuthenticatedUser } from "../auth/auth.service";
import { confirmCodeForUser, sendVerificationCode, type SendCodeResult } from "../auth/email-verification.service";

/**
 * อีเมลกู้รหัสผ่านของพนักงาน — พนักงานเข้าระบบด้วยชื่อผู้ใช้ อีเมลมีไว้รับลิงก์ตั้งรหัสใหม่อย่างเดียว
 *
 * อีเมลใช้กู้รหัสได้ก็ต่อเมื่อ **ยืนยันแล้ว** (กรอกรหัส 6 หลักที่ส่งไปที่อีเมลนั้น) — กรอกอีเมลอย่างเดียว
 * ยังไม่พิสูจน์ว่าเป็นของเจ้าตัว ถ้าส่งลิงก์ไปที่อีเมลที่พิมพ์ผิด ลิงก์ (= กุญแจบัญชี) ไปตกที่คนอื่น
 *
 * เปลี่ยนอีเมลต้องใส่รหัสผ่านปัจจุบัน — คนที่ได้เครื่องที่ล็อกอินค้างไว้ไปจะเปลี่ยนอีเมลกู้รหัส
 * เป็นของตัวเองแล้วยึดบัญชีถาวรไม่ได้
 */

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export class RecoveryEmailError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function setRecoveryEmail(
  userId: string,
  email: string,
  currentPassword: string,
  meta: RequestMeta,
): Promise<{ user: AuthenticatedUser; code: SendCodeResult }> {
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(me.passwordHash, currentPassword))) {
    throw new RecoveryEmailError("รหัสผ่านปัจจุบันไม่ถูกต้อง", 400);
  }
  if (me.email === email && me.emailVerifiedAt) {
    throw new RecoveryEmailError("อีเมลนี้ยืนยันไว้แล้ว", 400);
  }
  const taken = await prisma.user.findFirst({ where: { email, id: { not: userId } }, select: { id: true } });
  if (taken) throw new RecoveryEmailError("อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว", 409);

  const user = await prisma.$transaction(async (tx) => {
    // อีเมลใหม่ = ยังไม่ยืนยัน · ลิงก์ตั้งรหัสที่ส่งไปอีเมลเดิมก่อนหน้านี้ต้องตายด้วย
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.emailVerification.deleteMany({ where: { userId } });
    return tx.user.update({ where: { id: userId }, data: { email, emailVerifiedAt: null } });
  });
  await writeAuditLog({
    userId,
    action: "RECOVERY_EMAIL_CHANGED",
    entityType: "User",
    entityId: userId,
    details: { from: me.email, to: email },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  const code = await sendVerificationCode(user, "staff-recovery");
  return { user: toAuthenticatedUser(user), code };
}

/** ส่งรหัสยืนยันอีกครั้ง (มีช่วงพัก 60 วินาที) — ใช้กับอีเมลที่ตั้งไว้แต่ยังไม่ยืนยัน */
export async function resendRecoveryCode(userId: string): Promise<SendCodeResult> {
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!me.email) throw new RecoveryEmailError("ยังไม่ได้ตั้งอีเมล", 400);
  if (me.emailVerifiedAt) throw new RecoveryEmailError("อีเมลนี้ยืนยันไว้แล้ว", 400);
  try {
    return await sendVerificationCode(me, "staff-recovery");
  } catch (err) {
    if (err instanceof AuthError) throw new RecoveryEmailError(err.message, err.status);
    throw err;
  }
}

export async function verifyRecoveryEmail(userId: string, code: string): Promise<AuthenticatedUser> {
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!me.email) throw new RecoveryEmailError("ยังไม่ได้ตั้งอีเมล", 400);
  if (!me.emailVerifiedAt) {
    try {
      await confirmCodeForUser(userId, code);
    } catch (err) {
      if (err instanceof AuthError) throw new RecoveryEmailError(err.message, err.status);
      throw err;
    }
  }
  return toAuthenticatedUser(await prisma.user.findUniqueOrThrow({ where: { id: userId } }));
}
