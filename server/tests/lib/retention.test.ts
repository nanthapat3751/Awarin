import { retentionBalance, retentionOf, withholdingAfterRetention } from "@systemboq/shared-types";

import { retentionSetAfterSigning } from "../../src/lib/contract-retention";
import {
  buildContractVariables,
  DEFAULT_CONTRACT_TEMPLATE,
  renderStructure,
} from "../../src/lib/contract-template";
import { buildBillingDocHtml, billingGrandTotal, type BillingDocPdfData } from "../../src/lib/pdf/billing-doc-pdf";
import { buildContractPdfHtml } from "../../src/lib/pdf/contract-pdf";

describe("สูตรเงินประกันผลงาน", () => {
  it("กันตาม % ของยอดงวด · ไม่มี % = ไม่กัน", () => {
    expect(retentionOf(107_000, 5)).toBe(5_350);
    expect(retentionOf(107_000, null)).toBe(0);
    expect(retentionOf(107_000, 0)).toBe(0);
    expect(retentionOf(33_333.33, 5)).toBe(1_666.67);
  });

  it("ภาษีหัก ณ ที่จ่ายของงวดคิดจากส่วนที่จ่ายจริง", () => {
    // งวด 107,000 ภาษีเต็มงวด 3,000 → กันไว้ 5% เหลือจ่าย 95% → หัก 2,850
    expect(withholdingAfterRetention(3_000, 107_000, 5_350)).toBe(2_850);
    expect(withholdingAfterRetention(3_000, 107_000, 0)).toBe(3_000);
  });

  it("ยอดรอคืน · คืนเกินไม่ถูกตัดทิ้ง · เลยวันครบกำหนดนับเฉพาะตอนยังคืนไม่ครบ", () => {
    const base = { held: 10_000, dueOn: "2026-10-01", today: "2026-10-11" };
    expect(retentionBalance({ ...base, releases: [] })).toMatchObject({ outstanding: 10_000, daysOverdue: 10 });
    expect(retentionBalance({ ...base, releases: [{ amount: 4_000, withholdingAmount: 100 }] })).toMatchObject({
      released: 4_000,
      outstanding: 6_000,
      withheldOnRelease: 100,
    });
    expect(retentionBalance({ ...base, releases: [{ amount: 10_005, withholdingAmount: 0 }] })).toMatchObject({
      outstanding: 0,
      overReleased: 5,
      daysOverdue: null,
    });
    expect(retentionBalance({ held: 1, releases: [], dueOn: null, today: "2026-10-11" }).daysOverdue).toBeNull();
  });

  it("% ที่ตั้งหลังวันลงนามไม่นับว่าอยู่ในสัญญาที่เซ็น", () => {
    const signedAt = new Date("2026-09-01T00:00:00Z");
    expect(retentionSetAfterSigning({ signedAt, retentionSetAt: new Date("2026-08-30T00:00:00Z") })).toBe(false);
    expect(retentionSetAfterSigning({ signedAt, retentionSetAt: new Date("2026-09-05T00:00:00Z") })).toBe(true);
    expect(retentionSetAfterSigning({ signedAt: null, retentionSetAt: new Date() })).toBe(false);
  });
});

const DOC: BillingDocPdfData = {
  companyName: "Awarin Engineering Co., Ltd.",
  companyAddress: "252/54 หมู่ 5",
  companyPhone: "090 989 8342",
  companyTaxId: null,
  logo: null,
  type: "RECEIPT",
  isTaxInvoice: true,
  docNo: "RC-2026-0001",
  issuedOn: new Date("2026-10-02T00:00:00Z"),
  dueOn: null,
  contractNo: "CT-2026-0001",
  projectNo: "PRJ-2026-0001",
  projectName: "บ้านพักอาศัย",
  seq: 2,
  milestone: "หล่อพื้นชั้น 2",
  customerName: "คุณทดสอบ",
  customerAddress: "กรุงเทพฯ",
  amount: 107_000,
  vatAmount: 6_650,
  paidBefore: null,
  withholdingAmount: 0,
  retentionAmount: 5_350,
  method: "TRANSFER",
  reference: null,
  issuedByName: "ผู้รับเงิน",
  issuedByTitle: null,
  signatureDataUrl: null,
  voidedAt: null,
  voidReason: null,
};

