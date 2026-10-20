import { prisma } from "../../src/lib/prisma";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

/**
 * ส่วนลดท้ายใบ — ส่งผ่าน PATCH /api/projects/:id/rates (ช่อง discount)
 *
 * ก่อนหน้านี้ระบบไม่มีส่วนลดเลย พอต่อรองราคากับลูกค้าแล้วต้องไปไล่แก้ "ราคารายบรรทัด" ใน BOQ แทน
 * ซึ่งทำให้ต้นทุนตรงที่เก็บไว้กลายเป็นตัวเลขที่ไม่ใช่ต้นทุนจริง แล้วไหลไปทำให้ราคา/ตร.ม. อัตรากำไร
 * และแม่แบบที่ save-as จากโครงการนั้นเพี้ยนตามกันทั้งสาย — เทสต์ชุดนี้เฝ้าตรงนั้นเป็นหลัก
 */
describe("project discount", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCategoryIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-discount-owner");
    createdUserIds.push(owner.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบส่วนลด" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบส่วนลด",
    });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการทดสอบส่วนลด",
    });
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

  /** เพิ่มบรรทัด BOQ หนึ่งบรรทัด ต้นทุน = quantity × 100 */
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

  /** โครงการที่มีบรรทัด BOQ หนึ่งบรรทัด: ต้นทุนตรง 1,000 → +10% = 1,100 → VAT 7% → 1,177 */
  async function projectWithOneLine(name: string, extra: Record<string, unknown> = {}) {
    const res = await owner.agent.post("/api/projects").send({ name, ...extra });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);
    await addLine(projectId, 10);
    return projectId;
  }

  const setDiscount = (projectId: string, discount: unknown) =>
    owner.agent.patch(`/api/projects/${projectId}/rates`).send({ discount });

  it("ลดเป็นจำนวนเงิน: หักก่อน VAT และต้นทุนตรงไม่ถูกแตะ", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบส่วนลด 1");

    const res = await setDiscount(projectId, { mode: "AMOUNT", value: 100 });
    expect(res.status).toBe(200);

    const v = res.body.version;
    expect(Number(v.discountAmt)).toBe(100);
    expect(v.discountPct).toBeNull();
    expect(Number(v.vatAmt)).toBe(70); // 7% ของ 1,000 (หลังลด) ไม่ใช่ 77 ของ 1,100
    expect(Number(v.netPrice)).toBe(1070);

    // หัวใจของฟีเจอร์: ตัวเลขต้นทุนและกำไรต้องยังเป็นของจริง ไม่ถูกส่วนลดกลืน
    expect(Number(v.directCost)).toBe(1000);
    expect(Number(v.overheadProfitAmt)).toBe(100);
  });

  it("ลดเป็น %: คิดจากราคาก่อนส่วนลด (ต้นทุน+กำไร)", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบส่วนลด 2");

    const res = await setDiscount(projectId, { mode: "PERCENT", value: 10 });
    expect(res.status).toBe(200);
    expect(Number(res.body.version.discountPct)).toBe(10);
    expect(Number(res.body.version.discountAmt)).toBe(110); // 10% ของ 1,100
    expect(Number(res.body.version.netPrice)).toBe(1059.3);
  });

  it("ส่วนลด % ถูกคิดใหม่เมื่อ BOQ เปลี่ยน แต่ส่วนลดจำนวนเงินคงที่ไม่ขยับ", async () => {
    // นี่คือเหตุผลที่ต้องเก็บทั้ง pct และ amt แทนที่จะเก็บแค่ยอดบาท
    const pctProject = await projectWithOneLine("โครงการทดสอบส่วนลด 3ก");
    await setDiscount(pctProject, { mode: "PERCENT", value: 10 });
    await addLine(pctProject, 10); // ต้นทุนตรงเป็น 2,000 → ก่อนลด 2,200

    const pctAfter = await owner.agent.get(`/api/projects/${pctProject}`);
    expect(Number(pctAfter.body.currentVersion.directCost)).toBe(2000);
    expect(Number(pctAfter.body.currentVersion.discountAmt)).toBe(220); // ตามยอดใหม่
    expect(Number(pctAfter.body.currentVersion.netPrice)).toBe(2118.6);

    const amtProject = await projectWithOneLine("โครงการทดสอบส่วนลด 3ข");
    await setDiscount(amtProject, { mode: "AMOUNT", value: 100 });
    await addLine(amtProject, 10);

    const amtAfter = await owner.agent.get(`/api/projects/${amtProject}`);
    expect(Number(amtAfter.body.currentVersion.directCost)).toBe(2000);
    expect(Number(amtAfter.body.currentVersion.discountAmt)).toBe(100); // เท่าที่ตกลงไว้เป๊ะ
    expect(Number(amtAfter.body.currentVersion.netPrice)).toBe(2247); // (2200-100) × 1.07
  });

  it("ส่วนลดเกินราคา ถูกตัดที่ราคาเต็ม ยอดสุทธิไม่ติดลบ", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบส่วนลด 4");

    const res = await setDiscount(projectId, { mode: "AMOUNT", value: 999999 });
    expect(res.status).toBe(200);
    expect(Number(res.body.version.discountAmt)).toBe(1100);
    expect(Number(res.body.version.netPrice)).toBe(0);
  });

  it("ยกเลิกส่วนลดแล้วราคากลับไปเท่าเดิมเป๊ะ", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบส่วนลด 5");
    await setDiscount(projectId, { mode: "PERCENT", value: 25, note: "ลดพิเศษ" });

    const cleared = await setDiscount(projectId, { mode: "NONE" });
    expect(cleared.status).toBe(200);
    expect(cleared.body.version.discountPct).toBeNull();
    expect(Number(cleared.body.version.discountAmt)).toBe(0);
    expect(cleared.body.version.discountNote).toBeNull();
    expect(Number(cleared.body.version.netPrice)).toBe(1177);
  });

  it("เก็บเหตุผลส่วนลดไว้พิมพ์ลงเอกสาร", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบส่วนลด 6");

    const res = await setDiscount(projectId, {
      mode: "AMOUNT",
      value: 50,
      note: "  ส่วนลดพิเศษลูกค้าเก่า  ",
    });
    expect(res.body.version.discountNote).toBe("ส่วนลดพิเศษลูกค้าเก่า"); // ตัดช่องว่างหัวท้ายให้
  });

  it("ราคา/ตร.ม. คิดจากยอดหลังหักส่วนลด", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบส่วนลด 7", { areaSqm: 100 });

    const res = await setDiscount(projectId, { mode: "AMOUNT", value: 100 });
    expect(Number(res.body.version.pricePerSqm)).toBe(10.7); // 1,070 / 100
  });

  it("แก้อัตราและส่วนลดพร้อมกันในคำขอเดียว", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบส่วนลด 8");

    const res = await owner.agent
      .patch(`/api/projects/${projectId}/rates`)
      .send({ overheadProfitPercent: 20, discount: { mode: "PERCENT", value: 10 } });

    expect(res.status).toBe(200);
    // 1,000 + 20% = 1,200 → ลด 10% = 120 → 1,080 → VAT 7% = 75.6 → 1,155.6
    expect(Number(res.body.version.discountAmt)).toBe(120);
    expect(Number(res.body.version.netPrice)).toBe(1155.6);
  });

  it("BR-07: ส่วนลดของใบที่ส่งไปแล้วต้องคงเดิม ส่วนเวอร์ชันใหม่รับส่วนลดใหม่", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบส่วนลด 9");
    await setDiscount(projectId, { mode: "AMOUNT", value: 100 });

    const detail = await owner.agent.get(`/api/projects/${projectId}`);
    const versionOneId = detail.body.currentVersion.id as string;

    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);

    const res = await setDiscount(projectId, { mode: "AMOUNT", value: 300 });
    expect(res.status).toBe(200);
    expect(res.body.version.id).not.toBe(versionOneId);
    expect(res.body.version.versionNo).toBe(2);
    expect(Number(res.body.version.discountAmt)).toBe(300);
    expect(Number(res.body.version.netPrice)).toBe(856); // (1100-300) × 1.07

    const frozen = await prisma.projectVersion.findUniqueOrThrow({ where: { id: versionOneId } });
    expect(Number(frozen.discountAmt)).toBe(100);
    expect(Number(frozen.netPrice)).toBe(1070);
  });

  it("แก้ BOQ หลังส่งใบเสนอราคา: ส่วนลดต้องติดไปกับเวอร์ชันที่ถูก clone ไม่หายเงียบ ๆ", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบส่วนลด 10");
    await setDiscount(projectId, { mode: "PERCENT", value: 10, note: "ต่อรองแล้ว" });

    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);

    await addLine(projectId, 10); // การแก้ BOQ นี้จะ clone เวอร์ชันใหม่

    const after = await owner.agent.get(`/api/projects/${projectId}`);
    expect(after.body.currentVersion.versionNo).toBe(2);
    expect(Number(after.body.currentVersion.discountPct)).toBe(10);
    expect(after.body.currentVersion.discountNote).toBe("ต่อรองแล้ว");
    expect(Number(after.body.currentVersion.discountAmt)).toBe(220); // คิดใหม่ตามยอดใหม่
  });

  it("โครงการกำหนดเอง (CUSTOM) ลดราคาได้ และแก้ VAT ทีหลังส่วนลดไม่หาย", async () => {
    const res = await owner.agent
      .post("/api/projects")
      .send({ name: "โครงการทดสอบส่วนลด 11", type: "CUSTOM" });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);
    await owner.agent
      .post(`/api/projects/${projectId}/custom-price`)
      .send({ subtotalBeforeVat: 2000 });

    const discounted = await setDiscount(projectId, { mode: "AMOUNT", value: 200 });
    expect(discounted.status).toBe(200);
    expect(Number(discounted.body.version.directCost)).toBe(2000); // ยอดที่กรอกไว้ไม่ถูกล้าง
    expect(Number(discounted.body.version.discountAmt)).toBe(200);
    expect(Number(discounted.body.version.vatAmt)).toBe(126); // 7% ของ 1,800
    expect(Number(discounted.body.version.netPrice)).toBe(1926);

    // แก้เฉพาะ VAT — ส่วนลดที่ตกลงไว้ต้องยังอยู่ (เคยเป็นบั๊กที่ส่วนลดหายเมื่อแก้อัตราอย่างเดียว)
    const vat = await owner.agent.patch(`/api/projects/${projectId}/rates`).send({ vatPercent: 0 });
    expect(Number(vat.body.version.discountAmt)).toBe(200);
    expect(Number(vat.body.version.netPrice)).toBe(1800);
  });

  it("ปฏิเสธส่วนลดที่ไม่ถูกต้อง และของเดิมต้องไม่ถูกแตะ", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบส่วนลด 12");

    for (const discount of [
      { mode: "PERCENT", value: 101 },
      { mode: "PERCENT", value: -1 },
      { mode: "AMOUNT", value: -100 },
      { mode: "PERCENT" }, // ไม่ส่ง value
      { mode: "HALF_PRICE", value: 50 }, // โหมดที่ไม่มีจริง
      { mode: "AMOUNT", value: 100, note: "x".repeat(201) },
    ]) {
      const res = await setDiscount(projectId, discount);
      expect(res.status).toBe(400);
    }

    const after = await owner.agent.get(`/api/projects/${projectId}`);
    expect(Number(after.body.currentVersion.discountAmt)).toBe(0);
    expect(Number(after.body.currentVersion.netPrice)).toBe(1177);
  });

  it("ลูกค้าเห็นส่วนลดในใบเสนอราคาของตัวเอง และตัวเลขบวกกันแล้วลงตัว", async () => {
    // ถ้าลูกค้าเห็นแต่ยอดสุทธิที่ลดแล้ว แต่ราคารายบรรทัดยังเป็นราคาเต็ม เขาจะบวกเองแล้วไม่ตรง
    // แล้วโทรมาถามว่าคิดเลขผิดหรือเปล่า — ส่วนลดจึงต้องเป็นบรรทัดที่มองเห็นได้
    const customer = await createAndLoginCustomer("test-discount-customer");
    const me = await customer.agent.get("/api/auth/me");
    const customerId = me.body.user.id as string;
    createdUserIds.push(customerId);

    const projectRes = await owner.agent
      .post("/api/projects")
      .send({ name: "โครงการทดสอบส่วนลด 14", customerId });
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);
    await addLine(projectId, 10);
    await setDiscount(projectId, { mode: "PERCENT", value: 10, note: "ส่วนลดโปรโมชัน" });

    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    const quoteId = quoteRes.body.quote.id as string;
    await sendQuote(owner.agent, projectId, quoteId);

    const detail = await customer.agent.get(`/api/my/quotes/${quoteId}`);
    expect(detail.status).toBe(200);
    const q = detail.body.quote;
    expect(Number(q.discountPct)).toBe(10);
    expect(Number(q.discountAmt)).toBe(110);
    expect(q.discountNote).toBe("ส่วนลดโปรโมชัน");
    expect(Number(q.netPrice)).toBe(1059.3);

    // ผลบวกราคาทุกหมวด − ส่วนลด + VAT ต้องได้ยอดสุทธิพอดี
    const lineSum = q.groups.reduce(
      (sum: number, g: { subtotal: string }) => sum + Number(g.subtotal),
      0,
    );
    expect(lineSum).toBe(1100);
    expect(lineSum - Number(q.discountAmt) + Number(q.vatAmt)).toBeCloseTo(Number(q.netPrice), 2);

    // BR-09: ส่วนลดเปิดเผยได้ แต่ต้นทุน/อัตรากำไรยังต้องไม่หลุดไปฝั่งลูกค้า
    expect(q.directCost).toBeUndefined();
    expect(q.overheadProfitPct).toBeUndefined();
    expect(q.overheadProfitAmt).toBeUndefined();
  });

  it("บันทึกลง AuditLog และขึ้นไทม์ไลน์ว่า 'แก้ส่วนลด'", async () => {
    const projectId = await projectWithOneLine("โครงการทดสอบส่วนลด 13");
    await setDiscount(projectId, { mode: "PERCENT", value: 5 });

    const detail = await owner.agent.get(`/api/projects/${projectId}`);
    const log = await prisma.auditLog.findFirst({
      where: { action: "UPDATE_VERSION_RATES", entityId: detail.body.currentVersion.id },
      orderBy: { createdAt: "desc" },
    });
    const details = log?.details as {
      before?: { discountAmt?: number };
      after?: { discountPct?: number; discountAmt?: number };
    };
    expect(details.before?.discountAmt).toBe(0);
    expect(details.after?.discountPct).toBe(5);
    expect(details.after?.discountAmt).toBe(55); // 5% ของ 1,100

    const activity = await owner.agent.get(`/api/projects/${projectId}/activity`);
    const entry = activity.body.activity.find((a: { title: string }) => a.title === "แก้ส่วนลด");
    expect(entry).toBeDefined();
    // หัวข้อต้องบอกว่าแก้ "ส่วนลด" ไม่ใช่ "อัตรา" เพราะรอบนี้ไม่ได้แตะอัตราเลย
    expect(entry.detail).toContain("ไม่มีส่วนลด → ส่วนลด 5%");
  });
});
