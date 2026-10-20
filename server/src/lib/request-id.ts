import crypto from "node:crypto";

import type { NextFunction, Request, Response } from "express";

/**
 * เลขอ้างอิงคำขอ — ใช้ไล่ log ข้ามเครื่องเมื่อมี API หลายตัว
 *
 * nginx สร้างเลขให้ ($request_id) ส่งมาทาง X-Request-Id และพิมพ์ลง access log พร้อมเครื่องที่รับงาน
 * ($upstream_addr) API ใช้เลขเดิมต่อ แล้วพิมพ์ลง log ตอนเกิด error + ส่งกลับในคำตอบ 500
 * ผู้ใช้แจ้งเลขนี้มา = เปิด log ของ nginx หาเจอว่าไปตกเครื่องไหน แล้วไปหา error ที่เครื่องนั้นได้ทันที
 *
 * รับเลขจากข้างนอกเฉพาะรูปแบบที่ปลอดภัย (ตัวอักษร/ตัวเลข/ขีด) — ค่าอื่นอาจเป็นการยัดบรรทัดปลอมลง log
 * ไม่มีหรือรูปแบบไม่ผ่าน = สร้างเอง (รันตัวเดียวไม่มี nginx ก็ยังมีเลขอ้างอิง)
 */
const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get("x-request-id");
  const id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
