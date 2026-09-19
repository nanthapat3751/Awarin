import { withholdingFor } from "../../src/lib/billing-party";
import { buildContractPdfHtml } from "../../src/lib/pdf/contract-pdf";
import { buildCustomerQuotePdfHtml } from "../../src/lib/pdf/customer-quote-pdf";
import { buildQuotePdfHtml } from "../../src/lib/pdf/quote-pdf";

/**
 * เอกสารสำหรับผู้ว่าจ้างที่เป็นนิติบุคคล
 *
 * อ่าน HTML ที่จะถูกพิมพ์เป็น PDF จริง แล้วตรวจสามเรื่องที่ผิดแล้วแก้ย้อนหลังไม่ได้:
 * ชื่อบนเอกสารเป็นชื่อบริษัท · เลขประจำตัวผู้เสียภาษีของลูกค้าถูกพิมพ์ · ยอดหักภาษี ณ ที่จ่าย
 * อยู่ใต้ยอดรวมและ**ไม่ไปลดยอดรวม**
 */

const COMPANY = {
  companyName: "Awarin Engineering Co., Ltd.",
  companyAddress: "252/54 หมู่ 5 ตำบลธรรมศาลา อำเภอเมืองนครปฐม จังหวัดนครปฐม",
  companyPhone: "090 989 8342",
  companyTaxId: null,
};

const CUSTOMER_COMPANY = {
  customerName: "บริษัท ลูกค้าตัวอย่าง จำกัด",
  customerAddress: "1 ถนนพระราม 4 กรุงเทพฯ",
  customerIsCompany: true,
  customerTaxId: "0105500000001",
  customerBranch: "สำนักงานใหญ่",
  customerContactPerson: "คุณมานี ฝ่ายจัดซื้อ",
};

const CUSTOMER_PERSON = {
  customerName: "คุณสมชาย ใจดี",
  customerAddress: "9 ถนนทดสอบ",
  customerIsCompany: false,
  customerTaxId: null,
  customerBranch: null,
  customerContactPerson: null,
};

const GROUP = {
  categoryLabel: "1",
  categoryName: "งานโครงสร้าง",
  items: [],
  subtotal: 100_000,
};

// 100,000 + VAT 7% = 107,000 → หัก ณ ที่จ่าย 3% ของ 100,000 = 3,000 → โอนจริง 104,000
const TOTALS = { vatPct: 7, vatAmt: 7_000, netPrice: 107_000 };
const WITHHOLDING = withholdingFor({ isCompany: true }, TOTALS.netPrice, TOTALS.vatAmt);

function quoteHtml(party: object, withholding: unknown) {
  return buildQuotePdfHtml({
    ...COMPANY,
    ...(party as typeof CUSTOMER_COMPANY),
    quoteNo: "QT-2026-0001",
    revisionNo: 1,
    projectNo: "PJ-2026-0001",
    projectName: "อาคารสำนักงาน",
    siteAddress: null,
    date: new Date("2026-09-14T00:00:00Z"),
    groups: [GROUP],
    directCost: 90_000,
    overheadProfitPct: 10,
    overheadProfitAmt: 10_000,
    discountPct: null,
    discountAmt: 0,
    discountNote: null,
    ...TOTALS,
    withholding: withholding as never,
  });
}

