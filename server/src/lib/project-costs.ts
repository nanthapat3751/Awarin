import { costValue, type CostBudgetRowDto, type CostProfitDto, type CostType } from "@systemboq/shared-types";

import { round2 } from "./pricing";

/**
 * งบเทียบใช้จริงของโครงการ — คำนวณล้วน ไม่แตะฐานข้อมูล (เทสต์ได้ตรง ๆ)
 *
 * งบมาจาก BOQ ของเวอร์ชันตามสัญญา: ต้นทุนวัสดุ+ค่าแรงรายหมวดบนสุด · ค่าดำเนินการ (ถ้าแยกไว้แล้ว)
 * · เผื่อเหลือเผื่อขาด ซึ่งไม่มีต้นทุนลงตรง แต่ถูกใช้ไปกับหมวดที่เกินงบก่อน
 *
 * ยอดผูกพัน (สั่งแล้วยังไม่จ่าย) แยกช่องจาก "ใช้จริง" แต่นับรวมตอนตัดสินว่าเกินงบและตอนคาดการณ์กำไร
 * — เงินที่ตกลงจ่ายไปแล้วคือเงินที่ต้องจ่ายแน่ ๆ · กำไรจริง (งานเสร็จ) นับเฉพาะที่จ่ายจริง
 */

export interface BudgetLine {
  /** หมวดบนสุดของบรรทัด BOQ */
  rootCategoryId: string;
  materialTotal: number;
  laborTotal: number;
}

export interface RootCategory {
  id: string;
  code: string | null;
  name: string;
  sortOrder: number;
}

export interface CostLine {
  categoryId: string | null;
  costType: CostType;
  amount: number;
  vatAmount: number;
}

/** ยอดผูกพันที่ยังไม่จ่าย (คิดหักบิลที่ผูกแล้ว — commitmentRemaining ใน shared-types) */
export interface CommitmentLine {
  categoryId: string | null;
  remaining: number;
}

export interface CostReportInput {
  lines: BudgetLine[];
  roots: RootCategory[];
  /** null = ยังไม่ได้แยกค่าดำเนินการออกจากกำไร */
  overheadBudget: number | null;
  contingency: number;
  costs: CostLine[];
  commitments?: CommitmentLine[];
  /** บริษัทจด VAT = ภาษีซื้อขอคืนได้ ไม่ใช่ต้นทุน */
  vatClaimable: boolean;
  /** รายรับก่อน VAT — null = ไม่รู้ (สัญญาเก่าที่ไม่รู้ยอด VAT) → ไม่คิดกำไร */
  revenue: number | null;
  completed: boolean;
}

export interface CostReport {
  rows: CostBudgetRowDto[];
  totals: { budget: number; actual: number; committed: number; vat: number };
  unbudgetedActual: number;
  profit: CostProfitDto | null;
}

/** ต้นทุนของบิลหนึ่งใบ — ไม่จด VAT แปลว่าภาษีซื้อคือเงินที่จ่ายทิ้ง จึงนับเป็นต้นทุนด้วย */
export function costOf(cost: Pick<CostLine, "amount" | "vatAmount">, vatClaimable: boolean): number {
  return costValue(cost, vatClaimable);
}

function usedPct(actual: number, budget: number | null): number | null {
  if (budget == null || budget <= 0) return null;
  return Math.round((actual / budget) * 1000) / 10;
}

