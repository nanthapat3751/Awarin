import fs from "node:fs";

import request from "supertest";

import { app } from "../../src/app";
import { todayIso } from "../../src/lib/business-date";
import { hashPassword } from "../../src/lib/password";
import { prisma } from "../../src/lib/prisma";
import { EVIDENCE_DIR, evidencePath } from "../../src/modules/contracts/payment-evidence.files";
import { createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";
import { verifyAllPayments } from "../helpers/verify-payments";

// Puppeteer เป็น ESM รันใต้ ts-jest ไม่ได้ — mock เฉพาะขั้นเรนเดอร์ แล้วเก็บข้อมูลที่ส่งเข้าไปไว้ตรวจ
// (ยอดใน QR ที่ฝังลงใบแจ้งหนี้) ตัวสร้าง HTML ยังเป็นของจริง ตรวจใน billing-docs.test.ts
const renderedDocs: { promptPayQr?: { amount: number } | null }[] = [];
jest.mock("../../src/lib/pdf/billing-doc-pdf", () => ({
  ...jest.requireActual("../../src/lib/pdf/billing-doc-pdf"),
  renderBillingDocPdf: jest.fn(async (data: { promptPayQr?: { amount: number } | null }) => {
    renderedDocs.push(data);
    return Buffer.from("%PDF-1.7 mock");
  }),
}));

async function createAndLoginAdmin(prefix: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `${prefix}-${stamp}@example.com`;
  const username = `${prefix}-${stamp}`.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
  const password = "Hollow-cobbler-19-seabreeze";
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, username, passwordHash, fullName: "Test Admin", role: "ADMIN" },
  });
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/staff/login").send({ username, password });
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status}`);
  return { agent, userId: user.id };
}

/** วันที่ล้วนแบบ YYYY-MM-DD เลื่อนจากวันนี้ไปกี่วันก็ได้ (ติดลบ = ย้อนหลัง) */
function isoDaysFromToday(delta: number): string {
  const base = new Date(`${todayIso()}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}

/**
 * ติดตามการจ่ายเงินรายงวด
 *
 * สองข้อที่พังแล้วเสียหายจริง:
 * 1. รับเงินลงสัญญาที่ยังไม่เซ็นได้ → ยอดลูกหนี้พองเป็นเท่าตัวทันที เพราะโครงการหนึ่งออกสัญญา
 *    ค้างไว้ได้หลายฉบับ ยอดเท่ากันหมด
 * 2. หัก ณ ที่จ่าย 3% แล้วงวดยังค้าง → ทวงเงินที่ลูกค้าจ่ายครบแล้ว
 */
