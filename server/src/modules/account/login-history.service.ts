import { classifyIp, type LoginEventDto, type LoginEventTone, type LoginHistoryDto } from "@systemboq/shared-types";
import type { Prisma } from "@prisma/client";

import { geoLookup } from "../../lib/geoip";
import { prisma } from "../../lib/prisma";
import { describeUserAgent } from "../../lib/user-agent";

/**
 * ประวัติการเข้าสู่ระบบและความปลอดภัยของบัญชีตัวเอง (แบบ "กิจกรรมความปลอดภัยล่าสุด" ของ Google)
 *
 * อ่านจาก AuditLog ที่ระบบเขียนอยู่แล้วทุกครั้งที่มีคนล็อกอิน/ใส่รหัสผิด/เปลี่ยนรหัส — ไม่มีตารางใหม่
 * AuditLog ถูกล้างเมื่อครบ 1 ปี แต่หน้านี้ดูย้อนหลังแค่ HISTORY_DAYS เพื่อให้รายการสั้นพออ่าน
 */
export const HISTORY_DAYS = 90;
const PAGE_SIZE = 15;
// NEW_DEVICE_LOGIN ถูกเขียนทันทีหลัง LOGIN_SUCCESS ของการเข้าครั้งเดียวกัน — จับคู่ในช่วงนี้แล้วรวมเป็นแถวเดียว
const NEW_DEVICE_PAIR_MS = 60_000;

const OWN_ACTIONS: Record<string, { tone: LoginEventTone; title: string }> = {
  LOGIN_SUCCESS: { tone: "success", title: "เข้าสู่ระบบ" },
  LOGIN_FAILED: { tone: "danger", title: "รหัสผ่านไม่ถูกต้อง" },
  LOGIN_BLOCKED_LOCKED: { tone: "warning", title: "พยายามเข้าระหว่างบัญชีถูกล็อก" },
  "2FA_FAILED": { tone: "danger", title: "รหัสยืนยันตัวตน 2 ชั้นไม่ถูกต้อง" },
  "2FA_LOCKED": { tone: "warning", title: "ระงับการยืนยันตัวตน 2 ชั้นชั่วคราว" },
  "2FA_BLOCKED_LOCKED": { tone: "warning", title: "พยายามยืนยันตัวตนระหว่างถูกระงับ" },
  CHANGE_PASSWORD: { tone: "neutral", title: "เปลี่ยนรหัสผ่าน" },
  PASSWORD_RESET: { tone: "warning", title: "ตั้งรหัสผ่านใหม่ผ่านลิงก์ในอีเมล" },
  PASSWORD_RESET_REQUESTED: { tone: "neutral", title: "ขอลิงก์ตั้งรหัสผ่านใหม่ทางอีเมล" },
  RECOVERY_EMAIL_CHANGED: { tone: "warning", title: "เปลี่ยนอีเมลกู้รหัสผ่าน" },
  VERIFY_EMAIL: { tone: "neutral", title: "ยืนยันอีเมลกู้รหัสผ่าน" },
  "2FA_ENABLED": { tone: "neutral", title: "เปิดยืนยันตัวตน 2 ชั้น" },
  "2FA_DISABLED": { tone: "warning", title: "ปิดยืนยันตัวตน 2 ชั้น" },
  SESSION_REVOKED: { tone: "neutral", title: "สั่งออกจากระบบเครื่องหนึ่ง" },
  SESSIONS_REVOKED_OTHERS: { tone: "neutral", title: "ออกจากระบบเครื่องอื่นทั้งหมด" },
};

// เหตุการณ์ที่คนอื่น (OWNER) ทำกับบัญชีนี้ — userId เป็นของผู้ทำ entityId เป็นบัญชีนี้
const BY_OWNER_ACTIONS: Record<string, { tone: LoginEventTone; title: string }> = {
  "staff.reset_password": { tone: "warning", title: "เจ้าของระบบตั้งรหัสผ่านใหม่ให้" },
  SESSION_REVOKED_BY_OWNER: { tone: "warning", title: "เจ้าของระบบสั่งออกจากระบบเครื่องหนึ่ง" },
  TWO_FACTOR_DISABLED_BY_OWNER: { tone: "warning", title: "เจ้าของระบบปิดยืนยันตัวตน 2 ชั้นให้" },
  SESSIONS_REVOKED_BY_OWNER: { tone: "warning", title: "เจ้าของระบบสั่งออกจากระบบทุกเครื่อง" },
};

type Row = Prisma.AuditLogGetPayload<object>;

