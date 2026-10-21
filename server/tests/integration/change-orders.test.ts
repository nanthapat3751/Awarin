import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

// Puppeteer เป็น ESM รันใต้ ts-jest ไม่ได้ — แทนเฉพาะขั้นเรนเดอร์ เพื่อทดสอบเส้นทางเปิด PDF ว่าส่งข้อมูลของใบที่ถูกต้อง
// เข้าไปและตอบเป็นไฟล์ PDF (เนื้อเอกสารจริงตรวจที่ tests/lib/change-order-pdf.test.ts)
const renderedVo: { totalAmount: number; extensionDays: number | null }[] = [];
jest.mock("../../src/lib/pdf/change-order-pdf", () => ({
  ...jest.requireActual("../../src/lib/pdf/change-order-pdf"),
  renderChangeOrderPdf: jest.fn(async (data: { totalAmount: number; extensionDays: number | null }) => {
    renderedVo.push(data);
    return new Uint8Array(Buffer.from("%PDF-1.7 mock"));
  }),
}));

/**
 * ใบงานเพิ่ม-ลด (Variation Order) — ทั้งเส้นทาง: แก้ BOQ หลังลงนาม → ออกใบ → ส่ง → ลูกค้าตอบในพอร์ทัล
 * หรือพนักงานบันทึกจากใบที่เซ็นกระดาษ → มูลค่าสัญญาและงวดเงินขยับ
 *
 * เฝ้า: ยอดในใบ = ราคาสุทธิที่ต่างกันจริงของสองเวอร์ชัน · ผลรวมงวด = มูลค่าปัจจุบันเสมอ ·
 * ร่างที่ล้าหลัง BOQ ส่งไม่ได้ · ลูกค้าไม่เห็นร่าง/ใบที่ยกเลิก
 */
