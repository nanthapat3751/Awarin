import type { ContractPaymentsViewDto, PaymentMethod, RetentionReleaseDto } from "@systemboq/shared-types";
import { PAYMENT_METHOD_LABELS } from "@systemboq/shared-types";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  deleteRetentionRelease,
  recordRetentionRelease,
  setRetention,
  updateRetentionRelease,
  type PaymentInput,
} from "../lib/contracts-api";
import { useToast } from "../lib/toast-context";
import { ReleaseReceipt, RetentionInvoice, VoidedReleaseReceipts } from "./BillingDocControls";
import { Button, iconButtonClasses } from "./Button";
import { DateInput } from "./DateInput";
import { Tooltip } from "./Tooltip";

const INPUT =
  "rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function thaiDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface FormState {
  paidOn: string;
  amount: string;
  withholdingAmount: string;
  method: PaymentMethod;
  reference: string;
  note: string;
}

/** ตั้ง % เงินประกันหลังลงนาม (OWNER) — ใช้เมื่อสัญญากระดาษมีข้อนี้แต่ในระบบยังไม่ได้ตั้ง */
function PctEditor({
  current,
  onSave,
  onClose,
}: Readonly<{ current: number | null; onSave: (pct: number | null) => Promise<void>; onClose: () => void }>) {
  const [value, setValue] = useState(current == null ? "" : String(current));
  const [busy, setBusy] = useState(false);
  const pct = value.trim() === "" ? null : Number(value);
  const invalid = pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 20);

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-2">
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        <span>% ของยอดงวด (รวม VAT)</span>
        <input
          type="number"
          step="0.5"
          min="0"
          max="20"
          placeholder="ไม่มี"
          className={`${INPUT} w-28 text-right tabular-nums`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <Button
        size="sm"
        disabled={busy || invalid}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave(pct);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Check size={14} /> บันทึก
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
        <X size={14} /> ยกเลิก
      </Button>
      <p className="w-full text-xs text-slate-500">
        ตั้งเมื่อสัญญาที่ลงนามมีข้อเงินประกันผลงานจริง — ใช้เป็นค่าตั้งต้นตอนรับเงินงวดถัดไป
        ยอดที่บันทึกไปแล้วไม่ถูกแก้ และสัญญา PDF ยังพิมพ์เหมือนวันเซ็น
      </p>
    </div>
  );
}

/**
 * เงินประกันผลงานของสัญญาที่ลงนามแล้ว — ยอดที่ลูกค้ากันไว้ · วันครบกำหนดคืน · วางบิล · รับคืน + ใบเสร็จ
 *
 * สัญญาที่ไม่มีเงินประกันและยังไม่เคยกัน: ADMIN ไม่เห็นอะไรเลย (ไม่ต้องมีกล่องว่าง) · OWNER เห็นลิงก์ตั้ง %
 */
