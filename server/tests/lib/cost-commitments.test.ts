import {
  budgetForKey,
  commitmentPaid,
  commitmentRemaining,
  exposureOf,
  overrunAmount,
  type CostBudgetRowDto,
  type ExposureCommitment,
  type ExposureCost,
} from "@systemboq/shared-types";

import { buildCostReport, type CostReportInput } from "../../src/lib/project-costs";

/**
 * ยอดผูกพัน + การตรวจเกินงบ
 *
 * เฝ้า: บิลที่จ่ายตามยอดผูกพันไม่นับซ้ำ · ปิดยอดแล้วส่วนที่เหลือไม่นับ · ต้องระบุสาเหตุเฉพาะส่วนที่เกิน "เพิ่ม"
 * · บิลที่อยู่ในยอดที่อธิบายไว้แล้วไม่ต้องอธิบายซ้ำ · แก้รายการเดิมไม่นับตัวเองสองรอบ
 */

const cost = (over: Partial<ExposureCost> = {}): ExposureCost => ({
  id: "c1",
  categoryId: "B",
  amount: 10_000,
  vatAmount: 700,
  commitmentId: null,
  ...over,
});
const commit = (over: Partial<ExposureCommitment> = {}): ExposureCommitment => ({
  id: "k1",
  categoryId: "B",
  amount: 50_000,
  vatAmount: 3_500,
  status: "OPEN",
  ...over,
});

describe("ยอดผูกพัน", () => {
  it("คงค้าง = ยอดสั่ง − บิลที่ผูก · จ่ายเกินยอด = 0 · ปิดยอด = 0 · จด VAT นับก่อน VAT", () => {
    const k = commit();
    const bills = [cost({ id: "a", commitmentId: "k1", amount: 20_000, vatAmount: 1_400 }), cost({ id: "b" })];
    expect(commitmentPaid(k, bills, true)).toBe(20_000);
    expect(commitmentRemaining(k, bills, true)).toBe(30_000);
    expect(commitmentRemaining(k, bills, false)).toBe(53_500 - 21_400);
    expect(commitmentRemaining(k, [cost({ commitmentId: "k1", amount: 60_000, vatAmount: 0 })], true)).toBe(0);
    expect(commitmentRemaining(commit({ status: "CLOSED" }), bills, true)).toBe(0);
  });

  it("ยอดเปิดรับของหมวด = จ่ายแล้ว + คงค้าง — บิลที่จ่ายตามยอดไม่นับซ้ำ", () => {
    const bills = [cost({ id: "a", commitmentId: "k1", amount: 20_000 }), cost({ id: "b", categoryId: "C" })];
    // จ่าย 20,000 (ตามยอด) + คงค้าง 30,000 = 50,000 เท่ายอดสั่งพอดี
    expect(exposureOf("B", bills, [commit()], true)).toBe(50_000);
    expect(exposureOf("C", bills, [commit()], true)).toBe(10_000);
    expect(exposureOf(null, bills, [commit()], true)).toBe(0);
  });

  it("งบของหมวด: ไม่มีใน BOQ = 0 (ใช้เท่าไรก็เกิน) · ค่าดำเนินการที่ยังไม่แยก = ไม่ตรวจ", () => {
    const rows = [
      { kind: "category", categoryId: "B", budget: 100_000 },
      { kind: "overhead", categoryId: null, budget: null },
    ] as CostBudgetRowDto[];
    expect(budgetForKey(rows, "B")).toBe(100_000);
    expect(budgetForKey(rows, "Z")).toBe(0);
    expect(budgetForKey(rows, null)).toBeNull();
    expect(budgetForKey([], null)).toBeNull();
  });
});

