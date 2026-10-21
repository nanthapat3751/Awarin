import fs from "node:fs";

import { todayIso } from "../../src/lib/business-date";
import { prisma } from "../../src/lib/prisma";
import { mockSlipProvider } from "../../src/lib/slip/mock-provider";
import { setSlipProviderForTests } from "../../src/lib/slip/provider";
import { evidencePath } from "../../src/modules/contracts/payment-evidence.files";
import { createAndLoginAdmin, createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

// Puppeteer เป็น ESM รันใต้ ts-jest ไม่ได้ — mock เฉพาะขั้นเรนเดอร์ใบเสร็จ
jest.mock("../../src/lib/pdf/billing-doc-pdf", () => ({
  ...jest.requireActual("../../src/lib/pdf/billing-doc-pdf"),
  renderBillingDocPdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));

/**
 * ตรวจสลิปอัตโนมัติตอนลูกค้าแจ้งโอน (SlipOK — ใช้ตัวอ่านจำลองที่อ่านผลจากชื่อไฟล์)
 *
 * กติกาที่ผู้ใช้เลือก (18 ต.ค.):
 * - ปลอม/ซ้ำ/ผิดบัญชี = ปฏิเสธทันที แต่เก็บไว้พร้อมสลิปให้พนักงานเห็น
 * - ยอด/วันที่ไม่ตรง = ไม่ปฏิเสธ ขึ้นป้ายให้พนักงานตัดสิน · ตรวจไม่ได้ = ทางเดิม
 * - ผ่าน = พนักงานกด "ยืนยัน & ออกใบเสร็จ" คลิกเดียว (คนยังเป็นผู้กดเสมอ)
 */
describe("ตรวจสลิปอัตโนมัติตอนแจ้งโอน", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let itemCategoryId: string;
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const projectIds: string[] = [];
  const ACCOUNT_KEYS = ["paymentBankName", "paymentAccountName", "paymentAccountNo", "paymentPromptPay"];
  let savedSettings: { key: string; value: string }[] = [];
  const ACCOUNT_NO = "1234567890";

  beforeAll(async () => {
    setSlipProviderForTests(mockSlipProvider);
    owner = await createAndLoginOwner("test-slip-owner");
    admin = await createAndLoginAdmin("test-slip-admin");
    customer = await createCustomerDirect("test-slip-customer");
    userIds.push(owner.userId, admin.userId, customer.userId);

    // บัญชีรับเงินของบริษัท (ค่าตั้งระดับระบบ — คืนค่าเดิมตอนจบ)
    savedSettings = await prisma.setting.findMany({ where: { key: { in: ACCOUNT_KEYS } }, select: { key: true, value: true } });
    const values: Record<string, string> = {
      paymentBankName: "ธนาคารทดสอบ",
      paymentAccountName: "บริษัท ทดสอบ จำกัด",
      paymentAccountNo: ACCOUNT_NO,
      paymentPromptPay: "",
    };
    for (const key of ACCOUNT_KEYS) {
      await prisma.setting.upsert({ where: { key }, create: { key, value: values[key] }, update: { value: values[key] } });
    }

    const cat = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบสลิป" });
    categoryIds.push(cat.body.category.id);
    const sub = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: cat.body.category.id, name: "กลุ่มทดสอบสลิป" });
    categoryIds.push(sub.body.category.id);
    const item = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: sub.body.category.id, name: "รายการทดสอบสลิป" });
    itemCategoryId = item.body.category.id;
    categoryIds.push(itemCategoryId);
    await owner.agent.get("/api/contract-templates");
  });

  afterAll(async () => {
    setSlipProviderForTests(undefined);
    const files = await prisma.paymentEvidence.findMany({
      where: { notice: { installment: { contract: { projectId: { in: projectIds } } } } },
      select: { storedName: true },
    });
    for (const f of files) fs.rmSync(evidencePath(f.storedName), { force: true });
    await prisma.contract.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.setting.deleteMany({ where: { key: { in: ACCOUNT_KEYS } } });
    for (const s of savedSettings) await prisma.setting.create({ data: s });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: categoryIds.reverse() } } });
    await prisma.$disconnect();
  });

  /** สัญญาลงนามแล้ว + วางบิลสองงวดแรก */
  async function billedContract(name: string) {
    const res = await owner.agent.post("/api/projects").send({ name, siteAddress: "ที่ตั้งทดสอบ", customerId: customer.userId });
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
    await sendQuote(owner.agent, projectId, quote.body.quote.id);
    await owner.agent.post(`/api/projects/${projectId}/quotes/${quote.body.quote.id}/transition`).send({ toStatus: "ACCEPTED" });
    await owner.agent.post(`/api/projects/${projectId}/transition`).send({ toStatus: "APPROVED" });
    const contract = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
    const contractId = contract.body.contract.id as string;
    const base = `/api/projects/${projectId}/contracts/${contractId}`;
    await owner.agent.post(`${base}/sign`);
    const view = await owner.agent.get(`${base}/payments`);
    const [first, second] = view.body.installments as { id: string }[];
    for (const i of [first, second]) {
      await owner.agent.post(`${base}/installments/${i.id}/invoice`).send({ dueOn: todayIso() });
    }
    // ยอดที่ต้องโอนจริง (หัก ณ ที่จ่าย/เงินประกันแล้ว) จากหน้าการชำระเงินของลูกค้า — ตัวที่สลิปต้องเท่า
    const pay = await customer.agent.get("/api/my/payments");
    const net = (id: string) =>
      Number(pay.body.payments.due.find((d: { installmentId: string }) => d.installmentId === id).amountToPay);
    return { projectId, contractId, base, first: { id: first.id, net: net(first.id) }, second: { id: second.id, net: net(second.id) } };
  }

  const png = Buffer.from("89504e470d0a1a0a", "hex");
  function notify(contractId: string, fields: { installmentId: string; amount: number; paidOn?: string }, fileName: string) {
    return customer.agent
      .post(`/api/my/contracts/${contractId}/payment-notices`)
      .field("installmentId", fields.installmentId)
      .field("paidOn", fields.paidOn ?? todayIso())
      .field("amount", fields.amount.toFixed(2))
      .attach("files", png, { filename: fileName, contentType: "image/png" });
  }
  const ymd = () => todayIso().replaceAll("-", "");
  const slip = (amount: number, ref: string, account = ACCOUNT_NO) => `mockslip_${amount.toFixed(2)}_${ref}_${ymd()}_${account}.png`;
  const staffInstallment = async (base: string, id: string) =>
    (await admin.agent.get(`${base}/payments`)).body.installments.find((i: { id: string }) => i.id === id);

  it("สลิปผ่าน: ป้ายเขียว → ยืนยัน & ออกใบเสร็จคลิกเดียว (บันทึก + ยืนยันกับบัญชี + ใบเสร็จ)", async () => {
    const c = await billedContract("[ชั่วคราว] สลิปผ่าน");
    const ref = `OK${Date.now()}`;
    const res = await notify(c.contractId, { installmentId: c.first.id, amount: c.first.net }, slip(c.first.net, ref));
    expect(res.status).toBe(200);

    const row = await staffInstallment(c.base, c.first.id);
    expect(row.pendingNotices).toHaveLength(1);
    const notice = row.pendingNotices[0];
    expect(notice.slipCheck.status).toBe("PASSED");
    expect(notice.slipCheck.flags).toEqual([]);
    expect(notice.slipCheck.files[0].transRef).toBe(ref);
    expect(notice.slipCheck.files[0].receiverAccount).toBe("xxxxx6789x");

    const mine = await customer.agent.get(`/api/my/payments/${c.first.id}`);
    expect(mine.body.payment.notice.slipVerified).toBe(true);

    // แอดมินคนเดียวกดได้ — ผลตรวจสลิปคือการตรวจคนที่สอง (ปกติคนบันทึกยืนยันรายการตัวเองไม่ได้)
    const confirmed = await admin.agent.post(`${c.base}/payment-notices/${notice.id}/confirm-slip`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.receiptError).toBeNull();
    const after = confirmed.body.installments.find((i: { id: string }) => i.id === c.first.id);
    expect(after.pendingNotices).toHaveLength(0);
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0].verifiedAt).not.toBeNull();
    expect(after.payments[0].reference).toBe(ref);
    // เงินที่เข้าบัญชีจริงของรายการ = ยอดในสลิป
    const p = after.payments[0];
    expect(Number(p.amount) - Number(p.withholdingAmount) - Number(p.retentionAmount)).toBeCloseTo(c.first.net, 2);
    const receipt = await prisma.billingDocument.findFirst({ where: { paymentId: p.id, type: "RECEIPT", voidedAt: null } });
    expect(receipt).not.toBeNull();
    // กดซ้ำ = การแจ้งถูกตรวจไปแล้ว
    expect((await admin.agent.post(`${c.base}/payment-notices/${notice.id}/confirm-slip`)).status).toBe(409);
  });

  it("สลิปซ้ำ / โอนเข้าบัญชีอื่น: ปฏิเสธทันที แต่เก็บการแจ้งพร้อมสลิปให้พนักงานเห็น", async () => {
    const c = await billedContract("[ชั่วคราว] สลิปซ้ำ");
    const ref = `DUP${Date.now()}`;
    expect((await notify(c.contractId, { installmentId: c.first.id, amount: c.first.net }, slip(c.first.net, ref))).status).toBe(200);

    // สลิปเดิมแจ้งงวดที่สอง
    const dup = await notify(c.contractId, { installmentId: c.second.id, amount: c.first.net }, slip(c.first.net, ref));
    expect(dup.status).toBe(422);
    expect(dup.body.error).toContain("เคยใช้แจ้งโอนไปแล้ว");

    // โอนเข้าบัญชีอื่น
    const wrong = await notify(
      c.contractId,
      { installmentId: c.second.id, amount: c.second.net },
      slip(c.second.net, `WR${Date.now()}`, "9999999999"),
    );
    expect(wrong.status).toBe(422);
    expect(wrong.body.error).toContain("ไม่ใช่บัญชีของบริษัท");

    const row = await staffInstallment(c.base, c.second.id);
    expect(row.pendingNotices).toHaveLength(0);
    expect(row.slipRejectedNotices.map((n: { slipCheck: { status: string } }) => n.slipCheck.status).sort()).toEqual([
      "DUPLICATE",
      "WRONG_ACCOUNT",
    ]);
    // สลิปที่ถูกปฏิเสธยังอยู่บนดิสก์ (ไม่ถูกลบตอนตอบ error)
    const ev = row.slipRejectedNotices[0].evidence[0];
    const stored = await prisma.paymentEvidence.findUniqueOrThrow({ where: { id: ev.id } });
    expect(fs.existsSync(evidencePath(stored.storedName))).toBe(true);
    // ลูกค้าเห็นเหตุผล และแจ้งใหม่ได้
    const mine = await customer.agent.get(`/api/my/payments/${c.second.id}`);
    expect(mine.body.payment.notice.status).toBe("REJECTED");
    expect(mine.body.payment.canNotify).toBe(true);
    // พนักงานได้รับแจ้ง
    const bell = await prisma.notification.findFirst({
      where: { userId: admin.userId, message: { contains: "ระบบตรวจสลิปปฏิเสธ" }, link: { contains: c.contractId } },
    });
    expect(bell).not.toBeNull();
  });

  it("ยอดไม่ตรง: ไม่ปฏิเสธ ขึ้นจุดที่ไม่ตรงให้พนักงาน และกดยืนยันคลิกเดียวไม่ได้ · ปฏิเสธแล้วสลิปเดิมแจ้งใหม่ได้", async () => {
    const c = await billedContract("[ชั่วคราว] ยอดไม่ตรง");
    const ref = `MM${Date.now()}`;
    const less = Math.round((c.first.net - 500) * 100) / 100;
    const res = await notify(c.contractId, { installmentId: c.first.id, amount: less }, slip(less, ref));
    expect(res.status).toBe(200);
    const row = await staffInstallment(c.base, c.first.id);
    const notice = row.pendingNotices[0];
    expect(notice.slipCheck.status).toBe("MISMATCH");
    expect(notice.slipCheck.flags.some((f: string) => f.includes("ไม่ตรงกับยอดที่ต้องโอน"))).toBe(true);
    expect((await admin.agent.post(`${c.base}/payment-notices/${notice.id}/confirm-slip`)).status).toBe(409);

    // พนักงานปฏิเสธ (เช่น ลูกค้าเลือกงวดผิด) → ปล่อยเลขอ้างอิง สลิปเดิมแจ้งงวดอื่นได้ ไม่โดนว่าซ้ำ
    await admin.agent.post(`${c.base}/payment-notices/${notice.id}/reject`).send({ reason: "เลือกงวดผิด" });
    const again = await notify(c.contractId, { installmentId: c.second.id, amount: less }, slip(less, ref));
    expect(again.status).toBe(200);
  });

  it("วันที่ไม่ตรงกับที่ลูกค้าแจ้ง = ป้ายเหลือง ไม่ปฏิเสธ", async () => {
    const c = await billedContract("[ชั่วคราว] วันที่ไม่ตรง");
    const yesterday = new Date(`${todayIso()}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const res = await notify(
      c.contractId,
      { installmentId: c.first.id, amount: c.first.net, paidOn: yesterday.toISOString().slice(0, 10) },
      slip(c.first.net, `DT${Date.now()}`),
    );
    expect(res.status).toBe(200);
    const notice = (await staffInstallment(c.base, c.first.id)).pendingNotices[0];
    expect(notice.slipCheck.status).toBe("MISMATCH");
    expect(notice.slipCheck.flags.some((f: string) => f.startsWith("วันที่โอนในสลิป"))).toBe(true);
  });

  it("ออกใบเสร็จไม่ได้ (จด VAT แต่ลูกค้าไม่มีที่อยู่) = ไม่บันทึกอะไรเลย บอกให้แก้ก่อน", async () => {
    const c = await billedContract("[ชั่วคราว] สลิปผ่านแต่ออกใบไม่ได้");
    const res = await notify(c.contractId, { installmentId: c.first.id, amount: c.first.net }, slip(c.first.net, `VAT${Date.now()}`));
    expect(res.status).toBe(200);
    const notice = (await staffInstallment(c.base, c.first.id)).pendingNotices[0];
    expect(notice.slipCheck.status).toBe("PASSED");

    const keys = ["companyVatRegistered", "companyBranch", "companyTaxId"];
    const before = await prisma.setting.findMany({ where: { key: { in: keys } } });
    const set = (key: string, value: string) => prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    await set("companyVatRegistered", "true");
    await set("companyBranch", "สำนักงานใหญ่");
    await set("companyTaxId", "0105551234567");
    try {
      const blocked = await admin.agent.post(`${c.base}/payment-notices/${notice.id}/confirm-slip`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error).toContain("ยังไม่ได้บันทึกอะไร");
      expect(blocked.body.error).toContain("ที่อยู่");
      const row = await staffInstallment(c.base, c.first.id);
      expect(row.payments).toHaveLength(0);
      expect(row.pendingNotices).toHaveLength(1);
    } finally {
      for (const key of keys) {
        const old = before.find((b) => b.key === key);
        if (old) await set(key, old.value);
        else await prisma.setting.deleteMany({ where: { key } });
      }
    }
  });

  it("ตรวจสลิปอีกครั้ง: สลิปที่ธนาคารยังไม่ให้ตรวจ (เทา) → ตรวจซ้ำแล้วผ่าน", async () => {
    const c = await billedContract("[ชั่วคราว] ตรวจอีกครั้ง");
    const ref = `RC${Date.now()}`;
    // รอบแรกธนาคารให้รอ (รหัส 1010) · รอบสองอ่านได้
    let ready = false;
    setSlipProviderForTests({
      name: "test",
      read: async () =>
        ready
          ? {
              kind: "ok",
              slip: {
                transRef: ref,
                amount: c.first.net,
                transDate: todayIso(),
                transferredAt: new Date(),
                senderName: "นาย ทดสอบ",
                senderBank: "014",
                receiverName: "บริษัท ทดสอบ",
                receiverAccount: "xxx-x-x6789-x",
                receiverProxy: null,
              },
            }
          : { kind: "unreadable", message: "สลิปธนาคารไทยพาณิชย์ต้องรอราว 8 นาทีหลังโอนถึงจะตรวจได้" },
    });
    try {
      expect((await notify(c.contractId, { installmentId: c.first.id, amount: c.first.net }, "slip.png")).status).toBe(200);
      const notice = (await staffInstallment(c.base, c.first.id)).pendingNotices[0];
      expect(notice.slipCheck.status).toBe("UNCHECKED");

      ready = true;
      const res = await admin.agent.post(`${c.base}/payment-notices/${notice.id}/recheck-slip`);
      expect(res.status).toBe(200);
      const after = res.body.installments.find((i: { id: string }) => i.id === c.first.id).pendingNotices[0];
      expect(after.slipCheck.status).toBe("PASSED");
      expect(after.slipCheck.files).toHaveLength(1);
      // ผ่านแล้วตรวจซ้ำไม่ได้ (ไม่ต้องเสียโควตา)
      expect((await admin.agent.post(`${c.base}/payment-notices/${notice.id}/recheck-slip`)).status).toBe(409);
    } finally {
      setSlipProviderForTests(mockSlipProvider);
    }
  });

  it("ยอดในสลิปไม่ตรงกับที่ลูกค้ากรอก: บอกลูกค้าทันที · ลูกค้ายกเลิกการแจ้งเองแล้วส่งใหม่ได้", async () => {
    const c = await billedContract("[ชั่วคราว] ลูกค้ายกเลิกเอง");
    const ref = `CX${Date.now()}`;
    // แนบสลิป 5 บาท แต่กรอกยอดเต็มงวด
    expect((await notify(c.contractId, { installmentId: c.first.id, amount: c.first.net }, slip(5, ref))).status).toBe(200);
    let mine = await customer.agent.get(`/api/my/payments/${c.first.id}`);
    expect(mine.body.payment.notice.slipAmountMismatch).toEqual({ slipAmount: "5.00" });
    expect(mine.body.payment.notice.canCancel).toBe(true);
    expect(mine.body.payment.canNotify).toBe(false);
    const noticeId = mine.body.payment.notice.id as string;

    // คนอื่นยกเลิกไม่ได้ (ไม่บอกว่ามีอยู่จริง)
    const stranger = await createCustomerDirect("test-slip-stranger");
    userIds.push(stranger.userId);
    expect((await stranger.agent.post(`/api/my/contracts/${c.contractId}/payment-notices/${noticeId}/cancel`)).status).toBe(404);

    const cancelled = await customer.agent.post(`/api/my/contracts/${c.contractId}/payment-notices/${noticeId}/cancel`);
    expect(cancelled.status).toBe(200);
    mine = await customer.agent.get(`/api/my/payments/${c.first.id}`);
    expect(mine.body.payment.notice).toBeNull();
    expect(mine.body.payment.canNotify).toBe(true);
    // พนักงานไม่เห็นการแจ้งนั้นในรายการรอตรวจแล้ว + ได้รับแจ้ง
    expect((await staffInstallment(c.base, c.first.id)).pendingNotices).toHaveLength(0);
    const bell = await prisma.notification.findFirst({
      where: { userId: admin.userId, message: { contains: "ลูกค้ายกเลิกการแจ้งโอน" }, link: { contains: c.contractId } },
    });
    expect(bell).not.toBeNull();
    // ยกเลิกซ้ำไม่ได้
    expect((await customer.agent.post(`/api/my/contracts/${c.contractId}/payment-notices/${noticeId}/cancel`)).status).toBe(409);

    // สลิปเดิมไม่ถูกจองไว้ — แนบใหม่ด้วยยอดที่ถูกต้องได้ ไม่โดนว่าซ้ำ · ยอดตรงแล้วไม่มีข้อความเตือน
    expect((await notify(c.contractId, { installmentId: c.first.id, amount: 5 }, slip(5, ref))).status).toBe(200);
    mine = await customer.agent.get(`/api/my/payments/${c.first.id}`);
    expect(mine.body.payment.notice.slipAmountMismatch).toBeNull();
  });

  it("บริษัทยืนยันรับเงินแล้ว ลูกค้ายกเลิกไม่ได้", async () => {
    const c = await billedContract("[ชั่วคราว] ยกเลิกหลังยืนยัน");
    await notify(c.contractId, { installmentId: c.first.id, amount: c.first.net }, slip(c.first.net, `CY${Date.now()}`));
    const notice = (await staffInstallment(c.base, c.first.id)).pendingNotices[0];
    expect((await admin.agent.post(`${c.base}/payment-notices/${notice.id}/confirm-slip`)).status).toBe(200);
    const res = await customer.agent.post(`/api/my/contracts/${c.contractId}/payment-notices/${notice.id}/cancel`);
    expect(res.status).toBe(409);
  });

  it("แจ้งโอนที่ใช้ไม่ได้ถูกปฏิเสธพร้อมเหตุผล: ไม่แนบสลิป · วันที่ผิด/อนาคต · งวดไม่ใช่ของสัญญา · งวดยังไม่ถึงกำหนด · แจ้งซ้ำ", async () => {
    const c = await billedContract("[ชั่วคราว] แจ้งโอนผิดรูป");
    const url = `/api/my/contracts/${c.contractId}/payment-notices`;
    const noFile = await customer.agent
      .post(url)
      .field("installmentId", c.first.id)
      .field("paidOn", todayIso())
      .field("amount", "1000.00");
    expect(noFile.status).toBe(400);

    const badDate = await notify(c.contractId, { installmentId: c.first.id, amount: 1000, paidOn: "2026-02-31" }, "สลิป.png");
    expect(badDate.status).toBe(400);
    const future = await notify(c.contractId, { installmentId: c.first.id, amount: 1000, paidOn: "2999-01-01" }, "สลิป.png");
    expect(future.status).toBe(400);
    expect(future.body.error).toBe("วันที่โอนเป็นวันในอนาคตไม่ได้");

    const other = await billedContract("[ชั่วคราว] สัญญาอื่น");
    const wrongInstallment = await notify(c.contractId, { installmentId: other.first.id, amount: 1000 }, "สลิป.png");
    expect(wrongInstallment.status).toBe(404);
    expect(wrongInstallment.body.error).toBe("ไม่พบงวดที่ระบุ");

    // งวดที่ 3 ยังไม่ได้วางบิล/ไม่ถึงกำหนด
    const third = (await owner.agent.get(`${c.base}/payments`)).body.installments[2] as { id: string };
    const notDue = await notify(c.contractId, { installmentId: third.id, amount: 1000 }, "สลิป.png");
    expect(notDue.status).toBe(409);
    expect(notDue.body.error).toBe("งวดนี้ยังไม่ถึงกำหนดชำระ หรือชำระครบแล้ว");

    expect((await notify(c.contractId, { installmentId: c.first.id, amount: c.first.net }, "สลิป.png")).status).toBe(200);
    const again = await notify(c.contractId, { installmentId: c.first.id, amount: c.first.net }, "สลิป.png");
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("งวดนี้แจ้งโอนไว้แล้ว รอบริษัทตรวจสอบ");
  });

  it("ลูกค้าแจ้งโอนในสัญญาที่ยังไม่ลงนามหรือของคนอื่นไม่ได้", async () => {
    const stranger = await createCustomerDirect("test-slip-stranger");
    userIds.push(stranger.userId);
    const c = await billedContract("[ชั่วคราว] ของคนอื่น");
    const res = await stranger.agent
      .post(`/api/my/contracts/${c.contractId}/payment-notices`)
      .field("installmentId", c.first.id)
      .field("paidOn", todayIso())
      .field("amount", "1000.00")
      .attach("files", png, { filename: "สลิป.png", contentType: "image/png" });
    expect(res.status).toBe(404);

    const unsigned = await owner.agent.post(`/api/projects/${c.projectId}/contracts`).send({});
    const draftInstallment = (await prisma.contractInstallment.findFirstOrThrow({ where: { contractId: unsigned.body.contract.id } })).id;
    const early = await notify(unsigned.body.contract.id, { installmentId: draftInstallment, amount: 1000 }, "สลิป.png");
    expect(early.status).toBe(409);
    expect(early.body.error).toBe("สัญญายังไม่ได้ลงนาม");
  });

  it("พนักงานกดซ้ำ/ผิดลำดับไม่ได้: ยืนยันคลิกเดียวเฉพาะสลิปที่ผ่าน · ตรวจซ้ำเฉพาะที่ยังตรวจไม่ได้ · การแจ้งที่ปิดแล้วทำอะไรต่อไม่ได้", async () => {
    const c = await billedContract("[ชั่วคราว] กดผิดลำดับ");
    await notify(c.contractId, { installmentId: c.first.id, amount: c.first.net }, "สลิป.png");
    const unchecked = (await staffInstallment(c.base, c.first.id)).pendingNotices[0];
    const oneClick = await admin.agent.post(`${c.base}/payment-notices/${unchecked.id}/confirm-slip`);
    expect(oneClick.status).toBe(409);
    expect(oneClick.body.error).toContain("เฉพาะสลิปที่ระบบตรวจผ่าน");

    setSlipProviderForTests(null);
    try {
      const off = await admin.agent.post(`${c.base}/payment-notices/${unchecked.id}/recheck-slip`);
      expect(off.status).toBe(409);
      expect(off.body.error).toBe("ยังไม่ได้เปิดระบบตรวจสลิปอัตโนมัติ");
    } finally {
      setSlipProviderForTests(mockSlipProvider);
    }

    await notify(c.contractId, { installmentId: c.second.id, amount: c.second.net }, slip(c.second.net, `OR${Date.now()}`));
    const passed = (await staffInstallment(c.base, c.second.id)).pendingNotices[0];
    expect(passed.slipCheck.status).toBe("PASSED");
    const recheckPassed = await admin.agent.post(`${c.base}/payment-notices/${passed.id}/recheck-slip`);
    expect(recheckPassed.status).toBe(409);
    expect(recheckPassed.body.error).toBe("ตรวจสลิปซ้ำได้เฉพาะการแจ้งที่ยังตรวจไม่ได้");

    const rejected = await admin.agent.post(`${c.base}/payment-notices/${unchecked.id}/reject`).send({ reason: "สลิปไม่ชัด" });
    expect(rejected.status).toBe(200);
    for (const action of ["reject", "confirm-slip", "recheck-slip"]) {
      const res = await admin.agent.post(`${c.base}/payment-notices/${unchecked.id}/${action}`).send({ reason: "ซ้ำ" });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("การแจ้งโอนนี้ถูกตรวจไปแล้ว");
    }
    expect((await admin.agent.post(`${c.base}/payment-notices/no-such-notice/confirm-slip`)).status).toBe(404);
  });

  it("ตรวจไม่ได้ (ไม่มี QR) = ทางเดิม · ปิดระบบตรวจ = ไม่มีผลตรวจเลย", async () => {
    const c = await billedContract("[ชั่วคราว] ตรวจไม่ได้");
    expect((await notify(c.contractId, { installmentId: c.first.id, amount: c.first.net }, "สลิป.png")).status).toBe(200);
    const unchecked = (await staffInstallment(c.base, c.first.id)).pendingNotices[0];
    expect(unchecked.slipCheck.status).toBe("UNCHECKED");
    expect(unchecked.slipCheck.flags[0]).toContain("ไม่พบ QR");

    setSlipProviderForTests(null);
    try {
      expect((await notify(c.contractId, { installmentId: c.second.id, amount: c.second.net }, "สลิป.png")).status).toBe(200);
      const off = (await staffInstallment(c.base, c.second.id)).pendingNotices[0];
      expect(off.slipCheck).toBeNull();
    } finally {
      setSlipProviderForTests(mockSlipProvider);
    }
  });
});
