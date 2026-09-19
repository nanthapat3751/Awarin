import {
  DEFAULT_INSTALLMENT_PLAN,
  installmentMismatch,
  installmentTotal,
  splitByPercent,
} from "../../src/lib/contract-installments";

describe("splitByPercent", () => {
  it("แบ่งยอดตามสัดส่วนของสัญญาจริงได้ตรงทุกงวด", () => {
    // บ้านคุณปวีณา แสงกล้า 2,600,000 → 520k / 390k / 390k / 520k / 442k / 260k / 78k
    const items = splitByPercent(2_600_000, DEFAULT_INSTALLMENT_PLAN);
    expect(items.map((i) => i.amount)).toEqual([
      520_000, 390_000, 390_000, 520_000, 442_000, 260_000, 78_000,
    ]);
    expect(installmentTotal(items)).toBe(2_600_000);
  });

  it("ยอดรวมตรงเป๊ะเสมอแม้เปอร์เซ็นต์หารไม่ลงตัว (งวดสุดท้ายรับเศษ)", () => {
    const plan = [
      { milestone: "ก", percent: 33.33 },
      { milestone: "ข", percent: 33.33 },
      { milestone: "ค", percent: 33.34 },
    ];
    for (const total of [100, 1177, 1_059.3, 999_999.99, 7]) {
      const items = splitByPercent(total, plan);
      expect(installmentTotal(items)).toBe(Math.round(total * 100) / 100);
    }
  });

  it("งวดเดียว = ได้ยอดเต็ม", () => {
    const items = splitByPercent(1177, [{ milestone: "ครบงาน", percent: 100 }]);
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe(1177);
  });

  it("ไม่มีแผนงวด = ไม่มีรายการ", () => {
    expect(splitByPercent(1000, [])).toEqual([]);
  });

  it("ยอดศูนย์ก็ยังแบ่งได้โดยไม่พัง", () => {
    const items = splitByPercent(0, DEFAULT_INSTALLMENT_PLAN);
    expect(items).toHaveLength(7);
    expect(installmentTotal(items)).toBe(0);
  });

  it("สัดส่วนมาตรฐานรวมกันได้ 100%", () => {
    expect(DEFAULT_INSTALLMENT_PLAN.reduce((s, p) => s + p.percent, 0)).toBe(100);
  });
});

describe("installmentMismatch", () => {
  it("ตรงพอดี → null", () => {
    expect(installmentMismatch([{ amount: 600 }, { amount: 577 }], 1177)).toBeNull();
  });

  it("บอกว่าขาดเท่าไร", () => {
    const msg = installmentMismatch([{ amount: 1000 }], 1177);
    expect(msg).toContain("ยังขาดอีก");
    expect(msg).toContain("177.00");
  });

  it("บอกว่าเกินเท่าไร", () => {
    const msg = installmentMismatch([{ amount: 2000 }], 1177);
    expect(msg).toContain("เกินมูลค่าสัญญา");
    expect(msg).toContain("823.00");
  });

  it("ต่างกันแค่สตางค์เดียวก็ไม่ผ่าน — เอกสารการเงินต้องตรงถึงสตางค์", () => {
    expect(installmentMismatch([{ amount: 1176.99 }], 1177)).not.toBeNull();
  });
});
