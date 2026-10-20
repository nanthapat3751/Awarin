import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { todayIso } from "../../src/lib/business-date";
import { createAndLoginCustomer, createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";

import type { DashboardPipelineDto, PipelineStageKey } from "@systemboq/shared-types";
import { sendQuote } from "../helpers/quote-send";

/** ขั้นของท่อขายตามคีย์ — เทสต์อ่านค่าที่สนใจได้โดยไม่ผูกกับลำดับในอาร์เรย์ */
const stage = (pipeline: DashboardPipelineDto, key: PipelineStageKey) =>
  pipeline.stages.find((s) => s.key === key)!;

const isoDaysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

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
    // สัญญาต้องไปก่อนโครงการ (FK) — งวดและรายการรับเงินหายตาม CASCADE ของสัญญา
    await prisma.contract.deleteMany({ where: { projectId: { in: createdProjectIds } } });
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
    await sendQuote(owner.agent, projectId, quoteRes.body.quote.id);

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
    await sendQuote(owner.agent, projectId, quoteRes.body.quote.id);

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

    await sendQuote(owner.agent, projectId, quoteId);

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
      await sendQuote(owner.agent, projectId, quoteId);
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
      await sendQuote(owner.agent, projectId, firstQuoteRes.body.quote.id);
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
      await sendQuote(owner.agent, projectId, quoteId);
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
      await sendQuote(owner.agent, projectId, quoteId);

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
      await sendQuote(owner.agent, projectId, first.body.quote.id);
      // ออกใบใหม่ทับ แล้วส่งอีกครั้ง -- ใบเก่ายังค้างสถานะ SENT (state machine ไม่ปิดให้)
      const second = await owner.agent.post(`/api/projects/${projectId}/quotes`);
      await sendQuote(owner.agent, projectId, second.body.quote.id);

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
      await sendQuote(owner.agent, projectId, quoteId);

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
      await sendQuote(owner.agent, projectId, newQuote.body.quote.id);

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

  /** โครงการที่อนุมัติแล้ว + ออกสัญญา (ยังไม่เซ็น) — มูลค่าสัญญาถูกตรึงจากใบที่ลูกค้ายอมรับ */
  async function contractForCash(name: string) {
    const res = await owner.agent.post("/api/projects").send({ name, siteAddress: "ที่ตั้งทดสอบ" });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);

    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "รายการทดสอบกระดานเงิน",
      quantity: 10,
      unit: "หน่วย",
      materialUnitPrice: 60_000,
      laborUnitPrice: 40_000,
    });
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    const quoteId = quote.body.quote.id as string;
    await sendQuote(owner.agent, projectId, quoteId);
    await owner.agent
      .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
      .send({ toStatus: "ACCEPTED" });
    await owner.agent.post(`/api/projects/${projectId}/transition`).send({ toStatus: "APPROVED" });

    const contract = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
    return { projectId, contractId: contract.body.contract.id as string };
  }

  async function signedContractForCash(name: string) {
    const made = await contractForCash(name);
    await owner.agent.post(`/api/projects/${made.projectId}/contracts/${made.contractId}/sign`);
    return made;
  }

  // ── ท่อขาย + กระดานเงินตามสัญญา (แดชบอร์ดใหม่) ──
  describe("pipeline", () => {
    it("ย้ายโครงการจากขั้น 'เสนอราคาแล้ว' ไป 'ลูกค้ายอมรับ' พร้อมมูลค่า", async () => {
      const projectRes = await owner.agent.post("/api/projects").send({ name: "ท่อขาย-เสนอราคา" });
      const projectId = projectRes.body.project.id as string;
      createdProjectIds.push(projectId);
      await owner.agent
        .post(`/api/projects/${projectId}/boq/items`)
        .send({ categoryId: itemCategoryId, materialId, quantity: 2 });
      const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`);
      await sendQuote(owner.agent, projectId, quote.body.quote.id);

      const quoted = await owner.agent.get("/api/dashboard/pipeline");
      const quotedStage = stage(quoted.body.pipeline, "quoted");
      const acceptedStage = stage(quoted.body.pipeline, "accepted");
      expect(quotedStage.count).toBeGreaterThanOrEqual(1);
      expect(quotedStage.value).toBeGreaterThan(0);

      // ลูกค้ายอมรับใบเสนอราคา = โครงการขยับเป็น APPROVED ให้เอง (ไม่มีปุ่มสั่งตรง ๆ)
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${quote.body.quote.id}/transition`)
        .send({ toStatus: "ACCEPTED" });

      const approved = await owner.agent.get("/api/dashboard/pipeline");
      // งานย้ายขั้นจริง: ขั้นก่อนลดลงหนึ่ง ขั้นถัดไปเพิ่มหนึ่ง และมูลค่าย้ายตามไปด้วย
      expect(stage(approved.body.pipeline, "quoted").count).toBe(quotedStage.count - 1);
      expect(stage(approved.body.pipeline, "quoted").value).toBeLessThan(quotedStage.value as number);
      expect(stage(approved.body.pipeline, "accepted").count).toBe(acceptedStage.count + 1);
      expect(stage(approved.body.pipeline, "accepted").value!).toBeGreaterThan(
        (acceptedStage.value ?? 0),
      );
    });

    it("โครงการที่ยกเลิกออกจากท่อและไปโผล่ในกลุ่มที่เสียไป", async () => {
      const projectRes = await owner.agent.post("/api/projects").send({ name: "ท่อขาย-ยกเลิก" });
      const projectId = projectRes.body.project.id as string;
      createdProjectIds.push(projectId);
      await owner.agent
        .post(`/api/projects/${projectId}/boq/items`)
        .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
      const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`);
      await sendQuote(owner.agent, projectId, quote.body.quote.id);

      const before = await owner.agent.get("/api/dashboard/pipeline");
      const beforeQuoted = stage(before.body.pipeline, "quoted");

      await owner.agent.post(`/api/projects/${projectId}/transition`).send({ toStatus: "CANCELLED" });

      const after = await owner.agent.get("/api/dashboard/pipeline");
      expect(stage(after.body.pipeline, "quoted").count).toBe(beforeQuoted.count - 1);
      // มูลค่าของงานที่ยกเลิกต้องหายออกจากท่อ ไม่ค้างอยู่ให้ดูเหมือนยังลุ้นได้
      expect(stage(after.body.pipeline, "quoted").value).toBeLessThan(beforeQuoted.value as number);
      expect(after.body.pipeline.lost.cancelledCount).toBe(before.body.pipeline.lost.cancelledCount + 1);
    });

    it("ไม่มีขั้นลงนามสัญญาแยก — เหลือ 4 ขั้น (ลงนามแล้วยังเป็น APPROVED นับในลูกค้ายอมรับ)", async () => {
      const res = await owner.agent.get("/api/dashboard/pipeline");
      expect(res.body.pipeline.stages.map((s: { key: string }) => s.key)).toEqual(["lead", "quoted", "accepted", "completed"]);
    });

    it("นับใบเสนอราคาที่ส่งไปเกิน 14 วันแล้วลูกค้ายังไม่ตอบเป็น 'รอนาน' ในขั้นเสนอราคา", async () => {
      const projectRes = await owner.agent.post("/api/projects").send({ name: "ท่อขาย-รอนาน" });
      const projectId = projectRes.body.project.id as string;
      createdProjectIds.push(projectId);
      await owner.agent
        .post(`/api/projects/${projectId}/boq/items`)
        .send({ categoryId: itemCategoryId, materialId, quantity: 1 });
      const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`);
      await sendQuote(owner.agent, projectId, quote.body.quote.id);

      const fresh = await owner.agent.get("/api/dashboard/pipeline");
      const before = stage(fresh.body.pipeline, "quoted").staleCount;

      // ส่งไปเมื่อ 15 วันก่อน → นับ · ขั้นอื่นไม่มีตัวนับนี้
      await prisma.quote.update({
        where: { id: quote.body.quote.id },
        data: { sentAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) },
      });
      const stale = await owner.agent.get("/api/dashboard/pipeline");
      expect(stage(stale.body.pipeline, "quoted").staleCount).toBe(before + 1);
      expect(stage(stale.body.pipeline, "lead").staleCount).toBe(0);
      expect(stage(stale.body.pipeline, "accepted").staleCount).toBe(0);

      // ลูกค้าตอบแล้ว (ยอมรับ) → ออกจากขั้นเสนอราคา ไม่นับรอนานอีก
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${quote.body.quote.id}/transition`)
        .send({ toStatus: "ACCEPTED" });
      const answered = await owner.agent.get("/api/dashboard/pipeline");
      expect(stage(answered.body.pipeline, "quoted").staleCount).toBe(before);
    });

    it("ขั้นคำขอไม่มีมูลค่า (null ไม่ใช่ 0)", async () => {
      const res = await owner.agent.get("/api/dashboard/pipeline");
      expect(stage(res.body.pipeline, "lead").value).toBeNull();
    });

    it("ห้ามลูกค้าเปิดดูท่อขาย", async () => {
      const customer = await createCustomerDirect("test-dashboard-pipeline-role");
      createdUserIds.push(customer.userId);
      const res = await customer.agent.get("/api/dashboard/pipeline");
      expect(res.status).toBe(403);
    });
  });

  describe("pending work — สัญญา/งวด", () => {
    it("สัญญาที่ยังไม่ลงนามขึ้นในงานค้าง (โครงการละแถว) แล้วย้ายไปหมวดงวดไม่มีวันเมื่อลงนาม", async () => {
      const { projectId, contractId } = await contractForCash("งานค้าง-สัญญา");

      const before = await owner.agent.get("/api/dashboard/pending-work");
      const unsigned = before.body.pendingWork.unsignedContracts.find(
        (g: { project: { id: string } }) => g.project.id === projectId,
      );
      expect(unsigned).toBeDefined();
      expect(unsigned.contracts.map((c: { id: string }) => c.id)).toContain(contractId);
      // ยังไม่ลงนาม = ยังไม่อยู่หมวดงวด (รับเงินไม่ได้อยู่แล้ว ไม่ต้องเตือนตั้งวัน)
      expect(
        before.body.pendingWork.missingDueDates.some((r: { contract: { id: string } }) => r.contract.id === contractId),
      ).toBe(false);

      await owner.agent.post(`/api/projects/${projectId}/contracts/${contractId}/sign`);
      const signed = await owner.agent.get("/api/dashboard/pending-work");
      expect(
        signed.body.pendingWork.unsignedContracts.some((g: { project: { id: string } }) => g.project.id === projectId),
      ).toBe(false);
      const missing = signed.body.pendingWork.missingDueDates.find(
        (r: { contract: { id: string } }) => r.contract.id === contractId,
      );
      expect(missing).toBeDefined();
      expect(missing.missingCount).toBe(7);
      expect(missing.installmentCount).toBe(7);
      expect(missing.remaining).toBeGreaterThan(0);

      // ออกสัญญาฉบับสำรองเพิ่มหลังลงนามไปแล้ว → ไม่ใช่งานค้าง (เซ็นฉบับหนึ่งไปแล้ว ที่เหลือคือของที่ไม่ได้ใช้)
      await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
      const spare = await owner.agent.get("/api/dashboard/pending-work");
      expect(
        spare.body.pendingWork.unsignedContracts.some((g: { project: { id: string } }) => g.project.id === projectId),
      ).toBe(false);

      // ตั้งวันครบทุกงวดแล้ว → หลุดจากหมวด
      await prisma.contractInstallment.updateMany({ where: { contractId }, data: { dueOn: new Date("2099-01-01") } });
      const dated = await owner.agent.get("/api/dashboard/pending-work");
      expect(
        dated.body.pendingWork.missingDueDates.some((r: { contract: { id: string } }) => r.contract.id === contractId),
      ).toBe(false);
    });
  });

  describe("pending work — คำขอที่ติดต่อแล้ว / VO", () => {
    it("คำขอที่ติดต่อแล้วแต่ยังไม่เสนอราคาขึ้นในงานค้าง และหายเมื่อไม่ใช่ CONTACTED แล้ว", async () => {
      const lead = await prisma.lead.create({
        data: { name: "งานค้าง-คำขอติดต่อแล้ว", phone: "0800000000", serviceType: "ก่อสร้าง", status: "CONTACTED" },
      });
      try {
        const res = await owner.agent.get("/api/dashboard/pending-work");
        const row = res.body.pendingWork.contactedLeads.find((r: { lead: { id: string } }) => r.lead.id === lead.id);
        expect(row).toBeDefined();
        expect(row.project).toBeNull();
        expect(typeof row.lastActivityAt).toBe("string");

        await prisma.lead.update({ where: { id: lead.id }, data: { status: "QUOTED" } });
        const after = await owner.agent.get("/api/dashboard/pending-work");
        expect(after.body.pendingWork.contactedLeads.some((r: { lead: { id: string } }) => r.lead.id === lead.id)).toBe(false);
      } finally {
        await prisma.lead.delete({ where: { id: lead.id } });
      }
    });

    it("คำขอติดต่อแล้วที่มีโครงการ: ขึ้นเฉพาะตอนโครงการยังเป็นร่าง (โครงการเดินต่อแล้ว = ไม่ใช่งานค้างของคำขอ)", async () => {
      const projectRes = await owner.agent.post("/api/projects").send({ name: "งานค้าง-คำขอมีโครงการ" });
      const projectId = projectRes.body.project.id as string;
      createdProjectIds.push(projectId);
      const lead = await prisma.lead.create({
        data: { name: "งานค้าง-คำขอมีโครงการ", phone: "0800000001", serviceType: "ก่อสร้าง", status: "CONTACTED" },
      });
      try {
        await prisma.project.update({ where: { id: projectId }, data: { leadId: lead.id } });
        const draft = await owner.agent.get("/api/dashboard/pending-work");
        const row = draft.body.pendingWork.contactedLeads.find((r: { lead: { id: string } }) => r.lead.id === lead.id);
        expect(row?.project?.id).toBe(projectId);

        // ข้อมูลรุ่นเก่า: คำขอค้าง CONTACTED แต่โครงการไปไกลแล้ว → ไม่นับ
        await prisma.project.update({ where: { id: projectId }, data: { status: "CANCELLED" } });
        const moved = await owner.agent.get("/api/dashboard/pending-work");
        expect(moved.body.pendingWork.contactedLeads.some((r: { lead: { id: string } }) => r.lead.id === lead.id)).toBe(false);
      } finally {
        await prisma.project.update({ where: { id: projectId }, data: { leadId: null } });
        await prisma.lead.delete({ where: { id: lead.id } });
      }
    });

    it("ใบงานเพิ่ม-ลดที่ส่งลูกค้าแล้วขึ้นในงานค้าง ร่าง/อนุมัติแล้วไม่ขึ้น", async () => {
      const { projectId, contractId } = await signedContractForCash("งานค้าง-VO");
      const version = await prisma.projectVersion.findFirstOrThrow({ where: { projectId } });
      const vo = await prisma.changeOrder.create({
        data: {
          contractId,
          projectId,
          seq: 1,
          docNo: `VO-TEST-${Date.now()}`,
          status: "SENT",
          title: "เพิ่มห้องเก็บของ",
          fromVersionId: version.id,
          toVersionId: version.id,
          lines: [],
          addAmount: 1000,
          deductAmount: 0,
          adjustAmount: 0,
          netBeforeVat: 1000,
          vatAmount: 70,
          totalAmount: 1070,
          sentAt: new Date(),
        },
      });
      const res = await owner.agent.get("/api/dashboard/pending-work");
      const row = res.body.pendingWork.awaitingChangeOrders.find(
        (r: { changeOrder: { id: string } }) => r.changeOrder.id === vo.id,
      );
      expect(row).toBeDefined();
      expect(Number(row.changeOrder.totalAmount)).toBe(1070);

      await prisma.changeOrder.update({ where: { id: vo.id }, data: { status: "APPROVED" } });
      const after = await owner.agent.get("/api/dashboard/pending-work");
      expect(
        after.body.pendingWork.awaitingChangeOrders.some((r: { changeOrder: { id: string } }) => r.changeOrder.id === vo.id),
      ).toBe(false);
    });

  });

  describe("contract cash", () => {
    it("สัญญาที่ลงนามแล้วขึ้นกระดานเงินพร้อมจำนวนงวดที่ยังไม่ตั้งกำหนดชำระ", async () => {
      const { projectId, contractId } = await signedContractForCash("กระดานเงิน-ลงนาม");

      const res = await owner.agent.get("/api/dashboard/contract-cash");
      const row = res.body.cash.rows.find(
        (r: { contract: { id: string } }) => r.contract.id === contractId,
      );
      expect(row).toBeDefined();
      expect(row.project.id).toBe(projectId);
      expect(row.amount).toBeGreaterThan(0);
      expect(row.installmentCount).toBe(7);
      // ตั้งกำหนดชำระเป็นงานที่พนักงานต้องกดเอง ระบบไม่เดาให้ — ตอนเพิ่งลงนามจึงยังไม่มีสักงวด
      expect(row.installmentsWithoutDueDate).toBe(7);
      expect(row.paidAmount).toBe(0);
      expect(row.remaining).toBeCloseTo(row.amount, 2);
      expect(row.overdueCount).toBe(0);
    });

    it("รับเงินแล้วยอดคงเหลือลด และเงินเข้าบัญชีจริงต่างจากยอดที่ถือว่าชำระเมื่อมีหัก ณ ที่จ่าย", async () => {
      const { projectId, contractId } = await signedContractForCash("กระดานเงิน-รับเงิน");
      const view = await owner.agent.get(`/api/projects/${projectId}/contracts/${contractId}/payments`);
      const first = view.body.installments[0];

      await owner.agent
        .post(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/payments`)
        .send({ paidOn: todayIso(), amount: Number(first.amount), withholdingAmount: 100 });

      const res = await owner.agent.get("/api/dashboard/contract-cash");
      const row = res.body.cash.rows.find(
        (r: { contract: { id: string } }) => r.contract.id === contractId,
      );
      expect(row.paidAmount).toBeCloseTo(Number(first.amount), 2);
      expect(row.receivedAmount).toBeCloseTo(Number(first.amount) - 100, 2);
      expect(row.remaining).toBeCloseTo(row.amount - Number(first.amount), 2);
      // งวดที่รับครบแล้วไม่นับว่า "ยังไม่ตั้งกำหนด" อีก
      expect(row.installmentsWithoutDueDate).toBe(6);
    });

    it("งวดที่เลยกำหนดและยังไม่ได้เงิน ขึ้นเป็นยอดค้างของสัญญานั้น", async () => {
      const { projectId, contractId } = await signedContractForCash("กระดานเงิน-ค้างชำระ");
      const view = await owner.agent.get(`/api/projects/${projectId}/contracts/${contractId}/payments`);
      const first = view.body.installments[0];
      await owner.agent
        .patch(`/api/projects/${projectId}/contracts/${contractId}/installments/${first.id}/due`)
        .send({ dueOn: isoDaysAgo(9) });

      const res = await owner.agent.get("/api/dashboard/contract-cash");
      const row = res.body.cash.rows.find(
        (r: { contract: { id: string } }) => r.contract.id === contractId,
      );
      expect(row.overdueCount).toBe(1);
      expect(row.overdueAmount).toBeCloseTo(Number(first.amount), 2);
      expect(row.installmentsWithoutDueDate).toBe(6);
    });

    it("สัญญาที่ยังไม่ลงนามอยู่คนละก้อน ไม่ปนกับยอดที่เก็บเงินได้", async () => {
      const { projectId, contractId } = await contractForCash("กระดานเงิน-ยังไม่เซ็น");

      const res = await owner.agent.get("/api/dashboard/contract-cash");
      expect(
        res.body.cash.rows.some((r: { contract: { id: string } }) => r.contract.id === contractId),
      ).toBe(false);
      const pending = res.body.cash.unsignedContracts.find(
        (c: { id: string }) => c.id === contractId,
      );
      expect(pending).toBeDefined();
      expect(pending.projectId).toBe(projectId);
    });

    it("ห้ามลูกค้าเปิดดูกระดานเงิน", async () => {
      const customer = await createCustomerDirect("test-dashboard-cash-role");
      createdUserIds.push(customer.userId);
      const res = await customer.agent.get("/api/dashboard/contract-cash");
      expect(res.status).toBe(403);
    });
  });

});
