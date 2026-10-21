import type {
  ChangeOrderDto,
  ChangeOrderLineDto,
  ChangeOrderPreviewDto,
  ChangeOrderStatus,
  ChangeOrderTotalsDto,
  ContractChangeOrdersDto,
  ContractDto,
} from "@systemboq/shared-types";
import { AlertTriangle, ChevronDown, FileText, Plus, RefreshCw, Send, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../lib/api";
import {
  changeOrderAction,
  createChangeOrder,
  listChangeOrders,
  previewChangeOrder,
  recordChangeOrderDecision,
  updateChangeOrder,
} from "../lib/change-orders-api";
import { useConfirm } from "../lib/confirm-context";
import { changeOrderViewerPath } from "../lib/document-pdf";
import { useToast } from "../lib/toast-context";
import { Button, buttonClasses } from "./Button";

const money = (v: string | number) => Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (v: string | null) => (v == null ? "—" : Number(v).toLocaleString("th-TH", { maximumFractionDigits: 3 }));
const thaiDate = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

/** +1,234.00 สีนาวี · −1,234.00 สีแดง — ทิศของเงินต้องอ่านออกตั้งแต่แวบแรก */
function rejectedNote(respondedAt: string, note: string | null) {
  const quoted = note ? ` — “${note}”` : "";
  return `ไม่อนุมัติเมื่อ ${thaiDate(respondedAt)}${quoted}`;
}

function Delta({ value, className = "" }: Readonly<{ value: string | number; className?: string }>) {
  const n = Number(value);
  let sign = "";
  let color = "text-slate-500";
  if (n > 0) {
    sign = "+";
    color = "text-brand";
  } else if (n < 0) {
    sign = "−";
    color = "text-red-700";
  }
  return <span className={`tabular-nums ${color} ${className}`}>{`${sign}${money(Math.abs(n))}`}</span>;
}

const STATUS: Record<ChangeOrderStatus, { label: string; cls: string }> = {
  DRAFT: { label: "ร่าง", cls: "bg-slate-100 text-slate-700" },
  SENT: { label: "รอลูกค้าตอบ", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "อนุมัติแล้ว", cls: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "ไม่อนุมัติ", cls: "bg-rose-100 text-rose-700" },
  CANCELLED: { label: "ยกเลิก", cls: "bg-slate-100 text-slate-500" },
};

const KIND: Record<ChangeOrderLineDto["kind"], { label: string; cls: string }> = {
  added: { label: "เพิ่ม", cls: "bg-brand/10 text-brand" },
  removed: { label: "ตัดออก", cls: "bg-red-50 text-red-700" },
  changed: { label: "แก้", cls: "bg-slate-100 text-slate-600" },
};

/** ตารางรายการที่เปลี่ยน: เดิม → ใหม่ → เพิ่ม/ลด (ราคาขาย) + ยอดท้ายตาราง */
function LinesTable({ lines, totals }: Readonly<{ lines: ChangeOrderLineDto[]; totals: ChangeOrderTotalsDto }>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2">
          <tr>
            <th>รายการ</th>
            <th className="text-right">ตามสัญญาเดิม</th>
            <th className="text-right">ใหม่</th>
            <th className="text-right">เพิ่ม / ลด</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={`${l.name}-${i}`} className="border-t border-slate-100 align-top">
              <td className="px-3 py-2">
                <span className={`mr-2 inline-block rounded px-1.5 text-[11px] font-medium ${KIND[l.kind].cls}`}>{KIND[l.kind].label}</span>
                {l.categoryCode && <span className="mr-1 font-mono text-xs text-slate-400">{l.categoryCode}</span>}
                <span className="text-slate-800">{l.name}</span>
              </td>
              <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap tabular-nums">
                {l.beforeQty == null ? "—" : (
                  <>
                    {qty(l.beforeQty)} {l.unit} × {money(l.beforeUnitPrice!)}
                    <span className="block text-slate-700">{money(l.beforeTotal)}</span>
                  </>
                )}
              </td>
              <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap tabular-nums">
                {l.afterQty == null ? "—" : (
                  <>
                    {qty(l.afterQty)} {l.unit} × {money(l.afterUnitPrice!)}
                    <span className="block text-slate-700">{money(l.afterTotal)}</span>
                  </>
                )}
              </td>
              <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                <Delta value={l.delta} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-2 ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 px-3 text-sm">
        <dt className="text-slate-500">รวมงานเพิ่ม</dt>
        <dd className="text-right tabular-nums text-slate-700">{money(totals.addAmount)}</dd>
        <dt className="text-slate-500">รวมงานลด</dt>
        <dd className="text-right tabular-nums text-slate-700">{Number(totals.deductAmount) > 0 ? `−${money(totals.deductAmount)}` : money(0)}</dd>
        {Number(totals.adjustAmount) !== 0 && (
          <>
            <dt className="text-slate-500" title="ส่วนลดเป็น % / การปัดยอด ทำให้ผลรวมรายการไม่เท่ายอดจริง">ปรับส่วนลด / ปัดเศษ</dt>
            <dd className="text-right"><Delta value={totals.adjustAmount} /></dd>
          </>
        )}
        {Number(totals.vatAmount) !== 0 && (
          <>
            <dt className="text-slate-500">VAT</dt>
            <dd className="text-right"><Delta value={totals.vatAmount} /></dd>
          </>
        )}
        <dt className="border-t border-slate-200 pt-1 font-medium text-slate-800">เปลี่ยนแปลงสุทธิ</dt>
        <dd className="border-t border-slate-200 pt-1 text-right font-semibold"><Delta value={totals.totalAmount} /></dd>
      </dl>
    </div>
  );
}