describe("ติดตามการจ่ายเงินรายงวด", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let itemCategoryId: string;
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const projectIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-pay-owner");
    admin = await createAndLoginAdmin("test-pay-admin");
    customer = await createCustomerDirect("test-pay-customer");
    userIds.push(owner.userId, admin.userId, customer.userId);

    const cat = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบรับเงิน" });
    categoryIds.push(cat.body.category.id);
    const sub = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: cat.body.category.id, name: "กลุ่มทดสอบรับเงิน" });
    categoryIds.push(sub.body.category.id);
    const item = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: sub.body.category.id, name: "รายการทดสอบรับเงิน" });
    itemCategoryId = item.body.category.id;
    categoryIds.push(itemCategoryId);

    await owner.agent.get("/api/contract-templates"); // สร้างแม่แบบมาตรฐานถ้ายังไม่มี
  });

  afterAll(async () => {
    // รายการรับเงินและงวดหายไปตาม FK CASCADE ของสัญญา ลบสัญญาก็พอ
    await prisma.contract.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    // ไม่ลบ AuditLog — ตารางนั้นเป็น append-only โดยตั้งใจ (role ของแอปถูก REVOKE DELETE)
    // แถวที่ค้างจะถูก SET NULL ตอนลบผู้ใช้ และถูกไล่ลบเองเมื่อครบ 1 ปี
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: categoryIds.reverse() } } });
  });

  /** โครงการที่อนุมัติแล้ว + ออกสัญญา (ยังไม่เซ็น) */
  async function contractFor(name: string, unitPrice = 100_000) {
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
      materialUnitPrice: unitPrice * 0.6,
      laborUnitPrice: unitPrice * 0.4,
    });
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    const quoteId = quote.body.quote.id;
    await sendQuote(owner.agent, projectId, quoteId);
    await owner.agent
      .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
      .send({ toStatus: "ACCEPTED" });
    await owner.agent.post(`/api/projects/${projectId}/transition`).send({ toStatus: "APPROVED" });

    const contract = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
    return { projectId, contractId: contract.body.contract.id as string };
  }

  async function signedContractFor(name: string) {
    const made = await contractFor(name);
    await owner.agent.post(`/api/projects/${made.projectId}/contracts/${made.contractId}/sign`);
    return made;
  }

  const paymentsUrl = (p: string, c: string) => `/api/projects/${p}/contracts/${c}/payments`;

  /**
   * โครงการหนึ่งออกสัญญาค้างไว้ได้หลายฉบับ ยอดเท่ากันหมด ต่างกันแค่ฉบับไหนถูกเซ็น
   * ถ้ารับเงินลงฉบับไหนก็ได้ ยอดลูกหนี้จะกลายเป็นหลายเท่าโดยไม่มีใครเห็น
   */
  it("สัญญาที่ยังไม่ลงนาม บันทึกรับเงินไม่ได้และดูยอดรับเงินไม่ได้", async () => {
    const { projectId, contractId } = await contractFor("[ชั่วคราว] ยังไม่เซ็น");
    const view = await owner.agent.get(paymentsUrl(projectId, contractId));
    expect(view.status).toBe(409);
    expect(view.body.error).toContain("ยังไม่ได้ลงนาม");

    const installments = await owner.agent.get(
      `/api/projects/${projectId}/contracts/${contractId}/installments`,
    );
    const first = installments.body.installments[0];
    const record = await owner.agent
      .post(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/payments`)
      .send({ paidOn: todayIso(), amount: 1000 });
    expect(record.status).toBe(409);
  });

  it("สัญญาที่ลงนามแล้วเริ่มต้นด้วยทุกงวดยังไม่ถึงกำหนด ไม่ใช่ค้างชำระ", async () => {
    const { projectId, contractId } = await signedContractFor("[ชั่วคราว] เริ่มต้น");
    const res = await owner.agent.get(paymentsUrl(projectId, contractId));
    expect(res.status).toBe(200);
    expect(res.body.hasPlan).toBe(true);
    expect(res.body.installments).toHaveLength(7);
    expect(res.body.installments.every((i: { progress: { status: string } }) => i.progress.status === "NOT_DUE")).toBe(true);
    expect(res.body.summary.paidAmount).toBe(0);
    expect(res.body.summary.overdueCount).toBe(0);
    // ยอดรวมของแผนต้องเท่ามูลค่าสัญญาที่ตรึงไว้
    expect(res.body.summary.planTotal).toBeCloseTo(res.body.contractAmount, 2);
  });

  it("ตั้งวันครบกำหนดย้อนหลังแล้วงวดกลายเป็นรอรับเงินพร้อมจำนวนวันที่ค้าง", async () => {
    const { projectId, contractId } = await signedContractFor("[ชั่วคราว] ครบกำหนด");
    const view = await owner.agent.get(paymentsUrl(projectId, contractId));
    const first = view.body.installments[0];

    const res = await owner.agent
      .patch(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/due`)
      .send({ dueOn: isoDaysFromToday(-12) });
    expect(res.status).toBe(200);
    expect(res.body.installments[0].progress.status).toBe("AWAITING");
    expect(res.body.installments[0].progress.daysOverdue).toBe(12);
    expect(res.body.summary.overdueCount).toBe(1);
    expect(res.body.summary.overdueAmount).toBeCloseTo(Number(first.amount), 2);
  });

  it("งวดที่เลยกำหนดโผล่ในหน้างานค้าง แล้วหายไปเมื่อรับเงินครบ", async () => {
    const { projectId, contractId } = await signedContractFor("[ชั่วคราว] งานค้าง");
    const view = await owner.agent.get(paymentsUrl(projectId, contractId));
    const first = view.body.installments[0];
    await owner.agent
      .patch(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/due`)
      .send({ dueOn: isoDaysFromToday(-5) });

    const before = await owner.agent.get("/api/dashboard/pending-work");
    const mine = before.body.pendingWork.awaitingPayment.filter(
      (r: { project: { id: string } }) => r.project.id === projectId,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].daysOverdue).toBe(5);
    expect(mine[0].remaining).toBeCloseTo(Number(first.amount), 2);

    await owner.agent
      .post(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/payments`)
      .send({ paidOn: todayIso(), amount: Number(first.amount) });

    const after = await owner.agent.get("/api/dashboard/pending-work");
    expect(
      after.body.pendingWork.awaitingPayment.filter(
        (r: { project: { id: string } }) => r.project.id === projectId,
      ),
    ).toHaveLength(0);
  });

  it("รับบางส่วนแล้วยอดค้างในหน้างานค้างเหลือเฉพาะส่วนที่ยังขาด ไม่ใช่ยอดเต็มของงวด", async () => {
    const { projectId, contractId } = await signedContractFor("[ชั่วคราว] บางส่วน");
    const view = await owner.agent.get(paymentsUrl(projectId, contractId));
    const first = view.body.installments[0];
    const full = Number(first.amount);
    await owner.agent
      .patch(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/due`)
      .send({ dueOn: isoDaysFromToday(-3) });

    const res = await owner.agent
      .post(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/payments`)
      .send({ paidOn: todayIso(), amount: full / 2, method: "CASH" });
    expect(res.status).toBe(200);
    expect(res.body.installments[0].progress.status).toBe("PARTIAL");
    expect(res.body.installments[0].progress.remaining).toBeCloseTo(full / 2, 2);
    // เลยกำหนดและรับบางส่วน = ต้องบอกทั้งสองอย่าง ไม่ยุบเหลืออย่างเดียว
    expect(res.body.installments[0].progress.daysOverdue).toBe(3);

    const pending = await owner.agent.get("/api/dashboard/pending-work");
    const mine = pending.body.pendingWork.awaitingPayment.filter(
      (r: { project: { id: string } }) => r.project.id === projectId,
    );
    expect(mine[0].remaining).toBeCloseTo(full / 2, 2);
  });

  /**
   * ลูกค้านิติบุคคลหัก 3% ไว้นำส่งสรรพากร เงินเข้าบัญชีน้อยกว่ายอดงวด แต่หนี้งวดนั้นปิดแล้ว
   * ถ้าระบบยังขึ้นว่าค้าง เราจะไปทวงเงินที่ลูกค้าจ่ายครบแล้ว
   */
  it("หัก ณ ที่จ่ายแล้วงวดปิด ไม่ค้างส่วนที่ถูกหักไว้", async () => {
    const { projectId, contractId } = await signedContractFor("[ชั่วคราว] หักภาษี");
    const view = await owner.agent.get(paymentsUrl(projectId, contractId));
    const first = view.body.installments[0];
    const full = Number(first.amount);
    const tax = Math.round(full * 0.028 * 100) / 100;

    const res = await owner.agent
      .post(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/payments`)
      .send({ paidOn: todayIso(), amount: full, withholdingAmount: tax });
    expect(res.status).toBe(200);
    const p = res.body.installments[0].progress;
    expect(p.status).toBe("PAID");
    expect(p.remaining).toBe(0);
    expect(p.withheldAmount).toBeCloseTo(tax, 2);
    expect(p.receivedAmount).toBeCloseTo(full - tax, 2);
  });

  it("รับเกินยอดงวดได้ แต่ต้องบอกว่าเกิน", async () => {
    const { projectId, contractId } = await signedContractFor("[ชั่วคราว] รับเกิน");
    const view = await owner.agent.get(paymentsUrl(projectId, contractId));
    const first = view.body.installments[0];

    const res = await owner.agent
      .post(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/payments`)
      .send({ paidOn: todayIso(), amount: Number(first.amount) + 5 });
    expect(res.status).toBe(200);
    expect(res.body.installments[0].progress.status).toBe("OVERPAID");
    expect(res.body.installments[0].progress.overpaidAmount).toBeCloseTo(5, 2);
    expect(res.body.installments[0].progress.remaining).toBe(0);
  });

  it("ปฏิเสธวันที่รับเงินในอนาคต และภาษีหักที่ไม่น้อยกว่ายอดที่รับ", async () => {
    const { projectId, contractId } = await signedContractFor("[ชั่วคราว] ค่าผิด");
    const view = await owner.agent.get(paymentsUrl(projectId, contractId));
    const url = `/api/projects/${projectId}/contracts/${contractId}/installments/${view.body.installments[0].id}/payments`;

    const future = await owner.agent
      .post(url)
      .send({ paidOn: isoDaysFromToday(1), amount: 1000 });
    expect(future.status).toBe(400);
    expect(future.body.error).toContain("อนาคต");

    const tooMuchTax = await owner.agent
      .post(url)
      .send({ paidOn: todayIso(), amount: 1000, withholdingAmount: 1000 });
    expect(tooMuchTax.status).toBe(400);

    const badAmount = await owner.agent.post(url).send({ paidOn: todayIso(), amount: 0 });
    expect(badAmount.status).toBe(400);
  });

  it("แก้/ลบได้เฉพาะรายการที่ตัวเองบันทึก แต่เจ้าของกิจการแก้ของทุกคนได้", async () => {
    const { projectId, contractId } = await signedContractFor("[ชั่วคราว] สิทธิ์");
    const view = await owner.agent.get(paymentsUrl(projectId, contractId));
    const first = view.body.installments[0];

    // ADMIN บันทึกรายการหนึ่ง
    const byAdmin = await admin.agent
      .post(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/payments`)
      .send({ paidOn: todayIso(), amount: 1000 });
    expect(byAdmin.status).toBe(200);
    const adminPaymentId = byAdmin.body.installments[0].payments[0].id;

    // OWNER บันทึกอีกรายการ แล้ว ADMIN พยายามแก้ของ OWNER
    const byOwner = await owner.agent
      .post(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/payments`)
      .send({ paidOn: todayIso(), amount: 2000 });
    const ownerPaymentId = byOwner.body.installments[0].payments.find(
      (p: { amount: string }) => Number(p.amount) === 2000,
    ).id;

    const denied = await admin.agent
      .patch(`/api/projects/${projectId}/contracts/${contractId}/payments/${ownerPaymentId}`)
      .send({ paidOn: todayIso(), amount: 5 });
    expect(denied.status).toBe(403);

    // เจ้าของกิจการแก้ของ ADMIN ได้
    const allowed = await owner.agent
      .patch(`/api/projects/${projectId}/contracts/${contractId}/payments/${adminPaymentId}`)
      .send({ paidOn: todayIso(), amount: 1500 });
    expect(allowed.status).toBe(200);
    expect(allowed.body.installments[0].progress.paidAmount).toBeCloseTo(3500, 2);

    const removed = await owner.agent.delete(
      `/api/projects/${projectId}/contracts/${contractId}/payments/${adminPaymentId}`,
    );
    expect(removed.status).toBe(200);
    expect(removed.body.installments[0].progress.paidAmount).toBeCloseTo(2000, 2);
  });

  /**
   * แผนงวดกับรายการรับเงินผูกกันด้วย FK แบบ CASCADE — ถ้าเขียนทับแผนงวดได้หลังลงนาม
   * รายการรับเงินทั้งหมดจะถูกลบตามไปเงียบ ๆ กฎ "แก้แผนไม่ได้หลังลงนาม" คือสิ่งที่กันไว้
   */
  it("เขียนทับแผนงวดหลังลงนามไม่ได้ รายการรับเงินจึงไม่ถูกลบตาม", async () => {
    const { projectId, contractId } = await signedContractFor("[ชั่วคราว] กันลบ");
    const view = await owner.agent.get(paymentsUrl(projectId, contractId));
    const first = view.body.installments[0];
    await owner.agent
      .post(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/payments`)
      .send({ paidOn: todayIso(), amount: 777 });

    const overwrite = await owner.agent
      .put(`/api/projects/${projectId}/contracts/${contractId}/installments`)
      .send({ installments: [{ milestone: "ยุบเหลืองวดเดียว", amount: Number(view.body.contractAmount) }] });
    expect(overwrite.status).toBe(409);

    const after = await owner.agent.get(paymentsUrl(projectId, contractId));
    expect(after.body.installments).toHaveLength(7);
    expect(after.body.installments[0].progress.paidAmount).toBeCloseTo(777, 2);
  });

  it("ลูกค้าเห็นสถานะการชำระเงินเฉพาะสัญญาที่ลงนามแล้ว", async () => {
    const signed = await signedContractFor("[ชั่วคราว] ลูกค้าเห็น");
    const view = await owner.agent.get(paymentsUrl(signed.projectId, signed.contractId));
    const first = view.body.installments[0];
    await owner.agent
      .patch(
        `/api/projects/${signed.projectId}/contracts/${signed.contractId}/installments/${first.id}/due`,
      )
      .send({ dueOn: isoDaysFromToday(-2) });
    await owner.agent
      .post(
        `/api/projects/${signed.projectId}/contracts/${signed.contractId}/installments/${first.id}/payments`,
      )
      .send({ paidOn: todayIso(), amount: Number(first.amount) });

    // ฉบับที่สองของโครงการเดียวกัน ยังไม่เซ็น
    const draft = await owner.agent.post(`/api/projects/${signed.projectId}/contracts`).send({});
    const draftId = draft.body.contract.id as string;
    // ลูกค้าเห็นเฉพาะเงินที่ยืนยันกับบัญชีแล้ว
    await verifyAllPayments(owner.agent, `/api/projects/${signed.projectId}/contracts/${signed.contractId}`);

    const res = await customer.agent.get("/api/my/contracts");
    expect(res.status).toBe(200);
    const signedRow = res.body.contracts.find(
      (c: { id: string }) => c.id === signed.contractId,
    );
    const draftRow = res.body.contracts.find((c: { id: string }) => c.id === draftId);

    expect(signedRow.payment).not.toBeNull();
    expect(signedRow.payment.totalCount).toBe(7);
    expect(signedRow.payment.paidCount).toBe(1);
    expect(signedRow.payment.installments[0].status).toBe("PAID");
    expect(signedRow.payment.installments[0].lastPaidOn).toBe(todayIso());
    // ฉบับร่างต้องไม่โชว์ยอดค้าง ไม่งั้นลูกค้าเห็นหนี้ก้อนเดิมซ้ำสองรอบ
    expect(draftRow.payment).toBeNull();

    // เรื่องภายในต้องไม่หลุดไปฝั่งลูกค้า
    expect(JSON.stringify(signedRow)).not.toContain("recordedByName");
    expect(JSON.stringify(signedRow)).not.toContain("withholdingAmount");
  });

  /**
   * หลักฐานการรับเงิน — เงินโอนมีสลิป เงินสดมีชื่อคนรับ · ไฟล์ต้องเปิดได้เฉพาะพนักงาน
   * และไม่ทิ้งไฟล์กำพร้าไว้บนดิสก์เมื่อรายการรับเงินถูกลบ
   */
  it("แนบสลิปเป็นหลักฐาน เปิดดูได้ ลบได้ และไฟล์หายตามเมื่อลบรายการรับเงิน", async () => {
    const { projectId, contractId } = await signedContractFor("[ชั่วคราว] หลักฐาน");
    const view = await owner.agent.get(paymentsUrl(projectId, contractId));
    const first = view.body.installments[0];
    const recorded = await admin.agent
      .post(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/payments`)
      .send({ paidOn: todayIso(), amount: 1000, method: "TRANSFER", receivedBy: "ไม่ควรเก็บ" });
    const payment = recorded.body.installments[0].payments[0];
    // โอนเข้าบัญชีบริษัทตรง ไม่มี "คนรับเงิน"
    expect(payment.receivedBy).toBeNull();
    expect(payment.evidence).toEqual([]);

    const evidenceUrl = `/api/projects/${projectId}/contracts/${contractId}/payments/${payment.id}/evidence`;
    const png = Buffer.from("89504e470d0a1a0a", "hex");

    // ไฟล์ที่ไม่ใช่รูป/PDF ไม่รับ — แม้จะตั้งนามสกุลหลอก
    const svg = await owner.agent
      .post(evidenceUrl)
      .attach("file", Buffer.from("<svg/>"), { filename: "slip.svg", contentType: "image/svg+xml" });
    expect(svg.status).toBe(400);
    const fake = await owner.agent
      .post(evidenceUrl)
      .attach("file", Buffer.from("<html>"), { filename: "slip.png", contentType: "text/html" });
    expect(fake.status).toBe(400);

    // คนอื่นที่ไม่ใช่คนบันทึกก็แนบได้ (สลิปมักมาถึงทีหลัง)
    const up = await owner.agent
      .post(evidenceUrl)
      .attach("file", png, { filename: "สลิปโอน.png", contentType: "image/png" });
    expect(up.status).toBe(200);
    const ev = up.body.installments[0].payments[0].evidence;
    expect(ev).toHaveLength(1);
    expect(ev[0].fileName).toBe("สลิปโอน.png");
    expect(JSON.stringify(up.body)).not.toContain("storedName");
    const stored = await prisma.paymentEvidence.findUniqueOrThrow({ where: { id: ev[0].id } });
    expect(stored.storedName.startsWith("pay-")).toBe(true);
    expect(fs.existsSync(evidencePath(stored.storedName))).toBe(true);
    expect(EVIDENCE_DIR).toContain(process.env.PRIVATE_UPLOADS_DIR!);

    const open = await admin.agent.get(`${evidenceUrl}/${ev[0].id}`);
    expect(open.status).toBe(200);
    expect(open.headers["content-type"]).toContain("image/png");
    expect(open.headers["content-disposition"]).toContain("inline");

    // ไม่ล็อกอิน / ลูกค้า เปิดไม่ได้
    expect((await request(app).get(`${evidenceUrl}/${ev[0].id}`)).status).toBe(401);
    expect((await customer.agent.get(`${evidenceUrl}/${ev[0].id}`)).status).toBe(403);
    const mine = await customer.agent.get("/api/my/contracts");
    expect(JSON.stringify(mine.body)).not.toContain("evidence");

    // ADMIN บันทึกรายการเอง จึงลบหลักฐานที่ OWNER แนบในรายการของตัวเองได้
    const second = await owner.agent
      .post(evidenceUrl)
      .attach("file", Buffer.from("%PDF-1.4"), { filename: "ใบนำฝาก.pdf", contentType: "application/pdf" });
    const secondId = second.body.installments[0].payments[0].evidence[1].id as string;
    const secondStored = (await prisma.paymentEvidence.findUniqueOrThrow({ where: { id: secondId } })).storedName;
    const del = await admin.agent.delete(`${evidenceUrl}/${secondId}`);
    expect(del.status).toBe(200);
    expect(del.body.installments[0].payments[0].evidence).toHaveLength(1);
    expect(fs.existsSync(evidencePath(secondStored))).toBe(false);

    // ลบรายการรับเงิน → แถวหลักฐานหายตาม CASCADE และไฟล์บนดิสก์ต้องถูกลบด้วย
    const removed = await owner.agent.delete(paymentsUrl(projectId, contractId) + `/${payment.id}`);
    expect(removed.status).toBe(200);
    expect(await prisma.paymentEvidence.count({ where: { id: ev[0].id } })).toBe(0);
    expect(fs.existsSync(evidencePath(stored.storedName))).toBe(false);
  });

  it("เงินสดเก็บชื่อคนรับ และเปลี่ยนเป็นโอนแล้วชื่อถูกล้าง", async () => {
    const { projectId, contractId } = await signedContractFor("[ชั่วคราว] เงินสด");
    const view = await owner.agent.get(paymentsUrl(projectId, contractId));
    const first = view.body.installments[0];
    const cash = await owner.agent
      .post(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/payments`)
      .send({ paidOn: todayIso(), amount: 500, method: "CASH", receivedBy: "  ช่างสมชาย  " });
    const payment = cash.body.installments[0].payments[0];
    expect(payment.receivedBy).toBe("ช่างสมชาย");

    const toTransfer = await owner.agent
      .patch(`${paymentsUrl(projectId, contractId)}/${payment.id}`)
      .send({ paidOn: todayIso(), amount: 500, method: "TRANSFER", receivedBy: "ช่างสมชาย" });
    expect(toTransfer.body.installments[0].payments[0].receivedBy).toBeNull();
  });

  /**
   * ลูกค้าแจ้งโอนพร้อมสลิป — การแจ้งไม่ใช่เงินเข้า งวดต้องยังค้างจนพนักงานตรวจบัญชีแล้วยืนยัน
   * ยืนยัน = บันทึกรับเงินตามปกติ (noticeId) แล้วสลิปลูกค้าย้ายไปเป็นหลักฐานของรายการนั้น
   */
  it("ลูกค้าแจ้งโอนพร้อมสลิป → ไม่ผ่าน → แจ้งใหม่ → พนักงานยืนยันเป็นรายการรับเงิน", async () => {
    const { projectId, contractId } = await signedContractFor("[ชั่วคราว] แจ้งโอน");
    const view = await owner.agent.get(paymentsUrl(projectId, contractId));
    const first = view.body.installments[0];
    const noticeUrl = `/api/my/contracts/${contractId}/payment-notices`;
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const notify = (agent: typeof customer.agent, fields: Record<string, string>, withFile = true) => {
      let req = agent.post(noticeUrl);
      for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
      return withFile ? req.attach("files", png, { filename: "สลิป.png", contentType: "image/png" }) : req;
    };
    const base = { installmentId: first.id, paidOn: todayIso(), amount: "1000" };

    // ยังไม่ถึงงวด (ไม่วางบิล ไม่ตั้งวันครบกำหนด) — ไม่มีอะไรให้โอน
    const early = await notify(customer.agent, base);
    expect(early.status).toBe(409);
    let mine = await customer.agent.get("/api/my/contracts");
    let row = mine.body.contracts.find((c: { id: string }) => c.id === contractId).payment.installments[0];
    expect(row.canNotify).toBe(false);

    await owner.agent
      .patch(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/due`)
      .send({ dueOn: todayIso() });

    // ต้องมีสลิป · ลูกค้าคนอื่นแจ้งลงสัญญานี้ไม่ได้
    expect((await notify(customer.agent, base, false)).status).toBe(400);
    const stranger = await createCustomerDirect("test-pay-stranger");
    userIds.push(stranger.userId);
    expect((await notify(stranger.agent, base)).status).toBe(404);

    const sent = await notify(customer.agent, { ...base, note: "โอนจากบัญชีบริษัท" });
    expect(sent.status).toBe(200);
    row = sent.body.contracts.find((c: { id: string }) => c.id === contractId).payment.installments[0];
    expect(row.notice.status).toBe("PENDING");
    expect(row.canNotify).toBe(false);
    // การแจ้งไม่ใช่เงินเข้า — งวดยังค้างเต็มยอด
    expect(row.paidAmount).toBe(0);
    // แจ้งซ้ำงวดเดียวกันระหว่างรอตรวจไม่ได้ (ยืนยันสองรอบ = รับเงินซ้ำ)
    expect((await notify(customer.agent, base)).status).toBe(409);

    // ลูกค้าเปิดสลิปตัวเองได้
    const slipId = row.notice.evidence[0].id;
    const ownSlip = await customer.agent.get(`${noticeUrl}/${row.notice.id}/evidence/${slipId}`);
    expect(ownSlip.status).toBe(200);
    expect(ownSlip.headers["content-type"]).toContain("image/png");
    expect((await stranger.agent.get(`${noticeUrl}/${row.notice.id}/evidence/${slipId}`)).status).toBe(404);

    // พนักงานเห็นในงวด + ได้แจ้งเตือน + ขึ้นหน้างานค้าง
    let staffView = await admin.agent.get(paymentsUrl(projectId, contractId));
    const pending = staffView.body.installments[0].pendingNotices;
    expect(pending).toHaveLength(1);
    expect(pending[0].amount).toBe("1000");
    expect(pending[0].note).toBe("โอนจากบัญชีบริษัท");
    expect(pending[0].evidence[0].fileName).toBe("สลิป.png");
    const staffSlip = await admin.agent.get(
      `/api/projects/${projectId}/contracts/${contractId}/payment-notices/${pending[0].id}/evidence/${slipId}`,
    );
    expect(staffSlip.status).toBe(200);
    const bell = await prisma.notification.findFirst({
      where: { userId: admin.userId, message: { contains: "แจ้งโอนเงิน" }, link: { contains: contractId } },
    });
    expect(bell).not.toBeNull();
    const work = await owner.agent.get("/api/dashboard/pending-work");
    expect(
      work.body.pendingWork.pendingPaymentNotices.some((n: { notice: { id: string } }) => n.notice.id === pending[0].id),
    ).toBe(true);

    // ไม่ผ่าน — ต้องมีเหตุผล แล้วลูกค้าเห็นเหตุผลและแจ้งใหม่ได้
    const rejectUrl = `/api/projects/${projectId}/contracts/${contractId}/payment-notices/${pending[0].id}/reject`;
    expect((await admin.agent.post(rejectUrl).send({ reason: " " })).status).toBe(400);
    const rejected = await admin.agent.post(rejectUrl).send({ reason: "ยอดไม่ตรงกับเงินเข้า" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.installments[0].pendingNotices).toHaveLength(0);
    expect((await admin.agent.post(rejectUrl).send({ reason: "ซ้ำ" })).status).toBe(409);
    mine = await customer.agent.get("/api/my/contracts");
    row = mine.body.contracts.find((c: { id: string }) => c.id === contractId).payment.installments[0];
    expect(row.notice.status).toBe("REJECTED");
    expect(row.notice.rejectReason).toBe("ยอดไม่ตรงกับเงินเข้า");
    expect(row.canNotify).toBe(true);

    // แจ้งใหม่ แล้วพนักงานยืนยันด้วยการบันทึกรับเงินพร้อม noticeId
    const again = await notify(customer.agent, { ...base, amount: Number(first.amount).toFixed(2) });
    const noticeId = again.body.contracts.find((c: { id: string }) => c.id === contractId).payment.installments[0]
      .notice.id as string;
    const recordUrl = `/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/payments`;
    const confirmed = await admin.agent
      .post(recordUrl)
      .send({ paidOn: todayIso(), amount: Number(first.amount), method: "TRANSFER", noticeId });
    expect(confirmed.status).toBe(200);
    const inst = confirmed.body.installments[0];
    expect(inst.pendingNotices).toHaveLength(0);
    expect(inst.progress.status).toBe("PAID");
    // สลิปของลูกค้ากลายเป็นหลักฐานของรายการนี้
    expect(inst.payments[0].evidence).toHaveLength(1);
    expect(inst.payments[0].evidence[0].uploadedById).toBe(customer.userId);
    // ยืนยันซ้ำไม่ได้
    const twice = await admin.agent
      .post(recordUrl)
      .send({ paidOn: todayIso(), amount: 1, method: "TRANSFER", noticeId });
    expect(twice.status).toBe(409);
    // ยังไม่มีใครยืนยันกับบัญชี — ลูกค้ายังเห็นการแจ้งเป็นรอตรวจ (ไม่หายไปเฉย ๆ) และยังไม่ถูกแจ้งว่าได้รับเงิน
    mine = await customer.agent.get("/api/my/contracts");
    row = mine.body.contracts.find((c: { id: string }) => c.id === contractId).payment.installments[0];
    expect(row.notice.status).toBe("PENDING");
    expect(row.status).not.toBe("PAID");
    expect(row.canNotify).toBe(false);
    expect(
      await prisma.notification.count({
        where: { userId: customer.userId, message: { contains: "บริษัทได้รับเงินงวดที่" }, link: `/my/payments/${first.id}` },
      }),
    ).toBe(0);
    await verifyAllPayments(owner.agent, `/api/projects/${projectId}/contracts/${contractId}`);
    mine = await customer.agent.get("/api/my/contracts");
    row = mine.body.contracts.find((c: { id: string }) => c.id === contractId).payment.installments[0];
    expect(row.notice).toBeNull();
    expect(row.status).toBe("PAID");
    expect(
      await prisma.notification.count({
        where: { userId: customer.userId, message: { contains: "บริษัทได้รับเงินงวดที่" }, link: `/my/payments/${first.id}` },
      }),
    ).toBeGreaterThan(0);

    // ลบรายการเพราะบันทึกผิด → การแจ้งกลับเป็นรอตรวจ สลิปลูกค้ายังอยู่ (ไม่ได้แปลว่าลูกค้าไม่ได้โอน)
    const evidenceRow = await prisma.paymentEvidence.findFirstOrThrow({ where: { noticeId } });
    const removed = await admin.agent.delete(`${paymentsUrl(projectId, contractId)}/${inst.payments[0].id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.installments[0].pendingNotices[0].id).toBe(noticeId);
    expect(removed.body.installments[0].pendingNotices[0].evidence).toHaveLength(1);
    expect(fs.existsSync(evidencePath(evidenceRow.storedName))).toBe(true);
    staffView = await admin.agent.get(paymentsUrl(projectId, contractId));
    expect(staffView.body.installments[0].payments).toHaveLength(0);
  });

  /**
   * QR พร้อมเพย์ในพอร์ทัลต้องเป็นยอดเดียวกับ "ยอดโอนสุทธิ" บนใบแจ้งหนี้ — ถ้าคนละยอด ลูกค้าโอนตาม QR
   * แล้วงวดไม่ปิด หรือโอนตามใบแล้วไม่ตรง QR · ขึ้นเฉพาะงวดที่ถึงคิวจ่าย และเมื่อบริษัทตั้งพร้อมเพย์แล้ว
   */
  it("QR พร้อมเพย์ในพอร์ทัลยอดตรงกับใบแจ้งหนี้ และขึ้นเฉพาะเมื่อตั้งพร้อมเพย์ + งวดถึงคิว", async () => {
    const KEYS = ["paymentBankName", "paymentBankBranch", "paymentAccountName", "paymentAccountNo", "paymentPromptPay"];
    const saved = await prisma.setting.findMany({ where: { key: { in: KEYS } } });
    try {
      const { projectId, contractId } = await signedContractFor("[ชั่วคราว] QR พร้อมเพย์");
      const view = await owner.agent.get(paymentsUrl(projectId, contractId));
      const first = view.body.installments[0];
      const second = view.body.installments[1];
      // รับไปบางส่วนก่อน — ยอดใน QR ต้องเป็นส่วนที่เหลือ ไม่ใช่ยอดเต็มงวด
      await owner.agent
        .post(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/payments`)
        .send({ paidOn: todayIso(), amount: 1000 });
      await verifyAllPayments(owner.agent, `/api/projects/${projectId}/contracts/${contractId}`);
      const invoice = await owner.agent
        .post(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/invoice`)
        .send({ dueOn: isoDaysFromToday(7) });
      expect(invoice.status).toBe(200);

      const rowOf = async () => {
        const mine = await customer.agent.get("/api/my/contracts");
        return mine.body.contracts.find((c: { id: string }) => c.id === contractId).payment.installments;
      };

      // ยังไม่ตั้งพร้อมเพย์ = ไม่มี QR (ไม่เดาบัญชี)
      await prisma.setting.deleteMany({ where: { key: { in: KEYS } } });
      expect((await rowOf())[0].payQr).toBeNull();

      for (const [key, value] of Object.entries({
        paymentBankName: "ธนาคารกสิกรไทย",
        paymentAccountName: "บริษัท ทดสอบ จำกัด",
        paymentAccountNo: "123-4-56789-0",
        paymentPromptPay: "0812345678",
      })) {
        await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
      }
      const rows = await rowOf();
      const doc = await prisma.billingDocument.findFirstOrThrow({
        where: { installmentId: first.id, type: "INVOICE", voidedAt: null },
      });
      const invoiceNet =
        Number(doc.amount) -
        Number(doc.paidBefore ?? 0) -
        Number(doc.retentionAmount ?? 0) -
        Number(doc.withholdingAmount ?? 0);
      expect(rows[0].payQr.amount).toBeCloseTo(invoiceNet, 2);
      expect(rows[0].payQr.amount).toBeCloseTo(Number(first.amount) - 1000, 2);
      expect(rows[0].payQr.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
      // งวดที่ยังไม่เรียกเก็บไม่มี QR — ไม่ชวนจ่ายก่อนเวลา
      expect(rows[1].id).toBe(second.id);
      expect(rows[1].payQr).toBeNull();

      // ใบแจ้งหนี้ PDF ไม่ฝัง QR แล้ว (ผู้ใช้สั่งเอาออก 18 ต.ค.) — สแกนจ่ายที่พอร์ทัลด้านบนแทน
      const pdf = await customer.agent.get(`/api/my/contracts/${contractId}/documents/${doc.id}/pdf`);
      expect(pdf.status).toBe(200);
      expect(renderedDocs.at(-1)).not.toHaveProperty("promptPayQr");
    } finally {
      await prisma.setting.deleteMany({ where: { key: { in: KEYS } } });
      for (const row of saved) await prisma.setting.create({ data: { key: row.key, value: row.value } });
    }
  }, 30_000);

  /**
   * หน้าการชำระเงินของลูกค้า — รวมทุกสัญญา: ต้องชำระ (เรียกเก็บแล้วและยังค้าง) · งวดถัดไป · ประวัติ+ใบเสร็จ
   * ยอดที่ต้องโอนต้องเท่า "ยอดโอนสุทธิ" ของใบแจ้งหนี้ และหน้าจ่ายรายงวดของคนอื่นต้องเปิดไม่ได้
   */
  it("หน้าการชำระเงิน: ต้องชำระ/งวดถัดไป/ประวัติ และหน้าจ่ายรายงวดเปิดได้เฉพาะเจ้าของ", async () => {
    const { projectId, contractId } = await signedContractFor("[ชั่วคราว] หน้าชำระเงิน");
    const view = await owner.agent.get(paymentsUrl(projectId, contractId));
    const [first, second, third] = view.body.installments;
    const base = `/api/projects/${projectId}/contracts/${contractId}`;

    // งวด 1 รับครบแล้ว + ออกใบเสร็จ · งวด 2 วางบิลแล้ว · งวด 3+ ยังไม่เรียกเก็บ
    const paid = await owner.agent
      .post(`${base}/installments/${first.id}/payments`)
      .send({ paidOn: todayIso(), amount: Number(first.amount) });
    const paymentId = paid.body.installments[0].payments[0].id;
    await verifyAllPayments(owner.agent, base);
    expect((await owner.agent.post(`${base}/payments/${paymentId}/receipt`)).status).toBe(200);
    expect(
      (await owner.agent.post(`${base}/installments/${second.id}/invoice`).send({ dueOn: isoDaysFromToday(5) })).status,
    ).toBe(200);

    const list = await customer.agent.get("/api/my/payments");
    expect(list.status).toBe(200);
    const data = list.body.payments;
    const due = data.due.filter((d: { contractId: string }) => d.contractId === contractId);
    expect(due).toHaveLength(1);
    expect(due[0].installmentId).toBe(second.id);
    const invoice = await prisma.billingDocument.findFirstOrThrow({
      where: { installmentId: second.id, type: "INVOICE", voidedAt: null },
    });
    const invoiceNet =
      Number(invoice.amount) -
      Number(invoice.paidBefore ?? 0) -
      Number(invoice.retentionAmount ?? 0) -
      Number(invoice.withholdingAmount ?? 0);
    expect(due[0].amountToPay).toBeCloseTo(invoiceNet, 2);
    expect(due[0].invoice.docNo).toBe(invoice.docNo);
    expect(due[0].canNotify).toBe(true);

    const upcoming = data.upcoming.find((u: { contractId: string }) => u.contractId === contractId);
    expect(upcoming.seq).toBe(third.seq);
    expect(upcoming.remainingCount).toBe(view.body.installments.length - 2);

    // ตารางงวดทั้งสัญญา (ไทม์ไลน์ในหน้าการชำระเงิน) — ใช้สถานะชุดเดียวกับหน้าจ่ายรายงวด
    const schedule = data.schedules.find((s: { contractId: string }) => s.contractId === contractId);
    expect(schedule.installments).toHaveLength(view.body.installments.length);
    expect(schedule.installments.slice(0, 3).map((o: { state: string }) => o.state)).toEqual(["PAID", "DUE", "UPCOMING"]);

    const history = data.history.filter((h: { contractId: string }) => h.contractId === contractId);
    expect(history).toHaveLength(1);
    expect(history[0].receipt).not.toBeNull();
    // งวด 1 ไม่ได้วางบิลก่อนรับเงิน = ไม่มีใบแจ้งหนี้ในแถว (ไม่เดา)
    expect(history[0].invoice).toBeNull();
    // สัญญานี้ไม่มีเงินประกันผลงาน = ไม่ขึ้นในส่วนเงินประกัน
    expect(data.retentions.some((r: { contractId: string }) => r.contractId === contractId)).toBe(false);
    // เรื่องภายในต้องไม่หลุดไปฝั่งลูกค้า
    expect(JSON.stringify(data)).not.toContain("recordedBy");
    expect(JSON.stringify(data)).not.toContain("evidence\":[{\"id\":\"\"");

    // หน้าจ่ายรายงวด
    const detail = await customer.agent.get(`/api/my/payments/${second.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.payment.paid).toBe(false);
    expect(detail.body.payment.notBilledYet).toBe(false);
    expect(detail.body.payment.amountToPay).toBeCloseTo(invoiceNet, 2);
    // รายการเลือกงวด: ทุกงวดของสัญญาเดียวกัน เรียงตามลำดับ พร้อมสถานะ
    const options = detail.body.payment.installments;
    expect(options).toHaveLength(view.body.installments.length);
    expect(options.slice(0, 3).map((o: { state: string }) => o.state)).toEqual(["PAID", "DUE", "UPCOMING"]);
    expect(options[1].installmentId).toBe(second.id);
    const paidDetail = await customer.agent.get(`/api/my/payments/${first.id}`);
    expect(paidDetail.body.payment.paid).toBe(true);
    expect(paidDetail.body.payment.receipts).toHaveLength(1);
    const notYet = await customer.agent.get(`/api/my/payments/${third.id}`);
    expect(notYet.body.payment.notBilledYet).toBe(true);
    expect(notYet.body.payment.payQr).toBeNull();

    // ของคนอื่น = ไม่พบ (ไม่บอกว่ามีอยู่จริง) · พนักงานไม่ใช่ปลายทางนี้
    const stranger = await createCustomerDirect("test-pay-page-stranger");
    userIds.push(stranger.userId);
    expect((await stranger.agent.get(`/api/my/payments/${second.id}`)).status).toBe(404);
    const strangerList = await stranger.agent.get("/api/my/payments");
    expect(strangerList.body.payments.due).toHaveLength(0);
    expect([401, 403]).toContain((await owner.agent.get("/api/my/payments")).status);

    // แจ้งเตือนใบแจ้งหนี้พาไปหน้าจ่ายของงวดนั้นตรง ๆ
    const bell = await prisma.notification.findFirst({
      where: { userId: customer.userId, message: { contains: invoice.docNo } },
    });
    expect(bell?.link).toBe(`/my/payments/${second.id}`);
  });

  it("ทุกการรับเงินถูกบันทึกลงประวัติการใช้งานพร้อมยอดเดิมตอนแก้", async () => {
    const { projectId, contractId } = await signedContractFor("[ชั่วคราว] ประวัติ");
    const view = await owner.agent.get(paymentsUrl(projectId, contractId));
    const first = view.body.installments[0];
    const created = await owner.agent
      .post(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/payments`)
      .send({ paidOn: todayIso(), amount: 400 });
    const paymentId = created.body.installments[0].payments[0].id;
    await owner.agent
      .patch(`/api/projects/${projectId}/contracts/${contractId}/payments/${paymentId}`)
      .send({ paidOn: todayIso(), amount: 900 });

    const logs = await prisma.auditLog.findMany({
      where: { entityId: contractId, userId: owner.userId },
      orderBy: { createdAt: "asc" },
    });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("RECORD_INSTALLMENT_PAYMENT");
    expect(actions).toContain("UPDATE_INSTALLMENT_PAYMENT");

    const updated = logs.find((l) => l.action === "UPDATE_INSTALLMENT_PAYMENT")!;
    const details = updated.details as { from: { amount: number }; to: { amount: number } };
    expect(details.from.amount).toBe(400);
    expect(details.to.amount).toBe(900);
  });
});
