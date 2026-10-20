import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

// mock ด้วยเหตุผลเดียวกับ quotes.test.ts / myQuotes.test.ts: entry แบบ ESM ของ Puppeteer
// รันใต้ runtime CJS ของ ts-jest ไม่ได้ และเทสต์เหล่านี้ก็ไม่ได้ใช้มันอยู่แล้ว
jest.mock("../../src/lib/pdf/quote-pdf", () => ({
  renderQuotePdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));

describe("leads module", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  let materialId: string;
  const createdUserIds: string[] = [];
  const createdLeadIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-leads-owner");
    createdUserIds.push(owner.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบคำขอลูกค้า" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบคำขอลูกค้า",
    });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการทดสอบคำขอลูกค้า",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);

    const material = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "วัสดุทดสอบคำขอลูกค้า",
      unit: "หน่วย",
      materialUnitPrice: 1000,
      laborUnitPrice: 0,
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
    await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
    // ลบ token ลิงก์เข้าใช้ก่อนลบ user — createdById ใช้ RESTRICT (owner เป็นคนออก token)
    // ถ้าไม่ลบก่อน การลบ owner ในชุดเดียวกันจะติด FK
    await prisma.accountAccessToken.deleteMany({
      where: {
        OR: [{ userId: { in: createdUserIds } }, { createdById: { in: createdUserIds } }],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("accepts an anonymous lead submission with no customerId", async () => {
    const res = await request(app)
      .post("/api/public/leads")
      .send({
        name: "ผู้สนใจ ทดสอบ",
        phone: "0812345678",
        email: "lead-0812345678@example.com",
        serviceType: "รับสร้างบ้าน",
      });

    expect(res.status).toBe(201);
    expect(res.body.lead.customerId).toBeNull();
    expect(res.body.lead.status).toBe("NEW");
    createdLeadIds.push(res.body.lead.id);
  });

  it("normalizes a formatted or +66 phone number before storing it", async () => {
    const spaced = await request(app)
      .post("/api/public/leads")
      .send({
        name: "เบอร์มีขีด ทดสอบ",
        phone: "081-234-5678",
        email: "lead-dashed@example.com",
        serviceType: "รับสร้างบ้าน",
      });
    expect(spaced.status).toBe(201);
    expect(spaced.body.lead.phone).toBe("0812345678");
    createdLeadIds.push(spaced.body.lead.id);

    const international = await request(app)
      .post("/api/public/leads")
      .send({
        name: "เบอร์สากล ทดสอบ",
        phone: "+66 81 234 5678",
        email: "lead-intl@example.com",
        serviceType: "รับสร้างบ้าน",
      });
    expect(international.status).toBe(201);
    expect(international.body.lead.phone).toBe("0812345678");
    createdLeadIds.push(international.body.lead.id);
  });

  it("rejects a landline or malformed phone number", async () => {
    for (const phone of ["021234567", "081234567", "+1 415 555 2671", "ไม่มีเบอร์"]) {
      const res = await request(app)
        .post("/api/public/leads")
        .send({
          name: "เบอร์ไม่ถูกต้อง",
          phone,
          email: "lead-badphone@example.com",
          serviceType: "รับสร้างบ้าน",
        });
      expect(res.status).toBe(400);
    }
  });

  it("rejects a name with no surname, too short, or containing digits/symbols", async () => {
    for (const name of ["สมชาย", "ก", "  ", "สมชาย123 ใจดี", "John Smith!"]) {
      const res = await request(app)
        .post("/api/public/leads")
        .send({
          name,
          phone: "0812345678",
          email: "lead-badname@example.com",
          serviceType: "รับสร้างบ้าน",
        });
      expect(res.status).toBe(400);
    }
  });

  it("stores the name trimmed with collapsed internal whitespace", async () => {
    const res = await request(app).post("/api/public/leads").send({
      name: "  สมชาย    ใจดี  ",
      phone: "0821110000",
      email: "lead-nametrim@example.com",
      serviceType: "รับสร้างบ้าน",
    });
    expect(res.status).toBe(201);
    expect(res.body.lead.name).toBe("สมชาย ใจดี");
    createdLeadIds.push(res.body.lead.id);
  });

  it("requires an email and stores it trimmed and lower-cased", async () => {
    const missing = await request(app)
      .post("/api/public/leads")
      .send({ name: "ไม่มีอีเมล", phone: "0812345678", serviceType: "รับสร้างบ้าน" });
    expect(missing.status).toBe(400);

    const malformed = await request(app).post("/api/public/leads").send({
      name: "อีเมลผิดรูปแบบ",
      phone: "0812345678",
      email: "ไม่ใช่อีเมล",
      serviceType: "รับสร้างบ้าน",
    });
    expect(malformed.status).toBe(400);

    const created = await request(app).post("/api/public/leads").send({
      name: "อีเมลตัวใหญ่ ทดสอบ",
      phone: "0812345678",
      email: "  SomChai.Test@Gmail.COM  ",
      serviceType: "รับสร้างบ้าน",
    });
    expect(created.status).toBe(201);
    expect(created.body.lead.email).toBe("somchai.test@gmail.com");
    createdLeadIds.push(created.body.lead.id);
  });

  it("auto-attaches customerId when a logged-in customer submits a lead", async () => {
    const customer = await createAndLoginCustomer("test-leads-customer");

    const res = await customer.agent
      .post("/api/public/leads")
      .send({
        name: "ลูกค้า ทดสอบ",
        phone: "0898765432",
        email: "lead-0898765432@example.com",
        serviceType: "งานออกแบบ",
      });
    expect(res.status).toBe(201);
    expect(res.body.lead.customerId).toEqual(expect.any(String));
    createdLeadIds.push(res.body.lead.id);

    const myLeadsRes = await customer.agent.get("/api/my/leads");
    expect(myLeadsRes.status).toBe(200);
    expect(myLeadsRes.body.leads.map((l: { id: string }) => l.id)).toEqual([res.body.lead.id]);
    // มุมลูกค้าไม่ส่งช่องภายในออกไป
    expect(myLeadsRes.body.leads[0]).not.toHaveProperty("customerId");
    expect(myLeadsRes.body.leads[0]).not.toHaveProperty("deletedById");

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  it("shows a customer their own request detail, and 404s for other customers / trash / unknown ids", async () => {
    const alice = await createAndLoginCustomer("test-leads-detail-alice");
    const bob = await createAndLoginCustomer("test-leads-detail-bob");
    createdUserIds.push((await alice.agent.get("/api/auth/me")).body.user.id);
    createdUserIds.push((await bob.agent.get("/api/auth/me")).body.user.id);

    const created = await alice.agent.post("/api/public/leads").send({
      name: "รายละเอียด คำขอ",
      phone: "0812001200",
      email: "lead-detail@example.com",
      serviceType: "รับสร้างบ้าน",
      message: "บ้านชั้นเดียว\nสามห้องนอน",
      siteAddress: "12 ต.ในเมือง อ.เมือง จ.ขอนแก่น",
      areaSqm: 120.5,
      desiredStartDate: "2026-12-01",
    });
    const leadId = created.body.lead.id as string;
    createdLeadIds.push(leadId);

    const mine = await alice.agent.get(`/api/my/leads/${leadId}`);
    expect(mine.status).toBe(200);
    expect(mine.body.lead).toMatchObject({
      id: leadId,
      serviceType: "รับสร้างบ้าน",
      message: "บ้านชั้นเดียว\nสามห้องนอน",
      siteAddress: "12 ต.ในเมือง อ.เมือง จ.ขอนแก่น",
      desiredStartDate: "2026-12-01",
      attachments: [],
      houseDesign: null,
      status: "NEW",
      latestQuote: null,
      hasContract: false,
    });
    expect(Number(mine.body.lead.areaSqm)).toBe(120.5);
    expect(mine.body.lead).not.toHaveProperty("customerId");

    // ของคนอื่น = ข้อความเดียวกับ id ที่ไม่มีจริง — เดาไม่ได้ว่ามีคำขอนี้อยู่
    const other = await bob.agent.get(`/api/my/leads/${leadId}`);
    const unknown = await bob.agent.get("/api/my/leads/does-not-exist");
    expect(other.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(other.body).toEqual(unknown.body);

    // พนักงานใช้เส้นทางของลูกค้าไม่ได้
    expect((await owner.agent.get(`/api/my/leads/${leadId}`)).status).toBe(403);

    // อยู่ในถังขยะ = ไม่พบ
    await owner.agent.delete(`/api/leads/${leadId}`);
    expect((await alice.agent.get(`/api/my/leads/${leadId}`)).status).toBe(404);
  });

  it("keeps the customer's area range (never copied into the project) and lets a typed number win", async () => {
    // ไม่สมัครลูกค้าใหม่ — registerLimiter 10 ครั้ง/ชม. ทั้งไฟล์นี้ใช้เกือบเต็มแล้ว
    const post = (body: object) => request(app).post("/api/public/leads").send(body);
    const base = { name: "ช่วง พื้นที่", phone: "0812001400", email: "lead-area-range@example.com", serviceType: "งานก่อสร้าง" };

    const ranged = await post({ ...base, areaRange: "100_200" });
    expect(ranged.status).toBe(201);
    createdLeadIds.push(ranged.body.lead.id);
    const listed = await owner.agent.get("/api/leads");
    const lead = (listed.body.leads as { id: string; areaSqm: unknown; areaRange: unknown }[]).find((l) => l.id === ranged.body.lead.id);
    expect(lead).toMatchObject({ areaSqm: null, areaRange: "100_200" });

    // ช่วงใช้ประเมินขนาดงานเท่านั้น — สร้างโครงการแล้วพื้นที่โครงการยังว่าง (ต้องถามตัวเลขจริง)
    const projectRes = await owner.agent.post(`/api/leads/${ranged.body.lead.id}/create-project`);
    createdProjectIds.push(projectRes.body.project.id);
    expect(projectRes.body.project.areaSqm).toBeNull();

    // พิมพ์ตัวเลขมาด้วย = ตัวเลขชนะ ช่วงถูกทิ้ง
    const both = await post({ ...base, areaSqm: 150, areaRange: "GT300" });
    createdLeadIds.push(both.body.lead.id);
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: both.body.lead.id } });
    expect(row.areaRange).toBeNull();
    expect(Number(row.areaSqm)).toBe(150);

    const bad = await post({ ...base, areaRange: "HUGE" });
    expect(bad.status).toBe(400);
  });

  it("links a request to its sent quote (never a draft) and deep-links the reply notification", async () => {
    const customer = await createAndLoginCustomer("test-leads-detail-quote");
    const customerId = (await customer.agent.get("/api/auth/me")).body.user.id as string;
    createdUserIds.push(customerId);

    const created = await customer.agent.post("/api/public/leads").send({
      name: "คำขอ มีใบเสนอราคา",
      phone: "0812001300",
      email: "lead-detail-quote@example.com",
      serviceType: "รับสร้างบ้าน",
    });
    const leadId = created.body.lead.id as string;
    createdLeadIds.push(leadId);

    const projectRes = await owner.agent.post(`/api/leads/${leadId}/create-project`);
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);
    await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = quoteRes.body.quote.id as string;

    const whileDraft = await customer.agent.get(`/api/my/leads/${leadId}`);
    expect(whileDraft.body.lead.latestQuote).toBeNull();

    await sendQuote(owner.agent, projectId, quoteId);
    const afterSend = await customer.agent.get(`/api/my/leads/${leadId}`);
    expect(afterSend.body.lead.status).toBe("QUOTED");
    expect(afterSend.body.lead.latestQuote).toMatchObject({ id: quoteId, status: "SENT" });
    const list = await customer.agent.get("/api/my/leads");
    expect(list.body.leads[0].latestQuote.id).toBe(quoteId);

    const reply = await owner.agent.patch(`/api/leads/${leadId}/reply`).send({ reply: "ส่งใบเสนอราคาให้แล้วครับ" });
    expect(reply.status).toBe(200);
    const note = await prisma.notification.findFirst({
      where: { userId: customerId, message: { contains: "ตอบกลับคำขอ" } },
    });
    expect(note?.link).toBe(`/my/requests/${leadId}`);
  });

  it("lets staff list and update lead status", async () => {
    const created = await request(app)
      .post("/api/public/leads")
      .send({
        name: "รอติดต่อ ทดสอบ",
        phone: "0811112222",
        email: "lead-0811112222@example.com",
        serviceType: "รับสร้างบ้าน",
      });
    createdLeadIds.push(created.body.lead.id);

    const listRes = await owner.agent.get("/api/leads");
    expect(listRes.status).toBe(200);
    expect(listRes.body.leads.map((l: { id: string }) => l.id)).toContain(created.body.lead.id);

    const updateRes = await owner.agent
      .patch(`/api/leads/${created.body.lead.id}`)
      .send({ status: "CONTACTED" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.lead.status).toBe("CONTACTED");
  });

  it("rejects a CUSTOMER listing all leads (staff-only)", async () => {
    const customer = await createAndLoginCustomer("test-leads-customer-forbidden");
    const res = await customer.agent.get("/api/leads");
    expect(res.status).toBe(403);
    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  it("creates a linked project from a lead, and advances the lead from NEW to CONTACTED", async () => {
    const created = await request(app)
      .post("/api/public/leads")
      .send({
        name: "รอสร้าง โครงการ",
        phone: "0813334444",
        email: "lead-0813334444@example.com",
        serviceType: "รับสร้างบ้าน",
      });
    const leadId = created.body.lead.id as string;
    createdLeadIds.push(leadId);

    const projectRes = await owner.agent.post(`/api/leads/${leadId}/create-project`);
    expect(projectRes.status).toBe(201);
    expect(projectRes.body.project.leadId).toBe(leadId);
    createdProjectIds.push(projectRes.body.project.id);

    const listRes = await owner.agent.get("/api/leads");
    const lead = listRes.body.leads.find((l: { id: string }) => l.id === leadId);
    expect(lead.status).toBe("CONTACTED");
    expect(lead.projectId).toBe(projectRes.body.project.id);
  });

  it("prefills the project's site address / area / start date from the lead's request info", async () => {
    const created = await request(app).post("/api/public/leads").send({
      name: "เจ้าของ ที่ดิน",
      phone: "0817778888",
      email: "lead-prefill@example.com",
      serviceType: "รับสร้างบ้าน",
      siteAddress: "99/1 ต.ในเมือง อ.เมือง จ.ขอนแก่น",
      areaSqm: 180.5,
      desiredStartDate: "2026-09-01",
    });
    const leadId = created.body.lead.id as string;
    createdLeadIds.push(leadId);

    const projectRes = await owner.agent.post(`/api/leads/${leadId}/create-project`);
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);

    const detailRes = await owner.agent.get(`/api/projects/${projectId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.project.siteAddress).toBe("99/1 ต.ในเมือง อ.เมือง จ.ขอนแก่น");
    expect(Number(detailRes.body.project.areaSqm)).toBe(180.5);
    expect((detailRes.body.project.startDate as string).slice(0, 10)).toBe("2026-09-01");
  });

  it("drops an invalid/nonexistent houseDesignId to null instead of failing with a 500", async () => {
    // houseDesignId มาจาก query string ที่แก้ได้ — ค่ามั่วจะต้องไม่ทำให้ FK ระเบิดเป็น 500
    const res = await request(app).post("/api/public/leads").send({
      name: "แบบบ้าน ไม่มีจริง",
      phone: "0812340000",
      email: "lead-baddesign@example.com",
      serviceType: "งานออกแบบ",
      houseDesignId: "does-not-exist-xyz",
    });
    expect(res.status).toBe(201);
    expect(res.body.lead.houseDesignId).toBeNull();
    createdLeadIds.push(res.body.lead.id);
  });

  it("rejects an oversized serviceType/message and non-http attachment links (public input hardening)", async () => {
    const longService = await request(app).post("/api/public/leads").send({
      name: "บริการ ยาวเกิน",
      phone: "0812341111",
      email: "lead-longservice@example.com",
      serviceType: "ก".repeat(200),
    });
    expect(longService.status).toBe(400);

    const longMessage = await request(app).post("/api/public/leads").send({
      name: "ข้อความ ยาวเกิน",
      phone: "0812342222",
      email: "lead-longmsg@example.com",
      serviceType: "งานออกแบบ",
      message: "x".repeat(6000),
    });
    expect(longMessage.status).toBe(400);

    const badAttachment = await request(app).post("/api/public/leads").send({
      name: "ลิงก์ อันตราย",
      phone: "0812343333",
      email: "lead-badattach@example.com",
      serviceType: "งานออกแบบ",
      attachments: ["javascript:alert(1)"],
    });
    expect(badAttachment.status).toBe(400);
  });

  it("moves a lead with no project to trash: hidden from staff+customer lists, then restorable", async () => {
    const customer = await createAndLoginCustomer("test-leads-trash-customer");
    const me = await customer.agent.get("/api/auth/me");
    createdUserIds.push(me.body.user.id);

    const created = await customer.agent.post("/api/public/leads").send({
      name: "คำขอ สแปม",
      phone: "0812349999",
      email: "lead-spam@example.com",
      serviceType: "งานออกแบบ",
    });
    const leadId = created.body.lead.id as string;
    createdLeadIds.push(leadId);

    // ลบ → ย้ายเข้าถังขยะ
    const del = await owner.agent.delete(`/api/leads/${leadId}`);
    expect(del.status).toBe(204);

    // หายจากรายการฝั่งพนักงาน + ฝั่งลูกค้า
    const staffList = await owner.agent.get("/api/leads");
    expect(staffList.body.leads.map((l: { id: string }) => l.id)).not.toContain(leadId);
    const myList = await customer.agent.get("/api/my/leads");
    expect(myList.body.leads.map((l: { id: string }) => l.id)).not.toContain(leadId);

    // โผล่ในถังขยะเป็นชนิด "lead"
    const trash = await owner.agent.get("/api/trash");
    expect(trash.body.items.some((i: { type: string; id: string }) => i.type === "lead" && i.id === leadId)).toBe(true);

    // กู้คืน → กลับมาในรายการ
    const restore = await owner.agent.post(`/api/trash/lead/${leadId}/restore`);
    expect(restore.status).toBe(204);
    const afterRestore = await owner.agent.get("/api/leads");
    expect(afterRestore.body.leads.map((l: { id: string }) => l.id)).toContain(leadId);
  });

  it("permanently deletes a trashed lead (OWNER purge) — gone from trash for good", async () => {
    const created = await request(app).post("/api/public/leads").send({
      name: "คำขอ ลบถาวร",
      phone: "0812347777",
      email: "lead-purge@example.com",
      serviceType: "งานออกแบบ",
    });
    const leadId = created.body.lead.id as string;
    createdLeadIds.push(leadId);

    await owner.agent.delete(`/api/leads/${leadId}`);
    const purge = await owner.agent.delete(`/api/trash/lead/${leadId}`);
    expect(purge.status).toBe(204);

    const trash = await owner.agent.get("/api/trash");
    expect(trash.body.items.some((i: { id: string }) => i.id === leadId)).toBe(false);
    const gone = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(gone).toBeNull();
  });

  it("blocks trashing a lead that has already become a project (409)", async () => {
    const created = await request(app).post("/api/public/leads").send({
      name: "คำขอ เป็นโครงการ",
      phone: "0812348888",
      email: "lead-hasproject@example.com",
      serviceType: "รับสร้างบ้าน",
    });
    const leadId = created.body.lead.id as string;
    createdLeadIds.push(leadId);

    const projectRes = await owner.agent.post(`/api/leads/${leadId}/create-project`);
    createdProjectIds.push(projectRes.body.project.id);

    const del = await owner.agent.delete(`/api/leads/${leadId}`);
    expect(del.status).toBe(409);
    // ยังอยู่ในรายการตามเดิม
    const list = await owner.agent.get("/api/leads");
    expect(list.body.leads.map((l: { id: string }) => l.id)).toContain(leadId);
  });

  it("blocks creating a second project from a lead that's already linked", async () => {
    const created = await request(app)
      .post("/api/public/leads")
      .send({
        name: "ลิงก์ซ้ำ ทดสอบ",
        phone: "0815556666",
        email: "lead-0815556666@example.com",
        serviceType: "รับสร้างบ้าน",
      });
    const leadId = created.body.lead.id as string;
    createdLeadIds.push(leadId);

    const firstRes = await owner.agent.post(`/api/leads/${leadId}/create-project`);
    createdProjectIds.push(firstRes.body.project.id);

    const secondRes = await owner.agent.post(`/api/leads/${leadId}/create-project`);
    expect(secondRes.status).toBe(409);
  });

  it("404s creating a project from a nonexistent lead", async () => {
    const res = await owner.agent.post("/api/leads/nonexistent-lead-id/create-project");
    expect(res.status).toBe(404);
  });

  it("auto-advances a linked lead's status as its project's quote is sent then accepted", async () => {
    const created = await request(app)
      .post("/api/public/leads")
      .send({
        name: "ติดตาม อัตโนมัติ",
        phone: "0817778888",
        email: "lead-0817778888@example.com",
        serviceType: "รับสร้างบ้าน",
      });
    const leadId = created.body.lead.id as string;
    createdLeadIds.push(leadId);

    const projectRes = await owner.agent.post(`/api/leads/${leadId}/create-project`);
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);

    await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    await sendQuote(owner.agent, projectId, quoteRes.body.quote.id);

    const afterSentRes = await owner.agent.get("/api/leads");
    expect(afterSentRes.body.leads.find((l: { id: string }) => l.id === leadId).status).toBe("QUOTED");

    const customer = await createAndLoginCustomer("test-leads-autoadvance-customer");
    await prisma.project.update({
      where: { id: projectId },
      data: { customerId: (await customer.agent.get("/api/auth/me")).body.user.id },
    });
    await customer.agent
      .post(`/api/my/quotes/${quoteRes.body.quote.id}/respond`)
      .send({ action: "ACCEPT" });

    const afterAcceptRes = await owner.agent.get("/api/leads");
    expect(afterAcceptRes.body.leads.find((l: { id: string }) => l.id === leadId).status).toBe("CLOSED");

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  it("does not reopen a lead that's already reached a terminal status (CLOSED/REJECTED)", async () => {
    const created = await request(app)
      .post("/api/public/leads")
      .send({
        name: "ปิดงาน แล้ว",
        phone: "0819990000",
        email: "lead-0819990000@example.com",
        serviceType: "รับสร้างบ้าน",
      });
    const leadId = created.body.lead.id as string;
    createdLeadIds.push(leadId);

    const projectRes = await owner.agent.post(`/api/leads/${leadId}/create-project`);
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);

    await owner.agent.patch(`/api/leads/${leadId}`).send({ status: "REJECTED" });

    await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    await sendQuote(owner.agent, projectId, quoteRes.body.quote.id);

    const afterSentRes = await owner.agent.get("/api/leads");
    expect(afterSentRes.body.leads.find((l: { id: string }) => l.id === leadId).status).toBe("REJECTED");
  });

  it("exposes the originating lead's contact info on the project detail (idea 1)", async () => {
    const created = await request(app).post("/api/public/leads").send({
      name: "ผู้ติดต่อ โครงการ",
      phone: "0812223333",
      email: "lead-contact-info@example.com",
      serviceType: "รับสร้างบ้าน",
      message: "อยากได้บ้าน 2 ชั้น",
    });
    const leadId = created.body.lead.id as string;
    createdLeadIds.push(leadId);

    const projectRes = await owner.agent.post(`/api/leads/${leadId}/create-project`);
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);

    const detailRes = await owner.agent.get(`/api/projects/${projectId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.lead).toMatchObject({
      id: leadId,
      name: "ผู้ติดต่อ โครงการ",
      phone: "0812223333",
      email: "lead-contact-info@example.com",
      serviceType: "รับสร้างบ้าน",
      message: "อยากได้บ้าน 2 ชั้น",
    });
  });

  it("creates a customer account from a lead and issues an access link (idea 2)", async () => {
    const created = await request(app)
      .post("/api/public/leads")
      .send({
        name: "สร้างบัญชี จากคำขอ",
        phone: "0812224444",
        email: "lead-0812224444@example.com",
        serviceType: "รับสร้างบ้าน",
      });
    const leadId = created.body.lead.id as string;
    createdLeadIds.push(leadId);

    const projectRes = await owner.agent.post(`/api/leads/${leadId}/create-project`);
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);

    const email = `created-from-lead-${Date.now()}@example.com`;
    const res = await owner.agent
      .post(`/api/projects/${projectId}/customer-access-link`)
      .send({ email, fullName: "สร้างบัญชีจากคำขอ", phone: "0812224444" });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.customer.email).toBe(email);
    expect(typeof res.body.url).toBe("string");
    createdUserIds.push(res.body.customer.id);

    // ตอนนี้โปรเจกต์ถูกผูกกับลูกค้ารายนั้นแล้ว
    const detailRes = await owner.agent.get(`/api/projects/${projectId}`);
    expect(detailRes.body.project.customer.id).toBe(res.body.customer.id);

    // ลูกค้าเปิดลิงก์ตั้งรหัสผ่านของตัวเอง → เข้าระบบได้ทันที
    const token = (res.body.url as string).split("/activate/")[1];
    const redeem = await request(app)
      .post(`/api/auth/access/${token}`)
      .send({ password: "Customer-set-pw-1234" });
    expect(redeem.status).toBe(200);
    expect(redeem.body.user.email).toBe(email);

    // และล็อกอินด้วยรหัสที่เพิ่งตั้งได้
    const custLogin = await request(app)
      .post("/api/auth/customer/login")
      .send({ email, password: "Customer-set-pw-1234" });
    expect(custLogin.status).toBe(200);
  });

  it("links an existing customer instead of creating a duplicate (auto-match by email)", async () => {
    const existing = await createAndLoginCustomer("test-leads-autolink-existing");
    const me = await existing.agent.get("/api/auth/me");

    const created = await request(app)
      .post("/api/public/leads")
      .send({
        name: "จับคู่ บัญชีเดิม",
        phone: "0812225555",
        email: "lead-0812225555@example.com",
        serviceType: "รับสร้างบ้าน",
      });
    const leadId = created.body.lead.id as string;
    createdLeadIds.push(leadId);
    const projectRes = await owner.agent.post(`/api/leads/${leadId}/create-project`);
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);

    const res = await owner.agent
      .post(`/api/projects/${projectId}/customer-access-link`)
      .send({ email: existing.email, fullName: "จับคู่บัญชีเดิม", phone: "0812225555" });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(res.body.customer.id).toBe(me.body.user.id);
    expect(typeof res.body.url).toBe("string");

    const detailRes = await owner.agent.get(`/api/projects/${projectId}`);
    expect(detailRes.body.project.customer.id).toBe(me.body.user.id);

    await prisma.accountAccessToken.deleteMany({ where: { userId: me.body.user.id } });
    await prisma.user.deleteMany({ where: { email: existing.email } });
  });

  // โครงการที่ไม่ได้มาจากคำขอสร้างบัญชีลูกค้าได้แล้ว (ลูกค้าที่โทร/เดินเข้ามาเอง — ทางสำเร็จอยู่ใน
  // access-link.test.ts) แต่ไม่มีคำขอให้ดึงชื่อ จึงต้องกรอกชื่อเอง
  it("needs the customer's name to issue an access link for a project not created from a lead", async () => {
    const projectRes = await owner.agent.post("/api/projects").send({ name: "โครงการไม่ได้มาจากคำขอ" });
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);

    const res = await owner.agent
      .post(`/api/projects/${projectId}/customer-access-link`)
      .send({ email: `nolead-${Date.now()}@example.com`, phone: "0812226666" });
    expect(res.status).toBe(400);
  });

  it("finds a registered customer by phone number (auto-match search)", async () => {
    const uniquePhone = `09${Date.now().toString().slice(-8)}`;
    const email = `phone-search-${Date.now()}@example.com`;
    await request(app)
      .post("/api/auth/customer/register")
      .send({ email, password: "Juniper-cairn-29-driftglass", fullName: "ค้นด้วย เบอร์โทร", phone: uniquePhone });
    const registered = await prisma.user.findUnique({ where: { email } });
    createdUserIds.push(registered!.id);

    const res = await owner.agent.get(`/api/customers?q=${uniquePhone}`);
    expect(res.status).toBe(200);
    expect(res.body.customers.map((c: { id: string }) => c.id)).toContain(registered!.id);
  });

  it("retroactively links a lead to a blank project, carrying over the lead's customer", async () => {
    const customer = await createAndLoginCustomer("test-leads-retrolink");
    const me = await customer.agent.get("/api/auth/me");
    createdUserIds.push(me.body.user.id);

    // lead ที่ส่งโดยลูกค้าที่ล็อกอินอยู่ (จึงพก customerId มาด้วย)
    const created = await customer.agent
      .post("/api/public/leads")
      .send({
        name: "เชื่อม ย้อนหลัง",
        phone: "0813337777",
        email: "lead-0813337777@example.com",
        serviceType: "รับสร้างบ้าน",
      });
    const leadId = created.body.lead.id as string;
    createdLeadIds.push(leadId);

    // โปรเจกต์ที่เริ่มจากศูนย์ (ไม่มี lead ไม่มีลูกค้า)
    const projectRes = await owner.agent.post("/api/projects").send({ name: "โครงการเปล่ารอเชื่อม" });
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);

    const linkRes = await owner.agent
      .post(`/api/projects/${projectId}/link-lead`)
      .send({ leadId });
    expect(linkRes.status).toBe(200);
    expect(linkRes.body.project.leadId).toBe(leadId);
    expect(linkRes.body.project.customerId).toBe(me.body.user.id);

    // ตอนนี้หน้ารายละเอียดแสดงบริบทของ lead และ lead ขยับจาก NEW -> CONTACTED
    const detailRes = await owner.agent.get(`/api/projects/${projectId}`);
    expect(detailRes.body.lead.id).toBe(leadId);
    const leadsList = await owner.agent.get("/api/leads");
    expect(leadsList.body.leads.find((l: { id: string }) => l.id === leadId).status).toBe("CONTACTED");
  });

  it("blocks linking a lead that already has a project, or to a project already linked", async () => {
    const leadA = await request(app)
      .post("/api/public/leads")
      .send({
        name: "คำขอ A",
        phone: "0813338888",
        email: "lead-0813338888@example.com",
        serviceType: "รับสร้างบ้าน",
      });
    createdLeadIds.push(leadA.body.lead.id);
    const projectA = await owner.agent.post(`/api/leads/${leadA.body.lead.id}/create-project`);
    createdProjectIds.push(projectA.body.project.id);

    // leadA มี projectA อยู่แล้ว -> การนำไปผูกกับโปรเจกต์เปล่าอีกอันจะล้มเหลว
    const blank = await owner.agent.post("/api/projects").send({ name: "เปล่าอีกอัน" });
    createdProjectIds.push(blank.body.project.id);
    const dupLead = await owner.agent
      .post(`/api/projects/${blank.body.project.id}/link-lead`)
      .send({ leadId: leadA.body.lead.id });
    expect(dupLead.status).toBe(409);

    // projectA มี leadA อยู่แล้ว -> การนำ lead อื่นมาผูกกับมันจะล้มเหลว
    const leadB = await request(app)
      .post("/api/public/leads")
      .send({
        name: "คำขอ B",
        phone: "0813339999",
        email: "lead-0813339999@example.com",
        serviceType: "รับสร้างบ้าน",
      });
    createdLeadIds.push(leadB.body.lead.id);
    const dupProject = await owner.agent
      .post(`/api/projects/${projectA.body.project.id}/link-lead`)
      .send({ leadId: leadB.body.lead.id });
    expect(dupProject.status).toBe(409);
  });
});
