import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import crypto from "node:crypto";

import { grantRuntimeRolePrivileges } from "./grant-runtime-privileges";

const prisma = new PrismaClient();

async function main() {
  // ถูกสร้างโดย prisma/init/01-create-runtime-role.sql ตอนสร้าง container ครั้งแรกด้วย;
  // ทำซ้ำที่นี่ (แบบ idempotent) เพื่อให้ seed.ts ทำงานได้ด้วยตัวเองแม้กับฐานข้อมูล dev เดิมที่มี
  // มาตั้งแต่ก่อนฟีเจอร์นี้ และเพื่อรับประกันว่า REVOKE เฉพาะของ "AuditLog" — ซึ่งรันได้ก็ต่อเมื่อ
  // migration สร้างตารางนั้นแล้วเท่านั้น — จะถูกนำมาใช้แน่นอน
  await grantRuntimeRolePrivileges(prisma, "systemboq");
  console.log("Granted restricted runtime privileges to boq_app on systemboq (AuditLog append-only enforced).");

  const adminUsername = "owner";
  const adminPassword = crypto.randomBytes(9).toString("base64url");

  // ตรวจด้วย role แทนชื่อผู้ใช้เริ่มต้น: ชื่อผู้ใช้ของ OWNER คาดว่าจะเปลี่ยนหลังตั้งค่าเสร็จ
  // ซึ่งต้องไม่ทำให้ seed เข้าใจว่ายังไม่มี OWNER แล้วสร้างขึ้นมาอีกคน
  const existingAdmin = await prisma.user.findFirst({ where: { role: "OWNER" } });
  if (!existingAdmin) {
    const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
    // ไม่ตั้งอีเมลให้บัญชีพนักงาน — ฝั่งบริษัทล็อกอินด้วยชื่อผู้ใช้ และระบบไม่เคยส่งอีเมลถึงพนักงาน
    await prisma.user.create({
      data: {
        username: adminUsername,
        passwordHash,
        fullName: "System Owner",
        role: "OWNER",
      },
    });
    console.log("Seeded OWNER account:");
    console.log(`  username: ${adminUsername}`);
    console.log(`  password: ${adminPassword}  (change on first login)`);
  } else {
    console.log("OWNER account already exists, skipping.");
  }

  await prisma.setting.upsert({
    where: { key: "overheadProfitPercent" },
    update: {},
    create: { key: "overheadProfitPercent", value: "10" },
  });
  await prisma.setting.upsert({
    where: { key: "vatPercent" },
    update: {},
    create: { key: "vatPercent", value: "7" },
  });
  await prisma.setting.upsert({
    where: { key: "companyName" },
    update: {},
    create: { key: "companyName", value: "บริษัทตัวอย่างรับออกแบบและสร้างบ้าน" },
  });
  await prisma.setting.upsert({
    where: { key: "companyAddress" },
    update: {},
    create: { key: "companyAddress", value: "" },
  });
  await prisma.setting.upsert({
    where: { key: "companyPhone" },
    update: {},
    create: { key: "companyPhone", value: "" },
  });

  // หมวดงานระดับบนสุด (A-F) ตามที่ใช้ในเอกสาร BOQ อ้างอิงจริง
  const topCategories: { id: string; code: string; name: string; sortOrder: number }[] = [
    { id: "seed-cat-a", code: "A", name: "หมวดงานเตรียมการ", sortOrder: 1 },
    { id: "seed-cat-b", code: "B", name: "หมวดงานโครงสร้าง", sortOrder: 2 },
    { id: "seed-cat-c", code: "C", name: "หมวดงานสถาปัตยกรรม", sortOrder: 3 },
    { id: "seed-cat-d", code: "D", name: "หมวดงานโครงสร้างอื่นๆ", sortOrder: 4 },
    { id: "seed-cat-e", code: "E", name: "หมวดงานระบบสุขาภิบาลและป้องกันอัคคีภัย", sortOrder: 5 },
    { id: "seed-cat-f", code: "F", name: "หมวดงานระบบไฟฟ้า และสื่อสาร", sortOrder: 6 },
  ];

  for (const cat of topCategories) {
    await prisma.workCategory.upsert({
      where: { id: cat.id },
      update: {},
      create: { id: cat.id, level: "CATEGORY", code: cat.code, name: cat.name, sortOrder: cat.sortOrder },
    });
  }

  const foundationSubgroup = await prisma.workCategory.upsert({
    where: { id: "seed-sub-foundation" },
    update: {},
    create: {
      id: "seed-sub-foundation",
      parentId: "seed-cat-b",
      level: "SUBGROUP",
      code: "B-01",
      name: "งานฐานรากและเสาตอม่อ",
      sortOrder: 1,
    },
  });

  const concreteItem = await prisma.workCategory.upsert({
    where: { id: "seed-item-concrete" },
    update: {},
    create: {
      id: "seed-item-concrete",
      parentId: foundationSubgroup.id,
      level: "ITEM",
      code: "B-01-01",
      name: "คอนกรีตโครงสร้าง fc' 240 ksc. (cube)",
      sortOrder: 1,
    },
  });

  // ราคาอ้างอิงจาก BOQ จริง (คอนกรีตโครงสร้าง fc' 240 ksc.)
  await prisma.material.upsert({
    where: { id: "seed-mat-concrete" },
    update: {},
    create: {
      id: "seed-mat-concrete",
      categoryId: concreteItem.id,
      code: "MAT-0001",
      name: "คอนกรีตโครงสร้าง fc' 240 ksc. (cube)",
      unit: "ลบ.ม.",
      materialUnitPrice: 2400,
      laborUnitPrice: 450,
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
