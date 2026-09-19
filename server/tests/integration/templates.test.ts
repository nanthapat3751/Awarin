import { prisma } from "../../src/lib/prisma";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";

describe("templates module", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  let materialId: string; // 3,000 material / 800 labor per unit
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdTemplateIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-templates-owner");
    createdUserIds.push(owner.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบแม่แบบ" });
    createdCategoryIds.push(category.body.category.id);

    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบแม่แบบ",
    });
    createdCategoryIds.push(subgroup.body.category.id);

    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการทดสอบแม่แบบ",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);

    const material = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "วัสดุทดสอบแม่แบบ",
      unit: "หน่วย",
      materialUnitPrice: 3000,
      laborUnitPrice: 800,
    });
    materialId = material.body.material.id;
    createdMaterialIds.push(materialId);
  });

  afterAll(async () => {
    await prisma.template.deleteMany({ where: { id: { in: createdTemplateIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function createProject(name: string) {
    const res = await owner.agent.post("/api/projects").send({ name });
    createdProjectIds.push(res.body.project.id);
    return res.body.project.id as string;
  }

  async function createProjectWithArea(name: string, areaSqm: number) {
    const res = await owner.agent.post("/api/projects").send({ name, areaSqm });
    createdProjectIds.push(res.body.project.id);
    return res.body.project.id as string;
  }

  it("rejects saving a template from a project with no BOQ items", async () => {
    const projectId = await createProject("โครงการว่างเปล่า");
    const res = await owner.agent
      .post(`/api/projects/${projectId}/templates/save-as`)
      .send({ name: "แม่แบบว่างเปล่า" });
    expect(res.status).toBe(409);
  });

  it("saves a project's BOQ as a template, then applies it to a fresh empty project", async () => {
    const sourceProjectId = await createProject("โครงการต้นแบบ");
    await owner.agent.post(`/api/projects/${sourceProjectId}/boq/items`).send({
      categoryId: itemCategoryId,
      materialId,
      quantity: 10,
    });

    const saveRes = await owner.agent
      .post(`/api/projects/${sourceProjectId}/templates/save-as`)
      .send({ name: "แม่แบบบ้านทดสอบ" });
    expect(saveRes.status).toBe(201);
    expect(saveRes.body.template.name).toBe("แม่แบบบ้านทดสอบ");
    const templateId = saveRes.body.template.id as string;
    createdTemplateIds.push(templateId);

    const listRes = await owner.agent.get("/api/templates");
    expect(listRes.status).toBe(200);
    const listed = listRes.body.templates.find((t: { id: string }) => t.id === templateId);
    expect(listed).toBeDefined();
    expect(listed.itemCount).toBe(1);

    const targetProjectId = await createProject("โครงการใหม่จากแม่แบบ");
    const applyRes = await owner.agent
      .post(`/api/projects/${targetProjectId}/templates/apply`)
      .send({ templateId });
    expect(applyRes.status).toBe(200);
    expect(applyRes.body.appliedCount).toBe(1);
    expect(applyRes.body.skippedCount).toBe(0);

    const detailRes = await owner.agent.get(`/api/projects/${targetProjectId}`);
    expect(detailRes.body.items).toHaveLength(1);
    expect(detailRes.body.items[0].materialId).toBe(materialId);
    expect(detailRes.body.items[0].quantity).toBe("10");
    expect(detailRes.body.items[0].materialTotal).toBe("30000");
    expect(detailRes.body.items[0].laborTotal).toBe("8000");
  });

  it("carries the take-off recipe so a template rescales quantities to the new project's area (Phase 3)", async () => {
    // ต้นแบบพื้นที่ 100 ตร.ม. + บรรทัด PER_AREA สัมประสิทธิ์ 1 → ปริมาณ = 100
    const sourceProjectId = await createProjectWithArea("บ้านมาตรฐาน (ต้นแบบ 100)", 100);
    await owner.agent.post(`/api/projects/${sourceProjectId}/boq/items`).send({
      categoryId: itemCategoryId,
      materialId,
      qtyBasis: "PER_AREA",
      qtyCoefficient: 1,
    });
    const sourceBoq = await owner.agent.get(`/api/projects/${sourceProjectId}`);
    expect(sourceBoq.body.items[0].quantity).toBe("100");

    const saveRes = await owner.agent
      .post(`/api/projects/${sourceProjectId}/templates/save-as`)
      .send({ name: "แม่แบบถอดปริมาณตามพื้นที่" });
    const templateId = saveRes.body.template.id as string;
    createdTemplateIds.push(templateId);

    // แม่แบบต้องเก็บสูตร (basis/สัมประสิทธิ์) ไว้ให้หน้ารายละเอียดโชว์
    const templateDetail = await owner.agent.get(`/api/templates/${templateId}`);
    expect(templateDetail.body.template.items[0].qtyBasis).toBe("PER_AREA");
    expect(Number(templateDetail.body.template.items[0].qtyCoefficient)).toBe(1);

    // โครงการใหม่พื้นที่ 180 → ใช้แม่แบบแล้วปริมาณต้องคิดใหม่เป็น 180 (ไม่ใช่ 100 ที่แช่แข็งไว้)
    const targetProjectId = await createProjectWithArea("บ้านหลังใหญ่ (180)", 180);
    const applyRes = await owner.agent
      .post(`/api/projects/${targetProjectId}/templates/apply`)
      .send({ templateId });
    expect(applyRes.status).toBe(200);
    expect(applyRes.body.appliedCount).toBe(1);

    const detailRes = await owner.agent.get(`/api/projects/${targetProjectId}`);
    expect(detailRes.body.items[0].qtyBasis).toBe("PER_AREA");
    expect(detailRes.body.items[0].quantity).toBe("180");
    expect(detailRes.body.items[0].materialTotal).toBe("540000"); // 180 × 3000
    expect(detailRes.body.items[0].laborTotal).toBe("144000"); // 180 × 800
  });

  it("edits a template line's take-off recipe in place (basis/coefficient) without re-saving", async () => {
    const sourceProjectId = await createProject("โครงการสำหรับแก้สูตร");
    await owner.agent.post(`/api/projects/${sourceProjectId}/boq/items`).send({
      categoryId: itemCategoryId,
      materialId,
      quantity: 10, // MANUAL ตั้งต้น
    });
    const saveRes = await owner.agent
      .post(`/api/projects/${sourceProjectId}/templates/save-as`)
      .send({ name: "แม่แบบสำหรับแก้สูตร" });
    const templateId = saveRes.body.template.id as string;
    createdTemplateIds.push(templateId);

    // เปลี่ยนบรรทัด index 0 จาก MANUAL → PER_AREA (สัมประสิทธิ์ 2) แบบแก้ในที่
    const patch = await owner.agent
      .patch(`/api/templates/${templateId}/items/0`)
      .send({ qtyBasis: "PER_AREA", qtyCoefficient: 2, wasteFactorPct: 5 });
    expect(patch.status).toBe(200);
    expect(patch.body.template.items[0].qtyBasis).toBe("PER_AREA");
    expect(Number(patch.body.template.items[0].qtyCoefficient)).toBe(2);
    expect(Number(patch.body.template.items[0].wasteFactorPct)).toBe(5);

    // สลับกลับเป็น MANUAL พร้อมกำหนดจำนวนใหม่ → coefficient ถูกล้าง
    const back = await owner.agent
      .patch(`/api/templates/${templateId}/items/0`)
      .send({ qtyBasis: "MANUAL", quantity: 25 });
    expect(back.status).toBe(200);
    expect(back.body.template.items[0].qtyBasis).toBe("MANUAL");
    expect(back.body.template.items[0].quantity).toBe("25");
    expect(back.body.template.items[0].qtyCoefficient).toBeNull();

    // ฐานที่ผูกค่าวัดต้องมีสัมประสิทธิ์ (ไม่งั้น 400) และ index เกินขอบเขต → 404
    const bad = await owner.agent
      .patch(`/api/templates/${templateId}/items/0`)
      .send({ qtyBasis: "PER_WALL_AREA" });
    expect(bad.status).toBe(400);
    const oob = await owner.agent
      .patch(`/api/templates/${templateId}/items/99`)
      .send({ qtyBasis: "MANUAL", quantity: 5 });
    expect(oob.status).toBe(404);
  });

  it("rejects applying a template to a project that already has BOQ items", async () => {
    const sourceProjectId = await createProject("โครงการต้นแบบ 2");
    await owner.agent.post(`/api/projects/${sourceProjectId}/boq/items`).send({
      categoryId: itemCategoryId,
      materialId,
      quantity: 5,
    });
    const saveRes = await owner.agent
      .post(`/api/projects/${sourceProjectId}/templates/save-as`)
      .send({ name: "แม่แบบสำหรับทดสอบ 409" });
    const templateId = saveRes.body.template.id as string;
    createdTemplateIds.push(templateId);

    const targetProjectId = await createProject("โครงการที่มีของอยู่แล้ว");
    await owner.agent.post(`/api/projects/${targetProjectId}/boq/items`).send({
      categoryId: itemCategoryId,
      materialId,
      quantity: 1,
    });

    const applyRes = await owner.agent
      .post(`/api/projects/${targetProjectId}/templates/apply`)
      .send({ templateId });
    expect(applyRes.status).toBe(409);
  });

  it("deletes a template", async () => {
    const sourceProjectId = await createProject("โครงการต้นแบบสำหรับลบ");
    await owner.agent.post(`/api/projects/${sourceProjectId}/boq/items`).send({
      categoryId: itemCategoryId,
      materialId,
      quantity: 2,
    });
    const saveRes = await owner.agent
      .post(`/api/projects/${sourceProjectId}/templates/save-as`)
      .send({ name: "แม่แบบที่จะลบ" });
    const templateId = saveRes.body.template.id as string;

    const deleteRes = await owner.agent.delete(`/api/templates/${templateId}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await owner.agent.get("/api/templates");
    expect(listRes.body.templates.some((t: { id: string }) => t.id === templateId)).toBe(false);
  });

  it("rejects a CUSTOMER from accessing template endpoints", async () => {
    const customer = await createAndLoginCustomer("test-templates-customer-forbidden");
    const listRes = await customer.agent.get("/api/templates");
    expect(listRes.status).toBe(403);
    await prisma.user.deleteMany({ where: { email: customer.email } });
  });
});
