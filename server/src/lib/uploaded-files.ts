import fs from "node:fs";
import path from "node:path";

import { UPLOADS_DIR } from "../modules/uploads/uploads.routes";

// รวมชื่อไฟล์รูปที่อัปโหลด (ส่วนหลัง /uploads/) จากค่า JSON — รองรับทั้ง array ของ string และ
// object ซ้อน (เดินทั้งโครงสร้าง) เพื่อให้ครอบคลุมทุกรูปแบบที่ portfolio.images /
// houseDesign.exteriorImages ฯลฯ อาจเก็บไว้
export function collectUploadFilenames(json: unknown): string[] {
  const names: string[] = [];
  const visit = (v: unknown) => {
    if (typeof v === "string") {
      const m = /\/uploads\/([\w.-]+)$/.exec(v);
      if (m) names.push(m[1]);
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(visit);
    }
  };
  visit(json);
  return names;
}

// ลบไฟล์รูปที่อัปโหลดออกจากดิสก์ (best-effort — ไฟล์หายไปแล้วก็ไม่เป็นไร)
export function deleteUploadedFiles(filenames: string[]): void {
  for (const name of new Set(filenames)) {
    try {
      fs.unlinkSync(path.join(UPLOADS_DIR, name));
    } catch {
      /* ไฟล์อาจถูกลบไปแล้ว หรือไม่เคยมี */
    }
  }
}
