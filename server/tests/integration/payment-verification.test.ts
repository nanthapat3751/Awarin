import { todayIso } from "../../src/lib/business-date";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

/**
 * ยืนยันรายการรับเงินกับบัญชีธนาคาร (ข้อ 2 คนที่สองตรวจ + ข้อ 3 แจ้งลูกค้าหลังยืนยัน)
 *
 * เฝ้า: บันทึกแล้ว = รอยืนยัน · คนบันทึก (ADMIN) ยืนยันของตัวเองไม่ได้ · เจ้าของยืนยันได้ทุกรายการ
 * · ออกใบเสร็จได้หลังยืนยัน · ลูกค้าเห็นเงิน + ได้รับแจ้งหลังยืนยัน · แก้ยอดหลังยืนยัน = ต้องยืนยันใหม่
 */
describe("ยืนยันรายการรับเงินกับบัญชีธนาคาร", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let admin2: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let base: string;
  let installments: { id: string; seq: number; amount: string }[];
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const projectIds: string[] = [];

  const paymentOf = async (seq: number) =>
    (await owner.agent.get(`${base}/payments`)).body.installments.find((i: { seq: number }) => i.seq === seq).payments as {
      id: string;
      verifiedAt: string | null;
      verifiedByName: string | null;
    }[];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-verify-owner");
    admin = await createAndLoginAdmin("test-verify-admin");
    admin2 = await createAndLoginAdmin("test-verify-admin2");
    customer = await createCustomerDirect("test-verify-customer");
    userIds.push(owner.userId, admin.userId, admin2.userId, customer.userId);

    const cat = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบยืนยันรับเงิน" });
    const sub = await owner.agent.post("/api/categories").send({ level: "SUBGROUP", parentId: cat.body.category.id, name: "กลุ่มทดสอบยืนยันรับเงิน" });
    const item = await owner.agent.post("/api/categories").send({ level: "ITEM", parentId: sub.body.category.id, name: "รายการทดสอบยืนยันรับเงิน" });
    categoryIds.push(cat.body.category.id, sub.body.category.id, item.body.category.id);
    await owner.agent.get("/api/contract-templates");

    const res = await owner.agent.post("/api/projects").send({ name: "[ชั่วคราว] ยืนยันรับเงิน", customerId: customer.userId });
    const projectId = res.body.project.id as string;
    projectIds.push(projectId);
    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: item.body.category.id,
      name: "งานทดสอบ",
      quantity: 10,
      unit: "หน่วย",
      materialUnitPrice: 60_000,
      laborUnitPrice: 40_000,
    });
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);
    await owner.agent.post(`/api/projects/${projectId}/quotes/${quote.body.quote.id}/transition`).send({ toStatus: "ACCEPTED" });
    await owner.agent.post(`/api/projects/${projectId}/transition`).send({ toStatus: "APPROVED" });
    const contract = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
    const contractId = contract.body.contract.id as string;
    await owner.agent.post(`/api/projects/${projectId}/contracts/${contractId}/sign`);
    base = `/api/projects/${projectId}/contracts/${contractId}`;
    installments = (await owner.agent.get(`${base}/installments`)).body.installments;
  });

  afterAll(async () => {
    await prisma.billingDocument.deleteMany({ where: { contract: { projectId: { in: projectIds } } } });
    await prisma.contract.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: [...categoryIds].reverse() } } });
    await prisma.$disconnect();
  });

  it("บันทึกแล้วเป็นรอยืนยัน · ออกใบเสร็จไม่ได้ · ลูกค้ายังไม่เห็น · ขึ้นหน้างานที่รอดำเนินการ", async () => {
    const first = installments[0];
    const rec = await admin.agent.post(`${base}/installments/${first.id}/payments`).send({ paidOn: todayIso(), amount: 10_000 });
    expect(rec.status).toBe(200);
    const [pay] = await paymentOf(1);
    expect(pay.verifiedAt).toBeNull();

    const receipt = await admin.agent.post(`${base}/payments/${pay.id}/receipt`);
    expect(receipt.status).toBe(409);
    expect(receipt.body.error).toContain("ยืนยันกับบัญชี");

    const mine = await customer.agent.get("/api/my/payments");
    const history = JSON.stringify(mine.body);
    expect(history).not.toContain(pay.id);

    const work = await owner.agent.get("/api/dashboard/pending-work");
    expect(work.body.pendingWork.unverifiedPayments.some((r: { payment: { id: string } }) => r.payment.id === pay.id)).toBe(true);
  });

  it("คนบันทึก (ADMIN) ยืนยันของตัวเองไม่ได้ · ADMIN อีกคนยืนยันได้ · ยืนยันซ้ำไม่ได้ · ลูกค้าได้รับแจ้ง", async () => {
    const [pay] = await paymentOf(1);
    expect((await admin.agent.post(`${base}/payments/${pay.id}/verify`)).status).toBe(403);
    const ok = await admin2.agent.post(`${base}/payments/${pay.id}/verify`);
    expect(ok.status).toBe(200);
    const [after] = await paymentOf(1);
    expect(after.verifiedAt).not.toBeNull();
    expect(after.verifiedByName).toBe("Test Admin");
    expect((await owner.agent.post(`${base}/payments/${pay.id}/verify`)).status).toBe(409);

    const note = await prisma.notification.findFirst({
      where: { userId: customer.userId, link: `/my/payments/${installments[0].id}`, message: { contains: "บริษัทได้รับเงินงวดที่ 1" } },
    });
    expect(note?.message).toContain("10,000.00");

    const work = await owner.agent.get("/api/dashboard/pending-work");
    expect(work.body.pendingWork.unverifiedPayments.some((r: { payment: { id: string } }) => r.payment.id === pay.id)).toBe(false);
    expect((await admin.agent.post(`${base}/payments/${pay.id}/receipt`)).status).toBe(200);
    const log = await prisma.auditLog.findFirst({ where: { action: "VERIFY_INSTALLMENT_PAYMENT", userId: admin2.userId } });
    expect(log?.details).toMatchObject({ paymentId: pay.id, amount: 10_000, recordedById: admin.userId });
  });

  it("เจ้าของยืนยันรายการของตัวเองได้ (บริษัทคนเดียว) · แก้ยอดหลังยืนยัน = กลับเป็นรอยืนยัน · แก้หมายเหตุไม่ต้องยืนยันใหม่", async () => {
    const second = installments[1];
    await owner.agent.post(`${base}/installments/${second.id}/payments`).send({ paidOn: todayIso(), amount: 5_000 });
    const [pay] = await paymentOf(2);
    expect((await owner.agent.post(`${base}/payments/${pay.id}/verify`)).status).toBe(200);

    const noteOnly = await owner.agent
      .patch(`${base}/payments/${pay.id}`)
      .send({ paidOn: todayIso(), amount: 5_000, withholdingAmount: 0, method: "TRANSFER", note: "โอนจากบัญชีบริษัทลูก" });
    expect(noteOnly.status).toBe(200);
    expect((await paymentOf(2))[0].verifiedAt).not.toBeNull();

    const amountChanged = await owner.agent
      .patch(`${base}/payments/${pay.id}`)
      .send({ paidOn: todayIso(), amount: 5_500, withholdingAmount: 0, method: "TRANSFER" });
    expect(amountChanged.status).toBe(200);
    expect((await paymentOf(2))[0].verifiedAt).toBeNull();
  });
});
