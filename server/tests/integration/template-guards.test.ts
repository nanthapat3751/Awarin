import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";

/**
 * แม่แบบ BOQ ในสภาพที่ไม่สมบูรณ์ — หมวดงานที่บรรทัดอ้างถูกลบไปแล้ว · บรรทัดที่ไม่มีอยู่ ·
 * โครงการที่มี BOQ อยู่แล้ว — ระบบต้องแสดง/ปฏิเสธอย่างมีเหตุผล ไม่ใช่ล้มหรือทำข้อมูลปนกันเงียบ ๆ
 */
describe("template guards", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  const templateIds: string[] = [];
  const projectIds: string[] = [];
  const categoryIds: string[] = [];
  let itemCategoryId: string;

  const line = (categoryId: string, name: string) => ({
    categoryId,
    materialId: null,
    name,
    unit: "งาน",
    materialUnitPrice: 100,
    laborUnitPrice: 50,
    quantity: 2,
    note: null,
  });

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-template-guards");
    const cat = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: `หมวดแม่แบบ ${Date.now()}` });
    const sub = await owner.agent.post("/api/categories").send({ level: "SUBGROUP", parentId: cat.body.category.id, name: "กลุ่มแม่แบบ" });
    const item = await owner.agent.post("/api/categories").send({ level: "ITEM", parentId: sub.body.category.id, name: "งานแม่แบบ" });
    itemCategoryId = item.body.category.id;
    categoryIds.push(cat.body.category.id, sub.body.category.id, itemCategoryId);
  });

  afterAll(async () => {
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: [...categoryIds].reverse() } } });
    await prisma.session.deleteMany({ where: { userId: owner.userId } });
    await prisma.user.deleteMany({ where: { id: owner.userId } });
    await prisma.$disconnect();
  });

  async function template(structure: object[]) {
    const t = await prisma.template.create({ data: { name: `แม่แบบทดสอบ ${templateIds.length}`, structure } });
    templateIds.push(t.id);
    return t.id;
  }

  async function project(name: string) {
    const res = await owner.agent.post("/api/projects").send({ name });
    projectIds.push(res.body.project.id);
    return res.body.project.id as string;
  }

  it("shows lines whose category no longer exists under 'ไม่ระบุหมวด'", async () => {
    const id = await template([line("deleted-category", "บรรทัดกำพร้า"), line(itemCategoryId, "บรรทัดปกติ")]);
    const res = await owner.agent.get(`/api/templates/${id}`);
    expect(res.status).toBe(200);
    const [orphan, normal] = res.body.template.items;
    expect(orphan).toMatchObject({ name: "บรรทัดกำพร้า", categoryName: "ไม่ระบุหมวด", topCategoryName: "ไม่ระบุหมวด" });
    expect(normal).toMatchObject({ name: "บรรทัดปกติ", categoryName: "งานแม่แบบ" });
  });

  it("renames a template and clears its description", async () => {
    const id = await template([line(itemCategoryId, "x")]);
    const res = await owner.agent.patch(`/api/templates/${id}`).send({ name: "ชื่อใหม่", description: null });
    expect(res.status).toBe(200);
    expect(res.body.template).toMatchObject({ name: "ชื่อใหม่", description: null });
  });

  it("404s editing a line index that is not in the template", async () => {
    const id = await template([line(itemCategoryId, "บรรทัดเดียว")]);
    for (const index of [1, 99]) {
      const res = await owner.agent.patch(`/api/templates/${id}/items/${index}`).send({ qtyBasis: "MANUAL", quantity: 3 });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("ไม่พบรายการที่ระบุในแม่แบบ");
    }
    expect((await owner.agent.patch("/api/templates/no-such/items/0").send({ qtyBasis: "MANUAL", quantity: 3 })).status).toBe(404);
  });

  it("refuses to apply a template whose every line points at a deleted category", async () => {
    const id = await template([line("gone-1", "a"), line("gone-2", "b")]);
    const projectId = await project("โครงการรับแม่แบบเสีย");
    const res = await owner.agent.post(`/api/projects/${projectId}/templates/apply`).send({ templateId: id });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("ไม่สามารถใช้แม่แบบนี้ได้ (ข้อมูลอ้างอิงในแม่แบบไม่พบในระบบแล้วทั้งหมด)");
  });

  it("applies the usable lines, skips the broken ones, and refuses a second apply onto a filled BOQ", async () => {
    const id = await template([line(itemCategoryId, "ใช้ได้"), line("gone", "ใช้ไม่ได้")]);
    const projectId = await project("โครงการรับแม่แบบ");
    const res = await owner.agent.post(`/api/projects/${projectId}/templates/apply`).send({ templateId: id });
    expect(res.status).toBe(200);
    const boq = await owner.agent.get(`/api/projects/${projectId}/boq`);
    expect(boq.body.items.map((i: { name: string }) => i.name)).toEqual(["ใช้ได้"]);

    const again = await owner.agent.post(`/api/projects/${projectId}/templates/apply`).send({ templateId: id });
    expect(again.status).toBe(409);
    expect(again.body.error).toContain("ยังไม่มีรายการ BOQ");
  });

  it("does not apply a trashed template", async () => {
    const id = await template([line(itemCategoryId, "x")]);
    await owner.agent.delete(`/api/templates/${id}`);
    const projectId = await project("โครงการรับแม่แบบในถังขยะ");
    const res = await owner.agent.post(`/api/projects/${projectId}/templates/apply`).send({ templateId: id });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("ไม่พบแม่แบบที่ระบุ");
  });
});
