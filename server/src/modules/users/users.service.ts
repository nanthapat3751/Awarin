import type { MySessionDto, StaffUserDto } from "@systemboq/shared-types";

import { writeAuditLog } from "../../lib/audit-log";
import { createNotification } from "../../lib/notifications";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { findSessionByHandle, listSessionsOf, sessionDeviceLabel } from "../../lib/user-sessions";
import { newPasswordProblem } from "../auth/new-password";
import type { CreateStaffInput } from "./users.schemas";

export class UserError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserError";
    this.status = status;
  }
}

interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

// รูปแบบ select เดียวกันทุกที่ เพื่อไม่ให้ passwordHash หลุดออกไปโดยไม่ตั้งใจ
const STAFF_SELECT = {
  id: true,
  username: true,
  email: true,
  emailVerifiedAt: true,
  totpEnabled: true,
  fullName: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

function toStaffDto(user: {
  id: string;
  username: string | null;
  email: string | null;
  emailVerifiedAt: Date | null;
  totpEnabled: boolean;
  fullName: string;
  role: string;
  active: boolean;
  createdAt: Date;
}, sessions: { count: number; lastSeenAt: Date | null } = { count: 0, lastSeenAt: null }): StaffUserDto {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: user.email != null && user.emailVerifiedAt != null,
    twoFactorEnabled: user.totpEnabled,
    fullName: user.fullName,
    role: user.role as StaffUserDto["role"],
    active: user.active,
    createdAt: user.createdAt.toISOString(),
    activeSessions: sessions.count,
    lastSeenAt: sessions.lastSeenAt?.toISOString() ?? null,
  };
}

// โหลดผู้ใช้เป้าหมายและยืนยันว่าเป็น "พนักงาน" (ไม่ใช่ลูกค้า) ก่อนดำเนินการใด ๆ กับบัญชีนั้น
async function loadStaffTarget(targetId: string) {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || target.role === "CUSTOMER") {
    throw new UserError("ไม่พบบัญชีพนักงานที่ระบุ", 404);
  }
  return target;
}

export async function listStaff(): Promise<StaffUserDto[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: ["OWNER", "ADMIN"] } },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    select: STAFF_SELECT,
  });
  // นับเครื่องที่ยังเข้าอยู่ทีเดียวทั้งหน้า — ไม่นับ session ค้างขั้น 2FA และรุ่นที่ถูกเลื่อน sessionVersion ทิ้งแล้ว
  const sessions = await prisma.session.findMany({
    where: { userId: { in: users.map((u) => u.id) }, pendingTwoFactor: false, expiresAt: { gt: new Date() } },
    select: { userId: true, sessionVersion: true, createdAt: true, lastSeenAt: true, user: { select: { sessionVersion: true } } },
  });
  const stats = new Map<string, { count: number; lastSeenAt: Date | null }>();
  for (const s of sessions) {
    if (s.sessionVersion !== s.user.sessionVersion) continue;
    const seen = s.lastSeenAt ?? s.createdAt;
    const prev = stats.get(s.userId) ?? { count: 0, lastSeenAt: null };
    stats.set(s.userId, {
      count: prev.count + 1,
      lastSeenAt: prev.lastSeenAt && prev.lastSeenAt > seen ? prev.lastSeenAt : seen,
    });
  }
  return users.map((u) => toStaffDto(u, stats.get(u.id)));
}

