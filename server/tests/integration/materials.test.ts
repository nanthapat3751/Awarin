import { prisma } from "../../src/lib/prisma";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";

describe("materials module", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  let subgroupCategoryId: string;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-materials-owner");
    createdUserIds.push(owner.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดสำหรับทดสอบวัสดุ" });
    createdCategoryIds.push(category.body.category.id);

    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยสำหรับทดสอบวัสดุ",
    });
    subgroupCategoryId = subgroup.body.category.id;
    createdCategoryIds.push(subgroupCategoryId);

    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroupCategoryId,
      name: "รายการสำหรับทดสอบวัสดุ",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);
  });

  afterAll(async () => {
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  // Reference rates from a real BOQ: เข็มตอก I 22 L 24, material 7,500/ต้น, labor 1,500/ต้น
  it("creates a material with combined material+labor rates under an ITEM category", async () => {
    const res = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "เข็มตอก I 22 L 24",
      unit: "ต้น",
      materialUnitPrice: 7500,
      laborUnitPrice: 1500,
    });

    expect(res.status).toBe(201);
    expect(res.body.material.materialUnitPrice).toBe("7500");
    expect(res.body.material.laborUnitPrice).toBe("1500");
    createdMaterialIds.push(res.body.material.id);
  });

  it("rejects attaching a material to a non-ITEM category", async () => {
    const res = await owner.agent.post("/api/materials").send({
      categoryId: subgroupCategoryId,
      name: "ผิดระดับ",
      unit: "หน่วย",
      materialUnitPrice: 100,
      laborUnitPrice: 0,
    });
    expect(res.status).toBe(400);
  });

  it("allows a material with no category (ad-hoc catalog entry)", async () => {
    const res = await owner.agent.post("/api/materials").send({
      name: "รายการอื่นๆ",
      unit: "เหมา",
      materialUnitPrice: 12000,
      laborUnitPrice: 0,
    });
    expect(res.status).toBe(201);
    createdMaterialIds.push(res.body.material.id);
  });

  it("updates rates on an existing material", async () => {
    const created = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "รายการจะแก้ไขราคา",
      unit: "หน่วย",
      materialUnitPrice: 100,
      laborUnitPrice: 50,
    });
    createdMaterialIds.push(created.body.material.id);

    const updateRes = await owner.agent
      .patch(`/api/materials/${created.body.material.id}`)
      .send({ materialUnitPrice: 200, laborUnitPrice: 75 });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.material.materialUnitPrice).toBe("200");
    expect(updateRes.body.material.laborUnitPrice).toBe("75");
  });

  it("filters materials by categoryId", async () => {
    const res = await owner.agent.get(`/api/materials?categoryId=${itemCategoryId}`);
    expect(res.status).toBe(200);
    expect(
      res.body.materials.every((m: { categoryId: string | null }) => m.categoryId === itemCategoryId),
    ).toBe(true);
  });

  it("deletes a material not referenced by any BOQ line", async () => {
    const created = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "รายการจะลบ",
      unit: "หน่วย",
      materialUnitPrice: 10,
      laborUnitPrice: 0,
    });

    const deleteRes = await owner.agent.delete(`/api/materials/${created.body.material.id}`);
    expect(deleteRes.status).toBe(204);
  });

  it("rejects a CUSTOMER creating a material", async () => {
    const customer = await createAndLoginCustomer("test-materials-customer");
    const res = await customer.agent.post("/api/materials").send({
      name: "ห้ามสร้าง",
      unit: "หน่วย",
      materialUnitPrice: 1,
      laborUnitPrice: 0,
    });
    expect(res.status).toBe(403);

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });
});
