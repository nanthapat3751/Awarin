import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";

// entry แบบ ESM ของ Puppeteer โหลดใต้ ts-jest ไม่ได้ (เหตุผลเดียวกับ myQuotes.test.ts) — ไฟล์นี้ไม่ได้ทดสอบ PDF
jest.mock("../../src/lib/pdf/quote-pdf", () => ({
  renderQuotePdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));
jest.mock("../../src/lib/pdf/customer-quote-pdf", () => ({
  renderCustomerQuotePdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));

/**
 * ทบทวนราคาใน BOQ: เตือนเมื่อราคาในคลังเปลี่ยน + เทียบสองเวอร์ชัน
 * ทุกอย่างที่สร้างในไฟล์นี้ถูกลบใน afterAll (ยกเว้น AuditLog ที่ลบไม่ได้โดยออกแบบ)
 */
describe("BOQ review: catalog price drift + version compare", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let itemCategoryId: string;
  let plainId: string; // วัสดุก้อนเดียว 100 + แรง 20
  let cementId: string; // วัสดุดิบ 150/ถุง
  let concreteId: string; // สูตร: ปูน 2 ถุง ต่อ 1 หน่วย + แรง 300
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-boqreview-owner");
    admin = await createAndLoginAdmin("test-boqreview-admin");
    customer = await createCustomerDirect("test-boqreview-customer");
    createdUserIds.push(owner.userId, admin.userId, customer.userId);

    const cat = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบทบทวนราคา" });
    const sub = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: cat.body.category.id, name: "กลุ่มทดสอบทบทวนราคา" });
    const it = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: sub.body.category.id, name: "รายการทดสอบทบทวนราคา" });
    itemCategoryId = it.body.category.id;
    createdCategoryIds.push(cat.body.category.id, sub.body.category.id, itemCategoryId);

    const mk = async (body: Record<string, unknown>) => {
      const res = await owner.agent.post("/api/materials").send({ categoryId: itemCategoryId, ...body });
      expect(res.status).toBe(201);
      createdMaterialIds.push(res.body.material.id);
      return res.body.material.id as string;
    };
    plainId = await mk({ name: "กระเบื้องทดสอบ", unit: "ตร.ม.", materialUnitPrice: 100, laborUnitPrice: 20 });
    cementId = await mk({ name: "ปูนทดสอบ", unit: "ถุง", materialUnitPrice: 150 });
    concreteId = await mk({
      name: "คอนกรีตทดสอบ",
      unit: "ลบ.ม.",
      materialUnitPrice: 0,
      laborUnitPrice: 300,
      components: [{ componentMaterialId: cementId, name: "ปูนทดสอบ", unit: "ถุง", qtyPerUnit: 2, unitPrice: 150 }],
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    // สูตรอ้างวัสดุดิบ — ลบตัวแม่ก่อน
    await prisma.material.deleteMany({ where: { id: concreteId } });
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    for (const id of [...createdCategoryIds].reverse()) await prisma.workCategory.deleteMany({ where: { id } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function setupProject() {
    const res = await owner.agent
      .post("/api/projects")
      .send({ name: `ทบทวนราคา ${Date.now()}`, customerId: customer.userId });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);
    const add = (body: Record<string, unknown>) =>
      owner.agent.post(`/api/projects/${projectId}/boq/items`).send({ categoryId: itemCategoryId, ...body });
    const tile = await add({ materialId: plainId, quantity: 10 });
    const concrete = await add({ materialId: concreteId, quantity: 4 });
    expect([tile.status, concrete.status]).toEqual([201, 201]);
    return { projectId, tileId: tile.body.item.id as string, concreteId: concrete.body.item.id as string };
  }

  const drift = async (projectId: string) => (await owner.agent.get(`/api/projects/${projectId}/boq/price-drift`)).body;
  const setPrice = async (id: string, body: Record<string, unknown>) =>
    expect((await owner.agent.patch(`/api/materials/${id}`).send(body)).status).toBe(200);

  afterEach(async () => {
    // คืนราคาคลังให้ทุกเทสต์เริ่มเหมือนกัน
    await prisma.material.update({
      where: { id: plainId },
      data: { name: "กระเบื้องทดสอบ", materialUnitPrice: 100, laborUnitPrice: 20 },
    });
    await prisma.material.update({ where: { id: cementId }, data: { materialUnitPrice: 150 } });
  });

  it("เพิ่งตั้งราคา = ไม่เตือน · ราคาที่พิมพ์เองให้ต่างจากคลังตั้งแต่แรกก็ไม่เตือน", async () => {
    const { projectId } = await setupProject();
    await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId: plainId, quantity: 1, materialUnitPrice: 90 });
    const d = await drift(projectId);
    expect(d).toMatchObject({ applicable: true, versionQuoted: false, lines: [], directCostDelta: "0.00" });
  });

  it("คลังขึ้นราคา → เตือนพร้อมตัวเลขก่อน/หลัง · คงราคาเดิม → หาย · คลังขยับอีก → กลับมาเตือน", async () => {
    const { projectId, tileId } = await setupProject();
    await setPrice(plainId, { materialUnitPrice: 110, laborUnitPrice: 25 });

    let d = await drift(projectId);
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0]).toMatchObject({
      itemId: tileId,
      current: { materialUnitPrice: "100.00", laborUnitPrice: "20.00", lineTotal: "1200.00" },
      catalog: { materialUnitPrice: "110.00", laborUnitPrice: "25.00", lineTotal: "1350.00" },
    });
    expect(d.directCostDelta).toBe("150.00");

    // แก้ชื่อวัสดุอย่างเดียวไม่นับว่าราคาเปลี่ยน
    const keep = await owner.agent.post(`/api/projects/${projectId}/boq/price-drift/keep`).send({ itemIds: [tileId] });
    expect(keep.body.keptCount).toBe(1);
    expect((await drift(projectId)).lines).toEqual([]);
    await setPrice(plainId, { name: "กระเบื้องทดสอบ (เปลี่ยนชื่อ)" });
    expect((await drift(projectId)).lines).toEqual([]);

    await setPrice(plainId, { materialUnitPrice: 120 });
    d = await drift(projectId);
    expect(d.lines.map((l: { itemId: string }) => l.itemId)).toEqual([tileId]);
  });

  it("แก้ปริมาณบรรทัดเฉย ๆ (หน้าจอส่งราคาเดิมมาด้วย) ไม่ลบคำเตือนทิ้ง", async () => {
    const { projectId, tileId } = await setupProject();
    await setPrice(plainId, { materialUnitPrice: 130 });
    await owner.agent
      .patch(`/api/projects/${projectId}/boq/items/${tileId}`)
      .send({ quantity: 12, materialUnitPrice: 100, laborUnitPrice: 20 });
    expect((await drift(projectId)).lines).toHaveLength(1);
  });

  it("วัสดุดิบในสูตรขึ้นราคา → บรรทัดสูตรเตือน (ราคาก้อนของวัสดุแม่ในคลังไม่ขยับตาม) · อัปเดตแล้วราคาย่อยตาม", async () => {
    const { projectId, concreteId: lineId } = await setupProject();
    await setPrice(cementId, { materialUnitPrice: 180 });

    const d = await drift(projectId);
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0]).toMatchObject({
      itemId: lineId,
      current: { materialUnitPrice: "300.00", lineTotal: "2400.00" },
      catalog: { materialUnitPrice: "360.00", laborUnitPrice: "300.00", lineTotal: "2640.00" },
      components: [{ name: "ปูนทดสอบ", unit: "ถุง", from: "150.00", to: "180.00" }],
    });

    const res = await owner.agent.post(`/api/projects/${projectId}/boq/price-drift/apply`).send({ itemIds: [lineId] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ updatedCount: 1, newVersion: false });
    const row = await prisma.boqItem.findUniqueOrThrow({ where: { id: lineId }, include: { components: true } });
    expect(Number(row.materialUnitPrice)).toBe(360);
    expect(Number(row.components[0].unitPrice)).toBe(180);
    expect(Number(row.components[0].qtyPerUnit)).toBe(2); // สูตรเดิม เปลี่ยนแค่ราคา
    expect(Number(res.body.version.directCost)).toBe(1200 + 2640);
    expect((await drift(projectId)).lines).toEqual([]);
  });

  it("เวอร์ชันส่งเป็นใบเสนอราคาแล้ว → อัปเดตแตกเวอร์ชันใหม่ ใบที่ส่งไปไม่เปลี่ยน · เทียบเวอร์ชันเห็นตรงกัน", async () => {
    const { projectId, tileId, concreteId: lineId } = await setupProject();
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const sent = await owner.agent
      .post(`/api/projects/${projectId}/quotes/${quote.body.quote.id}/transition`)
      .send({ toStatus: "SENT" });
    expect(sent.status).toBe(200);
    const v1 = await prisma.projectVersion.findFirstOrThrow({ where: { projectId, versionNo: 1 } });

    await setPrice(plainId, { materialUnitPrice: 110 });
    const d = await drift(projectId);
    expect(d.versionQuoted).toBe(true);

    const res = await owner.agent.post(`/api/projects/${projectId}/boq/price-drift/apply`).send({ itemIds: [tileId] });
    expect(res.body).toMatchObject({ updatedCount: 1, newVersion: true });
    expect(res.body.version.versionNo).toBe(2);
    // เวอร์ชันที่ส่งไปแล้วไม่ถูกแตะ
    expect(Number((await prisma.boqItem.findUniqueOrThrow({ where: { id: tileId } })).materialUnitPrice)).toBe(100);
    expect((await prisma.projectVersion.findUniqueOrThrow({ where: { id: v1.id } })).netPrice.toString()).toBe(
      v1.netPrice.toString(),
    );

    // v2: แก้ชื่อบรรทัดคอนกรีต + ลบกระเบื้องไม่ได้ (ต้องมีไว้เทียบราคา) → เพิ่มบรรทัดใหม่แทน
    const v2Concrete = await prisma.boqItem.findFirstOrThrow({ where: { sourceItemId: lineId } });
    await owner.agent
      .patch(`/api/projects/${projectId}/boq/items/${v2Concrete.id}`)
      .send({ name: "คอนกรีตโครงสร้าง (แก้ชื่อ)" });
    await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: itemCategoryId, name: "งานเพิ่ม", unit: "งาน", quantity: 1, materialUnitPrice: 500 });

    const cmp = await admin.agent.get(`/api/projects/${projectId}/boq/versions/compare?from=1&to=2`);
    expect(cmp.status).toBe(200);
    expect(cmp.body.counts).toEqual({ added: 1, removed: 0, changed: 2, unchanged: 0 });
    expect(cmp.body.from.quotes).toEqual([{ quoteNo: quote.body.quote.quoteNo, status: "SENT" }]);
    expect(cmp.body.to.quotes).toEqual([]);
    const tile = cmp.body.lines.find((l: { before: { name: string } | null }) => l.before?.name === "กระเบื้องทดสอบ");
    expect(tile).toMatchObject({ kind: "changed", changed: ["materialUnitPrice"], lineTotalDelta: "100.00" });
    const renamed = cmp.body.lines.find(
      (l: { after: { name: string } | null }) => l.after?.name === "คอนกรีตโครงสร้าง (แก้ชื่อ)",
    );
    expect(renamed).toMatchObject({ kind: "changed", changed: ["name"], lineTotalDelta: "0.00" });
    expect(Number(cmp.body.to.netPrice)).toBeGreaterThan(Number(cmp.body.from.netPrice));
  });

  it("โครงการที่ตกลงราคาแล้วไม่เตือนและอัปเดตไม่ได้", async () => {
    const { projectId, tileId } = await setupProject();
    await setPrice(plainId, { materialUnitPrice: 110 });
    await prisma.project.update({ where: { id: projectId }, data: { status: "APPROVED" } });
    expect(await drift(projectId)).toMatchObject({ applicable: false, lines: [] });
    const res = await owner.agent.post(`/api/projects/${projectId}/boq/price-drift/apply`).send({ itemIds: [tileId] });
    expect(res.status).toBe(409);
  });

  it("id ที่ไม่ใช่ของเวอร์ชันล่าสุด (หน้าจอค้าง) → 409 · เทียบเวอร์ชันกลับหัว → 400 · ลูกค้าเข้าไม่ได้", async () => {
    const { projectId } = await setupProject();
    const stale = await owner.agent
      .post(`/api/projects/${projectId}/boq/price-drift/apply`)
      .send({ itemIds: ["not-an-item"] });
    expect(stale.status).toBe(409);
    expect((await owner.agent.get(`/api/projects/${projectId}/boq/versions/compare?from=2&to=1`)).status).toBe(400);
    expect((await owner.agent.get(`/api/projects/${projectId}/boq/versions/compare?from=1&to=5`)).status).toBe(404);
    expect([401, 403]).toContain((await customer.agent.get(`/api/projects/${projectId}/boq/price-drift`)).status);
  });
});
