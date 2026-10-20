import { buildChangeOrderHtml, type ChangeOrderPdfData } from "../../src/lib/pdf/change-order-pdf";

const BASE: ChangeOrderPdfData = {
  companyName: "Awarin Engineering Co., Ltd.",
  companyAddress: "252/54 หมู่ 5 ตำบลธรรมศาลา",
  companyPhone: "090 989 8342",
  logo: null,
  customerName: "คุณปวีณา แสงกล้า",
  customerAddress: "หมู่ 7 ต.บ้านแพ้ว",
  docNo: "VO-2026-0001",
  seq: 1,
  status: "SENT",
  date: new Date("2026-10-02T03:00:00Z"),
  contractNo: "CT-2026-0001",
  contractSignedAt: new Date("2026-09-01T03:00:00Z"),
  projectNo: "PRJ-2026-0001",
  projectName: "บ้านพักอาศัย 2 ชั้น",
  title: "ลูกค้าขอทำกันสาดเพิ่ม",
  note: null,
  extensionDays: 7,
  lines: [
    {
      kind: "added",
      categoryCode: "C-07",
      name: "ต่อเติมหลังคากันสาด",
      unit: "ตร.ม.",
      beforeQty: null,
      afterQty: "12",
      beforeUnitPrice: null,
      afterUnitPrice: "1100.00",
      beforeTotal: "0.00",
      afterTotal: "13200.00",
      delta: "13200.00",
    },
    {
      kind: "removed",
      categoryCode: "C-06",
      name: "ฝ้าระแนง <ไม้เทียม>",
      unit: "ตร.ม.",
      beforeQty: "5",
      afterQty: null,
      beforeUnitPrice: "880.00",
      afterUnitPrice: null,
      beforeTotal: "4400.00",
      afterTotal: "0.00",
      delta: "-4400.00",
    },
  ],
  addAmount: 13200,
  deductAmount: 4400,
  adjustAmount: 0,
  netBeforeVat: 8800,
  vatAmount: 616,
  totalAmount: 9416,
  amountBefore: 1_177_000,
  amountAfter: 1_186_416,
  respondedAt: null,
  respondedVia: null,
  contractorName: "นายสมชาย ใจดี",
  contractorTitle: "กรรมการผู้จัดการ",
  installmentChanges: null,
};

/** ใบแจ้งงานเพิ่ม-ลด: เนื้อเอกสารที่ลูกค้าเซ็น ต้องบอกครบว่าอะไรเปลี่ยน เงินเท่าไร และสัญญาใหม่เท่าไร */
describe("PDF ใบแจ้งงานเพิ่ม-ลด", () => {
  it("มีรายการเดิม/ใหม่ ยอดเพิ่ม-ลด มูลค่าสัญญาก่อน/หลัง ตัวหนังสือ และอ้างสัญญาเดิม", () => {
    const html = buildChangeOrderHtml(BASE);
    for (const text of [
      "ใบแจ้งงานเพิ่ม-ลด",
      "VO-2026-0001",
      "อ้างอิงสัญญา CT-2026-0001",
      "ลูกค้าขอทำกันสาดเพิ่ม",
      "12 × 1,100.00",
      "+13,200.00",
      "−4,400.00",
      "มูลค่างานเพิ่มขึ้นสุทธิ",
      "+9,416.00",
      "1,177,000.00",
      "1,186,416.00",
      "(เพิ่มขึ้น เก้าพันสี่ร้อยสิบหกบาทถ้วน)",
      "ขยายระยะเวลาก่อสร้างออกไปอีก 7 วัน",
      "คงเดิมทุกประการ",
      "นายสมชาย ใจดี",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("ข้อความจากผู้ใช้ไม่กลายเป็น HTML", () => {
    expect(buildChangeOrderHtml(BASE)).toContain("ฝ้าระแนง &lt;ไม้เทียม&gt;");
  });

  it("สถานะพิมพ์ชัด: ร่างมีลายน้ำ · ยกเลิกมีแถบเตือน · อนุมัติในพอร์ทัลบอกที่ช่องเซ็น", () => {
    expect(buildChangeOrderHtml({ ...BASE, status: "DRAFT" })).toContain('class="watermark"');
    expect(buildChangeOrderHtml({ ...BASE, status: "CANCELLED" })).toContain("ใบนี้ถูกยกเลิกแล้ว");
    const approved = buildChangeOrderHtml({
      ...BASE,
      status: "APPROVED",
      respondedVia: "PORTAL",
      respondedAt: new Date("2026-10-03T03:00:00Z"),
      installmentChanges: [{ seq: 8, milestone: "งานเพิ่ม-ลด ครั้งที่ 1", from: null, to: "9416.00" }],
    });
    expect(approved).toContain("อนุมัติผ่านระบบออนไลน์");
    expect(approved).toContain("งวดที่ 8 (ใหม่) 9,416.00 บาท");
  });

  it("งานลดสุทธิเขียนตัวหนังสือว่าลดลง", () => {
    const html = buildChangeOrderHtml({ ...BASE, totalAmount: -4708, netBeforeVat: -4400, vatAmount: -308 });
    expect(html).toContain("มูลค่างานลดลงสุทธิ");
    expect(html).toContain("(ลดลง สี่พันเจ็ดร้อยแปดบาทถ้วน)");
    expect(html).toContain("หักจากงวดท้ายที่ยังไม่ได้ชำระ");
  });
});