describe("ใบงานเพิ่ม-ลด", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let itemCategoryId: string;
  let projectId: string;
  let contractId: string;
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const projectIds: string[] = [];

  const coUrl = (suffix = "") => `/api/projects/${projectId}/contracts/${contractId}/change-orders${suffix}`;
  const boq = async () => (await owner.agent.get(`/api/projects/${projectId}/boq`)).body;
  const addLine = (name: string, quantity: number, unitCost: number) =>
    owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name,
      quantity,
      unit: "หน่วย",
      materialUnitPrice: unitCost * 0.6,
      laborUnitPrice: unitCost * 0.4,
    });
  /**
   * แก้บรรทัดตามชื่อ — เวอร์ชันที่ถูกล็อก (ออกใบแล้ว) จะแตกเวอร์ชันใหม่แล้วตอบ 404 ให้หน้าจอโหลดใหม่
   * (กฎ BR-07 เดิม) จึงลองซ้ำหนึ่งครั้งกับ id ในเวอร์ชันใหม่ แบบเดียวกับที่ผู้ใช้กดแก้อีกครั้ง
   */
  async function editLine(name: string, body: Record<string, unknown>) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const item = (await boq()).items.find((i: { name: string }) => i.name === name);
      const res = await owner.agent.patch(`/api/projects/${projectId}/boq/items/${item.id}`).send(body);
      if (res.status === 200) return res;
    }
    throw new Error(`แก้บรรทัด ${name} ไม่สำเร็จ`);
  }
  const installments = () =>
    prisma.contractInstallment.findMany({ where: { contractId }, orderBy: { seq: "asc" } });
  const sum = (rows: { amount: unknown }[]) => Math.round(rows.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-vo-owner");
    customer = await createCustomerDirect("test-vo-customer");
    userIds.push(owner.userId, customer.userId);
    const cat = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบงานเพิ่มลด" });
    categoryIds.push(cat.body.category.id);
    const sub = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: cat.body.category.id, name: "กลุ่มทดสอบงานเพิ่มลด" });
    categoryIds.push(sub.body.category.id);
    const item = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: sub.body.category.id, name: "รายการทดสอบงานเพิ่มลด" });
    itemCategoryId = item.body.category.id;
    categoryIds.push(itemCategoryId);
    await owner.agent.get("/api/contract-templates");

    const res = await owner.agent.post("/api/projects").send({ name: "[ชั่วคราว] งานเพิ่มลด", customerId: customer.userId });
    projectId = res.body.project.id;
    projectIds.push(projectId);
    await addLine("งานโครงสร้าง", 10, 10_000);
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);
    await owner.agent.post(`/api/projects/${projectId}/quotes/${quote.body.quote.id}/transition`).send({ toStatus: "ACCEPTED" });
    await owner.agent.post(`/api/projects/${projectId}/transition`).send({ toStatus: "APPROVED" });
    const contract = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
    contractId = contract.body.contract.id;
  });

  afterAll(async () => {
    await prisma.contract.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: categoryIds.reverse() } } });
  });

  it("สัญญายังไม่ลงนาม → ออกใบไม่ได้ (แก้ BOQ แล้วออกสัญญาใหม่แทน)", async () => {
    const list = await owner.agent.get(coUrl());
    expect(list.body.blocker).toContain("ยังไม่ลงนาม");
    await owner.agent.post(`/api/projects/${projectId}/contracts/${contractId}/sign`);
  });

  it("ลงนามแล้วแต่ยังไม่แก้ BOQ → บอกให้ไปแก้ BOQ ก่อน", async () => {
    const preview = await owner.agent.get(coUrl("/preview"));
    expect(preview.status).toBe(409);
    expect(preview.body.error).toContain("ยังไม่มีการแก้ BOQ");
  });

  it("งานเพิ่ม: ยอดในใบ = ราคาสุทธิที่ต่างกันของสองเวอร์ชัน · ร่างล้าหลังต้องคิดใหม่ก่อนส่ง", async () => {
    const before = (await boq()).version;
    await addLine("ต่อเติมหลังคากันสาด", 2, 5_000);
    const after = (await boq()).version;
    expect(after.versionNo).toBe(2);
    const expected = (Number(after.netPrice) - Number(before.netPrice)).toFixed(2);

    const preview = await owner.agent.get(coUrl("/preview"));
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ fromVersionNo: 1, toVersionNo: 2, totalAmount: expected });
    expect(preview.body.lines).toEqual([expect.objectContaining({ kind: "added", name: "ต่อเติมหลังคากันสาด" })]);

    const created = await owner.agent.post(coUrl()).send({ title: "ลูกค้าขอทำกันสาดเพิ่ม", extensionDays: 7 });
    expect(created.status).toBe(200);
    const co = created.body.changeOrders[0];
    expect(co).toMatchObject({ seq: 1, status: "DRAFT", totalAmount: expected, extensionDays: 7, outdated: false });
    expect(co.docNo).toMatch(/^VO-\d{4}-\d{4}$/);
    expect(created.body.blocker).toContain("เป็นร่าง");

    // แก้ BOQ ต่อหลังออกร่าง → เวอร์ชันที่ร่างอ้างถูกล็อก ระบบแตกเวอร์ชันใหม่ ร่างกลายเป็นล้าหลัง
    await editLine("ต่อเติมหลังคากันสาด", { quantity: 3 });
    expect((await boq()).version.versionNo).toBe(3);
    const stale = (await owner.agent.get(coUrl())).body.changeOrders[0];
    expect(stale.outdated).toBe(true);
    const blocked = await owner.agent.post(coUrl(`/${co.id}/send`));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain("คิดใหม่");

    const refreshed = await owner.agent.post(coUrl(`/${co.id}/refresh`));
    const fresh = refreshed.body.changeOrders[0];
    expect(fresh).toMatchObject({ toVersionNo: 3, outdated: false });
    const v3 = (await boq()).version;
    expect(fresh.totalAmount).toBe((Number(v3.netPrice) - Number(before.netPrice)).toFixed(2));
    expect(fresh.lines[0]).toMatchObject({ afterQty: "3" });
  });

  it("ส่งแล้วลูกค้าเห็นและได้แจ้งเตือน · อนุมัติในพอร์ทัล → งวดใหม่ต่อท้าย มูลค่าสัญญาขยับ", async () => {
    const co = (await owner.agent.get(coUrl())).body.changeOrders[0];
    const sent = await owner.agent.post(coUrl(`/${co.id}/send`));
    expect(sent.body.changeOrders[0].status).toBe("SENT");
    const note = await prisma.notification.findFirst({ where: { userId: customer.userId, message: { contains: co.docNo } } });
    expect(note?.link).toBe("/my/contracts");

    const mine = (await customer.agent.get("/api/my/contracts")).body.contracts[0];
    expect(mine.changeOrders).toEqual([expect.objectContaining({ id: co.id, status: "SENT", totalAmount: co.totalAmount })]);

    const planBefore = await installments();
    const approved = await customer.agent.post(`/api/my/contracts/${contractId}/change-orders/${co.id}/respond`).send({ decision: "APPROVE" });
    expect(approved.status).toBe(200);
    const mineAfter = approved.body.contracts[0];
    expect(mineAfter.changeOrders[0]).toMatchObject({ status: "APPROVED", respondedVia: "PORTAL" });

    const plan = await installments();
    expect(plan).toHaveLength(planBefore.length + 1);
    const added = plan.at(-1)!;
    expect(added).toMatchObject({ changeOrderId: co.id, milestone: `งานเพิ่ม-ลด ครั้งที่ 1 (${co.docNo})` });
    expect(Number(added.amount).toFixed(2)).toBe(co.totalAmount);

    const payments = (await owner.agent.get(`/api/projects/${projectId}/contracts/${contractId}/payments`)).body;
    const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    const current = Math.round((Number(contract.amount) + Number(co.totalAmount)) * 100) / 100;
    expect(payments.contractAmount).toBe(current);
    expect(sum(plan)).toBe(current);
    expect(mineAfter.currentAmount).toBe(current.toFixed(2));
    expect((await prisma.notification.count({ where: { userId: owner.userId, message: { contains: "ลูกค้าอนุมัติใบงานเพิ่ม-ลด" } } })) > 0).toBe(true);
  });

  it("งานลด (บันทึกจากใบที่เซ็นกระดาษ) → หักงวดท้ายที่ยังไม่ได้รับ เก็บยอดตามสัญญาไว้", async () => {
    await editLine("งานโครงสร้าง", { quantity: 9 });
    const created = await owner.agent.post(coUrl()).send({ title: "ตัดงานโครงสร้างออกหนึ่งชุด" });
    const co = created.body.changeOrders.at(-1);
    expect(co.seq).toBe(2);
    expect(Number(co.totalAmount)).toBeLessThan(0);
    expect(co.lines).toEqual([expect.objectContaining({ kind: "changed", beforeQty: "10", afterQty: "9" })]);

    const planBefore = await installments();
    const res = await owner.agent.post(coUrl(`/${co.id}/decision`)).send({ decision: "APPROVE", note: "ลูกค้าเซ็นที่หน้างาน" });
    expect(res.status).toBe(200);
    expect(res.body.changeOrders.at(-1)).toMatchObject({ status: "APPROVED", respondedVia: "PAPER" });

    const plan = await installments();
    expect(plan).toHaveLength(planBefore.length);
    // งวดท้ายสุด (งวดของใบที่ 1) ถูกหักก่อน และจำยอดเดิมไว้
    const last = plan.at(-1)!;
    const lastBefore = planBefore.at(-1)!;
    expect(Number(last.amount)).toBeLessThan(Number(lastBefore.amount));
    expect(Number(last.originalAmount)).toBe(Number(lastBefore.amount));
    expect(sum(plan)).toBe(Number(res.body.currentAmount));
    expect(res.body.changeOrders.at(-1).installmentChanges[0]).toMatchObject({ seq: last.seq });
  });

  it("ลูกค้าไม่อนุมัติต้องบอกเหตุผล · ไม่อนุมัติแล้วเงินไม่ขยับ", async () => {
    await addLine("รั้วหน้าบ้าน", 1, 20_000);
    const co = (await owner.agent.post(coUrl()).send({ title: "ทำรั้วเพิ่ม" })).body.changeOrders.at(-1);
    await owner.agent.post(coUrl(`/${co.id}/send`));
    const url = `/api/my/contracts/${contractId}/change-orders/${co.id}/respond`;
    expect((await customer.agent.post(url).send({ decision: "REJECT" })).status).toBe(400);

    const planBefore = await installments();
    const rejected = await customer.agent.post(url).send({ decision: "REJECT", note: "ขอเลื่อนไปปีหน้า" });
    expect(rejected.body.contracts[0].changeOrders.at(-1)).toMatchObject({ status: "REJECTED", responseNote: "ขอเลื่อนไปปีหน้า" });
    expect(sum(await installments())).toBe(sum(planBefore));
    expect((await customer.agent.post(url).send({ decision: "APPROVE" })).status).toBe(409);
    expect((await owner.agent.get(coUrl())).body.blocker).toBeNull();
  });

  it("ยกเลิกใบที่ส่งแล้ว → ลูกค้าได้แจ้งเตือน และไม่เห็นใบนั้นอีก · ร่างที่ยังไม่ส่งลูกค้าไม่เห็นเลย", async () => {
    const draft = (await owner.agent.post(coUrl()).send({ title: "ร่างที่ยังไม่ส่ง" })).body.changeOrders.at(-1);
    let mine = (await customer.agent.get("/api/my/contracts")).body.contracts[0];
    expect(mine.changeOrders.some((c: { id: string }) => c.id === draft.id)).toBe(false);
    const other = await createCustomerDirect("test-vo-other");
    userIds.push(other.userId);
    expect(
      (await other.agent.post(`/api/my/contracts/${contractId}/change-orders/${draft.id}/respond`).send({ decision: "APPROVE" })).status,
    ).toBe(404);

    await owner.agent.post(coUrl(`/${draft.id}/send`));
    const cancelled = await owner.agent.post(coUrl(`/${draft.id}/cancel`));
    expect(cancelled.body.changeOrders.at(-1).status).toBe("CANCELLED");
    mine = (await customer.agent.get("/api/my/contracts")).body.contracts[0];
    expect(mine.changeOrders.some((c: { id: string }) => c.id === draft.id)).toBe(false);
    const n = await prisma.notification.findFirst({ where: { userId: customer.userId, message: { contains: `${draft.docNo} ถูกยกเลิก` } } });
    expect(n).not.toBeNull();
  });

  it("PDF: ลูกค้าเปิดใบที่ยกเลิก/ของคนอื่นไม่ได้ (ไม่ถึงขั้นสร้างไฟล์)", async () => {
    // การสร้างไฟล์จริงใช้ Puppeteer ซึ่งรันใต้ jest ไม่ได้ — เนื้อเอกสารตรวจที่ tests/lib/change-order-pdf.test.ts
    const rows = (await owner.agent.get(coUrl())).body.changeOrders;
    const cancelled = rows.find((r: { status: string }) => r.status === "CANCELLED");
    expect((await customer.agent.get(`/api/my/contracts/${contractId}/change-orders/${cancelled.id}/pdf`)).status).toBe(404);
  });

  it("PDF: พนักงานและลูกค้าเปิดใบที่อนุมัติแล้วได้ ด้วยตัวเลขของใบนั้น", async () => {
    const approved = (await owner.agent.get(coUrl())).body.changeOrders.find((r: { seq: number }) => r.seq === 1);
    renderedVo.length = 0;
    const staff = await owner.agent.get(coUrl(`/${approved.id}/pdf`));
    expect(staff.status).toBe(200);
    expect(staff.headers["content-type"]).toBe("application/pdf");
    expect(staff.headers["content-disposition"]).toContain(`${approved.docNo}.pdf`);
    const mine = await customer.agent.get(`/api/my/contracts/${contractId}/change-orders/${approved.id}/pdf`);
    expect(mine.status).toBe(200);
    expect(renderedVo).toHaveLength(2);
    expect(renderedVo[0].totalAmount.toFixed(2)).toBe(approved.totalAmount);
    expect(renderedVo[0].extensionDays).toBe(7);
  });

  it("ใบที่ปิดแล้ว (อนุมัติ/ไม่อนุมัติ/ยกเลิก) แก้ คิดใหม่ ส่ง ยกเลิก หรือบันทึกผลซ้ำไม่ได้", async () => {
    const rows = (await owner.agent.get(coUrl())).body.changeOrders as { id: string; status: string }[];
    const closed = ["APPROVED", "REJECTED", "CANCELLED"].map((st) => rows.find((r) => r.status === st)!);
    for (const co of closed) {
      const edit = await owner.agent.patch(coUrl(`/${co.id}`)).send({ title: "แก้หลังปิด" });
      expect(edit.status).toBe(409);
      expect(edit.body.error).toBe("แก้ได้เฉพาะใบที่ยังเป็นร่าง");
      expect((await owner.agent.post(coUrl(`/${co.id}/refresh`))).body.error).toBe("คิดใหม่ได้เฉพาะใบที่ยังเป็นร่าง");
      expect((await owner.agent.post(coUrl(`/${co.id}/send`))).body.error).toBe("ส่งได้เฉพาะใบที่ยังเป็นร่าง");
      expect((await owner.agent.post(coUrl(`/${co.id}/cancel`))).status).toBe(409);
      const decide = await owner.agent.post(coUrl(`/${co.id}/decision`)).send({ decision: "APPROVE" });
      expect(decide.status).toBe(409);
      expect(decide.body.error).toBe("ใบนี้ปิดไปแล้ว");
    }
    expect((await owner.agent.post(coUrl("/no-such-vo/send"))).status).toBe(404);
  });

  it("ร่างที่ล้าหลัง BOQ บันทึกว่าอนุมัติจากกระดาษไม่ได้ · แก้หัวใบได้ · ไม่อนุมัติจากกระดาษได้", async () => {
    await addLine("ทาสีรั้ว", 1, 8_000);
    const draft = (await owner.agent.post(coUrl()).send({ title: "ทาสีรั้วเพิ่ม" })).body.changeOrders.at(-1);
    const renamed = await owner.agent.patch(coUrl(`/${draft.id}`)).send({ title: "ทาสีรั้วรอบบ้าน", note: "สีเดิม", extensionDays: 3 });
    expect(renamed.status).toBe(200);
    expect(renamed.body.changeOrders.at(-1)).toMatchObject({ title: "ทาสีรั้วรอบบ้าน", note: "สีเดิม", extensionDays: 3 });

    await editLine("ทาสีรั้ว", { quantity: 2 });
    const stale = await owner.agent.post(coUrl(`/${draft.id}/decision`)).send({ decision: "APPROVE" });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toContain("คิดใหม่");

    const planBefore = await installments();
    const rejected = await owner.agent.post(coUrl(`/${draft.id}/decision`)).send({ decision: "REJECT", note: "ลูกค้าไม่เอา" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.changeOrders.at(-1)).toMatchObject({ status: "REJECTED", respondedVia: "PAPER", responseNote: "ลูกค้าไม่เอา" });
    expect(sum(await installments())).toBe(sum(planBefore));
  });
});
