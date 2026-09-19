import { execFileSync } from "node:child_process";
import path from "node:path";

import dotenv from "dotenv";

/**
 * รัน `prisma migrate deploy` กับฐานข้อมูลทดสอบแทนฐานข้อมูล dev โดยไม่ต้องพึ่งไวยากรณ์ env var
 * ที่ขึ้นกับ shell (ต่างกันระหว่าง bash กับ PowerShell) — วิธีนี้ spawn CLI ขึ้นมาโดย override
 * DATABASE_URL ใน env ของ child process เอง และโหลด .env อย่างชัดเจน (ต่างจาก setup-test-db.ts
 * ตรงที่ไฟล์นี้ไม่ได้ import "@prisma/client" ซึ่งเป็นตัวที่โหลด .env โดยปริยายที่อื่นในโค้ดชุดนี้)
 */
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  throw new Error("DATABASE_URL_TEST is not set — see .env.example.");
}

// เรียก CLI ของ prisma ด้วย node ตัวที่รันสคริปต์นี้อยู่ ผ่าน path เต็ม — ไม่ค้นหา npx จาก PATH
const prismaCli = require.resolve("prisma/build/index.js");
execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
