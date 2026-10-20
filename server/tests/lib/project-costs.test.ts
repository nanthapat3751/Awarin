import { buildCostReport, costOf, type CostReportInput } from "../../src/lib/project-costs";

const ROOTS = [
  { id: "B", code: "B", name: "งานโครงสร้าง", sortOrder: 2 },
  { id: "C", code: "C", name: "งานสถาปัตยกรรม", sortOrder: 3 },
  { id: "F", code: "F", name: "งานไฟฟ้า", sortOrder: 6 },
];

const BASE: CostReportInput = {
  lines: [
    { rootCategoryId: "B", materialTotal: 500_000, laborTotal: 300_000 },
    { rootCategoryId: "C", materialTotal: 300_000, laborTotal: 200_000 },
  ],
  roots: ROOTS,
  overheadBudget: 50_000,
  contingency: 0,
  costs: [],
  vatClaimable: true,
  revenue: 1_500_000,
  completed: false,
};

describe("งบเทียบใช้จริง", () => {
  it("งบรายหมวดมาจาก BOQ · ยังไม่มีบิล = ใช้ไป 0 · กำไรตามแผน = รายรับ − งบ", () => {
    const r = buildCostReport(BASE);
    expect(r.rows.map((x) => [x.kind, x.code, x.budget, x.actual])).toEqual([
      ["category", "B", 800_000, 0],
      ["category", "C", 500_000, 0],
      ["overhead", null, 50_000, 0],
    ]);
    expect(r.totals).toEqual({ budget: 1_350_000, actual: 0, committed: 0, vat: 0 });
    expect(r.profit).toMatchObject({ plannedProfit: 150_000, forecastProfit: 150_000, actualProfit: null });
  });

  it("จด VAT = ภาษีซื้อไม่ใช่ต้นทุน · ไม่จด = ภาษีซื้อเป็นต้นทุนด้วย", () => {
    expect(costOf({ amount: 1000, vatAmount: 70 }, true)).toBe(1000);
    expect(costOf({ amount: 1000, vatAmount: 70 }, false)).toBe(1070);
  });

  it("คาดการณ์: หมวดที่เกินงบนับตามจริง หมวดที่ยังไม่ถึงงบนับเต็มงบ", () => {
    const r = buildCostReport({
      ...BASE,
      costs: [
        { categoryId: "B", costType: "MATERIAL", amount: 600_000, vatAmount: 42_000 },
        { categoryId: "B", costType: "LABOR", amount: 250_000, vatAmount: 0 },
        { categoryId: "C", costType: "SUBCONTRACT", amount: 100_000, vatAmount: 0 },
      ],
    });
    const b = r.rows.find((x) => x.code === "B")!;
    expect(b).toMatchObject({ actual: 850_000, usedPct: 106.3, byType: { MATERIAL: 600_000, LABOR: 250_000 } });
    expect(r.totals).toEqual({ budget: 1_350_000, actual: 950_000, committed: 0, vat: 42_000 });
    // B เกินงบ 50,000 → กำไรคาดการณ์ลดลง 50,000 จากแผน
    expect(r.profit).toMatchObject({ plannedProfit: 150_000, forecastProfit: 100_000 });
  });

  it("เผื่อเหลือเผื่อขาดดูดส่วนเกินก่อน · ยังไม่ได้แยกค่าดำเนินการ = แถวค่าดำเนินการไม่มีงบ", () => {
    const r = buildCostReport({
      ...BASE,
      overheadBudget: null,
      contingency: 30_000,
      costs: [
        { categoryId: "B", costType: "MATERIAL", amount: 820_000, vatAmount: 0 },
        { categoryId: null, costType: "OVERHEAD", amount: 12_000, vatAmount: 0 },
      ],
    });
    expect(r.rows.find((x) => x.kind === "overhead")).toMatchObject({ budget: null, actual: 12_000, usedPct: null });
    expect(r.rows.find((x) => x.kind === "contingency")).toMatchObject({ budget: 30_000, actual: 20_000 });
    // ยอดใช้จริงไม่บวกแถวเผื่อเหลือเผื่อขาดซ้ำ
    expect(r.totals.actual).toBe(832_000);
    // ต้นทุนคาดการณ์ = B 820,000 + C 500,000 + ดำเนินการ 12,000 + เผื่อฯ ที่เหลือ 10,000
    expect(r.profit?.forecastProfit).toBe(1_500_000 - 1_342_000);
  });

  it("บิลลงหมวดที่ไม่มีงบ → แถวยังขึ้น และนับเป็นยอดนอกงบ", () => {
    const r = buildCostReport({ ...BASE, costs: [{ categoryId: "F", costType: "MATERIAL", amount: 5_000, vatAmount: 0 }] });
    expect(r.rows.find((x) => x.code === "F")).toMatchObject({ budget: 0, actual: 5_000, usedPct: null });
    expect(r.unbudgetedActual).toBe(5_000);
  });

  it("โครงการเสร็จแล้วเท่านั้นที่บอกกำไรจริง · ไม่รู้รายรับ = ไม่คิดกำไรเลย", () => {
    const done = buildCostReport({
      ...BASE,
      completed: true,
      costs: [{ categoryId: "B", costType: "MATERIAL", amount: 1_200_000, vatAmount: 0 }],
    });
    expect(done.profit?.actualProfit).toBe(300_000);
    expect(buildCostReport({ ...BASE, revenue: null }).profit).toBeNull();
  });
});
