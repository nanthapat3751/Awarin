import path from "node:path";

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

import { grantRuntimeRolePrivileges } from "./grant-runtime-privileges";

/**
 * ให้สิทธิ์ boq_app บนฐานข้อมูลทดสอบ (ทำแบบเดียวกับ seed.ts ที่ทำให้ฐานข้อมูล dev) รันครั้งเดียว
 * หลังจาก `prisma migrate deploy` สร้าง schema ที่นั่นแล้ว — ดูขั้นตอนตั้งค่าทั้งหมดในส่วน
 * "ฐานข้อมูลสำหรับทดสอบ (test database)" ของ README
 */
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  throw new Error("DATABASE_URL_TEST is not set — see .env.example.");
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

grantRuntimeRolePrivileges(prisma, "systemboq_test")
  .then(() => {
    console.log("Granted restricted runtime privileges to boq_app on systemboq_test.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
