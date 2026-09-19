import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginOwner } from "../helpers/test-auth";

/**
 * อัตราค่าดำเนินการ+กำไร แก้ได้เฉพาะ OWNER — ทั้ง 3 ทางเข้า:
 * ค่าตั้งต้นในหน้าตั้งค่า · อัตราตอนสร้างโครงการ · แผงแก้อัตรารายโครงการ
 * ADMIN ยังแก้ VAT และส่วนลดได้ตามเดิม
 */
describe("owner-only profit rate", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let itemCategoryId: string;
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCategoryIds: string[] = [];

  // settings เป็นค่ากลางทั้งระบบ — เก็บค่าเดิมทั้งแถว (รวมคนแก้ล่าสุด) แล้วคืนให้ตรงเป๊ะ
  const TOUCHED_KEYS = ["companyName", "overheadProfitPercent", "overheadPercent", "vatPercent"];
  const originalRows = new Map<string, { value: string; updatedById: string | null } | null>();

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-ownerrate-owner");
    admin = await createAndLoginAdmin("test-ownerrate-admin");
    createdUserIds.push(owner.userId, admin.userId);
    for (const key of TOUCHED_KEYS) {
      const row = await prisma.setting.findUnique({ where: { key } });
      originalRows.set(key, row ? { value: row.value, updatedById: row.updatedById } : null);
    }
    // จุดตั้งต้นที่รู้ค่าแน่นอน: รวม 15% แบ่งเป็นค่าดำเนินการ 5% · VAT 7%
    await owner.agent
      .patch("/api/settings")
      .send({ overheadProfitPercent: 15, overheadPercent: 5, vatPercent: 7 });

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบสิทธิ์อัตรา" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบสิทธิ์อัตรา",
    });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการทดสอบสิทธิ์อัตรา",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);
  });

  afterAll(async () => {
    for (const key of TOUCHED_KEYS) {
      const row = originalRows.get(key);
      if (row == null) {
        await prisma.setting.deleteMany({ where: { key } });
      } else {
        await prisma.setting.upsert({
          where: { key },
          update: { value: row.value, updatedById: row.updatedById },
          create: { key, value: row.value, updatedById: row.updatedById },
        });
      }
    }
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function settingRow(key: string) {
    return prisma.setting.findUnique({ where: { key } });
  }

  describe("หน้าตั้งค่า", () => {
    it("ADMIN เปลี่ยนอัตรารวมไม่ได้ (403) และค่าในระบบไม่ขยับ", async () => {
      const res = await admin.agent.patch("/api/settings").send({ overheadProfitPercent: 30 });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("OWNER");
      expect((await settingRow("overheadProfitPercent"))?.value).toBe("15");
    });

    it("ADMIN เปลี่ยน/ล้างการแบ่งค่าดำเนินการไม่ได้เช่นกัน", async () => {
      expect((await admin.agent.patch("/api/settings").send({ overheadPercent: 8 })).status).toBe(403);
      expect((await admin.agent.patch("/api/settings").send({ overheadPercent: null })).status).toBe(403);
      expect((await settingRow("overheadPercent"))?.value).toBe("5");
    });

    it("คำขอที่ปนช่องอื่นถูกปฏิเสธทั้งคำขอ — ไม่บันทึกช่องอื่นไปครึ่ง ๆ", async () => {
      const before = (await settingRow("companyName"))?.value;
      const res = await admin.agent
        .patch("/api/settings")
        .send({ companyName: "ชื่อที่ไม่ควรถูกบันทึก", overheadProfitPercent: 30 });
      expect(res.status).toBe(403);
      expect((await settingRow("companyName"))?.value).toBe(before);
    });

    it("หน้าตั้งค่าส่งทั้งฟอร์มมา — ค่าอัตราที่เท่าเดิมผ่าน และไม่ถูกเขียนทับในชื่อ ADMIN", async () => {
      const res = await admin.agent.patch("/api/settings").send({
        companyName: "บริษัททดสอบสิทธิ์อัตรา",
        overheadProfitPercent: 15,
        overheadPercent: 5,
        vatPercent: 7,
      });
      expect(res.status).toBe(200);
      expect(res.body.settings.companyName).toBe("บริษัททดสอบสิทธิ์อัตรา");
      // แถวอัตราไม่ถูกแตะ — คนแก้ล่าสุดยังเป็น OWNER
      expect((await settingRow("overheadProfitPercent"))?.updatedById).toBe(owner.userId);
      expect((await settingRow("overheadPercent"))?.updatedById).toBe(owner.userId);
    });

    it("ADMIN ยังแก้ VAT ได้", async () => {
      const res = await admin.agent.patch("/api/settings").send({ vatPercent: 7.5 });
      expect(res.status).toBe(200);
      expect(res.body.settings.vatPercent).toBe("7.5");
      await owner.agent.patch("/api/settings").send({ vatPercent: 7 });
    });

    it("OWNER แก้อัตราได้ตามปกติ", async () => {
      const res = await owner.agent
        .patch("/api/settings")
        .send({ overheadProfitPercent: 16, overheadPercent: 6 });
      expect(res.status).toBe(200);
      expect(res.body.settings.overheadProfitPercent).toBe("16");
      await owner.agent.patch("/api/settings").send({ overheadProfitPercent: 15, overheadPercent: 5 });
    });
  });

  describe("สร้างโครงการ", () => {
    it("ADMIN ตั้งอัตราต่างจากค่าบริษัทไม่ได้ และไม่มีโครงการงอกขึ้นมา", async () => {
      const name = `โครงการ ADMIN ตั้งอัตราเอง ${Date.now()}`;
      const res = await admin.agent.post("/api/projects").send({ name, overheadProfitPercent: 25 });
      expect(res.status).toBe(403);
      expect(await prisma.project.count({ where: { name } })).toBe(0);
    });

    it("ADMIN สร้างโดยไม่ระบุอัตรา หรือระบุเท่าค่าบริษัท ได้", async () => {
      for (const body of [{}, { overheadProfitPercent: 15 }]) {
        const res = await admin.agent
          .post("/api/projects")
          .send({ name: `โครงการ ADMIN ${Date.now()}`, ...body });
        expect(res.status).toBe(201);
        createdProjectIds.push(res.body.project.id);
      }
    });

    it("OWNER ตั้งอัตราเองตอนสร้างได้", async () => {
      const res = await owner.agent
        .post("/api/projects")
        .send({ name: `โครงการ OWNER ${Date.now()}`, overheadProfitPercent: 25 });
      expect(res.status).toBe(201);
      createdProjectIds.push(res.body.project.id);
      const version = await prisma.projectVersion.findFirstOrThrow({
        where: { projectId: res.body.project.id },
      });
      expect(Number(version.overheadProfitPct)).toBe(25);
    });
  });

  describe("แผงแก้อัตรารายโครงการ", () => {
    async function projectWithSentQuote() {
      const res = await owner.agent.post("/api/projects").send({ name: `อัตรา ${Date.now()}` });
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
      // ส่งใบเสนอราคาแล้ว = แก้อัตราครั้งถัดไปจะโคลนเวอร์ชันใหม่ ใช้ดูว่าคำขอที่ถูกปฏิเสธไม่ทิ้งเวอร์ชันขยะ
      const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`);
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${quote.body.quote.id}/transition`)
        .send({ toStatus: "SENT" });
      return projectId;
    }

    it("ADMIN เปลี่ยนอัตรารวมไม่ได้ และไม่มีเวอร์ชันใหม่ถูกโคลนทิ้งไว้", async () => {
      const projectId = await projectWithSentQuote();
      const versionsBefore = await prisma.projectVersion.count({ where: { projectId } });
      const res = await admin.agent
        .patch(`/api/projects/${projectId}/rates`)
        .send({ overheadProfitPercent: 30 });
      expect(res.status).toBe(403);
      expect(await prisma.projectVersion.count({ where: { projectId } })).toBe(versionsBefore);
    });

    it("ADMIN แก้การแบ่งค่าดำเนินการไม่ได้", async () => {
      const projectId = await projectWithSentQuote();
      const res = await admin.agent
        .patch(`/api/projects/${projectId}/rates`)
        .send({ overheadPercent: 10 });
      expect(res.status).toBe(403);
    });

    it("ADMIN ยังแก้ VAT และส่วนลดได้ (ส่งอัตรารวมค่าเดิมปนมาก็ผ่าน)", async () => {
      const projectId = await projectWithSentQuote();
      const res = await admin.agent.patch(`/api/projects/${projectId}/rates`).send({
        overheadProfitPercent: 15,
        vatPercent: 7,
        discount: { mode: "AMOUNT", value: 50 },
      });
      expect(res.status).toBe(200);
      expect(Number(res.body.version.discountAmt)).toBe(50);
      expect(Number(res.body.version.overheadProfitPct)).toBe(15);
    });

    it("OWNER แก้อัตรารวมได้", async () => {
      const projectId = await projectWithSentQuote();
      const res = await owner.agent
        .patch(`/api/projects/${projectId}/rates`)
        .send({ overheadProfitPercent: 20 });
      expect(res.status).toBe(200);
      expect(Number(res.body.version.overheadProfitPct)).toBe(20);
    });
  });
});
