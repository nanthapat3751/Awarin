import type {
  CostBudgetRowDto,
  CostType,
  ProjectCommitmentDto,
  ProjectCommitmentInput,
  ProjectCostDto,
  ProjectCostInput,
  ProjectCostReportDto,
} from "@systemboq/shared-types";
import { roundTo, COST_TYPE_LABELS } from "@systemboq/shared-types";
import { ClipboardList, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useConfirm } from "../lib/confirm-context";
import {
  ackPriceDrift,
  createProjectCommitment,
  createProjectCost,
  deleteProjectCommitment,
  deleteProjectCost,
  getProjectCosts,
  resolveCostVo,
  setProjectCommitmentStatus,
  unackPriceDrift,
  updateProjectCommitment,
  updateProjectCost,
} from "../lib/project-costs-api";
import { useToast } from "../lib/toast-context";
import { Button, iconButtonClasses } from "./Button";
import { CommitmentsSection, CostRowExtras, VoPendingCard } from "./CostCommitments";
import { CashCard, PriceDriftCard } from "./CostSignals";
import { CostEntryForm } from "./CostEntryForm";
import {
  emptyForm,
  formFromCommitment,
  formFromCost,
  formOverrun,
  formPayingCommitment,
  INPUT,
  money,
  OVERHEAD,
  splitVat,
  type EntryKind,
  type FormState,
} from "../lib/cost-entry";
import { Pagination } from "./Pagination";
import { TableSkeleton } from "./Skeleton";
import { Tooltip } from "./Tooltip";

const round2 = (n: number) => roundTo(n, 2);

function thaiDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

/** ยอดเปิดรับ = จ่ายแล้ว + สั่งแล้วยังไม่จ่าย — ใช้ตัดสินสีแถบ/เกินงบ (เงินที่ตกลงจ่ายแล้วคือเงินที่ต้องจ่ายแน่ ๆ) */
const exposureOf = (row: CostBudgetRowDto) => round2(row.actual + row.committed);

function rowStatus(row: CostBudgetRowDto): { bar: string; text: string } {
  const exposure = exposureOf(row);
  if (row.budget == null || row.budget <= 0) return { bar: "bg-slate-300", text: "text-slate-500" };
  if (exposure > row.budget) return { bar: "bg-red-500", text: "text-red-700" };
  if (exposure > row.budget * 0.9) return { bar: "bg-amber-500", text: "text-amber-700" };
  return { bar: "bg-emerald-500", text: "text-slate-600" };
}

/** ส่วน "สั่งแล้ว" บนแถบ — สีเดียวกับส่วนจ่ายแล้วแต่จางและมีลายเฉียง (ยังไม่ใช่เงินที่ออกไปจริง) */
const STRIPES = {
  backgroundImage:
    "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.55) 0 3px, transparent 3px 6px)",
};

