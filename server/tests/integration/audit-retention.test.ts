import { PrismaClient } from "@prisma/client";

import { sweepAuditLog, writeAuditLog } from "../../src/lib/audit-log";
import { AUDIT_LOG_RETENTION_DAYS } from "../../src/lib/audit-retention";
import { prisma } from "../../src/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const MARKER = "TEST_AUDIT_RETENTION";

// prisma ปกติเชื่อมต่อด้วย role `boq_app` ที่ลบแถว audit ไม่ได้ (ประเด็นทั้งหมดของไฟล์นี้)
// เก็บกวาดท้ายเทสต์จึงต้องใช้การเชื่อมต่อของเจ้าของฐานข้อมูล ไม่งั้นแถวที่เทสต์สร้างจะค้างถาวร
// (setup-env.ts ตั้ง DATABASE_URL ให้ชี้ฐานข้อมูลทดสอบด้วย role `boq` แล้ว)
const ownerPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

/** สร้างแถว audit พร้อมกำหนดอายุย้อนหลังเป็นวัน */
async function seedRow(daysAgo: number, action: string) {
  const row = await prisma.auditLog.create({
    data: {
      action,
      entityType: MARKER,
      createdAt: new Date(Date.now() - daysAgo * DAY_MS),
    },
  });
  return row.id;
}

describe("audit log retention sweep", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    await ownerPrisma.auditLog.deleteMany({ where: { entityType: MARKER } });
    await ownerPrisma.auditLog.deleteMany({ where: { action: "AUTO_PURGE_AUDIT_LOG" } });
    await ownerPrisma.$disconnect();
  });

  it("ตัวเลขระยะเวลาเก็บตรงกับที่ประกาศไว้ในนโยบายความเป็นส่วนตัว (1 ปี)", () => {
    expect(AUDIT_LOG_RETENTION_DAYS).toBe(365);
  });

  it("role ที่แอปใช้ลบแถว audit เองไม่ได้ (append-only ยังอยู่)", async () => {
    const id = await seedRow(0, `${MARKER}_GUARD`);
    createdIds.push(id);

    // ถ้าวันไหน GRANT DELETE ให้ boq_app เข้าไป เทสต์นี้จะเป็นตัวจับได้ตัวแรก
    await expect(prisma.auditLog.deleteMany({ where: { id } })).rejects.toThrow();
    expect(await prisma.auditLog.count({ where: { id } })).toBe(1);
  });

  it("ลบเฉพาะแถวที่เก่าเกินกำหนด ไม่แตะแถวที่ยังไม่ถึงกำหนด", async () => {
    const เก่ามาก = await seedRow(AUDIT_LOG_RETENTION_DAYS + 30, `${MARKER}_OLD`);
    const เกินพอดี = await seedRow(AUDIT_LOG_RETENTION_DAYS + 1, `${MARKER}_JUST_OLD`);
    const ยังไม่ถึง = await seedRow(AUDIT_LOG_RETENTION_DAYS - 1, `${MARKER}_JUST_YOUNG`);
    const เพิ่งเกิด = await seedRow(0, `${MARKER}_NEW`);
    createdIds.push(เก่ามาก, เกินพอดี, ยังไม่ถึง, เพิ่งเกิด);

    const removed = await sweepAuditLog();

    expect(removed).toBeGreaterThanOrEqual(2);
    expect(await prisma.auditLog.count({ where: { id: เก่ามาก } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { id: เกินพอดี } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { id: ยังไม่ถึง } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { id: เพิ่งเกิด } })).toBe(1);
  });

  it("บันทึกไว้ว่าลบไปกี่แถว และแถวบันทึกนั้นไม่โดนลบตัวเอง", async () => {
    const id = await seedRow(AUDIT_LOG_RETENTION_DAYS + 5, `${MARKER}_FOR_RECORD`);
    createdIds.push(id);

    await sweepAuditLog();

    const record = await prisma.auditLog.findFirst({
      where: { action: "AUTO_PURGE_AUDIT_LOG" },
      orderBy: { createdAt: "desc" },
    });
    expect(record).not.toBeNull();
    expect(record?.entityType).toBe("AuditLog");
    expect(record?.userId).toBeNull();
    expect(record?.details).toMatchObject({ retentionDays: AUDIT_LOG_RETENTION_DAYS });
  });

  it("ไม่มีอะไรถึงกำหนดก็ไม่ลบอะไรเลย และไม่เขียนบันทึกเปล่า", async () => {
    const ก่อนหน้า = await prisma.auditLog.count({ where: { action: "AUTO_PURGE_AUDIT_LOG" } });

    const removed = await sweepAuditLog();

    expect(removed).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "AUTO_PURGE_AUDIT_LOG" } })).toBe(ก่อนหน้า);
  });

  it("writeAuditLog ยังเขียนแถวใหม่ได้ตามปกติหลังติดตั้งฟังก์ชันลบ", async () => {
    await writeAuditLog({ action: `${MARKER}_WRITE`, entityType: MARKER });
    const found = await prisma.auditLog.findFirst({ where: { action: `${MARKER}_WRITE` } });
    expect(found).not.toBeNull();
  });
});
