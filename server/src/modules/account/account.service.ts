import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { AuthenticatedUser, MySessionDto, MySignatureDto } from "@systemboq/shared-types";
import sharp from "sharp";

import { writeAuditLog } from "../../lib/audit-log";
import { prisma } from "../../lib/prisma";
import { normalizeSignature, signatureDataUrl } from "../../lib/signature-image";
import { collectUploadFilenames, deleteUploadedFiles } from "../../lib/uploaded-files";
import { findSessionByHandle, listSessionsOf, sessionDeviceLabel } from "../../lib/user-sessions";
import { toAuthenticatedUser } from "../auth/auth.service";
import { UPLOADS_DIR } from "../uploads/uploads.routes";
import type { UpdateMyProfileInput } from "./account.schemas";

/** ขนาดรูปโปรไฟล์ที่เก็บจริง — คมพอบนจอความละเอียดสูงที่แสดงใหญ่สุด 96px และเล็กพอ (~15 KB) */
export const AVATAR_SIZE = 256;

export class AvatarError extends Error {}

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export async function updateMyProfile(
  userId: string,
  input: UpdateMyProfileInput,
  meta: RequestMeta,
): Promise<AuthenticatedUser> {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const user = await prisma.user.update({ where: { id: userId }, data: input });

  const changed = (Object.keys(input) as (keyof UpdateMyProfileInput)[]).filter(
    (k) => before[k] !== user[k],
  );
  if (changed.length > 0) {
    await writeAuditLog({
      userId,
      action: "PROFILE_UPDATED",
      entityType: "User",
      entityId: userId,
      details: { fields: changed },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
  return toAuthenticatedUser(user);
}

/**
 * สร้างรูปใหม่ทั้งไฟล์จากสิ่งที่อัปมา ไม่เก็บไฟล์ต้นฉบับเลย:
 * - พิกัด GPS / ข้อมูลกล้องใน EXIF หายไปด้วย (sharp ไม่คัดลอก metadata ถ้าไม่สั่ง) — เรื่อง PDPA
 * - ไฟล์ที่ปลอมตัวเป็นรูป (มีสคริปต์ซ่อนอยู่) ใช้ไม่ได้ เพราะที่เก็บคือพิกเซลที่ถอดแล้วเข้ารหัสใหม่
 * - .rotate() หมุนตาม EXIF orientation ก่อน ไม่งั้นรูปจากมือถือจะนอนตะแคง
 */
async function renderAvatar(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new AvatarError("อ่านไฟล์รูปนี้ไม่ได้ — ลองใช้ไฟล์ JPEG, PNG หรือ WEBP");
  }
}

export async function setMyAvatar(
  userId: string,
  file: Buffer,
  meta: RequestMeta,
): Promise<AuthenticatedUser> {
  const webp = await renderAvatar(file);
  // ชื่อสุ่มใหม่ทุกครั้ง: URL เปลี่ยน เบราว์เซอร์ที่แคชรูปเก่าไว้จึงเห็นรูปใหม่ทันที
  // (ตัวอักษรต้องอยู่ใน [A-Za-z0-9._-] และไม่มีโฟลเดอร์ย่อย ไม่งั้น lib/upload-urls.ts ไม่ต่อโดเมนให้)
  const filename = `avatar-${userId}-${crypto.randomBytes(6).toString("hex")}.webp`;
  await fs.writeFile(path.join(UPLOADS_DIR, filename), webp);

  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  let user;
  try {
    user = await prisma.user.update({ where: { id: userId }, data: { avatarUrl: `/uploads/${filename}` } });
  } catch (err) {
    deleteUploadedFiles([filename]);
    throw err;
  }
  // ลบไฟล์เก่าหลังฐานข้อมูลชี้ไปรูปใหม่แล้วเท่านั้น — ถ้าลบก่อนแล้วอัปเดตพัง จะเหลือลิงก์ชี้ไฟล์ที่หายไป
  if (before.avatarUrl) deleteUploadedFiles(collectUploadFilenames(before.avatarUrl));

  await writeAuditLog({
    userId,
    action: "AVATAR_UPDATED",
    entityType: "User",
    entityId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return toAuthenticatedUser(user);
}

export async function removeMyAvatar(userId: string, meta: RequestMeta): Promise<AuthenticatedUser> {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!before.avatarUrl) return toAuthenticatedUser(before);

  const user = await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
  deleteUploadedFiles(collectUploadFilenames(before.avatarUrl));
  await writeAuditLog({
    userId,
    action: "AVATAR_REMOVED",
    entityType: "User",
    entityId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return toAuthenticatedUser(user);
}

// ─────────────────────────── อุปกรณ์ที่เข้าสู่ระบบ ───────────────────────────

export { sessionHandle } from "../../lib/user-sessions";

export async function listMySessions(userId: string, currentToken: string): Promise<MySessionDto[]> {
  return listSessionsOf(userId, currentToken);
}

export class SessionError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function revokeMySession(
  userId: string,
  currentToken: string,
  handle: string,
  meta: RequestMeta,
): Promise<void> {
  const target = await findSessionByHandle(userId, handle);
  if (!target) throw new SessionError("ไม่พบอุปกรณ์นี้ — อาจออกจากระบบไปแล้ว", 404);
  if (target.id === currentToken) {
    throw new SessionError("อุปกรณ์นี้ใช้ปุ่มออกจากระบบตามปกติ", 400);
  }
  await prisma.session.delete({ where: { id: target.id } });
  await writeAuditLog({
    userId,
    action: "SESSION_REVOKED",
    entityType: "User",
    entityId: userId,
    details: { device: sessionDeviceLabel(target), ip: target.ip },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

/** ออกจากระบบทุกเครื่องยกเว้นเครื่องนี้ — รวม session ที่ค้างรอ 2FA ด้วย (ไม่ต้องเหลือไว้) */
export async function revokeOtherSessions(userId: string, currentToken: string, meta: RequestMeta): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { userId, id: { not: currentToken } } });
  if (count > 0) {
    await writeAuditLog({
      userId,
      action: "SESSIONS_REVOKED_OTHERS",
      entityType: "User",
      entityId: userId,
      details: { count },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
  return count;
}

// ─────────────────────────── ลายเซ็น ───────────────────────────

export async function getMySignature(userId: string): Promise<MySignatureDto> {
  const row = await prisma.userSignature.findUnique({ where: { userId } });
  return { dataUrl: signatureDataUrl(row?.png), updatedAt: row?.updatedAt.toISOString() ?? null };
}

export async function setMySignature(userId: string, input: Buffer, meta: RequestMeta): Promise<MySignatureDto> {
  // Prisma ต้องการ Uint8Array ที่อยู่บน ArrayBuffer ธรรมดา — Buffer ของ sharp อาจชี้ pool ร่วม
  const png = new Uint8Array(await normalizeSignature(input));
  const row = await prisma.userSignature.upsert({
    where: { userId },
    create: { userId, png },
    update: { png },
  });
  // ใบเสนอราคาที่เซ็นไปแล้วไม่เปลี่ยนตาม — แต่ละใบเก็บสำเนาลายเซ็นของตัวเองไว้ (QuoteSigner)
  await writeAuditLog({
    userId,
    action: "SIGNATURE_UPDATED",
    entityType: "User",
    entityId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return { dataUrl: signatureDataUrl(row.png), updatedAt: row.updatedAt.toISOString() };
}

export async function removeMySignature(userId: string, meta: RequestMeta): Promise<void> {
  const { count } = await prisma.userSignature.deleteMany({ where: { userId } });
  if (count > 0) {
    await writeAuditLog({
      userId,
      action: "SIGNATURE_REMOVED",
      entityType: "User",
      entityId: userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
