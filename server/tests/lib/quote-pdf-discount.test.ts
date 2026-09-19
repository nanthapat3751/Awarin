import { buildCustomerQuotePdfHtml } from "../../src/lib/pdf/customer-quote-pdf";
import { buildQuotePdfHtml } from "../../src/lib/pdf/quote-pdf";

/**
 * ตัวเลขบนเอกสารที่ส่งให้ลูกค้าไปแล้วแก้ย้อนหลังไม่ได้ — เทสต์ชุดนี้อ่าน HTML ที่จะถูกพิมพ์
 * เป็น PDF จริง ๆ แล้วตรวจว่าแถวส่วนลดขึ้นถูกที่ ถูกยอด และ "ไม่ขึ้น" เมื่อไม่มีส่วนลด
 */

const COMPANY = {
  companyName: "Awarin Engineering Co., Ltd.",
  companyAddress: "252/54 หมู่ 5 ตำบลธรรมศาลา อำเภอเมืองนครปฐม จังหวัดนครปฐม",
  companyPhone: "090 989 8342",
  companyTaxId: null,
};

const DOC = {
  quoteNo: "QT-2026-0001",
  revisionNo: 1,
  projectNo: "PJ-2026-0001",
  projectName: "บ้านพักอาศัย 2 ชั้น",
  customerName: "คุณทดสอบ",
  customerAddress: null,
  siteAddress: null,
  date: new Date("2026-08-30T00:00:00Z"),
};

const GROUP = {
  categoryLabel: "1",
  categoryName: "งานโครงสร้าง",
  items: [],
  subtotal: 1100,
};

/** ต้นทุน 1,000 + กำไร 10% = 1,100 → ลด 10% = 110 → 990 → VAT 7% = 69.3 → 1,059.30 */
const staffData = {
  ...COMPANY,
  ...DOC,
  groups: [GROUP],
  directCost: 1000,
  overheadProfitPct: 10,
  overheadProfitAmt: 100,
  discountPct: 10,
  discountAmt: 110,
  discountNote: "ส่วนลดโปรโมชัน",
  vatPct: 7,
  vatAmt: 69.3,
  netPrice: 1059.3,
};

const customerData = {
  ...COMPANY,
  ...DOC,
  groups: [GROUP],
  beforeDiscount: 1100,
  discountPct: 10,
  discountAmt: 110,
  discountNote: "ส่วนลดโปรโมชัน",
  subtotalBeforeVat: 990,
  vatPct: 7,
  vatAmt: 69.3,
  netPrice: 1059.3,
};

/** ลำดับที่ตัวเลขโผล่ในเอกสาร — ส่วนลดต้องอยู่ "ก่อน" บรรทัดฐานภาษี ไม่ใช่หลัง */
function orderOf(html: string, ...needles: string[]): number[] {
  return needles.map((n) => html.indexOf(n));
}

describe("แถวส่วนลดในใบ BOQ ของพนักงาน", () => {
  it("พิมพ์แถวส่วนลดพร้อม % เหตุผล และยอดติดลบ", () => {
    const html = buildQuotePdfHtml(staffData);
    expect(html).toContain("ส่วนลด (10%)");
    expect(html).toContain("ส่วนลดโปรโมชัน");
    expect(html).toContain("-110.00");
  });

  it("ยอดก่อน VAT บนเอกสารเป็นยอดหลังหักส่วนลด", () => {
    const html = buildQuotePdfHtml(staffData);
    // 1,000 + 100 − 110 = 990 (ไม่ใช่ 1,100 ซึ่งเป็นยอดก่อนลด)
    expect(html).toContain("990.00");
    const [oh, discount, beforeVat] = orderOf(html, "ค่าดำเนินการและกำไร", "ส่วนลด (10%)", "รวมมูลค่าก่อนภาษีมูลค่าเพิ่ม");
    expect(oh).toBeLessThan(discount);
    expect(discount).toBeLessThan(beforeVat);
  });

  it("ลดเป็นจำนวนเงิน: ไม่มีวงเล็บ % ให้อ่านสับสน", () => {
    const html = buildQuotePdfHtml({ ...staffData, discountPct: null, discountNote: null });
    expect(html).toContain('class="label">ส่วนลด</td>');
    expect(html).not.toContain("ส่วนลด (");
  });

  it("ไม่มีส่วนลด = ไม่มีแถวส่วนลดเลย (ใบเดิมต้องหน้าตาเหมือนเดิม)", () => {
    const html = buildQuotePdfHtml({
      ...staffData,
      discountPct: null,
      discountAmt: 0,
      discountNote: null,
      vatAmt: 77,
      netPrice: 1177,
    });
    // ตรวจที่ "แถว" ไม่ใช่คำโดด ๆ — คำว่าส่วนลดอาจไปโผล่ในชื่อโครงการหรือหมายเหตุได้
    expect(html).not.toContain('class="label">ส่วนลด');
    expect(html).toContain("1,100.00"); // ยอดก่อน VAT กลับเป็นเต็ม
  });

  it("เหตุผลส่วนลดถูก escape ไม่ให้แทรก HTML ลงเอกสาร", () => {
    const html = buildQuotePdfHtml({ ...staffData, discountNote: "<b>ลด</b>" });
    expect(html).toContain("&lt;b&gt;ลด&lt;/b&gt;");
  });
});

describe("แถวส่วนลดในใบเสนอราคาของลูกค้า", () => {
  it("โชว์ยอดก่อนลดด้วย เพื่อให้บวกราคาทุกหมวดแล้วตรงกัน", () => {
    const html = buildCustomerQuotePdfHtml(customerData);
    expect(html).toContain("รวมมูลค่างาน");
    expect(html).toContain("1,100.00"); // = ผลบวกของ subtotal ทุกหมวด
    expect(html).toContain("-110.00");
    expect(html).toContain("990.00");

    const [beforeDiscount, discount, beforeVat] = orderOf(
      html,
      "รวมมูลค่างาน",
      "ส่วนลด (10%)",
      "รวมมูลค่าก่อนภาษีมูลค่าเพิ่ม",
    );
    expect(beforeDiscount).toBeLessThan(discount);
    expect(discount).toBeLessThan(beforeVat);
  });

  it("BR-09: ต้องไม่มีต้นทุนหรืออัตรากำไรหลุดลงใบของลูกค้า", () => {
    const html = buildCustomerQuotePdfHtml(customerData);
    expect(html).not.toContain("ต้นทุน");
    expect(html).not.toContain("ค่าดำเนินการ");
  });

  it("ไม่มีส่วนลด = ใบหน้าตาเหมือนเดิม ไม่มีบรรทัดเกิน", () => {
    const html = buildCustomerQuotePdfHtml({
      ...customerData,
      discountPct: null,
      discountAmt: 0,
      discountNote: null,
      subtotalBeforeVat: 1100,
      vatAmt: 77,
      netPrice: 1177,
    });
    expect(html).not.toContain('class="label">ส่วนลด');
    expect(html).not.toContain('class="label">รวมมูลค่างาน');
  });
});
