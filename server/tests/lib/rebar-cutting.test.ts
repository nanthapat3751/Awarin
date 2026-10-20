import { OFFCUT_KEEP_MIN, cutPlan, pickStock, splitToStock } from "@systemboq/shared-types";

/** จัดวิธีตัดเหล็ก (FFD) — Phase 3 ข้อ 3a */
describe("cutPlan (First-Fit Decreasing)", () => {
  it("ชิ้นที่รวมกันพอดีเส้น ลงเส้นเดียว ไม่มีเศษ (คิดเป็นมิลลิเมตร ไม่เพี้ยนทศนิยม)", () => {
    const plan = cutPlan([{ length: 3.3, count: 2 }, { length: 3.4, count: 1 }], 10);
    expect(plan.bars).toBe(1);
    expect(plan.scrap).toBe(0);
    expect(plan.offcut).toBe(0);
    expect(plan.patterns).toEqual([{ bars: 1, cuts: [{ length: 3.4, count: 1 }, { length: 3.3, count: 2 }], leftover: 0 }]);
  });

  it("FFD จับคู่ยาว-สั้นได้: 6+4 สองเส้น แทน 6+6 ที่ไม่ลง", () => {
    const plan = cutPlan([{ length: 6, count: 2 }, { length: 4, count: 2 }], 10);
    expect(plan.bars).toBe(2);
    expect(plan.patterns).toEqual([{ bars: 2, cuts: [{ length: 6, count: 1 }, { length: 4, count: 1 }], leftover: 0 }]);
  });

  it("ชิ้นยาวกว่าเหล็กเส้น (ทาบแล้ว) = เส้นเต็ม + ชิ้นท้ายเข้าตัวจัด", () => {
    expect(splitToStock(12500, 10000)).toEqual({ full: 1, remainder: 2500 });
    expect(splitToStock(20000, 10000)).toEqual({ full: 2, remainder: 0 });
    const plan = cutPlan([{ length: 12.5, count: 2 }], 10);
    // เส้นเต็ม 2 + ชิ้นท้าย 2.5 สองชิ้นลงเส้นเดียว (เหลือ 5)
    expect(plan.bars).toBe(3);
    expect(plan.netLength).toBe(25);
    expect(plan.patterns[0]).toEqual({ bars: 2, cuts: [{ length: 10, count: 1 }], leftover: 0 });
  });

  it(`เศษ ≥ ${OFFCUT_KEEP_MIN} ม. = เก็บไว้ใช้ · สั้นกว่า = เศษทิ้ง · % เศษทิ้งเทียบความยาวที่ซื้อ`, () => {
    const plan = cutPlan([{ length: 8.5, count: 1 }, { length: 9.5, count: 1 }], 10);
    expect(plan.bars).toBe(2);
    expect(plan.offcut).toBe(1.5);
    expect(plan.scrap).toBe(0.5);
    expect(plan.scrapPct).toBe(2.5);
    // เหลือรวมนับเศษเก็บไว้ด้วย (1.5 + 0.5) ÷ 20
    expect(plan.leftoverPct).toBe(10);
  });

  it("ปลอกจำนวนมาก: 1.2 ม. × 42 วง → 8 วงต่อเส้น 10 ม. = 6 เส้น", () => {
    const plan = cutPlan([{ length: 1.2, count: 42 }], 10);
    expect(plan.bars).toBe(6);
    expect(plan.patterns[0]).toEqual({ bars: 5, cuts: [{ length: 1.2, count: 8 }], leftover: 0.4 });
  });

  it("ไม่มีชิ้น = ไม่ต้องซื้อ", () => {
    expect(cutPlan([], 10)).toMatchObject({ bars: 0, scrap: 0, scrapPct: 0, patterns: [] });
  });
});

describe("pickStock", () => {
  it("เลือกเส้นที่ซื้อเหล็กรวมน้อยกว่า · เท่ากันเลือกเส้นสั้น", () => {
    // 3.9 ม. × 6 ชิ้น: เส้น 10 ม. ได้ 2 ชิ้น/เส้น = 3 เส้น (30 ม.) · เส้น 12 ม. ได้ 3 ชิ้น/เส้น = 2 เส้น (24 ม.)
    const reqs = [{ length: 3.9, count: 6 }];
    expect(pickStock([cutPlan(reqs, 10), cutPlan(reqs, 12)])).toBe(12);
    // 5 ม. × 2 ชิ้น: 10 ม. 1 เส้นพอดี ดีกว่า 12 ม.
    const even = [{ length: 5, count: 2 }];
    expect(pickStock([cutPlan(even, 10), cutPlan(even, 12)])).toBe(10);
  });
});