describe("ใบเสร็จ/ใบแจ้งหนี้ที่มีเงินประกันผลงาน", () => {
  it("ใบเสร็จ: ยอดงวดเต็ม → หักส่วนที่กัน → มูลค่าที่รับจริง แยก VAT จากยอดที่รับจริง", () => {
    expect(billingGrandTotal(DOC)).toBe(101_650);
    const html = buildBillingDocHtml(DOC);
    expect(html).toContain("ค่างานงวดที่ 2");
    expect(html).toContain("หัก เงินประกันผลงานที่ผู้ว่าจ้างกันไว้");
    expect(html).toContain("95,000.00"); // ก่อน VAT ของ 101,650
    expect(html).toContain("101,650.00");
    expect(html).toContain("หนึ่งแสนหนึ่งพันหกร้อยห้าสิบบาทถ้วน");
  });

  it("ใบแจ้งหนี้: บอกยอดที่จะถูกกัน และยอดที่ต้องโอนจริง พร้อมบอกว่าเงินส่วนนี้คืนเมื่อไร", () => {
    const html = buildBillingDocHtml({ ...DOC, type: "INVOICE", isTaxInvoice: false, vatAmount: 7_000, withholdingAmount: 2_850 });
    expect(html).toContain("หัก เงินประกันผลงาน");
    expect(html).toContain("ยอดที่ต้องชำระ");
    expect(html).toContain("98,800.00"); // 101,650 − 2,850
    expect(html).toContain("จะคืนให้เมื่อพ้นระยะรับประกันผลงาน");
  });

  it("ใบคืนเงินประกันไม่อ้างงวด", () => {
    const html = buildBillingDocHtml({ ...DOC, forRetention: true, seq: 0, retentionAmount: null, amount: 16_050, vatAmount: 1_050 });
    expect(html).toContain("รับคืนเงินประกันผลงาน");
    expect(html).not.toContain("งวดที่ 0");
  });
});

describe("สัญญา PDF ที่มีเงินประกันผลงาน", () => {
  const vars = buildContractVariables({
    customerName: "คุณทดสอบ",
    customerAddress: null,
    companyName: "Awarin",
    companyAddress: "ที่อยู่",
    companyPhone: "02",
    companyTaxId: null,
    projectName: "บ้าน",
    projectNo: "PRJ-1",
    siteAddress: null,
    contractNo: "CT-1",
    contractDate: new Date(2026, 9, 1),
    contractAmount: 214_000,
    startDate: null,
    targetEndDate: null,
  });
  const html = (retentionPct: number | null) =>
    buildContractPdfHtml({
      companyName: "Awarin",
      companyAddress: "ที่อยู่",
      companyPhone: "02",
      companyTaxId: null,
      contractNo: "CT-1",
      projectNo: "PRJ-1",
      projectName: "บ้าน",
      customerName: "คุณทดสอบ",
      customerAddress: null,
      siteAddress: null,
      startDate: null,
      targetEndDate: null,
      date: new Date(2026, 9, 1),
      contractAmount: 214_000,
      signedAt: null,
      docTitle: DEFAULT_CONTRACT_TEMPLATE.docTitle,
      body: renderStructure(DEFAULT_CONTRACT_TEMPLATE.structure, vars),
      installments: [
        { seq: 1, milestone: "เซ็นสัญญา", amount: 107_000 },
        { seq: 2, milestone: "ส่งมอบงาน", amount: 107_000 },
      ],
      retentionPct,
    });

  it("ทุกงวดบอกยอดที่ถูกกันและโอนสุทธิ + ข้อความว่าคืนเมื่อพ้นประกัน", () => {
    const out = html(5);
    expect(out).toContain("หักเงินประกันผลงาน 5% 5,350.00 บาท · โอนสุทธิ 101,650.00 บาท");
    expect(out).toContain("ผู้ว่าจ้างหักเงินประกันผลงานไว้ร้อยละ 5 ของเงินค่าจ้างแต่ละงวด รวม 10,700.00 บาท");
  });

  it("ไม่มีเงินประกัน = ไม่มีบรรทัดเหล่านี้เลย", () => {
    expect(html(null)).not.toContain("เงินประกันผลงาน");
  });
});
