import type { CostOverrunReason, CostType, ProjectCostReportDto } from "@systemboq/shared-types";
import { COST_OVERRUN_REASON_LABELS, COST_OVERRUN_REASONS, COST_TYPE_LABELS, COST_TYPES } from "@systemboq/shared-types";
import { AlertTriangle, Check, X } from "lucide-react";
import { forwardRef, useId, type Ref } from "react";

import {
  categoryLabelOf,
  changeOrderLabel,
  INPUT,
  money,
  OVERHEAD,
  splitVat,
  todayBangkok,
  VAT_RATE,
  type FormState,
} from "../lib/cost-entry";
import { Button } from "./Button";
import { DateInput } from "./DateInput";

/**
 * ฟอร์มบันทึกบิลที่จ่ายจริง / ยอดที่สั่งแล้วยังไม่จ่าย (ยอดผูกพัน) — ช่องเหมือนกันเกือบทั้งหมด จึงใช้ฟอร์มเดียว
 *
 * ถ้ารายการนี้ดันหมวดเกินงบ (นับรวมยอดที่สั่งไว้) กล่องเลือกสาเหตุขึ้นเองระหว่างพิมพ์ — คิดด้วยฟังก์ชันเดียวกับ
 * เซิร์ฟเวอร์ (overrunAmount ใน shared-types) ตัวเลขบนจอจึงตรงกับที่เซิร์ฟเวอร์ตรวจ · เซิร์ฟเวอร์ตรวจซ้ำเสมอ
 */

const NOTE_PLACEHOLDER: Record<CostOverrunReason, string> = {
  CUSTOMER_CHANGE: "เช่น ลูกค้าขอเปลี่ยนกระเบื้องห้องนอนเป็น 60×60",
  PRICE_INCREASE: "เช่น เหล็ก DB12 ขึ้นจาก 24 เป็น 27 บาท/กก.",
  REWORK: "เช่น เทพื้นใหม่ เพราะระดับผิด",
  TAKEOFF_SHORT: "เช่น ถอดปริมาณเหล็กคานขาดไป",
  OTHER: "บอกว่าเกินเพราะอะไร",
};

/**
 * กล่องเลือกสาเหตุเกินงบ — ปุ่มเลือกแบบชิป (เห็นทุกตัวเลือกพร้อมกัน กดทีเดียว) + รายละเอียด
 * ลูกค้าขอเปลี่ยน: เลือกใบงานเพิ่ม-ลดที่ออกแล้ว หรือปล่อยไว้ = ขึ้นป้าย "รอออก VO"
 */
const OverrunBox = forwardRef<
  HTMLFieldSetElement,
  Readonly<{
    report: ProjectCostReportDto;
    form: FormState;
    setForm: (f: FormState) => void;
    over: number;
    showError: boolean;
  }>
