import { prisma } from "../../src/lib/prisma";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";

describe("projects module", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  let materialId: string;
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-projects-owner");
    createdUserIds.push(owner.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบลบโครงการ" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบลบโครงการ",
    });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการทดสอบลบโครงการ",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);

    const material = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "วัสดุทดสอบลบโครงการ",
      unit: "หน่วย",
      materialUnitPrice: 100,
      laborUnitPrice: 50,
    });
    materialId = material.body.material.id;
    createdMaterialIds.push(materialId);
  });

  afterAll(async () => {
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("creates a project with an auto-generated projectNo and an empty initial version", async () => {
    const res = await owner.agent.post("/api/projects").send({ name: "โครงการทดสอบ 1" });

    expect(res.status).toBe(201);
    expect(res.body.project.projectNo).toMatch(/^PRJ-\d{4}-\d{4,}$/);
    expect(res.body.project.status).toBe("DRAFT");
    createdProjectIds.push(res.body.project.id);
  });

  it("uses a custom overheadProfitPercent when given, and the company default when omitted", async () => {
    const custom = await owner.agent
      .post("/api/projects")
      .send({ name: "โครงการเรทพิเศษ", overheadProfitPercent: 8 });
    expect(custom.status).toBe(201);
    createdProjectIds.push(custom.body.project.id);
    const customDetail = await owner.agent.get(`/api/projects/${custom.body.project.id}`);
    expect(Number(customDetail.body.currentVersion.overheadProfitPct)).toBe(8);

    const defaultRes = await owner.agent.post("/api/projects").send({ name: "โครงการเรทมาตรฐาน" });
    createdProjectIds.push(defaultRes.body.project.id);
    const defaultDetail = await owner.agent.get(`/api/projects/${defaultRes.body.project.id}`);
    expect(Number(defaultDetail.body.currentVersion.overheadProfitPct)).not.toBe(8);
  });

  it("rejects a non-existent customerId", async () => {
    const res = await owner.agent
      .post("/api/projects")
      .send({ name: "โครงการผิดลูกค้า", customerId: "does-not-exist" });
    expect(res.status).toBe(404);
  });

  it("lists projects including the created one", async () => {
    const created = await owner.agent.post("/api/projects").send({ name: "โครงการสำหรับลิสต์" });
    createdProjectIds.push(created.body.project.id);

    const listRes = await owner.agent.get("/api/projects");
    expect(listRes.status).toBe(200);
    const ids = listRes.body.projects.map((p: { id: string }) => p.id);
    expect(ids).toContain(created.body.project.id);
  });

  it("searches project history by name, projectNo, or customer name (q param)", async () => {
    const created = await owner.agent
      .post("/api/projects")
      .send({ name: "โครงการค้นหาแบบพิเศษเฉพาะ" });
    createdProjectIds.push(created.body.project.id);

    const byName = await owner.agent.get("/api/projects?q=ค้นหาแบบพิเศษ");
    expect(byName.body.projects.map((p: { id: string }) => p.id)).toContain(created.body.project.id);

    const byProjectNo = await owner.agent.get(
      `/api/projects?q=${encodeURIComponent(created.body.project.projectNo)}`,
    );
    expect(byProjectNo.body.projects.map((p: { id: string }) => p.id)).toContain(
      created.body.project.id,
    );

    const noMatch = await owner.agent.get("/api/projects?q=ไม่มีโครงการนี้แน่นอน123456");
    expect(noMatch.body.projects.map((p: { id: string }) => p.id)).not.toContain(
      created.body.project.id,
    );
  });

  it("returns project detail with an empty, editable v1", async () => {
    const created = await owner.agent.post("/api/projects").send({ name: "โครงการดูรายละเอียด" });
    createdProjectIds.push(created.body.project.id);

    const detailRes = await owner.agent.get(`/api/projects/${created.body.project.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.currentVersion.versionNo).toBe(1);
    expect(detailRes.body.items).toEqual([]);
    expect(detailRes.body.editable).toBe(true);
  });

  it("updates a project's name", async () => {
    const created = await owner.agent.post("/api/projects").send({ name: "ชื่อเดิม" });
    createdProjectIds.push(created.body.project.id);

    const updateRes = await owner.agent
      .patch(`/api/projects/${created.body.project.id}`)
      .send({ name: "ชื่อใหม่" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.project.name).toBe("ชื่อใหม่");
  });

  it("allows DRAFT -> QUOTED but blocks QUOTED -> APPROVED without an accepted quote", async () => {
    const created = await owner.agent.post("/api/projects").send({ name: "โครงการ state machine" });
    const projectId = created.body.project.id;
    createdProjectIds.push(projectId);

    const toQuoted = await owner.agent
      .post(`/api/projects/${projectId}/transition`)
      .send({ toStatus: "QUOTED" });
    expect(toQuoted.status).toBe(200);
    expect(toQuoted.body.project.status).toBe("QUOTED");

    const toApprovedBlocked = await owner.agent
      .post(`/api/projects/${projectId}/transition`)
      .send({ toStatus: "APPROVED" });
    expect(toApprovedBlocked.status).toBe(409);
  });

  it("allows QUOTED -> APPROVED once an ACCEPTED quote exists", async () => {
    const created = await owner.agent.post("/api/projects").send({ name: "โครงการมีใบเสนอราคา" });
    const projectId = created.body.project.id;
    createdProjectIds.push(projectId);

    await owner.agent.post(`/api/projects/${projectId}/transition`).send({ toStatus: "QUOTED" });

    const detail = await owner.agent.get(`/api/projects/${projectId}`);
    await prisma.quote.create({
      data: {
        projectId,
        projectVersionId: detail.body.currentVersion.id,
        quoteNo: `TEST-Q-${Date.now()}`,
        revisionNo: 1,
        status: "ACCEPTED",
      },
    });

    const toApproved = await owner.agent
      .post(`/api/projects/${projectId}/transition`)
      .send({ toStatus: "APPROVED" });
    expect(toApproved.status).toBe(200);
    expect(toApproved.body.project.status).toBe("APPROVED");
  });

  it("blocks transitions out of a terminal status", async () => {
    const created = await owner.agent.post("/api/projects").send({ name: "โครงการยกเลิก" });
    const projectId = created.body.project.id;
    createdProjectIds.push(projectId);

    await owner.agent.post(`/api/projects/${projectId}/transition`).send({ toStatus: "CANCELLED" });
    const res = await owner.agent
      .post(`/api/projects/${projectId}/transition`)
      .send({ toStatus: "DRAFT" });
    expect(res.status).toBe(409);
  });

  it("rejects a CUSTOMER creating a project", async () => {
    const customer = await createAndLoginCustomer("test-projects-customer");
    const res = await customer.agent.post("/api/projects").send({ name: "ห้ามสร้าง" });
    expect(res.status).toBe(403);

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  it("deletes a never-quoted project, and reports quoteCount: 0 for it in the list", async () => {
    const created = await owner.agent.post("/api/projects").send({ name: "โครงการลบได้" });
    const projectId = created.body.project.id;
    // ถังขยะ: การลบตอนนี้เป็น soft-delete → row ยังอยู่ ต้อง track ไว้ให้ afterAll ลบจริง
    createdProjectIds.push(projectId);

    const list = await owner.agent.get("/api/projects");
    const listed = list.body.projects.find((p: { id: string }) => p.id === projectId);
    expect(listed.quoteCount).toBe(0);

    const del = await owner.agent.delete(`/api/projects/${projectId}`);
    expect(del.status).toBe(204);

    const getRes = await owner.agent.get(`/api/projects/${projectId}`);
    expect(getRes.status).toBe(404);
  });

  it("blocks deleting a project that has ever been quoted", async () => {
    const created = await owner.agent.post("/api/projects").send({ name: "โครงการมีใบเสนอราคา" });
    const projectId = created.body.project.id;
    createdProjectIds.push(projectId);

    await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    expect(quoteRes.status).toBe(201);

    const list = await owner.agent.get("/api/projects");
    const listed = list.body.projects.find((p: { id: string }) => p.id === projectId);
    expect(listed.quoteCount).toBe(1);

    const del = await owner.agent.delete(`/api/projects/${projectId}`);
    expect(del.status).toBe(409);

    const getRes = await owner.agent.get(`/api/projects/${projectId}`);
    expect(getRes.status).toBe(200);
  });

  describe("ไทม์ไลน์กิจกรรม", () => {
    it("เล่าเรื่องของโครงการจาก AuditLog โดยไม่เอาความเคลื่อนไหวรายบรรทัด BOQ มาปน", async () => {
      const created = await owner.agent
        .post("/api/projects")
        .send({ name: "โครงการทดสอบไทม์ไลน์" });
      const projectId = created.body.project.id as string;
      createdProjectIds.push(projectId);

      // สร้างความเคลื่อนไหวระดับบรรทัด BOQ ซึ่ง "ต้องไม่" โผล่ในไทม์ไลน์
      await owner.agent
        .post(`/api/projects/${projectId}/boq/items`)
        .send({ categoryId: itemCategoryId, materialId, quantity: 2 });

      const res = await owner.agent.get(`/api/projects/${projectId}/activity`);
      expect(res.status).toBe(200);

      const titles = res.body.activity.map((a: { title: string }) => a.title);
      expect(titles.some((t: string) => t.includes("สร้างโครงการ"))).toBe(true);
      // ทั้งระบบมี AuditLog ของบรรทัด BOQ หลักพันแถว ถ้าหลุดเข้ามาจะกลบเรื่องราวจริงจนอ่านไม่ออก
      expect(titles.some((t: string) => /BOQ/.test(t) && !/เวอร์ชัน/.test(t))).toBe(false);

      // เรียงใหม่สุดขึ้นก่อน
      const times = res.body.activity.map((a: { at: string }) => Date.parse(a.at));
      expect([...times].sort((a: number, b: number) => b - a)).toEqual(times);

      for (const item of res.body.activity) {
        expect(typeof item.title).toBe("string");
        expect(item.title.length).toBeGreaterThan(0);
        expect(["created", "quote", "sent", "customer", "accepted", "rejected", "contract", "status", "file"]).toContain(
          item.kind,
        );
      }
    });

    it("บันทึกคำตอบของลูกค้าพร้อมเหตุผลลงไทม์ไลน์", async () => {
      const customer = await createAndLoginCustomer("test-activity-customer");
      const me = await customer.agent.get("/api/auth/me");

      const created = await owner.agent
        .post("/api/projects")
        .send({ name: "โครงการทดสอบไทม์ไลน์ปฏิเสธ", customerId: me.body.user.id });
      const projectId = created.body.project.id as string;
      createdProjectIds.push(projectId);

      await owner.agent
        .post(`/api/projects/${projectId}/boq/items`)
        .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
      const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`);
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${quote.body.quote.id}/transition`)
        .send({ toStatus: "SENT" });
      await customer.agent
        .post(`/api/my/quotes/${quote.body.quote.id}/respond`)
        .send({ action: "REJECT", note: "ราคาสูงเกินงบที่ตั้งไว้" });

      const res = await owner.agent.get(`/api/projects/${projectId}/activity`);
      // ทั้งการที่ลูกค้าปฏิเสธใบเสนอราคา และการที่สถานะโครงการขยับตาม ต่างก็เป็น kind "rejected"
      // จึงต้องเจาะเอาอันที่เป็นคำตอบของลูกค้าจริง ๆ
      const rejected = res.body.activity.find((a: { title: string }) =>
        a.title.startsWith("ลูกค้าปฏิเสธใบเสนอราคา"),
      );
      expect(rejected).toBeDefined();
      // เหตุผลต้องอยู่บนไทม์ไลน์ ไม่ต้องไปไล่หาในแถวสีแดงใต้ตารางใบเสนอราคา
      expect(rejected.detail).toBe("ราคาสูงเกินงบที่ตั้งไว้");
      expect(rejected.actor).toBeTruthy();

      const titles = res.body.activity.map((a: { title: string }) => a.title);
      expect(titles.some((t: string) => t.includes("ส่งใบเสนอราคา"))).toBe(true);
      expect(titles.some((t: string) => t.includes("สถานะโครงการเปลี่ยนเป็น"))).toBe(true);

      await prisma.user.deleteMany({ where: { email: customer.email } });
    });
  });
});
