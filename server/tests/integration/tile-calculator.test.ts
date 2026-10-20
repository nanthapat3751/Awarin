import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

/**
 * ตัวคิดกระเบื้องบนบรรทัด BOQ (tileCalc)
 *
 * เฝ้า: วัสดุย่อยคิดจากตัวคิดฝั่งเซิร์ฟเวอร์ (ไม่เชื่อสูตรที่หน้าจอส่งมา) · แก้ห้องแล้วคิดใหม่เอง ·
 * โหมดคงราคาเดิมไม่แตะราคาแต่ยังได้รายการสั่งซื้อเป็นกล่อง · ค่าตัวคิดไม่หายตอนแตกเวอร์ชัน
 */
describe("ตัวคิดกระเบื้อง", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-tile-owner");
    createdUserIds.push(owner.userId);
    const category = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบกระเบื้อง" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: category.body.category.id, name: "กลุ่มทดสอบกระเบื้อง" });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: subgroup.body.category.id, name: "งานปูกระเบื้องทดสอบ" });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);
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

  async function newProject(name: string, extra: Record<string, unknown> = {}) {
    const res = await owner.agent.post("/api/projects").send({ name, ...extra });
    const id = res.body.project.id as string;
    createdProjectIds.push(id);
    return id;
  }

  const tileCalc = {
    sourceMaterialId: null,
    tileName: "แกรนิตโต้ 60×60",
    widthMm: 600,
    lengthMm: 600,
    thicknessMm: 9,
    jointMm: 2,
    piecesPerBox: 4,
    rotate: false,
    pattern: "STRAIGHT",
    wastePct: 3,
    adhesive: { kgPerSqm: 6, bagKg: 20, wastePct: 5, pricePerBag: 180 },
    grout: { packKg: 1, wastePct: 10, pricePerPack: 45 },
    trim: null,
    tilePrice: 350,
    tilePriceUnit: "SQM",
    priced: true,
  };
  const bathroom = { label: "ห้องน้ำ", count: 1, length: 1.5, width: 2 };

  function addTileLine(projectId: string, body: Record<string, unknown> = {}) {
    return owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "ปูกระเบื้องพื้นห้องน้ำ",
      unit: "ตร.ม.",
      materialUnitPrice: 300,
      laborUnitPrice: 280,
      qtyBasis: "SHEET",
      takeoffRows: [bathroom],
      tileCalc,
      ...body,
    });
  }

  it("ตั้งราคาจากตัวคิด: วัสดุย่อยคิดที่เซิร์ฟเวอร์ ราคาวัสดุ/ตร.ม. มาจากผลรวม", async () => {
    const projectId = await newProject("กระเบื้อง 1");
    const res = await addTileLine(projectId, {
      // สูตรที่หน้าจอส่งมาต้องไม่ถูกใช้ — ตัวคิดเป็นเจ้าของวัสดุย่อยของบรรทัดนี้
      components: [{ name: "ของปลอม", unit: "ชิ้น", qtyPerUnit: 1, unitPrice: 99999 }],
    });
    expect(res.status).toBe(201);
    const item = res.body.item;
    expect(item.quantity).toBe("3");
    expect(item.tileCalc).toMatchObject({ widthMm: 600, priced: true });
    const names = item.components.map((c: { name: string }) => c.name);
    expect(names).toEqual(["แกรนิตโต้ 60×60 (กล่องละ 4 แผ่น)", "ปูนกาว (ถุง 20 กก.)", "ยาแนว (ถุง 1 กก.)"]);
    // 11 แผ่น = 2.75 กล่อง ÷ 3 ตร.ม. = 0.9166 × 504 + ปูนกาว 0.3 × 1.05 × 180 + ยาแนว 0.096 × 1.1 × 45
    expect(item.components[0]).toMatchObject({ unit: "กล่อง", qtyPerUnit: "0.9166", unitPrice: "504" });
    expect(Number(item.materialUnitPrice)).toBeCloseTo(0.9166 * 504 + 0.3 * 1.05 * 180 + 0.096 * 1.1 * 45, 1);

  });

  it("แก้ขนาดห้องในใบถอดแบบ = จำนวนแผ่นและราคาคิดใหม่เอง", async () => {
    const projectId = await newProject("กระเบื้อง 2");
    const item = (await addTileLine(projectId)).body.item;
    const res = await owner.agent
      .patch(`/api/projects/${projectId}/boq/items/${item.id}`)
      .send({ takeoffRows: [bathroom, { label: "ห้องน้ำ 2", count: 1, length: 1.5, width: 2 }] });
    expect(res.status).toBe(200);
    expect(res.body.item.quantity).toBe("6");
    // สองห้องแยกแถว = 20 แผ่น × 1.03 = 20.6 → 21 แผ่น = 5.25 กล่อง ÷ 6
    expect(res.body.item.components[0].qtyPerUnit).toBe("0.875");
    expect(res.body.item.tileCalc.priced).toBe(true);
  });

  it("คงราคาเดิม: ราคาไม่ขยับ วัสดุย่อยออก (ตัวคิดใช้ดูจำนวนอย่างเดียว)", async () => {
    const projectId = await newProject("กระเบื้อง 3");
    const item = (await addTileLine(projectId)).body.item;
    const res = await owner.agent
      .patch(`/api/projects/${projectId}/boq/items/${item.id}`)
      .send({ tileCalc: { ...tileCalc, priced: false, tilePrice: null }, materialUnitPrice: 300 });
    expect(res.status).toBe(200);
    expect(res.body.item.components).toEqual([]);
    expect(res.body.item.materialUnitPrice).toBe("300");
    expect(res.body.item.lineTotal).toBe("1740");

  });

  it("บรรทัดคิดจากพื้นที่โครงการ: ตัวคิดใช้พื้นที่สุทธิ (หักเผื่อเสียของบรรทัด) + เผื่อเศษตัด", async () => {
    const projectId = await newProject("กระเบื้อง 4", { areaSqm: 100 });
    const res = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "ปูพื้นทั้งบ้าน",
      unit: "ตร.ม.",
      materialUnitPrice: 300,
      qtyBasis: "PER_AREA",
      qtyCoefficient: 0.2,
      wasteFactorPct: 5,
      tileCalc: { ...tileCalc, adhesive: null, grout: null },
    });
    expect(res.status).toBe(201);
    // พื้นที่ 20 × 1.05 = 21 ในบรรทัด · ตัวคิดใช้ 20 → 55.187 × (1 + 5% ตัด + 3% แตก) = 59.6 → 60 แผ่น = 15 กล่อง
    expect(res.body.item.quantity).toBe("21");
    expect(Number(res.body.item.components[0].qtyPerUnit) * 21).toBeCloseTo(15, 2);
  });

  it("ปฏิเสธ: หน่วยไม่ใช่พื้นที่ · ตั้งราคาแต่ราคาไม่ครบ · เปลี่ยนหน่วยทั้งที่ยังใช้ตัวคิด", async () => {
    const projectId = await newProject("กระเบื้อง 5");
    const cubic = await addTileLine(projectId, { unit: "ลบ.ม.", takeoffRows: [{ ...bathroom, height: 0.1 }] });
    expect(cubic.status).toBe(400);
    expect(cubic.body.error).toContain("ตร.ม.");

    const noPrice = await addTileLine(projectId, { tileCalc: { ...tileCalc, tilePrice: null } });
    expect(noPrice.status).toBe(400);
    expect(noPrice.body.error).toBe("กรอกราคากระเบื้อง");

    const item = (await addTileLine(projectId)).body.item;
    const unit = await owner.agent.patch(`/api/projects/${projectId}/boq/items/${item.id}`).send({ unit: "ชุด" });
    expect(unit.status).toBe(400);
  });

  it("เลิกใช้ตัวคิด: วัสดุย่อยที่ตัวคิดสร้างออกไปด้วย", async () => {
    const projectId = await newProject("กระเบื้อง 6");
    const item = (await addTileLine(projectId)).body.item;
    const res = await owner.agent
      .patch(`/api/projects/${projectId}/boq/items/${item.id}`)
      .send({ tileCalc: null, materialUnitPrice: 320 });
    expect(res.body.item.tileCalc).toBeNull();
    expect(res.body.item.components).toEqual([]);
    expect(res.body.item.materialUnitPrice).toBe("320");
  });

  it("แตกเวอร์ชันหลังส่งใบเสนอราคา: ค่าตัวคิดตามไปด้วย", async () => {
    const projectId = await newProject("กระเบื้อง 7");
    const itemId = (await addTileLine(projectId)).body.item.id;
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);
    await owner.agent.patch(`/api/projects/${projectId}/boq/items/${itemId}`).send({ laborUnitPrice: 300 });

    const boq = (await owner.agent.get(`/api/projects/${projectId}/boq`)).body;
    expect(boq.version.versionNo).toBe(2);
    const cloned = boq.items[0];
    expect(cloned.tileCalc).toMatchObject({ tileName: "แกรนิตโต้ 60×60", priced: true });
    // แก้ห้องในเวอร์ชันใหม่ยังคิดวัสดุย่อยใหม่ได้
    const res = await owner.agent
      .patch(`/api/projects/${projectId}/boq/items/${cloned.id}`)
      .send({ takeoffRows: [{ ...bathroom, count: 2 }] });
    // ใช้เศษร่วมกัน 18 แผ่น × 1.03 = 18.54 → 19 แผ่น = 4.75 กล่อง ÷ 6
    expect(res.body.item.components[0].qtyPerUnit).toBe("0.7916");
  });

  it("คลังวัสดุเก็บขนาดกระเบื้อง · กว้างกับยาวต้องมาคู่กัน", async () => {
    const created = await owner.agent.post("/api/materials").send({
      name: "ทดสอบ แกรนิตโต้ 60x60",
      unit: "ตร.ม.",
      materialUnitPrice: 350,
      laborUnitPrice: 150,
      tileWidthMm: 600,
      tileLengthMm: 600,
      tileThicknessMm: 9.5,
      tilePiecesPerBox: 4,
    });
    expect(created.status).toBe(201);
    createdMaterialIds.push(created.body.material.id);
    expect(created.body.material).toMatchObject({ tileWidthMm: 600, tileThicknessMm: "9.5", tilePiecesPerBox: 4 });

    const half = await owner.agent.patch(`/api/materials/${created.body.material.id}`).send({ tileLengthMm: null });
    expect(half.status).toBe(400);
    const cleared = await owner.agent
      .patch(`/api/materials/${created.body.material.id}`)
      .send({ tileWidthMm: null, tileLengthMm: null });
    expect(cleared.body.material.tileWidthMm).toBeNull();
  });
});
