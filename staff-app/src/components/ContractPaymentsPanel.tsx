import type {
  ContractPaymentsViewDto,
  InstallmentPaymentDto,
  InstallmentStatus,
  InstallmentWithPaymentsDto,
  PaymentMethod,
} from "@systemboq/shared-types";
import { PAYMENT_METHOD_LABELS } from "@systemboq/shared-types";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  deletePayment,
  getContractPayments,
  recordPayment,
  setInstallmentDue,
  updatePayment,
  type PaymentInput,
} from "../lib/contracts-api";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";

const INPUT =
  "rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** วันที่ล้วน (YYYY-MM-DD) — อ่านเป็น UTC เสมอ ให้ตรงกับที่เซิร์ฟเวอร์เก็บในคอลัมน์ DATE */
function thaiDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const STATUS_STYLE: Record<InstallmentStatus, string> = {
  NOT_DUE: "bg-slate-100 text-slate-500",
  AWAITING: "bg-amber-100 text-amber-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
  OVERPAID: "bg-amber-100 text-amber-700",
};

interface FormState {
  paidOn: string;
  amount: string;
  withholdingAmount: string;
  method: PaymentMethod;
  reference: string;
  note: string;
}

/**
 * ติดตามการจ่ายเงินรายงวด — แทนที่ตัวแก้แผนงวดเมื่อสัญญาลงนามแล้ว
 *
 * ก่อนลงนามคือการ "วางแผน" ว่าจะแบ่งจ่ายกี่งวด หลังลงนามคือการ "เก็บเงิน" ตามแผนนั้น
 * เป็นคนละงานคนละช่วงเวลา จึงไม่เอามาซ้อนกันในตารางเดียว (และแผนงวดแก้หลังลงนามไม่ได้อยู่แล้ว)
 */
