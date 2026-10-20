import { todayIso } from "../../src/lib/business-date";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";
import { verifyAllPayments } from "../helpers/verify-payments";

jest.mock("../../src/lib/pdf/billing-doc-pdf", () => ({
  ...jest.requireActual("../../src/lib/pdf/billing-doc-pdf"),
  renderBillingDocPdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));

function isoDaysFromToday(delta: number): string {
  const base = new Date(`${todayIso()}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * เงินประกันผลงาน (retention)
 *
 * สิ่งที่พังแล้วเสียหายจริง: กันเงินไว้แล้วงวดยังค้าง (ทวงเงินที่ลูกค้าไม่ได้ติด) · เงินประกันหายไปจาก
 * ยอดที่ต้องได้ (ลืมทวงคืน) · ใบกำกับภาษีออกเต็มยอดทั้งที่ยังไม่ได้รับเงินส่วนที่ถูกกัน ·
 * หลังลงนามใครก็แก้ % ได้ (ตัวเลขไม่ตรงกับสัญญาที่ลูกค้าถือ)
 */
describe("เงินประกันผลงาน", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let itemCategoryId: string;
  let projectId: string;
  let contractId: string;
  let previousDefault: string | undefined;
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const projectIds: string[] = [];

  const url = (suffix = "") => `/api/projects/${projectId}/contracts/${contractId}${suffix}`;
  const payments = async () => (await owner.agent.get(url("/payments"))).body;

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-ret-owner");
    admin = await createAndLoginAdmin("test-ret-admin");
    customer = await createCustomerDirect("test-ret-customer");
    userIds.push(owner.userId, admin.userId, customer.userId);
    // ผู้ว่าจ้างนิติบุคคล — ตรวจว่าภาษีหัก ณ ที่จ่ายคิดหลังกันเงินประกันแล้ว
    await prisma.customerProfile.update({
      where: { userId: customer.userId },
      data: { customerType: "COMPANY", companyName: "บริษัท ทดสอบเงินประกัน จำกัด", taxId: "0105555555555", address: "กรุงเทพฯ" },
    });

    const cat = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบเงินประกัน" });
    categoryIds.push(cat.body.category.id);
    const sub = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: cat.body.category.id, name: "กลุ่มทดสอบเงินประกัน" });
    categoryIds.push(sub.body.category.id);
    const item = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: sub.body.category.id, name: "รายการทดสอบเงินประกัน" });
    itemCategoryId = item.body.category.id;
    categoryIds.push(itemCategoryId);
    await owner.agent.get("/api/contract-templates");

    previousDefault = (await prisma.setting.findUnique({ where: { key: "retentionPercent" } }))?.value;
    const set = await owner.agent.patch("/api/settings").send({ retentionPercent: 5 });
    expect(set.status).toBe(200);

    const res = await owner.agent.post("/api/projects").send({ name: "[ชั่วคราว] เงินประกัน", customerId: customer.userId });
    projectId = res.body.project.id;
    projectIds.push(projectId);
    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "งานโครงสร้าง",
      quantity: 10,
      unit: "หน่วย",
      materialUnitPrice: 6_000,
      laborUnitPrice: 4_000,
    });
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);
    await owner.agent.post(`/api/projects/${projectId}/quotes/${quote.body.quote.id}/transition`).send({ toStatus: "ACCEPTED" });
    await owner.agent.post(`/api/projects/${projectId}/transition`).send({ toStatus: "APPROVED" });
    const contract = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
    contractId = contract.body.contract.id;
  });

  afterAll(async () => {
    if (previousDefault === undefined) {
      await prisma.setting.deleteMany({ where: { key: "retentionPercent" } });
    } else {
      await prisma.setting.update({ where: { key: "retentionPercent" }, data: { value: previousDefault } });
    }
    await prisma.contract.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: categoryIds.reverse() } } });
    await prisma.$disconnect();
  });

  it("สัญญาใหม่รับ % ตั้งต้นจากหน้าตั้งค่า · ก่อนลงนามแก้ได้ · วันคืนตั้งได้หลังลงนามเท่านั้น", async () => {
    const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    expect(Number(contract.retentionPct)).toBe(5);

    const changed = await admin.agent.patch(url("/retention")).send({ pct: 10 });
    expect(changed.status).toBe(200);
    expect(changed.body.contract.retentionPct).toBe("10");
    expect(changed.body.payments).toBeNull();
    await admin.agent.patch(url("/retention")).send({ pct: 5 });

    const early = await owner.agent.patch(url("/retention")).send({ dueOn: isoDaysFromToday(365) });
    expect(early.status).toBe(409);

    await owner.agent.post(url("/sign"));
  });

  it("แต่ละงวดคาดว่าจะถูกกัน 5% ของยอดรวม VAT · ภาษีหัก ณ ที่จ่ายคิดจากส่วนที่จ่ายจริง", async () => {
    const view = await payments();
    expect(view.retention).toMatchObject({ pct: 5, setAfterSigning: false });
    const first = view.installments[0];
    const amount = Number(first.amount);
    expect(first.expectedRetention).toBe(r2(amount * 0.05));
    // หัก 3% ของส่วนก่อน VAT ที่จ่ายจริง (95% ของงวด)
    const base = amount / 1.07;
    expect(Math.abs(first.expectedWithholding - r2(base * 0.03 * 0.95))).toBeLessThanOrEqual(0.02);
    expect(view.retention.plannedTotal).toBe(
      r2(view.installments.reduce((s: number, i: { expectedRetention: number }) => s + i.expectedRetention, 0)),
    );
  });

  it("รับเงินแบบกันเงินประกัน → งวดปิดได้ (ไม่ค้าง 5%) · เงินเข้าจริง = ยอด − ภาษี − เงินประกัน", async () => {
    const first = (await payments()).installments[0];
    const amount = Number(first.amount);

    const tooMuch = await owner.agent.post(url(`/installments/${first.id}/payments`)).send({
      paidOn: todayIso(),
      amount,
      withholdingAmount: amount * 0.5,
      retentionAmount: amount * 0.5,
    });
    expect(tooMuch.status).toBe(400);

    const res = await owner.agent.post(url(`/installments/${first.id}/payments`)).send({
      paidOn: todayIso(),
      amount,
      withholdingAmount: first.expectedWithholding,
      retentionAmount: first.expectedRetention,
    });
    expect(res.status).toBe(200);
    const row = res.body.installments[0];
    expect(row.progress).toMatchObject({
      status: "PAID",
      remaining: 0,
      retainedAmount: first.expectedRetention,
      receivedAmount: r2(amount - first.expectedWithholding - first.expectedRetention),
    });
    expect(res.body.summary.retainedAmount).toBe(first.expectedRetention);
    expect(res.body.retention.balance).toMatchObject({ held: first.expectedRetention, outstanding: first.expectedRetention });
  });

  it("ใบเสร็จ/ใบกำกับภาษีของงวดคิด VAT จากเงินที่ได้รับจริง ไม่รวมส่วนที่ถูกกัน", async () => {
    const first = (await payments()).installments[0];
    const pay = first.payments[0];
    await verifyAllPayments(owner.agent, url());
    const res = await owner.agent.post(url(`/payments/${pay.id}/receipt`));
    expect(res.status).toBe(200);
    const doc = await prisma.billingDocument.findFirstOrThrow({ where: { paymentId: pay.id, type: "RECEIPT" } });
    expect(Number(doc.retentionAmount)).toBe(Number(pay.retentionAmount));
    const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    const vatShare = (Number(contract.vatAmount) * Number(first.amount)) / Number(contract.amount);
    const expected = (vatShare * (Number(pay.amount) - Number(pay.retentionAmount))) / Number(first.amount);
    expect(Math.abs(Number(doc.vatAmount) - expected)).toBeLessThanOrEqual(0.02);
  });

  it("หลังลงนาม ADMIN แก้ % ไม่ได้ · OWNER เติมได้แต่ถูกบันทึกว่าเติมหลังลงนาม", async () => {
    const denied = await admin.agent.patch(url("/retention")).send({ pct: 3 });
    expect(denied.status).toBe(403);
    const ok = await owner.agent.patch(url("/retention")).send({ pct: 3 });
    expect(ok.status).toBe(200);
    expect(ok.body.payments.retention).toMatchObject({ pct: 3, setAfterSigning: true });
    // ยอดที่กันไปแล้วไม่ถูกแก้ย้อนหลัง
    expect(ok.body.payments.retention.balance.held).toBe(Number((await payments()).installments[0].payments[0].retentionAmount));
    await owner.agent.patch(url("/retention")).send({ pct: 5 });
  });

  it("แดชบอร์ดเงินตามสัญญานับเงินประกันที่ยังไม่คืนแยกไว้", async () => {
    const res = await owner.agent.get("/api/dashboard/contract-cash");
    expect(res.status).toBe(200);
    const row = res.body.cash.rows.find((r: { contract: { id: string } }) => r.contract.id === contractId);
    expect(row.retentionOutstanding).toBe((await payments()).retention.balance.outstanding);
  });

  it("วางบิลคืนเงินประกัน → ตั้งวันครบกำหนดคืน · ซ้ำไม่ได้ · รับคืน + ใบเสร็จ → ไม่เหลือค้าง", async () => {
    const dueOn = isoDaysFromToday(30);
    const invoiced = await owner.agent.post(url("/retention/invoice")).send({ dueOn });
    expect(invoiced.status).toBe(200);
    const outstanding = invoiced.body.retention.balance.outstanding;
    expect(invoiced.body.retention.dueOn).toBe(dueOn);
    expect(invoiced.body.retention.documents).toEqual([
      expect.objectContaining({ type: "INVOICE", forRetention: true }),
    ]);
    expect(Number(invoiced.body.retention.documents[0].amount)).toBe(outstanding);
    expect((await owner.agent.post(url("/retention/invoice")).send({ dueOn })).status).toBe(409);

    const released = await owner.agent.post(url("/retention/releases")).send({
      paidOn: todayIso(),
      amount: outstanding,
      withholdingAmount: invoiced.body.retention.expectedWithholding,
    });
    expect(released.status).toBe(200);
    expect(released.body.retention.balance).toMatchObject({ outstanding: 0, released: outstanding });

    const release = released.body.retention.releases[0];
    const receipt = await owner.agent.post(url(`/retention/releases/${release.id}/receipt`));
    expect(receipt.status).toBe(200);
    const doc = receipt.body.retention.documents.find((d: { type: string }) => d.type === "RECEIPT");
    expect(doc).toMatchObject({ forRetention: true, retentionReleaseId: release.id });

    // ออกใบเสร็จแล้ว รายการรับคืนแก้/ลบไม่ได้
    expect((await owner.agent.delete(url(`/retention/releases/${release.id}`))).status).toBe(409);
  });

  it("ลูกค้าเห็นยอดเงินประกันและใบคืนเงินประกันในพอร์ทัล", async () => {
    // ลูกค้าเห็นเฉพาะเงินที่ยืนยันกับบัญชีแล้ว
    await verifyAllPayments(owner.agent, url());
    const res = await customer.agent.get("/api/my/contracts");
    expect(res.status).toBe(200);
    const mine = res.body.contracts.find((c: { id: string }) => c.id === contractId);
    expect(mine.payment.retention).toMatchObject({ pct: 5, outstanding: 0 });
    expect(mine.payment.retention.held).toBeGreaterThan(0);
    expect(mine.payment.retention.documents).toHaveLength(2);

    // หน้าการชำระเงินแสดงชุดเดียวกัน (ย้ายจากหน้าสัญญามาอยู่ที่นี่ 18 ต.ค.)
    const pay = await customer.agent.get("/api/my/payments");
    const r = pay.body.payments.retentions.find((x: { contractId: string }) => x.contractId === contractId);
    expect(r.retention).toEqual(mine.payment.retention);
    // ใบแจ้งหนี้ของงวดอยู่ในแถวประวัติการชำระ (ถ้ามี)
    const withInvoice = pay.body.payments.history.filter(
      (h: { contractId: string; invoice: unknown }) => h.contractId === contractId && h.invoice,
    );
    const invoices = await prisma.billingDocument.count({
      where: { contractId, type: "INVOICE", voidedAt: null, forRetention: false, installment: { payments: { some: {} } } },
    });
    expect(withInvoice.length > 0).toBe(invoices > 0);
  });

  it("สัญญาที่ไม่เคยถูกกันเงินประกัน รับคืนไม่ได้", async () => {
    const other = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
    const otherUrl = `/api/projects/${projectId}/contracts/${other.body.contract.id}`;
    await owner.agent.post(`${otherUrl}/sign`);
    const res = await owner.agent
      .post(`${otherUrl}/retention/releases`)
      .send({ paidOn: todayIso(), amount: 1000, withholdingAmount: 0 });
    expect(res.status).toBe(409);
  });
});
