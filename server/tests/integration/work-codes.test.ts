import { groupBoqItemsByTopCategory } from "../../src/lib/boq-grouping";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";

describe("BOQ work codes and material catalog codes", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-codes-owner");
    createdUserIds.push(owner.userId);
  });

  afterAll(async () => {
    await prisma.boqItem.deleteMany({ where: { categoryId: { in: createdCategoryIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function createCategory(body: Record<string, unknown>) {
    const res = await owner.agent.post("/api/categories").send(body);
    if (res.status === 201) createdCategoryIds.push(res.body.category.id);
    return res;
  }

  it("assigns the next free letter to a top-level category", async () => {
    const res = await createCategory({ level: "CATEGORY", name: "หมวดรหัสอัตโนมัติ" });

    expect(res.status).toBe(201);
    expect(res.body.category.code).toMatch(/^[A-Z]+$/);
  });

  it("numbers children from the parent's code, one segment per level", async () => {
    const category = await createCategory({ level: "CATEGORY", name: "หมวดลูกหลาน" });
    const parentCode: string = category.body.category.code;

    const firstSub = await createCategory({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยที่หนึ่ง",
    });
    const secondSub = await createCategory({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยที่สอง",
    });

    expect(firstSub.body.category.code).toBe(`${parentCode}-01`);
    expect(secondSub.body.category.code).toBe(`${parentCode}-02`);

    const item = await createCategory({
      level: "ITEM",
      parentId: firstSub.body.category.id,
      name: "รายการที่หนึ่ง",
    });
    expect(item.body.category.code).toBe(`${parentCode}-01-01`);
  });

  it("keeps a code typed in by staff instead of generating one", async () => {
    const res = await createCategory({
      level: "CATEGORY",
      name: "หมวดรหัสกำหนดเอง",
      code: `ZZTEST-${Date.now()}`,
    });

    expect(res.status).toBe(201);
    expect(res.body.category.code).toMatch(/^ZZTEST-/);
  });

  it("rejects a code that is already used by another category", async () => {
    const code = `ZZDUP-${Date.now()}`;
    const first = await createCategory({ level: "CATEGORY", name: "หมวดรหัสซ้ำ 1", code });
    expect(first.status).toBe(201);

    const second = await createCategory({ level: "CATEGORY", name: "หมวดรหัสซ้ำ 2", code });
    expect(second.status).toBe(409);
  });

  it("assigns an incrementing MAT- code to each new material", async () => {
    const category = await createCategory({ level: "CATEGORY", name: "หมวดวัสดุรหัส" });
    const subgroup = await createCategory({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยวัสดุรหัส",
    });
    const item = await createCategory({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการวัสดุรหัส",
    });

    const first = await owner.agent.post("/api/materials").send({
      categoryId: item.body.category.id,
      name: "วัสดุรหัสที่หนึ่ง",
      unit: "ชิ้น",
      materialUnitPrice: 100,
      laborUnitPrice: 20,
    });
    const second = await owner.agent.post("/api/materials").send({
      categoryId: item.body.category.id,
      name: "วัสดุรหัสที่สอง",
      unit: "ชิ้น",
      materialUnitPrice: 200,
      laborUnitPrice: 30,
    });
    createdMaterialIds.push(first.body.material.id, second.body.material.id);

    expect(first.body.material.code).toMatch(/^MAT-\d{4,}$/);
    expect(second.body.material.code).toMatch(/^MAT-\d{4,}$/);

    const firstNo = Number(first.body.material.code.slice(4));
    const secondNo = Number(second.body.material.code.slice(4));
    expect(secondNo).toBe(firstNo + 1);
  });

  it("carries the item's work code through to the quote PDF grouping", async () => {
    const category = await createCategory({ level: "CATEGORY", name: "หมวด BOQ รหัส" });
    const subgroup = await createCategory({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อย BOQ รหัส",
    });
    const item = await createCategory({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการ BOQ รหัส",
    });

    const project = await owner.agent
      .post("/api/projects")
      .send({ name: "โครงการทดสอบรหัส BOQ" });
    createdProjectIds.push(project.body.project.id);

    const boqRes = await owner.agent.post(`/api/projects/${project.body.project.id}/boq/items`).send({
      categoryId: item.body.category.id,
      name: "งานทดสอบรหัส",
      quantity: 2,
      unit: "ชิ้น",
      materialUnitPrice: 500,
      laborUnitPrice: 100,
    });
    expect(boqRes.status).toBe(201);

    const version = await prisma.projectVersion.findFirstOrThrow({
      where: { projectId: project.body.project.id },
      orderBy: { versionNo: "desc" },
    });

    const groups = await groupBoqItemsByTopCategory(version.id);
    expect(groups).toHaveLength(1);
    expect(groups[0].categoryLabel).toBe(category.body.category.code);
    expect(groups[0].items[0].categoryCode).toBe(item.body.category.code);
  });
});
