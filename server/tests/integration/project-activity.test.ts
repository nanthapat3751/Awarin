import { prisma } from "../../src/lib/prisma";
import { ACTIVITY_PAGE_SIZE, getProjectActivity } from "../../src/modules/projects/activity.service";
import { createAndLoginOwner } from "../helpers/test-auth";

/**
 * ไทม์ไลน์กิจกรรมของโครงการ — แปลงแถว AuditLog เป็นประโยคที่คนอ่านรู้เรื่อง
 *
 * เขียนแถว AuditLog ตรง ๆ ทีละแบบ (แทนการเดินทั้งดีลผ่าน API) เพื่อตรวจคำบรรยายของทุกเหตุการณ์
 * ให้ครบ รวมถึงแถวเก่าที่ไม่มีคีย์ใหม่ ๆ ใน details — ของจริงมีแถวแบบนั้นค้างอยู่ในฐานข้อมูล
 */
describe("project activity timeline wording", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let projectId: string;
  const base = Date.now() - 60 * 60 * 1000;
  let seq = 0;

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-activity");
    const p = await prisma.project.create({
      data: { projectNo: `T-ACT-${Date.now()}`, name: "โครงการไทม์ไลน์", createdById: owner.userId },
    });
    projectId = p.id;
  });

  afterAll(async () => {
    // AuditLog เป็น append-only (role ของแอปลบไม่ได้) — แถวที่เขียนไว้ค้างตามเดิมแบบเทสต์อื่น
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.session.deleteMany({ where: { userId: owner.userId } });
    await prisma.user.deleteMany({ where: { id: owner.userId } });
    await prisma.$disconnect();
  });

  /** เขียนเหตุการณ์หนึ่งแถว แล้วคืนบรรทัดที่ไทม์ไลน์แปลออกมา (หรือ undefined ถ้าไม่ขึ้นไทม์ไลน์) */
  async function line(action: string, details: Record<string, unknown> | null = {}) {
    const row = await prisma.auditLog.create({
      data: {
        userId: owner.userId,
        action,
        entityType: "Project",
        entityId: projectId,
        details: details === null ? undefined : (details as object),
        createdAt: new Date(base + ++seq * 1000),
      },
    });
    const { activity } = await getProjectActivity(projectId, 1);
    return activity.find((a) => a.id === row.id);
  }

  it("returns an empty page for a project that does not exist", async () => {
    expect(await getProjectActivity("no-such-project")).toEqual({
      activity: [],
      page: 1,
      pageSize: ACTIVITY_PAGE_SIZE,
      total: 0,
    });
  });

  it("describes project and customer-account events", async () => {
    expect(await line("CREATE_PROJECT", { name: "บ้านคุณเอ" })).toMatchObject({
      kind: "created",
      title: "สร้างโครงการ",
      detail: "บ้านคุณเอ",
      actor: "Test Owner",
    });
    expect(await line("LINK_LEAD_TO_PROJECT")).toMatchObject({ title: "ผูกโครงการเข้ากับคำขอของลูกค้า" });
    expect(await line("CREATE_CUSTOMER_FROM_LEAD", { email: "a@example.com" })).toMatchObject({
      kind: "customer",
      detail: "a@example.com",
    });
    expect(await line("CREATE_CUSTOMER_FOR_PROJECT", { email: "" })).toMatchObject({
      title: "สร้างบัญชีลูกค้าให้โครงการ",
      detail: null,
    });
    expect(await line("ISSUE_ACCESS_LINK")).toMatchObject({ title: "ออกลิงก์เข้าใช้งานให้ลูกค้า" });
    expect(await line("ACCESS_LINK_REDEEMED")).toMatchObject({ title: "ลูกค้าตั้งรหัสผ่านและเข้าใช้งานแล้ว" });
    expect(await line("UPDATE_PROJECT")).toMatchObject({ kind: "status", title: "แก้ไขรายละเอียดโครงการ" });
    expect(await line("APPLY_TEMPLATE", { templateName: "บ้านชั้นเดียว" })).toMatchObject({
      detail: "บ้านชั้นเดียว",
    });
    expect(await line("SET_CUSTOM_PRICE")).toMatchObject({ title: "ตั้งราคาแบบกำหนดเอง" });
    expect(await line("CREATE_PROJECT_VERSION")).toMatchObject({ kind: "quote" });
  });

  it("describes project status changes, including retired statuses from old rows", async () => {
    expect(await line("TRANSITION_PROJECT", { from: "QUOTED", to: "APPROVED" })).toMatchObject({
      kind: "accepted",
      title: "สถานะโครงการเปลี่ยนเป็น “อนุมัติแล้ว”",
      detail: "จาก “เสนอราคาแล้ว”",
    });
    expect(await line("TRANSITION_PROJECT", { from: "IN_PROGRESS", to: "CANCELLED" })).toMatchObject({
      kind: "rejected",
      detail: "จาก “กำลังก่อสร้าง”",
    });
    expect(await line("TRANSITION_PROJECT", { to: "COMPLETED" })).toMatchObject({ kind: "status", detail: null });
    expect(await line("TRANSITION_PROJECT", { from: "MYSTERY", to: "REJECTED" })).toMatchObject({
      kind: "rejected",
      detail: "จาก “MYSTERY”",
    });
  });

  it("describes quote events with the quote number", async () => {
    const q = { quoteNo: "QT-2026-0001" };
    expect(await line("CREATE_QUOTE", q)).toMatchObject({ title: "ออกใบเสนอราคา QT-2026-0001" });
    expect(await line("CREATE_QUOTE")).toMatchObject({ title: "ออกใบเสนอราคา" });
    expect(await line("DELETE_QUOTE", q)).toMatchObject({ title: "ลบใบเสนอราคา QT-2026-0001 (ฉบับร่าง)" });
    expect(await line("TRANSITION_QUOTE", { ...q, to: "SENT" })).toMatchObject({ kind: "sent" });
    expect(await line("TRANSITION_QUOTE", { ...q, to: "ACCEPTED" })).toMatchObject({
      kind: "accepted",
      detail: "พนักงานบันทึกเอง: ลูกค้ายอมรับ",
    });
    expect(await line("TRANSITION_QUOTE", { ...q, to: "REJECTED" })).toMatchObject({ kind: "rejected" });
    expect(await line("TRANSITION_QUOTE", { ...q, to: "REVISED" })).toMatchObject({
      kind: "customer",
      detail: "พนักงานบันทึกเอง: ขอปรับแก้",
    });
    expect(await line("QUOTE_APPROVAL_REQUESTED", q)).toMatchObject({ title: "ขออนุมัติใบเสนอราคา QT-2026-0001" });
    expect(await line("QUOTE_APPROVED", { ...q, selfProposed: true })).toMatchObject({
      detail: "เจ้าของออกใบและอนุมัติเอง",
    });
    expect(await line("QUOTE_APPROVED", q)).toMatchObject({ detail: null });
    expect(await line("QUOTE_APPROVAL_RETURNED", { ...q, note: "ราคาสูงไป" })).toMatchObject({ detail: "ราคาสูงไป" });
    expect(await line("QUOTE_APPROVAL_WITHDRAWN", q)).toMatchObject({ kind: "status" });
  });

  it("describes the customer's own answers", async () => {
    const q = { quoteNo: "QT-2026-0002" };
    expect(await line("CUSTOMER_RESPOND_QUOTE", { ...q, to: "ACCEPTED", note: "ตกลง" })).toMatchObject({
      kind: "accepted",
      detail: "ตกลง",
    });
    expect(await line("CUSTOMER_RESPOND_QUOTE", { ...q, to: "REJECTED" })).toMatchObject({
      kind: "rejected",
      detail: "ไม่ได้ระบุเหตุผล",
    });
    expect(await line("CUSTOMER_RESPOND_QUOTE", { ...q, to: "REVISED", note: "ขอลดราคา" })).toMatchObject({
      kind: "customer",
      title: "ลูกค้าขอปรับแก้ใบเสนอราคา QT-2026-0002",
    });
  });

  it("shows only the first time a customer opens a quote, and only attachments made visible to them", async () => {
    expect(await line("CUSTOMER_OPEN_QUOTE", { firstView: true })).toMatchObject({ title: "ลูกค้าเปิดดูใบเสนอราคา ครั้งแรก" });
    expect(await line("CUSTOMER_OPEN_QUOTE_PDF", { firstView: false })).toBeUndefined();
    expect(await line("ADD_QUOTE_ATTACHMENT", { fileName: "แบบ.pdf" })).toMatchObject({ kind: "file", detail: "แบบ.pdf" });
    expect(await line("UPDATE_QUOTE_ATTACHMENT", { visibility: "CUSTOMER" })).toMatchObject({
      title: "เปิดไฟล์แนบให้ลูกค้าเห็น",
    });
    expect(await line("UPDATE_QUOTE_ATTACHMENT", { visibility: "STAFF" })).toBeUndefined();
    // เหตุการณ์ที่ไม่ใช่หมุดหมายของดีลไม่ขึ้นไทม์ไลน์เลย
    expect(await line("ADD_BOQ_ITEM", { name: "x" })).toBeUndefined();
  });

  it("describes contracts", async () => {
    expect(await line("CREATE_CONTRACT", { contractNo: "CT-2026-0001" })).toMatchObject({
      kind: "contract",
      title: "ออกสัญญา CT-2026-0001",
    });
    expect(await line("CREATE_CONTRACT")).toMatchObject({ title: "ออกสัญญา" });
    expect(await line("SIGN_CONTRACT")).toMatchObject({ title: "บันทึกว่าลงนามสัญญาแล้ว" });
  });

  describe("rates changes say exactly what moved", () => {
    const rates = (before: object, after: object) => line("UPDATE_VERSION_RATES", { before, after });

    it("falls back to the generic title for old rows without before/after", async () => {
      expect(await line("UPDATE_VERSION_RATES", null)).toMatchObject({
        title: "แก้อัตราค่าดำเนินการ+กำไร / VAT",
        detail: null,
      });
    });

    it("lists margin, VAT and contingency changes", async () => {
      const r = await rates(
        { overheadProfitPct: 10, vatPct: 7 },
        { overheadProfitPct: 12, vatPct: 0, contingencyPct: 3 },
      );
      expect(r).toMatchObject({ title: "แก้อัตราค่าดำเนินการ+กำไร / VAT" });
      expect(r!.detail).toBe("เผื่อเหลือเผื่อขาด 0% → 3% · ค่าดำเนินการ+กำไร 10% → 12% · VAT 7% → 0%");
    });

    it("describes splitting overhead from profit", async () => {
      const r = await rates({ overheadProfitPct: 10, vatPct: 7 }, { overheadProfitPct: 10, overheadPct: 4, vatPct: 7 });
      expect(r!.detail).toBe("ยังไม่ได้แยกค่าดำเนินการกับกำไร → ค่าดำเนินการ 4% + กำไร 6%");
    });

    it("titles a discount-only change as a discount change", async () => {
      const r = await rates(
        { overheadProfitPct: 10, vatPct: 7 },
        { overheadProfitPct: 10, vatPct: 7, discountPct: 5 },
      );
      expect(r).toMatchObject({ title: "แก้ส่วนลด", detail: "ไม่มีส่วนลด → ส่วนลด 5%" });

      const amt = await rates(
        { overheadProfitPct: 10, vatPct: 7, discountPct: 5 },
        { overheadProfitPct: 10, vatPct: 7, discountAmt: 50000 },
      );
      expect(amt!.detail).toBe("ส่วนลด 5% → ส่วนลด 50,000.00 บาท");
    });

    it("titles a combined change and describes rounding", async () => {
      const r = await rates(
        { overheadProfitPct: 10, vatPct: 7 },
        { overheadProfitPct: 8, vatPct: 7, roundingUnit: 1000 },
      );
      expect(r).toMatchObject({ title: "แก้อัตราและส่วนลด" });
      expect(r!.detail).toBe("ค่าดำเนินการ+กำไร 10% → 8% · ไม่ปัดยอด → ปัดยอดสุทธิ: ปัดลงหลักพัน");
    });

    it("gives no detail when nothing actually changed", async () => {
      const r = await rates({ overheadProfitPct: 10, vatPct: 7 }, { overheadProfitPct: 10, vatPct: 7 });
      expect(r).toMatchObject({ detail: null });
    });
  });

  it("pages newest first and clamps an out-of-range page to the last one", async () => {
    const first = await getProjectActivity(projectId, 1);
    expect(first.activity).toHaveLength(ACTIVITY_PAGE_SIZE);
    expect(first.total).toBeGreaterThan(ACTIVITY_PAGE_SIZE);
    const times = first.activity.map((a) => a.at);
    expect([...times].sort().reverse()).toEqual(times);

    const lastPage = Math.ceil(first.total / ACTIVITY_PAGE_SIZE);
    const beyond = await getProjectActivity(projectId, 999);
    expect(beyond.page).toBe(lastPage);
    const junk = await getProjectActivity(projectId, Number.NaN);
    expect(junk.page).toBe(1);
  });
});
