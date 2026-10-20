// ---------- ต้นทุนจริงของโครงการ ----------
//
// ตอบคำถามที่ระบบเดิมตอบไม่ได้: "งานนี้กำไรจริงเท่าไร" — ทุกตัวเลขกำไรก่อนหน้านี้คือ "ตามที่ตั้งราคาไว้"
// เทียบกับงบได้ระดับหมวดงานบนสุด (A–F) เพราะบิลร้านวัสดุใบเดียวมักมีของหลายบรรทัด BOQ
//
// ยอดผูกพัน (สั่งแล้วยังไม่จ่าย) นับรวมกับที่จ่ายแล้วตอนเทียบงบ = "ยอดที่ต้องจ่ายแน่ ๆ" ของหมวด
// ค่าใช้จ่ายที่ดันหมวดเกินงบต้องระบุสาเหตุ — ลูกค้าขอเปลี่ยน = ค้าง "รอออก VO" จนกว่าจะผูกใบงานเพิ่ม-ลด

import { roundTo } from "./rounding";

export type CostType = "MATERIAL" | "LABOR" | "SUBCONTRACT" | "EQUIPMENT" | "OVERHEAD" | "OTHER";

export const COST_TYPES: readonly CostType[] = [
  "MATERIAL",
  "LABOR",
  "SUBCONTRACT",
  "EQUIPMENT",
  "OVERHEAD",
  "OTHER",
];

export const COST_TYPE_LABELS: Record<CostType, string> = {
  MATERIAL: "ค่าวัสดุ",
  LABOR: "ค่าแรง",
  SUBCONTRACT: "ผู้รับเหมาช่วง",
  EQUIPMENT: "เครื่องจักร/อุปกรณ์",
  OVERHEAD: "ค่าดำเนินการ",
  OTHER: "อื่น ๆ",
};

export type CostOverrunReason = "CUSTOMER_CHANGE" | "PRICE_INCREASE" | "REWORK" | "TAKEOFF_SHORT" | "OTHER";

export const COST_OVERRUN_REASONS: readonly CostOverrunReason[] = [
  "CUSTOMER_CHANGE",
  "PRICE_INCREASE",
  "REWORK",
  "TAKEOFF_SHORT",
  "OTHER",
];

export const COST_OVERRUN_REASON_LABELS: Record<CostOverrunReason, string> = {
  CUSTOMER_CHANGE: "ลูกค้าขอเพิ่ม/เปลี่ยน",
  PRICE_INCREASE: "ราคาวัสดุ/ค่าแรงขึ้น",
  REWORK: "ของเสีย/ทำซ้ำ/แก้งาน",
  TAKEOFF_SHORT: "ถอดปริมาณขาด/ประเมินไว้ต่ำ",
  OTHER: "อื่น ๆ",
};

export type CommitmentStatus = "OPEN" | "CLOSED";

/** ใบงานเพิ่ม-ลดที่ผูก/เลือกผูกได้ */
export interface LinkedChangeOrderDto {
  id: string;
  docNo: string;
  title: string;
  status: "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "CANCELLED";
}

/** ค่าใช้จ่ายที่ดันหมวดเกินงบ — null = ไม่ได้เกินงบตอนบันทึก */
export interface CostOverrunDto {
  reason: CostOverrunReason;
  note: string | null;
  changeOrder: LinkedChangeOrderDto | null;
  voWaived: boolean;
  /**
   * ลูกค้าขอเปลี่ยนแต่ยังไม่มีทางเก็บเงิน: ยังไม่ผูกใบงานเพิ่ม-ลด (หรือใบที่ผูกถูกปฏิเสธ/ยกเลิก)
   * และเจ้าของยังไม่ได้ตัดสินใจไม่เก็บเงิน
   */
  voPending: boolean;
}

export interface ProjectCostDto {
  id: string;
  /** YYYY-MM-DD */
  spentOn: string;
  /** null = ค่าดำเนินการ/ทั่วไป ไม่ลงหมวดงาน */
  categoryId: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  costType: CostType;
  description: string;
  vendor: string | null;
  reference: string | null;
  /** ยอดก่อน VAT */
  amount: string;
  vatAmount: string;
  note: string | null;
  /** จ่ายตามยอดผูกพันใบไหน */
  commitmentId: string | null;
  commitmentLabel: string | null;
  overrun: CostOverrunDto | null;
  recordedById: string | null;
  recordedByName: string | null;
  createdAt: string;
}

