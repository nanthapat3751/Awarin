import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";

/** ปุ่ม "เพิ่มหลายรายการ" — POST /boq/items/batch */
describe("BOQ batch add", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let itemCategoryId: string;
  let subgroupId: string;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdMaterialIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-boqbatch-owner");
    customer = await createCustomerDirect("test-boqbatch-customer");
    createdUserIds.push(owner.userId, customer.userId);
    const cat = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบเพิ่มหลาย" });
    const sub = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: cat.body.category.id, name: "กลุ่มทดสอบเพิ่มหลาย" });
    const it = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: sub.body.category.id, name: "รายการทดสอบเพิ่มหลาย" });
    itemCategoryId = it.body.category.id;
    subgroupId = sub.body.category.id;
    createdCategoryIds.push(cat.body.category.id, subgroupId, itemCategoryId);

    for (const [name, unit, price] of [
      ["อิฐทดสอบ", "ก้อน", 1.2],
      ["ปูนทดสอบ", "ถุง", 120],
    ] as const) {
      const m = await prisma.material.create({
        data: { name, unit, materialUnitPrice: price, laborUnitPrice: 5, categoryId: itemCategoryId },
      });
      createdMaterialIds.push(m.id);
    }
  });

  afterAll(async () => {
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    for (const id of [...createdCategoryIds].reverse()) await prisma.workCategory.deleteMany({ where: { id } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function newProject() {
    const res = await owner.agent.post("/api/projects").send({ name: `เพิ่มหลาย ${Date.now()}`, customerId: customer.userId });
    createdProjectIds.push(res.body.project.id);
    return res.body.project.id as string;
  }

  it("adds every line in order with catalog prices and recalculates the version once per line", async () => {
    const projectId = await newProject();
    const res = await owner.agent.post(`/api/projects/${projectId}/boq/items/batch`).send({
      items: [
        { categoryId: itemCategoryId, materialId: createdMaterialIds[0], quantity: 1000 },
        { categoryId: itemCategoryId, materialId: createdMaterialIds[1], quantity: 10, laborUnitPrice: 30 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);

    const items = await prisma.boqItem.findMany({
      where: { projectVersion: { projectId } },
      orderBy: { sortOrder: "asc" },
    });
    expect(items.map((i) => [i.name, Number(i.quantity), Number(i.laborUnitPrice)])).toEqual([
      ["อิฐทดสอบ", 1000, 5],
      ["ปูนทดสอบ", 10, 30],
    ]);
    // 1000×(1.2+5) + 10×(120+30) = 6,200 + 1,500
    expect(Number(res.body.version.directCost)).toBe(7700);
  });

  it("writes nothing when any line is invalid", async () => {
    const projectId = await newProject();
    const res = await owner.agent.post(`/api/projects/${projectId}/boq/items/batch`).send({
      items: [
        { categoryId: itemCategoryId, materialId: createdMaterialIds[0], quantity: 5 },
        // หมวดระดับกลุ่ม ไม่ใช่ ITEM
        { categoryId: subgroupId, materialId: createdMaterialIds[1], quantity: 5 },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^รายการที่ 2:/);
    expect(await prisma.boqItem.count({ where: { projectVersion: { projectId } } })).toBe(0);
  });

  it("rejects an empty batch and a line without a quantity", async () => {
    const projectId = await newProject();
    const empty = await owner.agent.post(`/api/projects/${projectId}/boq/items/batch`).send({ items: [] });
    expect(empty.status).toBe(400);
    const noQty = await owner.agent
      .post(`/api/projects/${projectId}/boq/items/batch`)
      .send({ items: [{ categoryId: itemCategoryId, materialId: createdMaterialIds[0] }] });
    expect(noQty.status).toBe(400);
  });
});
