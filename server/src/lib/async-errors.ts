/**
 * ส่ง error จาก handler แบบ async ไปให้ตัวจัดการ error ของ Express — import ครั้งเดียวที่ app.ts
 * (แก้ที่ prototype จึงมีผลกับ router ทุกตัว ไม่ว่าสร้างก่อนหรือหลัง import)
 *
 * Express 4 เรียก handler แล้วจับเฉพาะ error ที่โยนแบบ sync ถ้า handler เป็น async แล้วโยน (หรือ
 * `throw err` ต่อจาก catch ซึ่งในโค้ดเรามี ~110 จุด) promise จะ reject โดยไม่มีใครรับ:
 *   - คำขอนั้นค้างไม่มีคำตอบจนหมดเวลา
 *   - Node 15+ ถือว่า unhandled rejection = ปิด process ทั้งตัว (ทดสอบแล้ว: exit 1)
 *     คือ DB สะดุดครั้งเดียวในปลายทางไหนก็ได้ = API ตัวนั้นดับ ทุกคำขอที่ค้างอยู่บนตัวนั้นพังไปด้วย
 *
 * วิธีเดียวกับแพ็กเกจ express-async-errors: ห่อ Layer.handle_request ให้ส่ง rejection เข้า next(err)
 * ผูกกับไส้ในของ Express 4 — ถ้าอัปเป็น Express 5 ให้ลบไฟล์นี้ทิ้ง (5 ทำแบบนี้ให้เองแล้ว)
 */
import type { NextFunction, Request, Response } from "express";

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
interface LayerPrototype {
  handle: Handler;
  handle_request: (this: LayerPrototype, req: Request, res: Response, next: NextFunction) => void;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- ไส้ในของ Express 4 ไม่มี type และ import แบบ ESM ไม่ได้
const Layer = require("express/lib/router/layer") as { prototype: LayerPrototype };

Layer.prototype.handle_request = function handleRequest(req, res, next) {
  const fn = this.handle;
  // handler 4 อาร์กิวเมนต์คือตัวจัดการ error — Express เรียกผ่าน handle_error ไม่ใช่ทางนี้
  if (fn.length > 3) {
    next();
    return;
  }
  try {
    const result = fn(req, res, next);
    if (result instanceof Promise) {
      result.catch((err: unknown) => next(err ?? new Error("handler rejected without a reason")));
    }
  } catch (err) {
    next(err);
  }
};
