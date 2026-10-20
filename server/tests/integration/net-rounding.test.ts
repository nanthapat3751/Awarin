import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

/**
 * ปัดยอดสุทธิผ่าน PATCH /api/projects/:id/rates (ช่อง roundingUnit)
 *
 * เฝ้าสามเรื่อง: ยอดลงตัวจริงทุกครั้งที่ BOQ ขยับ · การปัดติดไปกับเวอร์ชันที่ถูก clone ·
 * เวอร์ชันที่ออกใบเสนอราคาไปแล้ว (และสัญญาที่ผูกกับมัน) ยอดไม่ขยับย้อนหลัง
 */
describe("ปัดยอดสุทธิ", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCategoryIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-rounding-owner");
    createdUserIds.push(owner.userId);
    const category = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบปัดยอด" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: category.body.category.id, name: "กลุ่มย่อยทดสอบปัดยอด" });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: subgroup.body.category.id, name: "รายการทดสอบปัดยอด" });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);
  });

  afterAll(async () => {
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  /** ต้นทุน = quantity × 100 */
  function addLine(projectId: string, quantity: number) {
    return owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "รายการทดสอบ",
      quantity,
      unit: "หน่วย",
      materialUnitPrice: 60,
      laborUnitPrice: 40,
    });
  }

  /** ต้นทุน 1,000 → +10% = 1,100 → VAT 7% → 1,177 */
  async function projectWithOneLine(name: string, extra: Record<string, unknown> = {}) {
    const res = await owner.agent.post("/api/projects").send({ name, ...extra });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);
    await addLine(projectId, 10);
    return projectId;
  }

  const setRates = (agent: typeof owner.agent, projectId: string, body: Record<string, unknown>) =>
    agent.patch(`/api/projects/${projectId}/rates`).send(body);

  function expectBalanced(v: Record<string, string>) {
    // ฐาน + VAT = สุทธิ และ ราคาก่อนลด − ส่วนลด − ปัดเศษ = ฐาน
    const beforeDiscount = Number(v.directCost) + Number(v.contingencyAmt) + Number(v.overheadProfitAmt);
    const base = Number(v.netPrice) - Number(v.vatAmt);
    expect(beforeDiscount - Number(v.discountAmt) - Number(v.roundingAmt)).toBeCloseTo(base, 2);
  }

  it("ปัดลงหลักร้อย: ยอดสุทธิกลม หักเป็นส่วนลดปัดเศษก่อน VAT ต้นทุน/กำไรไม่ถูกแตะ", async () => {
    const projectId = await projectWithOneLine("ปัดยอด 1");
    const res = await setRates(owner.agent, projectId, { roundingUnit: 100 });
    expect(res.status).toBe(200);
    const v = res.body.version;
    expect(v.roundingUnit).toBe(100);
    expect(Number(v.netPrice)).toBe(1100);
    expect(Number(v.roundingAmt)).toBe(71.96);
    expect(Number(v.vatAmt)).toBe(71.96);
    expect(Number(v.directCost)).toBe(1000);
    expect(Number(v.overheadProfitAmt)).toBe(100);
    expectBalanced(v);
  });

  it("คิดใหม่ทุกครั้งที่ BOQ ขยับ — ยอดยังลงตัว", async () => {
    const projectId = await projectWithOneLine("ปัดยอด 2");
    await setRates(owner.agent, projectId, { roundingUnit: 1000 });
    await addLine(projectId, 13.37); // ต้นทุนรวม 2,337 → 3,000.71... ไม่กลม
    const after = await owner.agent.get(`/api/projects/${projectId}`);
    const v = after.body.currentVersion;
    expect(Number(v.netPrice) % 1000).toBe(0);
    expect(Number(v.roundingAmt)).toBeGreaterThan(0);
    expectBalanced(v);
  });

  it("ใช้ร่วมกับส่วนลดได้ (ปัดหลังหักส่วนลด)", async () => {
    const projectId = await projectWithOneLine("ปัดยอด 3");
    const res = await setRates(owner.agent, projectId, { discount: { mode: "AMOUNT", value: 100 }, roundingUnit: 100 });
    const v = res.body.version;
    expect(Number(v.discountAmt)).toBe(100);
    expect(Number(v.netPrice)).toBe(1000); // (1,100 − 100) × 1.07 = 1,070 → 1,000
    expect(Number(v.roundingAmt)).toBe(65.42);
    expectBalanced(v);
  });

  it("เลิกปัด (null) แล้วยอดกลับไปเท่าเดิมเป๊ะ · หน่วยที่ไม่มีให้เลือกถูกปฏิเสธ", async () => {
    const projectId = await projectWithOneLine("ปัดยอด 4");
    await setRates(owner.agent, projectId, { roundingUnit: 100 });
    const off = await setRates(owner.agent, projectId, { roundingUnit: null });
    expect(off.body.version.roundingUnit).toBeNull();
    expect(Number(off.body.version.roundingAmt)).toBe(0);
    expect(Number(off.body.version.netPrice)).toBe(1177);

    for (const bad of [50, 0, -100, "1000", 1.5]) {
      expect((await setRates(owner.agent, projectId, { roundingUnit: bad })).status).toBe(400);
    }
  });

  it("แก้ BOQ หลังส่งใบเสนอราคา: การปัดติดไปกับเวอร์ชันใหม่ ส่วนเวอร์ชันที่ส่งไปแล้วไม่ขยับ", async () => {
    const projectId = await projectWithOneLine("ปัดยอด 5");
    await setRates(owner.agent, projectId, { roundingUnit: 100 });
    const v1 = (await owner.agent.get(`/api/projects/${projectId}`)).body.currentVersion;
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);

    await addLine(projectId, 10); // clone เป็นเวอร์ชัน 2
    const v2 = (await owner.agent.get(`/api/projects/${projectId}`)).body.currentVersion;
    expect(v2.versionNo).toBe(2);
    expect(v2.roundingUnit).toBe(100);
    expect(Number(v2.netPrice) % 100).toBe(0);

    const frozen = await prisma.projectVersion.findUniqueOrThrow({ where: { id: v1.id } });
    expect(Number(frozen.netPrice)).toBe(1100);
    expect(Number(frozen.roundingAmt)).toBe(71.96);
  });

  it("โครงการกำหนดเอง (CUSTOM) ปัดได้ และแก้ VAT ทีหลังการปัดไม่หาย", async () => {
    const res = await owner.agent.post("/api/projects").send({ name: "ปัดยอด 6", type: "CUSTOM" });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);
    await owner.agent.post(`/api/projects/${projectId}/custom-price`).send({ subtotalBeforeVat: 2000 });

    const rounded = await setRates(owner.agent, projectId, { roundingUnit: 1000 });
    expect(Number(rounded.body.version.netPrice)).toBe(2000); // 2,140 → 2,000
    expect(Number(rounded.body.version.directCost)).toBe(2000); // ยอดที่กรอกไว้ไม่ถูกล้าง

    const vat = await setRates(owner.agent, projectId, { vatPercent: 0 });
    expect(vat.body.version.roundingUnit).toBe(1000);
    expect(Number(vat.body.version.netPrice)).toBe(2000);
    expect(Number(vat.body.version.roundingAmt)).toBe(0); // 2,000 ไม่มี VAT ลงตัวอยู่แล้ว

    // กรอกราคาใหม่ทีหลัง การปัดที่ตั้งไว้ต้องยังมีผล
    const again = await owner.agent.post(`/api/projects/${projectId}/custom-price`).send({ subtotalBeforeVat: 2345.67 });
    expect(again.status).toBe(200);
    const latest = (await owner.agent.get(`/api/projects/${projectId}`)).body.currentVersion;
    expect(Number(latest.netPrice)).toBe(2000);
  });

  it("ADMIN ตั้งการปัดได้ (เหมือนส่วนลด ไม่ใช่สิทธิ์เฉพาะเจ้าของ)", async () => {
    const admin = await createAndLoginAdmin("test-rounding-admin");
    createdUserIds.push(admin.userId);
    const projectId = await projectWithOneLine("ปัดยอด 7");
    const res = await setRates(admin.agent, projectId, { roundingUnit: 1 });
    expect(res.status).toBe(200);
    expect(Number(res.body.version.netPrice)).toBe(1177); // ไม่มีสตางค์อยู่แล้ว ไม่หักอะไร
    expect(Number(res.body.version.roundingAmt)).toBe(0);
  });

  it("ลูกค้าเห็นแถวส่วนลดปัดเศษ และผลบวกรายหมวด − ส่วนลด − ปัดเศษ + VAT = ยอดสุทธิ", async () => {
    const customer = await createAndLoginCustomer("test-rounding-customer");
    const me = await customer.agent.get("/api/auth/me");
    createdUserIds.push(me.body.user.id);
    const projectRes = await owner.agent.post("/api/projects").send({ name: "ปัดยอด 8", customerId: me.body.user.id });
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);
    await addLine(projectId, 10);
    await setRates(owner.agent, projectId, { roundingUnit: 100 });
    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quoteRes.body.quote.id);

    const q = (await customer.agent.get(`/api/my/quotes/${quoteRes.body.quote.id}`)).body.quote;
    expect(Number(q.roundingAmt)).toBe(71.96);
    expect(Number(q.netPrice)).toBe(1100);
    const lineSum = q.groups.reduce((sum: number, g: { subtotal: string }) => sum + Number(g.subtotal), 0);
    expect(lineSum - Number(q.discountAmt) - Number(q.roundingAmt) + Number(q.vatAmt)).toBeCloseTo(Number(q.netPrice), 2);
  });

  it("บันทึกไทม์ไลน์ว่าเปลี่ยนการปัดยอด", async () => {
    const projectId = await projectWithOneLine("ปัดยอด 9");
    await setRates(owner.agent, projectId, { roundingUnit: 1000 });
    const audit = await prisma.auditLog.findFirst({
      where: { action: "UPDATE_VERSION_RATES", details: { path: ["projectId"], equals: projectId } },
      orderBy: { createdAt: "desc" },
    });
    expect((audit?.details as { after: { roundingUnit: number } }).after.roundingUnit).toBe(1000);
    const activity = await owner.agent.get(`/api/projects/${projectId}/activity`);
    const text = JSON.stringify(activity.body);
    expect(text).toContain("ปัดยอดสุทธิ: ปัดลงหลักพัน");
  });
});
