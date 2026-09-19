import path from "node:path";

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

import { grantBackupRolePrivileges } from "./grant-runtime-privileges";

/**
 * ตั้ง role `boq_backup` (อ่านอย่างเดียว) บนฐานข้อมูลที่มีอยู่แล้ว — ไม่ต้องรัน seed ทั้งชุด
 * (seed เติมข้อมูลตั้งต้นด้วย ซึ่งไม่ควรรันซ้ำบนฐานข้อมูลที่ใช้งานจริง) ทำซ้ำได้ปลอดภัย
 *
 *   npm run db:grant:backup -w server
 */
dotenv.config({ path: path.resolve(__dirname, "..", ".env"), quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set — ต้องใช้ role เจ้าของฐานข้อมูล (boq) ในการให้สิทธิ์");
}
const databaseName = new URL(url).pathname.replace(/^\//, "");
const prisma = new PrismaClient({ datasources: { db: { url } } });

grantBackupRolePrivileges(prisma, databaseName)
  .then(() => console.log(`ตั้งสิทธิ์ boq_backup (อ่านอย่างเดียว) บน ${databaseName} แล้ว`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