export function buildCostReport(input: CostReportInput): CostReport {
  const byRoot = new Map<string, { material: number; labor: number }>();
  for (const line of input.lines) {
    const acc = byRoot.get(line.rootCategoryId) ?? { material: 0, labor: 0 };
    acc.material += line.materialTotal;
    acc.labor += line.laborTotal;
    byRoot.set(line.rootCategoryId, acc);
  }

  const actualOf = new Map<string | null, { total: number; byType: Partial<Record<CostType, number>> }>();
  let vat = 0;
  for (const cost of input.costs) {
    const key = cost.categoryId;
    const acc = actualOf.get(key) ?? { total: 0, byType: {} };
    const value = costOf(cost, input.vatClaimable);
    acc.total = round2(acc.total + value);
    acc.byType[cost.costType] = round2((acc.byType[cost.costType] ?? 0) + value);
    actualOf.set(key, acc);
    vat += cost.vatAmount;
  }

  const committedOf = new Map<string | null, number>();
  for (const c of input.commitments ?? []) {
    if (c.remaining <= 0) continue;
    committedOf.set(c.categoryId, round2((committedOf.get(c.categoryId) ?? 0) + c.remaining));
  }

  // หมวดที่มีงบ หรือมีต้นทุนจริงลง (หมวดที่ไม่อยู่ใน BOQ เลยแต่มีบิลลง ต้องเห็น ไม่ใช่หายไป)
  const rootIds = new Set<string>([
    ...byRoot.keys(),
    ...[...actualOf.keys(), ...committedOf.keys()].filter((k): k is string => k != null),
  ]);
  const roots = input.roots
    .filter((r) => rootIds.has(r.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.code ?? "").localeCompare(b.code ?? ""));

  let unbudgetedActual = 0;
  const rows: CostBudgetRowDto[] = roots.map((root) => {
    const budget = byRoot.get(root.id);
    const actual = actualOf.get(root.id);
    const budgetTotal = budget ? round2(budget.material + budget.labor) : 0;
    if (!budget && actual) unbudgetedActual = round2(unbudgetedActual + actual.total);
    return {
      kind: "category",
      categoryId: root.id,
      code: root.code,
      name: root.name,
      budget: budgetTotal,
      budgetMaterial: round2(budget?.material ?? 0),
      budgetLabor: round2(budget?.labor ?? 0),
      actual: actual?.total ?? 0,
      committed: committedOf.get(root.id) ?? 0,
      byType: actual?.byType ?? {},
      usedPct: usedPct(actual?.total ?? 0, budgetTotal),
    };
  });

  const overheadActual = actualOf.get(null);
  const overheadCommitted = committedOf.get(null) ?? 0;
  if (input.overheadBudget != null || overheadActual || overheadCommitted > 0) {
    rows.push({
      kind: "overhead",
      categoryId: null,
      code: null,
      name: "ค่าดำเนินการ/ทั่วไป",
      budget: input.overheadBudget == null ? null : round2(input.overheadBudget),
      budgetMaterial: 0,
      budgetLabor: 0,
      actual: overheadActual?.total ?? 0,
      committed: overheadCommitted,
      byType: overheadActual?.byType ?? {},
      usedPct: usedPct(overheadActual?.total ?? 0, input.overheadBudget),
    });
  }

  // เผื่อเหลือเผื่อขาดถูกใช้ไปกับส่วนที่เกินงบของแถวอื่นก่อน (นับยอดที่สั่งไว้แล้วด้วย) — แสดงว่าเหลือเท่าไร
  const overrun = round2(
    rows.reduce((sum, r) => sum + (r.budget == null ? 0 : Math.max(r.actual + r.committed - r.budget, 0)), 0),
  );
  const contingency = round2(input.contingency);
  if (contingency > 0) {
    const used = Math.min(overrun, contingency);
    rows.push({
      kind: "contingency",
      categoryId: null,
      code: null,
      name: "เผื่อเหลือเผื่อขาด",
      budget: contingency,
      budgetMaterial: 0,
      budgetLabor: 0,
      actual: round2(used),
      committed: 0,
      byType: {},
      usedPct: usedPct(used, contingency),
    });
  }

  const budgetTotal = round2(rows.reduce((sum, r) => sum + (r.budget ?? 0), 0));
  // แถวเผื่อเหลือเผื่อขาดเป็นแค่การดูดซับส่วนเกิน ไม่ใช่เงินที่จ่ายเพิ่ม — ไม่บวกซ้ำในยอดใช้จริง
  const actualTotal = round2(rows.filter((r) => r.kind !== "contingency").reduce((sum, r) => sum + r.actual, 0));
  const committedTotal = round2(rows.reduce((sum, r) => sum + r.committed, 0));

  let profit: CostProfitDto | null = null;
  if (input.revenue != null) {
    // คาดการณ์: แถวที่ยังไม่ถึงงบนับเต็มงบ · แถวที่เกินนับตามจริง · เผื่อเหลือเผื่อขาดนับเฉพาะส่วนที่ยัง
    // ไม่ถูกส่วนเกินกินไป (ส่วนที่ถูกกินอยู่ในยอดจริงของแถวที่เกินแล้ว) — ทุกแถวตรงงบพอดี = กำไรตามแผนพอดี
    const forecastCost = round2(
      rows.reduce((sum, r) => {
        if (r.kind === "contingency") return sum + Math.max((r.budget ?? 0) - r.actual, 0);
        return sum + Math.max(r.actual + r.committed, r.budget ?? 0);
      }, 0),
    );
    profit = {
      revenue: round2(input.revenue),
      plannedProfit: round2(input.revenue - budgetTotal),
      forecastProfit: round2(input.revenue - forecastCost),
      completed: input.completed,
      actualProfit: input.completed ? round2(input.revenue - actualTotal) : null,
    };
  }

  return {
    rows,
    totals: { budget: budgetTotal, actual: actualTotal, committed: committedTotal, vat: round2(vat) },
    unbudgetedActual,
    profit,
  };
}
