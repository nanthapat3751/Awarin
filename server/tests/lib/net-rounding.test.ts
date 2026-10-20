import { buildCustomerQuotePdfHtml } from "../../src/lib/pdf/customer-quote-pdf";
import { buildQuotePdfHtml } from "../../src/lib/pdf/quote-pdf";
import { applyNetRounding, calculatePricing, round2 } from "../../src/lib/pricing";

/**
 * ปัดยอดสุทธิ (รวม VAT) — หักเป็น "ส่วนลดปัดเศษ" ก่อน VAT
 *
 * สิ่งที่ต้องจริงเสมอ: ยอดสุทธิลงตัวตรงเป้า · ฐาน + VAT = ยอดสุทธิพอดี · ปัดลงเท่านั้น ·
 * ไม่ปัด = ตัวเลขทุกตัวเหมือนก่อนมีฟีเจอร์นี้เป๊ะ
 */
describe("applyNetRounding", () => {
  it("ไม่ส่งหน่วยปัด = ยอดเหมือนเดิมทุกตัว (ฐาน × 7%)", () => {
    expect(applyNetRounding(1100, 7, null)).toEqual({
      roundingAmount: 0,
      subtotalBeforeVat: 1100,
      vatAmount: 77,
      netPrice: 1177,
    });
  });

  it("ปัดลงหลักร้อย: ยอดสุทธิตรงเป้า และ VAT ถอดจากราคารวม", () => {
    // 1,100 + VAT 77 = 1,177 → ปัดลงหลักร้อย = 1,100
    const r = applyNetRounding(1100, 7, 100);
    expect(r.netPrice).toBe(1100);
    expect(r.vatAmount).toBe(71.96); // 1,100 × 7/107
    expect(r.subtotalBeforeVat).toBe(1028.04);
    expect(r.roundingAmount).toBe(71.96);
    expect(round2(r.subtotalBeforeVat + r.vatAmount)).toBe(r.netPrice);
  });

  it("ตัดสตางค์ทิ้ง (หน่วย 1)", () => {
    const r = applyNetRounding(1140.7, 7, 1); // 1,140.70 + 79.85 = 1,220.55
    expect(r.netPrice).toBe(1220);
    expect(r.roundingAmount).toBeGreaterThan(0);
    expect(r.roundingAmount).toBeLessThan(1);
  });

  it("ยอดลงตัวอยู่แล้ว หรือปัดแล้วเหลือศูนย์ = ไม่หักอะไร", () => {
    expect(applyNetRounding(1000, 0, 100).roundingAmount).toBe(0);
    expect(applyNetRounding(50, 7, 100)).toMatchObject({ roundingAmount: 0, netPrice: 53.5 });
  });

  it("สุ่ม 5,000 ยอด × 4 หน่วย: ตรงเป้าทุกครั้ง ฐาน+VAT = สุทธิ และ VAT ต่างจากฐาน×7% ไม่เกิน 1 สตางค์", () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 5000; i++) {
      const sub = round2(rand() * 5_000_000);
      const net0 = round2(sub + round2(sub * 0.07));
      for (const unit of [1, 100, 1000, 10000]) {
        const target = Math.floor((net0 + 1e-9) / unit) * unit;
        const r = applyNetRounding(sub, 7, unit);
        if (target <= 0) {
          expect(r.roundingAmount).toBe(0);
          continue;
        }
        expect(r.netPrice).toBe(round2(target));
        expect(round2(r.subtotalBeforeVat + r.vatAmount)).toBe(r.netPrice);
        expect(r.roundingAmount).toBeGreaterThanOrEqual(0);
        expect(Math.abs(round2(r.vatAmount - round2(r.subtotalBeforeVat * 0.07)))).toBeLessThanOrEqual(0.01);
      }
    }
  });
});

