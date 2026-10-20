import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { PAYMENT_EVIDENCE_MAX_BYTES } from "@systemboq/shared-types";
import multer from "multer";

import { ATTACHMENTS_DIR } from "../attachments/attachments.service";

/**
 * ไฟล์หลักฐานการรับเงินอยู่โฟลเดอร์เดียวกับไฟล์แนบใบเสนอราคา (private-uploads) —
 * ไม่ถูกเสิร์ฟ static และถูกสำรองข้อมูลรายวันไปด้วยโดยไม่ต้องแก้ระบบสำรอง
 * ชื่อบนดิสก์ขึ้นต้น "pay-" ให้แยกด้วยตาได้เวลาไล่ดูโฟลเดอร์
 */
export const EVIDENCE_DIR = ATTACHMENTS_DIR;

// เช็คทั้ง MIME และนามสกุล (ต้องผ่านทั้งคู่) — ต่างจากไฟล์แนบใบเสนอราคาที่ผ่อนให้ Excel
// ที่ส่งมาเป็น octet-stream · ที่นี่รับแต่รูปกับ PDF ซึ่งเบราว์เซอร์บอก MIME ถูกเสมอ
const ALLOWED: Record<string, string[]> = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".pdf": ["application/pdf"],
};

export function isAllowedEvidence(mimeType: string, originalName: string): boolean {
  const ext = path.extname(originalName).toLowerCase();
  return ALLOWED[ext]?.includes(mimeType) ?? false;
}

export function evidencePath(storedName: string): string {
  return path.join(EVIDENCE_DIR, storedName);
}

/** ลบไฟล์บนดิสก์แบบไม่ล้ม — ไฟล์หายไปก่อนแล้วก็ไม่เป็นไร */
export function removeEvidenceFiles(storedNames: string[]): void {
  for (const name of storedNames) {
    try {
      fs.unlinkSync(evidencePath(name));
    } catch {
      /* ไฟล์อาจถูกลบไปแล้ว */
    }
  }
}

/** ตัวรับไฟล์หลักฐาน (ฝั่งพนักงานแนบทีละไฟล์ · ฝั่งลูกค้าแนบหลายไฟล์พร้อมการแจ้งโอน) */
export const evidenceUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, EVIDENCE_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `pay-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: PAYMENT_EVIDENCE_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isAllowedEvidence(file.mimetype, file.originalname)) cb(null, true);
    else cb(new Error("หลักฐานรับได้เฉพาะรูป (JPG/PNG/WEBP) หรือ PDF"));
  },
});

/** ไฟล์ที่ multer เขียนลงดิสก์แล้วแต่ผูกกับ DB ไม่สำเร็จ — ลบทิ้ง กัน orphan */
export function discardUploads(files: Express.Multer.File[] | undefined): void {
  for (const file of files ?? []) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      /* ไฟล์อาจไม่มีอยู่แล้ว */
    }
  }
}

export function uploadErrorMessage(err: unknown, maxFiles: number): string {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") return "ไฟล์ใหญ่เกิน 10 MB";
    if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT") {
      return `แนบได้ไม่เกิน ${maxFiles} ไฟล์`;
    }
  }
  return err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ";
}

/** multer อ่านชื่อไฟล์เป็น latin1 — แปลงกลับเป็น UTF-8 ไม่งั้นชื่อไทยเพี้ยน */
export function originalFileName(file: { originalname: string }): string {
  return Buffer.from(file.originalname, "latin1").toString("utf8").slice(0, 255);
}
