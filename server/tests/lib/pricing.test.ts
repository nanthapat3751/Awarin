import { calculateLineAmounts, calculatePricing, discountOf } from "../../src/lib/pricing";

describe("calculateLineAmounts", () => {
  // Matches the real BOQ line: เข็มตอก I 22 L 24, 16 ต้น, material 7,500/unit, labor 1,500/unit
  it("computes material total, labor total and line total", () => {
    const result = calculateLineAmounts({ quantity: 16, materialUnitPrice: 7500, laborUnitPrice: 1500 });
    expect(result.materialTotal).toBe(120000);
    expect(result.laborTotal).toBe(24000);
    expect(result.lineTotal).toBe(144000);
  });

  it("handles a labor-only line (materialUnitPrice = 0)", () => {
    const result = calculateLineAmounts({ quantity: 24, materialUnitPrice: 0, laborUnitPrice: 100 });
    expect(result.materialTotal).toBe(0);
    expect(result.laborTotal).toBe(2400);
    expect(result.lineTotal).toBe(2400);
  });

  it("handles a material-only line (laborUnitPrice = 0, e.g. combined 'ของ+แรง' pricing)", () => {
    const result = calculateLineAmounts({ quantity: 20, materialUnitPrice: 290, laborUnitPrice: 0 });
    expect(result.materialTotal).toBe(5800);
    expect(result.laborTotal).toBe(0);
    expect(result.lineTotal).toBe(5800);
  });

  it("rounds to 2 decimals", () => {
    const result = calculateLineAmounts({ quantity: 1.5, materialUnitPrice: 10.005, laborUnitPrice: 0 });
    expect(result.materialTotal).toBe(15.01);
  });

  it("rejects negative inputs", () => {
    expect(() => calculateLineAmounts({ quantity: -1, materialUnitPrice: 100, laborUnitPrice: 0 })).toThrow();
    expect(() => calculateLineAmounts({ quantity: 1, materialUnitPrice: -100, laborUnitPrice: 0 })).toThrow();
    expect(() => calculateLineAmounts({ quantity: 1, materialUnitPrice: 0, laborUnitPrice: -1 })).toThrow();
  });
});

describe("calculatePricing", () => {
  // ตรงกับ BR-01..BR-06: ต้นทุนตรง -> +10% ค่าดำเนินการ/กำไร -> +7% VAT -> ราคาสุทธิ -> ราคา/ตร.ม.
  it("computes direct cost, overhead/profit, VAT and net price against a known BOQ", () => {
    const items = [
      { quantity: 16, materialUnitPrice: 7500, laborUnitPrice: 1500 }, // 144000
      { quantity: 24, materialUnitPrice: 0, laborUnitPrice: 100 }, // 2400
      { quantity: 4, materialUnitPrice: 2400, laborUnitPrice: 450 }, // 11400
    ];

    const result = calculatePricing(items, 10, 7, 100);

    const expectedDirectCost = 144000 + 2400 + 11400; // 157800
    const expectedOverhead = expectedDirectCost * 0.1;
    const expectedBeforeVat = expectedDirectCost + expectedOverhead;
    const expectedVat = expectedBeforeVat * 0.07;
    const expectedNet = expectedBeforeVat + expectedVat;

    expect(result.directCost).toBeCloseTo(expectedDirectCost, 2);
    expect(result.overheadProfitAmount).toBeCloseTo(expectedOverhead, 2);
    expect(result.vatAmount).toBeCloseTo(expectedVat, 2);
    expect(result.netPrice).toBeCloseTo(expectedNet, 2);
    expect(result.pricePerSqm).toBeCloseTo(expectedNet / 100, 2);
  });

  // อ้างอิงจากงานจริง: โปรเจกต์นี้ใช้ค่าดำเนินการ 8% และ VAT 0% (เสนอราคาไม่รวม VAT)
  it("supports an overridden overhead percent and zero VAT, matching a real quote", () => {
    const items = [{ quantity: 1, materialUnitPrice: 2939696.72, laborUnitPrice: 0 }];
    const result = calculatePricing(items, 8, 0);

    expect(result.directCost).toBeCloseTo(2939696.72, 2);
    expect(result.overheadProfitAmount).toBeCloseTo(235175.74, 1);
    expect(result.vatAmount).toBe(0);
    expect(result.netPrice).toBeCloseTo(3174872.45, 1);
  });

  it("returns null price per sqm when house area is not provided", () => {
    const result = calculatePricing([{ quantity: 1, materialUnitPrice: 100, laborUnitPrice: 0 }], 10, 7, null);
    expect(result.pricePerSqm).toBeNull();
  });

  it("returns null price per sqm when house area is zero or negative", () => {
    const items = [{ quantity: 1, materialUnitPrice: 100, laborUnitPrice: 0 }];
    expect(calculatePricing(items, 10, 7, 0).pricePerSqm).toBeNull();
    expect(calculatePricing(items, 10, 7, -5).pricePerSqm).toBeNull();
  });

  it("handles an empty BOQ as zero cost", () => {
    const result = calculatePricing([], 10, 7, 100);
    expect(result.directCost).toBe(0);
    expect(result.overheadProfitAmount).toBe(0);
    expect(result.vatAmount).toBe(0);
    expect(result.netPrice).toBe(0);
    expect(result.pricePerSqm).toBe(0);
  });

  it("rejects negative percentages", () => {
    expect(() => calculatePricing([], -1, 7)).toThrow();
    expect(() => calculatePricing([], 10, -1)).toThrow();
  });
});