interface FormState {
  title: string;
  note: string;
  days: string;
}

function HeaderFields({ form, onChange }: Readonly<{ form: FormState; onChange: (f: FormState) => void }>) {
  const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
      <label className="flex flex-col gap-1 text-xs text-slate-700">
        <span>เรื่อง (พิมพ์ลงใบ)</span>
        <input
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
          placeholder="เช่น ลูกค้าขอเปลี่ยนกระเบื้องห้องนอนเป็น 60×60"
          maxLength={200}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-700">
        <span>ขยายเวลาก่อสร้าง</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            step="1"
            value={form.days}
            placeholder="0"
            onChange={(e) => onChange({ ...form, days: e.target.value })}
            className={`${input} w-20 text-right`}
          />
          <span className="text-slate-500">วัน</span>
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-700 sm:col-span-2">
        <span>รายละเอียดเพิ่มเติม (ไม่บังคับ)</span>
        <textarea value={form.note} onChange={(e) => onChange({ ...form, note: e.target.value })} rows={2} maxLength={2000} className={input} />
      </label>
    </div>
  );
}

const inputOf = (f: FormState) => ({
  title: f.title.trim(),
  note: f.note.trim() || null,
  extensionDays: f.days.trim() === "" || Number(f.days) === 0 ? null : Number(f.days),
});

/** บอกผลกับงวดเงินก่อนยืนยันอนุมัติ — คนกดต้องรู้ว่าเงินจะไปอยู่ไหน */
function approvalEffect(co: ChangeOrderDto): string {
  const total = Number(co.totalAmount);
  const after = co.amountAfter ? ` มูลค่าสัญญาจะเป็น ${money(co.amountAfter)} บาท` : "";
  if (total > 0) return `เพิ่มงวดใหม่ต่อท้าย ${money(total)} บาท ·${after}`;
  if (total < 0) return `หัก ${money(-total)} บาท จากงวดท้ายที่ยังไม่ได้รับเงิน ·${after}`;
  return "มูลค่าสัญญาไม่เปลี่ยน งวดเงินคงเดิม";
}

/**
 * ใบงานเพิ่ม-ลดของสัญญาที่ลงนามแล้ว — โชว์ใต้ตารางสัญญาในแท็บสัญญา
 *
 * เจตนาหน้าตา: คนที่ไม่เคยใช้ต้องรู้ทันทีว่า "แก้ BOQ ก่อน แล้วค่อยออกใบ" (ขั้นตอนสามข้อตอนยังไม่มีใบ)
 * ทุกใบบอกสถานะเป็นป้ายสี + ปุ่มของขั้นถัดไปเท่านั้น · ก่อนยืนยันอะไรที่ขยับเงิน บอกผลกับงวดเงินเสมอ
 */
