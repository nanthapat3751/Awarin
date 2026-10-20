import type { NextFunction, Request, Response } from "express";

import { prisma } from "./prisma";
import { INSTANCE_ID } from "./scheduled-run";

/**
 * สถานะของ process นี้สำหรับ load balancer
 *
 * - /api/health        "ยังมีชีวิตอยู่ไหม" — ตอบ 200 เสมอถ้า process ยังรับคำขอได้ (ไม่แตะ DB:
 *                      DB ล่มแล้วสั่งรีสตาร์ท API ทุกตัวพร้อมกันไม่ได้ช่วยอะไร)
 * - /api/health/ready  "ส่งงานมาที่ตัวนี้ได้ไหม" — 503 ตอนกำลังปิด หรือคุยกับ DB ไม่ได้
 *                      LB จะเลิกส่งคำขอใหม่มาก่อนที่ process จะปิดจริง
 */
let draining = false;

export function startDraining(): void {
  draining = true;
}

export function isDraining(): boolean {
  return draining;
}

const DB_CHECK_TIMEOUT_MS = 2_000;

async function databaseReachable(): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), DB_CHECK_TIMEOUT_MS);
    });
    return await Promise.race([prisma.$queryRaw`SELECT 1`.then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function livenessHandler(_req: Request, res: Response): void {
  res.json({ status: "ok" });
}

export async function readinessHandler(_req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  if (draining) {
    res.status(503).json({ status: "draining" });
    return;
  }
  if (!(await databaseReachable())) {
    res.status(503).json({ status: "database-unreachable" });
    return;
  }
  res.json({ status: "ready" });
}

/**
 * ตอนกำลังปิด: บอก client ให้ปิด keep-alive หลังคำขอนี้ — คำขอถัดไปจะเปิดการเชื่อมต่อใหม่
 * ซึ่ง LB ส่งไปเครื่องอื่น แทนที่จะค้างอยู่บนการเชื่อมต่อเดิมที่กำลังจะถูกตัด
 *
 * ตั้ง X-Served-By เฉพาะเมื่อกำหนด INSTANCE_ID เอง — ใช้ดูว่า LB กระจายงานจริง ไม่ตั้ง = ไม่เปิดเผย
 * hostname ของเครื่องออกไปข้างนอก
 */
export function lifecycleHeaders(_req: Request, res: Response, next: NextFunction): void {
  if (draining) res.setHeader("Connection", "close");
  if (process.env.INSTANCE_ID) res.setHeader("X-Served-By", INSTANCE_ID);
  next();
}