// สั่งออกทีละเครื่อง: ชื่อเครื่องที่ถูกสั่งออกอยู่ในหัวข้อ — ถ้าไปอยู่บรรทัดรองจะติดกับชื่อเครื่องที่กดสั่ง
// แล้วอ่านเป็นสองเครื่องปนกัน
function titleOf(row: Row, base: string): string {
  const d = (row.details ?? {}) as Record<string, unknown>;
  if ((row.action === "SESSION_REVOKED" || row.action === "SESSION_REVOKED_BY_OWNER") && typeof d.device === "string") {
    return base.replace("เครื่องหนึ่ง", `เครื่อง ${d.device}`);
  }
  return base;
}

function detailOf(row: Row): string | null {
  const d = (row.details ?? {}) as Record<string, unknown>;
  if ((row.action === "SESSIONS_REVOKED_OTHERS" || row.action === "SESSIONS_REVOKED_BY_OWNER") && typeof d.count === "number") {
    return `${d.count} เครื่อง`;
  }
  return null;
}

function toEvent(row: Row, newDevice: boolean): LoginEventDto {
  const meta = OWN_ACTIONS[row.action] ?? BY_OWNER_ACTIONS[row.action];
  const ua = describeUserAgent(row.userAgent);
  const ip = classifyIp(row.ip);
  const byOwner = row.action in BY_OWNER_ACTIONS;
  return {
    id: row.id,
    at: row.createdAt.toISOString(),
    tone: meta.tone,
    title: newDevice ? "เข้าสู่ระบบจากเครื่องใหม่" : titleOf(row, meta.title),
    detail: detailOf(row),
    newDevice,
    // เหตุการณ์ที่ OWNER ทำ — เครื่อง/ไอพีเป็นของ OWNER ไม่ใช่ของเจ้าของบัญชี ไม่ต้องโชว์
    device: byOwner || !row.userAgent ? null : `${ua.browser} · ${ua.os}`,
    kind: ua.kind === "bot" ? "desktop" : ua.kind,
    ip: byOwner ? null : (ip?.address ?? null),
    ipKind: byOwner ? null : (ip?.kind ?? null),
    ipGeo: !byOwner && ip?.kind === "public" ? geoLookup(ip.address) : null,
  };
}

/**
 * แบ่งหน้าแบบเลขหน้า (หน้า 1 = ใหม่สุด) — เรียงตามเวลาแล้ว id กันแถวเวลาเดียวกันสลับที่ระหว่างหน้า
 * ขอหน้าเกินหน้าสุดท้าย (เช่น ประวัติหมดอายุไปบางส่วน) ได้หน้าสุดท้ายแทนหน้าว่าง
 */
export async function getLoginHistory(userId: string, requestedPage = 1): Promise<LoginHistoryDto> {
  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60_000);
  const where = {
    createdAt: { gte: since },
    OR: [
      { userId, action: { in: Object.keys(OWN_ACTIONS) } },
      { entityType: "User", entityId: userId, action: { in: Object.keys(BY_OWNER_ACTIONS) } },
    ],
  };
  const total = await prisma.auditLog.count({ where });
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageNo = Math.min(Math.max(1, Math.floor(requestedPage) || 1), lastPage);
  const page = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (pageNo - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  // แถว "เข้าจากเครื่องใหม่" มีอยู่แยก — ดึงมาจับคู่กับการเข้าสำเร็จครั้งเดียวกัน (เครื่องเดียวกัน เวลาติดกัน)
  const successes = page.filter((r) => r.action === "LOGIN_SUCCESS");
  const newDeviceRows = successes.length
    ? await prisma.auditLog.findMany({
        where: {
          userId,
          action: "NEW_DEVICE_LOGIN",
          createdAt: {
            gte: successes.at(-1)!.createdAt,
            lte: new Date(successes[0].createdAt.getTime() + NEW_DEVICE_PAIR_MS),
          },
        },
        select: { createdAt: true, userAgent: true },
      })
    : [];
  const isNewDevice = (r: Row) =>
    r.action === "LOGIN_SUCCESS" &&
    newDeviceRows.some((n) => {
      const gap = n.createdAt.getTime() - r.createdAt.getTime();
      return gap >= 0 && gap <= NEW_DEVICE_PAIR_MS && n.userAgent === r.userAgent;
    });

  return {
    events: page.map((r) => toEvent(r, isNewDevice(r))),
    page: pageNo,
    pageSize: PAGE_SIZE,
    total,
    days: HISTORY_DAYS,
  };
}
