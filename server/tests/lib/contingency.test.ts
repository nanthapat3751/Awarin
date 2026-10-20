import { buildQuotePdfHtml } from "../../src/lib/pdf/quote-pdf";
import { calculatePricing } from "../../src/lib/pricing";

/**
 * ค่าเผื่อเหลือเผื่อขาด — % ของต้นทุนตรงที่บวกเป็น "ค่างานต้นทุน" ก่อนคิดค่าดำเนินการ/กำไร
 * (ย้ายมาจากเทสต์ Factor F เดิม ตอนถอดโหมดราคากลางราชการออก 14 ต.ค. 2026 — ฟีเจอร์นี้ยังใช้กับงานเอกชน)
 */
describe("ค่าเผื่อเหลือเผื่อขาด — สูตร", () => {
  const items = [{ quantity: 1, materialUnitPrice: 1_000_000, laborUnitPrice: 0 }];

  it("ไม่ส่งมาเลย = ผลลัพธ์เหมือนเดิมทุกตัว (ของเก่าต้องไม่เปลี่ยนพฤติกรรม)", () => {
    const before = calculatePricing(items, 10, 7);
    const after = calculatePricing(items, 10, 7, null, undefined, { contingencyPercent: 0 });
    expect(after).toEqual(before);
    expect(before.baseCost).toBe(before.directCost);
  });

  it("บวกเข้าต้นทุนก่อนคิดกำไร ไม่ใช่บวกท้ายใบ", () => {
    const p = calculatePricing(items, 10, 7, null, undefined, { contingencyPercent: 3 });
    expect(p.contingencyAmount).toBe(30_000);
    expect(p.baseCost).toBe(1_030_000);
    // กำไรคิดจากค่างานต้นทุน 1,030,000 ไม่ใช่ 1,000,000
    expect(p.overheadProfitAmount).toBe(103_000);
    expect(p.subtotalBeforeVat).toBe(1_133_000);
    expect(p.vatAmount).toBe(79_310);
    expect(p.netPrice).toBe(1_212_310);
  });
});

describe("ค่าเผื่อเหลือเผื่อขาด — ใบเสนอราคา (ฉบับภายใน)", () => {
  const BASE = {
    companyName: "Awarin Engineering Co., Ltd.",
    companyAddress: "252/54 หมู่ 5 ตำบลธรรมศาลา อำเภอเมืองนครปฐม จังหวัดนครปฐม",
    companyPhone: "090 989 8342",
    companyTaxId: null,
    quoteNo: "QT-2026-0009",
    revisionNo: 1,
    projectNo: "PJ-2026-0009",
    projectName: "บ้านพักอาศัย 2 ชั้น",
    customerName: "ลูกค้าทดสอบ",
    customerAddress: null,
    siteAddress: null,
    date: new Date("2026-09-20T00:00:00Z"),
    discountPct: null,
    discountAmt: 0,
    discountNote: null,
    vatPct: 7,
  };
  const GROUP = { categoryLabel: "1", categoryName: "งานโครงสร้าง", items: [] };

  it("มีค่าเผื่อ = พิมพ์แถวค่าเผื่อพร้อมเปอร์เซ็นต์ ก่อนแถวค่าดำเนินการ", () => {
    const html = buildQuotePdfHtml({
      ...BASE,
      groups: [{ ...GROUP, subtotal: 1_000_000 }],
      directCost: 1_000_000,
      contingencyPct: 3,
      contingencyAmt: 30_000,
      overheadProfitPct: 10,
      overheadProfitAmt: 103_000,
      vatAmt: 79_310,
      netPrice: 1_212_310,
    });
    expect(html).toContain("ค่าเผื่อเหลือเผื่อขาด (3%)");
    expect(html.indexOf("ค่าเผื่อเหลือเผื่อขาด")).toBeLessThan(html.indexOf("ค่าดำเนินการและกำไร"));
    expect(html).toContain("ภาษีมูลค่าเพิ่ม (7%)");
  });

  it("ไม่ได้เผื่อ = หน้าตาเหมือนเดิมทุกประการ (ไม่มีแถวค่าเผื่อ)", () => {
    const html = buildQuotePdfHtml({
      ...BASE,
      groups: [{ ...GROUP, subtotal: 1000 }],
      directCost: 1000,
      overheadProfitPct: 10,
      overheadProfitAmt: 100,
      vatAmt: 77,
      netPrice: 1177,
    });
    expect(html).toContain("ค่าดำเนินการและกำไร (10%)");
    expect(html).toContain("ภาษีมูลค่าเพิ่ม (7%)");
    expect(html).not.toContain("ค่าเผื่อเหลือเผื่อขาด");
  });
});
