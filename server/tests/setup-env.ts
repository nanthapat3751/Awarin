import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "..", ".env"), quiet: true });

// เทสต์ต้องรันกับฐานข้อมูลที่ไม่ใช่ตัวที่ dev server ใช้ เพราะ integration test หลายตัวสร้างแถว
// จริง (WorkCategory, User, ...) โดยไม่ลบทิ้งใน afterAll การรันกับฐานข้อมูล dev จึงไปทำให้สิ่งที่
// คนกำลังดูอยู่ใน UI ของ staff-app ตอนนั้นเสียหายเงียบ ๆ ดูขั้นตอนตั้งค่าครั้งเดียวในส่วน
// "ฐานข้อมูลสำหรับทดสอบ" ของ README — ที่นี่ไม่มี fallback โดยตั้งใจ ให้เข้ากับรูปแบบไม่มี
// fallback เงียบ ๆ ของ DATABASE_URL_RUNTIME ใน lib/prisma.ts
const testUrl = process.env.DATABASE_URL_TEST;
const testRuntimeUrl = process.env.DATABASE_URL_TEST_RUNTIME;
if (!testUrl || !testRuntimeUrl) {
  throw new Error(
    "DATABASE_URL_TEST / DATABASE_URL_TEST_RUNTIME are not set — tests must not run " +
      "against the dev database. See .env.example and README.",
  );
}
process.env.DATABASE_URL = testUrl;
process.env.DATABASE_URL_RUNTIME = testRuntimeUrl;

// ฟอร์มคำขอสาธารณะถูกจำกัดอัตราเพื่อกันสแปม (ค่าจริง 5/15 นาที) แต่ leads.test.ts ยิงหลายครั้งใน
// ไฟล์เดียว จึงตั้งให้หลวมมากตอนเทสต์ ไม่งั้นจะเจอ 429 ปลอม ๆ — ตรรกะ rate limit เองถูกเทสต์แยก
// อยู่แล้วที่ auth.test.ts (registration rate limiting)
process.env.PUBLIC_LEAD_RATELIMIT_MAX = process.env.PUBLIC_LEAD_RATELIMIT_MAX ?? "10000";

// สำรองข้อมูล: .env ของ dev ชี้ไปที่ฐานข้อมูลจริงและโฟลเดอร์ server/backups ของจริง — เทสต์ต้องไม่แตะ
// ทั้งคู่เด็ดขาด (สำรองซ้อนหรือลบชุดเก่าของจริงตามอายุได้) จึงบังคับให้ชี้ฐานข้อมูลทดสอบ
// ด้วย role อ่านอย่างเดียว และเก็บลงโฟลเดอร์ชั่วคราวแยกต่อโปรเซส
{
  const backupUrl = new URL(testUrl);
  backupUrl.username = "boq_backup";
  backupUrl.password = "boq_backup_dev_password";
  backupUrl.search = "";
  process.env.BACKUP_DATABASE_URL = backupUrl.toString();
  process.env.BACKUP_DIR = path.join(require("node:os").tmpdir(), `systemboq-test-backups-${process.pid}`);
  process.env.BACKUP_MIRROR_DIR = "";
}

// ไฟล์ที่เทสต์อัปโหลด (รูป · ไฟล์แนบใบเสนอราคา) — เดิมลงโฟลเดอร์เดียวกับ dev server จนมี PDF ทดสอบ
// ค้างอยู่ปนกับไฟล์แนบจริงหลายร้อยไฟล์ (และติดไปในชุดสำรองทุกชุด) · globalTeardown ลบทิ้งหลังรันจบ
{
  const root = path.join(require("node:os").tmpdir(), `systemboq-test-files-${process.pid}`);
  process.env.UPLOADS_DIR = path.join(root, "uploads");
  process.env.PRIVATE_UPLOADS_DIR = path.join(root, "private-uploads");
}
