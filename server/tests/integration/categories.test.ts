import { prisma } from "../../src/lib/prisma";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";

describe("categories module", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-categories-owner");
    createdUserIds.push(owner.userId);
  });

  afterAll(async () => {
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("creates a CATEGORY-level node with no parent", async () => {
    const res = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", code: "T", name: "หมวดทดสอบ", sortOrder: 99 });

    expect(res.status).toBe(201);
    expect(res.body.category.level).toBe("CATEGORY");
    createdCategoryIds.push(res.body.category.id);
  });

  it("rejects a SUBGROUP with no parentId", async () => {
    const res = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", name: "กลุ่มงานย่อยทดสอบ" });

    expect(res.status).toBe(400);
  });

  it("rejects a SUBGROUP whose parent is not a CATEGORY", async () => {
    const categoryRes = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดแม่ทดสอบ" });
    createdCategoryIds.push(categoryRes.body.category.id);

    const subgroupRes = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: categoryRes.body.category.id, name: "กลุ่มงานย่อย A" });
    expect(subgroupRes.status).toBe(201);
    createdCategoryIds.push(subgroupRes.body.category.id);

    // parent ของ SUBGROUP ต้องเป็น CATEGORY ไม่ใช่ SUBGROUP อีกตัว
    const invalidRes = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: subgroupRes.body.category.id, name: "กลุ่มงานย่อยผิดระดับ" });
    expect(invalidRes.status).toBe(400);
  });

  it("builds a full 3-level chain and lists it", async () => {
    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวด 3 ระดับ" });
    createdCategoryIds.push(category.body.category.id);

    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อย 3 ระดับ",
    });
    createdCategoryIds.push(subgroup.body.category.id);

    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการ 3 ระดับ",
    });
    expect(item.status).toBe(201);
    createdCategoryIds.push(item.body.category.id);

    const listRes = await owner.agent.get("/api/categories");
    const ids = listRes.body.categories.map((c: { id: string }) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([category.body.category.id, subgroup.body.category.id, item.body.category.id]),
    );
  });

  it("updates a category name", async () => {
    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "ชื่อเดิม" });
    createdCategoryIds.push(category.body.category.id);

    const updateRes = await owner.agent
      .patch(`/api/categories/${category.body.category.id}`)
      .send({ name: "ชื่อใหม่" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.category.name).toBe("ชื่อใหม่");
  });

  it("refuses to delete a category that still has children", async () => {
    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดมีลูก" });
    createdCategoryIds.push(category.body.category.id);

    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "ลูกของหมวดมีลูก",
    });
    createdCategoryIds.push(subgroup.body.category.id);

    const deleteRes = await owner.agent.delete(`/api/categories/${category.body.category.id}`);
    expect(deleteRes.status).toBe(409);
  });

  it("deletes a leaf category with no children", async () => {
    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดลบได้" });

    const deleteRes = await owner.agent.delete(`/api/categories/${category.body.category.id}`);
    expect(deleteRes.status).toBe(204);
  });

  it("places a new node after its existing siblings instead of at the front", async () => {
    const parent = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดลำดับ" });
    createdCategoryIds.push(parent.body.category.id);

    const first = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: parent.body.category.id,
      name: "กลุ่มแรก",
    });
    const second = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: parent.body.category.id,
      name: "กลุ่มที่สอง",
    });
    const third = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: parent.body.category.id,
      name: "กลุ่มที่สาม",
    });
    createdCategoryIds.push(
      first.body.category.id,
      second.body.category.id,
      third.body.category.id,
    );

    expect(second.body.category.sortOrder).toBeGreaterThan(first.body.category.sortOrder);
    expect(third.body.category.sortOrder).toBeGreaterThan(second.body.category.sortOrder);

    // And a brand-new top-level หมวดงาน must land after the seeded A-F, not before them.
    const seededLast = await prisma.workCategory.findFirst({
      where: { level: "CATEGORY", id: { not: parent.body.category.id } },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    expect(parent.body.category.sortOrder).toBeGreaterThanOrEqual(seededLast!.sortOrder);
  });

  it("rejects a CUSTOMER creating a category", async () => {
    const customer = await createAndLoginCustomer("test-categories-customer");
    const res = await customer.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "ห้ามสร้าง" });
    expect(res.status).toBe(403);

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });
});