export function ContractPaymentsPanel({
  projectId,
  contractId,
}: Readonly<{
  projectId: string;
  contractId: string;
}>) {
  const toast = useToast();
  const { user } = useAuth();
  const [view, setView] = useState<ContractPaymentsViewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** งวดที่กำลังเปิดฟอร์มอยู่ (`installmentId`) และรายการที่กำลังแก้ (null = เพิ่มใหม่) */
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<InstallmentPaymentDto | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    let alive = true;
    getContractPayments(projectId, contractId)
      .then((res) => {
        if (alive) setView(res);
      })
      .catch((err) => {
        if (alive) toast.error(err instanceof ApiError ? err.message : "โหลดข้อมูลการรับเงินไม่สำเร็จ");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, contractId]);

  function closeForm() {
    setOpenFor(null);
    setEditing(null);
    setForm(null);
  }

  /**
   * เปิดฟอร์มโดยเติมค่าที่เดาได้ล่วงหน้า: ยอด = ที่ยังขาดอยู่ · ภาษีหัก ณ ที่จ่าย = ที่คาดว่า
   * จะถูกหักจากงวดนี้ · วันที่ = วันนี้ — กรณีปกติ (โอนเต็มงวดวันนี้) จึงเหลือแค่กดยืนยัน
   */
  function openAdd(item: InstallmentWithPaymentsDto) {
    if (!view) return;
    setOpenFor(item.id);
    setEditing(null);
    setForm({
      paidOn: view.today,
      amount: String(item.progress.remaining > 0 ? item.progress.remaining : Number(item.amount)),
      // เติมเฉพาะครั้งแรกของงวด — รับบางส่วนแล้วเดาสัดส่วนที่ถูกหักแทนกันไม่ได้
      withholdingAmount:
        item.expectedWithholding != null && item.payments.length === 0
          ? String(item.expectedWithholding)
          : "0",
      method: "TRANSFER",
      reference: "",
      note: "",
    });
  }

  function openEdit(item: InstallmentWithPaymentsDto, payment: InstallmentPaymentDto) {
    setOpenFor(item.id);
    setEditing(payment);
    setForm({
      paidOn: payment.paidOn,
      amount: String(Number(payment.amount)),
      withholdingAmount: String(Number(payment.withholdingAmount)),
      method: payment.method,
      reference: payment.reference ?? "",
      note: payment.note ?? "",
    });
  }

  async function submit(installmentId: string) {
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
      toast.error("ยอดที่รับต้องมากกว่า 0");
      return;
    }
    setBusy(true);
    try {
      const next = editing
        ? await updatePayment(projectId, contractId, editing.id, input)
        : await recordPayment(projectId, contractId, installmentId, input);
      setView(next);
      closeForm();
      toast.success(editing ? "แก้ไขรายการรับเงินแล้ว" : "บันทึกการรับเงินแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(payment: InstallmentPaymentDto) {
    if (!window.confirm(`ลบรายการรับเงิน ${money(Number(payment.amount))} บาท ของวันที่ ${thaiDate(payment.paidOn)}?`)) {
      return;
    }
    setBusy(true);
    try {
      setView(await deletePayment(projectId, contractId, payment.id));
      toast.success("ลบรายการรับเงินแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function changeDue(installmentId: string, dueOn: string) {
    setBusy(true);
    try {
      setView(await setInstallmentDue(projectId, contractId, installmentId, dueOn || null));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกวันครบกำหนดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">กำลังโหลดข้อมูลการรับเงิน...</p>;
  if (!view) return null;

  const { summary } = view;

  // สัญญาที่ลงนามแล้วแต่ไม่เคยกรอกแผนงวด — ห้ามปล่อยให้ยอดสรุป 0 อ่านได้ว่า "เก็บครบแล้ว"
  if (!view.hasPlan) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-slate-800">การรับเงินรายงวด</p>
        <p className="text-sm text-slate-500">
          สัญญาฉบับนี้ลงนามแล้วแต่ไม่มีแผนงวดในระบบ จึงติดตามการรับเงินไม่ได้ —
          แผนงวดแก้หลังลงนามไม่ได้ ถ้าต้องการติดตาม ต้องทำบันทึกแนบท้ายและออกสัญญาฉบับใหม่
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">การรับเงินรายงวด</p>
        <p className="text-xs text-slate-500">
          เก็บแล้ว{" "}
          <span className="font-semibold tabular-nums text-slate-800">{money(summary.paidAmount)}</span>{" "}
          จาก <span className="tabular-nums">{money(summary.planTotal)}</span> บาท ·{" "}
          {summary.paidCount} จาก {summary.totalCount} งวด
        </p>
      </div>

      {/*
        แถบเดียวที่ต้องเห็นทันทีคือ "ค้างเก็บอยู่เท่าไร" — ขึ้นเฉพาะตอนมีของค้างจริง
        ไม่ใช่กล่องสรุปถาวรที่ขึ้นว่า "ไม่มีงวดค้าง" ทุกครั้งที่เปิดหน้า
      */}
      {summary.overdueCount > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          เลยกำหนดแล้ว {summary.overdueCount} งวด ยังไม่ได้รับรวม{" "}
          <span className="font-semibold tabular-nums">{money(summary.overdueAmount)}</span> บาท
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 pr-2 font-medium">งวด</th>
              <th className="py-2 pr-2 font-medium">เงื่อนไข</th>
              <th className="py-2 pr-2 text-right font-medium">ยอดงวด</th>
              <th className="py-2 pr-2 font-medium">ครบกำหนด</th>
              <th className="py-2 pr-2 text-right font-medium">รับแล้ว</th>
              <th className="py-2 pr-2 font-medium">สถานะ</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {view.installments.map((item) => {
              const p = item.progress;
              const canEditRow = (payment: InstallmentPaymentDto) =>
                user?.role === "OWNER" || payment.recordedById === user?.id;
              return (
                <tr key={item.id} className="border-b border-slate-100 align-top">
                  <td className="py-2.5 pr-2 tabular-nums text-slate-500">{item.seq}</td>
                  <td className="py-2.5 pr-2">
                    <p className="text-slate-800">{item.milestone}</p>
                    {/* รายการรับเงินอยู่ใต้เงื่อนไขของงวดตัวเอง ไม่ต้องกางแถวซ้อนแถว */}
                    {item.payments.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {item.payments.map((pay) => (
                          <li
                            key={pay.id}
                            className="group flex flex-wrap items-center gap-1.5 text-xs text-slate-500"
                          >
                            <span className="tabular-nums">{thaiDate(pay.paidOn)}</span>
                            <span className="tabular-nums text-slate-700">
                              {money(Number(pay.amount))}
                            </span>
                            <span>{PAYMENT_METHOD_LABELS[pay.method]}</span>
                            {Number(pay.withholdingAmount) > 0 && (
                              <span className="text-slate-400">
                                (หัก ณ ที่จ่าย {money(Number(pay.withholdingAmount))} · เข้าบัญชี{" "}
                                {money(Number(pay.amount) - Number(pay.withholdingAmount))})
                              </span>
                            )}
                            {pay.reference && <span className="text-slate-400">อ้างอิง {pay.reference}</span>}
                            {canEditRow(pay) && (
                              <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                <button
                                  type="button"
                                  aria-label="แก้ไขรายการรับเงิน"
                                  disabled={busy}
                                  onClick={() => openEdit(item, pay)}
                                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  type="button"
                                  aria-label="ลบรายการรับเงิน"
                                  disabled={busy}
                                  onClick={() => void remove(pay)}
                                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {openFor === item.id && form && (
                      <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-2">
                        <label className="flex flex-col gap-1 text-xs text-slate-500">
                          <span>วันที่รับเงิน</span>
                          <input
                            type="date"
                            max={view.today}
                            className={INPUT}
                            value={form.paidOn}
                            onChange={(e) => setForm({ ...form, paidOn: e.target.value })}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-500">
                          <span>ยอดที่ชำระ</span>
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
                            onChange={(e) =>
                              setForm({ ...form, method: e.target.value as PaymentMethod })
                            }
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
                          <input
                            className={INPUT}
                            value={form.note}
                            onChange={(e) => setForm({ ...form, note: e.target.value })}
                          />
                        </label>
                        {/* เงินเข้าบัญชีจริงคิดสดตรงที่กำลังพิมพ์ ไม่ต้องไปคำนวณเอง */}
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
                          <Button size="sm" disabled={busy} onClick={() => void submit(item.id)}>
                            <Check size={14} /> {editing ? "บันทึกการแก้ไข" : "บันทึก"}
                          </Button>
                          <Button variant="ghost" size="sm" disabled={busy} onClick={closeForm}>
                            <X size={14} /> ยกเลิก
                          </Button>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pr-2 text-right tabular-nums text-slate-700">
                    {money(Number(item.amount))}
                  </td>
                  <td className="py-2.5 pr-2">
                    <input
                      type="date"
                      aria-label={`วันครบกำหนดงวดที่ ${item.seq}`}
                      className={`${INPUT} w-36`}
                      value={item.dueOn ?? ""}
                      disabled={busy}
                      onChange={(e) => void changeDue(item.id, e.target.value)}
                    />
                  </td>
                  <td className="py-2.5 pr-2 text-right">
                    <p className="tabular-nums text-slate-700">{money(p.paidAmount)}</p>
                    {p.remaining > 0 && p.paidAmount > 0 && (
                      <p className="text-xs tabular-nums text-slate-400">
                        เหลือ {money(p.remaining)}
                      </p>
                    )}
                    {p.overpaidAmount > 0 && (
                      <p className="text-xs tabular-nums text-amber-700">
                        เกิน {money(p.overpaidAmount)}
                      </p>
                    )}
                    {p.withheldAmount > 0 && (
                      <p className="text-xs tabular-nums text-slate-400">
                        เข้าบัญชี {money(p.receivedAmount)}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 pr-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}
                    >
                      {p.statusLabel}
                    </span>
                    {p.daysOverdue != null && (
                      <p className="mt-0.5 text-xs text-amber-700">เกินกำหนด {p.daysOverdue} วัน</p>
                    )}
                  </td>
                  <td className="py-2.5">
                    {openFor !== item.id && (
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => openAdd(item)}>
                        <Plus size={13} /> รับเงิน
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/*
        งวดที่ยังไม่ตั้งวันครบกำหนดจะไม่ขึ้นในหน้างานค้าง — ต้องบอกไว้ ไม่งั้นคนจะนึกว่าระบบ
        เตือนให้เองทุกงวดแล้วปล่อยงวดที่ไม่ได้ตั้งวันหลุดไปเงียบ ๆ
      */}
      {view.installments.some((i) => i.dueOn == null) && (
        <p className="text-xs text-slate-400">
          งวดที่ยังไม่ได้ตั้งวันครบกำหนดจะไม่ขึ้นเตือนในหน้างานที่รอดำเนินการ — ตั้งเมื่องานถึงงวดนั้นแล้ว
        </p>
      )}
    </div>
  );
}
