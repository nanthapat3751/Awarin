import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin } from "../helpers/test-auth";

/**
 * หน้ารายการโครงการ + คำขอลูกค้าแบบแบ่งหน้าที่เซิร์ฟเวอร์ (หน้าละ 15)
 * คำค้นใส่ token ของเทสต์นี้ทุกครั้ง — ฐานทดสอบมีข้อมูลของไฟล์อื่นปนอยู่
 */
describe("server-side list pages (projects + leads)", () => {
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  const token = `lp${Date.now().toString(36)}`;

  // เวลาไทย = UTC+7: 00:30 วันที่ 1 ม.ค. 2026 (ไทย) = 31 ธ.ค. 2025 17:30 UTC
  const NEW_YEAR_THAI = new Date("2025-12-31T17:30:00Z");
  const NEW_YEAR_EVE_THAI = new Date("2025-12-31T16:30:00Z");

  beforeAll(async () => {
    admin = await createAndLoginAdmin("test-list-pages");
    await prisma.project.createMany({
      data: Array.from({ length: 17 }, (_, i) => ({
        projectNo: `${token}-${String(i).padStart(2, "0")}`,
        name: `โครงการ ${token} ${i}`,
        createdById: admin.userId,
        status: i === 0 ? ("CANCELLED" as const) : i < 4 ? ("APPROVED" as const) : ("DRAFT" as const),
        createdAt: i === 1 ? NEW_YEAR_THAI : i === 2 ? NEW_YEAR_EVE_THAI : new Date(Date.now() - i * 60_000),
      })),
    });
    await prisma.lead.createMany({
      data: Array.from({ length: 16 }, (_, i) => ({
        serviceType: "ก่อสร้างบ้าน",
        name: `ลูกค้า ${token} ${i}`,
        phone: i === 5 ? "0899999999" : `08100000${String(i).padStart(2, "0")}`,
        message: "ทดสอบ",
        status: i < 3 ? ("CONTACTED" as const) : ("NEW" as const),
        createdAt: i === 1 ? NEW_YEAR_THAI : new Date(Date.now() - i * 60_000),
      })),
    });
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { projectNo: { startsWith: token } } });
    await prisma.lead.deleteMany({ where: { name: { contains: token } } });
    await prisma.user.deleteMany({ where: { id: admin.userId } });
    await prisma.$disconnect();
  });

  it("projects: 15 per page, cancelled hidden unless asked, counts per status", async () => {
    const p1 = await admin.agent.get(`/api/projects?page=1&q=${token}`).expect(200);
    expect(p1.body).toMatchObject({ page: 1, pageSize: 15, total: 16 });
    expect(p1.body.projects).toHaveLength(15);
    expect(p1.body.projects.every((p: { status: string }) => p.status !== "CANCELLED")).toBe(true);
    expect(p1.body.counts).toMatchObject({ ALL: 16, CANCELLED: 1, APPROVED: 3, DRAFT: 13, QUOTED: 0 });
    expect(p1.body.projects[0]).toHaveProperty("quoteCount", 0);

    const p2 = await admin.agent.get(`/api/projects?page=2&q=${token}`).expect(200);
    expect(p2.body.projects).toHaveLength(1);
    const ids = [...p1.body.projects, ...p2.body.projects].map((p: { id: string }) => p.id);
    expect(new Set(ids).size).toBe(16);

    // ขอเกิน / ค่าเพี้ยน → หน้าที่มีจริง
    expect((await admin.agent.get(`/api/projects?page=99&q=${token}`)).body.page).toBe(2);
    expect((await admin.agent.get(`/api/projects?page=abc&q=${token}`)).body.page).toBe(1);

    const cancelled = await admin.agent.get(`/api/projects?page=1&q=${token}&status=CANCELLED`).expect(200);
    expect(cancelled.body.total).toBe(1);
    // counts ไม่ขึ้นกับสถานะที่เลือก
    expect(cancelled.body.counts.ALL).toBe(16);

    // รายการเต็มแบบเดิม (ไม่ส่ง page) ยังใช้ได้
    const legacy = await admin.agent.get(`/api/projects?q=${token}`).expect(200);
    expect(legacy.body.projects).toHaveLength(17);
    expect(legacy.body).not.toHaveProperty("total");
  });

  it("projects: year/month filter follows Thai calendar days", async () => {
    const jan = await admin.agent.get(`/api/projects?page=1&q=${token}&year=2026&month=1`).expect(200);
    expect(jan.body.projects.map((p: { name: string }) => p.name)).toEqual([`โครงการ ${token} 1`]);
    const dec = await admin.agent.get(`/api/projects?page=1&q=${token}&year=2025&month=12`).expect(200);
    expect(dec.body.projects.map((p: { name: string }) => p.name)).toEqual([`โครงการ ${token} 2`]);
    const year2025 = await admin.agent.get(`/api/projects?page=1&q=${token}&year=2025`).expect(200);
    expect(year2025.body.total).toBe(1);
    // ปีเพี้ยน = ไม่กรอง
    const bad = await admin.agent.get(`/api/projects?page=1&q=${token}&year=abc`).expect(200);
    expect(bad.body.total).toBe(16);
  });

  it("leads: paginated, searchable by phone, counts per status, period filter", async () => {
    const p1 = await admin.agent.get(`/api/leads?page=1&q=${token}`).expect(200);
    expect(p1.body).toMatchObject({ page: 1, pageSize: 15, total: 16 });
    expect(p1.body.leads).toHaveLength(15);
    expect(p1.body.counts).toMatchObject({ ALL: 16, NEW: 13, CONTACTED: 3, QUOTED: 0 });
    expect(p1.body.leads[0]).toHaveProperty("projectId", null);

    const byPhone = await admin.agent.get(`/api/leads?page=1&q=0899999999`).expect(200);
    expect(byPhone.body.leads.map((l: { name: string }) => l.name)).toContain(`ลูกค้า ${token} 5`);

    const contacted = await admin.agent.get(`/api/leads?page=1&q=${token}&status=CONTACTED`).expect(200);
    expect(contacted.body.total).toBe(3);

    const jan = await admin.agent.get(`/api/leads?page=1&q=${token}&year=2026&month=1`).expect(200);
    expect(jan.body.leads.map((l: { name: string }) => l.name)).toEqual([`ลูกค้า ${token} 1`]);

    // รายการเต็มแบบเดิม (หน้าโครงการใช้เลือกคำขอมาผูก)
    const legacy = await admin.agent.get("/api/leads").expect(200);
    expect(Array.isArray(legacy.body.leads)).toBe(true);
  });
});