export function ChangeOrdersPanel({
  projectId,
  contract,
  onChanged,
  onGoToBoq,
}: Readonly<{
  projectId: string;
  contract: ContractDto;
  /** หลังอนุมัติ — งวดเงิน/ยอดในหน้าเปลี่ยน ให้หน้าโหลดข้อมูลสัญญาใหม่ */
  onChanged: () => void;
  onGoToBoq: () => void;
}>) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<ContractChangeOrdersDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<ChangeOrderPreviewDto | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ title: "", note: "", days: "" });
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>({ title: "", note: "", days: "" });
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await listChangeOrders(projectId, contract.id));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "โหลดใบงานเพิ่ม-ลดไม่สำเร็จ");
    }
  }, [projectId, contract.id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(task: () => Promise<ContractChangeOrdersDto>, done: string, moneyMoved = false) {
    setBusy(true);
    try {
      setData(await task());
      toast.success(done);
      if (moneyMoved) onChanged();
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ทำรายการไม่สำเร็จ");
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function startCreate() {
    setCreating(true);
    setPreview(null);
    setPreviewError(null);
    setForm({ title: "", note: "", days: "" });
    try {
      setPreview(await previewChangeOrder(projectId, contract.id));
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : "เทียบ BOQ ไม่สำเร็จ");
    }
  }

  async function submitCreate() {
    if (!form.title.trim()) return;
    const ok = await run(() => createChangeOrder(projectId, contract.id, inputOf(form)), "ออกใบงานเพิ่ม-ลด (ร่าง) แล้ว");
    if (ok) setCreating(false);
  }

  async function send(co: ChangeOrderDto) {
    if (
      !(await confirm(`ส่ง ${co.docNo} ให้ลูกค้า? ลูกค้าจะเห็นในพอร์ทัลพร้อมแจ้งเตือน และกดอนุมัติ/ไม่อนุมัติเองได้`, {
        confirmLabel: "ส่งให้ลูกค้า",
        variant: "brand",
      }))
    ) {
      return;
    }
    await run(() => changeOrderAction(projectId, contract.id, co.id, "send"), `ส่ง ${co.docNo} แล้ว`);
  }

  async function approvePaper(co: ChangeOrderDto) {
    if (
      !(await confirm(`บันทึกว่าลูกค้าเซ็นอนุมัติ ${co.docNo} แล้ว? ${approvalEffect(co)}`, {
        confirmLabel: "บันทึกการอนุมัติ",
        variant: "brand",
      }))
    ) {
      return;
    }
    await run(
      () => recordChangeOrderDecision(projectId, contract.id, co.id, { decision: "APPROVE", note: "ลูกค้าเซ็นอนุมัติในใบ" }),
      `บันทึกการอนุมัติ ${co.docNo} แล้ว — งวดเงินปรับให้แล้ว`,
      true,
    );
  }

  async function rejectPaper(co: ChangeOrderDto) {
    if (!rejectNote.trim()) return;
    const ok = await run(
      () => recordChangeOrderDecision(projectId, contract.id, co.id, { decision: "REJECT", note: rejectNote.trim() }),
      `บันทึกว่าลูกค้าไม่อนุมัติ ${co.docNo} แล้ว`,
    );
    if (ok) setRejectingId(null);
  }

  async function cancel(co: ChangeOrderDto) {
    const sent = co.status === "SENT";
    if (
      !(await confirm(
        `ยกเลิก ${co.docNo}?${sent ? " ลูกค้าจะได้แจ้งเตือนว่าใบนี้ถูกยกเลิก" : ""} เลขที่ใบนี้จะไม่ถูกใช้ซ้ำ`,
        { confirmLabel: "ยกเลิกใบนี้", variant: "danger" },
      ))
    ) {
      return;
    }
    await run(() => changeOrderAction(projectId, contract.id, co.id, "cancel"), `ยกเลิก ${co.docNo} แล้ว`);
  }

  async function saveEdit(co: ChangeOrderDto) {
    if (!editForm.title.trim()) return;
    const ok = await run(() => updateChangeOrder(projectId, contract.id, co.id, inputOf(editForm)), "บันทึกแล้ว");
    if (ok) setEditingId(null);
  }

  if (!data) return null;
  const list = [...data.changeOrders].reverse();
  const changed = data.contractAmount != null && data.currentAmount !== data.contractAmount;

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white" aria-labelledby={`co-${contract.id}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h3 id={`co-${contract.id}`} className="text-base font-semibold text-slate-800">
            งานเพิ่ม-ลด
          </h3>
          <p className="text-xs text-slate-500">สัญญาเลขที่ {contract.contractNo}</p>
        </div>
        {data.contractAmount != null && (
          <p className="text-sm text-slate-600 tabular-nums">
            มูลค่าตามสัญญา {money(data.contractAmount)}
            {changed && (
              <>
                {" "}→ ปัจจุบัน <span className="font-semibold text-slate-900">{money(data.currentAmount!)}</span>
              </>
            )}
          </p>
        )}
        <div className="ml-auto">
          <Button size="sm" onClick={startCreate} disabled={Boolean(data.blocker) || creating || busy} title={data.blocker ?? undefined}>
            <Plus size={14} /> ออกใบงานเพิ่ม-ลด
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3">
        {data.blocker && !creating && <p className="text-xs text-slate-500">{data.blocker}</p>}

        {list.length === 0 && !creating && !data.blocker && (
          // ยังไม่มีใบ: บอกขั้นตอนจริง (เรียงลำดับจริง จึงมีเลขกำกับ)
          <ol className="grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
            <li className="rounded-md bg-slate-50 p-3">
              <span className="mb-1 block text-xs font-semibold text-brand">1 · แก้ BOQ</span>
              <span>แก้ตามที่ลูกค้าขอที่แท็บ BOQ — สัญญาเดิมไม่ขยับ ระบบแตกเวอร์ชันใหม่ให้เอง</span>
              <button type="button" onClick={onGoToBoq} className="link-pill -ml-2.5 mt-1 block w-fit text-xs font-medium text-brand">
                ไปแท็บ BOQ
              </button>
            </li>
            <li className="rounded-md bg-slate-50 p-3">
              <span className="mb-1 block text-xs font-semibold text-brand">2 · ออกใบ</span>
              <span>กด “ออกใบงานเพิ่ม-ลด” ระบบเทียบกับที่ตกลงไว้ ได้รายการเพิ่ม/ลดเป็นราคาขาย</span>
            </li>
            <li className="rounded-md bg-slate-50 p-3">
              <span className="mb-1 block text-xs font-semibold text-brand">3 · ให้ลูกค้าอนุมัติ</span>
              <span>ส่งให้กดในพอร์ทัล หรือพิมพ์ให้เซ็น — อนุมัติแล้วงวดเงินปรับให้อัตโนมัติ</span>
            </li>
          </ol>
        )}

        {creating && (
          <div className="rounded-lg border border-brand/30 bg-brand/5 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">
                ออกใบงานเพิ่ม-ลด
                {preview && (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    เทียบ BOQ เวอร์ชัน {preview.fromVersionNo} (ตามที่ตกลง) → {preview.toVersionNo} (ล่าสุด)
                  </span>
                )}
              </p>
              <button type="button" onClick={() => setCreating(false)} aria-label="ปิด" className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700">
                <X size={16} />
              </button>
            </div>
            {!preview && !previewError && <p className="text-sm text-slate-500">กำลังเทียบ BOQ...</p>}
            {previewError && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle size={16} className="shrink-0" />
                <span className="flex-1">{previewError}</span>
                <Button variant="ghost" size="sm" onClick={onGoToBoq}>
                  ไปแก้ BOQ
                </Button>
              </div>
            )}
            {preview && (
              <div className="flex flex-col gap-4">
                <div className="rounded-md border border-slate-200 bg-white">
                  <LinesTable lines={preview.lines} totals={preview} />
                  <p className="border-t border-slate-100 px-3 py-2 text-right text-sm text-slate-600 tabular-nums">
                    มูลค่าสัญญา {money(preview.currentAmount)} → <span className="font-semibold text-slate-900">{money(preview.newAmount)}</span>
                  </p>
                </div>
                <HeaderFields form={form} onChange={setForm} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={submitCreate} disabled={busy || !form.title.trim()}>
                    ออกใบ (ร่าง)
                  </Button>
                  <span className="text-xs text-slate-500">ร่างยังไม่ถึงลูกค้า — ตรวจ PDF แล้วค่อยส่ง</span>
                </div>
              </div>
            )}
          </div>
        )}

        {list.map((co) => {
          const open = openId === co.id;
          const closed = co.status === "APPROVED" || co.status === "REJECTED" || co.status === "CANCELLED";
          return (
            <article key={co.id} className={`rounded-lg border ${co.status === "CANCELLED" ? "border-slate-100 opacity-70" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : co.id)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
                  <span className="font-mono text-xs text-slate-500">{co.docNo}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[co.status].cls}`}>{STATUS[co.status].label}</span>
                  <span className="truncate text-sm text-slate-800">{co.title}</span>
                </button>
                <Delta value={co.totalAmount} className="text-sm font-semibold" />
                <a
                  href={changeOrderViewerPath(projectId, contract.id, co.id)}
                  target="_blank"
                  rel="noopener"
                  className={buttonClasses("ghost", "sm")}
                >
                  <FileText size={14} /> PDF
                </a>
              </div>

              {/* บรรทัดสถานะ: บอกว่าเกิดอะไรขึ้นแล้ว / รออะไรอยู่ */}
              <div className="px-3 pb-2.5 text-xs text-slate-500">
                {co.status === "DRAFT" && `ออกเมื่อ ${thaiDate(co.createdAt)} · ยังไม่ถึงลูกค้า`}
                {co.status === "SENT" && `ส่งเมื่อ ${thaiDate(co.sentAt!)} · รอลูกค้ากดในพอร์ทัล หรือเซ็นกระดาษแล้วบันทึกผลที่นี่`}
                {co.status === "APPROVED" &&
                  `อนุมัติเมื่อ ${thaiDate(co.respondedAt!)} (${co.respondedVia === "PORTAL" ? "ลูกค้ากดในพอร์ทัล" : "เซ็นกระดาษ"})` +
                    (co.installmentChanges?.length
                      ? ` · ${co.installmentChanges
                          .map((c) => (c.from == null ? `งวดที่ ${c.seq} ใหม่ ${money(c.to)}` : `งวดที่ ${c.seq} ${money(c.from)} → ${money(c.to)}`))
                          .join(" · ")}`
                      : "")}
                {co.status === "REJECTED" &&
                  rejectedNote(co.respondedAt!, co.responseNote)}
                {co.status === "CANCELLED" && "ยกเลิกแล้ว"}
                {co.extensionDays ? ` · ขยายเวลา ${co.extensionDays} วัน` : ""}
              </div>

              {co.outdated && (
                <div className="mx-3 mb-2.5 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span className="flex-1">BOQ ถูกแก้หลังออกร่างนี้ — ตัวเลขในใบยังไม่รวมการแก้ล่าสุด</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => run(() => changeOrderAction(projectId, contract.id, co.id, "refresh"), `คิด ${co.docNo} ใหม่แล้ว`)}
                  >
                    <RefreshCw size={13} /> คิดใหม่จาก BOQ ล่าสุด
                  </Button>
                </div>
              )}

              {!closed && (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2">
                  {co.status === "DRAFT" && (
                    <>
                      <Button variant="brand" size="sm" disabled={busy || co.outdated} onClick={() => send(co)}>
                        <Send size={13} /> ส่งให้ลูกค้าอนุมัติ
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(editingId === co.id ? null : co.id);
                          setEditForm({ title: co.title, note: co.note ?? "", days: co.extensionDays ? String(co.extensionDays) : "" });
                        }}
                      >
                        แก้หัวเรื่อง
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" disabled={busy || co.outdated} onClick={() => approvePaper(co)}>
                    ลูกค้าเซ็นอนุมัติแล้ว
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRejectingId(rejectingId === co.id ? null : co.id)}>
                    ลูกค้าไม่อนุมัติ
                  </Button>
                  <Button variant="dangerQuiet" size="sm" disabled={busy} onClick={() => cancel(co)} className="ml-auto">
                    ยกเลิกใบ
                  </Button>
                </div>
              )}

              {editingId === co.id && (
                <div className="border-t border-slate-100 bg-slate-50 px-3 py-3">
                  <HeaderFields form={editForm} onChange={setEditForm} />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" disabled={busy || !editForm.title.trim()} onClick={() => saveEdit(co)}>
                      บันทึก
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      ยกเลิก
                    </Button>
                  </div>
                </div>
              )}

              {rejectingId === co.id && (
                <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 bg-slate-50 px-3 py-3">
                  <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs text-slate-700">
                    <span>เหตุผลที่ลูกค้าไม่อนุมัติ</span>
                    <input
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      maxLength={1000}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <Button size="sm" disabled={busy || !rejectNote.trim()} onClick={() => rejectPaper(co)}>
                    บันทึกว่าไม่อนุมัติ
                  </Button>
                </div>
              )}

              {open && (
                <div className="border-t border-slate-100 py-2">
                  {co.note && <p className="mb-2 px-3 text-sm whitespace-pre-line text-slate-600">{co.note}</p>}
                  <p className="mb-1 px-3 text-xs text-slate-400">
                    เทียบ BOQ เวอร์ชัน {co.fromVersionNo} → {co.toVersionNo}
                    {co.amountBefore && co.amountAfter && ` · มูลค่าสัญญา ${money(co.amountBefore)} → ${money(co.amountAfter)}`}
                  </p>
                  <LinesTable lines={co.lines} totals={co} />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
