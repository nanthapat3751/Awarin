import type { Response } from "express";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * ส่งไฟล์ .xlsx ให้ดาวน์โหลด
 *
 * ชื่อไฟล์ภาษาไทยต้องส่งผ่าน filename* (RFC 5987) — ใส่ตรง ๆ ใน filename="" เบราว์เซอร์จะเพี้ยนหรือ
 * Node ปฏิเสธ header ทั้งก้อน · filename ธรรมดาเก็บชื่อ ASCII ไว้ให้โปรแกรมเก่าที่ไม่รู้จัก filename*
 */
export function sendXlsx(res: Response, buffer: Buffer, fileName: string): void {
  const ascii = fileName.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_");
  res.setHeader("Content-Type", XLSX_MIME);
  res.setHeader("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  // ไฟล์มีราคาทุน/ราคาขาย — ห้ามแคชไว้ที่ proxy หรือเบราว์เซอร์เครื่องที่ใช้ร่วมกัน
  res.setHeader("Cache-Control", "no-store");
  res.send(buffer);
}
