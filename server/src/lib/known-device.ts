import crypto from "node:crypto";

import type { Request, Response } from "express";

import { writeAuditLog } from "./audit-log";
import { createNotification } from "./notifications";
import { prisma } from "./prisma";
import { describeUserAgent } from "./user-agent";

/**
 * แจ้งเตือนเมื่อเข้าสู่ระบบจากเครื่องใหม่
 *
 * จำเครื่องด้วยคุกกี้สุ่มอายุยาว (แยกจาก session ซึ่งถูกลบตอนออกจากระบบ) — ล็อกอินสำเร็จแล้วไม่มีคุกกี้นี้
 * หรือคุกกี้ไม่ตรงกับเครื่องที่บัญชีนี้เคยใช้ = เครื่องใหม่ → แจ้งเจ้าของบัญชี
 *
 * **เครื่องแรกของบัญชีไม่แจ้ง** — ทุกบัญชีที่มีอยู่ตอนเปิดใช้ฟีเจอร์นี้ยังไม่มีเครื่องที่จำไว้เลย ถ้าแจ้ง
 * ทุกคนจะได้ "เครื่องใหม่" ในการเข้าครั้งแรกหลังอัปเดต ซึ่งสอนให้คนเมินการแจ้งเตือนนี้ตั้งแต่วันแรก
 *
 * คุกกี้ตัวเดียวใช้ร่วมกันทั้งสองแอปและทุกบัญชีในเบราว์เซอร์นั้น (มันบอกแค่ว่า "เบราว์เซอร์นี้")
 * การจำแยกรายบัญชีอยู่ที่ตาราง KnownDevice
 */
export const DEVICE_COOKIE_NAME = process.env.DEVICE_COOKIE_NAME ?? "systemboq_device";
// Chrome จำกัดอายุคุกกี้ไว้ที่ 400 วันอยู่แล้ว ตั้งเกินไปก็ถูกตัด
const DEVICE_COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60_000;
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function hashDeviceToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface DeviceLogin {
  userId: string;
  role: string;
  /** ค่าคุกกี้เครื่องที่เบราว์เซอร์ส่งมา (ถ้ามี) */
  deviceToken: string | undefined;
  ip?: string | null;
  userAgent?: string | null;
}

function newDeviceMessage(role: string, label: string, ip: string | null | undefined): string {
  // ไอพีของลูกค้าแสดงเฉพาะเจ้าของกิจการ (PDPA) — การแจ้งเตือนฝั่งลูกค้าจึงไม่ใส่ไอพีเลย
  if (role === "OWNER" || role === "ADMIN") {
    const where = ip ? ` · IP ${ip}` : "";
    return `มีการเข้าสู่ระบบบัญชีของคุณจากอุปกรณ์ใหม่ (${label}${where}) — ถ้าไม่ใช่คุณ ให้สั่งออกจากระบบเครื่องนั้นและเปลี่ยนรหัสผ่านทันที`;
  }
  return `มีการเข้าสู่ระบบบัญชีของคุณจากอุปกรณ์ใหม่ (${label}) — ถ้าไม่ใช่คุณ ให้เปลี่ยนรหัสผ่านทันทีและติดต่อทีมงาน`;
}

function newDeviceLink(role: string): string {
  return role === "OWNER" || role === "ADMIN" ? "/account#devices" : "/my/account";
}

/**
 * บันทึกว่าบัญชีนี้เข้าจากเครื่องนี้ แล้วคืนค่าคุกกี้ที่ต้องตั้งกลับ
 * เครื่องที่ไม่เคยเห็น (และบัญชีเคยมีเครื่องอื่นมาก่อน) → แจ้งเตือน + บันทึก AuditLog
 */
export async function recognizeDevice(input: DeviceLogin): Promise<{ token: string; isNew: boolean }> {
  const token =
    input.deviceToken && TOKEN_PATTERN.test(input.deviceToken)
      ? input.deviceToken
      : crypto.randomBytes(32).toString("hex");
  const tokenHash = hashDeviceToken(token);

  const known = await prisma.knownDevice.findUnique({
    where: { userId_tokenHash: { userId: input.userId, tokenHash } },
  });
  if (known) {
    await prisma.knownDevice.update({ where: { id: known.id }, data: { lastSeenAt: new Date() } });
    return { token, isNew: false };
  }

  const device = describeUserAgent(input.userAgent);
  const label = `${device.browser} · ${device.os}`;
  const hadDevices = (await prisma.knownDevice.count({ where: { userId: input.userId } })) > 0;
  // upsert แทน create — กดล็อกอินซ้อนสองแท็บพร้อมกันต้องไม่ชน unique แล้วกลายเป็น error
  await prisma.knownDevice.upsert({
    where: { userId_tokenHash: { userId: input.userId, tokenHash } },
    create: { userId: input.userId, tokenHash, label },
    update: { lastSeenAt: new Date() },
  });
  if (!hadDevices) return { token, isNew: false };

  await createNotification({
    userId: input.userId,
    message: newDeviceMessage(input.role, label, input.ip),
    link: newDeviceLink(input.role),
  });
  await writeAuditLog({
    userId: input.userId,
    action: "NEW_DEVICE_LOGIN",
    entityType: "User",
    entityId: input.userId,
    details: { device: label },
    ip: input.ip,
    userAgent: input.userAgent,
  });
  return { token, isNew: true };
}

/**
 * เรียกหลังล็อกอิน "เต็ม" สำเร็จเท่านั้น (ไม่ใช่ตอนยังค้างขั้น 2FA) — เป็นผลข้างเคียงแบบ best-effort:
 * จำเครื่องไม่สำเร็จต้องไม่ทำให้การล็อกอินที่ถูกต้องกลายเป็น error
 */
export async function rememberDevice(
  req: Request,
  res: Response,
  user: { id: string; role: string },
  sessionToken: string,
): Promise<void> {
  try {
    const { token, isNew } = await recognizeDevice({
      userId: user.id,
      role: user.role,
      deviceToken: req.cookies?.[DEVICE_COOKIE_NAME] as string | undefined,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    // ติดป้าย "เครื่องใหม่" ไว้กับ session นี้ ให้หน้าอุปกรณ์ที่เข้าสู่ระบบชี้ได้ว่าเครื่องไหนคือตัวที่ถูกแจ้งเตือน
    if (isNew) await prisma.session.updateMany({ where: { id: sessionToken }, data: { newDevice: true } });
    res.cookie(DEVICE_COOKIE_NAME, token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      maxAge: DEVICE_COOKIE_MAX_AGE_MS,
      path: "/",
    });
  } catch (err) {
    console.error("จำเครื่องที่เข้าสู่ระบบไม่สำเร็จ:", err);
  }
}