export function RetentionPanel({
  projectId,
  contractId,
  view,
  onChange,
}: Readonly<{
  projectId: string;
  contractId: string;
  view: ContractPaymentsViewDto;
  onChange: (view: ContractPaymentsViewDto) => void;
}>) {
  const toast = useToast();
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  const r = view.retention;
  const b = r.balance;
  const [editingPct, setEditingPct] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [editing, setEditing] = useState<RetentionReleaseDto | null>(null);
  const ctx = { projectId, contractId, onChange };

  async function savePct(pct: number | null) {
    try {
      const res = await setRetention(projectId, contractId, { pct });
      if (res.payments) onChange(res.payments);
      setEditingPct(false);
      toast.success(pct == null ? "ยกเลิกเงินประกันผลงานของสัญญานี้แล้ว" : `ตั้งเงินประกันผลงาน ${pct}% แล้ว`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function changeDue(dueOn: string) {
    setBusy(true);
    try {
      const res = await setRetention(projectId, contractId, { dueOn: dueOn || null });
      if (res.payments) onChange(res.payments);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกวันครบกำหนดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function openAdd() {
    setEditing(null);
    setForm({
      paidOn: view.today,
      amount: String(b.outstanding),
      withholdingAmount: r.expectedWithholding != null && r.releases.length === 0 ? String(r.expectedWithholding) : "0",
      method: "TRANSFER",
      reference: "",
      note: "",
    });
  }

  function openEdit(release: RetentionReleaseDto) {
    setEditing(release);
    setForm({
      paidOn: release.paidOn,
      amount: String(Number(release.amount)),
      withholdingAmount: String(Number(release.withholdingAmount)),
      method: release.method,
      reference: release.reference ?? "",
      note: release.note ?? "",
    });
  }

  async function submit() {
    if (!form) return;
    const input: PaymentInput = {
      paidOn: form.paidOn,
      amount: Number(form.amount),
      withholdingAmount: Number(form.withholdingAmount || 0),
      method: form.method,
      reference: form.reference.trim() || null,
      note: form.note.trim() || null,
    };
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      toast.error("ยอดที่รับคืนต้องมากกว่า 0");
      return;
    }
    setBusy(true);
    try {
      onChange(
        editing
          ? await updateRetentionRelease(projectId, contractId, editing.id, input)
          : await recordRetentionRelease(projectId, contractId, input),
      );
      setForm(null);
      setEditing(null);
      toast.success(editing ? "แก้ไขรายการรับคืนแล้ว" : "บันทึกการรับคืนเงินประกันแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(release: RetentionReleaseDto) {
    if (!window.confirm(`ลบรายการรับคืน ${money(Number(release.amount))} บาท ของวันที่ ${thaiDate(release.paidOn)}?`)) return;
    setBusy(true);
    try {
      onChange(await deleteRetentionRelease(projectId, contractId, release.id));
      toast.success("ลบรายการรับคืนแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const hasRetention = r.pct != null || b.held > 0;

  if (!hasRetention) {
    if (!isOwner) return null;
    return (
      <div className="flex flex-col gap-2 border-t border-slate-200 pt-3">
        {editingPct ? (
          <PctEditor current={null} onSave={savePct} onClose={() => setEditingPct(false)} />
        ) : (
          // ปุ่มพื้นมนแบบเดียวกับ "เปิดสัญญา (PDF)" — ผู้ใช้สั่งเอาเส้นใต้ออก 18 ต.ค.
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
            <span>สัญญานี้ไม่มีเงินประกันผลงาน</span>
            <button
              type="button"
              className="link-pill inline-flex items-center gap-1 font-medium text-brand"
              onClick={() => setEditingPct(true)}
            >
              <Plus size={13} /> ตั้งเงินประกันผลงาน
            </button>
            <span>(ถ้าสัญญาที่ลงนามมีข้อนี้)</span>
          </div>
        )}
      </div>
    );
  }

  const canModify = (release: RetentionReleaseDto) =>
    (isOwner || release.recordedById === user?.id) &&
    !r.documents.some((d) => d.retentionReleaseId === release.id && d.type === "RECEIPT" && !d.voidedAt);

  return (
    <section className="flex flex-col gap-3 border-t border-slate-200 pt-3" aria-label="เงินประกันผลงาน">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">
          เงินประกันผลงาน
          {r.pct != null && <span className="font-normal text-slate-500"> · {r.pct}% ของทุกงวด</span>}
        </p>
        {isOwner && !editingPct && (
          <button type="button" className="text-xs text-slate-500 hover:text-brand" onClick={() => setEditingPct(true)}>
            แก้ %
          </button>
        )}
      </div>

      {editingPct && <PctEditor current={r.pct} onSave={savePct} onClose={() => setEditingPct(false)} />}
      {r.setAfterSigning && (
        <p className="text-xs text-slate-500">ตั้งหลังวันลงนาม — สัญญา PDF ไม่พิมพ์ข้อนี้ (ยึดตามฉบับที่เซ็น)</p>
      )}

      {/* สามตัวเลขที่ต้องตอบได้ทันที: ลูกค้าถือเงินเราอยู่เท่าไร คืนแล้วเท่าไร และยังต้องตามอีกเท่าไร */}
      <dl className="grid grid-cols-3 gap-2 text-sm sm:max-w-xl">
        <div>
          <dt className="text-xs text-slate-500">ลูกค้ากันไว้แล้ว</dt>
          <dd className="tabular-nums text-slate-800">{money(b.held)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">คืนแล้ว</dt>
          <dd className="tabular-nums text-slate-800">{money(b.released)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">รอคืน</dt>
          <dd className={`tabular-nums font-semibold ${b.outstanding > 0 ? "text-slate-900" : "text-emerald-700"}`}>
            {money(b.outstanding)}
          </dd>
        </div>
      </dl>
      {r.pct != null && r.plannedTotal > b.held && (
        <p className="text-xs text-slate-400">ถ้ารับเงินครบทุกงวด จะถูกกันรวม {money(r.plannedTotal)} บาท</p>
      )}
      {b.overReleased > 0 && (
        <p className="text-xs text-amber-700">ได้คืนเกินยอดที่ถูกกันไว้ {money(b.overReleased)} บาท — ตรวจรายการรับคืน</p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          <span>ครบกำหนดคืน (พ้นระยะรับประกัน)</span>
          <DateInput
            className={`${INPUT} w-40`}
            value={r.dueOn ?? ""}
            disabled={busy}
            onChange={(v) => void changeDue(v)}
          />
        </label>
        {b.daysOverdue != null && (
          <span className="mb-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            เลยกำหนดคืน {b.daysOverdue} วัน
          </span>
        )}
      </div>

      <RetentionInvoice retention={r} today={view.today} ctx={ctx} />

      {r.releases.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {r.releases.map((rel) => (
            <li key={rel.id} className="group flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span>รับคืน</span>
              <span className="tabular-nums">{thaiDate(rel.paidOn)}</span>
              <span className="tabular-nums text-slate-700">{money(Number(rel.amount))}</span>
              <span>{PAYMENT_METHOD_LABELS[rel.method]}</span>
              {Number(rel.withholdingAmount) > 0 && (
                <span className="text-slate-400">
                  (หัก ณ ที่จ่าย {money(Number(rel.withholdingAmount))} · เข้าบัญชี{" "}
                  {money(Number(rel.amount) - Number(rel.withholdingAmount))})
                </span>
              )}
              {rel.reference && <span className="text-slate-400">อ้างอิง {rel.reference}</span>}
              <ReleaseReceipt release={rel} docs={r.documents} ctx={ctx} />
              {canModify(rel) && (
                <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 touch:opacity-100">
                  <button
                    type="button"
                    aria-label="แก้ไขรายการรับคืน"
                    disabled={busy}
                    onClick={() => openEdit(rel)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Pencil size={12} />
                  </button>
                  <Tooltip label="ลบรายการรับคืน" side="top" align="end">
                    <button
                      type="button"
                      aria-label="ลบรายการรับคืน"
                      disabled={busy}
                      onClick={() => void remove(rel)}
                      className={iconButtonClasses("danger")}
                    >
                      <Trash2 size={12} />
                    </button>
                  </Tooltip>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <VoidedReleaseReceipts docs={r.documents} ctx={ctx} />

      {form ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-2">
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            <span>วันที่ได้รับคืน</span>
            <DateInput
              max={view.today}
              className={INPUT}
              value={form.paidOn}
              onChange={(v) => setForm({ ...form, paidOn: v })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            <span>ยอดที่คืน</span>
            <input
              type="number"
              step="0.01"
              min="0"
              className={`${INPUT} w-32 text-right tabular-nums`}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            <span>หัก ณ ที่จ่าย</span>
            <input
              type="number"
              step="0.01"
              min="0"
              className={`${INPUT} w-28 text-right tabular-nums`}
              value={form.withholdingAmount}
              onChange={(e) => setForm({ ...form, withholdingAmount: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            <span>ช่องทาง</span>
            <select
              className={INPUT}
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}
            >
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            <span>เลขอ้างอิง</span>
            <input
              className={`${INPUT} w-36`}
              placeholder="เลขที่เช็ค/อ้างอิงโอน"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-slate-500">
            <span>หมายเหตุ</span>
            <input className={INPUT} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          {Number(form.withholdingAmount) > 0 && (
            <p className="w-full text-xs text-slate-500">
              เข้าบัญชีจริง{" "}
              <span className="tabular-nums text-slate-700">
                {money(Number(form.amount || 0) - Number(form.withholdingAmount || 0))}
              </span>{" "}
              บาท
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => void submit()}>
              <Check size={14} /> {editing ? "บันทึกการแก้ไข" : "บันทึก"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setForm(null);
                setEditing(null);
              }}
            >
              <X size={14} /> ยกเลิก
            </Button>
          </div>
        </div>
      ) : (
        b.held > 0 && (
          <Button variant="ghost" size="sm" className="self-start" disabled={busy} onClick={openAdd}>
            <Plus size={13} /> บันทึกรับคืนเงินประกัน
          </Button>
        )
      )}
    </section>
  );
}
