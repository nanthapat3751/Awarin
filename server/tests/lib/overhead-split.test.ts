import { marginAfterDiscount, splitOverheadProfit } from "@systemboq/shared-types";

/**
 * แยก "ค่าดำเนินการ" ออกจาก "กำไร"
 *
 * สิ่งที่ต้องไม่พังเด็ดขาด: สองส่วนบวกกันต้องเท่ากับก้อนรวมที่เก็บไว้เป๊ะ ๆ เพราะก้อนรวมคือตัวเลข
 * ที่ถูกบวกเข้าไปในราคาจริง ถ้าสองส่วนบวกกันไม่ลงตัว หน้าจอจะโชว์ตัวเลขที่บวกแล้วไม่ตรงกับราคา
 */
describe("splitOverheadProfit", () => {
  it("ยังไม่ได้แยก = ไม่คืนตัวเลขใด ๆ ให้เอาไปแสดง", () => {
    const split = splitOverheadProfit({
      directCost: 1_000_000,
      overheadProfitPct: 10,
      overheadProfitAmt: 100_000,
      overheadPct: null,
    });
    expect(split.known).toBe(false);
  });

  it("แบ่ง 10% เป็นค่าดำเนินการ 4% + กำไร 6%", () => {
    const split = splitOverheadProfit({
      directCost: 1_000_000,
      overheadProfitPct: 10,
      overheadProfitAmt: 100_000,
      overheadPct: 4,
    });
    expect(split.known).toBe(true);
    expect(split.overheadPct).toBe(4);
    expect(split.profitPct).toBe(6);
    expect(split.overheadAmt).toBe(40_000);
    expect(split.profitAmt).toBe(60_000);
    expect(split.overheadAmt + split.profitAmt).toBe(100_000);
  });

  it("เศษการปัดตกที่กำไรเสมอ — สองส่วนบวกกันต้องเท่าก้อนรวมที่เก็บไว้", () => {
    // ยอดที่ปัดแล้วหารไม่ลงตัว: 333,333.33 × 10% = 33,333.33 · ค่าดำเนินการ 3.33% = 11,099.99
    const directCost = 333_333.33;
    const overheadProfitAmt = 33_333.33;
    const split = splitOverheadProfit({
      directCost,
      overheadProfitPct: 10,
      overheadProfitAmt,
      overheadPct: 3.33,
    });
    expect(split.overheadAmt + split.profitAmt).toBeCloseTo(overheadProfitAmt, 2);
  });

  it("ค่าดำเนินการเท่ากับก้อนรวม = ไม่มีกำไรเลย (ไม่ใช่ค่าติดลบ)", () => {
    const split = splitOverheadProfit({
      directCost: 500_000,
      overheadProfitPct: 8,
      overheadProfitAmt: 40_000,
      overheadPct: 8,
    });
    expect(split.profitPct).toBe(0);
    expect(split.profitAmt).toBe(0);
  });
});

/**
 * คำถามที่ฟีเจอร์นี้มีไว้ตอบ: ส่วนลดที่ให้ไป กินกำไรไปเท่าไร
 *
 * ส่วนลดหักจากยอดรวม แต่สิ่งที่หายไปจริงคือกำไร เพราะต้นทุนกับค่าดำเนินการเป็นเงินที่ต้องจ่าย
 * ออกไปอยู่ดี
 */
describe("marginAfterDiscount", () => {
  it("ไม่มีส่วนลด = กำไรเต็ม", () => {
    const m = marginAfterDiscount(60_000, 0);
    expect(m.remaining).toBe(60_000);
    expect(m.eatenPct).toBe(0);
  });

  it("ส่วนลดครึ่งหนึ่งของกำไร = กินไป 50%", () => {
    const m = marginAfterDiscount(60_000, 30_000);
    expect(m.remaining).toBe(30_000);
    expect(m.eatenPct).toBe(50);
  });

  it("ส่วนลดเกินกำไร = ติดลบ ต้องไม่ตัดเป็นศูนย์", () => {
    // ตัดเป็นศูนย์เท่ากับซ่อนว่าขายต่ำกว่าต้นทุน+ค่าดำเนินการ ซึ่งเป็นสิ่งเดียวที่ต้องเตือน
    const m = marginAfterDiscount(60_000, 75_000);
    expect(m.remaining).toBe(-15_000);
    expect(m.eatenPct).toBe(125);
  });

  it("ไม่มีกำไรตั้งต้น = บอกเป็นเปอร์เซ็นต์ไม่ได้ (หารด้วยศูนย์)", () => {
    const m = marginAfterDiscount(0, 5_000);
    expect(m.eatenPct).toBeNull();
    expect(m.remaining).toBe(-5_000);
  });
});