describe("ต้องระบุสาเหตุเมื่อดันหมวดเกินงบ", () => {
  const base = { budget: 100_000, vatClaimable: true };

  it("ยังไม่ถึงงบ = 0 · ดันเกิน = นับเฉพาะส่วนที่เกิน · หมวดเกินอยู่แล้ว บิลถัดไปนับทั้งใบ", () => {
    const costs = [cost({ id: "a", amount: 95_000 })];
    expect(overrunAmount({ ...base, costs, commitments: [], change: { kind: "cost", value: cost({ id: "new", amount: 5_000 }) } })).toBe(0);
    expect(overrunAmount({ ...base, costs, commitments: [], change: { kind: "cost", value: cost({ id: "new", amount: 8_000 }) } })).toBe(3_000);
    const over = [cost({ id: "a", amount: 120_000 })];
    expect(overrunAmount({ ...base, costs: over, commitments: [], change: { kind: "cost", value: cost({ id: "new", amount: 1_000 }) } })).toBe(1_000);
  });

  it("ยอดผูกพันนับด้วย: สั่งไว้แล้วจนเต็มงบ บิลใหม่ที่ไม่ได้สั่งก็เกิน", () => {
    const commitments = [commit({ amount: 100_000 })];
    expect(overrunAmount({ ...base, costs: [], commitments, change: { kind: "cost", value: cost({ id: "new", amount: 2_000 }) } })).toBe(2_000);
    // ยอดสั่งที่ดันเกินเอง
    expect(overrunAmount({ ...base, costs: [], commitments: [], change: { kind: "commitment", value: commit({ id: "new", amount: 130_000 }) } })).toBe(30_000);
  });

  it("บิลที่จ่ายตามยอดผูกพัน (ซึ่งอธิบายไว้แล้ว) ไม่ต้องอธิบายซ้ำ — เว้นแต่จ่ายเกินยอดที่สั่ง", () => {
    const commitments = [commit({ amount: 130_000 })];
    const inside = cost({ id: "new", commitmentId: "k1", amount: 50_000 });
    expect(overrunAmount({ ...base, costs: [], commitments, change: { kind: "cost", value: inside } })).toBe(0);
    const beyond = cost({ id: "new", commitmentId: "k1", amount: 135_000 });
    expect(overrunAmount({ ...base, costs: [], commitments, change: { kind: "cost", value: beyond } })).toBe(5_000);
  });

  it("แก้รายการเดิม: ไม่นับตัวเองสองรอบ · ลดยอดลงไม่ต้องอธิบาย", () => {
    const costs = [cost({ id: "a", amount: 90_000 }), cost({ id: "b", amount: 15_000 })];
    // ไม่นับ b เดิม (15,000) ซ้ำ: แก้เป็น 12,000 → รวม 102,000 ยังเกิน 2,000 จึงยังต้องมีสาเหตุ · 9,000 → ไม่เกิน
    expect(overrunAmount({ ...base, costs, commitments: [], change: { kind: "cost", value: cost({ id: "b", amount: 12_000 }) } })).toBe(2_000);
    expect(overrunAmount({ ...base, costs, commitments: [], change: { kind: "cost", value: cost({ id: "b", amount: 9_000 }) } })).toBe(0);
  });

  it("ไม่มีงบให้เทียบ (null) = ไม่ตรวจ · ย้ายบิลไปหมวดอื่น เทียบกับหมวดใหม่", () => {
    expect(overrunAmount({ budget: null, vatClaimable: true, costs: [], commitments: [], change: { kind: "cost", value: cost({ categoryId: null, amount: 9e6 }) } })).toBe(0);
    const costs = [cost({ id: "a", categoryId: "C", amount: 80_000 })];
    expect(overrunAmount({ ...base, costs, commitments: [], change: { kind: "cost", value: cost({ id: "a", categoryId: "B", amount: 80_000 }) } })).toBe(0);
  });
});

describe("รายงานงบรวมยอดผูกพัน", () => {
  const BASE: CostReportInput = {
    lines: [{ rootCategoryId: "B", materialTotal: 60_000, laborTotal: 40_000 }],
    roots: [
      { id: "B", code: "B", name: "งานโครงสร้าง", sortOrder: 2 },
      { id: "C", code: "C", name: "งานสถาปัตยกรรม", sortOrder: 3 },
    ],
    overheadBudget: null,
    contingency: 10_000,
    costs: [{ categoryId: "B", costType: "MATERIAL", amount: 70_000, vatAmount: 0 }],
    commitments: [{ categoryId: "B", remaining: 45_000 }],
    vatClaimable: true,
    revenue: 150_000,
    completed: false,
  };

  it("แถวมีช่องผูกพันแยก · เผื่อเหลือเผื่อขาดถูกใช้กับส่วนที่เกินรวมยอดสั่ง · คาดการณ์นับยอดสั่งด้วย", () => {
    const r = buildCostReport(BASE);
    const b = r.rows.find((x) => x.code === "B")!;
    expect(b).toMatchObject({ actual: 70_000, committed: 45_000, budget: 100_000 });
    // เกิน 15,000 (รวมยอดสั่ง) → เผื่อเหลือเผื่อขาด 10,000 ถูกใช้หมด
    expect(r.rows.find((x) => x.kind === "contingency")).toMatchObject({ budget: 10_000, actual: 10_000 });
    expect(r.totals).toMatchObject({ actual: 70_000, committed: 45_000 });
    // งบ 110,000 · คาดการณ์ต้นทุน = 115,000 (B รวมยอดสั่ง) + 0 (เผื่อฯ หมดแล้ว)
    expect(r.profit).toMatchObject({ plannedProfit: 40_000, forecastProfit: 35_000, actualProfit: null });
  });

  it("หมวดที่มีแค่ยอดสั่ง (ไม่มีใน BOQ ไม่มีบิล) ก็ขึ้นแถว · กำไรจริงตอนจบงานนับเฉพาะที่จ่ายจริง", () => {
    const r = buildCostReport({ ...BASE, commitments: [{ categoryId: "C", remaining: 5_000 }], completed: true });
    expect(r.rows.find((x) => x.code === "C")).toMatchObject({ budget: 0, actual: 0, committed: 5_000 });
    expect(r.profit?.actualProfit).toBe(80_000);
  });
});
