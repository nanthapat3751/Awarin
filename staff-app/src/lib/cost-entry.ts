import type {
  CostOverrunReason,
  CostType,
  ExposureChange,
  LinkedChangeOrderDto,
  ProjectCommitmentDto,
  ProjectCostDto,
  ProjectCostReportDto,
} from "@systemboq/shared-types";
import { budgetForKey, overrunAmount, roundTo } from "@systemboq/shared-types";

/** สถานะฟอร์มบิล/ยอดที่สั่ง + ตัวช่วยคิด (แยกจากคอมโพเนนต์ให้ fast refresh ทำงาน) — ดู components/CostEntryForm.tsx */

export const INPUT =
  "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-100 disabled:text-slate-500";

export const VAT_RATE = 7;
/** ค่าในช่อง "หมวด" ของรายการที่ไม่ลงหมวดงาน — <select> ใช้ค่าว่างไม่ได้เพราะชนกับ "ยังไม่เลือก" */
export const OVERHEAD = "__overhead__";

export const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n: number) => roundTo(n, 2);

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) — ตรงกับที่เซิร์ฟเวอร์ใช้ตรวจ "ห้ามวันในอนาคต" */
export function todayBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export const CHANGE_ORDER_STATUS_LABEL: Record<LinkedChangeOrderDto["status"], string> = {
  DRAFT: "ร่าง",
  SENT: "ส่งลูกค้าแล้ว",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ลูกค้าปฏิเสธ",
  CANCELLED: "ยกเลิก",
};

export const changeOrderLabel = (co: LinkedChangeOrderDto) =>
  `${co.docNo} · ${co.title} (${CHANGE_ORDER_STATUS_LABEL[co.status]})`;


export type EntryKind = "cost" | "commitment";

export interface FormState {
  kind: EntryKind;
  /** แก้รายการเดิม — null = รายการใหม่ */
  editingId: string | null;
  /** วันที่ในบิล / วันที่สั่ง */
  date: string;
  category: string;
  costType: CostType;
  description: string;
  vendor: string;
  reference: string;
  /** ยอดตามบิล/ใบสั่ง — ถ้าติ๊ก "มี VAT" คือยอดรวม VAT แล้ว */
  total: string;
  hasVat: boolean;
  note: string;
  /** บิล: จ่ายตามยอดผูกพันใบไหน ("" = ไม่ได้สั่งไว้ก่อน) */
  commitmentId: string;
  overrunReason: CostOverrunReason | "";
  overrunNote: string;
  changeOrderId: string;
}

export function emptyForm(kind: EntryKind, keep?: Pick<FormState, "date" | "category" | "costType">): FormState {
  return {
    kind,
    editingId: null,
    date: keep?.date ?? todayBangkok(),
    category: keep?.category ?? "",
    costType: keep?.costType ?? "MATERIAL",
    description: "",
    vendor: "",
    reference: "",
    total: "",
    hasVat: false,
    note: "",
    commitmentId: "",
    overrunReason: "",
    overrunNote: "",
    changeOrderId: "",
  };
}

function overrunFields(row: ProjectCostDto | ProjectCommitmentDto) {
  return {
    overrunReason: row.overrun?.reason ?? ("" as const),
    overrunNote: row.overrun?.note ?? "",
    changeOrderId: row.overrun?.changeOrder?.id ?? "",
  };
}

const totalOf = (row: { amount: string; vatAmount: string }) => String(round2(Number(row.amount) + Number(row.vatAmount)));

export function formFromCost(cost: ProjectCostDto): FormState {
  return {
    kind: "cost",
    editingId: cost.id,
    date: cost.spentOn,
    category: cost.categoryId ?? OVERHEAD,
    costType: cost.costType,
    description: cost.description,
    vendor: cost.vendor ?? "",
    reference: cost.reference ?? "",
    total: totalOf(cost),
    hasVat: Number(cost.vatAmount) > 0,
    note: cost.note ?? "",
    commitmentId: cost.commitmentId ?? "",
    ...overrunFields(cost),
  };
}

export function formFromCommitment(c: ProjectCommitmentDto): FormState {
  return {
    kind: "commitment",
    editingId: c.id,
    date: c.committedOn,
    category: c.categoryId ?? OVERHEAD,
    costType: c.costType,
    description: c.description,
    vendor: c.vendor ?? "",
    reference: c.reference ?? "",
    total: totalOf(c),
    hasVat: Number(c.vatAmount) > 0,
    note: c.note ?? "",
    commitmentId: "",
    ...overrunFields(c),
  };
}

/** บิลใหม่ที่จ่ายตามยอดผูกพัน — หมวด/ประเภท/ร้าน/รายการตามยอดที่สั่ง ยอดเงินเริ่มที่คงค้าง */
export function formPayingCommitment(c: ProjectCommitmentDto): FormState {
  return {
    ...emptyForm("cost"),
    category: c.categoryId ?? OVERHEAD,
    costType: c.costType,
    description: c.description,
    vendor: c.vendor ?? "",
    commitmentId: c.id,
    total: c.remaining > 0 ? String(c.remaining) : "",
  };
}

/** ยอดตามบิล → ก่อน VAT + ภาษีซื้อ (ถอด VAT ออกจากยอดรวม แบบเดียวกับที่ร้านพิมพ์ในใบกำกับภาษี) */
export function splitVat(form: Pick<FormState, "total" | "hasVat">): { amount: number; vatAmount: number } {
  const total = Number(form.total);
  if (!Number.isFinite(total) || total <= 0) return { amount: 0, vatAmount: 0 };
  if (!form.hasVat) return { amount: round2(total), vatAmount: 0 };
  const amount = round2((total * 100) / (100 + VAT_RATE));
  return { amount, vatAmount: round2(total - amount) };
}

/** รายการนี้ทำให้หมวดเกินงบเพิ่มกี่บาท (0 = ไม่ต้องระบุสาเหตุ) — สูตรเดียวกับเซิร์ฟเวอร์ */
export function formOverrun(report: ProjectCostReportDto, form: FormState): number {
  const split = splitVat(form);
  if (!form.category || split.amount <= 0) return 0;
  const categoryId = form.category === OVERHEAD ? null : form.category;
  const id = form.editingId ?? "__new__";
  const change: ExposureChange =
    form.kind === "cost"
      ? {
          kind: "cost",
          value: { id, categoryId, ...split, commitmentId: form.commitmentId || null },
        }
      : {
          kind: "commitment",
          value: {
            id,
            categoryId,
            ...split,
            status: report.commitments.find((c) => c.id === form.editingId)?.status ?? "OPEN",
          },
        };
  return overrunAmount({
    budget: budgetForKey(report.rows, categoryId),
    costs: report.costs.map((c) => ({
      id: c.id,
      categoryId: c.categoryId,
      amount: Number(c.amount),
      vatAmount: Number(c.vatAmount),
      commitmentId: c.commitmentId,
    })),
    commitments: report.commitments.map((c) => ({
      id: c.id,
      categoryId: c.categoryId,
      amount: Number(c.amount),
      vatAmount: Number(c.vatAmount),
      status: c.status,
    })),
    vatClaimable: report.vatClaimable,
    change,
  });
}

export function categoryLabelOf(report: ProjectCostReportDto, category: string): string {
  if (category === OVERHEAD) return "ค่าดำเนินการ/ทั่วไป";
  const c = report.categories.find((x) => x.id === category);
  return c ? `${c.code ? `${c.code} ` : ""}${c.name}` : "หมวดนี้";
}