export async function createStaff(
  input: CreateStaffInput,
  actingUserId: string,
  meta: RequestMeta,
): Promise<StaffUserDto> {
  const username = input.username;
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    throw new UserError("ชื่อผู้ใช้นี้มีคนใช้แล้ว", 409);
  }

  // อีเมลใช้ร่วม unique กับลูกค้า — บอกตรง ๆ ได้ เพราะคนถามคือ OWNER ที่ล็อกอินอยู่ ไม่ใช่คนนอก
  if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw new UserError("อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว", 409);
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      username,
      // อีเมลกู้รหัสผ่าน — OWNER กรอกให้ แต่ยังใช้กู้รหัสไม่ได้จนกว่าเจ้าตัวยืนยันด้วยรหัสจากเมล
      email: input.email,
      fullName: input.fullName.trim(),
      role: input.role,
      passwordHash,
      passwordChangedAt: new Date(),
      // รหัสนี้ OWNER เป็นคนคิดแล้วบอกต่อทาง LINE/ปากเปล่า — มีคนรู้สองคนตั้งแต่วินาทีแรก
      // บังคับให้เจ้าตัวเปลี่ยนก่อนใช้งาน เพื่อให้เหลือคนที่รู้รหัสจริงแค่คนเดียว
      mustChangePassword: true,
    },
    select: STAFF_SELECT,
  });

  await writeAuditLog({
    userId: actingUserId,
    action: "staff.create",
    entityType: "User",
    entityId: user.id,
    details: { username, role: input.role },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return toStaffDto(user);
}

export async function resetStaffPassword(
  targetId: string,
  newPassword: string,
  actingUserId: string,
  meta: RequestMeta,
  options: { disableTwoFactor?: boolean } = {},
): Promise<void> {
  const target = await loadStaffTarget(targetId);
  if (target.id === actingUserId) {
    throw new UserError("เปลี่ยนรหัสของตัวเองที่หน้า ตั้งค่า > ความปลอดภัย", 400);
  }

  // กฎที่ต้องรู้ว่าเป็นบัญชีของใครก่อน (ห้ามมีชื่อเจ้าตัวในรหัส / ห้ามตั้งรหัสเดิมซ้ำ) —
  // สคีมาตรวจให้แล้วเฉพาะกฎที่ไม่ต้องรู้ตัวตน เพราะตอน parse ยังไม่ได้โหลดบัญชีปลายทาง
  const problem = await newPasswordProblem(target, newPassword);
  if (problem !== null) throw new UserError(problem, 400);

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: targetId },
    data: {
      passwordHash,
      passwordChangedAt: new Date(),
      // เตะทุก session ของบัญชีนั้นออก และปลดล็อกบัญชีที่อาจถูกล็อกจากการล็อกอินผิดหลายครั้ง
      // (รวมการระงับขั้น 2FA — รหัสผ่านเดิมที่อาจหลุดไปแล้วใช้ไม่ได้อีก จึงปลดได้ปลอดภัย)
      sessionVersion: { increment: 1 },
      failedAttempts: 0,
      lockedUntil: null,
      twoFactorFailedCount: 0,
      twoFactorLockedUntil: null,
      // OWNER รู้รหัสนี้ด้วย — เจ้าตัวต้องเปลี่ยนก่อนใช้งานต่อ (เหมือนตอนสร้างบัญชีใหม่)
      mustChangePassword: true,
      // ทำมือถือหาย: ล้าง secret และรหัสสำรองทิ้งทั้งหมด (รหัสสำรองที่เหลืออาจอยู่ในมือคนอื่นแล้ว)
      ...(options.disableTwoFactor ? { totpEnabled: false, totpSecret: null, twoFactorBackupCodes: [] } : {}),
    },
  });

  if (options.disableTwoFactor) {
    await writeAuditLog({
      userId: actingUserId,
      action: "TWO_FACTOR_DISABLED_BY_OWNER",
      entityType: "User",
      entityId: targetId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  await writeAuditLog({
    userId: actingUserId,
    action: "staff.reset_password",
    entityType: "User",
    entityId: targetId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

export async function setStaffActive(
  targetId: string,
  active: boolean,
  actingUserId: string,
  meta: RequestMeta,
): Promise<void> {
  const target = await loadStaffTarget(targetId);
  if (target.id === actingUserId) {
    throw new UserError("ปิดใช้งานบัญชีของตัวเองไม่ได้", 400);
  }

  // กันระบบไม่มีเจ้าของ: ต้องเหลือ OWNER ที่เปิดใช้งานอย่างน้อย 1 คนเสมอ
  if (!active && target.role === "OWNER") {
    const activeOwners = await prisma.user.count({ where: { role: "OWNER", active: true } });
    if (activeOwners <= 1) {
      throw new UserError("ต้องมีเจ้าของระบบ (OWNER) ที่เปิดใช้งานอย่างน้อย 1 คน", 400);
    }
  }

  await prisma.user.update({
    where: { id: targetId },
    data: {
      active,
      // ปิดบัญชี = เตะออกจากระบบทันที (เปิดใหม่ไม่ต้องแตะ session)
      ...(active ? {} : { sessionVersion: { increment: 1 } }),
    },
  });

  await writeAuditLog({
    userId: actingUserId,
    action: active ? "staff.activate" : "staff.deactivate",
    entityType: "User",
    entityId: targetId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

// ─────────────────────────── เครื่องที่พนักงานเข้าสู่ระบบอยู่ ───────────────────────────
//
// ใช้ตอนพนักงานลาออก/ทำ iPad หาย — OWNER สั่งออกจากระบบได้โดยไม่ต้องระงับบัญชี
// บัญชีตัวเองต้องไปทำที่หน้า "บัญชีของฉัน" (ที่นั่นกันไม่ให้สั่งออกเครื่องที่กำลังใช้อยู่)

async function loadOtherStaff(targetId: string, actingUserId: string) {
  const target = await loadStaffTarget(targetId);
  if (target.id === actingUserId) {
    throw new UserError("เครื่องของบัญชีคุณเองจัดการที่หน้าบัญชีของฉัน", 400);
  }
  return target;
}

export async function listStaffSessions(targetId: string, actingUserId: string): Promise<MySessionDto[]> {
  await loadOtherStaff(targetId, actingUserId);
  return listSessionsOf(targetId, null);
}

export async function revokeStaffSession(
  targetId: string,
  handle: string,
  actingUserId: string,
  meta: RequestMeta,
): Promise<void> {
  await loadOtherStaff(targetId, actingUserId);
  const session = await findSessionByHandle(targetId, handle);
  if (!session) throw new UserError("ไม่พบเครื่องนี้ — อาจออกจากระบบไปแล้ว", 404);
  await prisma.session.delete({ where: { id: session.id } });
  await writeAuditLog({
    userId: actingUserId,
    action: "SESSION_REVOKED_BY_OWNER",
    entityType: "User",
    entityId: targetId,
    details: { device: sessionDeviceLabel(session), ip: session.ip },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

/** ออกจากระบบทุกเครื่องของพนักงานคนนี้ — รวม session ที่ค้างขั้น 2FA ด้วย */
export async function revokeAllStaffSessions(
  targetId: string,
  actingUserId: string,
  meta: RequestMeta,
): Promise<number> {
  await loadOtherStaff(targetId, actingUserId);
  const { count } = await prisma.session.deleteMany({ where: { userId: targetId } });
  if (count > 0) {
    await writeAuditLog({
      userId: actingUserId,
      action: "SESSIONS_REVOKED_BY_OWNER",
      entityType: "User",
      entityId: targetId,
      details: { count },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    // เจ้าตัวเห็นตอนเข้าระบบครั้งถัดไป — จะได้รู้ว่าไม่ได้หลุดเพราะระบบพัง
    await createNotification({
      userId: targetId,
      message: "เจ้าของระบบสั่งออกจากระบบทุกเครื่องของบัญชีคุณ — ถ้าไม่ได้แจ้งไว้ ให้สอบถามเจ้าของระบบ",
      link: "/account?tab=devices",
    });
  }
  return count;
}
