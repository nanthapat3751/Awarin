import { prisma } from "../../src/lib/prisma";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";

describe("boq module", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  let materialId: string; // material rate: 7,500 material / 1,500 labor per unit (real BOQ reference)
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-boq-owner");
    createdUserIds.push(owner.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบ BOQ" });
    createdCategoryIds.push(category.body.category.id);

    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบ BOQ",
    });
    createdCategoryIds.push(subgroup.body.category.id);

    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "เข็มตอก I 22 L 24",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);

    const material = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "เข็มตอก I 22 L 24",
      unit: "ต้น",
      materialUnitPrice: 7500,
      laborUnitPrice: 1500,
    });
    materialId = material.body.material.id;
    createdMaterialIds.push(materialId);
  });

  afterAll(async () => {
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

  it("adds a BOQ line from the material catalog and recalculates pricing (BR-01..BR-06)", async () => {
    const projectId = await createProject("BOQ โครงการ 1");

    const addRes = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      materialId,
      quantity: 16,
    });

    expect(addRes.status).toBe(201);
    expect(addRes.body.item.materialTotal).toBe("120000");
    expect(addRes.body.item.laborTotal).toBe("24000");
    expect(addRes.body.item.lineTotal).toBe("144000");

    // อัตราเริ่มต้น: ค่าดำเนินการ 10%, VAT 7%
    const directCost = 144000;
    const overhead = directCost * 0.1;
    const vat = (directCost + overhead) * 0.07;
    const net = directCost + overhead + vat;

    expect(Number(addRes.body.version.directCost)).toBeCloseTo(directCost, 2);
    expect(Number(addRes.body.version.overheadProfitAmt)).toBeCloseTo(overhead, 2);
    expect(Number(addRes.body.version.vatAmt)).toBeCloseTo(vat, 2);
    expect(Number(addRes.body.version.netPrice)).toBeCloseTo(net, 2);
  });

  it("rejects a BOQ line attached to a non-ITEM category", async () => {
    const projectId = await createProject("BOQ โครงการผิดระดับ");
    const itemCategory = await prisma.workCategory.findUniqueOrThrow({ where: { id: itemCategoryId } });

    const badRes = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategory.parentId, // เป็น SUBGROUP ไม่ใช่ ITEM
      quantity: 1,
      name: "ผิดระดับ",
      unit: "หน่วย",
      materialUnitPrice: 1,
    });
    expect(badRes.status).toBe(400);
  });

  it("allows an ad-hoc line item with no materialId", async () => {
    const projectId = await createProject("BOQ โครงการ ad-hoc");
    const res = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      quantity: 1,
      name: "อื่นๆ (ระบุ)",
      unit: "เหมา",
      materialUnitPrice: 12000,
      note: "ตามที่ตกลง",
    });
    expect(res.status).toBe(201);
    expect(res.body.item.materialId).toBeNull();
    expect(res.body.item.note).toBe("ตามที่ตกลง");
  });

  it("updates a line item's quantity and recalculates the version total", async () => {
    const projectId = await createProject("BOQ โครงการแก้ไข");
    const addRes = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      materialId,
      quantity: 1,
    });
    const itemId = addRes.body.item.id;

    const updateRes = await owner.agent
      .patch(`/api/projects/${projectId}/boq/items/${itemId}`)
      .send({ quantity: 2 });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.item.lineTotal).toBe("18000"); // (7500+1500) * 2
    expect(Number(updateRes.body.version.directCost)).toBeCloseTo(18000, 2);
  });

  it("swaps a line's material in place, pulling the new material's price into the line", async () => {
    const projectId = await createProject("BOQ สลับวัสดุ");
    const addRes = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      materialId,
      quantity: 2,
    });
    const itemId = addRes.body.item.id;
    expect(addRes.body.item.lineTotal).toBe("18000"); // (7500+1500) × 2

    // วัสดุตัวใหม่ราคาถูกกว่า
    const material2 = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "วัสดุทางเลือก (ถูกกว่า)",
      unit: "หน่วย",
      materialUnitPrice: 3000,
      laborUnitPrice: 500,
    });
    createdMaterialIds.push(material2.body.material.id);

    // สลับวัสดุ: ส่ง materialId ใหม่ + ชื่อ/หน่วย/ราคาที่ตามมา (ฝั่งเว็บดึงให้)
    const swap = await owner.agent.patch(`/api/projects/${projectId}/boq/items/${itemId}`).send({
      materialId: material2.body.material.id,
      name: "วัสดุทางเลือก (ถูกกว่า)",
      unit: "หน่วย",
      materialUnitPrice: 3000,
      laborUnitPrice: 500,
    });
    expect(swap.status).toBe(200);
    expect(swap.body.item.materialId).toBe(material2.body.material.id);
    expect(swap.body.item.name).toBe("วัสดุทางเลือก (ถูกกว่า)");
    expect(swap.body.item.lineTotal).toBe("7000"); // (3000+500) × 2

    // สลับไปหา materialId ที่ไม่มีจริง → 404
    const bad = await owner.agent
      .patch(`/api/projects/${projectId}/boq/items/${itemId}`)
      .send({ materialId: "does-not-exist" });
    expect(bad.status).toBe(404);
  });

  it("computes a PER_AREA (take-off) quantity from project area and rescales when the area changes", async () => {
    const projectId = await createProject("BOQ ถอดปริมาณตามพื้นที่");
    // ตั้งพื้นที่พื้นของโครงการ 180 ตร.ม. ก่อนเพิ่มบรรทัดที่ผูกกับพื้นที่
    await owner.agent.patch(`/api/projects/${projectId}`).send({ areaSqm: 180 });

    // กระเบื้องปูพื้น: 1 ตร.ม.กระเบื้องต่อ 1 ตร.ม.พื้น + เผื่อเสีย 5% → 180 × 1.05 = 189 ตร.ม.
    const addRes = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "กระเบื้องปูพื้น 60x60",
      unit: "ตร.ม.",
      materialUnitPrice: 320,
      laborUnitPrice: 180,
      qtyBasis: "PER_AREA",
      qtyCoefficient: 1,
      wasteFactorPct: 5,
    });
    expect(addRes.status).toBe(201);
    expect(Number(addRes.body.item.quantity)).toBeCloseTo(189, 3);
    expect(Number(addRes.body.item.materialTotal)).toBeCloseTo(189 * 320, 2); // 60,480
    expect(Number(addRes.body.item.lineTotal)).toBeCloseTo(189 * 500, 2); // 94,500

    // เปลี่ยนพื้นที่เป็น 200 ตร.ม. → ปริมาณคิดใหม่ 200 × 1.05 = 210 และราคารวมขยับตาม (ไม่ใช่แค่ราคา/ตร.ม.)
    await owner.agent.patch(`/api/projects/${projectId}`).send({ areaSqm: 200 });
    const detail = await owner.agent.get(`/api/projects/${projectId}`);
    const line = detail.body.items.find((i: { name: string }) => i.name === "กระเบื้องปูพื้น 60x60");
    expect(Number(line.quantity)).toBeCloseTo(210, 3);
    expect(line.qtyBasis).toBe("PER_AREA");
    expect(Number(line.lineTotal)).toBeCloseTo(210 * 500, 2); // 105,000
    expect(Number(detail.body.currentVersion.directCost)).toBeCloseTo(210 * 500, 2);
  });

  it("computes a PER_WALL_AREA line from the project's wall-area measurement and rescales on change", async () => {
    const projectId = await createProject("BOQ ถอดปริมาณตามผนัง");
    // ตั้งพื้นที่ผนัง 200 ตร.ม. (ตัวขับของงานฉาบ/ทาสี)
    await owner.agent.patch(`/api/projects/${projectId}`).send({ wallAreaSqm: 200 });

    // ฉาบผนัง: 1 ตร.ม.ต่อ 1 ตร.ม.ผนัง + เผื่อเสีย 3% → 200 × 1.03 = 206 ตร.ม.
    const addRes = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "ฉาบปูนผนัง",
      unit: "ตร.ม.",
      materialUnitPrice: 90,
      laborUnitPrice: 110,
      qtyBasis: "PER_WALL_AREA",
      qtyCoefficient: 1,
      wasteFactorPct: 3,
    });
    expect(addRes.status).toBe(201);
    expect(Number(addRes.body.item.quantity)).toBeCloseTo(206, 3);
    expect(Number(addRes.body.item.lineTotal)).toBeCloseTo(206 * 200, 2); // 41,200

    // เพิ่มพื้นที่ผนังเป็น 250 → 250 × 1.03 = 257.5 ตร.ม.
    await owner.agent.patch(`/api/projects/${projectId}`).send({ wallAreaSqm: 250 });
    const detail = await owner.agent.get(`/api/projects/${projectId}`);
    const line = detail.body.items.find((i: { name: string }) => i.name === "ฉาบปูนผนัง");
    expect(Number(line.quantity)).toBeCloseTo(257.5, 3);
    expect(Number(detail.body.currentVersion.directCost)).toBeCloseTo(257.5 * 200, 2); // 51,500
  });

  it("computes a PER_BATHROOM line from the project's bathroom count and rescales on change", async () => {
    const projectId = await createProject("BOQ ถอดปริมาณตามห้องน้ำ");
    // ตั้งจำนวนห้องน้ำ = 2 (ตัวขับของสุขภัณฑ์)
    await owner.agent.patch(`/api/projects/${projectId}`).send({ bathrooms: 2 });

    // โถส้วม: 1 ชุดต่อ 1 ห้องน้ำ → 2 × 1 = 2 ชุด (ค่านับ ไม่มีเผื่อเสีย)
    const addRes = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "โถส้วมนั่งราบ",
      unit: "ชุด",
      materialUnitPrice: 2500,
      laborUnitPrice: 500,
      qtyBasis: "PER_BATHROOM",
      qtyCoefficient: 1,
    });
    expect(addRes.status).toBe(201);
    expect(Number(addRes.body.item.quantity)).toBe(2);
    expect(Number(addRes.body.item.lineTotal)).toBeCloseTo(2 * 3000, 2); // 6,000

    // เพิ่มห้องน้ำเป็น 4 → 4 ชุด
    await owner.agent.patch(`/api/projects/${projectId}`).send({ bathrooms: 4 });
    const detail = await owner.agent.get(`/api/projects/${projectId}`);
    const line = detail.body.items.find((i: { name: string }) => i.name === "โถส้วมนั่งราบ");
    expect(Number(line.quantity)).toBe(4);
    expect(Number(detail.body.currentVersion.directCost)).toBeCloseTo(4 * 3000, 2); // 12,000
  });

  it("computes a PER_FOOTPRINT line from building footprint, independent of total floor area", async () => {
    const projectId = await createProject("BOQ ถอดปริมาณตามพื้นที่ตั้งอาคาร");
    // บ้าน 2 ชั้น: พื้นที่ใช้สอยรวม 220 ตร.ม. แต่ตั้งอาคาร/หลังคาคลุมแค่ 110 ตร.ม.
    await owner.agent.patch(`/api/projects/${projectId}`).send({ areaSqm: 220, footprintSqm: 110 });

    // กระเบื้องหลังคา: 1.2 ตร.ม.ต่อ 1 ตร.ม.ตั้งอาคาร (เผื่อลาดเอียง) → 110 × 1.2 = 132 ตร.ม.
    // (ถ้าใช้พื้นที่ใช้สอยรวมจะเป็น 220 × 1.2 = 264 → over-scale; ตัวขับ footprint แก้ตรงนี้)
    const addRes = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "กระเบื้องหลังคา",
      unit: "ตร.ม.",
      materialUnitPrice: 300,
      laborUnitPrice: 100,
      qtyBasis: "PER_FOOTPRINT",
      qtyCoefficient: 1.2,
    });
    expect(addRes.status).toBe(201);
    expect(Number(addRes.body.item.quantity)).toBeCloseTo(132, 3);
    expect(Number(addRes.body.item.lineTotal)).toBeCloseTo(132 * 400, 2); // 52,800

    // ขยายพื้นที่ตั้งอาคารเป็น 130 → 130 × 1.2 = 156 (พื้นที่ใช้สอยไม่เกี่ยว)
    await owner.agent.patch(`/api/projects/${projectId}`).send({ footprintSqm: 130 });
    const detail = await owner.agent.get(`/api/projects/${projectId}`);
    const line = detail.body.items.find((i: { name: string }) => i.name === "กระเบื้องหลังคา");
    expect(Number(line.quantity)).toBeCloseTo(156, 3);
    expect(Number(detail.body.currentVersion.directCost)).toBeCloseTo(156 * 400, 2); // 62,400
  });

  it("deletes a line item and recalculates the version total back down", async () => {
    const projectId = await createProject("BOQ โครงการลบ");
    const addRes = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      materialId,
      quantity: 1,
    });
    const itemId = addRes.body.item.id;

    const deleteRes = await owner.agent.delete(`/api/projects/${projectId}/boq/items/${itemId}`);
    expect(deleteRes.status).toBe(200);
    expect(Number(deleteRes.body.version.directCost)).toBe(0);
  });

  // BR-07: การแก้ไขหลังส่งใบเสนอราคาแล้วต้อง clone เป็นเวอร์ชันใหม่ที่แก้ไขได้
  it("clones a new version when editing a BOQ that already has a SENT quote", async () => {
    const projectId = await createProject("BOQ โครงการมีใบเสนอราคาแล้ว");
    const addRes = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      materialId,
      quantity: 1,
    });
    const originalItemId = addRes.body.item.id;
    const originalVersionId = addRes.body.version.id;

    await prisma.quote.create({
      data: {
        projectId,
        projectVersionId: originalVersionId,
        quoteNo: `TEST-Q-${Date.now()}`,
        revisionNo: 1,
        status: "SENT",
      },
    });

    const beforeState = await owner.agent.get(`/api/projects/${projectId}/boq`);
    expect(beforeState.body.editable).toBe(false);
    expect(beforeState.body.version.id).toBe(originalVersionId);

    // Editing the old item id fails — it no longer belongs to the (now newly cloned) latest version
    const staleUpdate = await owner.agent
      .patch(`/api/projects/${projectId}/boq/items/${originalItemId}`)
      .send({ quantity: 5 });
    expect(staleUpdate.status).toBe(404);

    const afterState = await owner.agent.get(`/api/projects/${projectId}/boq`);
    expect(afterState.body.editable).toBe(true);
    expect(afterState.body.version.versionNo).toBe(2);
    expect(afterState.body.version.id).not.toBe(originalVersionId);
    expect(afterState.body.items).toHaveLength(1);
    expect(afterState.body.items[0].id).not.toBe(originalItemId);
    expect(afterState.body.items[0].lineTotal).toBe(addRes.body.item.lineTotal);

    // ตอนนี้ id ของรายการที่ clone มาใช้งานได้แล้ว
    const clonedItemId = afterState.body.items[0].id;
    const retryUpdate = await owner.agent
      .patch(`/api/projects/${projectId}/boq/items/${clonedItemId}`)
      .send({ quantity: 5 });
    expect(retryUpdate.status).toBe(200);
  });

  it("rejects a CUSTOMER reading or editing a project's BOQ", async () => {
    const projectId = await createProject("BOQ โครงการห้ามลูกค้า");
    const customer = await createAndLoginCustomer("test-boq-customer");

    const getRes = await customer.agent.get(`/api/projects/${projectId}/boq`);
    expect(getRes.status).toBe(403);

    const postRes = await customer.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      materialId,
      quantity: 1,
    });
    expect(postRes.status).toBe(403);

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });
});