/** ยอดผูกพัน = สั่ง/ตกลงจ้างแล้ว ยังไม่จ่าย */
export interface ProjectCommitmentDto {
  id: string;
  /** YYYY-MM-DD วันที่สั่ง/ตกลง */
  committedOn: string;
  categoryId: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  costType: CostType;
  description: string;
  vendor: string | null;
  reference: string | null;
  /** ยอดที่ตกลงก่อน VAT */
  amount: string;
  vatAmount: string;
  status: CommitmentStatus;
  closedAt: string | null;
  /** จ่ายแล้ว (ตามบิลที่ผูก) · คงค้าง — นับแบบเดียวกับต้นทุน (จด VAT = ก่อน VAT) · ปิดยอดแล้ว คงค้าง = 0 */
  paid: number;
  remaining: number;
  billCount: number;
  overrun: CostOverrunDto | null;
  note: string | null;
  recordedById: string | null;
  recordedByName: string | null;
  createdAt: string;
}

/** ส่วนสาเหตุเกินงบ — ส่งมาเฉพาะค่าใช้จ่ายที่ดันหมวดเกินงบ (เซิร์ฟเวอร์ตรวจเองอีกรอบ) */
export interface CostOverrunInput {
  overrunReason?: CostOverrunReason | null;
  overrunNote?: string | null;
  /** ลูกค้าขอเปลี่ยน + ออกใบงานเพิ่ม-ลดไว้แล้ว */
  changeOrderId?: string | null;
}

export interface ProjectCommitmentInput extends CostOverrunInput {
  committedOn: string;
  categoryId: string | null;
  costType: CostType;
  description: string;
  vendor?: string | null;
  reference?: string | null;
  amount: number;
  vatAmount?: number;
  note?: string | null;
}

export interface ProjectCostInput extends CostOverrunInput {
  spentOn: string;
  categoryId: string | null;
  costType: CostType;
  description: string;
  vendor?: string | null;
  reference?: string | null;
  amount: number;
  vatAmount?: number;
  note?: string | null;
  /** จ่ายตามยอดผูกพัน — ต้องอยู่หมวดเดียวกับยอดผูกพัน */
  commitmentId?: string | null;
}

/** หนึ่งแถวของตารางงบเทียบใช้จริง — หมวดงานบนสุด หรือแถวค่าดำเนินการ (categoryId = null) */
export interface CostBudgetRowDto {
  /** category = หมวดงาน · overhead = ค่าดำเนินการ/ทั่วไป · contingency = เผื่อเหลือเผื่อขาด (ไม่มีต้นทุนลงตรง) */
  kind: "category" | "overhead" | "contingency";
  categoryId: string | null;
  code: string | null;
  name: string;
  /** null = ไม่มีงบให้เทียบ (เช่น ยังไม่ได้แยกค่าดำเนินการออกจากกำไร) */
  budget: number | null;
  budgetMaterial: number;
  budgetLabor: number;
  actual: number;
  /** ยอดผูกพันที่ยังไม่จ่าย (เฉพาะที่ยังเปิดอยู่) */
  committed: number;
  byType: Partial<Record<CostType, number>>;
  /** ใช้ไปกี่ % ของงบ — null เมื่อไม่มีงบ */
  usedPct: number | null;
}

