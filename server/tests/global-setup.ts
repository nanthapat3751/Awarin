import path from "node:path";

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

/**
 * เตรียมของกลางที่เทสต์หลายไฟล์ใช้ร่วมกัน ก่อนเริ่มรัน — ฐานข้อมูลทดสอบที่เพิ่งสร้างใหม่ (เช่นบน CI) ยังว่างเปล่า
 *
 * แม่แบบสัญญาเริ่มต้น: ออกสัญญาครั้งแรกระบบจะสร้างแม่แบบให้เอง โดยผูก createdById กับคนที่ออกสัญญา
 * ถ้าคนนั้นเป็นผู้ใช้ทดสอบ afterAll ของไฟล์นั้นจะลบผู้ใช้ไม่ได้ (ติด FK ContractTemplate_createdById_fkey)
 * และไฟล์ไหนรันก่อนก็พังไฟล์นั้น — จึงสร้างแม่แบบไว้ก่อน ผูกกับผู้ใช้ fixture ที่ไม่มีใครลบ
 * ฐานที่มีแม่แบบอยู่แล้ว (เครื่องนักพัฒนา) ไม่เปลี่ยนอะไร
 */
export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env"), quiet: true });
  const url = process.env.DATABASE_URL_TEST;
  const runtimeUrl = process.env.DATABASE_URL_TEST_RUNTIME;
  if (!url || !runtimeUrl) return; // setup-env.ts จะแจ้งข้อผิดพลาดเอง

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const existing = await prisma.contractTemplate.findFirst({ where: { deletedAt: null } });
    if (existing) return;

    // บัญชีปิดใช้งาน ไม่มีรหัสผ่านที่ใช้ได้ — มีไว้เป็นเจ้าของแม่แบบเท่านั้น (ไม่ได้รับแจ้งเตือนพนักงาน)
    const fixture = await prisma.user.upsert({
      where: { username: "test-fixture-template-owner" },
      update: {},
      create: {
        username: "test-fixture-template-owner",
        passwordHash: "!fixture-no-login",
        fullName: "Test Fixture",
        role: "ADMIN",
        active: false,
      },
    });

    // ใช้เนื้อหาแม่แบบตั้งต้นตัวเดียวกับระบบจริง — service อ่าน DATABASE_URL_RUNTIME ตอน import
    process.env.DATABASE_URL_RUNTIME = runtimeUrl;
    const { ensureDefaultContractTemplate } = await import("../src/modules/contractTemplates/contractTemplates.service");
    const { prisma: runtimePrisma } = await import("../src/lib/prisma");
    await ensureDefaultContractTemplate(fixture.id);
    await runtimePrisma.$disconnect();
  } finally {
    await prisma.$disconnect();
  }
}
