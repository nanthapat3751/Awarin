import { AsyncLocalStorage } from "node:async_hooks";

import type { NextFunction, Request, Response } from "express";

/**
 * ไอพี + User-Agent ของคำขอที่กำลังทำงาน ให้ writeAuditLog หยิบไปเองได้
 *
 * เดิมแต่ละจุดที่เขียน AuditLog ต้องส่ง ip/userAgent มาเอง และส่วนใหญ่ไม่ได้ส่ง — ตอนตรวจ (2026-10-04)
 * กิจกรรมลูกค้ามีไอพีแค่การเข้าสู่ระบบ ส่วนการเปิดใบเสนอราคา ตอบรับ ส่งคำขอ สมัครบัญชี ไม่มีเลย
 * (17 จาก 38 แถว) เก็บไว้ที่เดียวตรงนี้ จุดเขียนใหม่ในอนาคตก็ได้ไอพีโดยไม่ต้องจำ
 *
 * ต้องวางหลังตัวแปลง body/คุกกี้ — ตัวที่อ่าน stream แล้วเรียก next() จากในเหตุการณ์ของ socket
 * ทำให้ context หลุดได้ ถ้าวางหลังสุดก่อน router ทุกตัว context จะติดไปถึงงานในปลายทางแน่นอน
 * งานเบื้องหลัง (สำรองข้อมูล / ล้างถังขยะ) ไม่อยู่ในคำขอ จึงได้ undefined = ไม่มีไอพี ถูกต้องแล้ว
 */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  // req.ip อ่านตอนนี้ได้ค่าที่คิด TRUST_PROXY แล้ว (ตั้งไว้ตั้งแต่สร้าง app)
  storage.run({ ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null }, next);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