/** ส่วนนี้ส่งให้เฉพาะ OWNER — ADMIN ได้ null */
export interface CostProfitDto {
  /** รายรับตามสัญญาปัจจุบัน (รวมงานเพิ่ม-ลดที่อนุมัติ) ก่อน VAT */
  revenue: number;
  /** กำไรขั้นต้นตามที่ตั้งราคาไว้ = รายรับ − งบต้นทุน */
  plannedProfit: number;
  /**
   * คาดการณ์เมื่อจบงาน = รายรับ − Σ max(ใช้จริง + ผูกพัน, งบ) ของทุกแถว
   * สมมติว่าหมวดที่ยังใช้ไม่ถึงงบจะใช้จนเต็มงบพอดี · หมวดที่เกินงบไปแล้ว (รวมที่สั่งไว้) นับตามจริง
   */
  forecastProfit: number;
  /** โครงการเสร็จสิ้นแล้ว = ต้นทุนครบ จึงพูดได้ว่า "กำไรจริง" */
  completed: boolean;
  /** กำไรจริง = รายรับ − ต้นทุนที่บันทึก · มีค่าเฉพาะโครงการที่เสร็จสิ้นแล้ว (ระหว่างทางตัวเลขนี้หลอกตา) */
  actualProfit: number | null;
}

/** บรรทัดของ BOQ ตามสัญญาที่ราคาในคลังเปลี่ยนหลังเซ็นสัญญา (และหลังตั้งราคาบรรทัดนั้น) */
export interface SignedPriceDriftLineDto {
  itemId: string;
  name: string;
  unit: string;
  quantity: string;
  /** หมวดบนสุดของบรรทัด — ใช้ดูว่าหมวดนี้จ่ายไปแล้วแค่ไหน (ซื้อไปแล้วหรือยัง) */
  categoryId: string;
  categoryCode: string | null;
  categoryName: string;
  from: { materialUnitPrice: number; laborUnitPrice: number };
  to: { materialUnitPrice: number; laborUnitPrice: number };
  /** ต้นทุนเปลี่ยนเท่าไร ถ้าซื้อ/จ้างตามราคาใหม่ทั้งบรรทัด = จำนวน × ส่วนต่างต่อหน่วย (+ แพงขึ้น · − ถูกลง) */
  delta: number;
  /** วัสดุย่อยที่ราคาเปลี่ยน (บรรทัดที่แตกสูตร) */
  components: { name: string; unit: string; from: string; to: string }[];
  /** ราคาในคลังเปลี่ยนล่าสุดเมื่อ */
  changedAt: string;
  /** กด "ซื้อแล้ว/ล็อกราคาแล้ว" ไว้ที่ราคาคลังปัจจุบัน — ไม่นับในยอดกระทบ */
  acked: boolean;
}

export interface SignedPriceDriftDto {
  contractNo: string;
  signedAt: string;
  lines: SignedPriceDriftLineDto[];
  /** รวมเฉพาะบรรทัดที่ยังไม่กด "ซื้อแล้ว" — แพงขึ้น / ถูกลง (ค่าบวกทั้งคู่) */
  increase: number;
  decrease: number;
}

/**
 * เงินสดของโครงการ (รวม VAT ตามที่เงินเข้า-ออกจริง ไม่ใช่ตัวเลขบัญชีต้นทุน)
 * รับ = เงินเข้าบัญชีจริงจากงวด (หักภาษี ณ ที่จ่าย + เงินประกันที่ถูกกัน) + เงินประกันที่ได้คืน
 * จ่าย = ยอดบิลรวม VAT · ผูกพัน = ยอดที่สั่งแล้วยังไม่จ่าย รวม VAT
 */
export interface ProjectCashDto {
  received: number;
  /** ที่มาของเงินเข้า: received = installments − withholding − retention + retentionReturned */
  receivedDetail: {
    /** ยอดงวดที่ถือว่าชำระแล้ว (ก่อนหัก) */
    installments: number;
    /** ภาษีหัก ณ ที่จ่ายที่ลูกค้าหักไว้ (ได้คืนตอนยื่นภาษี ไม่ใช่เงินสดตอนนี้) */
    withholding: number;
    /** เงินประกันผลงานที่ลูกค้ากันไว้ */
    retention: number;
    /** เงินประกันที่ได้คืนแล้ว (หลังหักภาษี ณ ที่จ่าย) */
    retentionReturned: number;
  };
  paidOut: number;
  /** ที่มาของเงินออก: paidOut = beforeVat + vat */
  paidOutDetail: { beforeVat: number; vat: number };
  /** รับ − จ่าย · ติดลบ = บริษัทออกเงินแทนลูกค้าอยู่ */
  net: number;
  committedOut: number;
  /** ถ้าจ่ายยอดที่สั่งไว้ครบ จะเหลือเท่าไร = net − committedOut */
  projected: number;
  /** งวดแรกที่ยังเก็บไม่ครบ (ของสัญญาที่ลงนามล่าสุด) — null = ไม่มีสัญญาที่ลงนาม หรือเก็บครบทุกงวดแล้ว */
  nextInstallment: { seq: number; milestone: string; dueOn: string | null; outstanding: number } | null;
  /** มีสัญญาที่ลงนามแล้วหรือยัง (ยังไม่มี = ยังไม่มีเงินให้เก็บ ไม่ใช่ลูกค้าค้าง) */
  contractSigned: boolean;
}

