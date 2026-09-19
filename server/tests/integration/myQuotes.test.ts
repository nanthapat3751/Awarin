import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { renderCustomerQuotePdf } from "../../src/lib/pdf/customer-quote-pdf";
import {
  CUSTOMER_COOKIE_NAME,
  STAFF_COOKIE_NAME,
} from "../../src/lib/session-cookie";
import {
  createAndLoginCustomer,
  createAndLoginOwner,
  createCustomerDirect,
  sessionCookieFrom,
} from "../helpers/test-auth";

// mock ด้วยเหตุผลเดียวกับ quotes.test.ts / contracts.test.ts: entry แบบ ESM ของ Puppeteer
// โหลดใต้ runtime CJS ของ ts-jest ไม่ได้ และเทสต์เหล่านี้ก็ไม่ได้ใช้มันอยู่แล้ว
jest.mock("../../src/lib/pdf/quote-pdf", () => ({
  renderQuotePdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));
jest.mock("../../src/lib/pdf/customer-quote-pdf", () => ({
  renderCustomerQuotePdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));

describe("my/quotes module (customer-facing)", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  let materialId: string;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-myquotes-owner");
    createdUserIds.push(owner.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบใบเสนอราคาลูกค้า" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบใบเสนอราคาลูกค้า",
    });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการทดสอบใบเสนอราคาลูกค้า",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);

    const material = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "วัสดุทดสอบใบเสนอราคาลูกค้า",
      unit: "หน่วย",
      materialUnitPrice: 1000,
      laborUnitPrice: 200,
    });
    materialId = material.body.material.id;
    createdMaterialIds.push(materialId);
  });

  afterAll(async () => {
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  /** Creates a project for the given customer, adds a BOQ line, and sends a quote. */
  async function createSentQuoteForCustomer(customerId: string, name: string) {
    const projectRes = await owner.agent.post("/api/projects").send({ name, customerId });
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);

    await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId, quantity: 2 });

    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = quoteRes.body.quote.id as string;
    await owner.agent
      .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
      .send({ toStatus: "SENT" });

    return { projectId, quoteId };
  }

  it("lets a customer see their own sent quote, sanitized (no cost fields)", async () => {
    const customer = await createAndLoginCustomer("test-myquotes-owner-customer");
    const me = await customer.agent.get("/api/auth/me");
    const customerId = me.body.user.id as string;

    const { quoteId } = await createSentQuoteForCustomer(customerId, "โครงการลูกค้าดูใบเสนอราคา");

    const listRes = await customer.agent.get("/api/my/quotes");
    expect(listRes.status).toBe(200);
    expect(listRes.body.quotes.map((q: { id: string }) => q.id)).toContain(quoteId);

    const detailRes = await customer.agent.get(`/api/my/quotes/${quoteId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.quote.netPrice).toBeDefined();
    expect(detailRes.body.quote.groups).toHaveLength(1);
    const group = detailRes.body.quote.groups[0];
    expect(group.code).toMatch(/^[A-Z]+$/);
    expect(group.name).toEqual(expect.any(String));
    expect(Number(group.subtotal)).toBeGreaterThan(0);

    expect(group.items).toHaveLength(1);
    const item = group.items[0];
    // ราคาต่อบรรทัดเป็น "ราคาขาย" ที่พับค่าดำเนินการ/กำไรเข้าไปเรียบร้อยแล้ว — ตัวเลขชุดเดียวกับ
    // ที่พิมพ์ใน PDF ที่ลูกค้าโหลดได้อยู่แล้ว หน้าเว็บจึงไม่ได้เปิดเผยอะไรเพิ่ม BR-09 ห้ามเปิดเผย
    // "ต้นทุนและ margin" ไม่ใช่ห้ามบอกราคาขาย — ราคาต้นทุนกับอัตรากำไรยังต้องไม่หลุดทั้งคู่
    expect(item).not.toHaveProperty("materialUnitPrice");
    expect(item).not.toHaveProperty("laborUnitPrice");
    expect(Number(item.unitPrice)).toBeGreaterThan(1200); // ต้นทุน 1000+200 บวก markup แล้ว
    expect(Number(item.lineTotal)).toBeCloseTo(Number(item.unitPrice) * Number(item.quantity), 2);
    expect(detailRes.body.quote).not.toHaveProperty("directCost");
    expect(detailRes.body.quote).not.toHaveProperty("overheadProfitPct");
    expect(detailRes.body.quote).not.toHaveProperty("overheadProfitAmt");

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  it("hides another customer's quote (404, not 403 — avoids confirming it exists)", async () => {
    const ownerCustomer = await createAndLoginCustomer("test-myquotes-real-owner");
    const meOwner = await ownerCustomer.agent.get("/api/auth/me");
    const { quoteId } = await createSentQuoteForCustomer(meOwner.body.user.id, "โครงการของลูกค้าจริง");

    const otherCustomer = await createAndLoginCustomer("test-myquotes-other");
    const res = await otherCustomer.agent.get(`/api/my/quotes/${quoteId}`);
    expect(res.status).toBe(404);

    await prisma.user.deleteMany({ where: { email: { in: [ownerCustomer.email, otherCustomer.email] } } });
  });

  it("lets a customer accept a sent quote, and rejects responding twice", async () => {
    const customer = await createAndLoginCustomer("test-myquotes-accept");
    const me = await customer.agent.get("/api/auth/me");
    const { projectId, quoteId } = await createSentQuoteForCustomer(
      me.body.user.id,
      "โครงการลูกค้ายอมรับ",
    );

    const acceptRes = await customer.agent
      .post(`/api/my/quotes/${quoteId}/respond`)
      .send({ action: "ACCEPT" });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.quote.status).toBe("ACCEPTED");

    // การยอมรับยังดันโปรเจกต์จาก QUOTED ไป APPROVED อัตโนมัติด้วย พนักงานจึงไม่ต้องกดปุ่ม
    // "อนุมัติ" แยกอีกทีหลังจากลูกค้าตอบตกลงแล้ว
    const projectRes = await owner.agent.get(`/api/projects/${projectId}`);
    expect(projectRes.body.project.status).toBe("APPROVED");

    const secondRes = await customer.agent
      .post(`/api/my/quotes/${quoteId}/respond`)
      .send({ action: "ACCEPT" });
    expect(secondRes.status).toBe(409);

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  // ─── ผลของคำตอบลูกค้าต่อสถานะโครงการ ───
  // ทั้งสามเทสต์ใช้ลูกค้าคนเดียวกันโดยตั้งใจ: endpoint สมัครสมาชิกจำกัด 10 ครั้ง/ชม./IP
  // (registerLimiter) ถ้าสมัครใหม่ทุกเทสต์ เทสต์ท้าย ๆ ของไฟล์จะล็อกอินไม่ผ่านแบบหาสาเหตุยาก
  describe("ผลของคำตอบลูกค้าต่อสถานะโครงการ", () => {
    let customer: Awaited<ReturnType<typeof createAndLoginCustomer>>;
    let customerId: string;

    beforeAll(async () => {
      customer = await createAndLoginCustomer("test-myquotes-outcome");
      const me = await customer.agent.get("/api/auth/me");
      customerId = me.body.user.id;
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: customer.email } });
    });

  it("moves the project to REJECTED when a customer rejects, and stores the reason", async () => {
    const { projectId, quoteId } = await createSentQuoteForCustomer(
      customerId,
      "โครงการลูกค้าปฏิเสธ",
    );

    const rejectRes = await customer.agent
      .post(`/api/my/quotes/${quoteId}/respond`)
      .send({ action: "REJECT", note: "ราคาสูงเกินงบที่ตั้งไว้: งบอยู่ที่ 2 ล้าน" });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.quote.status).toBe("REJECTED");

    // เดิมโปรเจกต์ค้างที่ QUOTED ตลอดไป การ์ด "ขั้นตอนถัดไป" จึงบอกว่ายังรอลูกค้าตอบทั้งที่
    // ตอบไปแล้ว งานหลุดจากหน้างานค้าง และมูลค่าดีลที่เสียยังถูกนับเป็นไปป์ไลน์
    const projectRes = await owner.agent.get(`/api/projects/${projectId}`);
    expect(projectRes.body.project.status).toBe("REJECTED");

    // เหตุผลต้องเก็บไว้ให้พนักงานเห็น — ข้อมูลที่มีค่าที่สุดตอนเสียดีล
    const quoteList = await owner.agent.get(`/api/projects/${projectId}/quotes`);
    const rejected = quoteList.body.quotes.find((q: { id: string }) => q.id === quoteId);
    expect(rejected.customerNote).toContain("ราคาสูงเกินงบ");
  });

  it("puts the project back to QUOTED when staff send a fresh quote after a rejection", async () => {
    const { projectId, quoteId } = await createSentQuoteForCustomer(
      customerId,
      "โครงการเสนอราคาใหม่หลังถูกปฏิเสธ",
    );
    await customer.agent.post(`/api/my/quotes/${quoteId}/respond`).send({ action: "REJECT" });
    expect((await owner.agent.get(`/api/projects/${projectId}`)).body.project.status).toBe("REJECTED");

    // "ลูกค้าปฏิเสธ" ไม่ใช่ปลายทาง: ออกฉบับใหม่แล้วส่ง ดีลกลับมาเดินต่อเอง
    const newQuote = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    expect(newQuote.status).toBe(201);
    const sent = await owner.agent
      .post(`/api/projects/${projectId}/quotes/${newQuote.body.quote.id}/transition`)
      .send({ toStatus: "SENT" });
    expect(sent.status).toBe(200);

    const after = await owner.agent.get(`/api/projects/${projectId}`);
    expect(after.body.project.status).toBe("QUOTED");
  });

  it("advances the project too when STAFF record the customer response themselves", async () => {
    const { projectId, quoteId } = await createSentQuoteForCustomer(
      customerId,
      "โครงการพนักงานบันทึกคำตอบเอง",
    );

    // ลูกค้าโทรมาบอก พนักงานมากรอกให้ที่หน้าโครงการ -- เดิมทางนี้ไม่ขยับสถานะโปรเจกต์เลย
    // ทั้งที่การ์ด "ขั้นตอนถัดไป" เขียนไว้ว่าบันทึกการตอบกลับเองได้
    const recorded = await owner.agent
      .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
      .send({ toStatus: "ACCEPTED" });
    expect(recorded.status).toBe(200);

    const after = await owner.agent.get(`/api/projects/${projectId}`);
    expect(after.body.project.status).toBe("APPROVED");
  });
  });

  it("rejects requesting a revision without a note, and stores the note when provided", async () => {
    const customer = await createAndLoginCustomer("test-myquotes-revision");
    const me = await customer.agent.get("/api/auth/me");
    const { projectId, quoteId } = await createSentQuoteForCustomer(
      me.body.user.id,
      "โครงการลูกค้าขอปรับแก้",
    );

    const missingNoteRes = await customer.agent
      .post(`/api/my/quotes/${quoteId}/respond`)
      .send({ action: "REQUEST_REVISION" });
    expect(missingNoteRes.status).toBe(400);

    const blankNoteRes = await customer.agent
      .post(`/api/my/quotes/${quoteId}/respond`)
      .send({ action: "REQUEST_REVISION", note: "   " });
    expect(blankNoteRes.status).toBe(400);

    const revisionRes = await customer.agent
      .post(`/api/my/quotes/${quoteId}/respond`)
      .send({ action: "REQUEST_REVISION", note: "อยากเปลี่ยนวัสดุพื้นเป็นกระเบื้องแกรนิตโต้" });
    expect(revisionRes.status).toBe(200);
    expect(revisionRes.body.quote.status).toBe("REVISED");
    expect(revisionRes.body.quote.customerNote).toBe("อยากเปลี่ยนวัสดุพื้นเป็นกระเบื้องแกรนิตโต้");

    // ฝั่งพนักงานเห็นหมายเหตุเดียวกันบนใบเสนอราคา
    const staffRes = await owner.agent.get(`/api/projects/${projectId}/quotes/${quoteId}`);
    expect(staffRes.body.quote.customerNote).toBe("อยากเปลี่ยนวัสดุพื้นเป็นกระเบื้องแกรนิตโต้");

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  it("rejects an OWNER calling the customer-only /api/my/quotes endpoint", async () => {
    const res = await owner.agent.get("/api/my/quotes");
    expect(res.status).toBe(403);
  });

  it("builds a customer PDF with marked-up sale prices only — no cost or margin fields", async () => {
    const customer = await createAndLoginCustomer("test-myquotes-pdf");
    const me = await customer.agent.get("/api/auth/me");
    const customerId = me.body.user.id as string;

    const { projectId, quoteId } = await createSentQuoteForCustomer(
      customerId,
      "โครงการลูกค้าดาวน์โหลด PDF",
    );

    const projectRes = await owner.agent.get(`/api/projects/${projectId}`);
    const overheadProfitPct = Number(projectRes.body.currentVersion.overheadProfitPct);
    const markup = 1 + overheadProfitPct / 100;
    // วัสดุ 1000 + ค่าแรง 200 = ต้นทุน 1200/หน่วย, จำนวน 2 (ตรงกับ createSentQuoteForCustomer)
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const expectedUnitPrice = round2(1200 * markup);
    const expectedLineTotal = round2(2 * expectedUnitPrice);

    const pdfRes = await customer.agent
      .get(`/api/my/quotes/${quoteId}/pdf`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers["content-type"]).toBe("application/pdf");
    expect((pdfRes.body as Buffer).toString()).toBe("%PDF-1.7 mock");

    const mockRender = renderCustomerQuotePdf as jest.Mock;
    const dataPassed = mockRender.mock.calls[mockRender.mock.calls.length - 1][0];
    expect(dataPassed.quoteNo).toMatch(/^QT-\d{4}-\d{4,}$/);
    expect(dataPassed.groups).toHaveLength(1);

    const item = dataPassed.groups[0].items[0];
    expect(Number(item.unitPrice)).toBeCloseTo(expectedUnitPrice, 2);
    expect(Number(item.lineTotal)).toBeCloseTo(expectedLineTotal, 2);

    // หน้าเว็บกับ PDF ต้องเป็นตัวเลขชุดเดียวกัน ไม่งั้นลูกค้าเห็นราคาไม่ตรงกันสองที่
    const webRes = await customer.agent.get(`/api/my/quotes/${quoteId}`);
    const webItem = webRes.body.quote.groups[0].items[0];
    expect(Number(webItem.unitPrice)).toBeCloseTo(expectedUnitPrice, 2);
    expect(Number(webItem.lineTotal)).toBeCloseTo(expectedLineTotal, 2);
    expect(item).not.toHaveProperty("materialUnitPrice");
    expect(item).not.toHaveProperty("laborUnitPrice");
    expect(item).not.toHaveProperty("materialTotal");
    expect(item).not.toHaveProperty("laborTotal");
    expect(dataPassed).not.toHaveProperty("directCost");
    expect(dataPassed).not.toHaveProperty("overheadProfitPct");
    expect(dataPassed).not.toHaveProperty("overheadProfitAmt");

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  it("serves the customer PDF on a direct link even when a staff session is also in the browser", async () => {
    // การเปิด URL ของ PDF ในแท็บใหม่จะไม่ส่ง header Origin เมื่อล็อกอินทั้งสองแอปบน host เดียวกัน
    // เดิม cookie ของพนักงานจะชนะ ทำให้ลูกค้าได้ 403
    const customer = await createAndLoginCustomer("test-myquotes-both-cookies");
    const me = await customer.agent.get("/api/auth/me");
    const { quoteId } = await createSentQuoteForCustomer(me.body.user.id, "โครงการคุกกี้ซ้อน");

    const customerLogin = await request(app)
      .post("/api/auth/customer/login")
      .send({ email: customer.email, password: customer.password });
    const customerCookie = sessionCookieFrom(customerLogin, CUSTOMER_COOKIE_NAME);
    const staffLogin = await request(app)
      .post("/api/auth/staff/login")
      .send({ email: owner.email, password: owner.password });
    const staffCookie = sessionCookieFrom(staffLogin, STAFF_COOKIE_NAME);

    const res = await request(app)
      .get(`/api/my/quotes/${quoteId}/pdf`)
      .set("Cookie", [customerCookie, staffCookie]);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");

    // ผู้เรียกที่มีแค่สิทธิ์พนักงานยังถูกปฏิเสธ และยังเป็นปัญหาเรื่องสิทธิ์ (role) ไม่ใช่ดูเหมือน
    // ว่าไม่เคยล็อกอิน
    const staffOnly = await request(app)
      .get(`/api/my/quotes/${quoteId}/pdf`)
      .set("Cookie", [staffCookie]);
    expect(staffOnly.status).toBe(403);

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  it("rejects downloading another customer's quote PDF (404, not 403)", async () => {
    const ownerCustomer = await createAndLoginCustomer("test-myquotes-pdf-real-owner");
    const meOwner = await ownerCustomer.agent.get("/api/auth/me");
    const { quoteId } = await createSentQuoteForCustomer(
      meOwner.body.user.id,
      "โครงการ PDF ของลูกค้าจริง",
    );

    const otherCustomer = await createAndLoginCustomer("test-myquotes-pdf-other");
    const res = await otherCustomer.agent.get(`/api/my/quotes/${quoteId}/pdf`);
    expect(res.status).toBe(404);

    await prisma.user.deleteMany({
      where: { email: { in: [ownerCustomer.email, otherCustomer.email] } },
    });
  });

  // ---------- "ลูกค้าเปิดดูใบเสนอราคาหรือยัง" ----------

  // ใช้ลูกค้าชุดเดียวทั้งบล็อก แล้วสร้างโครงการ/ใบเสนอราคาใหม่ต่อเทสต์แทน — การล็อกอินถูกจำกัด
  // 20 ครั้ง/15 นาที/IP ถ้าสร้างลูกค้าใหม่ทุกเทสต์จะชนเพดานแล้วล้มด้วย 429 ที่อ่านไม่ออกว่าทำไม
  describe("ลูกค้าเปิดดูใบเสนอราคาหรือยัง", () => {
    let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
    let intruder: Awaited<ReturnType<typeof createCustomerDirect>>;

    beforeAll(async () => {
      customer = await createCustomerDirect("test-myquotes-view");
      intruder = await createCustomerDirect("test-myquotes-view-intruder");
      createdUserIds.push(customer.userId, intruder.userId);
    });

    /**
     * ย้อนเวลาให้เหมือนผ่านไป N นาที = เริ่ม "รอบการเข้าชม" ใหม่
     *
     * ขยับได้เฉพาะ `lastViewedAt` เท่านั้น — แถวใน AuditLog แก้ไม่ได้เลยเพราะ role ของแอป
     * ไม่มีสิทธิ์ UPDATE บนตารางนั้น (append-only โดยตั้งใจ) ซึ่งเป็นเหตุผลที่ตัวยุบแถวซ้ำ
     * ต้องผูกกับรอบการเข้าชม ไม่ใช่เวลาของแถวบันทึก
     */
    async function rewind(quoteId: string, minutes: number) {
      await prisma.quote.update({
        where: { id: quoteId },
        data: { lastViewedAt: new Date(Date.now() - minutes * 60_000) },
      });
    }

    /** อ่านคอลัมน์ติดตามการเปิดดูตรงจากฐานข้อมูล — ฝั่งลูกค้าไม่ได้ส่งค่าพวกนี้ออกไปโดยตั้งใจ */
    async function viewCounters(quoteId: string) {
      return prisma.quote.findUniqueOrThrow({
        where: { id: quoteId },
        select: { firstViewedAt: true, lastViewedAt: true, viewCount: true },
      });
    }

    it("บันทึกเมื่อลูกค้าเปิดดูจริง และใบที่ยังไม่มีใครเปิดยังคงเป็นศูนย์", async () => {
      const { projectId, quoteId } = await createSentQuoteForCustomer(
        customer.userId,
        "โครงการติดตามการเปิดดู",
      );

      // ส่งแล้วแต่ยังไม่มีใครเปิด
      expect(await viewCounters(quoteId)).toMatchObject({
        firstViewedAt: null,
        lastViewedAt: null,
        viewCount: 0,
      });

      const before = new Date();
      await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);

      const after = await viewCounters(quoteId);
      expect(after.firstViewedAt).not.toBeNull();
      expect(after.firstViewedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(after.lastViewedAt).not.toBeNull();
      expect(after.viewCount).toBe(1);

      // พนักงานต้องเห็นค่านี้ในตารางใบเสนอราคาของโครงการ
      const staffList = await owner.agent.get(`/api/projects/${projectId}/quotes`).expect(200);
      const row = staffList.body.quotes.find((q: { id: string }) => q.id === quoteId);
      expect(row.firstViewedAt).toEqual(expect.any(String));
      expect(row.viewCount).toBe(1);
    });

    it("พนักงานเปิดดูไม่นับ — คำถามคือ 'ลูกค้าเปิดหรือยัง' ไม่ใช่ 'ใบนี้ถูกเปิดกี่ครั้ง'", async () => {
      const { projectId, quoteId } = await createSentQuoteForCustomer(
        customer.userId,
        "โครงการที่พนักงานเปิดเอง",
      );

      await owner.agent.get(`/api/projects/${projectId}/quotes/${quoteId}`).expect(200);
      await owner.agent.get(`/api/projects/${projectId}/quotes/${quoteId}/pdf`).expect(200);

      expect(await viewCounters(quoteId)).toMatchObject({
        firstViewedAt: null,
        lastViewedAt: null,
        viewCount: 0,
      });
    });

    it("เปิดซ้ำติด ๆ กันนับเป็นครั้งเดียว แต่เว้นช่วงเกิน 30 นาทีแล้วนับใหม่", async () => {
      const { quoteId } = await createSentQuoteForCustomer(customer.userId, "โครงการเปิดซ้ำ");

      await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);
      await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);
      await customer.agent.get(`/api/my/quotes/${quoteId}/pdf`).expect(200);

      const sameSession = await viewCounters(quoteId);
      expect(sameSession.viewCount).toBe(1);
      const firstViewedAt = sameSession.firstViewedAt!;

      // ย้อนเวลา "เปิดล่าสุด" ไป 31 นาที = การเปิดครั้งถัดไปคือคนละครั้ง
      await rewind(quoteId, 31);
      await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);

      const nextSession = await viewCounters(quoteId);
      expect(nextSession.viewCount).toBe(2);
      // ครั้งแรกต้องไม่ถูกเขียนทับ ไม่งั้น "เปิดครั้งแรกเมื่อไร" จะเลื่อนตามการเปิดล่าสุดไปเรื่อย ๆ
      expect(nextSession.firstViewedAt!.getTime()).toBe(firstViewedAt.getTime());
      expect(nextSession.lastViewedAt!.getTime()).toBeGreaterThan(firstViewedAt.getTime());
    });

    it("เปิดจาก PDF โดยตรงก็นับ (ลูกค้าที่กดลิงก์ตรงโดยไม่ผ่านหน้ารายละเอียด)", async () => {
      const { quoteId } = await createSentQuoteForCustomer(
        customer.userId,
        "โครงการเปิดจาก PDF",
      );

      await customer.agent.get(`/api/my/quotes/${quoteId}/pdf`).expect(200);

      const counters = await viewCounters(quoteId);
      expect(counters.firstViewedAt).not.toBeNull();
      expect(counters.viewCount).toBe(1);
    });

    it("เก็บละเอียดแยกชนิด แต่ไทม์ไลน์โครงการยังเห็นแค่ครั้งแรก", async () => {
      const { projectId, quoteId } = await createSentQuoteForCustomer(
        customer.userId,
        "โครงการเก็บละเอียด",
      );
      const { quoteNo } = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });

      await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);
      await rewind(quoteId, 31);
      await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);
      await customer.agent.get(`/api/my/quotes/${quoteId}/pdf`).expect(200);

      expect((await viewCounters(quoteId)).viewCount).toBe(2);

      const rows = await prisma.auditLog.findMany({
        where: { entityId: quoteId, action: { startsWith: "CUSTOMER_" } },
        orderBy: { createdAt: "asc" },
      });
      // เปิดหน้า(ครั้งแรก) + เปิดหน้า(รอบใหม่) + เปิด PDF = 3 แถว คนละชนิด/คนละรอบขึ้นแยกกัน
      expect(rows.map((r) => r.action)).toEqual([
        "CUSTOMER_OPEN_QUOTE",
        "CUSTOMER_OPEN_QUOTE",
        "CUSTOMER_OPEN_QUOTE_PDF",
      ]);

      // มีแถวเดียวเท่านั้นที่ติดธง "ครั้งแรก" — ไทม์ไลน์โครงการอาศัยธงนี้กรอง
      const flagged = rows.filter((r) => (r.details as Record<string, unknown>).firstView === true);
      expect(flagged).toHaveLength(1);
      expect(flagged[0].id).toBe(rows[0].id);

      const activity = await owner.agent.get(`/api/projects/${projectId}/activity`).expect(200);
      const viewEvents = activity.body.activity.filter((a: { title: string }) =>
        a.title.includes("เปิดดูใบเสนอราคา"),
      );
      expect(viewEvents).toHaveLength(1);

      // แต่แฟ้มลูกค้าต้องเห็นครบทั้ง 3 บรรทัด
      const file = await owner.agent
        .get(`/api/customers/${customer.userId}/activity?kinds=view`)
        .expect(200);
      const forThisQuote = (file.body.activity as { title: string }[]).filter((a) =>
        a.title.includes(quoteNo),
      );
      expect(forThisQuote).toHaveLength(3);
      expect(forThisQuote.some((a) => a.title.includes("เปิดไฟล์ PDF"))).toBe(true);

      const notifications = await prisma.notification.count({
        where: { userId: owner.userId, message: { contains: quoteNo } },
      });
      expect(notifications).toBe(1);
      await prisma.notification.deleteMany({ where: { message: { contains: quoteNo } } });
    });

    it("เปิดซ้ำติด ๆ กันในชนิดเดียวกันยุบเหลือแถวเดียว (กันรีเฟรช/สองแท็บ)", async () => {
      const { quoteId } = await createSentQuoteForCustomer(customer.userId, "โครงการยุบแถวซ้ำ");

      await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);
      await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);
      await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);

      const opens = await prisma.auditLog.count({
        where: { entityId: quoteId, action: "CUSTOMER_OPEN_QUOTE" },
      });
      expect(opens).toBe(1);

      // คนละชนิดในช่วงเวลาเดียวกันต้องขึ้นแยก — นั่นคือเรื่องราวที่ต้องเล่า
      await customer.agent.get(`/api/my/quotes/${quoteId}/pdf`).expect(200);
      const pdfs = await prisma.auditLog.count({
        where: { entityId: quoteId, action: "CUSTOMER_OPEN_QUOTE_PDF" },
      });
      expect(pdfs).toBe(1);
    });

    it("ดาวน์โหลดไฟล์แนบบันทึกชื่อไฟล์ และคนละไฟล์ขึ้นคนละบรรทัด", async () => {
      const { projectId, quoteId } = await createSentQuoteForCustomer(
        customer.userId,
        "โครงการไฟล์แนบหลายไฟล์",
      );
      const attBase = `/api/projects/${projectId}/quotes/${quoteId}/attachments`;
      const upload = async (filename: string) => {
        const res = await owner.agent
          .post(attBase)
          .field("kind", "QUOTE")
          .field("visibility", "CUSTOMER")
          .attach("file", Buffer.from(`%PDF ${filename}`), {
            filename,
            contentType: "application/pdf",
          });
        return res.body.attachment.id as string;
      };
      const boqId = await upload("boq-ก่อสร้าง.pdf");
      const planId = await upload("แบบแปลน.pdf");

      await customer.agent.get(`/api/my/quotes/${quoteId}/attachments/${boqId}/download`).expect(200);
      await customer.agent.get(`/api/my/quotes/${quoteId}/attachments/${planId}/download`).expect(200);
      // โหลดไฟล์เดิมซ้ำในช่วงสั้น ๆ ต้องไม่เพิ่มบรรทัด
      await customer.agent.get(`/api/my/quotes/${quoteId}/attachments/${boqId}/preview`).expect(200);

      const rows = await prisma.auditLog.findMany({
        where: { entityId: quoteId, action: "CUSTOMER_DOWNLOAD_ATTACHMENT" },
        orderBy: { createdAt: "asc" },
      });
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => (r.details as Record<string, unknown>).fileName)).toEqual([
        "boq-ก่อสร้าง.pdf",
        "แบบแปลน.pdf",
      ]);

      // แฟ้มลูกค้าต้องโชว์ชื่อไฟล์ให้เห็น ไม่ใช่แค่บอกว่า "โหลดไฟล์แนบ"
      const file = await owner.agent
        .get(`/api/customers/${customer.userId}/activity?kinds=file`)
        .expect(200);
      const details = (file.body.activity as { detail: string | null }[]).map((a) => a.detail);
      expect(details).toContain("แบบแปลน.pdf");

      await prisma.quoteAttachment.deleteMany({ where: { quoteId } });
      await prisma.notification.deleteMany({
        where: { message: { contains: "โครงการไฟล์แนบหลายไฟล์" } },
      });
    });

    it("แจ้งเตือนเฉพาะจังหวะที่มีความหมาย: กลับมาเปิดหลังเงียบ / ครบ 3 ครั้ง", async () => {
      const { quoteId } = await createSentQuoteForCustomer(customer.userId, "โครงการแจ้งเตือนฉลาด");
      const { quoteNo } = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
      const notifCount = () =>
        prisma.notification.count({
          where: { userId: owner.userId, message: { contains: quoteNo } },
        });
      const lastNotif = async () =>
        (
          await prisma.notification.findFirst({
            where: { userId: owner.userId, message: { contains: quoteNo } },
            orderBy: { createdAt: "desc" },
          })
        )?.message ?? "";

      // ครั้งแรก
      await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);
      expect(await notifCount()).toBe(1);
      expect(await lastNotif()).toContain("เปิดดู");

      // กลับมาเปิดหลังเงียบไป 6 วัน
      await rewind(quoteId, 6 * 24 * 60);
      await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);
      expect(await notifCount()).toBe(2);
      expect(await lastNotif()).toContain("หลังเงียบไป 6 วัน");

      // รอบที่ 3 (ต่อเนื่อง ไม่ได้เงียบนาน) = แตะเกณฑ์ "กำลังตัดสินใจ"
      await rewind(quoteId, 31);
      await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);
      expect((await viewCounters(quoteId)).viewCount).toBe(3);
      expect(await notifCount()).toBe(3);
      expect(await lastNotif()).toContain("ครบ 3 ครั้ง");

      // รอบที่ 4 ต้องเงียบ — แจ้งเฉพาะตอนแตะเกณฑ์พอดี ไม่ใช่ทุกครั้งหลังจากนั้น
      await rewind(quoteId, 31);
      await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);
      expect((await viewCounters(quoteId)).viewCount).toBe(4);
      expect(await notifCount()).toBe(3);

      await prisma.notification.deleteMany({ where: { message: { contains: quoteNo } } });
    });

    it("ไม่รั่วตัวเลขการเปิดดูไปฝั่งลูกค้า และคนอื่นเปิดไม่ได้ก็ไม่ถูกนับ", async () => {
      const { quoteId } = await createSentQuoteForCustomer(
        customer.userId,
        "โครงการไม่รั่วตัวเลข",
      );

      const detail = await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);
      expect(detail.body.quote).not.toHaveProperty("firstViewedAt");
      expect(detail.body.quote).not.toHaveProperty("lastViewedAt");
      expect(detail.body.quote).not.toHaveProperty("viewCount");

      const list = await customer.agent.get("/api/my/quotes").expect(200);
      const listed = list.body.quotes.find((q: { id: string }) => q.id === quoteId);
      expect(listed).not.toHaveProperty("viewCount");

      // ลูกค้าคนอื่นยิงเข้ามาแล้วโดน 404 ต้องไม่ขยับตัวเลขของใบนี้
      const countsBefore = await viewCounters(quoteId);
      await intruder.agent.get(`/api/my/quotes/${quoteId}`).expect(404);
      await intruder.agent.get(`/api/my/quotes/${quoteId}/pdf`).expect(404);
      expect(await viewCounters(quoteId)).toEqual(countsBefore);
    });

    it("ลูกค้าเปิดไฟล์แนบของใบเสนอราคาก็นับว่าเปิดดูใบนั้น", async () => {
      const { projectId, quoteId } = await createSentQuoteForCustomer(
        customer.userId,
        "โครงการเปิดไฟล์แนบ",
      );
      const upload = await owner.agent
        .post(`/api/projects/${projectId}/quotes/${quoteId}/attachments`)
        .field("kind", "QUOTE")
        .field("visibility", "CUSTOMER")
        .attach("file", Buffer.from("%PDF ไฟล์แนบทดสอบ"), {
          filename: "boq.pdf",
          contentType: "application/pdf",
        });
      const attachmentId = upload.body.attachment.id as string;

      expect(await viewCounters(quoteId)).toMatchObject({ firstViewedAt: null, viewCount: 0 });

      await customer.agent
        .get(`/api/my/quotes/${quoteId}/attachments/${attachmentId}/download`)
        .expect(200);

      const counters = await viewCounters(quoteId);
      expect(counters.firstViewedAt).not.toBeNull();
      expect(counters.viewCount).toBe(1);

      // เปิดพรีวิวต่อในช่วงสั้น ๆ ต้องไม่นับซ้ำ แต่ต้องขยับ "เปิดล่าสุด"
      await rewind(quoteId, 31);
      await customer.agent
        .get(`/api/my/quotes/${quoteId}/attachments/${attachmentId}/preview`)
        .expect(200);
      expect((await viewCounters(quoteId)).viewCount).toBe(2);

      // ลูกค้าคนอื่นโหลดไม่ได้ และต้องไม่ขยับตัวเลข
      const before = await viewCounters(quoteId);
      await intruder.agent
        .get(`/api/my/quotes/${quoteId}/attachments/${attachmentId}/download`)
        .expect(404);
      expect(await viewCounters(quoteId)).toEqual(before);

      await prisma.quoteAttachment.deleteMany({ where: { quoteId } });
    });

    it("ใบร่างที่ยังไม่ส่งลูกค้าเปิดไม่ได้ จึงไม่มีการนับ", async () => {
      const projectRes = await owner.agent
        .post("/api/projects")
        .send({ name: "โครงการใบร่างไม่ถูกนับ", customerId: customer.userId });
      const projectId = projectRes.body.project.id as string;
      createdProjectIds.push(projectId);
      await owner.agent
        .post(`/api/projects/${projectId}/boq/items`)
        .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
      const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
      const quoteId = quoteRes.body.quote.id as string;

      await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(404);
      expect(await viewCounters(quoteId)).toMatchObject({ firstViewedAt: null, viewCount: 0 });
    });
  });
});
