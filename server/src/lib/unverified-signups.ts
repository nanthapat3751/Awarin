import crypto from "node:crypto";

import type { Prisma } from "@prisma/client";
import { UNVERIFIED_SIGNUP_TTL_DAYS } from "@systemboq/shared-types";

import { writeAuditLog } from "./audit-log";
import { prisma } from "./prisma";

/**
 * บัญชีลูกค้าที่สมัครเองแต่ยังไม่ยืนยันอีเมล — อาจพิมพ์อีเมลผิด หรือใช้อีเมลที่ไม่มีจริง
 *
 * หลักที่ใช้ทั้งไฟล์: **บัญชีที่ยังไม่ยืนยันยังไม่มีเจ้าของ** ไม่มีใครพิสูจน์ได้ว่าคุมอีเมลนั้นจริง
 * (เข้าระบบก็ไม่ได้) จึงถูกแทนที่ (สมัครทับ) หรือลบทิ้งได้ — ยกเว้นเมื่อพนักงานไปผูกของไว้กับบัญชีนี้แล้ว
 * (โครงการ / คำขอ / บันทึกการติดต่อ / ลิงก์เข้าใช้) ซึ่งแปลว่ามีคนตั้งใจใช้บัญชีนี้ ห้ามแตะ
 */

/** ไม่มีของที่พนักงานผูกไว้ — นับโครงการที่อยู่ในถังขยะด้วย (กู้คืนได้ ต้องยังมีลูกค้าอยู่) */
export const NO_STAFF_LINKS: Prisma.UserWhereInput = {
  customerProjects: { none: {} },
  leads: { none: {} },
  customerNotes: { none: {} },
  accessTokens: { none: {} },
};

/**
 * สมัครเองแล้วยังไม่ยืนยันอีเมล — ไม่นับบัญชีที่ทีมงานออกลิงก์เข้าใช้ให้ (บัญชีรุ่นเก่าที่ทีมงาน
 * สร้างก่อนระบบตั้งวันยืนยันให้อัตโนมัติ อาจมี emailVerifiedAt ว่าง แต่เป็นลูกค้าจริง)
 */
export const UNVERIFIED_SIGNUP: Prisma.UserWhereInput = {
  role: "CUSTOMER",
  emailVerifiedAt: null,
  accessTokens: { none: {} },
};

/** ลูกค้าที่สมัครเอง ยังไม่ยืนยัน และไม่มีของผูกไว้ = แทนที่/ลบได้ */
export const REPLACEABLE_SIGNUP: Prisma.UserWhereInput = {
  role: "CUSTOMER",
  emailVerifiedAt: null,
  ...NO_STAFF_LINKS,
};

export async function isReplaceableSignup(userId: string): Promise<boolean> {
  return (await prisma.user.count({ where: { id: userId, ...REPLACEABLE_SIGNUP } })) === 1;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** วันที่บัญชีนี้จะถูกลบ — นับจากวันสมัคร (สมัครทับ = เริ่มนับใหม่) */
export function purgeDateOf(createdAt: Date): Date {
  return new Date(createdAt.getTime() + UNVERIFIED_SIGNUP_TTL_DAYS * DAY_MS);
}

/** ตั๋วแก้อีเมลจากหน้ายืนยัน — 32 ไบต์ เดาไม่ได้ เก็บแต่แฮช */
export function newSignupTicket(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  return { raw, hash: hashSignupTicket(raw) };
}

export function hashSignupTicket(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * ลบบัญชีที่สมัครแล้วไม่ยืนยันเกิน UNVERIFIED_SIGNUP_TTL_DAYS วัน (งานล้างรายวัน)
 *
 * ลบจริง ไม่ใช่ทำนิรนามแบบ "ลบบัญชีของฉัน" — บัญชีนี้ไม่เคยใช้งานได้เลย ไม่มีเอกสารใดอ้างถึง
 * เก็บไว้มีแต่ข้อมูลส่วนบุคคลของใครก็ไม่รู้ค้างอยู่ (หลักเก็บข้อมูลเท่าที่จำเป็นของ PDPA)
 * แถว AuditLog เดิมยังอยู่ (คอลัมน์ผู้ใช้กลายเป็น null ตาม FK) และเขียนบันทึกการลบเพิ่มหนึ่งแถว
 */
export async function purgeUnverifiedSignups(now = new Date()): Promise<number> {
  const where: Prisma.UserWhereInput = {
    ...REPLACEABLE_SIGNUP,
    createdAt: { lt: new Date(now.getTime() - UNVERIFIED_SIGNUP_TTL_DAYS * DAY_MS) },
  };
  const stale = await prisma.user.findMany({ where, select: { id: true } });
  if (stale.length === 0) return 0;

  // ลบด้วยเงื่อนไขเดิมซ้ำ ไม่ใช่ลบตาม id ที่อ่านมา — ถ้าระหว่างนี้พนักงานเพิ่งผูกโครงการหรือ
  // ลูกค้าเพิ่งยืนยันอีเมล บัญชีนั้นต้องรอด
  const ids = stale.map((u) => u.id);
  const { count } = await prisma.user.deleteMany({ where: { ...where, id: { in: ids } } });
  if (count > 0) {
    await writeAuditLog({
      userId: null,
      action: "PURGE_UNVERIFIED_SIGNUPS",
      entityType: "User",
      details: { count, olderThanDays: UNVERIFIED_SIGNUP_TTL_DAYS },
    });
  }
  return count;
}