export interface ProjectCostReportDto {
  /** เวอร์ชัน BOQ ที่ใช้เป็นงบ — null = ยังไม่มีเวอร์ชันให้เทียบ */
  budgetSource: {
    versionNo: number;
    /** contract = เวอร์ชันตามสัญญาที่ลงนาม/ใบงานเพิ่ม-ลดล่าสุดที่อนุมัติ · latest = ยังไม่มีสัญญา ใช้เวอร์ชันล่าสุด */
    kind: "contract" | "latest";
    contractNo: string | null;
  } | null;
  rows: CostBudgetRowDto[];
  totals: { budget: number; actual: number; committed: number; vat: number };
  /** แยกค่าดำเนินการออกจากกำไรไว้แล้วหรือยัง — false = งบไม่มีแถวค่าดำเนินการ และ "กำไรตามแผน" ยังรวมค่าดำเนินการอยู่ */
  overheadBudgetKnown: boolean;
  /** ต้นทุนในหมวดที่ไม่มีงบ BOQ เลย (หมวดที่ไม่อยู่ในเวอร์ชันงบ) รวมอยู่ใน rows แล้ว แต่ต้องเตือน */
  unbudgetedActual: number;
  profit: CostProfitDto | null;
  /** บริษัทจด VAT แล้ว = ภาษีซื้อขอคืนได้ ไม่นับเป็นต้นทุน · ไม่จด = ภาษีซื้อเป็นต้นทุนด้วย */
  vatClaimable: boolean;
  costs: ProjectCostDto[];
  /** ยอดผูกพันทั้งหมด (ที่เปิดอยู่ขึ้นก่อน) */
  commitments: ProjectCommitmentDto[];
  /** ค่าใช้จ่ายที่ลูกค้าขอเปลี่ยนแต่ยังไม่ได้ออก VO — amount = ยอดต้นทุนของรายการเหล่านั้น (ไม่ใช่ราคาขาย) */
  voPending: { count: number; amount: number };
  /** ใบงานเพิ่ม-ลดของโครงการที่เลือกผูกได้ (ไม่รวมที่ปฏิเสธ/ยกเลิก) */
  changeOrders: LinkedChangeOrderDto[];
  /** หมวดงานบนสุดให้เลือกตอนบันทึก */
  categories: { id: string; code: string | null; name: string }[];
  /** ราคาในคลังเปลี่ยนหลังเซ็นสัญญา — null = ยังไม่มีสัญญาที่ลงนาม หรือหาเวอร์ชันตามสัญญาไม่เจอ */
  priceDrift: SignedPriceDriftDto | null;
  cash: ProjectCashDto;
}

// ---------- ยอดเปิดรับ (จ่ายแล้ว + ผูกพัน) และการตรวจเกินงบ — ใช้ทั้งเซิร์ฟเวอร์และหน้าจอ ตัวเลขจึงตรงกันเสมอ ----------

export interface ExposureCost {
  id: string;
  categoryId: string | null;
  amount: number;
  vatAmount: number;
  commitmentId: string | null;
}

export interface ExposureCommitment {
  id: string;
  categoryId: string | null;
  amount: number;
  vatAmount: number;
  status: CommitmentStatus;
}

/** ต้นทุนของบิล/ยอดผูกพันหนึ่งรายการ — บริษัทไม่จด VAT = ภาษีซื้อเป็นเงินที่จ่ายทิ้ง นับเป็นต้นทุนด้วย */
export function costValue(x: { amount: number; vatAmount: number }, vatClaimable: boolean): number {
  return roundTo(x.amount + (vatClaimable ? 0 : x.vatAmount), 2);
}