describe("calculatePricing + ปัดยอด", () => {
  const line = [{ quantity: 10, materialUnitPrice: 60, laborUnitPrice: 40 }]; // ต้นทุน 1,000

  it("โหมดงานเอกชน: ปัดหลังส่วนลด ก่อน VAT — ต้นทุนและกำไรไม่ถูกแตะ", () => {
    const p = calculatePricing(line, 10, 7, null, { amount: 100 }, { roundingUnit: 100 });
    expect(p.directCost).toBe(1000);
    expect(p.overheadProfitAmount).toBe(100);
    expect(p.discountAmount).toBe(100);
    // 1,100 − 100 = 1,000 + VAT = 1,070 → ปัด = 1,000
    expect(p.netPrice).toBe(1000);
    expect(p.roundingUnit).toBe(100);
    expect(p.roundingAmount).toBe(65.42);
    expect(p.subtotalBeforeVat).toBe(934.58);
  });

  it("ไม่ส่ง roundingUnit = ผลเหมือนก่อนมีฟีเจอร์นี้", () => {
    const p = calculatePricing(line, 10, 7);
    expect(p).toMatchObject({ netPrice: 1177, roundingAmount: 0, roundingUnit: null, subtotalBeforeVat: 1100 });
  });
});

describe("แถวส่วนลดปัดเศษในใบเสนอราคา PDF", () => {
  const base = {
    companyName: "Awarin Engineering Co., Ltd.",
    companyAddress: "252/54",
    companyPhone: "090 989 8342",
    companyTaxId: null,
    quoteNo: "QT-2026-0001",
    revisionNo: 1,
    projectNo: "PJ-2026-0001",
    projectName: "บ้านพักอาศัย",
    customerName: "คุณทดสอบ",
    customerAddress: null,
    siteAddress: null,
    date: new Date("2026-10-01T00:00:00Z"),
    groups: [{ categoryLabel: "1", categoryName: "งานโครงสร้าง", items: [], subtotal: 1100 }],
  };
  const staff = {
    ...base,
    directCost: 1000,
    overheadProfitPct: 10,
    overheadProfitAmt: 100,
    discountPct: null,
    discountAmt: 0,
    discountNote: null,
    vatPct: 7,
    vatAmt: 71.96,
    netPrice: 1100,
  };

  it("ใบพนักงาน: พิมพ์แถวส่วนลดปัดเศษ และฐานภาษีหักยอดนั้นแล้ว", () => {
    const html = buildQuotePdfHtml({ ...staff, roundingAmt: 71.96 });
    expect(html).toContain('class="label">ส่วนลดปัดเศษ</td><td class="num">-71.96');
    expect(html).toContain("1,028.04"); // รวมมูลค่าก่อนภาษีมูลค่าเพิ่ม
    expect(html.indexOf("ส่วนลดปัดเศษ")).toBeLessThan(html.indexOf("รวมมูลค่าก่อนภาษีมูลค่าเพิ่ม"));
  });

  it("ไม่ได้ปัด = ไม่มีแถว ใบเดิมหน้าตาเหมือนเดิม", () => {
    const html = buildQuotePdfHtml({ ...staff, roundingAmt: 0, vatAmt: 77, netPrice: 1177 });
    expect(html).not.toContain('class="label">ส่วนลดปัดเศษ');
  });

  it("ใบลูกค้า: มีบรรทัดรวมมูลค่างาน + ส่วนลดปัดเศษ แม้ไม่มีส่วนลดอื่น", () => {
    const html = buildCustomerQuotePdfHtml({
      ...base,
      beforeDiscount: 1100,
      discountPct: null,
      discountAmt: 0,
      discountNote: null,
      roundingAmt: 71.96,
      subtotalBeforeVat: 1028.04,
      vatPct: 7,
      vatAmt: 71.96,
      netPrice: 1100,
    });
    expect(html).toContain('class="label">รวมมูลค่างาน');
    expect(html).toContain('class="label">ส่วนลดปัดเศษ</td><td class="num">-71.96');
    expect(html).not.toContain('class="label">ส่วนลด<');
  });
});
