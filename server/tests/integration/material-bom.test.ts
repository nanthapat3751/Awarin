import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";

// สาย 2 — Material BOM: แตกวัสดุย่อยต่อบรรทัด (bill of materials) + สรุปปริมาณวัสดุรวมโครงการ
describe("material BOM (แตกวัสดุย่อย)", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  let cementId: string; // ปูน 175/ถุง
  let sandId: string; // ทราย 450/ม³
  let gravelId: string; // หิน 380/ม³
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdTemplateIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-bom-owner");
    createdUserIds.push(owner.userId);

    const category = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบ BOM" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: category.body.category.id, name: "กลุ่มงานทดสอบ BOM" });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: subgroup.body.category.id, name: "งานคอนกรีต" });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);

    // วัสดุดิบ (แม่วัสดุ) ที่สูตรจะอ้างถึง
    const cement = await owner.agent
      .post("/api/materials")
      .send({ categoryId: itemCategoryId, name: "ปูนซีเมนต์", unit: "ถุง", materialUnitPrice: 175 });
    cementId = cement.body.material.id;
    const sand = await owner.agent
      .post("/api/materials")
      .send({ categoryId: itemCategoryId, name: "ทรายหยาบ", unit: "ลบ.ม.", materialUnitPrice: 450 });
    sandId = sand.body.material.id;
    const gravel = await owner.agent
      .post("/api/materials")
      .send({ categoryId: itemCategoryId, name: "หิน", unit: "ลบ.ม.", materialUnitPrice: 380 });
    gravelId = gravel.body.material.id;
    createdMaterialIds.push(cementId, sandId, gravelId);
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

  async function createProject(name: string, patch?: Record<string, unknown>) {
    const res = await owner.agent.post("/api/projects").send({ name });
    const id = res.body.project.id as string;
    createdProjectIds.push(id);
    if (patch) await owner.agent.patch(`/api/projects/${id}`).send(patch);
    return id;
  }

  const concreteRecipe = [
    { componentMaterialId: null, name: "ปูนซีเมนต์", unit: "ถุง", qtyPerUnit: 7, unitPrice: 175 },
    { componentMaterialId: null, name: "ทรายหยาบ", unit: "ลบ.ม.", qtyPerUnit: 0.45, unitPrice: 450 },
    { componentMaterialId: null, name: "หิน", unit: "ลบ.ม.", qtyPerUnit: 0.9, unitPrice: 380 },
  ];
  // 7×175 + 0.45×450 + 0.9×380 = 1225 + 202.5 + 342 = 1769.50 ต่อ 1 ม³
  const DERIVED_PER_M3 = 1769.5;

  it("derives materialUnitPrice from the components (Σ qtyPerUnit×(1+waste)×unitPrice)", async () => {
    const projectId = await createProject("BOM ราคาจากสูตร");
    const res = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "งานเทคอนกรีตโครงสร้าง",
      unit: "ลบ.ม.",
      laborUnitPrice: 300,
      quantity: 12,
      components: concreteRecipe,
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.item.materialUnitPrice)).toBeCloseTo(DERIVED_PER_M3, 2);
    expect(Number(res.body.item.materialTotal)).toBeCloseTo(12 * DERIVED_PER_M3, 2); // 21,234
    expect(Number(res.body.item.lineTotal)).toBeCloseTo(12 * (DERIVED_PER_M3 + 300), 2); // 24,834
    expect(res.body.item.components).toHaveLength(3);
  });

  it("honours a per-component waste factor in the derived price", async () => {
    const projectId = await createProject("BOM เผื่อเสียต่อวัสดุย่อย");
    const res = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "เหล็กเสริม",
      unit: "ตัน",
      quantity: 1,
      // เหล็ก 1000 กก./ตัน × 25 บาท + เผื่อเสีย 5% = 26,250
      components: [{ name: "เหล็ก DB12", unit: "กก.", qtyPerUnit: 1000, wasteFactorPct: 5, unitPrice: 25 }],
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.item.materialUnitPrice)).toBeCloseTo(1000 * 1.05 * 25, 2); // 26,250
  });

  it("auto-pulls a catalog material's recipe into a BOQ line when no components are sent", async () => {
    // วัสดุแคตตาล็อกที่มีสูตรในตัว
    const composite = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "งานเทคอนกรีต (มีสูตร)",
      unit: "ลบ.ม.",
      materialUnitPrice: 0, // จะถูกคิดใหม่จากสูตร
      components: concreteRecipe,
    });
    createdMaterialIds.push(composite.body.material.id);
    expect(Number(composite.body.material.materialUnitPrice)).toBeCloseTo(DERIVED_PER_M3, 2);
    expect(composite.body.material.components).toHaveLength(3);

    const projectId = await createProject("BOM ดึงสูตรจากแคตตาล็อก");
    const res = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      materialId: composite.body.material.id,
      quantity: 5,
    });
    expect(res.status).toBe(201);
    expect(res.body.item.components).toHaveLength(3);
    expect(Number(res.body.item.materialUnitPrice)).toBeCloseTo(DERIVED_PER_M3, 2);
    expect(Number(res.body.item.materialTotal)).toBeCloseTo(5 * DERIVED_PER_M3, 2);
  });

  it("clears a material's recipe on update (components: []) and reverts to a typed lump price", async () => {
    const created = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "วัสดุมีสูตรชั่วคราว",
      unit: "ลบ.ม.",
      materialUnitPrice: 0,
      components: concreteRecipe,
    });
    const id = created.body.material.id;
    createdMaterialIds.push(id);
    expect(created.body.material.components).toHaveLength(3);

    const cleared = await owner.agent.patch(`/api/materials/${id}`).send({ materialUnitPrice: 999, components: [] });
    expect(cleared.status).toBe(200);
    expect(cleared.body.material.components).toHaveLength(0);
    expect(Number(cleared.body.material.materialUnitPrice)).toBeCloseTo(999, 2);
  });

  it("carries the recipe through save-as-template and apply-template", async () => {
    const sourceId = await createProject("BOM ต้นทางแม่แบบ");
    await owner.agent.post(`/api/projects/${sourceId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "งานเทคอนกรีต",
      unit: "ลบ.ม.",
      quantity: 3,
      components: concreteRecipe,
    });

    const tpl = await owner.agent
      .post(`/api/projects/${sourceId}/templates/save-as`)
      .send({ name: `BOM แม่แบบ ${Date.now()}` });
    expect(tpl.status).toBe(201);
    createdTemplateIds.push(tpl.body.template.id);

    // แม่แบบเก็บสูตรไว้ใน structure
    const detail = await owner.agent.get(`/api/templates/${tpl.body.template.id}`);
    expect(detail.body.template.items[0].components).toHaveLength(3);

    // ใช้แม่แบบกับโครงการใหม่ที่ยังว่าง → บรรทัดที่ได้ต้องมีสูตรครบ + ราคาถูกคิดจากสูตร
    const targetId = await createProject("BOM ปลายทางแม่แบบ");
    const applied = await owner.agent
      .post(`/api/projects/${targetId}/templates/apply`)
      .send({ templateId: tpl.body.template.id });
    expect(applied.status).toBe(200);

    const boq = await owner.agent.get(`/api/projects/${targetId}/boq`);
    expect(boq.body.items[0].components).toHaveLength(3);
    expect(Number(boq.body.items[0].materialUnitPrice)).toBeCloseTo(DERIVED_PER_M3, 2);
  });

  it("rejects a component that references a non-existent raw material (400/404, not a 500)", async () => {
    const projectId = await createProject("BOM ref ผิด");
    const res = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "งานผิด ref",
      unit: "ลบ.ม.",
      quantity: 1,
      components: [{ componentMaterialId: "does-not-exist", name: "ผี", unit: "ถุง", qtyPerUnit: 1, unitPrice: 10 }],
    });
    expect(res.status).toBe(404);
  });

  it("clones the component snapshot into a new version after a quote is sent", async () => {
    const projectId = await createProject("BOM clone หลังส่งใบเสนอราคา");
    const addRes = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "งานเทคอนกรีต",
      unit: "ลบ.ม.",
      quantity: 2,
      components: concreteRecipe,
    });
    const originalItemId = addRes.body.item.id;

    await prisma.quote.create({
      data: {
        projectId,
        projectVersionId: addRes.body.version.id,
        quoteNo: `TEST-BOM-Q-${Date.now()}`,
        revisionNo: 1,
        status: "SENT",
      },
    });

    // แก้บรรทัดเดิม → server clone เวอร์ชันใหม่ (id เดิมใช้ไม่ได้แล้ว = 404) แต่ snapshot สูตรต้องถูกคัดลอกไป
    const stale = await owner.agent
      .patch(`/api/projects/${projectId}/boq/items/${originalItemId}`)
      .send({ quantity: 5 });
    expect(stale.status).toBe(404);

    const after = await owner.agent.get(`/api/projects/${projectId}/boq`);
    expect(after.body.version.versionNo).toBe(2);
    expect(after.body.items[0].components).toHaveLength(3);
    expect(Number(after.body.items[0].materialUnitPrice)).toBeCloseTo(DERIVED_PER_M3, 2);
  });
});
