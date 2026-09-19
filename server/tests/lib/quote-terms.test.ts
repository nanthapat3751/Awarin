import { renderQuoteTerms } from "../../src/lib/pdf/company-blocks";
import { buildCustomerQuotePdfHtml } from "../../src/lib/pdf/customer-quote-pdf";
import {
  addDaysIso,
  isQuoteExpired,
  quoteTermsFrom,
  quoteValidityDaysFrom,
  termLines,
  validUntilFrom,
} from "../../src/lib/quote-terms";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("ยืนราคา — จำนวนวันจากหน้าตั้งค่า", () => {
  it("รับเฉพาะจำนวนเต็ม 1–365 ค่าอื่นถือว่าไม่ได้ตั้ง", () => {
    expect(quoteValidityDaysFrom({ quoteValidityDays: "30" })).toBe(30);
    expect(quoteValidityDaysFrom({ quoteValidityDays: " 7 " })).toBe(7);
    expect(quoteValidityDaysFrom({ quoteValidityDays: "365" })).toBe(365);
    for (const bad of ["", "0", "366", "1.5", "-3", "สามสิบ"]) {
      expect(quoteValidityDaysFrom({ quoteValidityDays: bad })).toBeNull();
    }
    expect(quoteValidityDaysFrom({})).toBeNull();
  });

  it("นับจากวันที่ส่ง — ส่งวันที่ 1 ยืน 30 วัน = ถึงวันที่ 31 และข้ามเดือน/ปีอธิกสุรทินถูก", () => {
    expect(addDaysIso("2026-10-01", 30)).toBe("2026-10-31");
    expect(addDaysIso("2026-12-20", 15)).toBe("2027-01-04");
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29");
    expect(validUntilFrom(30, "2026-10-01")).toEqual(utc("2026-10-31"));
    expect(validUntilFrom(null, "2026-10-01")).toBeNull();
  });

  it("วันสุดท้ายยังยืนราคาอยู่ทั้งวัน — หมดอายุตั้งแต่วันถัดไป", () => {
    const last = utc("2026-10-31");
    expect(isQuoteExpired(last, "2026-10-30")).toBe(false);
    expect(isQuoteExpired(last, "2026-10-31")).toBe(false);
    expect(isQuoteExpired(last, "2026-11-01")).toBe(true);
    // ไม่มีกำหนด = ไม่มีวันหมดอายุ (ใบที่ส่งก่อนมีฟีเจอร์นี้)
    expect(isQuoteExpired(null, "2099-01-01")).toBe(false);
  });
});

describe("เงื่อนไขท้ายใบ", () => {
  it("ตัดเลขข้อ/สัญลักษณ์ที่พิมพ์มาเอง เพราะเอกสารใส่เลขข้อให้แล้ว และทิ้งบรรทัดว่าง", () => {
    const text = "1. ชำระมัดจำ 30%\r\n2) ราคารวมค่าขนส่ง\n\n- รับประกันงาน 1 ปี\n• ไม่รวมงานตกแต่ง\n  ราคานี้ไม่รวมค่าขออนุญาต  ";
    expect(termLines(text)).toEqual([
      "ชำระมัดจำ 30%",
      "ราคารวมค่าขนส่ง",
      "รับประกันงาน 1 ปี",
      "ไม่รวมงานตกแต่ง",
      "ราคานี้ไม่รวมค่าขออนุญาต",
    ]);
    expect(termLines(null)).toEqual([]);
    expect(termLines("   \n  ")).toEqual([]);
  });

  it("ไม่ตัดตัวเลขที่เป็นเนื้อความ เช่น จำนวนวัน หรือเปอร์เซ็นต์ขึ้นต้นบรรทัด", () => {
    expect(termLines("30 วันหลังส่งมอบ\n50% เมื่อเริ่มงาน")).toEqual([
      "30 วันหลังส่งมอบ",
      "50% เมื่อเริ่มงาน",
    ]);
  });

  it("ข้อความว่างในหน้าตั้งค่า = ไม่ตรึงอะไรลงใบ", () => {
    expect(quoteTermsFrom({ quoteTerms: "  " })).toBeNull();
    expect(quoteTermsFrom({ quoteTerms: " ชำระภายใน 7 วัน " })).toBe("ชำระภายใน 7 วัน");
  });
});

describe("ใบเสนอราคา PDF ของลูกค้า — กล่องเงื่อนไข", () => {
  it("ไม่มีทั้งวันยืนราคาและเงื่อนไข = ไม่พิมพ์อะไร (ใบเก่าหน้าตาเหมือนเดิม)", () => {
    expect(renderQuoteTerms(null, [])).toBe("");
    expect(renderQuoteTerms(undefined)).toBe("");
  });

  it("พิมพ์วันยืนราคาเป็นวันตามปฏิทิน (อ่านแบบ UTC ไม่เลื่อนวัน) + เงื่อนไขเป็นรายการมีเลขข้อ", () => {
    const html = renderQuoteTerms(utc("2026-10-31"), ["ชำระมัดจำ 30%", "รับประกัน 1 ปี"]);
    expect(html).toContain("ยืนราคาถึงวันที่ 31/10/2026");
    expect(html).toContain("<ol><li>ชำระมัดจำ 30%</li><li>รับประกัน 1 ปี</li></ol>");
  });

  it("กันโค้ด HTML ในข้อความเงื่อนไข", () => {
    const html = renderQuoteTerms(null, ['<img src=x onerror="alert(1)">']);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("กล่องเงื่อนไขอยู่ก่อนช่องเซ็น — ลูกค้าเซ็นรับหลังอ่านเงื่อนไข", () => {
    const html = buildCustomerQuotePdfHtml({
      companyName: "บริษัททดสอบ",
      companyAddress: "-",
      companyPhone: "-",
      companyTaxId: null,
      customerName: "ลูกค้าทดสอบ",
      customerAddress: null,
      quoteNo: "QT-2026-9999",
      revisionNo: 1,
      projectNo: "PRJ-2026-9999",
      projectName: "โครงการทดสอบ",
      siteAddress: null,
      date: new Date(2026, 9, 1),
      validUntil: utc("2026-10-31"),
      terms: ["ชำระมัดจำ 30%"],
      groups: [],
      beforeDiscount: 1000,
      discountPct: null,
      discountAmt: 0,
      discountNote: null,
      subtotalBeforeVat: 1000,
      vatPct: 7,
      vatAmt: 70,
      netPrice: 1070,
    });
    const terms = html.indexOf('class="terms"');
    expect(terms).toBeGreaterThan(-1);
    expect(terms).toBeLessThan(html.indexOf('class="signature"'));
    expect(terms).toBeGreaterThan(html.indexOf("รวมมูลค่าทั้งสิ้น"));
  });
});
