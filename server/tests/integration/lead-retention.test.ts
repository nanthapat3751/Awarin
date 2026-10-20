import { LEAD_RETENTION_DAYS, sweepStaleLeads } from "../../src/lib/lead-retention";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";

/**
 * ลบคำขอติดต่อตามนโยบายความเป็นส่วนตัว: "ไม่ได้ดำเนินการต่อ — 2 ปีนับจากวันที่ติดต่อครั้งสุดท้าย"
 * - เก่าเกิน 2 ปี + ไม่เป็นโครงการ → ลบ
 * - ยังไม่ถึง 2 ปี / เป็นโครงการแล้ว → อยู่
 */
describe("ลบคำขอติดต่อที่เก่าเกินระยะเวลาเก็บ", () => {
  const leadIds: string[] = [];
  const projectIds: string[] = [];
  const userIds: string[] = [];
  const DAY = 24 * 60 * 60 * 1000;

  afterAll(async () => {
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function lead(label: string, ageDays: number) {
    const row = await prisma.lead.create({
      data: { name: `[ชั่วคราว] ${label}`, phone: "0800000000", serviceType: "งานก่อสร้าง" },
    });
    leadIds.push(row.id);
    // @updatedAt ตั้งเองตอน update — ย้อนวันด้วย SQL ตรง
    const at = new Date(Date.now() - ageDays * DAY);
    await prisma.$executeRaw`UPDATE "Lead" SET "createdAt" = ${at}, "updatedAt" = ${at} WHERE id = ${row.id}`;
    return row.id;
  }

  it("ลบเฉพาะคำขอที่ไม่เป็นโครงการและเงียบเกินกำหนด", async () => {
    const old = await lead("เก่าเกินกำหนด", LEAD_RETENTION_DAYS + 5);
    const recent = await lead("ยังไม่ถึงกำหนด", LEAD_RETENTION_DAYS - 5);
    const converted = await lead("เป็นโครงการแล้ว", LEAD_RETENTION_DAYS + 30);
    const owner = await createAndLoginOwner("lead-retention");
    userIds.push(owner.userId);
    const project = await prisma.project.create({
      data: {
        name: "[ชั่วคราว] โครงการจากคำขอเก่า",
        projectNo: `TMP-LR-${Date.now()}`,
        leadId: converted,
        createdById: owner.userId,
      },
    });
    projectIds.push(project.id);

    const removed = await sweepStaleLeads();
    expect(removed).toBeGreaterThanOrEqual(1);

    expect(await prisma.lead.findUnique({ where: { id: old } })).toBeNull();
    expect(await prisma.lead.findUnique({ where: { id: recent } })).not.toBeNull();
    expect(await prisma.lead.findUnique({ where: { id: converted } })).not.toBeNull();

    // บันทึกการลบไม่มีชื่อ/เบอร์ของคำขอที่ลบไป
    const log = await prisma.auditLog.findFirst({ where: { action: "AUTO_PURGE_LEAD_RETENTION", entityId: old } });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log!.details)).not.toContain("0800000000");
  });

  it("ติดต่อกลับเมื่อไหร่ นับใหม่จากวันนั้น (updatedAt)", async () => {
    const id = await lead("ตอบกลับล่าสุดเมื่อไม่นาน", LEAD_RETENTION_DAYS + 100);
    // ตอบกลับวันนี้ → updatedAt เป็นวันนี้
    await prisma.lead.update({ where: { id }, data: { reply: "โทรกลับแล้ว", repliedAt: new Date() } });
    await sweepStaleLeads();
    expect(await prisma.lead.findUnique({ where: { id } })).not.toBeNull();
  });
});
