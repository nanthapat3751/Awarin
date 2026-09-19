import { PrismaClient } from "@prisma/client";

// ตัวแอปตอนรันจะเชื่อมต่อผ่าน role `boq_app` ที่จำกัดสิทธิ์เสมอ ไม่ใช่ superuser ที่ใช้ทำ
// migration (DATABASE_URL) — ดู prisma/init/01-create-runtime-role.sql และ prisma/seed.ts
// จำเป็นต้องมี ไม่มี fallback: การเงียบ ๆ ถอยไปใช้การเชื่อมต่อแบบ superuser จะทำลาย
// จุดประสงค์ทั้งหมดของการแยกสิทธิ์
const runtimeUrl = process.env.DATABASE_URL_RUNTIME;
if (!runtimeUrl) {
  throw new Error(
    "DATABASE_URL_RUNTIME is not set — the app must connect via the restricted runtime role, " +
      "not the migration superuser. See .env.example.",
  );
}

export const prisma = new PrismaClient({ datasources: { db: { url: runtimeUrl } } });
