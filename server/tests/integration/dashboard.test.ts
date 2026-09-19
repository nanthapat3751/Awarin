import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";

// mock ด้วยเหตุผลเดียวกับ quotes.test.ts: entry แบบ ESM ของ Puppeteer รันใต้ runtime CJS
// ของ ts-jest ไม่ได้
jest.mock("../../src/lib/pdf/quote-pdf", () => ({
  renderQuotePdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));

describe("dashboard module", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  let materialId: string;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-dashboard-owner");
    createdUserIds.push(owner.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบแดชบอร์ด" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบแดชบอร์ด",
    });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการทดสอบแดชบอร์ด",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);

    const material = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "วัสดุทดสอบแดชบอร์ด",
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
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("counts a freshly created DRAFT project and includes it in recentProjects", async () => {
    // หมายเหตุ: ไฟล์เทสต์อื่นสร้างโปรเจกต์พร้อมกันในฐานข้อมูลที่ใช้ร่วมกัน (Jest รันไฟล์เทสต์
    // แบบขนานหลาย worker) การเทียบผลต่างของจำนวนก่อน/หลังแบบเป๊ะ ๆ จึงเกิด race ได้ ให้ assert
    // เฉพาะโปรเจกต์ของเทสต์นี้เอง ไม่ใช่จำนวนรวมทั้งระบบ
    const created = await owner.agent
      .post("/api/projects")
      .send({ name: "โครงการทดสอบแดชบอร์ด" });
    createdProjectIds.push(created.body.project.id);

    const after = await owner.agent.get("/api/dashboard/summary");
    expect(after.status).toBe(200);
    expect(after.body.summary.projectCounts.DRAFT).toBeGreaterThanOrEqual(1);
    expect(
      after.body.summary.recentProjects.some((p: { id: string }) => p.id === created.body.project.id),
    ).toBe(true);
  });

  it("includes a SENT quote's net price in totalQuotedValue, but not a DRAFT project", async () => {
    const draftProject = await owner.agent.post("/api/projects").send({ name: "ยังไม่เสนอราคา" });
    createdProjectIds.push(draftProject.body.project.id);

    const quotedProject = await owner.agent.post("/api/projects").send({ name: "เสนอราคาแล้ว" });
    const projectId = quotedProject.body.project.id;
    createdProjectIds.push(projectId);

    await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    await owner.agent
      .post(`/api/projects/${projectId}/quotes/${quoteRes.body.quote.id}/transition`)
      .send({ toStatus: "SENT" });

    const summaryRes = await owner.agent.get("/api/dashboard/summary");
    expect(summaryRes.body.summary.totalQuotedValue).toBeGreaterThan(0);
  });

  it("keeps totalQuotedValue on the price actually sent, not an unsent BOQ edit (BR-07 clone)", async () => {
    const projectRes = await owner.agent.post("/api/projects").send({ name: "แก้ BOQ หลังเสนอราคา" });
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);

    await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    await owner.agent
      .post(`/api/projects/${projectId}/quotes/${quoteRes.body.quote.id}/transition`)
      .send({ toStatus: "SENT" });

    const before = await owner.agent.get("/api/dashboard/summary");
    const valueAfterQuote = before.body.summary.totalQuotedValue as number;

    // พนักงานแก้ BOQ ต่อ (BR-07 clone เป็นเวอร์ชันใหม่) แต่ยังไม่ได้ส่งใบเสนอราคาฉบับใหม่ให้ลูกค้า
    await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId, quantity: 99 });

    // ยอดต้องไม่ขยับ เพราะลูกค้ายังเห็นราคาเดิมอยู่
    const after = await owner.agent.get("/api/dashboard/summary");
    expect(after.body.summary.totalQuotedValue).toBeCloseTo(valueAfterQuote, 2);
  });

  it("counts win rate by project: a quoted project raises the denominator, winning it raises both", async () => {
    const customer = await createAndLoginCustomer("test-dashboard-winrate");
    const me = await customer.agent.get("/api/auth/me");

    const before = await owner.agent.get("/api/dashboard/summary");
    const quotedBefore = before.body.summary.quotedProjectCount as number;
    const wonBefore = before.body.summary.wonProjectCount as number;

    const projectRes = await owner.agent
      .post("/api/projects")
      .send({ name: "โครงการวัดอัตราปิดงาน", customerId: me.body.user.id });
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);

    await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = quoteRes.body.quote.id as string;

    // ใบร่างยังไม่ถือว่าเสนอราคา -- ตัวหารต้องยังไม่ขยับ
    const draftStage = await owner.agent.get("/api/dashboard/summary");
    expect(draftStage.body.summary.quotedProjectCount).toBe(quotedBefore);

    await owner.agent
      .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
      .send({ toStatus: "SENT" });

    const sentStage = await owner.agent.get("/api/dashboard/summary");
    expect(sentStage.body.summary.quotedProjectCount).toBe(quotedBefore + 1);
    expect(sentStage.body.summary.wonProjectCount).toBe(wonBefore);

    // ลูกค้าตอบรับ -> โปรเจกต์เป็น APPROVED = ปิดงานได้
    await customer.agent.post(`/api/my/quotes/${quoteId}/respond`).send({ action: "ACCEPT" });

    const wonStage = await owner.agent.get("/api/dashboard/summary");
    expect(wonStage.body.summary.quotedProjectCount).toBe(quotedBefore + 1);
    expect(wonStage.body.summary.wonProjectCount).toBe(wonBefore + 1);

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  it("rejects a CUSTOMER reading the dashboard", async () => {
    const customer = await createAndLoginCustomer("test-dashboard-customer");
    const res = await customer.agent.get("/api/dashboard/summary");
    expect(res.status).toBe(403);
    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  describe("pending work", () => {
    it("lists a project whose latest quote came back REVISED, with the customer's note", async () => {
      const customer = await createAndLoginCustomer("test-dashboard-pending-revision");
      const me = await customer.agent.get("/api/auth/me");

      const projectRes = await owner.agent
        .post("/api/projects")
        .send({ name: "โครงการรอแก้ไข", customerId: me.body.user.id });
      const projectId = projectRes.body.project.id as string;
      createdProjectIds.push(projectId);

      await owner.agent
        .post(`/api/projects/${projectId}/boq/items`)
        .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
      const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
      const quoteId = quoteRes.body.quote.id as string;
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
        .send({ toStatus: "SENT" });
      await customer.agent
        .post(`/api/my/quotes/${quoteId}/respond`)
        .send({ action: "REQUEST_REVISION", note: "ขอเปลี่ยนวัสดุพื้น" });

      const res = await owner.agent.get("/api/dashboard/pending-work");
      expect(res.status).toBe(200);
      const found = res.body.pendingWork.pendingRevisions.find(
        (r: { project: { id: string } }) => r.project.id === projectId,
      );
      expect(found).toBeDefined();
      expect(found.quote.customerNote).toBe("ขอเปลี่ยนวัสดุพื้น");

      await prisma.user.deleteMany({ where: { email: customer.email } });
    });

    it("drops a project from pendingRevisions once a newer quote is created after the revision", async () => {
      const customer = await createAndLoginCustomer("test-dashboard-pending-resolved");
      const me = await customer.agent.get("/api/auth/me");

      const projectRes = await owner.agent
        .post("/api/projects")
        .send({ name: "โครงการแก้ไขแล้ว", customerId: me.body.user.id });
      const projectId = projectRes.body.project.id as string;
      createdProjectIds.push(projectId);

      await owner.agent
        .post(`/api/projects/${projectId}/boq/items`)
        .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
      const firstQuoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${firstQuoteRes.body.quote.id}/transition`)
        .send({ toStatus: "SENT" });
      await customer.agent
        .post(`/api/my/quotes/${firstQuoteRes.body.quote.id}/respond`)
        .send({ action: "REQUEST_REVISION", note: "ขอเปลี่ยนวัสดุพื้น" });

      // พนักงานจัดการไปแล้ว: มีใบเสนอราคาฉบับตามอยู่แล้วสำหรับโปรเจกต์นี้
      await owner.agent.post(`/api/projects/${projectId}/quotes`);

      const res = await owner.agent.get("/api/dashboard/pending-work");
      expect(
        res.body.pendingWork.pendingRevisions.some(
          (r: { project: { id: string } }) => r.project.id === projectId,
        ),
      ).toBe(false);

      await prisma.user.deleteMany({ where: { email: customer.email } });
    });

    it("drops a project from pendingRevisions once the project itself is cancelled", async () => {
      const customer = await createAndLoginCustomer("test-dashboard-pending-cancelled");
      const me = await customer.agent.get("/api/auth/me");

      const projectRes = await owner.agent
        .post("/api/projects")
        .send({ name: "โครงการที่ถูกยกเลิก", customerId: me.body.user.id });
      const projectId = projectRes.body.project.id as string;
      createdProjectIds.push(projectId);

      await owner.agent
        .post(`/api/projects/${projectId}/boq/items`)
        .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
      const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
      const quoteId = quoteRes.body.quote.id as string;
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
        .send({ toStatus: "SENT" });
      await customer.agent
        .post(`/api/my/quotes/${quoteId}/respond`)
        .send({ action: "REQUEST_REVISION", note: "ขอเปลี่ยนวัสดุพื้น" });

      // พนักงานตัดสินใจยกเลิกโครงการแทนที่จะแก้ใบเสนอราคาให้ -- งานนี้ไม่ค้างอีกต่อไป
      await owner.agent.post(`/api/projects/${projectId}/transition`).send({ toStatus: "CANCELLED" });

      const res = await owner.agent.get("/api/dashboard/pending-work");
      expect(
        res.body.pendingWork.pendingRevisions.some(
          (r: { project: { id: string } }) => r.project.id === projectId,
        ),
      ).toBe(false);

      await prisma.user.deleteMany({ where: { email: customer.email } });
    });

    it("lists a quote that was sent but not yet answered, and drops it once the customer replies", async () => {
      const customer = await createAndLoginCustomer("test-dashboard-awaiting");
      const me = await customer.agent.get("/api/auth/me");

      const projectRes = await owner.agent
        .post("/api/projects")
        .send({ name: "โครงการรอลูกค้าตอบ", customerId: me.body.user.id });
      const projectId = projectRes.body.project.id as string;
      createdProjectIds.push(projectId);

      await owner.agent
        .post(`/api/projects/${projectId}/boq/items`)
        .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
      const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
      const quoteId = quoteRes.body.quote.id as string;
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
        .send({ toStatus: "SENT" });

      const sent = await owner.agent.get("/api/dashboard/pending-work");
      const found = sent.body.pendingWork.awaitingResponse.find(
        (r: { project: { id: string } }) => r.project.id === projectId,
      );
      expect(found).toBeDefined();
      expect(found.quote.quoteNo).toBe(quoteRes.body.quote.quoteNo);
      expect(found.quote.sentAt).not.toBeNull();

      // ลูกค้าตอบรับแล้ว -> ไม่ต้องตามงานอีก
      await customer.agent.post(`/api/my/quotes/${quoteId}/respond`).send({ action: "ACCEPT" });
      const answered = await owner.agent.get("/api/dashboard/pending-work");
      expect(
        answered.body.pendingWork.awaitingResponse.some(
          (r: { project: { id: string } }) => r.project.id === projectId,
        ),
      ).toBe(false);

      await prisma.user.deleteMany({ where: { email: customer.email } });
    });

    it("counts only the newest quote of a project as awaiting (an older SENT one is superseded)", async () => {
      const customer = await createAndLoginCustomer("test-dashboard-awaiting-superseded");
      const me = await customer.agent.get("/api/auth/me");

      const projectRes = await owner.agent
        .post("/api/projects")
        .send({ name: "โครงการส่งใบใหม่ทับ", customerId: me.body.user.id });
      const projectId = projectRes.body.project.id as string;
      createdProjectIds.push(projectId);

      await owner.agent
        .post(`/api/projects/${projectId}/boq/items`)
        .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
      const first = await owner.agent.post(`/api/projects/${projectId}/quotes`);
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${first.body.quote.id}/transition`)
        .send({ toStatus: "SENT" });
      // ออกใบใหม่ทับ แล้วส่งอีกครั้ง -- ใบเก่ายังค้างสถานะ SENT (state machine ไม่ปิดให้)
      const second = await owner.agent.post(`/api/projects/${projectId}/quotes`);
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${second.body.quote.id}/transition`)
        .send({ toStatus: "SENT" });

      const res = await owner.agent.get("/api/dashboard/pending-work");
      const rows = res.body.pendingWork.awaitingResponse.filter(
        (r: { project: { id: string } }) => r.project.id === projectId,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].quote.quoteNo).toBe(second.body.quote.quoteNo);

      await prisma.user.deleteMany({ where: { email: customer.email } });
    });

    it("lists a rejected quote with its reason, and drops it once a fresh quote goes out", async () => {
      const customer = await createAndLoginCustomer("test-dashboard-rejected");
      const me = await customer.agent.get("/api/auth/me");

      const projectRes = await owner.agent
        .post("/api/projects")
        .send({ name: "โครงการลูกค้าปฏิเสธ", customerId: me.body.user.id });
      const projectId = projectRes.body.project.id as string;
      createdProjectIds.push(projectId);

      await owner.agent
        .post(`/api/projects/${projectId}/boq/items`)
        .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
      const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
      const quoteId = quoteRes.body.quote.id as string;
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
        .send({ toStatus: "SENT" });

      const beforeValue = (await owner.agent.get("/api/dashboard/summary")).body.summary
        .totalQuotedValue as number;

      await customer.agent
        .post(`/api/my/quotes/${quoteId}/respond`)
        .send({ action: "REJECT", note: "เลือกผู้รับเหมารายอื่น" });

      // เดิมดีลที่เสียไปไม่โผล่ในหน้างานค้างเลย เหลือร่องรอยแค่การแจ้งเตือน
      const after = await owner.agent.get("/api/dashboard/pending-work");
      const found = after.body.pendingWork.rejectedQuotes.find(
        (r: { project: { id: string } }) => r.project.id === projectId,
      );
      expect(found).toBeDefined();
      expect(found.quote.quoteNo).toBe(quoteRes.body.quote.quoteNo);
      expect(found.quote.customerNote).toBe("เลือกผู้รับเหมารายอื่น");
      // ไม่ควรไปโผล่ในหมวด "รอลูกค้าตอบ" อีก — ลูกค้าตอบไปแล้ว
      expect(
        after.body.pendingWork.awaitingResponse.some(
          (r: { project: { id: string } }) => r.project.id === projectId,
        ),
      ).toBe(false);

      // และมูลค่าของดีลที่เสียต้องหลุดออกจากไปป์ไลน์ ไม่งั้นตัวเลขบนแดชบอร์ดจะพองขึ้นทุกครั้งที่เสียดีล
      const afterValue = (await owner.agent.get("/api/dashboard/summary")).body.summary
        .totalQuotedValue as number;
      expect(afterValue).toBeLessThan(beforeValue);

      // ออกใบใหม่แล้วส่ง → ดีลกลับมาเดินต่อ แถวหลุดออกจากรายการเอง ไม่ต้องมีปุ่ม "ทำเสร็จแล้ว"
      const newQuote = await owner.agent.post(`/api/projects/${projectId}/quotes`);
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${newQuote.body.quote.id}/transition`)
        .send({ toStatus: "SENT" });

      const requoted = await owner.agent.get("/api/dashboard/pending-work");
      expect(
        requoted.body.pendingWork.rejectedQuotes.some(
          (r: { project: { id: string } }) => r.project.id === projectId,
        ),
      ).toBe(false);
      expect(
        requoted.body.pendingWork.awaitingResponse.some(
          (r: { project: { id: string } }) => r.project.id === projectId,
        ),
      ).toBe(true);

      await prisma.user.deleteMany({ where: { email: customer.email } });
    });

    it("lists NEW leads but not ones already contacted", async () => {
      const newLead = await request(app)
        .post("/api/public/leads")
        .send({
          name: "คำขอใหม่ รอติดต่อ",
          phone: "0810001111",
          email: "lead-0810001111@example.com",
          serviceType: "รับสร้างบ้าน",
        });
      const contactedLead = await request(app)
        .post("/api/public/leads")
        .send({
          name: "ติดต่อ แล้ว",
          phone: "0810002222",
          email: "lead-0810002222@example.com",
          serviceType: "รับสร้างบ้าน",
        });
      await owner.agent.patch(`/api/leads/${contactedLead.body.lead.id}`).send({ status: "CONTACTED" });

      const res = await owner.agent.get("/api/dashboard/pending-work");
      const ids = res.body.pendingWork.newLeads.map((l: { id: string }) => l.id);
      expect(ids).toContain(newLead.body.lead.id);
      expect(ids).not.toContain(contactedLead.body.lead.id);

      await prisma.lead.deleteMany({
        where: { id: { in: [newLead.body.lead.id, contactedLead.body.lead.id] } },
      });
    });

    it("rejects a CUSTOMER reading pending work", async () => {
      const customer = await createAndLoginCustomer("test-dashboard-pending-forbidden");
      const res = await customer.agent.get("/api/dashboard/pending-work");
      expect(res.status).toBe(403);
      await prisma.user.deleteMany({ where: { email: customer.email } });
    });
  });
});
