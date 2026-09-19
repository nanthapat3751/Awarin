import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";

// Covers the two "scope a แบบบ้าน" features: a standard BOQ template linked to a design is
// (1) ถูกนำไปใช้อัตโนมัติกับโปรเจกต์ใหม่ที่สร้างจากแบบบ้านนั้น และ (2) คิดราคากลับไปที่แบบบ้าน
// เป็นราคาประเมินมาตรฐานเบื้องต้น
describe("house design standard template", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  let materialId: string; // 3,000 material + 800 labor per unit
  let designId: string;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdTemplateIds: string[] = [];
  const createdDesignIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-hd-standard-owner");
    createdUserIds.push(owner.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบแบบบ้าน" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มย่อยทดสอบแบบบ้าน",
    });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการทดสอบแบบบ้าน",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);

    const material = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "วัสดุทดสอบแบบบ้าน",
      unit: "หน่วย",
      materialUnitPrice: 3000,
      laborUnitPrice: 800,
    });
    materialId = material.body.material.id;
    createdMaterialIds.push(materialId);

    const design = await owner.agent
      .post("/api/house-designs")
      .send({ name: "บ้านมาตรฐานทดสอบ", area: 100 });
    designId = design.body.houseDesign.id;
    createdDesignIds.push(designId);

    // โปรเจกต์ต้นทางที่ผูกกับแบบบ้าน -> เพิ่ม BOQ -> บันทึกเป็น template มาตรฐานของแบบนั้น
    // (สร้างก่อนที่ template จะมีอยู่ มันจึงไม่ได้ auto-apply อะไรด้วยตัวเอง)
    const source = await owner.agent
      .post("/api/projects")
      .send({ name: "โครงการต้นแบบบ้าน", houseDesignId: designId });
    createdProjectIds.push(source.body.project.id);
    await owner.agent
      .post(`/api/projects/${source.body.project.id}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId, quantity: 10 });
    const saved = await owner.agent
      .post(`/api/projects/${source.body.project.id}/templates/save-as`)
      .send({ name: "แม่แบบบ้านมาตรฐาน" });
    createdTemplateIds.push(saved.body.template.id);
  });

  afterAll(async () => {
    await prisma.template.deleteMany({ where: { id: { in: createdTemplateIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.houseDesign.deleteMany({ where: { id: { in: createdDesignIds } } });
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("auto-applies the design's standard template to a new project created from it", async () => {
    const res = await owner.agent
      .post("/api/projects")
      .send({ name: "โครงการจากแบบบ้าน", houseDesignId: designId });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);

    const detail = await owner.agent.get(`/api/projects/${projectId}`);
    expect(detail.body.items).toHaveLength(1);
    expect(detail.body.items[0].materialId).toBe(materialId);
    expect(detail.body.items[0].quantity).toBe("10");
    // ราคาสะท้อน BOQ ที่ seed ไว้ (10 x 3800 = 38,000 ต้นทุนตรง)
    expect(Number(detail.body.currentVersion.directCost)).toBe(38000);
  });

  it("exposes a standard estimate on the house design (price + per-sqm from its template)", async () => {
    const res = await owner.agent.get(`/api/house-designs/${designId}`);
    expect(res.status).toBe(200);
    const std = res.body.houseDesign.standard;
    expect(std).not.toBeNull();
    expect(std.itemCount).toBe(1);
    expect(std.directCost).toBe(38000);
    expect(std.netPrice).toBeGreaterThanOrEqual(std.directCost); // markup + VAT folded in
    // พื้นที่ 100 -> ราคาต่อตารางเมตรคือราคาสุทธิหารด้วยพื้นที่
    expect(std.pricePerSqm).toBeCloseTo(std.netPrice / 100, 2);
  });

  it("prefills + scales a project's measurements from the design so wall/perimeter/volume drivers all scale (item #1)", async () => {
    // แบบบ้านที่มีค่าวัด: พื้นที่ 100 + ผนัง 120 พร้อมแม่แบบที่มีบรรทัดผูกพื้นที่ผนัง (coeff 1)
    const design = await owner.agent
      .post("/api/house-designs")
      .send({ name: "แบบบ้านมีค่าวัด", area: 100, wallAreaSqm: 120 });
    const designWithMeasureId = design.body.houseDesign.id as string;
    createdDesignIds.push(designWithMeasureId);

    const source = await owner.agent
      .post("/api/projects")
      .send({ name: "ต้นแบบผูกผนัง", houseDesignId: designWithMeasureId });
    createdProjectIds.push(source.body.project.id);
    // โครงการต้นแบบต้อง prefill ผนัง = 120 จากแบบ (ยังไม่กรอกเอง)
    const sourceDetail = await owner.agent.get(`/api/projects/${source.body.project.id}`);
    expect(sourceDetail.body.project.wallAreaSqm).toBe("120");

    await owner.agent
      .post(`/api/projects/${source.body.project.id}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId, qtyBasis: "PER_WALL_AREA", qtyCoefficient: 1 });
    const saved = await owner.agent
      .post(`/api/projects/${source.body.project.id}/templates/save-as`)
      .send({ name: "แม่แบบผูกผนัง" });
    createdTemplateIds.push(saved.body.template.id);

    // สร้างโครงการจากแบบ กรอก "แค่พื้นที่ 200" (×2 ของแบบ) → ผนังต้อง prefill สเกลเป็น 240
    const project = await owner.agent
      .post("/api/projects")
      .send({ name: "บ้านใหญ่จากแบบมีค่าวัด", houseDesignId: designWithMeasureId, areaSqm: 200 });
    const projectId = project.body.project.id as string;
    createdProjectIds.push(projectId);

    const detail = await owner.agent.get(`/api/projects/${projectId}`);
    expect(detail.body.project.areaSqm).toBe("200");
    expect(detail.body.project.wallAreaSqm).toBe("240"); // 120 × (200/100)
    // บรรทัดผูกผนังคิดปริมาณจากผนังที่สเกลแล้ว: 240 × 1 = 240 (ไม่ใช่ 120 ที่แช่แข็ง)
    const line = detail.body.items.find((i: { qtyBasis: string }) => i.qtyBasis === "PER_WALL_AREA");
    expect(line.quantity).toBe("240");
  });

  it("lets an explicitly provided project measurement win over the design prefill", async () => {
    const design = await owner.agent
      .post("/api/house-designs")
      .send({ name: "แบบบ้านค่าวัดถูกทับ", area: 100, wallAreaSqm: 120 });
    createdDesignIds.push(design.body.houseDesign.id);
    const project = await owner.agent
      .post("/api/projects")
      .send({ name: "โครงการกรอกผนังเอง", houseDesignId: design.body.houseDesign.id, areaSqm: 200, wallAreaSqm: 500 });
    createdProjectIds.push(project.body.project.id);
    const detail = await owner.agent.get(`/api/projects/${project.body.project.id}`);
    expect(detail.body.project.wallAreaSqm).toBe("500"); // ค่าที่กรอกเองชนะ prefill
  });

  it("returns a null standard estimate for a design with no template", async () => {
    const design = await owner.agent
      .post("/api/house-designs")
      .send({ name: "แบบบ้านไม่มีแม่แบบ", area: 50 });
    createdDesignIds.push(design.body.houseDesign.id);
    const res = await owner.agent.get(`/api/house-designs/${design.body.houseDesign.id}`);
    expect(res.body.houseDesign.standard).toBeNull();
  });
});