describe("calculatePricing กับส่วนลด", () => {
  // ต้นทุนตรง 1,000 + ค่าดำเนินการ 10% = 1,100 คือ "ราคาก่อนส่วนลด" ที่ใช้เป็นฐานทุกเคสข้างล่าง
  const items = [{ quantity: 10, materialUnitPrice: 60, laborUnitPrice: 40 }];

  it("ไม่ส่งส่วนลดมา = ผลลัพธ์เหมือนเดิมทุกตัว (ของเก่าต้องไม่เปลี่ยนพฤติกรรม)", () => {
    const r = calculatePricing(items, 10, 7);
    expect(r.discountAmount).toBe(0);
    expect(r.discountPercent).toBeNull();
    expect(r.subtotalBeforeVat).toBe(1100);
    expect(r.netPrice).toBe(1177);
  });

  it("ลดเป็นจำนวนเงิน: หักก่อนคำนวณ VAT (ฐานภาษีต้องลดลงตาม)", () => {
    const r = calculatePricing(items, 10, 7, null, { amount: 100 });
    expect(r.discountAmount).toBe(100);
    expect(r.discountPercent).toBeNull();
    expect(r.subtotalBeforeVat).toBe(1000);
    expect(r.vatAmount).toBe(70); // 7% ของ 1,000 ไม่ใช่ของ 1,100
    expect(r.netPrice).toBe(1070);
    // ต้นทุนตรงห้ามขยับ — เหตุผลทั้งหมดที่ต้องมีช่องส่วนลดแยกคือข้อนี้
    expect(r.directCost).toBe(1000);
    expect(r.overheadProfitAmount).toBe(100);
  });

  it("ลดเป็น %: คิดจากราคาก่อนส่วนลด ไม่ใช่จากต้นทุนตรง", () => {
    const r = calculatePricing(items, 10, 7, null, { percent: 10 });
    expect(r.discountAmount).toBe(110); // 10% ของ 1,100
    expect(r.discountPercent).toBe(10);
    expect(r.subtotalBeforeVat).toBe(990);
    expect(r.netPrice).toBe(1059.3);
  });

  it("ลดเกินราคา ถูกตัดที่ราคาเต็ม ไม่ปล่อยให้ยอดสุทธิติดลบ", () => {
    const r = calculatePricing(items, 10, 7, null, { amount: 99999 });
    expect(r.discountAmount).toBe(1100);
    expect(r.subtotalBeforeVat).toBe(0);
    expect(r.netPrice).toBe(0);
  });

  it("ราคา/ตร.ม. คิดจากยอดหลังหักส่วนลด", () => {
    const r = calculatePricing(items, 10, 7, 100, { amount: 100 });
    expect(r.pricePerSqm).toBe(10.7); // 1,070 / 100
  });

  it("ส่งมาทั้ง % และจำนวนเงิน → % ชนะ (ค่าที่ผูกกับยอดคิดใหม่ได้)", () => {
    const r = calculatePricing(items, 10, 7, null, { percent: 10, amount: 500 });
    expect(r.discountAmount).toBe(110);
  });

  it("ปฏิเสธส่วนลดติดลบ และ % เกิน 100", () => {
    expect(() => calculatePricing(items, 10, 7, null, { amount: -1 })).toThrow();
    expect(() => calculatePricing(items, 10, 7, null, { percent: -1 })).toThrow();
    expect(() => calculatePricing(items, 10, 7, null, { percent: 101 })).toThrow();
  });
});

describe("discountOf", () => {
  it("อ่าน % เมื่อ discountPct มีค่า", () => {
    expect(discountOf({ discountPct: 5, discountAmt: 55 })).toEqual({ percent: 5 });
  });

  it("discountPct = null ต้องอ่านเป็นจำนวนเงิน ไม่ใช่ 0% (กับดัก Number(null) = 0)", () => {
    expect(discountOf({ discountPct: null, discountAmt: 500 })).toEqual({ amount: 500 });
  });

  it("ลด 0% คือ 0% จริง ๆ ไม่ใช่ 'ไม่ได้ตั้งส่วนลด'", () => {
    expect(discountOf({ discountPct: 0, discountAmt: 0 })).toEqual({ percent: 0 });
  });
});
