import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";

/**
 * รายงานภาษีขายรายเดือน + การเปิดใช้การออกใบกำกับภาษีในหน้าตั้งค่า
 *
 * รายงานอ่านจากใบที่ออกไปแล้วเท่านั้น (ไม่คำนวณ VAT ใหม่) ใบที่ยกเลิกต้องยังอยู่ในรายการเพื่อให้
 * เลขที่เรียงต่อกันตอนถูกตรวจ แต่ต้องไม่ถูกนับในยอดรวมที่ใช้ยื่นภาษี
 */
describe("รายงานภาษีขาย + เปิดใช้ใบกำกับภาษี", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  const userIds: string[] = [];
  const docIds: string[] = [];
  let contractId = "";
  let installmentId = "";
  let projectId = "";
  const month = "2019-07"; // เดือนในอดีตที่ไม่มีเอกสารจริง — รายงานของเดือนนี้จึงเป็นของเทสต์ล้วน
  const settingKeys = ["companyVatRegistered", "companyBranch", "companyTaxId"];
  let settingsBefore: { key: string; value: string }[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-salestax-owner");
    admin = await createAndLoginAdmin("test-salestax-admin");
    customer = await createCustomerDirect("test-salestax-customer");
    userIds.push(owner.userId, admin.userId, customer.userId);
    settingsBefore = await prisma.setting.findMany({ where: { key: { in: settingKeys } } });

    // โครงการ/สัญญา/งวด ขั้นต่ำที่ใบกำกับภาษีต้องอ้างถึง (FK) — เส้นทางการออกใบตัวจริงมีเทสต์แยก
    const project = await prisma.project.create({
      data: {
        projectNo: `PRJ-TEST-${Date.now()}`,
        name: "โครงการทดสอบรายงานภาษีขาย",
        createdById: owner.userId,
        customerId: customer.userId,
      },
    });
    projectId = project.id;
    const contract = await prisma.contract.create({
      data: { projectId, contractNo: `CT-TEST-${Date.now()}`, signedAt: new Date() },
    });
    contractId = contract.id;
    const installment = await prisma.contractInstallment.create({
      data: { contractId, seq: 1, milestone: "งวดทดสอบ", amount: 107_000 },
    });
    installmentId = installment.id;
  });

  afterAll(async () => {
    await prisma.contract.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    for (const key of settingKeys) {
      const row = settingsBefore.find((s) => s.key === key);
      if (row) {
        await prisma.setting.upsert({ where: { key }, create: { key, value: row.value }, update: { value: row.value } });
      } else {
        await prisma.setting.deleteMany({ where: { key } });
      }
    }
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  /**
   * เขียนแถวเอกสารลงตรง ๆ — รายงานอ่านจากแถวที่ตรึงไว้ ไม่ได้อ่านจากสัญญา การสร้างสัญญาจริงทั้งชุด
   * จึงไม่ได้ทดสอบอะไรเพิ่ม (เส้นทางการออกใบมีเทสต์ของตัวเองใน billing-docs.test.ts)
   */
  async function seedDoc(docNo: string, amount: number, vat: number, voided = false) {
    const doc = await prisma.billingDocument.create({
      data: {
        type: "RECEIPT",
        docNo,
        isTaxInvoice: true,
        contractId,
        installmentId,
        issuedOn: new Date(`${month}-15T00:00:00Z`),
        contractNo: "CT-TEST",
        projectNo: "PRJ-TEST",
        projectName: "โครงการทดสอบรายงาน",
        seq: 1,
        milestone: "งวดทดสอบ",
        customerName: "บริษัท ผู้ซื้อ จำกัด",
        customerTaxId: "0105551234567",
        customerBranch: "สำนักงานใหญ่",
        amount,
        vatAmount: vat,
        issuedByName: "ผู้ออกทดสอบ",
        voidedAt: voided ? new Date() : null,
        voidReason: voided ? "ออกผิด" : null,
      },
    });
    docIds.push(doc.id);
    return doc;
  }

  it("รวมเฉพาะใบที่ยังไม่ถูกยกเลิก แต่ยังแสดงใบที่ยกเลิกไว้ในรายการ", async () => {
    await seedDoc("RC-TEST-0001", 107_000, 7_000);
    await seedDoc("RC-TEST-0002", 53_500, 3_500);
    await seedDoc("RC-TEST-0003", 10_700, 700, true);

    const res = await admin.agent.get(`/api/reports/sales-tax?month=${month}`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(3);
    expect(res.body.rows[0]).toMatchObject({ docNo: "RC-TEST-0001", base: 100_000, vat: 7_000, total: 107_000 });
    expect(res.body.rows[2].voidedAt).not.toBeNull();
    expect(res.body.totals).toEqual({ count: 2, voidedCount: 1, base: 150_000, vat: 10_500, total: 160_500 });
  });

  it("ดาวน์โหลด CSV ได้ มี BOM สำหรับ Excel และแถวรวมท้ายไฟล์", async () => {
    const res = await admin.agent.get(`/api/reports/sales-tax.csv?month=${month}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text.startsWith("﻿")).toBe(true);
    expect(res.text).toContain("เลขที่ใบกำกับภาษี");
    expect(res.text).toContain("RC-TEST-0001");
    expect(res.text).toContain("ยกเลิก — ออกผิด");
    expect(res.text).toContain('"รวม"');
  });

  it("ดาวน์โหลด Excel ตามแบบฟอร์มสรรพากร: หัวรายงานครบ · ใบยกเลิกลงมูลค่า 0 · ยอดรวมเท่ายอดในหน้าจอ", async () => {
    const res = await admin.agent
      .get(`/api/reports/sales-tax.xlsx?month=${month}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("รายงานภาษีขาย")!;
    const text = ws.getSheetValues().flat().filter((v) => typeof v === "string").join("\n");
    expect(text).toContain("รายงานภาษีขาย");
    expect(text).toMatch(/เดือนภาษี \S+\s+ปี \d{4}/);
    expect(text).toContain("ชื่อผู้ประกอบการ");
    expect(text).toContain("เลขประจำตัวผู้เสียภาษีอากร");
    expect(text).toContain("สำนักงานใหญ่");
    expect(text).toContain("ยกเลิก (ยอดเดิม");
    // แถวรวม: คอลัมน์ มูลค่า/VAT/รวม = ยอดเดียวกับหน้าจอ (ไม่นับใบที่ยกเลิก)
    let totals: unknown[] = [];
    ws.eachRow((row) => {
      if (row.getCell(4).value === "รวมทั้งสิ้น") totals = [row.getCell(7).value, row.getCell(8).value, row.getCell(9).value];
    });
    expect(totals).toEqual([150_000, 10_500, 160_500]);
  });

  it("เดือนผิดรูปแบบตอบ 400 และลูกค้าเข้าไม่ได้", async () => {
    expect((await admin.agent.get("/api/reports/sales-tax.xlsx?month=2026-13")).status).toBe(400);
    expect((await admin.agent.get("/api/reports/sales-tax?month=2026-13")).status).toBe(400);
    expect((await admin.agent.get("/api/reports/sales-tax")).status).toBe(400);
    expect((await customer.agent.get(`/api/reports/sales-tax?month=${month}`)).status).toBe(403);
  });

  it("เปิดการออกใบกำกับภาษีไม่ได้ถ้ายังไม่มีเลขผู้เสียภาษี 13 หลักและสถานประกอบการ", async () => {
    await prisma.setting.deleteMany({ where: { key: { in: settingKeys } } });

    const noTaxId = await owner.agent.patch("/api/settings").send({ companyVatRegistered: true });
    expect(noTaxId.status).toBe(400);
    expect(noTaxId.body.error).toContain("เลขประจำตัวผู้เสียภาษี");

    const noBranch = await owner.agent
      .patch("/api/settings")
      .send({ companyVatRegistered: true, companyTaxId: "0-1055-51234-56-7" });
    expect(noBranch.status).toBe(400);
    expect(noBranch.body.error).toContain("สถานประกอบการ");

    const ok = await owner.agent
      .patch("/api/settings")
      .send({ companyVatRegistered: true, companyTaxId: "0-1055-51234-56-7", companyBranch: "สำนักงานใหญ่" });
    expect(ok.status).toBe(200);
    const saved = await prisma.setting.findUniqueOrThrow({ where: { key: "companyVatRegistered" } });
    expect(saved.value).toBe("true");
  });
});
