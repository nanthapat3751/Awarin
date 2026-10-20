import { groupBoqItemsByTopCategory } from "../../src/lib/boq-grouping";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

// entry แบบ ESM ของ Puppeteer โหลดใต้ ts-jest ไม่ได้ — ไฟล์นี้ไม่ได้ทดสอบหน้าตา PDF
jest.mock("../../src/lib/pdf/quote-pdf", () => ({
  renderQuotePdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));
jest.mock("../../src/lib/pdf/customer-quote-pdf", () => ({
  renderCustomerQuotePdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));

/** เลื่อนลำดับบรรทัด BOQ — ลำดับนี้พิมพ์อยู่ในใบเสนอราคา */
describe("BOQ line order", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let itemCategoryId: string;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-boqorder-owner");
    admin = await createAndLoginAdmin("test-boqorder-admin");
    customer = await createCustomerDirect("test-boqorder-customer");
    createdUserIds.push(owner.userId, admin.userId, customer.userId);
    const cat = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบลำดับ" });
    const sub = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: cat.body.category.id, name: "กลุ่มทดสอบลำดับ" });
    const it = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: sub.body.category.id, name: "รายการทดสอบลำดับ" });
    itemCategoryId = it.body.category.id;
    createdCategoryIds.push(cat.body.category.id, sub.body.category.id, itemCategoryId);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    for (const id of [...createdCategoryIds].reverse()) await prisma.workCategory.deleteMany({ where: { id } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function projectWith(names: string[]) {
    const res = await owner.agent
      .post("/api/projects")
      .send({ name: `ลำดับ ${Date.now()}`, customerId: customer.userId });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);
    const ids: string[] = [];
    for (const name of names) {
      const r = await owner.agent
        .post(`/api/projects/${projectId}/boq/items`)
        .send({ categoryId: itemCategoryId, name, unit: "งาน", quantity: 1, materialUnitPrice: 100 });
      ids.push(r.body.item.id);
    }
    return { projectId, ids };
  }

  const names = async (projectId: string) =>
    ((await admin.agent.get(`/api/projects/${projectId}`)).body.items as { name: string }[]).map((i) => i.name);

  it("บรรทัดใหม่ต่อท้าย (เดิม sortOrder = 0 ทุกบรรทัด)", async () => {
    const { projectId, ids } = await projectWith(["ก", "ข", "ค"]);
    const rows = await prisma.boqItem.findMany({ where: { id: { in: ids } } });
    expect(ids.map((id) => rows.find((r) => r.id === id)!.sortOrder)).toEqual([0, 1, 2]);
    expect(await names(projectId)).toEqual(["ก", "ข", "ค"]);
  });

  it("ADMIN เลื่อนลำดับได้ · หน้าจอกับ PDF ใช้ลำดับเดียวกัน · ยอดเงินไม่ขยับ", async () => {
    const { projectId, ids } = await projectWith(["ก", "ข", "ค"]);
    const before = await prisma.projectVersion.findFirstOrThrow({ where: { projectId } });
    const res = await admin.agent.put(`/api/projects/${projectId}/boq/items/order`).send({ itemIds: [ids[2], ids[0], ids[1]] });
    expect(res.status).toBe(200);
    expect(res.body.newVersion).toBe(false);
    expect(await names(projectId)).toEqual(["ค", "ก", "ข"]);
    const [group] = await groupBoqItemsByTopCategory(before.id);
    expect(group.items.map((i) => i.name)).toEqual(["ค", "ก", "ข"]);
    const after = await prisma.projectVersion.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.netPrice.toString()).toBe(before.netPrice.toString());
  });

  it("เวอร์ชันที่ส่งเป็นใบเสนอราคาแล้ว → แตกเวอร์ชันใหม่ ใบที่ส่งไปคงลำดับเดิม", async () => {
    const { projectId, ids } = await projectWith(["ก", "ข"]);
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    await sendQuote(owner.agent, projectId, quote.body.quote.id);
    const v1 = await prisma.projectVersion.findFirstOrThrow({ where: { projectId, versionNo: 1 } });

    const res = await owner.agent.put(`/api/projects/${projectId}/boq/items/order`).send({ itemIds: [ids[1], ids[0]] });
    expect(res.body).toMatchObject({ newVersion: true, version: { versionNo: 2 } });
    expect(await names(projectId)).toEqual(["ข", "ก"]);
    expect((await groupBoqItemsByTopCategory(v1.id))[0].items.map((i) => i.name)).toEqual(["ก", "ข"]);
  });

  it("ส่งลำดับเดิม = ไม่แตกเวอร์ชัน · ขาด/เกิน/ซ้ำบรรทัด → 409 · ลูกค้าเข้าไม่ได้", async () => {
    const { projectId, ids } = await projectWith(["ก", "ข"]);
    const same = await owner.agent.put(`/api/projects/${projectId}/boq/items/order`).send({ itemIds: ids });
    expect(same.body.newVersion).toBe(false);
    for (const bad of [[ids[0]], [ids[0], ids[0]], [...ids, "x"]]) {
      expect((await owner.agent.put(`/api/projects/${projectId}/boq/items/order`).send({ itemIds: bad })).status).toBe(
        409,
      );
    }
    expect([401, 403]).toContain(
      (await customer.agent.put(`/api/projects/${projectId}/boq/items/order`).send({ itemIds: ids })).status,
    );
  });

  it("แม่แบบพาลำดับที่จัดไว้ไปโครงการใหม่", async () => {
    const { projectId, ids } = await projectWith(["ก", "ข", "ค"]);
    await owner.agent.put(`/api/projects/${projectId}/boq/items/order`).send({ itemIds: [ids[1], ids[2], ids[0]] });
    const saved = await owner.agent
      .post(`/api/projects/${projectId}/templates/save-as`)
      .send({ name: `แม่แบบลำดับ ${Date.now()}` });
    expect(saved.status).toBe(201);
    const target = await projectWith([]);
    await owner.agent.post(`/api/projects/${target.projectId}/templates/apply`).send({ templateId: saved.body.template.id });
    expect(await names(target.projectId)).toEqual(["ข", "ค", "ก"]);
    await prisma.template.delete({ where: { id: saved.body.template.id } });
  });
});
