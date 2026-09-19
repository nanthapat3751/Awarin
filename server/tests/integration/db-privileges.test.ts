import { PrismaClient } from "@prisma/client";

import { prisma } from "../../src/lib/prisma";

// client แยกที่เชื่อมต่อด้วย superuser ใช้เพียงเพื่อเก็บกวาดสิ่งที่ไฟล์เทสต์นี้สร้างขึ้น — เพราะ
// role runtime ที่จำกัดสิทธิ์ตั้งใจให้ลบแถว AuditLog เองไม่ได้
const superuserPrisma = new PrismaClient();

// ล็อกการแยกสิทธิ์ของฐานข้อมูลที่ตั้งไว้ใน prisma/init/01-create-runtime-role.sql และถูกใช้โดย
// prisma/seed.ts ตัว `prisma` singleton ของแอปเชื่อมต่อด้วย role `boq_app` ที่จำกัดสิทธิ์
// (DATABASE_URL_RUNTIME) ไม่ใช่ superuser ที่ใช้ทำ migration (DATABASE_URL) — ดู lib/prisma.ts
// เทสต์นี้ทดสอบเรื่องนั้นจริง ๆ ไม่ใช่แค่ตรวจ config
describe("database privilege separation (restricted runtime role)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
    await superuserPrisma.$disconnect();
  });

  it("rejects UPDATE on AuditLog (append-only enforcement)", async () => {
    // WHERE false: แม้ว่าการ grant จะตั้งค่าผิด คำสั่งนี้ก็แก้แถวจริงไม่ได้ — เพราะการตรวจสิทธิ์
    // เกิดก่อนการจับคู่แถวอยู่แล้ว จึงยังพิสูจน์ประเด็นได้ โดยไม่เสี่ยงกับข้อมูล audit ที่มีอยู่
    // หากการ assert ผิดพลาด
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET action = 'TAMPERED' WHERE false`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("rejects DELETE on AuditLog (append-only enforcement)", async () => {
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE false`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("still allows INSERT and SELECT on AuditLog (append-only, not no-access)", async () => {
    const before = await prisma.auditLog.count();
    const created = await prisma.auditLog.create({
      data: { action: "TEST_PRIVILEGE_CHECK", entityType: "Test" },
    });
    const after = await prisma.auditLog.count();
    expect(after).toBe(before + 1);

    // เก็บกวาดผ่านการเชื่อมต่อแบบ superuser เพราะ role runtime ลบมันไม่ได้
    await superuserPrisma.auditLog.delete({ where: { id: created.id } });
  });

  it("rejects DDL (CREATE TABLE) through the runtime role", async () => {
    await expect(
      prisma.$executeRawUnsafe(`CREATE TABLE privilege_test_should_never_exist (id int)`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("still allows normal CRUD on other tables", async () => {
    await expect(prisma.setting.findMany()).resolves.toBeDefined();
  });
});