describe("ใบเสนอราคาสำหรับลูกค้านิติบุคคล", () => {
  it("พิมพ์ชื่อบริษัท เลขประจำตัวผู้เสียภาษี สาขา และผู้ประสานงาน", () => {
    const html = quoteHtml(CUSTOMER_COMPANY, WITHHOLDING);
    expect(html).toContain("บริษัท ลูกค้าตัวอย่าง จำกัด");
    expect(html).toContain("เลขประจำตัวผู้เสียภาษี 0105500000001");
    expect(html).toContain("สำนักงานใหญ่");
    expect(html).toContain("ผู้ประสานงาน: คุณมานี ฝ่ายจัดซื้อ");
  });

  it("แถวหัก ณ ที่จ่ายอยู่ใต้ยอดรวม และยอดรวมทั้งสิ้นยังเป็นค่าเดิม", () => {
    const html = quoteHtml(CUSTOMER_COMPANY, WITHHOLDING);
    expect(html).toContain("หักภาษี ณ ที่จ่าย 3%");
    expect(html).toContain("-3,000.00");
    expect(html).toContain("ยอดชำระสุทธิ");
    expect(html).toContain("104,000.00");

    // ยอดรวมทั้งสิ้นต้องไม่ถูกหัก — เงินที่หักไว้เป็นภาษีที่ผู้ว่าจ้างนำส่งแทน ไม่ใช่ส่วนลด
    const grandRow = html.slice(html.indexOf("รวมมูลค่าทั้งสิ้น"));
    expect(grandRow).toContain("107,000.00");
    expect(html).toContain("ยอดที่หักไม่ใช่ส่วนลด");
  });

  it("บุคคลธรรมดาไม่มีบรรทัดหัก ณ ที่จ่าย และไม่มีช่องของนิติบุคคลเลย", () => {
    const html = quoteHtml(CUSTOMER_PERSON, null);
    expect(html).toContain("คุณสมชาย ใจดี");
    expect(html).not.toContain("หักภาษี ณ ที่จ่าย");
    expect(html).not.toContain("เลขประจำตัวผู้เสียภาษี 0105500000001");
    expect(html).not.toContain("ผู้ประสานงาน");
  });

  it("ใบเสนอราคาฉบับลูกค้าแสดงชุดเดียวกัน (เอกสารคนละใบต้องไม่เรียกผู้ว่าจ้างคนละชื่อ)", () => {
    const html = buildCustomerQuotePdfHtml({
      ...COMPANY,
      ...CUSTOMER_COMPANY,
      quoteNo: "QT-2026-0001",
      revisionNo: 1,
      projectNo: "PJ-2026-0001",
      projectName: "อาคารสำนักงาน",
      siteAddress: null,
      date: new Date("2026-09-14T00:00:00Z"),
      groups: [GROUP],
      beforeDiscount: 100_000,
      discountPct: null,
      discountAmt: 0,
      discountNote: null,
      subtotalBeforeVat: 100_000,
      ...TOTALS,
      withholding: WITHHOLDING,
    });

    expect(html).toContain("บริษัท ลูกค้าตัวอย่าง จำกัด");
    expect(html).toContain("เลขประจำตัวผู้เสียภาษี 0105500000001");
    expect(html).toContain("หักภาษี ณ ที่จ่าย 3%");
    expect(html).toContain("104,000.00");
  });
});

describe("สัญญาสำหรับลูกค้านิติบุคคล", () => {
  const BODY = {
    coverSubtitle: null,
    preamble: "สัญญาฉบับทดสอบ",
    clauses: [{ heading: "ข้อ 7 การชำระเงิน", body: "แบ่งจ่ายดังนี้ {{ตารางงวดงาน}}" }],
    closing: null,
  };

  function contractHtml(withholding: unknown) {
    return buildContractPdfHtml({
      ...COMPANY,
      ...CUSTOMER_COMPANY,
      contractNo: "CT-2026-0001",
      projectNo: "PJ-2026-0001",
      projectName: "อาคารสำนักงาน",
      siteAddress: null,
      startDate: null,
      targetEndDate: null,
      date: new Date("2026-09-14T00:00:00Z"),
      contractAmount: TOTALS.netPrice,
      signedAt: null,
      docTitle: "สัญญาก่อสร้าง",
      body: BODY as never,
      installments: [
        { seq: 1, milestone: "ลงนามสัญญา", amount: 53_500 },
        { seq: 2, milestone: "ส่งมอบงาน", amount: 53_500 },
      ],
      withholding: withholding as never,
    });
  }

  it("หน้าปกและเนื้อสัญญาระบุเลขประจำตัวผู้เสียภาษีของผู้ว่าจ้าง", () => {
    const html = contractHtml(WITHHOLDING);
    expect(html).toContain("0105500000001");
  });

  it("แต่ละงวดบอกยอดหักและยอดโอนสุทธิ และยอดงวดยังเป็นค่าเดิม", () => {
    const html = contractHtml(WITHHOLDING);
    expect(html).toContain("งวดที่ 1");
    expect(html).toContain("53,500.00");
    expect(html).toContain("หักภาษี ณ ที่จ่าย 3% 1,500.00 บาท · โอนสุทธิ 52,000.00 บาท");
    expect(html).toContain("รวมทั้งสิ้น");
    expect(html).toContain("มูลค่าสัญญายังคงเดิม");
  });

  it("สัญญาที่แยกฐานภาษีไม่ได้ (ของเก่า) ต้องไม่พิมพ์ตัวเลขที่เดาเอา", () => {
    const html = contractHtml(null);
    expect(html).toContain("งวดที่ 1");
    expect(html).not.toContain("หักภาษี ณ ที่จ่าย");
  });
});
