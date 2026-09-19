import request from "supertest";

import { app } from "../../src/app";
import { todayIso } from "../../src/lib/business-date";
import { hashPassword } from "../../src/lib/password";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";

async function createAndLoginAdmin(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "test-admin-battery-staple";
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName: "Test Admin", role: "ADMIN" },
  });
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/staff/login").send({ email, password });
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
    await owner.agent
      .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
      .send({ toStatus: "SENT" });
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
