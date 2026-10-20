import ExcelJS from "exceljs";

import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function binary(res: any, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
}

/**
 * นำเข้า BOQ จาก Excel: พรีวิว (ไม่เขียน) → ยืนยัน (เขียนทั้งชุด)
 *
 * สิ่งที่ต้องไม่เกิด: นำเข้าราคาขายเป็นราคาทุน · แถวสรุป/หัวหมวดกลายเป็นงาน · แก้เวอร์ชันที่ส่งไปแล้ว
 */
describe("นำเข้า BOQ จาก Excel", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemA: { id: string; code: string };
  let itemB: { id: string; code: string };
  let subgroup: { id: string; code: string };
  const createdMaterialIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCategoryIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-import-owner");
    createdUserIds.push(owner.userId);
    const category = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบนำเข้า" });
    createdCategoryIds.push(category.body.category.id);
    const sub = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: category.body.category.id, name: "กลุ่มทดสอบนำเข้า" });
    createdCategoryIds.push(sub.body.category.id);
    subgroup = { id: sub.body.category.id, code: sub.body.category.code };
    for (const name of ["งานนำเข้า ก", "งานนำเข้า ข"]) {
      const item = await owner.agent.post("/api/categories").send({ level: "ITEM", parentId: sub.body.category.id, name });
      createdCategoryIds.push(item.body.category.id);
    }
    const items = await prisma.workCategory.findMany({ where: { id: { in: createdCategoryIds }, level: "ITEM" }, orderBy: { name: "asc" } });
    itemA = { id: items[0].id, code: items[0].code! };
    itemB = { id: items[1].id, code: items[1].code! };
  });

  afterAll(async () => {
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    // วัสดุ/รหัสงานที่การนำเข้าสร้างให้ (อยู่ใต้หมวดย่อยทดสอบ) + ที่เทสต์สร้างเอง
    await prisma.material.deleteMany({ where: { OR: [{ id: { in: createdMaterialIds } }, { category: { parentId: subgroup.id } }] } });
    await prisma.workCategory.deleteMany({ where: { parentId: subgroup.id, id: { notIn: createdCategoryIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function newProject(name: string) {
    const res = await owner.agent.post("/api/projects").send({ name });
    createdProjectIds.push(res.body.project.id);
    return res.body.project.id as string;
  }

  async function xlsx(rows: unknown[][]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("BOQ");
    for (const r of rows) ws.addRow(r);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  const HEADER = ["รหัส", "รายการ", "ปริมาณ", "หน่วย", "ค่าวัสดุ/หน่วย", "ค่าแรง/หน่วย", "หมายเหตุ"];

  const preview = (projectId: string, file: Buffer, name = "boq.xlsx", defaultCategoryId?: string) => {
    const req = owner.agent.post(`/api/projects/${projectId}/boq/import/preview`).attach("file", file, name);
    return defaultCategoryId ? req.field("defaultCategoryId", defaultCategoryId) : req;
  };

  type Row = { errors: string[]; categoryId: string; name: string; quantity: number; unit: string; materialUnitPrice: number; laborUnitPrice: number; note: string | null };
  const commitRows = (rows: Row[]) =>
    rows
      .filter((r) => r.errors.length === 0)
      .map(({ categoryId, name, quantity, unit, materialUnitPrice, laborUnitPrice, note }) => ({ categoryId, name, quantity, unit, materialUnitPrice, laborUnitPrice, note }));

  it("ส่งออกฉบับภายในแล้วนำกลับเข้าอีกโครงการ: ได้บรรทัดและต้นทุนตรงเท่ากันทุกสตางค์", async () => {
    const source = await newProject("นำเข้า ต้นทาง");
    for (const [cat, name, quantity, m, l] of [
      [itemA.id, "เทคอนกรีต", 12.5, 2400, 500.35],
      [itemB.id, "ก่ออิฐ \"ครึ่งแผ่น\"", 133.37, 220.1, 180],
      [itemA.id, "เดินท่อ", 7, 3500, 499.99],
    ] as const) {
      await owner.agent.post(`/api/projects/${source}/boq/items`).send({ categoryId: cat, name, quantity, unit: "หน่วย", materialUnitPrice: m, laborUnitPrice: l, note: "หมายเหตุ" });
    }
    await owner.agent.patch(`/api/projects/${source}/rates`).send({ roundingUnit: 1000, discount: { mode: "PERCENT", value: 5 } });
    const exported = await owner.agent.get(`/api/projects/${source}/boq/export.xlsx`).buffer(true).parse(binary);

    const target = await newProject("นำเข้า ปลายทาง");
    const pv = await preview(target, exported.body);
    expect(pv.status).toBe(200);
    // แถวหัวหมวด แถวรวมหมวด ยอดท้ายใบ และแถวช่วยคำนวณที่ซ่อนไว้ ต้องไม่ถูกนับเป็นงาน
    expect(pv.body.summary).toMatchObject({ total: 3, ready: 3, withErrors: 0 });

    const commit = await owner.agent.post(`/api/projects/${target}/boq/import`).send({ mode: "append", rows: commitRows(pv.body.rows) });
    expect(commit.status).toBe(201);
    expect(commit.body.imported).toBe(3);

    const [src, dst] = await Promise.all(
      [source, target].map(async (id) => (await owner.agent.get(`/api/projects/${id}`)).body.currentVersion),
    );
    expect(dst.directCost).toBe(src.directCost);
    const lines = await prisma.boqItem.findMany({ where: { projectVersionId: dst.id }, orderBy: { sortOrder: "asc" } });
    expect(lines.map((l) => l.name).sort()).toEqual(["เทคอนกรีต", "เดินท่อ", 'ก่ออิฐ "ครึ่งแผ่น"'].sort());
    expect(lines.every((l) => l.note === "หมายเหตุ" && l.materialId === null && l.qtyBasis === "MANUAL")).toBe(true);
  });

  it("ไม่รับไฟล์ฉบับลูกค้า (ราคาขาย) — กันกำไรถูกบวกซ้ำ", async () => {
    const source = await newProject("นำเข้า ใบลูกค้า");
    await owner.agent.post(`/api/projects/${source}/boq/items`).send({ categoryId: itemA.id, name: "งาน", quantity: 1, unit: "หน่วย", materialUnitPrice: 100, laborUnitPrice: 0 });
    const quote = await owner.agent.post(`/api/projects/${source}/quotes`).send({});
    const file = await owner.agent.get(`/api/projects/${source}/quotes/${quote.body.quote.id}/export.xlsx`).buffer(true).parse(binary);
    const res = await preview(source, file.body);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("ราคาขาย");
  });

  it("พรีวิวบอกปัญหารายแถว และใช้หมวดสำรองกับแถวที่ไม่มี/ผิดรหัส", async () => {
    const projectId = await newProject("นำเข้า ตรวจแถว");
    const file = await xlsx([
      ["ไฟล์จากผู้รับเหมาช่วง"],
      [],
      HEADER,
      [itemA.code, "แถวดี", 10, "ตร.ม.", "1,234.50", 100, ""],
      ["ZZ-99-99", "รหัสผิด", 5, "ชุด", 100, 0, ""],
      ["", "ไม่มีรหัส", 2, "ชุด", 50, 0, ""],
      [itemA.code, "ปริมาณศูนย์", 0, "ชุด", 50, 0, ""],
      [itemA.code, "ปริมาณข้อความ", "สิบ", "ชุด", 50, 0, ""],
      [itemA.code, "ราคาติดลบ", 1, "ชุด", -5, 0, ""],
      [itemA.code, "ไม่มีหน่วย", 1, "", 5, 0, ""],
      [itemA.code, "ไม่มีราคา", 1, "ชุด", null, null, ""],
      ["", "รวมทั้งหมด", null, null, null, null, null],
    ]);

    const strict = await preview(projectId, file);
    expect(strict.status).toBe(200);
    const byName = (rows: { name: string }[], n: string) => rows.find((r) => r.name === n) as { errors: string[]; warnings: string[]; categoryId: string | null; materialUnitPrice: number } | undefined;
    const s = strict.body.rows;
    expect(byName(s, "รวมทั้งหมด")).toBeUndefined();
    expect(byName(s, "แถวดี")!.errors).toEqual([]);
    expect(byName(s, "แถวดี")!.materialUnitPrice).toBe(1234.5);
    // รหัสไม่รู้จัก/ไม่มีรหัส ไม่ใช่ข้อมูลเสีย — ให้คนเลือกรหัสงานในพรีวิว (needsCategory) ไม่ใช่ error
    const needs = (n: string) => (s.find((r: { name: string }) => r.name === n) as { needsCategory: boolean }).needsCategory;
    expect(byName(s, "รหัสผิด")!.errors).toEqual([]);
    expect(byName(s, "รหัสผิด")!.warnings.join()).toContain("ไม่พบหมวดงานรหัส ZZ-99-99");
    expect(needs("รหัสผิด")).toBe(true);
    expect(byName(s, "ไม่มีรหัส")!.errors).toEqual([]);
    expect(needs("ไม่มีรหัส")).toBe(true);
    expect(byName(s, "ปริมาณศูนย์")!.errors.join()).toContain("มากกว่า 0");
    expect(byName(s, "ปริมาณข้อความ")!.errors.join()).toContain("ไม่ใช่ตัวเลข");
    expect(byName(s, "ราคาติดลบ")!.errors.join()).toContain("ติดลบ");
    expect(byName(s, "ไม่มีหน่วย")!.errors.join()).toContain("หน่วย");
    expect(byName(s, "ไม่มีราคา")!.errors.join()).toContain("ไม่มีราคา");
    expect(strict.body.summary).toMatchObject({ total: 8, ready: 1, withErrors: 5, needsCategory: 2 });

    const lenient = await preview(projectId, file, "boq.xlsx", itemB.id);
    const l = lenient.body.rows;
    expect(byName(l, "รหัสผิด")!.errors).toEqual([]);
    expect(byName(l, "รหัสผิด")!.categoryId).toBe(itemB.id);
    expect(byName(l, "รหัสผิด")!.warnings.join()).toContain("ZZ-99-99");
    expect(byName(l, "ไม่มีรหัส")!.categoryId).toBe(itemB.id);

    // พรีวิวไม่เขียนอะไรลงโครงการ
    const version = (await owner.agent.get(`/api/projects/${projectId}`)).body.currentVersion;
    expect(await prisma.boqItem.count({ where: { projectVersionId: version.id } })).toBe(0);
  });

  it("แทนที่ทั้งหมด vs ต่อท้าย · เวอร์ชันที่ส่งใบเสนอราคาแล้วไม่ถูกแตะ", async () => {
    const projectId = await newProject("นำเข้า แทนที่");
    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({ categoryId: itemA.id, name: "บรรทัดเดิม", quantity: 1, unit: "ชุด", materialUnitPrice: 1000, laborUnitPrice: 0 });
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);
    const v1 = (await owner.agent.get(`/api/projects/${projectId}`)).body.currentVersion;

    const rows = [{ categoryId: itemB.id, name: "บรรทัดใหม่", quantity: 2, unit: "ชุด", materialUnitPrice: 300, laborUnitPrice: 50 }];
    const replaced = await owner.agent.post(`/api/projects/${projectId}/boq/import`).send({ mode: "replace", rows });
    expect(replaced.status).toBe(201);
    expect(replaced.body.version.versionNo).toBe(2);
    expect(replaced.body.removed).toBe(1);
    expect(Number(replaced.body.version.directCost)).toBe(700);

    // เวอร์ชันที่ส่งไปแล้วยังมีบรรทัดเดิมครบ
    expect((await prisma.boqItem.findMany({ where: { projectVersionId: v1.id } })).map((i) => i.name)).toEqual(["บรรทัดเดิม"]);

    const appended = await owner.agent.post(`/api/projects/${projectId}/boq/import`).send({ mode: "append", rows });
    expect(Number(appended.body.version.directCost)).toBe(1400);
    expect(appended.body.removed).toBe(0);

    const audit = await prisma.auditLog.findFirst({ where: { action: "IMPORT_BOQ_EXCEL", entityId: appended.body.version.id }, orderBy: { createdAt: "desc" } });
    expect(audit?.details).toMatchObject({ mode: "append", imported: 1 });
  });

  it("ยืนยันนำเข้า 1,500 บรรทัดได้ในคำขอเดียว (เกินเพดาน JSON ปกติ 100 KB)", async () => {
    const projectId = await newProject("นำเข้า ก้อนใหญ่");
    const rows = Array.from({ length: 1500 }, (_, i) => ({
      categoryId: itemA.id,
      name: `งานทดสอบลำดับที่ ${i + 1} รายละเอียดยาวพอประมาณสำหรับวัดขนาด`,
      quantity: 1,
      unit: "ชุด",
      materialUnitPrice: 10,
      laborUnitPrice: 0,
    }));
    const res = await owner.agent.post(`/api/projects/${projectId}/boq/import`).send({ mode: "append", rows });
    expect(res.status).toBe(201);
    expect(Number(res.body.version.directCost)).toBe(15000);
  });

  it("ไฟล์ผิดชนิด / เปิดไม่ได้ / หมวดที่ไม่มี / สิทธิ์", async () => {
    const projectId = await newProject("นำเข้า กันพลาด");
    expect((await preview(projectId, Buffer.from("a,b,c"), "boq.csv")).status).toBe(400);
    const broken = await preview(projectId, Buffer.from("not really a zip"), "boq.xlsx");
    expect(broken.status).toBe(400);
    expect(broken.body.error).toContain(".xlsx");
    const noHeader = await preview(projectId, await xlsx([["อะไรก็ไม่รู้"], [1, 2, 3]]));
    expect(noHeader.body.error).toContain("ไม่พบหัวตาราง");

    const ghost = await owner.agent.post(`/api/projects/${projectId}/boq/import`).send({
      mode: "append",
      rows: [{ categoryId: "does-not-exist", name: "x", quantity: 1, unit: "ชุด", materialUnitPrice: 1, laborUnitPrice: 0 }],
    });
    expect(ghost.status).toBe(409);
    expect((await owner.agent.post(`/api/projects/${projectId}/boq/import`).send({ mode: "append", rows: [] })).status).toBe(400);

    const admin = await createAndLoginAdmin("test-import-admin");
    createdUserIds.push(admin.userId);
    expect((await admin.agent.get(`/api/projects/${projectId}/boq/import/template.xlsx`)).status).toBe(200);
    const customer = await createAndLoginCustomer("test-import-customer");
    createdUserIds.push((await customer.agent.get("/api/auth/me")).body.user.id);
    expect([401, 403]).toContain(
      (await customer.agent.post(`/api/projects/${projectId}/boq/import`).send({ mode: "append", rows: [] })).status,
    );
  });

  it("ของที่ไม่รู้จัก (B+D): เสนอรหัสใหม่ใต้หมวดย่อยแม่ · จับคู่คลังที่ชื่อ+หน่วยตรง · สร้าง/ผูกตอนยืนยัน", async () => {
    const projectId = await newProject("นำเข้า ของใหม่");
    const lib = await owner.agent
      .post("/api/materials")
      .send({ categoryId: itemA.id, name: "คอนกรีตทดสอบนำเข้า 240", unit: "ลบ.ม.", materialUnitPrice: 2400, laborUnitPrice: 450 });
    createdMaterialIds.push(lib.body.material.id);
    const newCode = `${subgroup.code}-91`;

    const file = await xlsx([
      HEADER,
      // ชื่อ+หน่วยตรงกับคลัง (หน่วยเขียนต่างแบบได้) ไม่มีรหัส → ผูกคลัง + ใช้รหัสงานของวัสดุ
      ["", "คอนกรีตทดสอบนำเข้า 240", 3, "ลบม.", 2500, 450, ""],
      // รหัสใหม่ใต้หมวดย่อยที่มีอยู่ → เสนอสร้างรหัสนี้ (สองบรรทัดรหัสเดียวกัน)
      [newCode, "งานใหม่จากข้างนอก", 2, "ชุด", 100, 50, ""],
      [newCode, "งานใหม่จากข้างนอก", 1, "ชุด", 100, 50, "ชั้น 2"],
      // ชื่อคล้ายแต่ไม่ตรง → ไม่ผูกเอง
      [itemA.code, "คอนกรีตทดสอบนำเข้า 240 พิเศษ", 1, "ลบ.ม.", 2600, 450, ""],
    ]);
    const pv = await preview(projectId, file);
    expect(pv.status).toBe(200);
    const [matchedRow, newA, newB, similar] = pv.body.rows;
    expect(matchedRow).toMatchObject({ categoryId: itemA.id, needsCategory: false, materialMatch: { id: lib.body.material.id } });
    expect(newA).toMatchObject({ categoryId: null, needsCategory: false, newCode: { code: newCode, parentId: subgroup.id } });
    expect(newB.newCode.code).toBe(newCode);
    expect(similar.materialMatch).toBeNull();
    expect(pv.body.summary).toMatchObject({ total: 4, ready: 4, newCodes: 2, matched: 1, needsCategory: 0 });
    expect(await prisma.workCategory.count({ where: { code: newCode } })).toBe(0); // พรีวิวไม่สร้างอะไร

    const commit = await owner.agent.post(`/api/projects/${projectId}/boq/import`).send({
      mode: "append",
      rows: [
        { categoryId: itemA.id, materialId: lib.body.material.id, name: matchedRow.name, quantity: 3, unit: "ลบม.", materialUnitPrice: 2500, laborUnitPrice: 450 },
        { newCategory: { parentId: subgroup.id, code: newCode }, addToLibrary: true, name: newA.name, quantity: 2, unit: "ชุด", materialUnitPrice: 100, laborUnitPrice: 50 },
        { newCategory: { parentId: subgroup.id, code: newCode }, addToLibrary: true, name: newB.name, quantity: 1, unit: "ชุด", materialUnitPrice: 100, laborUnitPrice: 50, note: "ชั้น 2" },
        // สร้างรหัสใหม่โดยไม่ระบุรหัส → ระบบต่อเลขให้ · ไม่เพิ่มเข้าคลัง
        { newCategory: { parentId: subgroup.id, code: null }, name: "งานครั้งเดียว", quantity: 1, unit: "งาน", materialUnitPrice: 0, laborUnitPrice: 500 },
      ],
    });
    expect(commit.status).toBe(201);
    expect(commit.body.createdCategories.map((c: { code: string }) => c.code)).toEqual([newCode, expect.stringMatching(new RegExp(`^${subgroup.code}-\\d{2}$`))]);
    expect(commit.body.createdMaterials).toHaveLength(1); // สองบรรทัดชื่อ/หน่วย/รหัสเดียวกัน = วัสดุเดียว
    expect(commit.body.linkedMaterials).toBe(1);

    const created = await prisma.workCategory.findUniqueOrThrow({ where: { code: newCode } });
    expect(created).toMatchObject({ level: "ITEM", parentId: subgroup.id, name: "งานใหม่จากข้างนอก" });
    const newMaterial = await prisma.material.findFirstOrThrow({ where: { categoryId: created.id } });
    expect(newMaterial).toMatchObject({ name: "งานใหม่จากข้างนอก", unit: "ชุด" });
    expect(Number(newMaterial.materialUnitPrice)).toBe(100);

    const version = (await owner.agent.get(`/api/projects/${projectId}`)).body.currentVersion;
    const lines = await prisma.boqItem.findMany({ where: { projectVersionId: version.id }, orderBy: { sortOrder: "asc" } });
    expect(lines.map((l) => [l.categoryId === created.id, l.materialId])).toEqual([
      [false, lib.body.material.id],
      [true, newMaterial.id],
      [true, newMaterial.id],
      [false, null],
    ]);
    // ผูกคลังแล้วราคายังตามไฟล์ ไม่ถูกราคาคลังทับ
    expect(Number(lines[0].materialUnitPrice)).toBe(2500);
    expect(lines[3].categoryId).not.toBe(created.id);
    expect((await prisma.workCategory.findUniqueOrThrow({ where: { id: lines[3].categoryId } })).parentId).toBe(subgroup.id);

    // รหัสเดิมถูกใช้แล้ว → ให้พรีวิวใหม่ ไม่สร้างซ้ำ · ผูกวัสดุที่ไม่มีจริง → 409 · เลือกสองทางพร้อมกัน → 400
    const again = await owner.agent.post(`/api/projects/${projectId}/boq/import`).send({
      mode: "append",
      rows: [{ newCategory: { parentId: subgroup.id, code: newCode }, name: "ซ้ำ", quantity: 1, unit: "ชุด", materialUnitPrice: 1, laborUnitPrice: 0 }],
    });
    expect(again.status).toBe(409);
    const ghost = await owner.agent.post(`/api/projects/${projectId}/boq/import`).send({
      mode: "append",
      rows: [{ categoryId: itemA.id, materialId: "nope", name: "x", quantity: 1, unit: "ชุด", materialUnitPrice: 1, laborUnitPrice: 0 }],
    });
    expect(ghost.status).toBe(409);
    const both = await owner.agent.post(`/api/projects/${projectId}/boq/import`).send({
      mode: "append",
      rows: [{ categoryId: itemA.id, newCategory: { parentId: subgroup.id, code: null }, name: "x", quantity: 1, unit: "ชุด", materialUnitPrice: 1, laborUnitPrice: 0 }],
    });
    expect(both.status).toBe(400);
  });

  /** แก้ไฟล์ส่งออก: หาแถวจากชื่อในคอลัมน์ "รายการ" (B) ของชีตหมวด */
  async function editExport(body: Buffer, edit: (find: (name: string) => ExcelJS.Row, sheet: ExcelJS.Worksheet) => void) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(body as unknown as ArrayBuffer);
    const sheet = wb.worksheets.find((w) => w.state === "visible" && w.name !== "สรุป" && w.name !== "รายการสั่งซื้อ")!;
    const find = (name: string) => {
      let found: ExcelJS.Row | undefined;
      sheet.eachRow((row) => {
        if (row.getCell(2).value === name) found = row;
      });
      if (!found) throw new Error(`ไม่พบแถว ${name}`);
      return found;
    };
    edit(find, sheet);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async function lineSnapshot(projectId: string) {
    const version = (await owner.agent.get(`/api/projects/${projectId}`)).body.currentVersion;
    const lines = await prisma.boqItem.findMany({ where: { projectVersionId: version.id }, orderBy: { sortOrder: "asc" } });
    return { version, lines };
  }

  it("ส่งออก → แก้ข้างนอก → นำกลับเป็นการแก้ (F): แก้/เพิ่ม/ลบ/เหมือนเดิม · ใบถอดแบบเปลี่ยนเป็นกรอกเอง", async () => {
    const projectId = await newProject("นำเข้า อัปเดตตามไฟล์");
    for (const [name, quantity, m, l] of [
      ["งานคงเดิม", 5, 100, 10],
      ["งานแก้ปริมาณ", 10, 200, 20],
      ["งานแก้ราคา", 1, 300, 30],
      ["งานจะถูกลบ", 2, 400, 40],
    ] as const) {
      await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({ categoryId: itemA.id, name, quantity, unit: "ชุด", materialUnitPrice: m, laborUnitPrice: l });
    }
    // บรรทัดที่ปริมาณมาจากใบถอดแบบ — แก้ปริมาณในไฟล์ต้องกลายเป็นกรอกเอง
    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemB.id, name: "งานถอดแบบ", unit: "ลบ.ม.", materialUnitPrice: 50, laborUnitPrice: 5,
      qtyBasis: "SHEET", takeoffRows: [{ label: "F1", count: 2, length: 1, width: 1, height: 1 }],
    });
    const before = await lineSnapshot(projectId);
    const exported = await owner.agent.get(`/api/projects/${projectId}/boq/export.xlsx`).buffer(true).parse(binary);

    const edited = await editExport(exported.body, (find, sheet) => {
      find("งานแก้ปริมาณ").getCell(3).value = 12.5;
      find("งานแก้ราคา").getCell(5).value = 350;
      find("งานจะถูกลบ").getCell(2).value = null; // ลบแถวในไฟล์
      find("งานถอดแบบ").getCell(3).value = 7;
      // คอลัมน์ไฟล์ส่งออก: รหัส | รายการ | ปริมาณ | หน่วย | ค่าวัสดุ/หน่วย | ค่าวัสดุ | ค่าแรง/หน่วย | ค่าแรง | รวม | หมายเหตุ
      sheet.addRow([itemB.code, "งานเพิ่มข้างนอก", 3, "ชุด", 150, null, 15, null, null, "ใหม่"]);
      // คัดลอกแถวเดิมมาทั้งแถว (id ซ้ำ) → ต้องเป็นบรรทัดใหม่ ไม่ใช่แก้ทับ
      const copy = find("งานคงเดิม");
      sheet.addRow([copy.getCell(1).value, "งานคงเดิม สำเนา", 1, "ชุด", 100, 10, "", null, null, "", copy.getCell(11).value]);
    });

    const pv = await preview(projectId, edited);
    expect(pv.status).toBe(200);
    expect(pv.body.fromOtherProject).toBe(false);
    expect(pv.body.sync).toMatchObject({ counts: { changed: 3, unchanged: 1, added: 2, removed: 1 } });
    expect(pv.body.sync.removed.map((r: { name: string }) => r.name)).toEqual(["งานจะถูกลบ"]);
    const row = (name: string) => pv.body.rows.find((r: { name: string }) => r.name === name);
    expect(row("งานแก้ปริมาณ").sync.changes).toEqual([{ field: "quantity", before: 10, after: 12.5 }]);
    expect(row("งานแก้ราคา").sync.changes).toEqual([{ field: "materialUnitPrice", before: 300, after: 350 }]);
    expect(row("งานคงเดิม").sync.status).toBe("unchanged");
    expect(row("งานถอดแบบ").warnings.join()).toContain("กรอกปริมาณเอง");
    expect(row("งานคงเดิม สำเนา").sync.status).toBe("added");
    expect(row("งานคงเดิม สำเนา").warnings.join()).toContain("ซ้ำกับบรรทัดเดิม");

    // ยืนยันแบบที่หน้าจอส่ง: เฉพาะแถวที่แก้ + แถวใหม่ + ลบ
    const toCommit = pv.body.rows
      .filter((r: { sync: { status: string } }) => r.sync.status === "changed" || r.sync.status === "added")
      .map((r: { sync: { status: string; lineId: string | null }; categoryId: string; name: string; quantity: number; unit: string; materialUnitPrice: number; laborUnitPrice: number; note: string | null }) => ({
        ...(r.sync.lineId ? { lineId: r.sync.lineId } : {}),
        categoryId: r.categoryId,
        name: r.name,
        quantity: r.quantity,
        unit: r.unit,
        materialUnitPrice: r.materialUnitPrice,
        laborUnitPrice: r.laborUnitPrice,
        note: r.note,
      }));
    const commit = await owner.agent
      .post(`/api/projects/${projectId}/boq/import`)
      .send({ mode: "sync", rows: toCommit, removeLineIds: pv.body.sync.removed.map((r: { lineId: string }) => r.lineId) });
    expect(commit.status).toBe(201);
    expect(commit.body).toMatchObject({ updated: 3, imported: 2, removed: 1 });

    const after = await lineSnapshot(projectId);
    expect(after.version.id).toBe(before.version.id); // ยังไม่ส่งใบเสนอราคา → แก้เวอร์ชันเดิม
    const byName = new Map(after.lines.map((l) => [l.name, l]));
    expect(byName.has("งานจะถูกลบ")).toBe(false);
    // บรรทัดเดิมถูกแก้ในที่เดิม (id เดิม) ไม่ใช่ลบแล้วสร้างใหม่
    const keepId = before.lines.find((l) => l.name === "งานแก้ปริมาณ")!.id;
    expect(byName.get("งานแก้ปริมาณ")!.id).toBe(keepId);
    expect(Number(byName.get("งานแก้ปริมาณ")!.quantity)).toBe(12.5);
    expect(Number(byName.get("งานแก้ราคา")!.materialUnitPrice)).toBe(350);
    const sheetLine = byName.get("งานถอดแบบ")!;
    expect(sheetLine.qtyBasis).toBe("MANUAL");
    expect(Number(sheetLine.quantity)).toBe(7);
    expect(await prisma.boqTakeoffRow.count({ where: { boqItemId: sheetLine.id } })).toBe(0);
    expect(byName.get("งานเพิ่มข้างนอก")!.note).toBe("ใหม่");
    expect(byName.has("งานคงเดิม สำเนา")).toBe(true);
    expect(after.lines).toHaveLength(6);
  });

  it("F: เวอร์ชันส่งใบเสนอราคาไปแล้ว → แตกเวอร์ชันใหม่แล้วแก้ตามสายคัดลอก · ไฟล์จากโครงการอื่น = เพิ่มใหม่", async () => {
    const projectId = await newProject("นำเข้า อัปเดตหลังส่ง");
    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({ categoryId: itemA.id, name: "งานเดิม", quantity: 4, unit: "ชุด", materialUnitPrice: 100, laborUnitPrice: 0 });
    const exported = await owner.agent.get(`/api/projects/${projectId}/boq/export.xlsx`).buffer(true).parse(binary);
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);
    const v1 = (await lineSnapshot(projectId)).version;

    const edited = await editExport(exported.body, (find) => {
      find("งานเดิม").getCell(3).value = 6;
    });
    const pv = await preview(projectId, edited);
    expect(pv.body.sync.counts).toMatchObject({ changed: 1, removed: 0 });
    const r = pv.body.rows[0];
    const commit = await owner.agent.post(`/api/projects/${projectId}/boq/import`).send({
      mode: "sync",
      rows: [{ lineId: r.sync.lineId, categoryId: r.categoryId, name: r.name, quantity: r.quantity, unit: r.unit, materialUnitPrice: r.materialUnitPrice, laborUnitPrice: r.laborUnitPrice, note: r.note }],
    });
    expect(commit.status).toBe(201);
    const after = await lineSnapshot(projectId);
    expect(after.version.versionNo).toBe(v1.versionNo + 1);
    expect(after.lines).toHaveLength(1);
    expect(Number(after.lines[0].quantity)).toBe(6);
    // เวอร์ชันที่ส่งไปแล้วไม่ถูกแตะ
    expect(Number((await prisma.boqItem.findFirstOrThrow({ where: { projectVersionId: v1.id } })).quantity)).toBe(4);

    // ไฟล์เดิม (id ของเวอร์ชัน 1) นำเข้าอีกครั้งหลังแตกเวอร์ชัน ยังจับคู่ได้ผ่านสายคัดลอก
    const again = await preview(projectId, edited);
    expect(again.body.sync.counts).toMatchObject({ unchanged: 1, changed: 0, removed: 0 });

    // ไฟล์จากโครงการอื่น — ไม่เทียบ ไม่ลบอะไร นำเข้าเป็นบรรทัดใหม่
    const other = await newProject("นำเข้า โครงการอื่น");
    const fromOther = await preview(other, edited);
    expect(fromOther.body.fromOtherProject).toBe(true);
    expect(fromOther.body.sync).toBeNull();
    // โหมด sync ใช้กับไฟล์ที่ไม่มีบรรทัดเดิมไม่ได้
    const bad = await owner.agent.post(`/api/projects/${other}/boq/import`).send({
      mode: "append",
      rows: [{ lineId: r.sync.lineId, categoryId: itemA.id, name: "x", quantity: 1, unit: "ชุด", materialUnitPrice: 1, laborUnitPrice: 0 }],
    });
    expect(bad.status).toBe(400);
  });

  it("แม่แบบนำเข้าอ่านกลับได้ และไม่มีแถวตัวอย่างที่จะถูกนำเข้าเป็นงานจริง", async () => {
    const projectId = await newProject("นำเข้า แม่แบบ");
    const template = await owner.agent.get(`/api/projects/${projectId}/boq/import/template.xlsx`).buffer(true).parse(binary);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(template.body as unknown as ArrayBuffer);
    expect(wb.getWorksheet("รหัสหมวดงาน")).toBeDefined();

    const empty = await preview(projectId, template.body);
    expect(empty.status).toBe(400);
    expect(empty.body.error).toContain("ไม่พบบรรทัดรายการ");

    // กรอกหนึ่งแถวใต้หัวตารางแล้วนำเข้าได้
    const ws = wb.getWorksheet("BOQ")!;
    ws.addRow([itemA.code, "งานจากแม่แบบ", 3, "ชุด", 100, 20, ""]);
    const filled = await preview(projectId, Buffer.from(await wb.xlsx.writeBuffer()));
    expect(filled.body.summary).toMatchObject({ total: 1, ready: 1, directCost: 360 });
  });
});
