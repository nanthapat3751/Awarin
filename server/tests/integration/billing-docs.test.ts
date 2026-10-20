import { todayIso } from "../../src/lib/business-date";
import { buildBillingDocHtml, renderBillingDocPdf } from "../../src/lib/pdf/billing-doc-pdf";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";
import { verifyAllPayments } from "../helpers/verify-payments";

// Puppeteer เป็น ESM รันใต้ ts-jest ไม่ได้ (ดู contracts.test.ts) — mock เฉพาะขั้นเรนเดอร์ ส่วนตัวสร้าง HTML
// ยังเป็นของจริงและถูกตรวจในชุด "หน้าตา" ด้านล่าง; การเรนเดอร์จริงตรวจผ่านหน้าจอด้วย puppeteer แยกต่างหาก
jest.mock("../../src/lib/pdf/billing-doc-pdf", () => ({
  ...jest.requireActual("../../src/lib/pdf/billing-doc-pdf"),
  renderBillingDocPdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));

const renderMock = renderBillingDocPdf as jest.MockedFunction<typeof renderBillingDocPdf>;
const lastEdition = () => renderMock.mock.calls.at(-1)?.[0].edition;

function isoDaysFromToday(delta: number): string {
  const base = new Date(`${todayIso()}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}

/**
 * ใบแจ้งหนี้/ใบเสร็จรับเงินของงวดเงิน
 *
 * สิ่งที่ต้องไม่พัง: เลขที่ไม่ซ้ำและไม่ถูกลบ · ตัวเลขบนใบตรึงไว้ตอนออก · ใบเสร็จที่ออกแล้วล็อกรายการรับเงิน
 * · ลูกค้าเห็นเฉพาะใบของตัวเองที่ยังไม่ถูกยกเลิก
 */
describe("ใบแจ้งหนี้และใบเสร็จรับเงินของงวดเงิน", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let otherCustomer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let itemCategoryId: string;
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const projectIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-bill-owner");
    admin = await createAndLoginAdmin("test-bill-admin");
    customer = await createCustomerDirect("test-bill-customer");
    otherCustomer = await createCustomerDirect("test-bill-other");
    userIds.push(owner.userId, admin.userId, customer.userId, otherCustomer.userId);

    const cat = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบใบแจ้งหนี้" });
    categoryIds.push(cat.body.category.id);
    const sub = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: cat.body.category.id, name: "กลุ่มทดสอบใบแจ้งหนี้" });
    categoryIds.push(sub.body.category.id);
    const item = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: sub.body.category.id, name: "รายการทดสอบใบแจ้งหนี้" });
    itemCategoryId = item.body.category.id;
    categoryIds.push(itemCategoryId);

    await owner.agent.get("/api/contract-templates");
    // ใบกำกับภาษีต้องมีที่อยู่ผู้ซื้อ — เทสต์ที่ตรวจกรณี "ไม่มีที่อยู่" จะล้างค่านี้เองชั่วคราว
    await prisma.customerProfile.update({
      where: { userId: customer.userId },
      data: { address: "99 ถนนทดสอบ แขวงทดสอบ กรุงเทพฯ 10100" },
    });
  });

  afterAll(async () => {
    // ใบแจ้งหนี้/ใบเสร็จ งวด และรายการรับเงินหายตาม CASCADE ของสัญญา
    await prisma.contract.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: categoryIds.reverse() } } });
    await prisma.$disconnect();
  });

  async function contractFor(name: string, sign = true) {
    const res = await owner.agent
      .post("/api/projects")
      .send({ name, siteAddress: "ที่ตั้งทดสอบ", customerId: customer.userId });
    const projectId = res.body.project.id as string;
    projectIds.push(projectId);
    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "รายการทดสอบ",
      quantity: 10,
      unit: "หน่วย",
      materialUnitPrice: 60_000,
      laborUnitPrice: 40_000,
    });
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    const quoteId = quote.body.quote.id;
    await sendQuote(owner.agent, projectId, quoteId);
    await owner.agent.post(`/api/projects/${projectId}/quotes/${quoteId}/transition`).send({ toStatus: "ACCEPTED" });
    await owner.agent.post(`/api/projects/${projectId}/transition`).send({ toStatus: "APPROVED" });
    const contract = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
    const contractId = contract.body.contract.id as string;
    if (sign) await owner.agent.post(`/api/projects/${projectId}/contracts/${contractId}/sign`);
    const inst = await owner.agent.get(`/api/projects/${projectId}/contracts/${contractId}/installments`);
    const base = `/api/projects/${projectId}/contracts/${contractId}`;
    return { projectId, contractId, base, installments: inst.body.installments as { id: string; amount: string }[] };
  }

  it("วางบิลได้งวดละหนึ่งใบ ตั้งวันครบกำหนดของงวด แจ้งลูกค้า และยกเลิกแล้วออกใหม่ได้เลขใหม่", async () => {
    const { base, installments } = await contractFor("[ชั่วคราว] วางบิล");
    const first = installments[0];
    const dueOn = isoDaysFromToday(15);

    const issued = await admin.agent.post(`${base}/installments/${first.id}/invoice`).send({ dueOn });
    expect(issued.status).toBe(200);
    const row = issued.body.installments.find((i: { id: string }) => i.id === first.id);
    expect(row.dueOn).toBe(dueOn);
    expect(row.documents).toHaveLength(1);
    const invoice = row.documents[0];
    expect(invoice.type).toBe("INVOICE");
    expect(invoice.docNo).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(invoice.issuedOn).toBe(todayIso());
    expect(invoice.amount).toBe(first.amount);

    const note = await prisma.notification.findFirst({
      where: { userId: customer.userId, message: { contains: invoice.docNo } },
    });
    // กดแจ้งเตือนแล้วไปหน้าจ่ายของงวดนั้น (QR + แจ้งโอน) ไม่ใช่หน้ารวมสัญญา
    expect(note?.link).toBe(`/my/payments/${first.id}`);

    const again = await admin.agent.post(`${base}/installments/${first.id}/invoice`).send({ dueOn });
    expect(again.status).toBe(409);
    expect(again.body.error).toContain(invoice.docNo);

    const noReason = await admin.agent.post(`${base}/documents/${invoice.id}/void`).send({ reason: " " });
    expect(noReason.status).toBe(400);
    const voided = await admin.agent.post(`${base}/documents/${invoice.id}/void`).send({ reason: "ยอดผิด" });
    expect(voided.status).toBe(200);

    const reissued = await admin.agent.post(`${base}/installments/${first.id}/invoice`).send({ dueOn });
    expect(reissued.status).toBe(200);
    const docs = reissued.body.installments.find((i: { id: string }) => i.id === first.id).documents;
    expect(docs).toHaveLength(2);
    expect(docs[0].voidReason).toBe("ยอดผิด");
    expect(docs[1].docNo).not.toBe(invoice.docNo);
    expect(docs[1].voidedAt).toBeNull();

    // ทั้งใบใหม่และใบที่ยกเลิกยังเปิดเป็น PDF ได้
    for (const doc of docs) {
      const pdf = await owner.agent.get(`${base}/documents/${doc.id}/pdf`);
      expect(pdf.status).toBe(200);
      expect(pdf.headers["content-type"]).toContain("application/pdf");
      // ฝั่งบริษัทได้ต้นฉบับ + สำเนาในไฟล์เดียว
      expect(lastEdition()).toBe("ORIGINAL_AND_COPY");
    }
  });

  it("ปฏิเสธการวางบิลของสัญญาที่ยังไม่ลงนาม กำหนดชำระย้อนหลัง และงวดที่รับเงินครบแล้ว", async () => {
    const unsigned = await contractFor("[ชั่วคราว] ยังไม่เซ็น", false);
    const res = await owner.agent
      .post(`${unsigned.base}/installments/${unsigned.installments[0].id}/invoice`)
      .send({ dueOn: isoDaysFromToday(7) });
    expect(res.status).toBe(409);

    const { base, installments } = await contractFor("[ชั่วคราว] รับครบ");
    const past = await owner.agent
      .post(`${base}/installments/${installments[0].id}/invoice`)
      .send({ dueOn: isoDaysFromToday(-1) });
    expect(past.status).toBe(400);

    await owner.agent
      .post(`${base}/installments/${installments[0].id}/payments`)
      .send({ paidOn: todayIso(), amount: Number(installments[0].amount) });
    const paid = await owner.agent
      .post(`${base}/installments/${installments[0].id}/invoice`)
      .send({ dueOn: isoDaysFromToday(7) });
    expect(paid.status).toBe(409);
  });

  it("ใบเสร็จตรึงตัวเลขไว้ ล็อกรายการรับเงิน และยกเลิกได้เฉพาะเจ้าของกิจการ", async () => {
    const { base, installments } = await contractFor("[ชั่วคราว] ใบเสร็จ");
    const inst = installments[0];
    const recorded = await admin.agent
      .post(`${base}/installments/${inst.id}/payments`)
      .send({ paidOn: isoDaysFromToday(-2), amount: 50_000, method: "CHEQUE", reference: "CHQ-001" });
    const paymentId = recorded.body.installments[0].payments[0].id as string;
    await verifyAllPayments(owner.agent, base);

    const issued = await admin.agent.post(`${base}/payments/${paymentId}/receipt`);
    expect(issued.status).toBe(200);
    const receipt = issued.body.installments[0].documents.find((d: { type: string }) => d.type === "RECEIPT");
    expect(receipt.docNo).toMatch(/^RC-\d{4}-\d{4}$/);
    expect(receipt.paymentId).toBe(paymentId);
    // วันที่บนใบเสร็จ = วันที่ได้รับเงินจริง ไม่ใช่วันที่กดออก
    expect(receipt.issuedOn).toBe(isoDaysFromToday(-2));

    expect((await admin.agent.post(`${base}/payments/${paymentId}/receipt`)).status).toBe(409);

    const edit = await admin.agent
      .patch(`${base}/payments/${paymentId}`)
      .send({ paidOn: isoDaysFromToday(-2), amount: 60_000 });
    expect(edit.status).toBe(409);
    expect(edit.body.error).toContain(receipt.docNo);
    expect((await admin.agent.delete(`${base}/payments/${paymentId}`)).status).toBe(409);

    // ตรึงค่าไว้: แก้ชื่อลูกค้าทีหลัง ใบเดิมยังเป็นชื่อเดิม
    await prisma.user.update({ where: { id: customer.userId }, data: { fullName: "ชื่อใหม่หลังออกใบ" } });
    const frozen = await prisma.billingDocument.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(frozen.customerName).toBe("Test Customer");
    expect(Number(frozen.amount)).toBe(50_000);
    expect(frozen.method).toBe("CHEQUE");
    expect(frozen.reference).toBe("CHQ-001");
    await prisma.user.update({ where: { id: customer.userId }, data: { fullName: "Test Customer" } });

    const adminVoid = await admin.agent.post(`${base}/documents/${receipt.id}/void`).send({ reason: "เช็คเด้ง" });
    expect(adminVoid.status).toBe(403);
    const ownerVoid = await owner.agent.post(`${base}/documents/${receipt.id}/void`).send({ reason: "เช็คเด้ง" });
    expect(ownerVoid.status).toBe(200);
    expect((await owner.agent.post(`${base}/documents/${receipt.id}/void`).send({ reason: "ซ้ำ" })).status).toBe(409);

    // ยกเลิกใบเสร็จแล้ว แก้รายการรับเงินได้ตามปกติ
    const editAfter = await admin.agent
      .patch(`${base}/payments/${paymentId}`)
      .send({ paidOn: isoDaysFromToday(-2), amount: 60_000 });
    expect(editAfter.status).toBe(200);
  });

  it("ลูกค้าเห็นและเปิดได้เฉพาะใบของตัวเองที่ยังไม่ถูกยกเลิก", async () => {
    const { contractId, base, installments } = await contractFor("[ชั่วคราว] ฝั่งลูกค้า");
    const dueOn = isoDaysFromToday(10);
    const first = await owner.agent.post(`${base}/installments/${installments[0].id}/invoice`).send({ dueOn });
    const voidedDoc = first.body.installments[0].documents[0];
    await owner.agent.post(`${base}/documents/${voidedDoc.id}/void`).send({ reason: "ออกผิดงวด" });
    const second = await owner.agent.post(`${base}/installments/${installments[0].id}/invoice`).send({ dueOn });
    const activeDoc = second.body.installments[0].documents[1];

    const list = await customer.agent.get("/api/my/contracts");
    const mine = list.body.contracts.find((c: { id: string }) => c.id === contractId);
    expect(mine.payment.installments[0].documents).toEqual([
      { id: activeDoc.id, type: "INVOICE", isTaxInvoice: false, docNo: activeDoc.docNo, issuedOn: todayIso() },
    ]);

    const ok = await customer.agent.get(`/api/my/contracts/${contractId}/documents/${activeDoc.id}/pdf`);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toContain("application/pdf");
    // ลูกค้าได้ต้นฉบับอย่างเดียว ไม่เห็นสำเนาของบริษัท
    expect(lastEdition()).toBe("ORIGINAL");
    expect((await customer.agent.get(`/api/my/contracts/${contractId}/documents/${voidedDoc.id}/pdf`)).status).toBe(404);
    expect(
      (await otherCustomer.agent.get(`/api/my/contracts/${contractId}/documents/${activeDoc.id}/pdf`)).status,
    ).toBe(404);
  });

  /** เปิด/ปิดสถานะจดทะเบียน VAT ของบริษัท (ค่าตั้งระดับระบบ — ต้องคืนค่าเดิมเสมอ) */
  async function withVatRegistration<T>(run: () => Promise<T>): Promise<T> {
    const before = await prisma.setting.findMany({
      where: { key: { in: ["companyVatRegistered", "companyBranch", "companyTaxId"] } },
    });
    const set = async (key: string, value: string) => {
      await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    };
    await set("companyVatRegistered", "true");
    await set("companyBranch", "สำนักงานใหญ่");
    await set("companyTaxId", "0105551234567");
    try {
      return await run();
    } finally {
      for (const key of ["companyVatRegistered", "companyBranch", "companyTaxId"]) {
        const row = before.find((b) => b.key === key);
        if (row) await set(key, row.value);
        else await prisma.setting.deleteMany({ where: { key } });
      }
    }
  }

  it("ยังไม่ได้ติ๊กว่าจด VAT → ใบเสร็จเป็นใบเสร็จธรรมดา ไม่มีคำว่าใบกำกับภาษี", async () => {
    const { base, installments } = await contractFor("[ชั่วคราว] ยังไม่จด VAT");
    const inst = installments[0];
    const paid = await owner.agent
      .post(`${base}/installments/${inst.id}/payments`)
      .send({ paidOn: todayIso(), amount: 100_000 });
    const paymentId = paid.body.installments[0].payments[0].id as string;
    await verifyAllPayments(owner.agent, base);
    const issued = await owner.agent.post(`${base}/payments/${paymentId}/receipt`);
    expect(issued.status).toBe(200);
    const doc = issued.body.installments[0].documents[0];
    expect(doc.isTaxInvoice).toBe(false);
    const row = await prisma.billingDocument.findUniqueOrThrow({ where: { id: doc.id } });
    expect(row.isTaxInvoice).toBe(false);
    // ผู้ขายถูกตรึงไว้เสมอ แม้ใบนั้นไม่ใช่ใบกำกับภาษี
    expect(row.sellerName).not.toBeNull();
  });

  it("จด VAT แล้ว → ใบเสร็จเป็นใบกำกับภาษี ตรึงผู้ขายไว้ และใบแจ้งหนี้ยังไม่ใช่ใบกำกับภาษี", async () => {
    await withVatRegistration(async () => {
      const { base, installments } = await contractFor("[ชั่วคราว] จด VAT แล้ว");
      const inst = installments[0];
      const invoice = await owner.agent
        .post(`${base}/installments/${inst.id}/invoice`)
        .send({ dueOn: isoDaysFromToday(7) });
      const invoiceDoc = invoice.body.installments[0].documents[0];
      expect(invoiceDoc.isTaxInvoice).toBe(false);

      const paid = await owner.agent
        .post(`${base}/installments/${inst.id}/payments`)
        .send({ paidOn: todayIso(), amount: 200_000 });
      const paymentId = paid.body.installments[0].payments.at(-1).id as string;
      await verifyAllPayments(owner.agent, base);
      const issued = await owner.agent.post(`${base}/payments/${paymentId}/receipt`);
      const receipt = issued.body.installments[0].documents.find((d: { type: string }) => d.type === "RECEIPT");
      expect(receipt.isTaxInvoice).toBe(true);

      const row = await prisma.billingDocument.findUniqueOrThrow({ where: { id: receipt.id } });
      expect(row.sellerTaxId).toBe("0105551234567");
      expect(row.sellerBranch).toBe("สำนักงานใหญ่");
      expect(Number(row.vatAmount)).toBeGreaterThan(0);

      // แก้ค่าตั้งทีหลังไม่ย้อนไปเปลี่ยนใบที่ออกไปแล้ว
      await prisma.setting.update({ where: { key: "companyTaxId" }, data: { value: "9999999999999" } });
      const again = await prisma.billingDocument.findUniqueOrThrow({ where: { id: receipt.id } });
      expect(again.sellerTaxId).toBe("0105551234567");
    });
  });

  it("จด VAT แล้วแต่ลูกค้าไม่มีที่อยู่ → ปฏิเสธพร้อมบอกวิธีแก้ ไม่ออกใบเสร็จที่ใช้ไม่ได้", async () => {
    await withVatRegistration(async () => {
      const { base, installments } = await contractFor("[ชั่วคราว] ลูกค้าไม่มีที่อยู่");
      const inst = installments[0];
      const paid = await owner.agent
        .post(`${base}/installments/${inst.id}/payments`)
        .send({ paidOn: todayIso(), amount: 50_000 });
      const paymentId = paid.body.installments[0].payments[0].id as string;
      await verifyAllPayments(owner.agent, base);

      const address = (await prisma.customerProfile.findUniqueOrThrow({ where: { userId: customer.userId } })).address;
      await prisma.customerProfile.update({ where: { userId: customer.userId }, data: { address: null } });
      try {
        const res = await owner.agent.post(`${base}/payments/${paymentId}/receipt`);
        expect(res.status).toBe(409);
        expect(res.body.error).toContain("ที่อยู่");
        expect(await prisma.billingDocument.count({ where: { paymentId } })).toBe(0);
      } finally {
        await prisma.customerProfile.update({ where: { userId: customer.userId }, data: { address } });
      }
    });
  });

  it("ใบที่ออกแทนใบที่ยกเลิก อ้างอิงเลขใบเดิมไว้ในเอกสาร", async () => {
    const { base, installments } = await contractFor("[ชั่วคราว] ออกแทนใบเดิม");
    const inst = installments[0];
    const dueOn = isoDaysFromToday(20);
    const first = await owner.agent.post(`${base}/installments/${inst.id}/invoice`).send({ dueOn });
    const firstDoc = first.body.installments[0].documents[0];
    await owner.agent.post(`${base}/documents/${firstDoc.id}/void`).send({ reason: "งวดผิด" });
    const second = await owner.agent.post(`${base}/installments/${inst.id}/invoice`).send({ dueOn });
    const secondDoc = second.body.installments[0].documents[1];
    const row = await prisma.billingDocument.findUniqueOrThrow({ where: { id: secondDoc.id } });
    expect(row.replacesDocNo).toBe(firstDoc.docNo);
  });

  it("ลูกค้านิติบุคคล: ใบแจ้งหนี้คำนวณภาษีหัก ณ ที่จ่ายของงวด และ VAT ของทุกงวดรวมกันเท่าของสัญญา", async () => {
    await prisma.customerProfile.update({
      where: { userId: customer.userId },
      data: { customerType: "COMPANY", companyName: "บริษัท ทดสอบ จำกัด", taxId: "0105551234567", branch: "สำนักงานใหญ่" },
    });
    try {
      const { contractId, base, installments } = await contractFor("[ชั่วคราว] นิติบุคคล");
      const expected = await owner.agent.get(`${base}/payments`);
      for (const inst of installments) {
        await owner.agent.post(`${base}/installments/${inst.id}/invoice`).send({ dueOn: isoDaysFromToday(30) });
      }
      const docs = await prisma.billingDocument.findMany({ where: { contractId }, orderBy: { seq: "asc" } });
      const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
      expect(docs).toHaveLength(installments.length);
      expect(docs[0].customerName).toBe("บริษัท ทดสอบ จำกัด");
      expect(docs[0].customerTaxId).toBe("0105551234567");
      expect(Number(docs[0].withholdingAmount)).toBe(expected.body.installments[0].expectedWithholding);

      // กัน Number(null) = 0 ทำให้เทสต์ผ่านเปล่า ๆ — สัญญาต้องมี VAT จริงและทุกใบต้องมียอด VAT
      expect(Number(contract.vatAmount)).toBeGreaterThan(0);
      expect(docs.every((d) => d.vatAmount != null && Number(d.vatAmount) > 0)).toBe(true);
      expect(Number(docs[0].withholdingAmount)).toBeGreaterThan(0);
      const vatSum = docs.reduce((sum, d) => sum + Number(d.vatAmount), 0);
      expect(Math.round(vatSum * 100)).toBe(Math.round(Number(contract.vatAmount) * 100));
    } finally {
      await prisma.customerProfile.update({
        where: { userId: customer.userId },
        data: { customerType: "INDIVIDUAL", companyName: null, taxId: null, branch: null },
      });
    }
  });
});

describe("หน้าตาใบแจ้งหนี้/ใบเสร็จ", () => {
  const base = {
    companyName: "บริษัท ตัวอย่าง จำกัด",
    companyAddress: "กรุงเทพฯ",
    companyPhone: "02-000-0000",
    logo: null,
    logoSmall: null,
    docNo: "INV-2026-0001",
    issuedOn: new Date("2026-09-22T00:00:00Z"),
    dueOn: new Date("2026-10-07T00:00:00Z"),
    contractNo: "CT-2026-0001",
    projectNo: "PRJ-2026-0001",
    projectName: "บ้านทดสอบ",
    seq: 2,
    milestone: "งานโครงสร้างเสร็จ",
    customerName: "บริษัท ลูกค้า จำกัด",
    customerAddress: null,
    customerIsCompany: true,
    customerTaxId: "0105551234567",
    customerBranch: "สำนักงานใหญ่",
    amount: 107_000,
    vatAmount: 7_000,
    paidBefore: 7_000,
    withholdingAmount: 2_803.74,
    method: null,
    reference: null,
    issuedByName: "สมหญิง ทดสอบ",
    issuedByTitle: "ฝ่ายบัญชี",
    signatureDataUrl: null,
    voidedAt: null,
    voidReason: null,
  } as const;

  it("ใบแจ้งหนี้แสดงยอดที่ต้องชำระหลังหักที่จ่ายแล้ว พร้อมตัวหนังสือ และช่องผู้รับวางบิล", () => {
    const html = buildBillingDocHtml({ ...base, type: "INVOICE" });
    expect(html).toContain("ใบแจ้งหนี้");
    expect(html).toContain("100,000.00"); // มูลค่าก่อน VAT และยอดที่ต้องชำระ
    expect(html).toContain("หนึ่งแสนบาทถ้วน");
    // แยกยอด VAT ให้เห็น (ต่างจากแบบ Excel เดิมโดยตั้งใจ) · ยอดทั้งสิ้นของงวด แล้วหักที่ชำระแล้ว
    expect(html).toContain("ภาษีมูลค่าเพิ่ม (Vat) 7%");
    expect(html).toContain("107,000.00");
    expect(html).toContain("ยอดที่ต้องชำระ / Amount Due");
    expect(html).toContain("ผู้รับวางบิล");
    expect(html).toContain("กำหนดชำระภายในวันที่ 7 ตุลาคม 2569");
    expect(html).not.toContain("ยกเลิก");
  });

  it("ใบแจ้งหนี้ไม่พิมพ์บัญชีรับเงินและ QR พร้อมเพย์ (ตามแบบฟอร์มของบริษัท · ลูกค้าดูช่องทางชำระในพอร์ทัล)", () => {
    const html = buildBillingDocHtml({ ...base, type: "INVOICE" });
    expect(html).not.toContain("เลขที่บัญชี");
    expect(html).not.toContain("พร้อมเพย์");
    expect(html).not.toContain("สแกนจ่าย");
  });

  it("ใบเสร็จที่เป็นใบกำกับภาษี มีคำว่าใบกำกับภาษีบนหัว ต้นฉบับ และอ้างอิงใบที่ออกแทน", () => {
    const html = buildBillingDocHtml({
      ...base,
      type: "RECEIPT",
      docNo: "RC-2026-0002",
      isTaxInvoice: true,
      replacesDocNo: "RC-2026-0001",
      companyTaxId: "0105551234567",
      companyBranch: "สำนักงานใหญ่",
      paidBefore: null,
      method: "TRANSFER",
    });
    expect(html).toContain("ใบเสร็จรับเงิน / ใบกำกับภาษี (Receipt / Tax Invoice)");
    expect(html).toContain("ต้นฉบับ");
    expect(html).toContain("ออกแทนเอกสารเลขที่ RC-2026-0001");
    expect(html).toContain("เลขที่ใบกำกับภาษี / Tax Invoice No.");
    // เลขผู้เสียภาษีของผู้ขาย + สถานประกอบการ (ต่อท้ายชื่อบริษัท ตามแบบฟอร์ม)
    expect(html).toContain("เลขประจำตัวผู้เสียภาษี / Tax ID : 0105551234567");
    expect(html).toContain("บริษัท ตัวอย่าง จำกัด สาขา สำนักงานใหญ่");
  });

  it("ต้นฉบับหน้าเดียว (ลูกค้า) กับ ต้นฉบับ + สำเนา (บริษัท) — ทั้งใบแจ้งหนี้และใบเสร็จ", () => {
    const sheets = (h: string) => h.match(/<section class="sheet">/g)?.length ?? 0;
    for (const type of ["INVOICE", "RECEIPT"] as const) {
      const one = buildBillingDocHtml({ ...base, type });
      expect(sheets(one)).toBe(1);
      expect(one).toContain(`<div class="original">ต้นฉบับ</div>`);
      expect(one).not.toContain(`<div class="original">สำเนา</div>`);

      const two = buildBillingDocHtml({ ...base, type, edition: "ORIGINAL_AND_COPY" });
      expect(sheets(two)).toBe(2);
      // ต้นฉบับมาก่อนสำเนา
      expect(two.indexOf(`<div class="original">ต้นฉบับ</div>`)).toBeLessThan(two.indexOf(`<div class="original">สำเนา</div>`));
    }
    // ยกเลิกแล้ว: แถบเหตุผลทุกหน้า แต่ลายน้ำครั้งเดียว (fixed พิมพ์ซ้ำทุกหน้าเอง)
    const voided = buildBillingDocHtml({
      ...base,
      type: "RECEIPT",
      edition: "ORIGINAL_AND_COPY",
      voidedAt: new Date("2026-10-18T03:00:00Z"),
      voidReason: "ทดสอบ",
    });
    expect(voided.match(/class="void-banner"/g)).toHaveLength(2);
    expect(voided.match(/class="void-mark"/g)).toHaveLength(1);
  });

  it("ใบแจ้งหนี้บอกชัดว่าไม่ใช่ใบกำกับภาษี", () => {
    const html = buildBillingDocHtml({ ...base, type: "INVOICE" });
    expect(html).toContain("เอกสารนี้ไม่ใช่ใบกำกับภาษี");
  });

  it("ใบเสร็จที่ถูกยกเลิกมีตราและเหตุผล และไม่มีคำว่าใบกำกับภาษี", () => {
    const html = buildBillingDocHtml({
      ...base,
      type: "RECEIPT",
      docNo: "RC-2026-0001",
      paidBefore: null,
      method: "TRANSFER",
      reference: "<ref>",
      voidedAt: new Date("2026-09-23T03:00:00Z"),
      voidReason: "ออกผิดรายการ",
    });
    expect(html).toContain("ใบเสร็จรับเงิน");
    expect(html).toContain("ออกผิดรายการ");
    expect(html).toContain("void-mark");
    expect(html).toContain("&lt;ref&gt;");
    expect(html).not.toContain("ใบกำกับภาษี");
  });
});