/** จ่ายไปแล้วตามยอดผูกพันนี้ (รวมบิลที่ผูก) */
export function commitmentPaid(c: ExposureCommitment, costs: readonly ExposureCost[], vatClaimable: boolean): number {
  return roundTo(
    costs.filter((b) => b.commitmentId === c.id).reduce((sum, b) => sum + costValue(b, vatClaimable), 0),
    2,
  );
}

/** ยอดผูกพันที่ยังไม่จ่าย — ปิดยอดแล้ว = 0 · จ่ายเกินยอดที่สั่ง = 0 (ส่วนเกินอยู่ในบิลแล้ว) */
export function commitmentRemaining(
  c: ExposureCommitment,
  costs: readonly ExposureCost[],
  vatClaimable: boolean,
): number {
  if (c.status === "CLOSED") return 0;
  return roundTo(Math.max(costValue(c, vatClaimable) - commitmentPaid(c, costs, vatClaimable), 0), 2);
}

/** ยอดเปิดรับของหมวด = จ่ายแล้ว + ผูกพันที่ยังไม่จ่าย · key null = ค่าดำเนินการ/ทั่วไป */
export function exposureOf(
  key: string | null,
  costs: readonly ExposureCost[],
  commitments: readonly ExposureCommitment[],
  vatClaimable: boolean,
): number {
  const paid = costs.filter((c) => c.categoryId === key).reduce((sum, c) => sum + costValue(c, vatClaimable), 0);
  const open = commitments
    .filter((c) => c.categoryId === key)
    .reduce((sum, c) => sum + commitmentRemaining(c, costs, vatClaimable), 0);
  return roundTo(paid + open, 2);
}

/**
 * งบของหมวดตามแถวในรายงาน: หมวดงานที่ไม่มีแถว/ไม่มีใน BOQ = งบ 0 (ใช้เท่าไรก็เกิน)
 * · ค่าดำเนินการที่ยังไม่แยกจากกำไร = null (ไม่มีงบให้เทียบ จึงไม่ตรวจ)
 */
export function budgetForKey(rows: readonly CostBudgetRowDto[], key: string | null): number | null {
  if (key == null) return rows.find((r) => r.kind === "overhead")?.budget ?? null;
  return rows.find((r) => r.kind === "category" && r.categoryId === key)?.budget ?? 0;
}

export type ExposureChange =
  | { kind: "cost"; value: ExposureCost }
  | { kind: "commitment"; value: ExposureCommitment };

/**
 * รายการนี้ (ใหม่ หรือแก้ทับของเดิมที่ id เดียวกัน) ทำให้หมวดเกินงบเพิ่มขึ้นกี่บาท — 0 = ไม่ต้องระบุสาเหตุ
 *
 * นับเฉพาะส่วนที่เกินงบ "เพิ่ม" จากเดิม: บิลที่จ่ายตามยอดผูกพันซึ่งอธิบายสาเหตุไว้แล้ว ไม่ต้องอธิบายซ้ำ
 * เว้นแต่จ่ายเกินยอดที่สั่ง · หมวดที่เกินงบอยู่แล้ว บิลถัดไปที่เพิ่มยอดก็ต้องระบุด้วย
 */
export function overrunAmount(args: {
  budget: number | null;
  costs: readonly ExposureCost[];
  commitments: readonly ExposureCommitment[];
  vatClaimable: boolean;
  change: ExposureChange;
}): number {
  const { budget, vatClaimable, change } = args;
  if (budget == null) return 0;
  const key = change.value.categoryId;
  const costs = args.costs.filter((c) => !(change.kind === "cost" && c.id === change.value.id));
  const commitments = args.commitments.filter((c) => !(change.kind === "commitment" && c.id === change.value.id));
  const before = exposureOf(key, costs, commitments, vatClaimable);
  const after =
    change.kind === "cost"
      ? exposureOf(key, [...costs, change.value], commitments, vatClaimable)
      : exposureOf(key, costs, [...commitments, change.value], vatClaimable);
  return roundTo(Math.max(after - Math.max(budget, before), 0), 2);
}
