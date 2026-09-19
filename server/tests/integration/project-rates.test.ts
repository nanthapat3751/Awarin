import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";

/**
 * PATCH /api/projects/:id/rates — แก้อัตราค่าดำเนินการ+กำไร / VAT ของโครงการที่สร้างไปแล้ว
 *
 * ก่อนหน้านี้ทั้งสองค่าตั้งได้ครั้งเดียวตอนสร้างโครงการ (VAT ตั้งไม่ได้ด้วยซ้ำ — บังคับใช้ค่าจาก
 * หน้าตั้งค่า) แก้ทีหลังไม่ได้เลย
 */
describe("project rates", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCategoryIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-rates-owner");
    createdUserIds.push(owner.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบอัตรา" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบอัตรา",
    });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการทดสอบอัตรา",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);
  });

  afterAll(async () => {
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  /** โครงการที่มีบรรทัด BOQ หนึ่งบรรทัด ต้นทุนตรง = 1,000 */
  async function projectWithOneLine(name: string) {
    const res = await owner.agent.post("/api/projects").send({ name });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);
    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "รายการทดสอบ",
      quantity: 10,
      unit: "หน่วย",
      materialUnitPrice: 60,
      laborUnitPrice: 40,
    });
    return projectId;
  }

  it("แก้อัตราค่าดำเนินการ+กำไรแล้วราคาสุทธิถูกคิดใหม่ทั้งชุด", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบอัตรา 1");

    // ตั้งต้น 10% + VAT 7% → 1000 + 100 = 1100, VAT 77 → 1177
    const before = await owner.agent.get(`/api/projects/${projectId}`);
    expect(Number(before.body.currentVersion.directCost)).toBe(1000);
    expect(Number(before.body.currentVersion.netPrice)).toBe(1177);

    const res = await owner.agent
      .patch(`/api/projects/${projectId}/rates`)
      .send({ overheadProfitPercent: 20 });

    expect(res.status).toBe(200);
    // 1000 + 200 = 1200, VAT 7% = 84 → 1284
    expect(Number(res.body.version.overheadProfitPct)).toBe(20);
    expect(Number(res.body.version.overheadProfitAmt)).toBe(200);
    expect(Number(res.body.version.vatAmt)).toBe(84);
    expect(Number(res.body.version.netPrice)).toBe(1284);
    // ต้นทุนตรงต้องไม่ขยับ — อัตราไม่เกี่ยวกับบรรทัด BOQ
    expect(Number(res.body.version.directCost)).toBe(1000);
  });

  it("แก้ VAT ได้ และแก้พร้อมกันสองค่าก็ได้", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบอัตรา 2");

    const vatOnly = await owner.agent
      .patch(`/api/projects/${projectId}/rates`)
      .send({ vatPercent: 0 });
    expect(vatOnly.status).toBe(200);
    expect(Number(vatOnly.body.version.vatAmt)).toBe(0);
    expect(Number(vatOnly.body.version.netPrice)).toBe(1100);
    // ค่าที่ไม่ได้ส่งมาต้องคงเดิม
    expect(Number(vatOnly.body.version.overheadProfitPct)).toBe(10);

    const both = await owner.agent
      .patch(`/api/projects/${projectId}/rates`)
      .send({ overheadProfitPercent: 0, vatPercent: 7 });
    expect(both.status).toBe(200);
    expect(Number(both.body.version.overheadProfitAmt)).toBe(0);
    expect(Number(both.body.version.netPrice)).toBe(1070);
  });

  it("ราคา/ตร.ม. ถูกคิดใหม่ตามอัตราใหม่ด้วย", async () => {
    const res = await owner.agent
      .post("/api/projects")
      .send({ name: "โครงการทดสอบอัตรา 3", areaSqm: 100 });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);
    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "รายการทดสอบ",
      quantity: 10,
      unit: "หน่วย",
      materialUnitPrice: 60,
      laborUnitPrice: 40,
    });

    const updated = await owner.agent
      .patch(`/api/projects/${projectId}/rates`)
      .send({ overheadProfitPercent: 20 });
    expect(Number(updated.body.version.pricePerSqm)).toBe(12.84); // 1284 / 100
  });

  it("BR-07: เวอร์ชันที่ส่งใบเสนอราคาไปแล้ว ต้องถูก clone เป็นเวอร์ชันใหม่ ไม่ใช่แก้ทับ", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบอัตรา 4");
    const detail = await owner.agent.get(`/api/projects/${projectId}`);
    const versionOneId = detail.body.currentVersion.id as string;

    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await owner.agent
      .post(`/api/projects/${projectId}/quotes/${quote.body.quote.id}/transition`)
      .send({ toStatus: "SENT" });

    const res = await owner.agent
      .patch(`/api/projects/${projectId}/rates`)
      .send({ overheadProfitPercent: 25 });

    expect(res.status).toBe(200);
    expect(res.body.version.id).not.toBe(versionOneId);
    expect(res.body.version.versionNo).toBe(2);

    // เวอร์ชันที่ส่งให้ลูกค้าไปแล้วต้องไม่ถูกแตะ — ราคาในมือลูกค้าห้ามเปลี่ยนย้อนหลัง
    const frozen = await prisma.projectVersion.findUniqueOrThrow({ where: { id: versionOneId } });
    expect(Number(frozen.overheadProfitPct)).toBe(10);
    expect(Number(frozen.netPrice)).toBe(1177);
  });

  it("โครงการกำหนดเอง: แก้ VAT ได้ แต่แก้ค่าดำเนินการ+กำไรไม่ได้", async () => {
    const res = await owner.agent
      .post("/api/projects")
      .send({ name: "โครงการทดสอบอัตรา 5", type: "CUSTOM" });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);
    await owner.agent
      .post(`/api/projects/${projectId}/custom-price`)
      .send({ subtotalBeforeVat: 2000 });

    const blocked = await owner.agent
      .patch(`/api/projects/${projectId}/rates`)
      .send({ overheadProfitPercent: 15 });
    expect(blocked.status).toBe(409);

    const vat = await owner.agent.patch(`/api/projects/${projectId}/rates`).send({ vatPercent: 10 });
    expect(vat.status).toBe(200);
    // ยอดก่อน VAT ที่พนักงานกรอกไว้ต้องไม่ถูกล้าง แค่ VAT คิดใหม่
    expect(Number(vat.body.version.directCost)).toBe(2000);
    expect(Number(vat.body.version.vatAmt)).toBe(200);
    expect(Number(vat.body.version.netPrice)).toBe(2200);
    expect(Number(vat.body.version.overheadProfitPct)).toBe(0);
  });

  it("ปฏิเสธค่าที่ไม่ถูกต้องและคำขอเปล่า", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบอัตรา 6");

    for (const body of [
      {},
      { overheadProfitPercent: -1 },
      { overheadProfitPercent: 101 },
      { vatPercent: -5 },
    ]) {
      const res = await owner.agent.patch(`/api/projects/${projectId}/rates`).send(body);
      expect(res.status).toBe(400);
    }

    // ของเดิมต้องไม่ถูกแตะเลยหลังคำขอที่ถูกปฏิเสธ
    const after = await owner.agent.get(`/api/projects/${projectId}`);
    expect(Number(after.body.currentVersion.overheadProfitPct)).toBe(10);
    expect(Number(after.body.currentVersion.netPrice)).toBe(1177);
  });

  it("โครงการที่อยู่ในถังขยะแก้อัตราไม่ได้", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบอัตรา 7");
    await owner.agent.delete(`/api/projects/${projectId}`);

    const res = await owner.agent
      .patch(`/api/projects/${projectId}/rates`)
      .send({ vatPercent: 0 });
    expect(res.status).toBe(404);
  });

  it("บันทึกลง AuditLog พร้อมค่าก่อน/หลัง", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบอัตรา 8");
    await owner.agent.patch(`/api/projects/${projectId}/rates`).send({ overheadProfitPercent: 12 });

    const detail = await owner.agent.get(`/api/projects/${projectId}`);
    const log = await prisma.auditLog.findFirst({
      where: { action: "UPDATE_VERSION_RATES", entityId: detail.body.currentVersion.id },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    const details = log!.details as { before?: { overheadProfitPct?: number }; after?: { overheadProfitPct?: number } };
    expect(details.before?.overheadProfitPct).toBe(10);
    expect(details.after?.overheadProfitPct).toBe(12);

    // ต้องขึ้นไทม์ไลน์ของโครงการด้วย ไม่ใช่ซ่อนอยู่ใน AuditLog อย่างเดียว
    const activity = await owner.agent.get(`/api/projects/${projectId}/activity`);
    expect(
      (activity.body.activity as { title: string }[]).some((a) => a.title.includes("แก้อัตรา")),
    ).toBe(true);
  });

  // ==========================================================================
  // แยก "ค่าดำเนินการ" ออกจาก "กำไร"
  //
  // กฎเหล็กของงานนี้: การแบ่งเป็นข้อมูลประกอบ **ห้ามทำให้ยอดเงินใด ๆ เปลี่ยน** เพราะเอกสาร
  // ที่ออกไปแล้วอ้างยอดเดิมอยู่ — อัตรารวมยังเป็นตัวเดียวที่คุมราคาเหมือนเดิมทุกอย่าง
  // ==========================================================================

  describe("แยกค่าดำเนินการกับกำไร", () => {
    it("ตั้งการแบ่งแล้วยอดเงินทุกช่องต้องเท่าเดิมเป๊ะ ๆ", async () => {
      const projectId = await projectWithOneLine("โครงการทดสอบการแบ่ง 1");
      const before = await owner.agent.get(`/api/projects/${projectId}`);
      const v0 = before.body.currentVersion;

      const res = await owner.agent
        .patch(`/api/projects/${projectId}/rates`)
        .send({ overheadPercent: 4 })
        .expect(200);

      expect(Number(res.body.version.overheadPct)).toBe(4);
      // ทุกยอดต้องไม่ขยับแม้แต่สตางค์เดียว
      expect(res.body.version.directCost).toBe(v0.directCost);
      expect(res.body.version.overheadProfitPct).toBe(v0.overheadProfitPct);
      expect(res.body.version.overheadProfitAmt).toBe(v0.overheadProfitAmt);
      expect(res.body.version.vatAmt).toBe(v0.vatAmt);
      expect(res.body.version.netPrice).toBe(v0.netPrice);
    });

    it("ค่าดำเนินการมากกว่าอัตรารวมไม่ได้ — ทั้งตอนส่งมาพร้อมกันและตอนลดอัตรารวมทีหลัง", async () => {
      const projectId = await projectWithOneLine("โครงการทดสอบการแบ่ง 2");

      const together = await owner.agent
        .patch(`/api/projects/${projectId}/rates`)
        .send({ overheadProfitPercent: 5, overheadPercent: 8 });
      expect(together.status).toBe(400);

      await owner.agent
        .patch(`/api/projects/${projectId}/rates`)
        .send({ overheadProfitPercent: 10, overheadPercent: 8 })
        .expect(200);

      // ลดอัตรารวมลงต่ำกว่าค่าดำเนินการที่ตั้งไว้ = กำไรติดลบ ต้องถูกปฏิเสธเหมือนกัน
      const later = await owner.agent
        .patch(`/api/projects/${projectId}/rates`)
        .send({ overheadProfitPercent: 6 });
      expect(later.status).toBe(400);
    });

    it("ล้างการแบ่งได้ โดยอัตรารวมและราคาคงเดิม", async () => {
      const projectId = await projectWithOneLine("โครงการทดสอบการแบ่ง 3");
      await owner.agent
        .patch(`/api/projects/${projectId}/rates`)
        .send({ overheadPercent: 4 })
        .expect(200);

      const res = await owner.agent
        .patch(`/api/projects/${projectId}/rates`)
        .send({ overheadPercent: null })
        .expect(200);

      expect(res.body.version.overheadPct).toBeNull();
      expect(Number(res.body.version.overheadProfitPct)).toBe(10);
    });

    it("การแบ่งต้องติดไปกับเวอร์ชันใหม่ตอนถูก clone (เหมือนส่วนลด)", async () => {
      const projectId = await projectWithOneLine("โครงการทดสอบการแบ่ง 4");
      await owner.agent
        .patch(`/api/projects/${projectId}/rates`)
        .send({ overheadPercent: 4 })
        .expect(200);

      // ส่งใบเสนอราคา → เวอร์ชันถูกล็อก → แก้ BOQ จะ clone เป็นเวอร์ชันใหม่
      const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${quote.body.quote.id}/transition`)
        .send({ toStatus: "SENT" })
        .expect(200);

      await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
        categoryId: itemCategoryId,
        name: "รายการเพิ่ม",
        quantity: 1,
        unit: "หน่วย",
        materialUnitPrice: 100,
        laborUnitPrice: 0,
      });

      const detail = await owner.agent.get(`/api/projects/${projectId}`);
      expect(detail.body.currentVersion.versionNo).toBe(2);
      // ถ้าไม่ copy ไป การแบ่งจะหายเงียบ ๆ พร้อมกับกำไรที่เคยเห็น
      expect(Number(detail.body.currentVersion.overheadPct)).toBe(4);
    });

    it("โครงการกำหนดเองแบ่งไม่ได้ (ไม่มีก้อนค่าดำเนินการ+กำไรให้แบ่ง)", async () => {
      const res = await owner.agent
        .post("/api/projects")
        .send({ name: "โครงการกำหนดเองทดสอบการแบ่ง", type: "CUSTOM" });
      const projectId = res.body.project.id as string;
      createdProjectIds.push(projectId);

      const patched = await owner.agent
        .patch(`/api/projects/${projectId}/rates`)
        .send({ overheadPercent: 4 });
      expect(patched.status).toBe(409);
    });

    it("ไทม์ไลน์บอกว่าการแบ่งเปลี่ยนไปยังไง", async () => {
      const projectId = await projectWithOneLine("โครงการทดสอบการแบ่ง 5");
      await owner.agent
        .patch(`/api/projects/${projectId}/rates`)
        .send({ overheadPercent: 4 })
        .expect(200);

      const activity = await owner.agent.get(`/api/projects/${projectId}/activity`);
      const rows = activity.body.activity as { title: string; detail: string | null }[];
      const row = rows.find((a) => a.detail?.includes("ค่าดำเนินการ 4%"));
      expect(row).toBeDefined();
      expect(row!.detail).toContain("กำไร 6%");
      expect(row!.detail).toContain("ยังไม่ได้แยก");
    });

    it("โครงการใหม่รับการแบ่งจากหน้าตั้งค่ามาเป็นค่าเริ่มต้น", async () => {
      await owner.agent
        .patch("/api/settings")
        .send({ overheadProfitPercent: 10, overheadPercent: 4 })
        .expect(200);
      try {
        const res = await owner.agent
          .post("/api/projects")
          .send({ name: "โครงการทดสอบการแบ่ง 6" });
        createdProjectIds.push(res.body.project.id);
        const detail = await owner.agent.get(`/api/projects/${res.body.project.id}`);
        expect(Number(detail.body.currentVersion.overheadPct)).toBe(4);

        // แต่ถ้าคนสร้างกำหนดอัตรารวมเองเป็นค่าอื่น เราไม่รู้ว่าส่วนที่ต่างไปอยู่ตรงไหน
        // → ปล่อยเป็น "ยังไม่ได้แยก" ดีกว่าเดาแทนเขา
        const custom = await owner.agent
          .post("/api/projects")
          .send({ name: "โครงการทดสอบการแบ่ง 7", overheadProfitPercent: 15 });
        createdProjectIds.push(custom.body.project.id);
        const customDetail = await owner.agent.get(`/api/projects/${custom.body.project.id}`);
        expect(customDetail.body.currentVersion.overheadPct).toBeNull();
      } finally {
        await owner.agent.patch("/api/settings").send({ overheadPercent: null });
      }
    });

    it("หน้าตั้งค่า: ค่าดำเนินการมากกว่าอัตรารวมไม่ได้", async () => {
      const res = await owner.agent
        .patch("/api/settings")
        .send({ overheadProfitPercent: 10, overheadPercent: 12 });
      expect(res.status).toBe(400);
    });
  });
});
