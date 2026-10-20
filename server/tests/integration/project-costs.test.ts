import { todayIso } from "../../src/lib/business-date";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

/**
 * ต้นทุนจริงเทียบงบ
 *
 * เฝ้า: งบมาจากเวอร์ชันตามสัญญา (ไม่ใช่เวอร์ชันที่แก้ทีหลัง) · ADMIN ไม่เห็นกำไรตั้งแต่เซิร์ฟเวอร์ ·
 * แก้/ลบได้เฉพาะคนบันทึกหรือ OWNER · ลงได้แค่หมวดบนสุด
 */
describe("ต้นทุนจริงของโครงการ", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let topCategoryId: string;
  let itemCategoryId: string;
  let projectId: string;
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const projectIds: string[] = [];

  const url = (suffix = "") => `/api/projects/${projectId}/costs${suffix}`;
  const bill = (over: Record<string, unknown> = {}) => ({
    spentOn: todayIso(),
    categoryId: topCategoryId,
    costType: "MATERIAL",
    description: "ปูน เหล็ก",
    vendor: "ร้านวัสดุทดสอบ",
    amount: 10_000,
    vatAmount: 700,
    ...over,
  });

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-cost-owner");
    admin = await createAndLoginAdmin("test-cost-admin");
    customer = await createCustomerDirect("test-cost-customer");
    userIds.push(owner.userId, admin.userId, customer.userId);

    const cat = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบต้นทุน" });
    topCategoryId = cat.body.category.id;
    categoryIds.push(topCategoryId);
    const sub = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: topCategoryId, name: "กลุ่มทดสอบต้นทุน" });
    categoryIds.push(sub.body.category.id);
    const item = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: sub.body.category.id, name: "รายการทดสอบต้นทุน" });
    itemCategoryId = item.body.category.id;
    categoryIds.push(itemCategoryId);
    await owner.agent.get("/api/contract-templates");

    const res = await owner.agent.post("/api/projects").send({ name: "[ชั่วคราว] ต้นทุนจริง", customerId: customer.userId });
    projectId = res.body.project.id;
    projectIds.push(projectId);
    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "งานโครงสร้าง",
      quantity: 10,
      unit: "หน่วย",
      materialUnitPrice: 6_000,
      laborUnitPrice: 4_000,
    });
  });

  afterAll(async () => {
    await prisma.projectCost.deleteMany({ where: { projectId: { in: projectIds } } });
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

  it("ยังไม่มีสัญญา → งบจากเวอร์ชันล่าสุด (บอกว่าเป็นงบชั่วคราว) · งบหมวดบนสุด = วัสดุ+แรงของทุกบรรทัดใต้หมวด", async () => {
    const res = await owner.agent.get(url());
    expect(res.status).toBe(200);
    expect(res.body.budgetSource).toMatchObject({ versionNo: 1, kind: "latest", contractNo: null });
    const row = res.body.rows.find((r: { categoryId: string }) => r.categoryId === topCategoryId);
    expect(row).toMatchObject({ kind: "category", budget: 100_000, budgetMaterial: 60_000, budgetLabor: 40_000, actual: 0 });
    expect(res.body.categories.some((c: { id: string }) => c.id === topCategoryId)).toBe(true);
  });

  it("ลงสัญญาแล้ว → งบตรึงกับเวอร์ชันตามสัญญา แก้ BOQ ทีหลังงบไม่ขยับ", async () => {
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);
    await owner.agent.post(`/api/projects/${projectId}/quotes/${quote.body.quote.id}/transition`).send({ toStatus: "ACCEPTED" });
    await owner.agent.post(`/api/projects/${projectId}/transition`).send({ toStatus: "APPROVED" });
    const contract = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
    await owner.agent.post(`/api/projects/${projectId}/contracts/${contract.body.contract.id}/sign`);
    // แก้ BOQ หลังลงนาม (เวอร์ชันถูกล็อก → แตกเวอร์ชันใหม่) แต่ยังไม่มีใบงานเพิ่ม-ลดอนุมัติ
    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "งานที่ยังไม่อนุมัติ",
      quantity: 1,
      unit: "หน่วย",
      materialUnitPrice: 50_000,
      laborUnitPrice: 0,
    });

    const res = await owner.agent.get(url());
    expect(res.body.budgetSource).toMatchObject({ versionNo: 1, kind: "contract" });
    expect(res.body.rows.find((r: { categoryId: string }) => r.categoryId === topCategoryId).budget).toBe(100_000);
    const version = await prisma.projectVersion.findFirstOrThrow({ where: { projectId, versionNo: 1 } });
    expect(res.body.profit.revenue).toBe(Math.round((Number(version.netPrice) - Number(version.vatAmt)) * 100) / 100);
  });

  it("บันทึกบิล → ใช้จริงขยับ · VAT ไม่นับเป็นต้นทุน (บริษัทจด VAT) หรือนับ (ไม่จด)", async () => {
    const res = await admin.agent.post(url()).send(bill());
    expect(res.status).toBe(200);
    const row = res.body.rows.find((r: { categoryId: string }) => r.categoryId === topCategoryId);
    expect(row.actual).toBe(res.body.vatClaimable ? 10_000 : 10_700);
    expect(res.body.costs[0]).toMatchObject({ description: "ปูน เหล็ก", recordedById: admin.userId, categoryCode: expect.any(String) });
  });

  it("ADMIN เห็นงบเทียบใช้จริง แต่ไม่เห็นตัวเลขกำไร · OWNER เห็น", async () => {
    expect((await admin.agent.get(url())).body.profit).toBeNull();
    expect((await owner.agent.get(url())).body.profit).toMatchObject({ completed: false, actualProfit: null });
  });

  it("ลงได้แค่หมวดบนสุด · วันที่ในอนาคต/ภาษีเกินยอด ถูกปฏิเสธ · ค่าดำเนินการลงแบบไม่มีหมวดได้", async () => {
    expect((await owner.agent.post(url()).send(bill({ categoryId: itemCategoryId }))).status).toBe(400);
    expect((await owner.agent.post(url()).send(bill({ spentOn: "2099-01-01" }))).status).toBe(400);
    expect((await owner.agent.post(url()).send(bill({ vatAmount: 20_000 }))).status).toBe(400);
    const overhead = await owner.agent.post(url()).send(bill({ categoryId: null, costType: "OVERHEAD", description: "ค่าน้ำไฟหน้างาน", amount: 1_500, vatAmount: 0 }));
    expect(overhead.status).toBe(200);
    expect(overhead.body.rows.find((r: { kind: string }) => r.kind === "overhead")).toMatchObject({ actual: 1_500 });
  });

  it("แก้/ลบได้เฉพาะคนบันทึกหรือ OWNER · การแก้เก็บยอดเดิมลงบันทึก", async () => {
    const report = (await owner.agent.get(url())).body;
    const ownersCost = report.costs.find((c: { recordedById: string }) => c.recordedById === owner.userId);
    const adminsCost = report.costs.find((c: { recordedById: string }) => c.recordedById === admin.userId);

    expect((await admin.agent.patch(url(`/${ownersCost.id}`)).send(bill({ categoryId: null, costType: "OVERHEAD", amount: 9 }))).status).toBe(403);
    expect((await admin.agent.delete(url(`/${ownersCost.id}`))).status).toBe(403);

    const edited = await owner.agent.patch(url(`/${adminsCost.id}`)).send(bill({ amount: 12_000, vatAmount: 840 }));
    expect(edited.status).toBe(200);
    const log = await prisma.auditLog.findFirst({
      where: { action: "UPDATE_PROJECT_COST", entityId: projectId },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.details).toMatchObject({ from: { amount: 10_000 }, to: { amount: 12_000 } });

    const removed = await admin.agent.delete(url(`/${adminsCost.id}`));
    expect(removed.status).toBe(200);
    expect(removed.body.costs).toHaveLength(1);
  });

  it("ลูกค้าเรียกข้อมูลต้นทุนไม่ได้", async () => {
    expect((await customer.agent.get(url())).status).toBe(403);
  });
});
