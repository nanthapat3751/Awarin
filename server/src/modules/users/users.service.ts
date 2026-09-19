import type { StaffUserDto } from "@systemboq/shared-types";

import { writeAuditLog } from "../../lib/audit-log";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
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
  email: true,
  fullName: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

function toStaffDto(user: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  active: boolean;
  createdAt: Date;
}): StaffUserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as StaffUserDto["role"],
    active: user.active,
    createdAt: user.createdAt.toISOString(),
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
  return users.map(toStaffDto);
}

export async function createStaff(
  input: CreateStaffInput,
  actingUserId: string,
  meta: RequestMeta,
): Promise<StaffUserDto> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new UserError("อีเมลนี้มีบัญชีอยู่แล้ว", 409);
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: { email, fullName: input.fullName.trim(), role: input.role, passwordHash },
    select: STAFF_SELECT,
  });

  await writeAuditLog({
    userId: actingUserId,
    action: "staff.create",
    entityType: "User",
    entityId: user.id,
    details: { email, role: input.role },
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
): Promise<void> {
  const target = await loadStaffTarget(targetId);
  if (target.id === actingUserId) {
    throw new UserError("เปลี่ยนรหัสของตัวเองที่หน้า ตั้งค่า > ความปลอดภัย", 400);
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: targetId },
    data: {
      passwordHash,
      // เตะทุก session ของบัญชีนั้นออก และปลดล็อกบัญชีที่อาจถูกล็อกจากการล็อกอินผิดหลายครั้ง
      sessionVersion: { increment: 1 },
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

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
