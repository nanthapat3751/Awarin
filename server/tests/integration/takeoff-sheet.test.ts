import ExcelJS from "exceljs";

import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

/**
 * ใบถอดแบบ (qtyBasis = SHEET) · ตัวคิดชิ้นส่วนโครงสร้าง (POST /boq/takeoff/apply) · หักช่องเปิดจากผนัง
 *
 * เฝ้า: ปริมาณที่บันทึก = ผลรวมแถวจริง · แถวไม่หายตอนแตกเวอร์ชัน · ลงบรรทัดเดิมแล้วปริมาณเดิมไม่หาย
 */
describe("ใบถอดแบบ", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCategoryIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-takeoff-owner");
    createdUserIds.push(owner.userId);
    const category = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบถอดแบบ" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: category.body.category.id, name: "กลุ่มทดสอบถอดแบบ" });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: subgroup.body.category.id, name: "งานโครงสร้างทดสอบ" });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);
  });

  afterAll(async () => {
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
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

  const footings = [
    { label: "F1", count: 8, length: 1.2, width: 1.2, height: 0.3 },
    { label: "F2", count: 4, length: 1, width: 1, height: 0.3 },
  ];

  function addSheetLine(projectId: string, body: Record<string, unknown> = {}) {
    return owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "คอนกรีตโครงสร้าง",
      unit: "ลบ.ม.",
      materialUnitPrice: 2000,
      laborUnitPrice: 500,
      qtyBasis: "SHEET",
      wasteFactorPct: 5,
      takeoffRows: footings,
      ...body,
    });
  }

  it("บรรทัดใหม่: ปริมาณ = ผลรวมแถว × เผื่อเสีย และแถวกลับมาตามลำดับ", async () => {
    const projectId = await newProject("ถอดแบบ 1");
    const res = await addSheetLine(projectId);
    expect(res.status).toBe(201);
    // (3.456 + 1.2) × 1.05 = 4.889 → × 2,500
    expect(res.body.item.quantity).toBe("4.889");
    expect(res.body.item.lineTotal).toBe("12222.5");
    expect(res.body.item.qtyCoefficient).toBeNull();

    const boq = await owner.agent.get(`/api/projects/${projectId}/boq`);
    const rows = boq.body.items[0].takeoffRows;
    expect(rows.map((r: { label: string }) => r.label)).toEqual(["F1", "F2"]);
    expect(rows[0]).toMatchObject({ count: "8", length: "1.2", width: "1.2", height: "0.3", deduct: false });
  });

  it("ปฏิเสธใบที่ใช้ไม่ได้ พร้อมบอกเหตุผล", async () => {
    const projectId = await newProject("ถอดแบบ 2");
    expect((await addSheetLine(projectId, { takeoffRows: [] })).status).toBe(400);

    const rebarOnConcrete = await addSheetLine(projectId, { takeoffRows: [{ label: "เหล็ก", count: 4, length: 6, barDia: 12 }] });
    expect(rebarOnConcrete.status).toBe(400);
    expect(rebarOnConcrete.body.error).toContain("กก.");

    const negative = await addSheetLine(projectId, {
      unit: "ตร.ม.",
      takeoffRows: [
        { label: "ผนัง", count: 1, length: 2, width: 1 },
        { label: "ช่องเปิด", count: 1, length: 3, width: 1, deduct: true },
      ],
    });
    expect(negative.status).toBe(400);
    expect(negative.body.error).toContain("แถวหัก");
  });

  it("แก้แถว = คิดใหม่ · แก้แค่ราคาแถวเดิมอยู่ · เปลี่ยนเป็นกรอกเองแถวหาย", async () => {
    const projectId = await newProject("ถอดแบบ 3");
    const itemId = (await addSheetLine(projectId, { wasteFactorPct: 0 })).body.item.id;
    const url = `/api/projects/${projectId}/boq/items/${itemId}`;

    const replaced = await owner.agent.patch(url).send({
      takeoffRows: [...footings, { label: "ส่วนซ้อนเสา", count: 8, length: 0.2, width: 0.2, height: 0.3, deduct: true }],
    });
    // 4.656 − 0.096
    expect(replaced.body.item.quantity).toBe("4.56");

    const priceOnly = await owner.agent.patch(url).send({ materialUnitPrice: 2100 });
    expect(priceOnly.body.item.quantity).toBe("4.56");
    expect(priceOnly.body.item.takeoffRows).toHaveLength(3);

    const manual = await owner.agent.patch(url).send({ qtyBasis: "MANUAL", quantity: 5 });
    expect(manual.body.item.quantity).toBe("5");
    expect(manual.body.item.takeoffRows).toEqual([]);
  });

  it("แก้หลังส่งใบเสนอราคา: เวอร์ชันใหม่ได้แถวครบ เวอร์ชันเดิมไม่ขยับ", async () => {
    const projectId = await newProject("ถอดแบบ 4");
    const itemId = (await addSheetLine(projectId)).body.item.id;
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);

    // แก้ราคาอย่างเดียว → แตกเวอร์ชัน: ใบถอดแบบต้องตามไปด้วย ไม่งั้นที่มาของปริมาณหาย
    const edited = await owner.agent.patch(`/api/projects/${projectId}/boq/items/${itemId}`).send({ laborUnitPrice: 600 });
    expect(edited.status).toBe(404); // id เดิมอยู่เวอร์ชันที่ส่งแล้ว — หน้าจอโหลดใหม่แล้วแก้บรรทัดในเวอร์ชันใหม่
    const boq = await owner.agent.get(`/api/projects/${projectId}/boq`);
    expect(boq.body.version.versionNo).toBe(2);
    expect(boq.body.items[0].qtyBasis).toBe("SHEET");
    expect(boq.body.items[0].takeoffRows).toHaveLength(2);
    expect(await prisma.boqTakeoffRow.count({ where: { boqItemId: itemId } })).toBe(2);
  });

  it("ตัวคิดโครงสร้าง: ต่อท้ายบรรทัดกรอกเองโดยเก็บปริมาณเดิม + สร้างบรรทัดเหล็กใหม่", async () => {
    const projectId = await newProject("ถอดแบบ 5");
    const manual = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "คอนกรีตเดิม",
      unit: "ลบ.ม.",
      quantity: 2,
      materialUnitPrice: 2000,
      laborUnitPrice: 0,
    });
    const res = await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send({
      targets: [
        { itemId: manual.body.item.id, rows: [{ label: "B1 คาน", count: 2, length: 4, width: 0.2, height: 0.4 }] },
        {
          newItem: { categoryId: itemCategoryId, name: "เหล็กข้ออ้อย DB12", unit: "กก.", materialUnitPrice: 25, laborUnitPrice: 5 },
          rows: [{ label: "B1 เหล็กบน 2-DB12", count: 4, length: 4, barDia: 12 }],
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ lines: 2, created: 1 });

    const items = (await owner.agent.get(`/api/projects/${projectId}/boq`)).body.items;
    const concrete = items.find((i: { name: string }) => i.name === "คอนกรีตเดิม");
    expect(concrete.qtyBasis).toBe("SHEET");
    // ปริมาณเดิม 2 + คาน 0.64
    expect(concrete.quantity).toBe("2.64");
    expect(concrete.takeoffRows[0]).toMatchObject({ label: "ปริมาณเดิม (กรอกเอง)", count: "2" });
    const rebar = items.find((i: { name: string }) => i.name === "เหล็กข้ออ้อย DB12");
    // 4 × 4 × 144/162 = 14.222 · บรรทัดเหล็กใหม่ได้เผื่อเสียตั้งต้นของชุดเสนอราคา DB12 9% → 15.502
    expect(rebar.wasteFactorPct).toBe("9");
    expect(rebar.quantity).toBe("15.502");
    expect(rebar.takeoffRows[0].barDia).toBe(12);
  });

  it("ตัวคิดโครงสร้างหลังส่งใบเสนอราคา: ลงบรรทัดในเวอร์ชันใหม่ ใบที่ส่งไปไม่ขยับ", async () => {
    const projectId = await newProject("ถอดแบบ 5b");
    const itemId = (await addSheetLine(projectId, { wasteFactorPct: 0 })).body.item.id;
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);

    const res = await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send({
      targets: [{ itemId, rows: [{ label: "F3", count: 2, length: 1, width: 1, height: 0.3 }] }],
    });
    expect(res.status).toBe(200);
    expect(res.body.version.versionNo).toBe(2);
    const items = (await owner.agent.get(`/api/projects/${projectId}/boq`)).body.items;
    expect(items[0].quantity).toBe("5.256");
    expect(items[0].takeoffRows).toHaveLength(3);
    // บรรทัดในเวอร์ชันที่ส่งไปแล้วยังเป็นของเดิม
    const original = await prisma.boqItem.findUniqueOrThrow({ where: { id: itemId }, include: { takeoffRows: true } });
    expect(original.quantity.toString()).toBe("4.656");
    expect(original.takeoffRows).toHaveLength(2);
  });

  it("ตัวคิดโครงสร้าง: บรรทัดที่คิดจากค่าวัดรับแถวไม่ได้ และไม่มีอะไรถูกเขียน", async () => {
    const projectId = await newProject("ถอดแบบ 6", { areaSqm: 100 });
    const driver = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "เทพื้น",
      unit: "ลบ.ม.",
      materialUnitPrice: 2000,
      qtyBasis: "PER_AREA",
      qtyCoefficient: 0.1,
    });
    const res = await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send({
      targets: [
        { newItem: { categoryId: itemCategoryId, name: "ไม้แบบ", unit: "ตร.ม.", materialUnitPrice: 300 }, rows: [{ label: "B1", count: 1, length: 4, width: 1 }] },
        { itemId: driver.body.item.id, rows: [{ label: "B1", count: 1, length: 4, width: 0.2, height: 0.4 }] },
      ],
    });
    expect(res.status).toBe(409);
    expect((await owner.agent.get(`/api/projects/${projectId}/boq`)).body.items).toHaveLength(1);
  });

  it("Excel ฉบับภายในมีชีตใบถอดแบบ และไฟล์ยังนำเข้ากลับได้ (ตัวนำเข้าข้ามชีตสรุป/ใบถอดแบบเอง)", async () => {
    const projectId = await newProject("ถอดแบบ Excel");
    await addSheetLine(projectId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    };
    const file = await owner.agent.get(`/api/projects/${projectId}/boq/export.xlsx`).buffer(true).parse(binary);
    expect(file.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.body as unknown as ArrayBuffer);
    const names = wb.worksheets.filter((w) => w.state === "visible").map((w) => w.name);
    expect(names).toHaveLength(3);
    expect(names[0]).toBe("สรุป");
    expect(names.slice(2)).toEqual(["ใบถอดแบบ"]);
    const texts: string[] = [];
    wb.getWorksheet("ใบถอดแบบ")!.eachRow((row) => row.eachCell((c) => texts.push(String(c.text))));
    expect(texts).toEqual(expect.arrayContaining(["F1", "F2", "ปริมาณที่ใช้ (ลบ.ม.)"]));

    const preview = await owner.agent
      .post(`/api/projects/${projectId}/boq/import/preview`)
      .attach("file", file.body as Buffer, "export.xlsx");
    expect(preview.status).toBe(200);
    expect(preview.body.rows).toHaveLength(1);
    expect(preview.body.rows[0]).toMatchObject({ name: "คอนกรีตโครงสร้าง", quantity: 4.889 });
  });

  it("ช่องเปิดหักจากพื้นที่ผนัง: บรรทัดคิดต่อผนังลดตาม · ล้างแล้วกลับเหมือนเดิม", async () => {
    const projectId = await newProject("ถอดแบบ 7", { wallAreaSqm: 100 });
    const line = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "ก่ออิฐ",
      unit: "ตร.ม.",
      materialUnitPrice: 200,
      qtyBasis: "PER_WALL_AREA",
      qtyCoefficient: 1,
      wasteFactorPct: 0,
    });
    expect(line.body.item.quantity).toBe("100");
    const qty = async () => (await owner.agent.get(`/api/projects/${projectId}/boq`)).body.items[0].quantity;

    const set = await owner.agent.patch(`/api/projects/${projectId}`).send({
      openings: [
        { label: "D1", count: 2, width: 0.9, height: 2 },
        { label: "W1", count: 3, width: 1.2, height: 1 },
      ],
    });
    expect(set.status).toBe(200);
    expect(set.body.project.openingAreaSqm).toBe("7.2");
    expect(set.body.project.openings).toHaveLength(2);
    expect(await qty()).toBe("92.8");

    const tooBig = await owner.agent.patch(`/api/projects/${projectId}`).send({
      openings: [{ label: "ผนังกระจก", count: 1, width: 10, height: 10 }],
    });
    expect(tooBig.status).toBe(400);

    const cleared = await owner.agent.patch(`/api/projects/${projectId}`).send({ openings: [] });
    expect(cleared.body.project.openingAreaSqm).toBeNull();
    expect(cleared.body.project.openings).toBeNull();
    expect(await qty()).toBe("100");
  });
});
