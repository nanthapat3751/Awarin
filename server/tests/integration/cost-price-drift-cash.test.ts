import { todayIso } from "../../src/lib/business-date";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

/**
 * แท็บต้นทุนจริง: ราคาในคลังเปลี่ยนหลังเซ็นสัญญา (D) + เงินสดของโครงการ (E) + หน้างานที่รอดำเนินการ
 *
 * เฝ้า: นับเฉพาะราคาที่เปลี่ยน "หลังเซ็น" · ส่วนต่าง = จำนวน × ส่วนต่างต่อหน่วย · ซื้อแล้ว = ไม่นับ จนราคาคลังขยับอีกรอบ
 * · เงินเข้าหักภาษี ณ ที่จ่าย/เงินประกันที่ถูกกัน · เงินออกรวม VAT · ติดลบขึ้นหน้างานที่รอดำเนินการ
 */
describe("ราคาคลังขึ้นหลังเซ็น + เงินสดของโครงการ", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let topCategoryId: string;
  let itemCategoryId: string;
  let steelId: string;
  let projectId: string;
  let contractBase: string;
  let installments: { id: string; seq: number; amount: string }[];
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const projectIds: string[] = [];

  const url = (suffix = "") => `/api/projects/${projectId}/costs${suffix}`;
  const setSteel = async (materialUnitPrice: number) =>
    expect((await owner.agent.patch(`/api/materials/${steelId}`).send({ materialUnitPrice })).status).toBe(200);

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-drift-owner");
    admin = await createAndLoginAdmin("test-drift-admin");
    customer = await createCustomerDirect("test-drift-customer");
    userIds.push(owner.userId, admin.userId, customer.userId);

    const cat = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบราคาหลังเซ็น" });
    topCategoryId = cat.body.category.id;
    const sub = await owner.agent.post("/api/categories").send({ level: "SUBGROUP", parentId: topCategoryId, name: "กลุ่มทดสอบราคาหลังเซ็น" });
    const item = await owner.agent.post("/api/categories").send({ level: "ITEM", parentId: sub.body.category.id, name: "รายการทดสอบราคาหลังเซ็น" });
    itemCategoryId = item.body.category.id;
    categoryIds.push(topCategoryId, sub.body.category.id, itemCategoryId);
    await owner.agent.get("/api/contract-templates");

    const mat = await owner.agent
      .post("/api/materials")
      .send({ categoryId: itemCategoryId, name: "เหล็กทดสอบราคาหลังเซ็น", unit: "กก.", materialUnitPrice: 25, laborUnitPrice: 5 });
    steelId = mat.body.material.id;

    const res = await owner.agent.post("/api/projects").send({ name: "[ชั่วคราว] ราคาหลังเซ็น", customerId: customer.userId });
    projectId = res.body.project.id;
    projectIds.push(projectId);
    // เหล็ก 1,000 กก. × (25 + 5) = 30,000
    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({ categoryId: itemCategoryId, materialId: steelId, quantity: 1000 });

    // ราคาเปลี่ยนก่อนเซ็น (แล้วเซ็นที่ราคาเดิม) — ห้ามนับหลังเซ็น
    await setSteel(26);
    await setSteel(25);

    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);
    await owner.agent.post(`/api/projects/${projectId}/quotes/${quote.body.quote.id}/transition`).send({ toStatus: "ACCEPTED" });
    await owner.agent.post(`/api/projects/${projectId}/transition`).send({ toStatus: "APPROVED" });
    const contract = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
    const contractId = contract.body.contract.id;
    await owner.agent.post(`/api/projects/${projectId}/contracts/${contractId}/sign`);
    contractBase = `/api/projects/${projectId}/contracts/${contractId}`;
    installments = (await owner.agent.get(`${contractBase}/installments`)).body.installments;
  });

  afterAll(async () => {
    await prisma.priceDriftAck.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectCost.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectCommitment.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.billingDocument.deleteMany({ where: { contract: { projectId: { in: projectIds } } } }).catch(() => undefined);
    await prisma.contract.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.material.deleteMany({ where: { id: steelId } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: [...categoryIds].reverse() } } });
    await prisma.$disconnect();
  });

  it("ราคาเปลี่ยนก่อนเซ็นไม่นับ · ยังไม่เปลี่ยนหลังเซ็น = ไม่มีบรรทัด", async () => {
    const res = await admin.agent.get(url());
    expect(res.status).toBe(200);
    expect(res.body.priceDrift).toMatchObject({ lines: [], increase: 0, decrease: 0 });
  });

  it("ราคาคลังขึ้นหลังเซ็น → ขึ้นบรรทัด ส่วนต่าง = จำนวน × ส่วนต่างต่อหน่วย · บอกหมวดของบรรทัด", async () => {
    await setSteel(27.5);
    const { priceDrift } = (await admin.agent.get(url())).body;
    expect(priceDrift.lines).toHaveLength(1);
    expect(priceDrift.lines[0]).toMatchObject({
      name: "เหล็กทดสอบราคาหลังเซ็น",
      categoryId: topCategoryId,
      from: { materialUnitPrice: 25, laborUnitPrice: 5 },
      to: { materialUnitPrice: 27.5, laborUnitPrice: 5 },
      delta: 2_500,
      acked: false,
    });
    expect(priceDrift.increase).toBe(2_500);
  });

  it("ซื้อแล้ว/ล็อกราคาแล้ว → ไม่นับ · ราคาคลังขยับอีกรอบ → เตือนใหม่ · ยกเลิกได้", async () => {
    const itemId = (await admin.agent.get(url())).body.priceDrift.lines[0].itemId;
    const acked = await admin.agent.post(url(`/price-drift/${itemId}/ack`));
    expect(acked.status).toBe(200);
    expect(acked.body.priceDrift).toMatchObject({ increase: 0, lines: [{ acked: true }] });

    await setSteel(28);
    const again = (await admin.agent.get(url())).body.priceDrift;
    expect(again.lines[0]).toMatchObject({ acked: false, delta: 3_000 });
    expect(again.increase).toBe(3_000);

    await admin.agent.post(url(`/price-drift/${itemId}/ack`));
    const undone = await admin.agent.delete(url(`/price-drift/${itemId}/ack`));
    expect(undone.body.priceDrift.lines[0].acked).toBe(false);
    // บรรทัดที่ไม่มีราคาเปลี่ยน กดซื้อแล้วไม่ได้
    expect((await admin.agent.post(url("/price-drift/not-a-line/ack"))).status).toBe(404);
  });

  it("เงินสด: รับ = ยอดงวด − ภาษีหัก − เงินประกันที่กัน · จ่าย = บิลรวม VAT · ผูกพันรวม VAT · งวดถัดไป", async () => {
    const empty = (await admin.agent.get(url())).body.cash;
    expect(empty).toMatchObject({ received: 0, paidOut: 0, net: 0, contractSigned: true });
    expect(empty.nextInstallment).toMatchObject({ seq: 1, outstanding: Number(installments[0].amount) });

    // งวดแรกต้องใหญ่กว่ายอดที่จ่าย ไม่งั้นงวดถัดไปเลื่อนเป็นงวด 2 (เทสต์นี้ดูงวดที่ยังค้างบางส่วน)
    expect(Number(installments[0].amount)).toBeGreaterThan(5_000);
    await prisma.installmentPayment.create({
      data: { installmentId: installments[0].id, paidOn: new Date(), amount: 5_000, withholdingAmount: 300, retentionAmount: 500 },
    });
    await admin.agent.post(url()).send({
      spentOn: todayIso(),
      categoryId: topCategoryId,
      costType: "MATERIAL",
      description: "เหล็กล็อตแรก",
      amount: 10_000,
      vatAmount: 700,
    });
    await admin.agent.post(url("/commitments")).send({
      committedOn: todayIso(),
      categoryId: null,
      costType: "OVERHEAD",
      description: "ค่ารถขนของ",
      amount: 1_000,
      vatAmount: 70,
    });
    const cash = (await admin.agent.get(url())).body.cash;
    expect(cash).toMatchObject({ received: 4_200, paidOut: 10_700, net: -6_500, committedOut: 1_070, projected: -7_570 });
    expect(cash.receivedDetail).toEqual({ installments: 5_000, withholding: 300, retention: 500, retentionReturned: 0 });
    expect(cash.paidOutDetail).toEqual({ beforeVat: 10_000, vat: 700 });
    // งวดค้างนับตามยอดที่ถือว่าชำระ (5,000) ไม่ใช่เงินที่เข้าจริง
    expect(cash.nextInstallment).toMatchObject({ seq: 1, outstanding: Number(installments[0].amount) - 5_000 });
  });

  it("หน้างานที่รอดำเนินการ: ราคาขึ้นหลังเซ็น + ออกเงินแทนลูกค้า ขึ้นโครงการนี้", async () => {
    const res = await owner.agent.get("/api/dashboard/pending-work");
    expect(res.status).toBe(200);
    const drift = res.body.pendingWork.priceDriftSigned.find((r: { project: { id: string } }) => r.project.id === projectId);
    expect(drift).toMatchObject({ lineCount: 1, increase: 3_000 });
    const short = res.body.pendingWork.cashShortfall.find((r: { project: { id: string } }) => r.project.id === projectId);
    expect(short).toMatchObject({ net: -6_500, nextInstallment: { seq: 1 } });
  });
});
