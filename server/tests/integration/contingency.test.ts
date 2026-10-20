import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginOwner } from "../helpers/test-auth";

/**
 * ค่าเผื่อเหลือเผื่อขาดผ่าน API แก้อัตรา (ย้ายมาจากเทสต์ Factor F เดิมตอนถอดโหมดราคากลางออก 14 ต.ค. 2026)
 */
describe("contingency (ค่าเผื่อเหลือเผื่อขาด)", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let itemCategoryId: string;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-contingency-owner");
    admin = await createAndLoginAdmin("test-contingency-admin");
    createdUserIds.push(owner.userId, admin.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบค่าเผื่อ" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบค่าเผื่อ",
    });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "งานทดสอบค่าเผื่อ",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);
  });

  afterAll(async () => {
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    // ลบจากลูกขึ้นแม่ — หมวดแม่ลบก่อนลูกจะติด FK
    for (const id of [...createdCategoryIds].reverse()) {
      await prisma.workCategory.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  /** โครงการที่มีบรรทัด BOQ เดียว ยอด = amount บาทถ้วน */
  async function projectWorth(name: string, amount: number) {
    const res = await owner.agent.post("/api/projects").send({ name });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);
    const added = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "งานเหมารวม",
      unit: "งาน",
      quantity: 1,
      materialUnitPrice: amount,
      laborUnitPrice: 0,
    });
    expect(added.status).toBe(201);
    return projectId;
  }

  it("บวกเข้าต้นทุนก่อนคิดกำไร", async () => {
    const projectId = await projectWorth("เผื่อเหลือเผื่อขาด", 1_000_000);
    const res = await owner.agent.patch(`/api/projects/${projectId}/rates`).send({ contingencyPercent: 3 });

    expect(res.status).toBe(200);
    expect(Number(res.body.version.contingencyAmt)).toBe(30_000);
    expect(Number(res.body.version.overheadProfitAmt)).toBe(103_000);
    expect(Number(res.body.version.netPrice)).toBe(1_212_310);
  });

  it("ADMIN เปลี่ยนค่าเผื่อไม่ได้ (ระดับเดียวกับอัตรากำไร) แต่ VAT ยังแก้ได้", async () => {
    const projectId = await projectWorth("ค่าเผื่อสิทธิ์แอดมิน", 1_000_000);
    expect(
      (await admin.agent.patch(`/api/projects/${projectId}/rates`).send({ contingencyPercent: 5 })).status,
    ).toBe(403);
    expect((await admin.agent.patch(`/api/projects/${projectId}/rates`).send({ vatPercent: 0 })).status).toBe(200);
  });

  it("ช่องโหมดราคากลางเดิมถูกถอดแล้ว — ส่งมาอย่างเดียวถือว่าไม่ได้แก้อะไร", async () => {
    const projectId = await projectWorth("ส่งโหมดเก่ามา", 1_000_000);
    const res = await owner.agent.patch(`/api/projects/${projectId}/rates`).send({ pricingMode: "FACTOR_F" });
    expect(res.status).toBe(400);
  });
});