/** แถบสองช่วง: จ่ายแล้ว (ทึบ) + สั่งแล้วยังไม่จ่าย (จาง ลายเฉียง) · เกิน 100% ตัดที่ขอบ */
function SplitBar({
  actual,
  committed,
  budget,
  color,
  className,
}: Readonly<{ actual: number; committed: number; budget: number; color: string; className: string }>) {
  const paidPct = Math.min((actual / budget) * 100, 100);
  const committedPct = Math.min((committed / budget) * 100, 100 - paidPct);
  return (
    <span className={`flex overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <span
        className={`block h-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${color}`}
        style={{ width: `${paidPct}%` }}
      />
      {committedPct > 0 && (
        <span className={`block h-full opacity-45 ${color}`} style={{ width: `${committedPct}%`, ...STRIPES }} />
      )}
    </span>
  );
}

/** แถวหนึ่งหมวด: ชื่อ (+ แยกตามประเภทค่าใช้จ่าย) · แถบใช้งบ · "ใช้ไป / งบ" — แทนตาราง 5 คอลัมน์เดิม */
function BudgetRow({ row }: Readonly<{ row: CostBudgetRowDto }>) {
  const status = rowStatus(row);
  const types = (Object.entries(row.byType) as [CostType, number][]).filter(([, v]) => v > 0);
  const left = row.budget == null ? null : round2(row.budget - exposureOf(row));
  let sub: string | null = null;
  if (row.kind === "contingency") sub = "ใช้ชดเชยหมวดที่เกินงบก่อน (นับยอดที่สั่งไว้ด้วย) ไม่มีบิลลงตรง";
  else if (types.length > 0) sub = types.map(([t, v]) => `${COST_TYPE_LABELS[t]} ${money(v)}`).join(" · ");

  return (
    <li className="grid grid-cols-1 items-center gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]">
      <div className="min-w-0">
        <p className="text-slate-800">
          {row.code && <span className="mr-1.5 text-slate-500">{row.code}</span>}
          {row.name}
        </p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      <div>
        {row.budget != null && row.budget > 0 ? (
          <SplitBar actual={row.actual} committed={row.committed} budget={row.budget} color={status.bar} className="h-2" />
        ) : (
          <span className="text-xs text-slate-400">
            {exposureOf(row) > 0 && row.kind === "category" ? "ไม่มีงบในหมวดนี้" : "ยังไม่ได้แยกงบ"}
          </span>
        )}
      </div>
      <div className="text-right tabular-nums sm:min-w-44">
        <p className="text-slate-700">
          <span className="font-medium text-slate-900">{money(row.actual)}</span>
          {row.budget != null && <span className="text-slate-500"> / {money(row.budget)}</span>}
        </p>
        {row.committed > 0 && <p className="text-xs text-slate-500">สั่งแล้ว {money(row.committed)}</p>}
        {left != null && left < 0 && (
          <p className="text-xs font-medium text-red-700">
            เกินงบ{row.committed > 0 && row.actual <= (row.budget ?? 0) ? " (รวมที่สั่ง)" : ""} {money(-left)}
          </p>
        )}
      </div>
    </li>
  );
}

/** ใช้งบเกินกี่ % ถึงเตือน (เส้นขีดบนแถบ + แถบเปลี่ยนเป็นสีอำพัน) */
const BUDGET_WARN_PCT = 80;

/**
 * กำไรเป็นประโยคเดียว (เฉพาะ OWNER — เซิร์ฟเวอร์ส่ง profit = null ให้ ADMIN)
 * เดิมเป็นการ์ดสองใบ "กำไรขั้นต้นตามที่ตั้งราคาไว้" + "คาดการณ์เมื่อจบงาน" ที่ขึ้นตัวเลขเดียวกันตอนยังไม่เกินงบ
 * ตอนนี้: งานเสร็จ = กำไรจริง · มีหมวดเกินงบ = บอกทั้งที่ตั้งไว้และที่คาดว่าจะเหลือ · ไม่งั้นบอกแค่ที่ตั้งไว้
 */
function ProfitLine({ report }: Readonly<{ report: ProjectCostReportDto }>) {
  const { profit } = report;
  if (!profit) return null;
  const withOverhead = report.overheadBudgetKnown ? "" : " (รวมค่าดำเนินการ)";
  let text: ReactNode;
  let tone = "bg-slate-50 text-slate-700";
  if (profit.actualProfit != null) {
    tone = profit.actualProfit < 0 ? "bg-red-50 text-red-800" : tone;
    text = (
      <>
        งานเสร็จแล้ว — กำไรจริง{withOverhead} <b className="tabular-nums">{money(profit.actualProfit)}</b> บาท
        {report.totals.committed > 0 && (
          <span className="block text-xs text-amber-800">
            ยังมียอดที่สั่งค้างจ่าย {money(report.totals.committed)} บาท — บันทึกบิลหรือปิดยอดให้ครบ ตัวเลขนี้ถึงจะครบ
          </span>
        )}
      </>
    );
  } else if (profit.forecastProfit < profit.plannedProfit) {
    tone = "bg-amber-50 text-amber-900";
    text = (
      <>
        ตั้งกำไรไว้{withOverhead} <b className="tabular-nums">{money(profit.plannedProfit)}</b> บาท · มีหมวดเกินงบ
        {report.totals.committed > 0 ? " (นับยอดที่สั่งไว้แล้ว)" : ""} คาดว่าจะเหลือ{" "}
        <b className="tabular-nums">{money(profit.forecastProfit)}</b> บาท
      </>
    );
  } else {
    text = (
      <>
        ถ้าใช้ไม่เกินงบ บริษัทจะได้กำไร{withOverhead} <b className="tabular-nums">{money(profit.plannedProfit)}</b> บาท
      </>
    );
  }
  return (
    <p className={`mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg px-4 py-2.5 text-sm ${tone}`}>
      <span>{text}</span>
      <span className="ml-auto text-xs text-slate-400">เห็นเฉพาะเจ้าของ</span>
    </p>
  );
}

const pctOf = (n: number, budget: number) => Math.round((n / budget) * 1000) / 10;

/**
 * สรุปบนสุด (แบบ A ผู้ใช้เลือก 14 ต.ค. 2026 — "ง่าย ดูไม่งง"): ประโยคเดียว "ใช้ไป X จากงบ Y บาท" + เหลือ/เกินงบ
 * + แถบใช้งบ (เขียว → อำพันเมื่อเกิน 80% → แดงเมื่อเกินงบ) + บรรทัดกำไร
 * มียอดที่สั่งไว้: แถบมีช่วงจางต่อท้าย และ "เหลือ" หักยอดที่สั่งแล้ว (เงินที่ตกลงจ่ายแล้วใช้ซ้ำไม่ได้)
 */
function Summary({ report, sourceText }: Readonly<{ report: ProjectCostReportDto; sourceText: string }>) {
  const { totals } = report;
  const exposure = round2(totals.actual + totals.committed);
  const hasBudget = totals.budget > 0;
  const exposurePct = hasBudget ? pctOf(exposure, totals.budget) : null;
  const remaining = round2(totals.budget - exposure);
  const over = remaining < 0;
  let barColor = "bg-emerald-500";
  if (exposurePct != null && exposurePct > 100) barColor = "bg-red-600";
  else if (exposurePct != null && exposurePct >= BUDGET_WARN_PCT) barColor = "bg-amber-500";

  let remainLabel = over ? "เกินงบ" : "เหลือ";
  if (totals.committed > 0) remainLabel += " (หักที่สั่งแล้ว)";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">ต้นทุนจริงเทียบงบ · {sourceText}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            ใช้ไป <span className="tabular-nums">{money(totals.actual)}</span>{" "}
            <span className="text-sm font-normal text-slate-500">จากงบ {money(totals.budget)} บาท</span>
          </p>
          {totals.committed > 0 && (
            <p className="mt-0.5 text-sm text-slate-600">
              + สั่งแล้วยังไม่จ่าย <span className="font-medium tabular-nums text-slate-800">{money(totals.committed)}</span> บาท
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">{remainLabel}</p>
          <p className={`text-2xl font-semibold tabular-nums ${over ? "text-red-700" : "text-emerald-700"}`}>
            {money(Math.abs(remaining))}
          </p>
        </div>
      </div>
      <div
        className="relative mt-4"
        role="meter"
        aria-label="ใช้งบไปแล้ว รวมยอดที่สั่ง"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={exposurePct ?? 0}
      >
        {hasBudget ? (
          <SplitBar actual={totals.actual} committed={totals.committed} budget={totals.budget} color={barColor} className="h-3" />
        ) : (
          <span className="block h-3 rounded-full bg-slate-100" />
        )}
        {/* เส้นเตือนที่ 80% */}
        <span aria-hidden className="absolute -bottom-0.5 -top-0.5 w-0.5 rounded bg-amber-400" style={{ left: `${BUDGET_WARN_PCT}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 text-xs text-slate-500">
        <span className={exposurePct != null && exposurePct > 100 ? "font-medium text-red-700" : ""}>
          {!hasBudget && "ยังไม่มีงบใน BOQ"}
          {hasBudget && totals.committed > 0 && (
            <>
              จ่ายแล้ว {pctOf(totals.actual, totals.budget)}% · รวมที่สั่ง {exposurePct}% ของงบ
            </>
          )}
          {hasBudget && totals.committed <= 0 && `${exposurePct}% ของงบ`}
        </span>
        <span>เตือนเมื่อใช้ถึง {BUDGET_WARN_PCT}%</span>
      </div>
      <ProfitLine report={report} />
    </div>
  );
}

/**
 * ยังไม่มีบิลและยอดที่สั่งเลย (แบบ C) — แทนการโชว์ 0 ทุกช่อง: บอกว่าหน้านี้ใช้ทำอะไร + ปุ่มบันทึกบิลแรก
 * + ตัวเลขอ้างอิงที่มีอยู่แล้ว (งบ · จำนวนหมวด · กำไรที่ตั้งไว้) · พอมีรายการแรก หน้าเปลี่ยนเป็นแบบ A เอง
 */
function EmptyStart({
  report,
  onStart,
}: Readonly<{ report: ProjectCostReportDto; onStart: (kind: EntryKind) => void }>) {
  const budget = report.totals.budget;
  const categoryCount = report.rows.filter((r) => r.kind === "category" && (r.budget ?? 0) > 0).length;
  return (
    <div className="flex flex-col items-center rounded-lg border border-slate-200 bg-white px-6 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
        <Receipt size={26} aria-hidden />
      </span>
      <p className="mt-4 text-lg font-semibold text-slate-900">ยังไม่ได้บันทึกค่าใช้จ่ายของโครงการนี้</p>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-slate-500">
        ทุกครั้งที่จ่ายค่าวัสดุ ค่าแรง หรือค่าเหมาช่าง ให้บันทึกบิลไว้
        {budget > 0 ? (
          <>
            {" "}ระบบจะเทียบกับงบ <b className="text-slate-700">{money(budget)} บาท</b> จาก BOQ ให้เองว่าแต่ละหมวดใช้ไปเท่าไร เหลือเท่าไร
          </>
        ) : (
          " ระบบจะรวมยอดให้ (โครงการนี้ยังไม่มี BOQ ให้ใช้เป็นงบ)"
        )}
      </p>
      <Button variant="brand" className="mt-5" onClick={() => onStart("cost")}>
        <Plus size={16} /> บันทึกบิลแรก
      </Button>
      <button
        type="button"
        onClick={() => onStart("commitment")}
        className="link-pill mt-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        หรือบันทึกยอดที่สั่งไว้ก่อน (ยังไม่จ่าย)
      </button>
      {budget > 0 && (
        <dl className="mt-8 grid w-full max-w-xl grid-cols-1 gap-3 text-left text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">งบทั้งหมด</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{money(budget)}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">หมวดที่มีงบ</dt>
            <dd className="font-semibold text-slate-900">{categoryCount} หมวด</dd>
          </div>
          {report.profit && (
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">กำไรที่ตั้งไว้ (เห็นเฉพาะเจ้าของ)</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{money(report.profit.plannedProfit)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

/**
 * แท็บต้นทุนจริง — งบจาก BOQ ตามสัญญา เทียบกับบิลที่จ่ายจริง + ยอดที่สั่งแล้วยังไม่จ่าย รายหมวด
 *
 * ตัวเลขกำไรมาจากเซิร์ฟเวอร์เฉพาะ OWNER (ADMIN ได้ null) หน้าจอจึงไม่ต้องซ่อนเอง
 * ค่าใช้จ่ายที่ดันหมวดเกินงบต้องเลือกสาเหตุ (เซิร์ฟเวอร์บังคับ) · ลูกค้าขอเปลี่ยน = ค้างการ์ด "รอออกใบงานเพิ่ม-ลด"
 */
// งานก่อสร้างหลังหนึ่งมีบิลหลักร้อยใบ — แบ่งหน้าบนจอ (รายงานต้นทุนต้องได้บิลครบทุกใบมารวมยอดอยู่แล้ว)
const BILLS_PAGE_SIZE = 15;

export function ProjectCostsPanel({
  projectId,
  onGoToContract,
}: Readonly<{ projectId: string; onGoToContract?: () => void }>) {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  const [report, setReport] = useState<ProjectCostReportDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  /** กดบันทึกแล้วยังขาดสาเหตุ → ขึ้นกรอบแดงในกล่องสาเหตุ */
  const [showError, setShowError] = useState(false);
  const [filter, setFilter] = useState("");
  const [billPage, setBillPage] = useState(1);
  const billsRef = useRef<HTMLElement>(null);
  const formWrapRef = useRef<HTMLDivElement>(null);
  const overrunRef = useRef<HTMLFieldSetElement>(null);
  const [view, setView] = useCostView();

  useEffect(() => {
    let alive = true;
    getProjectCosts(projectId)
      .then((res) => {
        if (alive) setReport(res);
      })
      .catch((err) => {
        if (alive) toast.error(err instanceof ApiError ? err.message : "โหลดข้อมูลต้นทุนไม่สำเร็จ");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  /** เปิดฟอร์ม แล้วเลื่อนให้เห็น — กด "จ่ายบิล" จากตารางยอดที่สั่งซึ่งอยู่ไกลจากตัวฟอร์ม */
  function openForm(next: FormState) {
    setForm(next);
    setShowError(false);
    // ฟอร์มอยู่ในแท็บบิลและยอดสั่ง — กดจากแท็บอื่นแล้วพาไปที่นั่น
    setView("bills");
    requestAnimationFrame(() => formWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function closeForm() {
    setForm(null);
    setShowError(false);
  }

  async function run(action: () => Promise<ProjectCostReportDto>, success: string) {
    setBusy(true);
    try {
      setReport(await action());
      toast.success(success);
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!form || !report) return;
    if (!form.category) {
      toast.error("เลือกหมวดงานก่อน (หรือ ค่าดำเนินการ/ทั่วไป)");
      return;
    }
    if (!form.description.trim()) {
      toast.error("กรอกรายการก่อน");
      return;
    }
    const split = splitVat(form);
    if (split.amount <= 0) {
      toast.error(form.kind === "cost" ? "ยอดตามบิลต้องมากกว่า 0" : "ยอดที่ตกลงต้องมากกว่า 0");
      return;
    }
    const over = formOverrun(report, form);
    const reason = over > 0 ? form.overrunReason || null : null;
    if (over > 0 && (!reason || (reason === "OTHER" && !form.overrunNote.trim()))) {
      setShowError(true);
      overrunRef.current?.focus();
      overrunRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    const overrun = {
      overrunReason: reason,
      overrunNote: reason ? form.overrunNote.trim() || null : null,
      changeOrderId: reason === "CUSTOMER_CHANGE" ? form.changeOrderId || null : null,
    };
    const common = {
      categoryId: form.category === OVERHEAD ? null : form.category,
      costType: form.costType,
      description: form.description.trim(),
      vendor: form.vendor.trim() || null,
      reference: form.reference.trim() || null,
      amount: split.amount,
      vatAmount: split.vatAmount,
      note: form.note.trim() || null,
      ...overrun,
    };
    const editingId = form.editingId;

    setBusy(true);
    try {
      if (form.kind === "cost") {
        const input: ProjectCostInput = { ...common, spentOn: form.date, commitmentId: form.commitmentId || null };
        setReport(editingId ? await updateProjectCost(projectId, editingId, input) : await createProjectCost(projectId, input));
      } else {
        const input: ProjectCommitmentInput = { ...common, committedOn: form.date };
        setReport(
          editingId
            ? await updateProjectCommitment(projectId, editingId, input)
            : await createProjectCommitment(projectId, input),
        );
      }
      if (editingId || form.kind === "commitment") {
        closeForm();
      } else {
        // คนกรอกบิลมักกรอกทีละหลายใบจากร้านเดียวกัน วันเดียวกัน — คงวัน/หมวด/ประเภทไว้
        setForm(emptyForm("cost", form));
        setShowError(false);
      }
      toast.success(editingId ? "แก้ไขรายการแล้ว" : "บันทึกแล้ว");
    } catch (err) {
      // คนอื่นบันทึกรายการเพิ่มระหว่างนี้จนหมวดเกินงบ → โหลดตัวเลขใหม่ กล่องเลือกสาเหตุจะขึ้นเอง
      if (err instanceof ApiError && err.code === "OVERRUN_REASON_REQUIRED") {
        setShowError(true);
        getProjectCosts(projectId).then(setReport).catch(() => undefined);
      }
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function removeCost(cost: ProjectCostDto) {
    const ok = await confirm(`ลบรายการ "${cost.description}" ${money(Number(cost.amount))} บาท?`, {
      confirmLabel: "ลบรายการ",
      variant: "danger",
    });
    if (ok) await run(() => deleteProjectCost(projectId, cost.id), "ลบรายการแล้ว");
  }

  async function removeCommitment(c: ProjectCommitmentDto) {
    const ok = await confirm(`ลบยอดที่สั่ง "${c.description}" ${money(Number(c.amount))} บาท?`, {
      confirmLabel: "ลบยอดที่สั่ง",
      variant: "danger",
    });
    if (ok) await run(() => deleteProjectCommitment(projectId, c.id), "ลบยอดที่สั่งแล้ว");
  }

  async function toggleCommitment(c: ProjectCommitmentDto) {
    if (c.status === "OPEN") {
      const ok = await confirm(
        `ปิดยอด "${c.description}"?\nคงค้าง ${money(c.remaining)} บาท จะเลิกนับเข้างบ (ใช้เมื่อไม่มีบิลตามมาอีกแล้ว เช่น ร้านส่งของไม่ครบ ตกลงจบแค่นี้)`,
        { confirmLabel: "ปิดยอด" },
      );
      if (!ok) return;
      await run(() => setProjectCommitmentStatus(projectId, c.id, "CLOSED"), "ปิดยอดแล้ว");
    } else {
      await run(() => setProjectCommitmentStatus(projectId, c.id, "OPEN"), "เปิดยอดอีกครั้งแล้ว");
    }
  }

  async function waiveVo(target: { kind: "cost" | "commitment"; id: string }, label: string) {
    const ok = await confirm(
      `ไม่เก็บเงินลูกค้าสำหรับ "${label}"?\nบริษัทรับค่าใช้จ่ายส่วนนี้เอง (กำไรลดลงเท่ายอดนี้) — ป้ายรอออก VO จะหายไป`,
      { confirmLabel: "ไม่เก็บเงินลูกค้า" },
    );
    if (ok) await run(() => resolveCostVo(projectId, target, { waived: true }), "บันทึกแล้ว — บริษัทรับส่วนนี้เอง");
  }

  if (loading) return <TableSkeleton rows={6} cols={5} label="กำลังโหลดข้อมูลต้นทุน..." />;
  if (!report) return null;

  const source = report.budgetSource;
  let sourceText = "ยังไม่มี BOQ ให้ใช้เป็นงบ";
  if (source?.kind === "contract") sourceText = `งบจาก BOQ เวอร์ชัน ${source.versionNo} ตามสัญญา ${source.contractNo ?? ""}`;
  else if (source?.contractNo) sourceText = `หาเวอร์ชันตามสัญญา ${source.contractNo} ไม่เจอ — ใช้ BOQ เวอร์ชันล่าสุด (${source.versionNo}) แทน`;
  else if (source) sourceText = `ยังไม่มีสัญญาที่ลงนาม — งบชั่วคราวจาก BOQ เวอร์ชันล่าสุด (${source.versionNo})`;
  const costs = filter
    ? report.costs.filter((c) => (filter === OVERHEAD ? c.categoryId == null : c.categoryId === filter))
    : report.costs;
  const billPageCount = Math.max(1, Math.ceil(costs.length / BILLS_PAGE_SIZE));
  // ลบบิลใบสุดท้ายของหน้าท้ายแล้วหน้านั้นหายไป → ถอยไปหน้าที่ยังมีอยู่ ไม่ค้างที่หน้าว่าง
  const currentBillPage = Math.min(billPage, billPageCount);
  const billFrom = (currentBillPage - 1) * BILLS_PAGE_SIZE;
  const pagedCosts = costs.slice(billFrom, billFrom + BILLS_PAGE_SIZE);

  function goBillPage(next: number) {
    setBillPage(next);
    // กดเปลี่ยนหน้าจากท้ายตารางแล้วต้องได้เริ่มอ่านจากหัวตาราง
    billsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const canModify = (c: { recordedById: string | null }) => isOwner || c.recordedById === user?.id;
  const costForm = form && (
    <div ref={formWrapRef} className="scroll-mt-20">
      <CostEntryForm
        report={report}
        form={form}
        setForm={setForm}
        over={formOverrun(report, form)}
        busy={busy}
        showError={showError}
        overrunRef={overrunRef}
        onSubmit={() => void submit()}
        onClose={closeForm}
      />
    </div>
  );

  const priceDriftCard = (
    <PriceDriftCard
      report={report}
      busy={busy}
      onAck={(itemId) => void run(() => ackPriceDrift(projectId, itemId), "บันทึกว่าซื้อแล้ว/ล็อกราคาแล้ว")}
      onUnack={(itemId) => void run(() => unackPriceDrift(projectId, itemId), "ยกเลิกแล้ว")}
    />
  );

  // ยังไม่มีบิลและยอดที่สั่งเลย = หน้าเริ่มต้น (แบบ C) · กดบันทึกแล้วฟอร์มขึ้นแทนที่ตรงนั้น
  // ราคาคลังขึ้นหลังเซ็นสำคัญที่สุดตอนยังไม่ได้ซื้ออะไรเลย จึงขึ้นตรงนี้ด้วย
  if (report.costs.length === 0 && report.commitments.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-slate-800">ต้นทุนจริง</h2>
        {priceDriftCard}
        {costForm ?? <EmptyStart report={report} onStart={(kind) => openForm(emptyForm(kind))} />}
        {source && <p className="text-center text-xs text-slate-400">{sourceText}</p>}
      </div>
    );
  }

  const recordButtons = !form && (
    <span className="flex flex-wrap gap-2">
      <Button size="sm" variant="ghost" onClick={() => openForm(emptyForm("commitment"))}>
        <ClipboardList size={14} /> บันทึกยอดที่สั่ง
      </Button>
      {/* เทาเข้ม (neutral) แบบปุ่ม "+ เพิ่มรายการ" ของ BOQ — ผู้ใช้สั่ง: นาวีทึบชนกับการ์ดตัวเลขนาวี (ราคาสุทธิ/คงเหลือ) */}
      <Button size="sm" variant="neutral" onClick={() => openForm(emptyForm("cost"))}>
        <Plus size={14} /> บันทึกบิล
      </Button>
    </span>
  );

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-medium text-slate-800">ต้นทุนจริง</h2>

      {/* แบบ C (ผู้ใช้เลือก 17 ต.ค.): แท็บย่อย ภาพรวม · บิลและยอดสั่ง · เงินสด — หน้าแต่ละแท็บสั้น
          เรื่องที่ต้องจัดการขึ้นที่ภาพรวมเสมอ + จุดสีบนแท็บ ไม่ให้เรื่องเตือนถูกซ่อนในแท็บที่ไม่ได้เปิด */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CostViewTabs view={view} onChange={setView} report={report} />
        {recordButtons}
      </div>

      {view === "overview" && (
        <>
          <Summary report={report} sourceText={sourceText} />

          {report.cash.net < 0 && (
            <button
              type="button"
              onClick={() => setView("cash")}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md bg-red-50 px-3 py-2 text-left text-sm text-red-800 transition-colors hover:bg-red-100"
            >
              <span>
                ออกเงินแทนลูกค้าอยู่ <b className="font-semibold tabular-nums">{money(-report.cash.net)}</b> บาท
                {report.cash.nextInstallment ? ` — ควรเร่งเก็บงวดที่ ${report.cash.nextInstallment.seq}` : ""}
              </span>
              <span className="shrink-0 font-medium">ดูเงินสด →</span>
            </button>
          )}

          <VoPendingCard
            report={report}
            isOwner={isOwner}
            busy={busy}
            onLink={(target, changeOrderId) =>
              void run(() => resolveCostVo(projectId, target, { changeOrderId }), "ผูกกับใบงานเพิ่ม-ลดแล้ว")
            }
            onWaive={(target, label) => void waiveVo(target, label)}
            onGoToContract={onGoToContract}
          />

          {priceDriftCard}

          {report.unbudgetedActual > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              มีบิล {money(report.unbudgetedActual)} บาท ลงหมวดที่ไม่มีใน BOQ — ตรวจว่าเลือกหมวดถูก หรือเป็นงานนอกสัญญา
            </p>
          )}

          <section className="flex flex-col gap-2" aria-labelledby="cost-by-category">
            <h3 id="cost-by-category" className="text-sm font-medium text-slate-800">
              แยกตามหมวด{" "}
              <span className="font-normal text-slate-400">
                ·{" "}
                {report.vatClaimable
                  ? "นับต้นทุนก่อน VAT (บริษัทจด VAT ภาษีซื้อขอคืนได้)"
                  : "นับ VAT ในบิลเป็นต้นทุนด้วย (บริษัทยังไม่จด VAT)"}
              </span>
            </h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {report.rows.map((row) => (
                <BudgetRow key={`${row.kind}-${row.categoryId ?? ""}`} row={row} />
              ))}
            </ul>
            {report.totals.committed > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <span aria-hidden className="inline-block h-2 w-5 rounded-full bg-emerald-500 opacity-45" style={STRIPES} />
                ช่วงจางลายเฉียง = สั่งแล้วยังไม่จ่าย นับเข้างบแล้ว
              </p>
            )}
            {!report.overheadBudgetKnown && (
              <p className="text-xs text-slate-400">ยังไม่ได้แยกค่าดำเนินการออกจากกำไร จึงไม่มีงบค่าดำเนินการให้เทียบ</p>
            )}
          </section>
        </>
      )}

      {view === "bills" && (
        <>
          {/* ฟอร์มขึ้นบนสุดของแท็บ ตรงกับปุ่มที่กด ไม่ใช่ไปโผล่ท้ายหน้า */}
          {costForm}

          <CommitmentsSection
            report={report}
            busy={busy}
            canModify={canModify}
            onPay={(c) => openForm(formPayingCommitment(c))}
            onEdit={(c) => openForm(formFromCommitment(c))}
            onToggleStatus={(c) => void toggleCommitment(c)}
            onDelete={(c) => void removeCommitment(c)}
          />

      <section ref={billsRef} className="flex scroll-mt-20 flex-col gap-2" aria-label="รายการบิล">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-slate-800">
            บิลและค่าใช้จ่าย <span className="font-normal text-slate-500">{report.costs.length} รายการ</span>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={INPUT}
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setBillPage(1);
              }}
              aria-label="กรองตามหมวด"
            >
              <option value="">ทุกหมวด</option>
              {report.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} ` : ""}
                  {c.name}
                </option>
              ))}
              <option value={OVERHEAD}>ค่าดำเนินการ/ทั่วไป</option>
            </select>
          </div>
        </div>

        {costs.length > BILLS_PAGE_SIZE && (
          <p className="text-xs tabular-nums text-slate-500">
            แสดง {billFrom + 1}-{billFrom + pagedCosts.length} จาก {costs.length} รายการ
          </p>
        )}
        {report.costs.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="text-left text-xs font-medium text-slate-600 [&_th]:border-b [&_th]:border-slate-300 [&_th]:bg-slate-200">
                <tr>
                  <th className="px-3 py-2">วันที่</th>
                  <th className="px-3 py-2">รายการ</th>
                  <th className="px-3 py-2">หมวด</th>
                  <th className="px-3 py-2">ประเภท</th>
                  <th className="px-3 py-2 text-right">ก่อน VAT</th>
                  <th className="w-20 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {pagedCosts.map((c) => (
                  <tr key={c.id} className="group border-t border-slate-100 align-top hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{thaiDate(c.spentOn)}</td>
                    <td className="px-3 py-2">
                      <span className="text-slate-800">{c.description}</span>
                      {(c.vendor || c.reference) && (
                        <span className="block text-xs text-slate-500">
                          {[c.vendor, c.reference ? `บิล ${c.reference}` : null].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      <CostRowExtras cost={c} />
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {c.categoryId ? `${c.categoryCode ?? ""} ${c.categoryName ?? ""}`.trim() : "ค่าดำเนินการ/ทั่วไป"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{COST_TYPE_LABELS[c.costType]}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                      {money(Number(c.amount))}
                      {Number(c.vatAmount) > 0 && (
                        <span className="block text-xs text-slate-400">VAT {money(Number(c.vatAmount))}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canModify(c) && (
                        <span className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 touch:opacity-100">
                          {/* ป้ายขึ้นด้านบน — ตารางห่อด้วย overflow-x-auto ป้ายใต้แถวสุดท้ายจะถูกตัด */}
                          <Tooltip label="แก้ไข" side="top">
                            <button
                              type="button"
                              aria-label={`แก้ไข ${c.description}`}
                              disabled={busy}
                              onClick={() => openForm(formFromCost(c))}
                              className={iconButtonClasses()}
                            >
                              <Pencil size={14} />
                            </button>
                          </Tooltip>
                          <Tooltip label="ลบ" side="top" align="end">
                            <button
                              type="button"
                              aria-label={`ลบ ${c.description}`}
                              disabled={busy}
                              onClick={() => void removeCost(c)}
                              className={iconButtonClasses("danger")}
                            >
                              <Trash2 size={14} />
                            </button>
                          </Tooltip>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {report.costs.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีบิลที่จ่ายจริง — มีแต่ยอดที่สั่งไว้</p>}
        {report.costs.length > 0 && costs.length === 0 && <p className="text-sm text-slate-500">ไม่มีบิลในหมวดนี้</p>}
        <Pagination page={currentBillPage} pageCount={billPageCount} onChange={goBillPage} className="mt-2" />
      </section>
        </>
      )}

      {view === "cash" && <CashCard report={report} detailed onGoToContract={onGoToContract} />}
    </div>
  );
}

type CostView = "overview" | "bills" | "cash";
const COST_VIEWS: readonly CostView[] = ["overview", "bills", "cash"];

/** แท็บย่อยจำไว้ใน URL (?cost=) — รีเฟรช/ส่งลิงก์แล้วเปิดแท็บเดิม · ค่าแปลก ๆ = ภาพรวม */
function useCostView(): [CostView, (next: CostView) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("cost");
  const view = COST_VIEWS.includes(raw as CostView) ? (raw as CostView) : "overview";
  const setView = (next: CostView) =>
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (next === "overview") out.delete("cost");
        else out.set("cost", next);
        return out;
      },
      { replace: true },
    );
  return [view, setView];
}

/**
 * แท็บย่อยแบบปุ่มแบ่งช่อง (เล็กกว่าแท็บของหน้าโครงการ จะได้ไม่สับสนว่าเป็นชั้นเดียวกัน)
 * จุดสีบอกว่ามีเรื่องต้องดู: ภาพรวม = รอออก VO / ราคาขึ้นหลังเซ็น · เงินสด = ออกเงินแทนลูกค้า (แดง) / จะติดลบ (อำพัน)
 */
function CostViewTabs({
  view,
  onChange,
  report,
}: Readonly<{ view: CostView; onChange: (next: CostView) => void; report: ProjectCostReportDto }>) {
  const driftOpen = report.priceDrift?.lines.some((l) => !l.acked && l.delta > 0) ?? false;
  const overviewAlert = report.voPending.count > 0 || driftOpen;
  let cashDot: string | null = null;
  if (report.cash.net < 0) cashDot = "bg-red-500";
  else if (report.cash.projected < 0) cashDot = "bg-amber-500";
  const openCommitments = report.commitments.filter((c) => c.status === "OPEN").length;
  const tabs: { key: CostView; label: string; count?: number; dot?: string | null; dotLabel?: string }[] = [
    { key: "overview", label: "ภาพรวม", dot: overviewAlert ? "bg-amber-500" : null, dotLabel: "มีเรื่องต้องจัดการ" },
    { key: "bills", label: "บิลและยอดสั่ง", count: report.costs.length + openCommitments },
    {
      key: "cash",
      label: "เงินสด",
      dot: cashDot,
      dotLabel: report.cash.net < 0 ? "ออกเงินแทนลูกค้าอยู่" : "จะติดลบเมื่อจ่ายยอดที่สั่ง",
    },
  ];
  return (
    <div role="tablist" aria-label="มุมมองต้นทุน" className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
      {tabs.map((t) => {
        const on = view === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
              on ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
            }`}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${on ? "bg-slate-100 text-slate-600" : "bg-slate-200/70 text-slate-500"}`}>
                {t.count}
              </span>
            )}
            {t.dot && (
              <span className={`size-2 rounded-full ${t.dot}`}>
                <span className="sr-only">{t.dotLabel}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
