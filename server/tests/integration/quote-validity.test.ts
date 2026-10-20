import { todayIso } from "../../src/lib/business-date";
import { renderCustomerQuotePdf } from "../../src/lib/pdf/customer-quote-pdf";
import { prisma } from "../../src/lib/prisma";
import { addDaysIso } from "../../src/lib/quote-terms";
import {
  createAndLoginAdmin,
  createAndLoginOwner,
  createCustomerDirect,
} from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

// เหตุผลเดียวกับ myQuotes.test.ts: entry แบบ ESM ของ Puppeteer โหลดใต้ ts-jest ไม่ได้
// — จับอาร์กิวเมนต์ที่ส่งเข้าตัวสร้าง PDF แทน (หน้าตากล่องเงื่อนไขทดสอบใน tests/lib/quote-terms)
jest.mock("../../src/lib/pdf/quote-pdf", () => ({
  renderQuotePdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));
jest.mock("../../src/lib/pdf/customer-quote-pdf", () => ({
  renderCustomerQuotePdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));

/**
 * ยืนราคา + เงื่อนไขท้ายใบเสนอราคา: ตั้งในหน้าตั้งค่า → ตรึงลงใบตอนกดส่ง → พ้นกำหนดแล้วลูกค้า
 * กดยอมรับเองไม่ได้ → พนักงานขยายวันได้
 */
describe("quote validity + terms", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let itemCategoryId: string;
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCategoryIds: string[] = [];

  const TOUCHED_KEYS = ["quoteValidityDays", "quoteTerms"];
  const originalRows = new Map<string, { value: string; updatedById: string | null } | null>();

  const TERMS = "1. ชำระมัดจำ 30% เมื่อเซ็นสัญญา\n2. ราคานี้ไม่รวมค่าขออนุญาตก่อสร้าง";

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-validity-owner");
    admin = await createAndLoginAdmin("test-validity-admin");
    customer = await createCustomerDirect("test-validity-customer");
    createdUserIds.push(owner.userId, admin.userId, customer.userId);
    for (const key of TOUCHED_KEYS) {
      const row = await prisma.setting.findUnique({ where: { key } });
      originalRows.set(key, row ? { value: row.value, updatedById: row.updatedById } : null);
    }

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบยืนราคา" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบยืนราคา",
    });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการทดสอบยืนราคา",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);
  });

  afterAll(async () => {
    for (const key of TOUCHED_KEYS) {
      const row = originalRows.get(key);
      if (row == null) {
        await prisma.setting.deleteMany({ where: { key } });
      } else {
        await prisma.setting.upsert({
          where: { key },
          update: { value: row.value, updatedById: row.updatedById },
          create: { key, value: row.value, updatedById: row.updatedById },
        });
      }
    }
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function setDefaults(body: { quoteValidityDays?: number | null; quoteTerms?: string }) {
    const res = await owner.agent.patch("/api/settings").send(body);
    expect(res.status).toBe(200);
  }

  /** โครงการของลูกค้าทดสอบ + BOQ หนึ่งบรรทัด + ใบเสนอราคา (ส่งหรือยังเป็นร่างตามที่ขอ) */
  async function quoteForCustomer(send = true) {
    const res = await owner.agent
      .post("/api/projects")
      .send({ name: `ยืนราคา ${Date.now()}`, customerId: customer.userId });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);
    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "รายการทดสอบ",
      quantity: 10,
      unit: "หน่วย",
      materialUnitPrice: 60,
      laborUnitPrice: 40,
    });
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = quote.body.quote.id as string;
    if (send) {
      const sent = await sendQuote(owner.agent, projectId, quoteId);
      expect(sent.status).toBe(200);
    }
    return { projectId, quoteId };
  }

  /** ทำให้ใบพ้นกำหนดโดยตรง — เลื่อนนาฬิกาในเทสต์ integration ไม่ได้ */
  async function expire(quoteId: string) {
    await prisma.quote.update({
      where: { id: quoteId },
      data: { validUntil: new Date(`${addDaysIso(todayIso(), -1)}T00:00:00.000Z`) },
    });
  }

  describe("หน้าตั้งค่า", () => {
    it("รับจำนวนวัน 1–365 เป็นจำนวนเต็ม และล้างเป็น null ได้", async () => {
      for (const bad of [0, 366, 1.5, -1]) {
        const res = await owner.agent.patch("/api/settings").send({ quoteValidityDays: bad });
        expect(res.status).toBe(400);
      }
      await setDefaults({ quoteValidityDays: 45 });
      expect((await owner.agent.get("/api/settings")).body.settings.quoteValidityDays).toBe("45");
      await setDefaults({ quoteValidityDays: null });
      expect((await owner.agent.get("/api/settings")).body.settings.quoteValidityDays).toBe("");
    });

    it("ADMIN ตั้งยืนราคา/เงื่อนไขได้ (ไม่ใช่อัตรากำไร)", async () => {
      const res = await admin.agent
        .patch("/api/settings")
        .send({ quoteValidityDays: 30, quoteTerms: TERMS });
      expect(res.status).toBe(200);
    });

    it("เงื่อนไขยาวเกิน 2,000 ตัวอักษรถูกปฏิเสธ", async () => {
      const res = await owner.agent.patch("/api/settings").send({ quoteTerms: "ก".repeat(2001) });
      expect(res.status).toBe(400);
    });

    it("ไม่หลุดไปชุดสาธารณะ", async () => {
      const res = await owner.agent.get("/api/public/settings");
      expect(res.body.settings).not.toHaveProperty("quoteValidityDays");
      expect(res.body.settings).not.toHaveProperty("quoteTerms");
    });
  });

  describe("ตรึงลงใบตอนกดส่ง", () => {
    it("ส่งวันนี้ ยืน 30 วัน = วันนี้+30 และเงื่อนไขติดไปกับใบ", async () => {
      await setDefaults({ quoteValidityDays: 30, quoteTerms: TERMS });
      const { projectId, quoteId } = await quoteForCustomer();

      const list = await owner.agent.get(`/api/projects/${projectId}/quotes`);
      const quote = list.body.quotes.find((q: { id: string }) => q.id === quoteId);
      expect(quote.validUntil).toBe(addDaysIso(todayIso(), 30));
      expect(quote.terms).toBe(TERMS);
    });

    it("ร่างยังไม่ตรึง — นับวันจากวันที่ส่ง ไม่ใช่วันสร้างร่าง", async () => {
      await setDefaults({ quoteValidityDays: 30, quoteTerms: TERMS });
      const { projectId, quoteId } = await quoteForCustomer(false);
      const row = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
      expect(row.validUntil).toBeNull();
      expect(row.terms).toBeNull();
      await sendQuote(owner.agent, projectId, quoteId);
      const sent = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
      expect(sent.validUntil?.toISOString().slice(0, 10)).toBe(addDaysIso(todayIso(), 30));
    });

    it("แก้หน้าตั้งค่าทีหลัง ใบที่ส่งไปแล้วไม่เปลี่ยน", async () => {
      await setDefaults({ quoteValidityDays: 30, quoteTerms: TERMS });
      const { quoteId } = await quoteForCustomer();
      await setDefaults({ quoteValidityDays: 7, quoteTerms: "เงื่อนไขใหม่" });
      const row = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
      expect(row.validUntil?.toISOString().slice(0, 10)).toBe(addDaysIso(todayIso(), 30));
      expect(row.terms).toBe(TERMS);
    });

    it("บริษัทยังไม่ตั้ง = ใบไม่มีวันหมดอายุ ไม่มีเงื่อนไข", async () => {
      await setDefaults({ quoteValidityDays: null, quoteTerms: "" });
      const { quoteId } = await quoteForCustomer();
      const row = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
      expect(row.validUntil).toBeNull();
      expect(row.terms).toBeNull();
      const detail = await customer.agent.get(`/api/my/quotes/${quoteId}`);
      expect(detail.body.quote.validUntil).toBeNull();
      expect(detail.body.quote.expired).toBe(false);
      expect(detail.body.quote.terms).toEqual([]);
    });
  });

  describe("ฝั่งลูกค้า", () => {
    it("เห็นวันยืนราคาและเงื่อนไขทีละข้อ (ตัดเลขข้อที่พิมพ์มาเองออก) ทั้งในหน้าเว็บและ PDF", async () => {
      await setDefaults({ quoteValidityDays: 30, quoteTerms: TERMS });
      const { quoteId } = await quoteForCustomer();

      const detail = await customer.agent.get(`/api/my/quotes/${quoteId}`);
      expect(detail.status).toBe(200);
      expect(detail.body.quote.validUntil).toBe(addDaysIso(todayIso(), 30));
      expect(detail.body.quote.expired).toBe(false);
      expect(detail.body.quote.terms).toEqual([
        "ชำระมัดจำ 30% เมื่อเซ็นสัญญา",
        "ราคานี้ไม่รวมค่าขออนุญาตก่อสร้าง",
      ]);

      const render = renderCustomerQuotePdf as jest.Mock;
      render.mockClear();
      const pdf = await customer.agent.get(`/api/my/quotes/${quoteId}/pdf`);
      expect(pdf.status).toBe(200);
      const args = render.mock.calls[0][0];
      expect(args.validUntil.toISOString().slice(0, 10)).toBe(addDaysIso(todayIso(), 30));
      expect(args.terms).toEqual(detail.body.quote.terms);
    });

    it("พ้นกำหนดแล้วกดยอมรับเองไม่ได้ (409) แต่ขอปรับแก้ได้", async () => {
      await setDefaults({ quoteValidityDays: 30 });
      const first = await quoteForCustomer();
      await expire(first.quoteId);

      const detail = await customer.agent.get(`/api/my/quotes/${first.quoteId}`);
      expect(detail.body.quote.expired).toBe(true);

      const accept = await customer.agent
        .post(`/api/my/quotes/${first.quoteId}/respond`)
        .send({ action: "ACCEPT" });
      expect(accept.status).toBe(409);
      expect(accept.body.error).toContain("พ้นกำหนดยืนราคา");
      const row = await prisma.quote.findUniqueOrThrow({ where: { id: first.quoteId } });
      expect(row.status).toBe("SENT");

      const revise = await customer.agent
        .post(`/api/my/quotes/${first.quoteId}/respond`)
        .send({ action: "REQUEST_REVISION", note: "ขอยืนยันราคาอีกครั้ง" });
      expect(revise.status).toBe(200);
    });

    it("วันสุดท้ายของการยืนราคายังกดยอมรับได้", async () => {
      const { quoteId } = await quoteForCustomer();
      await prisma.quote.update({
        where: { id: quoteId },
        data: { validUntil: new Date(`${todayIso()}T00:00:00.000Z`) },
      });
      const accept = await customer.agent
        .post(`/api/my/quotes/${quoteId}/respond`)
        .send({ action: "ACCEPT" });
      expect(accept.status).toBe(200);
    });

    it("พนักงานบันทึกการยอมรับแทนลูกค้าได้แม้พ้นกำหนด (บริษัทตัดสินใจยืนราคาเอง)", async () => {
      const { projectId, quoteId } = await quoteForCustomer();
      await expire(quoteId);
      const res = await owner.agent
        .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
        .send({ toStatus: "ACCEPTED" });
      expect(res.status).toBe(200);
    });
  });

  describe("พนักงานขยายกำหนดยืนราคา", () => {
    it("ขยายแล้วลูกค้ากดยอมรับได้ และได้รับแจ้งเตือน", async () => {
      const { projectId, quoteId } = await quoteForCustomer();
      await expire(quoteId);
      const until = addDaysIso(todayIso(), 7);

      const res = await admin.agent
        .patch(`/api/projects/${projectId}/quotes/${quoteId}/validity`)
        .send({ validUntil: until });
      expect(res.status).toBe(200);
      expect(res.body.quote.validUntil).toBe(until);

      const notice = await prisma.notification.findFirst({
        where: { userId: customer.userId, link: `/my/quotes/${quoteId}` },
        orderBy: { createdAt: "desc" },
      });
      expect(notice?.message).toContain("ยืนราคาถึงวันที่");

      const accept = await customer.agent
        .post(`/api/my/quotes/${quoteId}/respond`)
        .send({ action: "ACCEPT" });
      expect(accept.status).toBe(200);
    });

    it("ยกเลิกวันหมดอายุได้ (null)", async () => {
      const { projectId, quoteId } = await quoteForCustomer();
      const res = await owner.agent
        .patch(`/api/projects/${projectId}/quotes/${quoteId}/validity`)
        .send({ validUntil: null });
      expect(res.status).toBe(200);
      expect(res.body.quote.validUntil).toBeNull();
    });

    it("ปฏิเสธวันที่ผ่านมาแล้ว วันที่ไกลเกินปี และรูปแบบผิด", async () => {
      const { projectId, quoteId } = await quoteForCustomer();
      const url = `/api/projects/${projectId}/quotes/${quoteId}/validity`;
      for (const validUntil of [addDaysIso(todayIso(), -1), addDaysIso(todayIso(), 366)]) {
        expect((await owner.agent.patch(url).send({ validUntil })).status).toBe(400);
      }
      expect((await owner.agent.patch(url).send({ validUntil: "18/10/2026" })).status).toBe(400);
      expect((await owner.agent.patch(url).send({ validUntil: "2026-02-31" })).status).toBe(400);
    });

    it("แก้ได้เฉพาะใบที่ส่งแล้วและลูกค้ายังไม่ตอบ", async () => {
      const draft = await quoteForCustomer(false);
      const res = await owner.agent
        .patch(`/api/projects/${draft.projectId}/quotes/${draft.quoteId}/validity`)
        .send({ validUntil: addDaysIso(todayIso(), 7) });
      expect(res.status).toBe(409);
    });

    it("ลูกค้าเรียกปลายทางของพนักงานไม่ได้", async () => {
      const { projectId, quoteId } = await quoteForCustomer();
      const res = await customer.agent
        .patch(`/api/projects/${projectId}/quotes/${quoteId}/validity`)
        .send({ validUntil: addDaysIso(todayIso(), 7) });
      // คุกกี้ลูกค้าไม่ใช่เซสชันพนักงาน — ตกตั้งแต่ด่านล็อกอิน (401) หรือด่านสิทธิ์ (403) ก็ถือว่ากันได้
      expect([401, 403]).toContain(res.status);
    });
  });
});
