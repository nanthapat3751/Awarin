import crypto from "node:crypto";

import { classifyIp, type MySessionDto } from "@systemboq/shared-types";

import { geoLookup } from "./geoip";
import { prisma } from "./prisma";
import { describeUserAgent } from "./user-agent";

/**
 * รายการเครื่องที่เข้าสู่ระบบบัญชีหนึ่งอยู่ — ใช้ทั้งหน้า "อุปกรณ์ที่เข้าสู่ระบบ" ของตัวเอง และหน้าจัดการผู้ใช้
 * ที่ OWNER ดูเครื่องของพนักงาน (สองที่ต้องเห็นเหมือนกันทุกตัวอักษร)
 */

/**
 * id ของ Session คือ token ที่ใช้ล็อกอินจริง (อยู่ในคุกกี้) — ห้ามส่งออกไปหน้าจอเด็ดขาด ใครเห็นก็สวม
 * รอยเข้าระบบได้ · ใช้ค่าแฮชทางเดียวแทน ย้อนกลับเป็น token ไม่ได้ แต่ยังชี้ได้ว่าแถวไหน
 */
export function sessionHandle(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

/** session ที่ยังใช้ได้จริง — ไม่นับที่หมดอายุ และที่ค้างขั้น 2FA (ยังไม่ถือว่าเข้าสู่ระบบ) */
export async function activeSessionsOf(userId: string) {
  const [user, rows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } }),
    prisma.session.findMany({ where: { userId, pendingTwoFactor: false, expiresAt: { gt: new Date() } } }),
  ]);
  // รีเซ็ตรหัส/ระงับบัญชีเลื่อน sessionVersion แทนการลบแถว — แถวรุ่นเก่ายังอยู่แต่เข้าระบบไม่ได้แล้ว อย่านับ
  return rows.filter((s) => s.sessionVersion === user?.sessionVersion);
}

type SessionRow = Awaited<ReturnType<typeof activeSessionsOf>>[number];

export function toSessionDto(s: SessionRow, currentToken: string | null): MySessionDto {
  const device = describeUserAgent(s.userAgent);
  const ip = classifyIp(s.ip);
  return {
    handle: sessionHandle(s.id),
    current: s.id === currentToken,
    browser: device.browser,
    os: device.os,
    // หน้าอุปกรณ์มีไอคอนแค่คอม/มือถือ/แท็บเล็ต — เครื่องมืออัตโนมัติแสดงเป็นคอม ชื่อในช่องเบราว์เซอร์บอกอยู่แล้ว
    kind: device.kind === "bot" ? "desktop" : device.kind,
    ip: ip?.address ?? s.ip,
    ipKind: ip?.kind ?? null,
    // ฐานไอพีออฟไลน์ในเครื่อง ไม่ส่งไอพีไปถามบริการภายนอก · ไอพีภายในค้นไม่ได้อยู่แล้ว
    ipGeo: ip?.kind === "public" ? geoLookup(ip.address) : null,
    newDevice: s.newDevice,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: (s.lastSeenAt ?? s.createdAt).toISOString(),
    expiresAt: s.expiresAt.toISOString(),
  };
}

export async function listSessionsOf(userId: string, currentToken: string | null): Promise<MySessionDto[]> {
  const rows = await activeSessionsOf(userId);
  return rows
    .map((s) => toSessionDto(s, currentToken))
    .sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeenAt.localeCompare(a.lastSeenAt));
}

/** หา session จาก handle ที่หน้าจอส่งมา — ต้องเป็นของบัญชีนี้และยังใช้ได้อยู่ */
export async function findSessionByHandle(userId: string, handle: string): Promise<SessionRow | null> {
  return (await activeSessionsOf(userId)).find((s) => sessionHandle(s.id) === handle) ?? null;
}

export function sessionDeviceLabel(s: { userAgent: string | null }): string {
  const device = describeUserAgent(s.userAgent);
  return `${device.browser} · ${device.os}`;
}