>(function OverrunBox({ report, form, setForm, over, showError }, ref) {
  const noteId = useId();
  const noun = form.kind === "cost" ? "บิล" : "ยอดที่สั่ง";
  const reason = form.overrunReason;
  return (
    <fieldset
      ref={ref}
      tabIndex={-1}
      className={`flex flex-col gap-2.5 rounded-md border p-3 outline-none ${
        showError && !reason ? "border-red-300 bg-red-50/60" : "border-amber-200 bg-amber-50"
      }`}
    >
      <legend className="sr-only">สาเหตุที่เกินงบ</legend>
      <p className="flex items-start gap-2 text-sm text-amber-900">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
        <span>
          {noun}นี้ทำให้ <b className="font-semibold">{categoryLabelOf(report, form.category)}</b> เกินงบ{" "}
          <b className="font-semibold tabular-nums">{money(over)}</b> บาท<span className="text-amber-800/80"> (นับรวมยอดที่สั่งไว้แล้ว)</span> — เลือกสาเหตุก่อนบันทึก
        </span>
      </p>
      <div role="radiogroup" aria-label="สาเหตุที่เกินงบ" className="flex flex-wrap gap-1.5">
        {COST_OVERRUN_REASONS.map((r) => {
          const on = reason === r;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setForm({ ...form, overrunReason: r, changeOrderId: r === "CUSTOMER_CHANGE" ? form.changeOrderId : "" })}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${
                on
                  ? "border-amber-500 bg-white font-medium text-amber-900 shadow-sm"
                  : "border-amber-200 bg-white/60 text-amber-900/80 hover:border-amber-300 hover:bg-white"
              }`}
            >
              {on && <Check size={12} aria-hidden />}
              {COST_OVERRUN_REASON_LABELS[r]}
            </button>
          );
        })}
      </div>
      {showError && !reason && <p className="text-xs font-medium text-red-700">เลือกสาเหตุหนึ่งข้อ</p>}

      {reason === "CUSTOMER_CHANGE" && (
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          <span>ใบงานเพิ่ม-ลดที่เก็บเงินส่วนนี้</span>
          <select
            className={`${INPUT} max-w-xl`}
            value={form.changeOrderId}
            onChange={(e) => setForm({ ...form, changeOrderId: e.target.value })}
          >
            <option value="">ยังไม่ได้ออก — ติดป้าย "รอออก VO" ไว้เตือน</option>
            {report.changeOrders.map((co) => (
              <option key={co.id} value={co.id}>
                {changeOrderLabel(co)}
              </option>
            ))}
          </select>
          {!form.changeOrderId && (
            <span className="text-amber-800">งานที่ลูกค้าขอเพิ่มต้องออกใบงานเพิ่ม-ลดถึงจะเก็บเงินได้ ไม่งั้นบริษัทจ่ายส่วนนี้เอง</span>
          )}
        </label>
      )}

      {reason && (
        <label htmlFor={noteId} className="flex flex-col gap-1 text-xs text-slate-600">
          <span>
            รายละเอียด{reason === "OTHER" ? <span className="text-red-600"> *</span> : <span className="text-slate-400"> (ไม่บังคับ)</span>}
          </span>
          <input
            id={noteId}
            className={`${INPUT} max-w-xl`}
            maxLength={500}
            placeholder={NOTE_PLACEHOLDER[reason]}
            value={form.overrunNote}
            onChange={(e) => setForm({ ...form, overrunNote: e.target.value })}
          />
          {showError && reason === "OTHER" && !form.overrunNote.trim() && (
            <span className="font-medium text-red-700">สาเหตุ "อื่น ๆ" ต้องพิมพ์รายละเอียด</span>
          )}
        </label>
      )}
    </fieldset>
  );
});

function formHeading(isCost: boolean, editing: boolean) {
  if (isCost) return editing ? "แก้บิล" : "บันทึกบิลที่จ่ายแล้ว";
  return editing ? "แก้ยอดที่สั่ง" : "บันทึกยอดที่สั่ง (ยังไม่จ่าย)";
}

export function CostEntryForm({
  report,
  form,
  setForm,
  over,
  busy,
  showError,
  overrunRef,
  onSubmit,
  onClose,
}: Readonly<{
  report: ProjectCostReportDto;
  form: FormState;
  setForm: (f: FormState) => void;
  over: number;
  busy: boolean;
  showError: boolean;
  overrunRef: Ref<HTMLFieldSetElement>;
  onSubmit: () => void;
  onClose: () => void;
}>) {
  const split = splitVat(form);
  const editing = form.editingId != null;
  const isCost = form.kind === "cost";
  const linked = isCost && form.commitmentId ? report.commitments.find((c) => c.id === form.commitmentId) : undefined;
  // บิลที่ผูกยอดที่ปิดไปแล้วยังต้องเห็นตัวเลือกเดิม (แก้บิลเก่าได้โดยไม่หลุดผูก)
  const choosable = report.commitments.filter((c) => c.status === "OPEN" || c.id === form.commitmentId);

  return (
    <form
      className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div>
        <p className="text-sm font-medium text-slate-800">
          {formHeading(isCost, Boolean(editing))}
        </p>
        {!isCost && !editing && (
          <p className="text-xs text-slate-500">
            ใบสั่งซื้อ ใบเสนอราคาร้านที่ตกลงแล้ว หรือค่าเหมาช่าง — นับเข้างบตั้งแต่ตอนสั่ง พอจ่ายจริงกด "จ่ายบิล" ที่ยอดนี้
          </p>
        )}
      </div>

      {isCost && choosable.length > 0 && (
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          <span>จ่ายตามยอดที่สั่งไว้</span>
          <select
            className={`${INPUT} max-w-xl`}
            value={form.commitmentId}
            onChange={(e) => {
              const k = report.commitments.find((c) => c.id === e.target.value);
              if (!k) {
                setForm({ ...form, commitmentId: "" });
                return;
              }
              setForm({
                ...form,
                commitmentId: k.id,
                category: k.categoryId ?? OVERHEAD,
                costType: k.costType,
                vendor: form.vendor || (k.vendor ?? ""),
                description: form.description || k.description,
              });
            }}
          >
            <option value="">ไม่ได้สั่งไว้ก่อน (บิลใหม่)</option>
            {choosable.map((c) => (
              <option key={c.id} value={c.id}>
                {[c.description, c.vendor, c.reference].filter(Boolean).join(" · ")} — คงค้าง {money(c.remaining)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          <span>{isCost ? "วันที่ในบิล" : "วันที่สั่ง/ตกลง"}</span>
          <DateInput max={todayBangkok()} className={INPUT} value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          <span>หมวดงาน</span>
          <select
            className={`${INPUT} max-w-56`}
            value={form.category}
            // บิลตามยอดที่สั่งต้องอยู่หมวดเดียวกับยอดนั้น (เซิร์ฟเวอร์ตรวจด้วย)
            disabled={linked != null}
            title={linked ? "หมวดตามยอดที่สั่งไว้" : undefined}
            onChange={(e) =>
              setForm({
                ...form,
                category: e.target.value,
                // ค่าดำเนินการไม่ลงหมวด — เลือกแล้วเปลี่ยนประเภทให้ด้วย (ยังแก้ได้)
                costType: e.target.value === OVERHEAD ? "OVERHEAD" : form.costType,
              })
            }
          >
            <option value="" disabled>
              เลือกหมวด
            </option>
            {report.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} ` : ""}
                {c.name}
              </option>
            ))}
            <option value={OVERHEAD}>ค่าดำเนินการ/ทั่วไป (ไม่ลงหมวดงาน)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          <span>ประเภท</span>
          <select className={INPUT} value={form.costType} onChange={(e) => setForm({ ...form, costType: e.target.value as CostType })}>
            {COST_TYPES.map((t) => (
              <option key={t} value={t}>
                {COST_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-500">
          <span>รายการ</span>
          <input
            className={INPUT}
            maxLength={300}
            placeholder={isCost ? "เช่น ปูนซีเมนต์ 40 ถุง, ค่าแรงช่างปูนสัปดาห์ที่ 3" : "เช่น เหล็กเส้นทั้งหลัง, เหมาช่างฉาบผนัง"}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          <span>ร้านค้า / {isCost ? "ผู้รับเงิน" : "ช่าง"}</span>
          <input className={`${INPUT} w-48`} maxLength={200} value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          <span>{isCost ? "เลขที่บิล" : "เลขที่ใบสั่งซื้อ/ใบเสนอราคา"}</span>
          <input
            className={`${INPUT} w-40`}
            maxLength={100}
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          <span>{isCost ? "ยอดตามบิล (บาท)" : "ยอดที่ตกลง (บาท)"}</span>
          <input
            type="number"
            step="0.01"
            min="0"
            className={`${INPUT} w-36 text-right tabular-nums`}
            value={form.total}
            onChange={(e) => setForm({ ...form, total: e.target.value })}
          />
        </label>
        <label className="mb-1.5 flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="checkbox"
            className="size-4 accent-brand"
            checked={form.hasVat}
            onChange={(e) => setForm({ ...form, hasVat: e.target.checked })}
          />
          ยอดนี้รวม VAT {VAT_RATE}% แล้ว
        </label>
      </div>
      {form.hasVat && split.amount > 0 && (
        <p className="text-xs text-slate-500">
          ก่อน VAT <span className="tabular-nums text-slate-700">{money(split.amount)}</span> · ภาษีซื้อ{" "}
          <span className="tabular-nums text-slate-700">{money(split.vatAmount)}</span>
          {report.vatClaimable ? " (บริษัทจด VAT — ภาษีซื้อขอคืนได้ ไม่นับเป็นต้นทุน)" : " (นับรวมเป็นต้นทุน)"}
        </p>
      )}
      {linked && split.amount > 0 && (
        <p className="text-xs text-slate-500">
          ยอดที่สั่งนี้คงค้าง <span className="tabular-nums text-slate-700">{money(linked.remaining)}</span> บาท — ส่วนที่จ่ายเกินยอดที่สั่งนับเป็นค่าใช้จ่ายเพิ่ม
        </p>
      )}

      {over > 0 && <OverrunBox ref={overrunRef} report={report} form={form} setForm={setForm} over={over} showError={showError} />}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="brand" disabled={busy}>
          <Check size={14} /> {editing ? "บันทึกการแก้ไข" : "บันทึก"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
          <X size={14} /> {editing ? "ยกเลิก" : "ปิด"}
        </Button>
        {!editing && isCost && <span className="text-xs text-slate-400">บันทึกแล้วฟอร์มยังเปิดอยู่ กรอกบิลถัดไปได้เลย</span>}
      </div>
    </form>
  );
}
