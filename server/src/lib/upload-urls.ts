import type { NextFunction, Request, Response } from "express";

/**
 * URL ของรูปที่อัปโหลด — **ฐานข้อมูลเก็บเป็น path สัมพัทธ์ `/uploads/<ไฟล์>` เสมอ**
 *
 * เดิมเก็บ URL เต็ม `http://localhost:4000/uploads/...` ลงฐานข้อมูลตรง ๆ พอขึ้นโดเมนจริง
 * รูปทุกรูปที่เคยอัปจะชี้กลับไปที่ localhost ของเครื่องคนดู = พังทั้งเว็บ
 *
 * ตอนนี้ต่อโดเมนเข้าไปตอน "ส่งออก" (response) จาก PUBLIC_UPLOAD_BASE_URL ตัวเดียว ย้ายโดเมน
 * = แก้ค่านี้ค่าเดียว ไม่ต้องแตะข้อมูล · และตัดโดเมนออกตอน "รับเข้า" (request) เพราะหน้าจอ
 * ได้ URL เต็มไปแสดง แล้วส่งค่าเดิมกลับมาตอนบันทึก
 *
 * ทำที่ชั้น middleware ครั้งเดียว ไม่ใช่ไล่แก้ทุกปลายทาง — รูปอยู่ใน Setting / HouseDesign /
 * Portfolio และถูกส่งออกจากหลายสิบปลายทาง (สาธารณะ · พนักงาน · ถังขยะ · ไทม์ไลน์) ลืมจุดเดียวก็พัง
 */

/** ตัด / ท้าย URL ออกให้หมด (วนแทน regex /\/+$/ ที่ย้อนรอยได้ยาวเมื่อมี / ติดกันกลางข้อความ) */
function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end -= 1;
  return url.slice(0, end);
}

/** โดเมนที่เสิร์ฟ /uploads (ตัว API เอง) — ไม่มี / ท้าย */
export function publicUploadBase(): string {
  return withoutTrailingSlashes(process.env.PUBLIC_UPLOAD_BASE_URL ?? "http://localhost:4000");
}

const STORED = /^\/uploads\/[A-Za-z0-9._-]+$/;
const ABSOLUTE = /^(https?:\/\/[^/]+)(\/uploads\/[A-Za-z0-9._-]+)$/;

/** ต้นทางที่ถือว่าเป็น "ของเราเอง" — รวม localhost ของเครื่อง dev ที่ค่าเก่าในฐานข้อมูลเคยใช้ */
function ownOrigins(): Set<string> {
  return new Set([publicUploadBase(), "http://localhost:4000", "http://127.0.0.1:4000"]);
}

/** ค่าที่จะเก็บ: URL เต็มของเราเอง → `/uploads/...` · อย่างอื่น (ลิงก์เว็บอื่น, path อื่น) คงเดิม */
export function toStoredUploadUrl(value: string, origins = ownOrigins()): string {
  const m = ABSOLUTE.exec(value);
  return m && origins.has(m[1]) ? m[2] : value;
}

/** ค่าที่ส่งออก: `/uploads/...` → URL เต็มตามโดเมนปัจจุบัน */
export function toPublicUploadUrl(value: string, base = publicUploadBase()): string {
  return STORED.test(value) ? `${base}${value}` : value;
}

/**
 * เดินทั้งโครงสร้าง แปลงเฉพาะ string — ลงไปเฉพาะ array กับ object ธรรมดาเท่านั้น
 * (Date / Decimal ของ Prisma / Buffer เป็นอินสแตนซ์ของคลาส ถ้าแตกเป็น object ธรรมดา
 * JSON จะออกมาผิดรูป เช่น Decimal กลายเป็น {s,e,d} แทนตัวเลข)
 */
export function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapStrings(v, fn);
    return out;
  }
  return value;
}

/** middleware: ตัดโดเมนออกจาก body ขาเข้า + ต่อโดเมนให้ JSON ขาออก */
export function uploadUrlMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === "object") {
    const origins = ownOrigins();
    req.body = mapStrings(req.body, (s) => toStoredUploadUrl(s, origins));
  }
  const json = res.json.bind(res);
  res.json = (body?: unknown) => {
    const base = publicUploadBase();
    return json(mapStrings(body, (s) => toPublicUploadUrl(s, base)));
  };
  next();
}
