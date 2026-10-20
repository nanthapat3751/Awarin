import { todayIso } from "../../src/lib/business-date";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

/**
 * ยอดผูกพัน + สาเหตุเกินงบ + รอออก VO
 *
 * เฝ้า: เซิร์ฟเวอร์บังคับสาเหตุเองเมื่อดันหมวดเกินงบ (ไม่เชื่อหน้าจอ) · บิลตามยอดผูกพันไม่นับซ้ำ
 * · ลบยอดที่มีบิลผูกไม่ได้ · ลูกค้าขอเปลี่ยน = ค้างรอออก VO จนผูกใบ · ไม่เก็บเงินลูกค้าได้เฉพาะเจ้าของ
 */
describe("ยอดผูกพันและสาเหตุเกินงบ", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let topCategoryId: string;
  let otherTopId: string;
  let projectId: string;
  let changeOrderId: string;
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const projectIds: string[] = [];

  const url = (suffix = "") => `/api/projects/${projectId}/costs${suffix}`;
  const money = (over: Record<string, unknown> = {}) => ({
    categoryId: topCategoryId,
    costType: "MATERIAL",
    description: "เหล็กเส้น",
    vendor: "ร้านเหล็กทดสอบ",
    amount: 10_000,
    vatAmount: 0,
    ...over,
  });
  const bill = (over: Record<string, unknown> = {}) => ({ spentOn: todayIso(), ...money(over) });
  const order = (over: Record<string, unknown> = {}) => ({ committedOn: todayIso(), ...money(over) });
  const rowOf = (body: { rows: { categoryId: string | null; kind: string }[] }, id = topCategoryId) =>
    body.rows.find((r) => r.kind === "category" && r.categoryId === id) as unknown as {
      budget: number;
      actual: number;
      committed: number;
    };

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-commit-owner");
    admin = await createAndLoginAdmin("test-commit-admin");
    customer = await createCustomerDirect("test-commit-customer");
    userIds.push(owner.userId, admin.userId, customer.userId);

    const cat = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบยอดผูกพัน" });
    topCategoryId = cat.body.category.id;
    categoryIds.push(topCategoryId);
    const sub = await owner.agent.post("/api/categories").send({ level: "SUBGROUP", parentId: topCategoryId, name: "กลุ่มทดสอบยอดผูกพัน" });
    categoryIds.push(sub.body.category.id);
    const item = await owner.agent.post("/api/categories").send({ level: "ITEM", parentId: sub.body.category.id, name: "รายการทดสอบยอดผูกพัน" });
    categoryIds.push(item.body.category.id);
    const other = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบนอก BOQ" });
    otherTopId = other.body.category.id;
    categoryIds.push(otherTopId);
    await owner.agent.get("/api/contract-templates");

    const res = await owner.agent.post("/api/projects").send({ name: "[ชั่วคราว] ยอดผูกพัน", customerId: customer.userId });
    projectId = res.body.project.id;
    projectIds.push(projectId);
    // งบหมวด = 100,000
    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: item.body.category.id,
      name: "งานโครงสร้าง",
      quantity: 10,
      unit: "หน่วย",
      materialUnitPrice: 6_000,
      laborUnitPrice: 4_000,
    });

    // สัญญาที่ลงนาม + ใบงานเพิ่ม-ลดหนึ่งใบไว้ผูก (สร้างตรงในฐานข้อมูล — ขั้นตอนออกใบมีเทสต์ของมันเองแล้ว)
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);
    await owner.agent.post(`/api/projects/${projectId}/quotes/${quote.body.quote.id}/transition`).send({ toStatus: "ACCEPTED" });
    await owner.agent.post(`/api/projects/${projectId}/transition`).send({ toStatus: "APPROVED" });
    const contract = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
    await owner.agent.post(`/api/projects/${projectId}/contracts/${contract.body.contract.id}/sign`);
    // ค่าดำเนินการยังไม่แยกจากกำไร (ไม่ขึ้นกับค่าตั้งในฐานข้อมูลทดสอบ) → แถวค่าดำเนินการไม่มีงบให้เทียบ
    await prisma.projectVersion.updateMany({ where: { projectId }, data: { overheadPct: null } });
    const version = await prisma.projectVersion.findFirstOrThrow({ where: { projectId, versionNo: 1 } });
    const co = await prisma.changeOrder.create({
      data: {
        contractId: contract.body.contract.id,
        projectId,
        seq: 1,
        docNo: `VO-TEST-${Date.now()}`,
        title: "ลูกค้าขอเพิ่มห้องเก็บของ",
        fromVersionId: version.id,
        toVersionId: version.id,
        lines: [],
        addAmount: 0,
        deductAmount: 0,
        adjustAmount: 0,
        netBeforeVat: 0,
        vatAmount: 0,
        totalAmount: 0,
      },
    });
    changeOrderId = co.id;
  });

  afterAll(async () => {
    await prisma.projectCost.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectCommitment.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.changeOrder.deleteMany({ where: { projectId: { in: projectIds } } });
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

  it("บันทึกยอดสั่ง → ขึ้นช่องผูกพัน ไม่ขึ้นใช้จริง", async () => {
    const res = await admin.agent.post(url("/commitments")).send(order({ amount: 60_000, reference: "PO-001" }));
    expect(res.status).toBe(200);
    expect(rowOf(res.body)).toMatchObject({ budget: 100_000, actual: 0, committed: 60_000 });
    expect(res.body.totals).toMatchObject({ actual: 0, committed: 60_000 });
    expect(res.body.commitments[0]).toMatchObject({ status: "OPEN", paid: 0, remaining: 60_000, billCount: 0, overrun: null });
  });

  it("บิลที่จ่ายตามยอดสั่ง: ย้ายจากผูกพันไปใช้จริง ไม่นับซ้ำ · ต้องอยู่หมวดเดียวกัน", async () => {
    const report = (await admin.agent.get(url())).body;
    const k = report.commitments[0];
    expect((await admin.agent.post(url()).send(bill({ commitmentId: k.id, categoryId: otherTopId }))).status).toBe(400);

    const res = await admin.agent.post(url()).send(bill({ commitmentId: k.id, amount: 25_000 }));
    expect(res.status).toBe(200);
    expect(rowOf(res.body)).toMatchObject({ actual: 25_000, committed: 35_000 });
    expect(res.body.commitments[0]).toMatchObject({ paid: 25_000, remaining: 35_000, billCount: 1 });
    expect(res.body.costs[0]).toMatchObject({ commitmentId: k.id, commitmentLabel: "เหล็กเส้น · ร้านเหล็กทดสอบ" });
  });

  it("ดันหมวดเกินงบ (รวมยอดผูกพัน) โดยไม่ระบุสาเหตุ → เซิร์ฟเวอร์ปฏิเสธพร้อม code · ระบุแล้วผ่าน", async () => {
    // ยอดเปิดรับตอนนี้ 60,000 · บิลนอกยอดสั่ง 45,000 → 105,000 เกิน 5,000
    const missing = await admin.agent.post(url()).send(bill({ amount: 45_000, description: "ปูนเพิ่ม" }));
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("OVERRUN_REASON_REQUIRED");
    expect(missing.body.error).toContain("5,000.00");

    const other = await admin.agent.post(url()).send(bill({ amount: 45_000, overrunReason: "OTHER" }));
    expect(other.status).toBe(400);

    const ok = await admin.agent.post(url()).send(bill({ amount: 45_000, description: "ปูนเพิ่ม", overrunReason: "PRICE_INCREASE" }));
    expect(ok.status).toBe(200);
    const saved = ok.body.costs.find((c: { description: string }) => c.description === "ปูนเพิ่ม");
    expect(saved.overrun).toMatchObject({ reason: "PRICE_INCREASE", voPending: false });
    expect(ok.body.voPending).toEqual({ count: 0, amount: 0 });
  });

  it("บิลตามยอดสั่งที่อยู่ในยอด ไม่ต้องระบุสาเหตุแม้หมวดเกินงบแล้ว · จ่ายเกินยอดที่สั่ง ต้องระบุ", async () => {
    const k = (await admin.agent.get(url())).body.commitments[0];
    const inside = await admin.agent.post(url()).send(bill({ commitmentId: k.id, amount: 30_000 }));
    expect(inside.status).toBe(200);
    // คงค้าง 5,000 · จ่าย 8,000 = เกินยอดสั่ง 3,000
    const beyond = await admin.agent.post(url()).send(bill({ commitmentId: k.id, amount: 8_000 }));
    expect(beyond.status).toBe(400);
    expect(beyond.body.code).toBe("OVERRUN_REASON_REQUIRED");
    expect(beyond.body.error).toContain("3,000.00");
  });

  it("ลูกค้าขอเปลี่ยน → ค้างรอออก VO · ผูกใบงานเพิ่ม-ลดแล้วหาย", async () => {
    const res = await admin.agent
      .post(url("/commitments"))
      .send(order({ description: "ห้องเก็บของเพิ่ม", amount: 20_000, overrunReason: "CUSTOMER_CHANGE" }));
    expect(res.status).toBe(200);
    expect(res.body.voPending).toEqual({ count: 1, amount: 20_000 });
    expect(res.body.changeOrders.map((c: { id: string }) => c.id)).toContain(changeOrderId);
    const k = res.body.commitments.find((c: { description: string }) => c.description === "ห้องเก็บของเพิ่ม");
    expect(k.overrun).toMatchObject({ reason: "CUSTOMER_CHANGE", voPending: true, changeOrder: null });

    const linked = await admin.agent.patch(url(`/commitments/${k.id}/vo`)).send({ changeOrderId });
    expect(linked.status).toBe(200);
    expect(linked.body.voPending.count).toBe(0);
    expect(linked.body.commitments.find((c: { id: string }) => c.id === k.id).overrun.changeOrder).toMatchObject({ id: changeOrderId });

    // ใบถูกยกเลิกภายหลัง → กลับมาค้างรอออก VO (เก็บเงินจากใบนั้นไม่ได้แล้ว)
    await prisma.changeOrder.update({ where: { id: changeOrderId }, data: { status: "CANCELLED" } });
    expect((await admin.agent.get(url())).body.voPending.count).toBe(1);
    await prisma.changeOrder.update({ where: { id: changeOrderId }, data: { status: "DRAFT" } });
  });

  it("ไม่เก็บเงินลูกค้า (บริษัทรับเอง) ได้เฉพาะเจ้าของ · ใช้กับรายการที่ไม่ใช่ลูกค้าขอเปลี่ยนไม่ได้", async () => {
    const res = await admin.agent
      .post(url())
      .send(bill({ description: "ลูกค้าขอเปลี่ยนก๊อก", amount: 1_000, overrunReason: "CUSTOMER_CHANGE" }));
    const c = res.body.costs.find((x: { description: string }) => x.description === "ลูกค้าขอเปลี่ยนก๊อก");
    expect(c.overrun.voPending).toBe(true);
    expect((await admin.agent.patch(url(`/${c.id}/vo`)).send({ waived: true })).status).toBe(403);
    const waived = await owner.agent.patch(url(`/${c.id}/vo`)).send({ waived: true });
    expect(waived.status).toBe(200);
    expect(waived.body.costs.find((x: { id: string }) => x.id === c.id).overrun).toMatchObject({ voWaived: true, voPending: false });

    const price = res.body.costs.find((x: { description: string }) => x.description === "ปูนเพิ่ม");
    expect((await owner.agent.patch(url(`/${price.id}/vo`)).send({ waived: true })).status).toBe(400);
    const log = await prisma.auditLog.findFirst({ where: { action: "RESOLVE_COST_VO", entityId: projectId, userId: owner.userId } });
    expect(log?.details).toMatchObject({ costId: c.id, voWaived: true });
  });

  it("หมวดที่ไม่มีใน BOQ: บาทแรกก็ต้องระบุสาเหตุ · ค่าดำเนินการที่ยังไม่แยกงบไม่ตรวจ", async () => {
    expect((await admin.agent.post(url()).send(bill({ categoryId: otherTopId, amount: 100 }))).body.code).toBe("OVERRUN_REASON_REQUIRED");
    const overhead = await admin.agent.post(url()).send(bill({ categoryId: null, costType: "OVERHEAD", amount: 99_999 }));
    expect(overhead.status).toBe(200);
  });

  it("ลบยอดที่มีบิลผูกไม่ได้ → ปิดยอดแทน (คงค้างเลิกนับ) · เปิดใหม่ได้ · ยอดที่ไม่มีบิลลบได้", async () => {
    const report = (await admin.agent.get(url())).body;
    const steel = report.commitments.find((c: { reference: string | null }) => c.reference === "PO-001");
    expect((await admin.agent.delete(url(`/commitments/${steel.id}`))).status).toBe(409);
    // ย้ายหมวดยอดที่มีบิลผูกไม่ได้
    expect((await admin.agent.patch(url(`/commitments/${steel.id}`)).send(order({ categoryId: otherTopId, amount: 60_000 }))).status).toBe(409);

    const closed = await admin.agent.post(url(`/commitments/${steel.id}/status`)).send({ status: "CLOSED" });
    expect(closed.status).toBe(200);
    expect(closed.body.commitments.find((c: { id: string }) => c.id === steel.id)).toMatchObject({ status: "CLOSED", remaining: 0 });
    // ปิดยอดแล้ว ผูกบิลใหม่ไม่ได้
    expect((await admin.agent.post(url()).send(bill({ commitmentId: steel.id, amount: 1 }))).status).toBe(400);
    const reopened = await admin.agent.post(url(`/commitments/${steel.id}/status`)).send({ status: "OPEN" });
    expect(reopened.body.commitments.find((c: { id: string }) => c.id === steel.id).status).toBe("OPEN");

    const temp = await admin.agent.post(url("/commitments")).send(order({ categoryId: null, costType: "OVERHEAD", amount: 500, description: "ค่ารถ" }));
    const tempId = temp.body.commitments.find((c: { description: string }) => c.description === "ค่ารถ").id;
    const removed = await admin.agent.delete(url(`/commitments/${tempId}`));
    expect(removed.status).toBe(200);
    expect(removed.body.commitments.some((c: { id: string }) => c.id === tempId)).toBe(false);
  });

  it("แก้/ลบยอดผูกพันได้เฉพาะคนบันทึกหรือเจ้าของ · ลูกค้าเข้าไม่ได้", async () => {
    const own = await owner.agent.post(url("/commitments")).send(order({ categoryId: null, costType: "OVERHEAD", amount: 300, description: "ของเจ้าของ" }));
    const id = own.body.commitments.find((c: { description: string }) => c.description === "ของเจ้าของ").id;
    expect((await admin.agent.delete(url(`/commitments/${id}`))).status).toBe(403);
    expect((await admin.agent.post(url(`/commitments/${id}/status`)).send({ status: "CLOSED" })).status).toBe(403);
    expect((await customer.agent.post(url("/commitments")).send(order())).status).toBe(403);
  });
});
