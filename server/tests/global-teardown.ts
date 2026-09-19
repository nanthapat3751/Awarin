import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * ลบโฟลเดอร์ชั่วคราวที่ tests/setup-env.ts ชี้ให้เทสต์ใช้ (ไฟล์อัปโหลด · ชุดสำรอง)
 * ลบเฉพาะชื่อที่ขึ้นต้นด้วย prefix ของเราใน temp ของระบบเท่านั้น
 */
export default function globalTeardown(): void {
  const tmp = os.tmpdir();
  for (const name of fs.readdirSync(tmp)) {
    if (name.startsWith("systemboq-test-files-") || name.startsWith("systemboq-test-backups-")) {
      fs.rmSync(path.join(tmp, name), { recursive: true, force: true });
    }
  }
}
