import ExcelJS from "exceljs";

import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

/**
 * ส่งออก BOQ เป็น Excel
 *
 * - ฉบับภายใน: ราคาทุนครบ (ยอดเป็นสูตร — ความถูกต้องของสูตรตรวจด้วย
 *   HyperFormula ตอนพัฒนา ดูบันทึกงาน) · เฉพาะพนักงาน
 * - ฉบับลูกค้า: **ห้ามมีราคาทุน** และตัวเลขต้องตรงกับใบเสนอราคาของลูกค้า
 */
describe("ส่งออก BOQ เป็น Excel", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCategoryIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-xlsx-owner");
    createdUserIds.push(owner.userId);
    const category = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบ Excel" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: category.body.category.id, name: "กลุ่มทดสอบ Excel" });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: subgroup.body.category.id, name: "รายการทดสอบ Excel" });
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

  /** supertest ไม่แปลง binary เอง — ต้องเก็บเป็น Buffer (แบบเดียวกับ custom-project-attachments.test.ts) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function binary(res: any, cb: (err: Error | null, body: Buffer) => void) {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => cb(null, Buffer.concat(chunks)));
  }

  async function workbookOf(body: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(body as unknown as ArrayBuffer);
    return wb;
  }

  function sheetText(ws: ExcelJS.Worksheet): string {
    const parts: string[] = [];
    ws.eachRow((row) => row.eachCell((cell) => parts.push(String(cell.text))));
    return parts.join(" | ");
  }

  /** ชีตหมวดงาน = ทุกชีตระหว่าง "สรุป" กับชีตแนบท้าย */
  function categorySheets(wb: ExcelJS.Workbook): ExcelJS.Worksheet[] {
    return wb.worksheets.filter((w) => w.state === "visible" && !["สรุป", "ใบถอดแบบ", "รายการสั่งซื้อ"].includes(w.name));
  }

  async function projectWithLines(name: string, customerId?: string) {
    const res = await owner.agent.post("/api/projects").send({ name, ...(customerId ? { customerId } : {}) });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);
    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "งานเทพื้นคอนกรีต",
      quantity: 12.5,
      unit: "ลบ.ม.",
      materialUnitPrice: 2400,
      laborUnitPrice: 500,
      components: [{ componentMaterialId: null, name: "ปูนซีเมนต์", unit: "ถุง", qtyPerUnit: 3.3, unitPrice: 150 }],
    });
    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "=HYPERLINK(\"http://evil.example\",\"กดที่นี่\")",
      quantity: 3,
      unit: "จุด",
      materialUnitPrice: 450,
      laborUnitPrice: 350,
    });
    return projectId;
  }

  it("ฉบับภายใน: ไฟล์ .xlsx จริง ชื่อไทยถูกต้อง มีราคาทุน (ไม่มีชีตรายการสั่งซื้อแล้ว)", async () => {
    const projectId = await projectWithLines("ทดสอบ Excel ภายใน");
    await owner.agent.patch(`/api/projects/${projectId}/rates`).send({ roundingUnit: 1000 });
    const res = await owner.agent.get(`/api/projects/${projectId}/boq/export.xlsx`).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(decodeURIComponent(/filename\*=UTF-8''(.+)$/.exec(res.headers["content-disposition"])![1])).toMatch(
      /^BOQ-.+-v1-ภายใน\.xlsx$/,
    );

    const wb = await workbookOf(res.body);
    // สรุปหน้าแรก → ชีตหมวด → ชีตแนบท้าย
    const visible = wb.worksheets.filter((w) => w.state === "visible");
    expect(visible[0].name).toBe("สรุป");
    expect(wb.getWorksheet("รายการสั่งซื้อ")).toBeUndefined();
    // ชีตลับบอกที่มา (โครงการ/เวอร์ชัน) ให้นำกลับเป็นการแก้ได้ — ซ่อนแบบเปิดจากเมนู Excel ไม่ได้
    const source = wb.getWorksheet("_systemboq")!;
    expect(source.state).toBe("veryHidden");
    expect(source.getCell("B1").value).toBe(projectId);
    const summary = sheetText(wb.getWorksheet("สรุป")!);
    expect(summary).toContain("ค่าดำเนินการและกำไร");
    expect(summary).toContain("ห้ามส่งให้ลูกค้า");
    expect(summary).toContain("ส่วนลดปัดเศษ (ปัดลงหลักพัน)");
    const sheets = categorySheets(wb);
    expect(sheets).toHaveLength(1);
    const boq = sheetText(sheets[0]);
    expect(boq).toContain("ค่าวัสดุ/หน่วย");
    expect(boq).toContain("ห้ามส่งให้ลูกค้า");
    // ชื่อรายการที่หน้าตาเหมือนสูตร ต้องเป็นข้อความ ไม่ใช่สูตร
    let injected = false;
    for (const ws of wb.worksheets) {
      ws.eachRow((row) =>
        row.eachCell((cell) => {
          if (typeof cell.value === "object" && cell.value && "formula" in cell.value && /HYPERLINK/i.test(String(cell.value.formula))) injected = true;
        }),
      );
    }
    expect(injected).toBe(false);
    expect(boq).toContain('=HYPERLINK("http://evil.example","กดที่นี่")');

    const version = (await owner.agent.get(`/api/projects/${projectId}`)).body.currentVersion;
    // ยอดสุทธิในไฟล์ (ผลที่ฝังไว้) = ยอดในระบบ
    const netCell = findValueRightOf(wb.getWorksheet("สรุป")!, "รวมมูลค่าทั้งสิ้น");
    expect(netCell).toBe(Number(version.netPrice));

  });

  it("ฉบับลูกค้า: ไม่มีราคาทุนเลย และตัวเลขตรงกับใบเสนอราคาที่ลูกค้าเห็น", async () => {
    const customer = await createAndLoginCustomer("test-xlsx-customer");
    const me = await customer.agent.get("/api/auth/me");
    createdUserIds.push(me.body.user.id);
    const projectId = await projectWithLines("ทดสอบ Excel ลูกค้า", me.body.user.id);
    await owner.agent.patch(`/api/projects/${projectId}/rates`).send({ discount: { mode: "PERCENT", value: 3 }, roundingUnit: 100 });
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    const quoteId = quote.body.quote.id as string;
    await sendQuote(owner.agent, projectId, quoteId);

    const res = await owner.agent.get(`/api/projects/${projectId}/quotes/${quoteId}/export.xlsx`).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    const wb = await workbookOf(res.body);
    // ทุกชีต (สรุป + ชีตหมวด) ต้องไม่มีราคาทุน
    for (const sheetWs of wb.worksheets) {
      const text = sheetText(sheetWs);
      for (const secret of ["ค่าวัสดุ", "ค่าแรง", "ต้นทุน", "ค่าดำเนินการ", "กำไร", "ห้ามส่ง"]) {
        expect(text).not.toContain(secret);
      }
    }

    const ws = wb.getWorksheet("สรุป")!;
    const q = (await customer.agent.get(`/api/my/quotes/${quoteId}`)).body.quote;
    expect(findValueRightOf(ws, "รวมมูลค่าทั้งสิ้น")).toBe(Number(q.netPrice));
    expect(findValueRightOf(ws, "ส่วนลดปัดเศษ")).toBe(-Number(q.roundingAmt));
    // ราคารวมรายหมวดในไฟล์ = ที่ลูกค้าเห็นในพอร์ทัล
    const subtotals: number[] = [];
    for (const sheetWs of categorySheets(wb)) {
      sheetWs.eachRow((row) => {
        if (String(row.getCell(2).value ?? "").startsWith("รวมหมวด")) {
          const v = row.getCell(6).value as { result: number };
          subtotals.push(v.result);
        }
      });
    }
    expect(subtotals).toEqual(q.groups.map((g: { subtotal: string }) => Number(g.subtotal)));
  });

  it("เฉพาะพนักงาน — ADMIN โหลดได้ ลูกค้าโหลดไม่ได้ · ใบเสนอราคาของโครงการอื่นไม่ได้", async () => {
    const admin = await createAndLoginAdmin("test-xlsx-admin");
    createdUserIds.push(admin.userId);
    const customer = await createAndLoginCustomer("test-xlsx-outsider");
    const me = await customer.agent.get("/api/auth/me");
    createdUserIds.push(me.body.user.id);

    const projectId = await projectWithLines("ทดสอบ Excel สิทธิ์");
    const other = await projectWithLines("ทดสอบ Excel อีกโครงการ");
    const quote = await owner.agent.post(`/api/projects/${other}/quotes`).send({});

    expect((await admin.agent.get(`/api/projects/${projectId}/boq/export.xlsx`)).status).toBe(200);
    expect([401, 403]).toContain((await customer.agent.get(`/api/projects/${projectId}/boq/export.xlsx`)).status);
    expect((await owner.agent.get(`/api/projects/${projectId}/quotes/${quote.body.quote.id}/export.xlsx`)).status).toBe(404);
    expect((await owner.agent.get(`/api/projects/does-not-exist/boq/export.xlsx`)).status).toBe(404);
  });

  /** หาค่าตัวเลขที่อยู่ช่องถัดจากป้าย (ค่าคงที่ หรือผลของสูตร) */
  function findValueRightOf(ws: ExcelJS.Worksheet, label: string): number | undefined {
    let found: number | undefined;
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell((cell, col) => {
        if (found === undefined && String(cell.value ?? "").startsWith(label)) {
          const v = row.getCell(col + 1).value as unknown;
          found = typeof v === "number" ? v : (v as { result: number }).result;
        }
      });
    });
    return found;
  }
});
