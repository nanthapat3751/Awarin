import os from "node:os";

import { prisma } from "./prisma";

/** ชื่อเครื่องที่จองรอบ — ไว้ดูย้อนหลังว่าตัวไหนเป็นคนทำ (INSTANCE_ID ตั้งเองได้ ไม่ตั้ง = hostname:pid) */
export const INSTANCE_ID = process.env.INSTANCE_ID || `${os.hostname()}:${process.pid}`;

/**
 * จองรอบของงานตามเวลา — คืน true ถ้าเครื่องนี้ได้ทำ
 *
 * API หลายตัวหลัง load balancer ตั้งเวลาเหมือนกันหมด ถ้าไม่จองก่อน ทุกตัวจะสำรองข้อมูลพร้อมกัน
 * (ไฟล์ซ้ำ + ฐานข้อมูลโดนดึงพร้อมกันหลายรอบ) · ใช้ primary key ของ ScheduledRun เป็นตัวตัดสิน:
 * INSERT สำเร็จได้ตัวเดียว ไม่ต้องพึ่งนาฬิกาของแต่ละเครื่องให้ตรงกันและไม่มีล็อกค้างเมื่อเครื่องดับ
 *
 * `key` ต้องบอกรอบในตัว เช่น "sweep:2026-10-02" — key เดิม = รอบเดิม ทำไปแล้ว
 */
export async function claimScheduledRun(key: string): Promise<boolean> {
  // ON CONFLICT DO NOTHING — ชนแล้วได้ 0 แถว ไม่โยน error
  const { count } = await prisma.scheduledRun.createMany({
    data: [{ key, claimedBy: INSTANCE_ID }],
    skipDuplicates: true,
  });
  return count === 1;
}

/** ลบใบจองเก่า — เก็บไว้ 90 วันพอให้ย้อนดูได้ว่ารอบไหนเครื่องไหนทำ */
export async function sweepScheduledRuns(keepDays = 90): Promise<number> {
  const { count } = await prisma.scheduledRun.deleteMany({
    where: { claimedAt: { lt: new Date(Date.now() - keepDays * 86_400_000) } },
  });
  return count;
}

/** วันที่ตามเวลาไทยรูป YYYY-MM-DD — ใช้เป็นรอบของงานรายวัน */
export function bangkokDay(at = new Date()): string {
  return new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** คืนใบจอง — ใช้เมื่องานล้ม ให้รอบเดิมลองใหม่ได้ (เครื่องอื่นหรือรอบบูตถัดไป) แทนที่จะหายไปทั้งวัน */
export async function releaseScheduledRun(key: string): Promise<void> {
  await prisma.scheduledRun.deleteMany({ where: { key, claimedBy: INSTANCE_ID } });
}
