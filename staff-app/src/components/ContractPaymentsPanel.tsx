import type {
  ContractPaymentsViewDto,
  PaymentNoticeDto,
  InstallmentPaymentDto,
  InstallmentStatus,
  InstallmentWithPaymentsDto,
  PaymentMethod,
} from "@systemboq/shared-types";
import { PAYMENT_METHOD_LABELS, paymentWarnings, retentionOf } from "@systemboq/shared-types";
import { AlertTriangle, Check, ChevronDown, ShieldCheck, X } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  confirmPaymentNoticeBySlip,
  recheckPaymentNoticeSlip,
  deletePayment,
  deletePaymentEvidence,
  issueReceipt,
  getContractPayments,
  paymentEvidenceUrl,
  paymentNoticeEvidenceUrl,
  recordPayment,
  rejectPaymentNotice,
  setInstallmentDue,
  updatePayment,
  uploadPaymentEvidence,
  verifyPayment,
  type PaymentInput,
} from "../lib/contracts-api";
import { hasActiveReceipt } from "../lib/billing-docs";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { InstallmentInvoice, PaymentReceipt, VoidedReceipts, VoidForm } from "./BillingDocControls";
import { Button } from "./Button";
import { RowMenu, type RowMenuItem } from "./RowMenu";
import { RetentionPanel } from "./RetentionPanel";
import { PanelSkeleton } from "./Skeleton";
import { DateInput } from "./DateInput";
import { EvidencePicker, PaymentEvidenceList } from "./PaymentEvidence";
import { PaymentNoticeBox, SlipRejectedNotices } from "./PaymentNoticeBox";
import { NARROW_SCREEN, useMediaQuery } from "../lib/use-media-query";

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
  retentionAmount: string;
  /** พิมพ์ช่องเงินประกันเองแล้ว — เลิกคิดตามยอดที่ชำระให้อัตโนมัติ */
  retentionTouched: boolean;
  method: PaymentMethod;
  reference: string;
  note: string;
  /** คนรับเงินสด/เช็ค — โผล่เฉพาะสองช่องทางนั้น */
  receivedBy: string;
  /** ไฟล์หลักฐานที่เลือกไว้ ส่งขึ้นหลังบันทึกรายการแล้ว */
  files: File[];
  /** กางช่องรายละเอียด (รับไม่ครบ/หัก ณ ที่จ่าย/อ้างอิง/หมายเหตุ) — กรณีปกติไม่ต้องเห็น */
  more: boolean;
  /** กำลังยืนยันการแจ้งโอนของลูกค้า — ยอดที่ลูกค้าบอกว่าโอน ใช้เทียบกับเงินเข้าบัญชีจริง */
  notice: PaymentNoticeDto | null;
  /** ขั้นตรวจทานก่อนบันทึก (กดบันทึกครั้งแรก = เปิดสรุป + คำเตือน · กดยืนยัน = บันทึกจริง) */
  reviewing: boolean;
}

type NextStep =
  | { kind: "bill"; label: string }
  | { kind: "pay"; label: string }
  | { kind: "verify"; label: string; paymentId: string }
  | { kind: "receipt"; label: string; paymentId: string };

/**
 * ขั้นถัดไปของงวด — ปุ่มเดียวท้ายแถว ตามลำดับงานจริง วางบิล → ลูกค้าจ่าย → ยืนยันกับบัญชี → ออกใบเสร็จ
 * ลูกค้าแจ้งโอนรอตรวจ = ไม่มีปุ่ม (ทางเข้าคือกล่องแจ้งโอนในแถว) · ครบทุกขั้นแล้ว = ไม่มีปุ่ม
 * รอยืนยันแต่เราเป็นคนบันทึกเอง (ADMIN) = ไม่มีปุ่ม ต้องรอคนอื่นตรวจ
 */
function nextStepOf(
  item: InstallmentWithPaymentsDto,
  nextToBill: string | null,
  canVerify: (pay: InstallmentPaymentDto) => boolean,
): NextStep | null {
  if (item.pendingNotices.length > 0) return null;
  const unverified = item.payments.find((pay) => !pay.verifiedAt);
  if (unverified) {
    return canVerify(unverified) ? { kind: "verify", label: "ยืนยันเงินเข้า", paymentId: unverified.id } : null;
  }
  const unreceipted = item.payments.find((pay) => !hasActiveReceipt(item.documents, pay.id));
  if (unreceipted) return { kind: "receipt", label: "ออกใบเสร็จ", paymentId: unreceipted.id };
  if (item.progress.remaining <= 0) return null;
  if (item.documents.some((d) => d.type === "INVOICE" && !d.voidedAt)) return { kind: "pay", label: "ลูกค้าจ่ายแล้ว" };
  if (item.id === nextToBill) return { kind: "bill", label: "วางบิล" };
  return null;
}

/**
 * สถานะยืนยันกับบัญชีของรายการรับเงิน (ข้อ 2): รอยืนยัน = ป้ายอำพัน + ปุ่มยืนยัน (ถ้าเรามีสิทธิ์)
 * · ยืนยันแล้ว = ไอคอนโล่สีเขียวเล็ก ๆ ชี้แล้วบอกว่าใครยืนยัน (ไม่แย่งสายตา)
 */
function VerifyBadge({ payment, canVerify }: Readonly<{ payment: InstallmentPaymentDto; canVerify: boolean }>) {
  if (payment.verifiedAt) {
    const by = payment.verifiedByName ? `ยืนยันกับบัญชีโดย ${payment.verifiedByName}` : "ยืนยันกับบัญชีแล้ว";
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-700" title={by}>
        <ShieldCheck size={13} aria-hidden />
        <span className="sr-only">{by}</span>
        <span>ตรงกับบัญชี</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">รอยืนยันกับบัญชี</span>
      {/* ปุ่มยืนยันอยู่ท้ายแถว (ขั้นถัดไป) และในเมนู ⋯ อยู่แล้ว — ที่นี่บอกแค่ว่าใครต้องทำ */}
      {!canVerify && <span className="text-slate-400">รอคนอื่นตรวจ (คุณเป็นคนบันทึก)</span>}
    </span>
  );
}

/** มีคนถือเงินมากับมือ (ไม่ได้เข้าบัญชีบริษัทตรง) — ต้องรู้ว่าใครรับ */
const handCarried = (m: PaymentMethod) => m === "CASH" || m === "CHEQUE";

/**
 * ยอดที่ตั้งต้นในฟอร์มรับเงิน (ชำระส่วนที่เหลือของงวด) — ใช้ทั้งฟอร์มและหน้าต่างตรวจสลิป
 * "เข้าบัญชีจริง" = ยอด − หัก ณ ที่จ่าย − เงินประกัน คือตัวเลขที่ควรเห็นบนสลิป
 */
function receiptDefaultsOf(item: InstallmentWithPaymentsDto, retentionPct: number | null) {
  const amount = item.progress.remaining > 0 ? item.progress.remaining : Number(item.amount);
  // เติมเฉพาะครั้งแรกของงวด — รับบางส่วนแล้วเดาสัดส่วนที่ถูกหักแทนกันไม่ได้
  const withholding = item.expectedWithholding != null && item.payments.length === 0 ? item.expectedWithholding : 0;
  // เงินประกันคิดตาม % ของยอดที่ชำระครั้งนี้ — แก้เองได้ถ้าลูกค้ากันไว้ไม่ตรง
  const retention = retentionOf(amount, retentionPct);
  return { amount, withholding, retention, transfer: Math.round((amount - withholding - retention) * 100) / 100 };
}

const receiptOf = (item: InstallmentWithPaymentsDto, paymentId: string) =>
  item.documents.find((d) => d.type === "RECEIPT" && d.paymentId === paymentId && !d.voidedAt);

function formTitle(editing: boolean, fromNotice: boolean) {
  if (editing) return "แก้รายการรับเงิน";
  return fromNotice ? "ยืนยันรับเงินตามที่ลูกค้าแจ้งโอน" : "บันทึกรับเงิน";
}

function moreToggleLabel(more: boolean, showWithholding: boolean) {
  if (more) return "ซ่อนรายละเอียด";
  const wht = showWithholding ? " / หัก ณ ที่จ่าย" : "";
  return `รับไม่ครบ${wht} / เลขอ้างอิง / หมายเหตุ`;
}

/** ป้ายยอดในฟอร์ม: รับครบงวด · รับส่วนที่เหลือ · หรือยอดที่ชำระ (รับบางส่วน/รับเกิน) */
function amountLabelOf(amount: number, item: InstallmentWithPaymentsDto) {
  if (amount === Number(item.amount)) return "รับครบงวด";
  if (amount === item.progress.remaining) return "รับส่วนที่เหลือของงวด";
  return "ยอดที่ชำระ";
}

/** ยอดเงินอ่านเป็นประโยคเดียว (มีลูกน้ำ) — เงินเข้าบัญชีจริงคิดสดให้ ไม่ต้องคำนวณเอง */
function FormAmountSummary({
  amountLabel,
  amount,
  wht,
  ret,
  net,
  notice,
  more,
}: Readonly<{
  amountLabel: string;
  amount: number;
  wht: number;
  ret: number;
  net: number;
  notice: PaymentNoticeDto | null;
  more: boolean;
}>) {
  const noticeAmount = notice ? Number(notice.amount) : 0;
  const mismatch = notice != null && Math.abs(net - noticeAmount) > 0.009;
  return (
    <>
      <p className="mt-3 text-sm text-slate-600">
        {amountLabel}{" "}
        <span className="font-semibold tabular-nums text-slate-800">{money(amount)}</span> บาท
        {(wht > 0 || ret > 0) && (
          <span className="text-slate-500">
            {wht > 0 && (
              <>
                {" "}· หัก ณ ที่จ่าย <span className="tabular-nums">{money(wht)}</span>
              </>
            )}
            {ret > 0 && (
              <>
                {" "}· กันเงินประกัน <span className="tabular-nums">{money(ret)}</span>
              </>
            )}{" "}
            · เข้าบัญชีจริง <span className="tabular-nums text-slate-700">{money(net)}</span>
          </span>
        )}
      </p>
      {notice && (
        <p className="text-xs text-slate-500">
          ลูกค้าแจ้งโอน{" "}
          <span className={`tabular-nums ${mismatch ? "font-semibold text-amber-700" : "text-slate-700"}`}>{money(noticeAmount)}</span>{" "}
          บาท{notice.evidence.length > 0 && " · สลิปของลูกค้าในช่องหลักฐานจะแนบให้เองตอนบันทึก"}
          {mismatch && " — ไม่ตรงกับเงินเข้าบัญชีจริงด้านบน ตรวจยอดอีกครั้ง"}
        </p>
      )}
      {ret > 0 && more && <p className="text-xs text-slate-400">ยอดที่ชำระทั้งหมดนับว่าจ่ายงวดนี้แล้ว ส่วนที่กันไว้ไปรอคืนท้ายสัญญา</p>}
    </>
  );
}

/** ช่อง "รับแล้ว" ของงวด (จอกว้าง) */
function PaidCell({ p, narrow }: Readonly<{ p: InstallmentWithPaymentsDto["progress"]; narrow: boolean }>) {
  return (
    <td className={`py-2.5 pr-2 text-right ${narrow ? "hidden" : ""}`}>
      {p.paidAmount > 0 ? (
        <p className="tabular-nums text-slate-700">{money(p.paidAmount)}</p>
      ) : (
        <p className="text-slate-300">
          <span aria-hidden>—</span>
          <span className="sr-only">ยังไม่ได้รับ</span>
        </p>
      )}
      {p.overpaidAmount > 0 && <p className="text-xs tabular-nums text-amber-700">เกิน {money(p.overpaidAmount)}</p>}
      {(p.withheldAmount > 0 || p.retainedAmount > 0) && (
        <p className="text-xs tabular-nums text-slate-400">เข้าบัญชี {money(p.receivedAmount)}</p>
      )}
    </td>
  );
}

/** ช่อง "คงเหลือ" (จอแคบซ้อนสถานะไว้ใต้ตัวเลข) */
function RemainingCell({ p, narrow }: Readonly<{ p: InstallmentWithPaymentsDto["progress"]; narrow: boolean }>) {
  return (
    <td className="py-2.5 pr-3 text-right">
      {p.remaining > 0 ? (
        <p className="font-semibold tabular-nums text-slate-900">{money(p.remaining)}</p>
      ) : (
        <p className="text-slate-300">
          <span aria-hidden>—</span>
          <span className="sr-only">ไม่มียอดคงเหลือ</span>
        </p>
      )}
      {narrow && (
        <span className={`mt-1 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>
          {p.statusLabel}
        </span>
      )}
      {narrow && p.daysOverdue != null && <p className="mt-0.5 text-xs text-amber-700">เกินกำหนด {p.daysOverdue} วัน</p>}
    </td>
  );
}

/** รายละเอียดหักของรายการรับเงิน — "(หัก ณ ที่จ่าย … · กันเงินประกัน … · เข้าบัญชี …)" */
function deductionNote(pay: InstallmentPaymentDto) {
  const wht = Number(pay.withholdingAmount);
  const ret = Number(pay.retentionAmount);
  return [
    wht > 0 ? `หัก ณ ที่จ่าย ${money(wht)}` : null,
    ret > 0 ? `กันเงินประกัน ${money(ret)}` : null,
    `เข้าบัญชี ${money(Number(pay.amount) - wht - ret)}`,
  ]
    .filter(Boolean)
    .join(" · ");
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
  const narrow = useMediaQuery(NARROW_SCREEN);
  const { user } = useAuth();
  const [view, setView] = useState<ContractPaymentsViewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** งวดที่กำลังเปิดฟอร์มอยู่ (`installmentId`) และรายการที่กำลังแก้ (null = เพิ่มใหม่) */
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<InstallmentPaymentDto | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  /** งวดที่กำลังเปิดฟอร์มวางบิล · เอกสารที่กำลังพิมพ์เหตุผลยกเลิก (เปิดจากเมนู ⋯) */
  const [invoiceFor, setInvoiceFor] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const confirm = useConfirm();

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
  function openAdd(item: InstallmentWithPaymentsDto, notice: PaymentNoticeDto | null = null) {
    if (!view) return;
    setOpenFor(item.id);
    setEditing(null);
    const { amount, withholding, retention } = receiptDefaultsOf(item, view.retention.pct);
    const next: FormState = {
      paidOn: notice?.paidOn ?? view.today,
      amount: String(amount),
      withholdingAmount: String(withholding),
      retentionAmount: String(retention),
      retentionTouched: false,
      method: "TRANSFER",
      reference: "",
      note: "",
      receivedBy: user?.fullName ?? "",
      files: [],
      more: false,
      notice,
      reviewing: false,
    };
    // ลูกค้าโอนไม่ตรงกับ "เข้าบัญชีจริง" ของการรับครบงวด (โอนบางส่วน/โอนเกิน) — ตั้งยอดตามที่โอน
    // แล้วกางรายละเอียดให้เห็น ไม่เดาว่าส่วนต่างคือภาษีหักหรือเงินประกัน
    const transferred = notice ? Number(notice.amount) : null;
    if (transferred != null && Math.abs(amount - withholding - retention - transferred) > 0.009) {
      next.amount = String(transferred);
      next.withholdingAmount = "0";
      next.retentionAmount = String(retentionOf(transferred, view.retention.pct));
      next.more = true;
    }
    setForm(next);
  }

  /** เจ้าของยืนยันได้ทุกรายการ · ADMIN ยืนยันได้เฉพาะรายการที่คนอื่นบันทึก (ตรงกับที่เซิร์ฟเวอร์ตรวจ) */
  const canVerify = (pay: InstallmentPaymentDto) => user?.role === "OWNER" || pay.recordedById !== user?.id;

  async function verifyFor(item: InstallmentWithPaymentsDto, pay: InstallmentPaymentDto) {
    const net = Number(pay.amount) - Number(pay.withholdingAmount) - Number(pay.retentionAmount);
    const refNote = pay.reference ? ` · อ้างอิง ${pay.reference}` : "";
    const ok = await confirm(
      `ยืนยันว่าเงินเข้าบัญชีบริษัทแล้ว ${money(net)} บาท?\n` +
        `งวดที่ ${item.seq} · ${thaiDate(pay.paidOn)} · ${PAYMENT_METHOD_LABELS[pay.method]}` +
        `${refNote}\n\n` +
        "เปิดแอปธนาคารหรือสเตทเมนต์เทียบยอดและวันที่ก่อนกด — ยืนยันแล้วลูกค้าจะได้รับแจ้งว่าบริษัทได้รับเงิน",
      { confirmLabel: "ตรงกับบัญชีแล้ว", variant: "brand" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      setView(await verifyPayment(projectId, contractId, pay.id));
      toast.success("ยืนยันแล้ว — แจ้งลูกค้าว่าได้รับเงินแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ยืนยันไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function issueReceiptFor(paymentId: string) {
    // ใบเสร็จกินเลขเอกสารจริงและลบไม่ได้ (ยกเลิกได้อย่างเดียว) — ยืนยันก่อนเสมอ
    const ok = await confirm(
      "ออกใบเสร็จรับเงินสำหรับรายการนี้? ใบเสร็จจะกินเลขที่เอกสารจริงและลบไม่ได้ — ถ้าออกผิดต้องยกเลิกใบแล้วออกใหม่ด้วยเลขใหม่",
      { confirmLabel: "ออกใบเสร็จ", variant: "brand" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      setView(await issueReceipt(projectId, contractId, paymentId));
      toast.success("ออกใบเสร็จรับเงินแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ออกใบเสร็จไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  /** สลิปที่ระบบตรวจผ่าน: บันทึกรับเงิน + ยืนยันกับบัญชี + ออกใบเสร็จ ในคลิกเดียว (ยังถามยืนยันก่อน) */
  async function confirmBySlip(item: InstallmentWithPaymentsDto, notice: PaymentNoticeDto) {
    const files = notice.slipCheck?.files.filter((f) => f.status === "PASSED") ?? [];
    const total = files.reduce((sum, f) => sum + Number(f.amount ?? 0), 0);
    const refNote = files[0]?.transRef ? ` · อ้างอิง ${files.map((f) => f.transRef).join(", ")}` : "";
    const ok = await confirm(
      `ยืนยันรับเงินงวดที่ ${item.seq} ${money(total)} บาท และออกใบเสร็จ?\n` +
        `ธนาคารยืนยันรายการโอนแล้ว · เข้าบัญชีบริษัท · ยอดและวันที่ตรง` +
        `${refNote}\n\n` +
        "ระบบจะบันทึกรับเงิน นับว่ายืนยันกับบัญชีแล้ว (ใช้ผลตรวจสลิปแทนการเปิดแอปธนาคาร) และออกใบเสร็จที่ลบไม่ได้ — ลูกค้าจะได้รับแจ้ง",
      { confirmLabel: "ยืนยัน & ออกใบเสร็จ", variant: "brand" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await confirmPaymentNoticeBySlip(projectId, contractId, notice.id);
      setView(res);
      if (res.receiptError) toast.error(`บันทึกและยืนยันรับเงินแล้ว แต่ออกใบเสร็จไม่ได้: ${res.receiptError}`);
      else toast.success("รับเงินและออกใบเสร็จแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function recheckSlip(noticeId: string) {
    setBusy(true);
    try {
      const res = await recheckPaymentNoticeSlip(projectId, contractId, noticeId);
      setView(res);
      const after = res.installments.flatMap((i) => i.pendingNotices).find((n) => n.id === noticeId);
      if (after?.slipCheck?.status === "UNCHECKED") toast.error("ยังตรวจไม่ได้ — ดูเหตุผลในกล่องแจ้งโอน");
      else toast.success("ตรวจสลิปแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ตรวจสลิปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function rejectNotice(noticeId: string, reason: string): Promise<boolean> {
    setBusy(true);
    try {
      setView(await rejectPaymentNotice(projectId, contractId, noticeId, reason));
      toast.success("แจ้งลูกค้าแล้วว่ายังตรวจไม่พบเงินเข้า");
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openEdit(item: InstallmentWithPaymentsDto, payment: InstallmentPaymentDto) {
    setOpenFor(item.id);
    setEditing(payment);
    setForm({
      paidOn: payment.paidOn,
      amount: String(Number(payment.amount)),
      withholdingAmount: String(Number(payment.withholdingAmount)),
      retentionAmount: String(Number(payment.retentionAmount)),
      retentionTouched: true,
      method: payment.method,
      reference: payment.reference ?? "",
      note: payment.note ?? "",
      receivedBy: payment.receivedBy ?? user?.fullName ?? "",
      files: [],
      // แก้รายการเดิม = ตั้งใจแก้รายละเอียด กางให้เห็นครบ
      more: true,
      notice: null,
      reviewing: false,
    });
  }

  /**
   * ส่งไฟล์หลักฐานขึ้นทีละไฟล์ — ไฟล์ที่ล้มไม่ทำให้รายการรับเงินหาย (บันทึกไปแล้ว)
   * บอกให้แนบใหม่ที่รายการแทน
   */
  async function attachEvidence(paymentId: string, files: File[]) {
    let failed = 0;
    for (const file of files) {
      try {
        setView(await uploadPaymentEvidence(projectId, contractId, paymentId, file));
      } catch (err) {
        failed += 1;
        toast.error(err instanceof ApiError ? `${file.name}: ${err.message}` : `แนบ ${file.name} ไม่สำเร็จ`);
      }
    }
    return failed;
  }

  async function attachLater(paymentId: string, files: File[]) {
    setBusy(true);
    try {
      const failed = await attachEvidence(paymentId, files);
      if (failed < files.length) toast.success("แนบหลักฐานแล้ว");
    } finally {
      setBusy(false);
    }
  }

  async function removeEvidence(paymentId: string, evidenceId: string, fileName: string) {
    if (!window.confirm(`ลบไฟล์หลักฐาน ${fileName}?`)) return;
    setBusy(true);
    try {
      setView(await deletePaymentEvidence(projectId, contractId, paymentId, evidenceId));
      toast.success("ลบไฟล์หลักฐานแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  /** กดบันทึกครั้งแรก = เปิดขั้นตรวจทาน (สรุปตัวใหญ่ + คำเตือน) ไม่บันทึกทันที */
  function startReview() {
    if (!form) return;
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("ยอดที่รับต้องมากกว่า 0");
      return;
    }
    setForm({ ...form, reviewing: true });
  }

  async function submit(installmentId: string) {
    if (!form) return;
    const input: PaymentInput = {
      paidOn: form.paidOn,
      amount: Number(form.amount),
      withholdingAmount: Number(form.withholdingAmount || 0),
      retentionAmount: Number(form.retentionAmount || 0),
      method: form.method,
      reference: form.reference.trim() || null,
      note: form.note.trim() || null,
      receivedBy: handCarried(form.method) ? form.receivedBy.trim() || null : null,
      noticeId: editing ? undefined : form.notice?.id ?? null,
    };
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      toast.error("ยอดที่รับต้องมากกว่า 0");
      return;
    }
    setBusy(true);
    try {
      const before = new Set(view?.installments.flatMap((i) => i.payments.map((p) => p.id)) ?? []);
      const next = editing
        ? await updatePayment(projectId, contractId, editing.id, input)
        : await recordPayment(projectId, contractId, installmentId, input);
      setView(next);
      // รายการที่เพิ่งสร้าง = id ที่ไม่เคยมีก่อนบันทึก (API คืนทั้งหน้าจอ ไม่ได้คืน id รายการเดียว)
      const paymentId =
        editing?.id ??
        next.installments
          .find((i) => i.id === installmentId)
          ?.payments.find((p) => !before.has(p.id))?.id;
      const files = form.files;
      closeForm();
      toast.success(editing ? "แก้ไขรายการรับเงินแล้ว" : "บันทึกการรับเงินแล้ว");
      if (paymentId && files.length > 0) await attachEvidence(paymentId, files);
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

  if (loading) return <PanelSkeleton lines={5} label="กำลังโหลดข้อมูลการรับเงิน..." />;
  if (!view) return null;

  const { summary } = view;
  const docCtx = { projectId, contractId, onChange: setView };

  // ออกใบเสร็จแล้วแก้/ลบไม่ได้ (เซิร์ฟเวอร์ก็ปฏิเสธ) — ต้องยกเลิกใบเสร็จก่อน
  const canEditRow = (item: InstallmentWithPaymentsDto, payment: InstallmentPaymentDto) =>
    (user?.role === "OWNER" || payment.recordedById === user?.id) && !hasActiveReceipt(item.documents, payment.id);

  /** คำสั่งของรายการรับเงินหนึ่งรายการในเมนู ⋯ (ไม่ซ้ำกับปุ่มขั้นถัดไปที่เห็นในแถว) */
  function paymentMenuOf(item: InstallmentWithPaymentsDto, pay: InstallmentPaymentDto, next: NextStep | null): RowMenuItem[] {
    const menu: RowMenuItem[] = [];
    const when = `${thaiDate(pay.paidOn)} · ${money(Number(pay.amount))}`;
    const isNext = (kind: NextStep["kind"]) => next?.kind === kind && "paymentId" in next && next.paymentId === pay.id;
    if (!pay.verifiedAt && canVerify(pay) && !isNext("verify")) {
      menu.push({ key: `verify-${pay.id}`, label: `ยืนยันเงินเข้า (${when})`, onSelect: () => void verifyFor(item, pay) });
    }
    const rc = receiptOf(item, pay.id);
    // ใบเสร็จออกได้หลังยืนยันกับบัญชีแล้วเท่านั้น (เซิร์ฟเวอร์ก็ปฏิเสธ)
    if (pay.verifiedAt && !rc && !isNext("receipt")) {
      menu.push({ key: `rc-${pay.id}`, label: `ออกใบเสร็จ (${when})`, onSelect: () => void issueReceiptFor(pay.id) });
    }
    if (canEditRow(item, pay)) {
      menu.push(
        { key: `edit-${pay.id}`, label: `แก้รายการรับเงิน ${when}`, onSelect: () => openEdit(item, pay) },
        { key: `del-${pay.id}`, label: `ลบรายการรับเงิน ${when}`, danger: true, onSelect: () => void remove(pay) },
      );
    }
    // ใบเสร็จคือหลักฐานว่าได้รับเงินแล้ว — ยกเลิกได้เฉพาะเจ้าของกิจการ
    if (rc && user?.role === "OWNER") {
      menu.push({ key: `void-${rc.id}`, label: `ยกเลิกใบเสร็จ ${rc.docNo}`, danger: true, onSelect: () => setVoiding(rc.id) });
    }
    return menu;
  }

  /** คำสั่งที่ใช้ไม่บ่อยอยู่ในเมนู ⋯ — ปุ่มที่เห็นในแถวมีแค่ "ขั้นถัดไป" ปุ่มเดียว */
  function rowMenuOf(item: InstallmentWithPaymentsDto, next: NextStep | null, formOpen: boolean): RowMenuItem[] {
    const invoice = item.documents.find((d) => d.type === "INVOICE" && !d.voidedAt);
    const menu: RowMenuItem[] = [];
    if (!formOpen && item.pendingNotices.length === 0 && next?.kind !== "pay") {
      menu.push({ key: "pay", label: "บันทึกรับเงิน", onSelect: () => openAdd(item) });
    }
    if (!invoice && item.progress.remaining > 0 && next?.kind !== "bill") {
      menu.push({ key: "bill", label: "วางบิล (ออกใบแจ้งหนี้)", onSelect: () => setInvoiceFor(item.id) });
    }
    for (const pay of item.payments) menu.push(...paymentMenuOf(item, pay, next));
    if (invoice) {
      menu.push({ key: `void-${invoice.id}`, label: `ยกเลิกใบแจ้งหนี้ ${invoice.docNo}`, danger: true, onSelect: () => setVoiding(invoice.id) });
    }
    return menu;
  }

  /** กดปุ่มขั้นถัดไปของงวด */
  function runNext(item: InstallmentWithPaymentsDto, next: NextStep) {
    if (next.kind === "bill") setInvoiceFor(item.id);
    else if (next.kind === "pay") openAdd(item);
    else if (next.kind === "verify") {
      const pay = item.payments.find((x) => x.id === next.paymentId);
      if (pay) void verifyFor(item, pay);
    } else void issueReceiptFor(next.paymentId);
  }

  /** รายการรับเงินใต้เงื่อนไขของงวด — ข้อมูลเป็นสีเทา ของที่กดได้เป็นลิงก์/ปุ่มมีกรอบ */
  function renderPayments(item: InstallmentWithPaymentsDto) {
    if (item.payments.length === 0) return null;
    return (
      <ul className="mt-1 flex flex-col gap-1">
        {item.payments.map((pay) => (
          <li key={pay.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>
              <span className="tabular-nums">{thaiDate(pay.paidOn)}</span> · รับ{" "}
              <span className="tabular-nums text-slate-700">{money(Number(pay.amount))}</span> ·{" "}
              {PAYMENT_METHOD_LABELS[pay.method]}
              {(Number(pay.withholdingAmount) > 0 || Number(pay.retentionAmount) > 0) && (
                <span className="text-slate-400"> ({deductionNote(pay)})</span>
              )}
              {pay.reference && <span className="text-slate-400"> · อ้างอิง {pay.reference}</span>}
              {pay.receivedBy && <span className="text-slate-400"> · รับโดย {pay.receivedBy}</span>}
            </span>
            <PaymentEvidenceList
              payment={pay}
              urlOf={(evidenceId) => paymentEvidenceUrl(projectId, contractId, pay.id, evidenceId)}
              canDelete={(uploadedById) => user?.role === "OWNER" || uploadedById === user?.id || pay.recordedById === user?.id}
              busy={busy}
              onAttach={(files) => void attachLater(pay.id, files)}
              onDelete={(evidenceId, fileName) => void removeEvidence(pay.id, evidenceId, fileName)}
              onError={(m) => toast.error(m)}
            />
            <PaymentReceipt payment={pay} docs={item.documents} ctx={docCtx} />
            <VerifyBadge payment={pay} canVerify={canVerify(pay)} />
          </li>
        ))}
      </ul>
    );
  }
  // วางบิลทีละงวดตามลำดับ — ปุ่ม "วางบิล" ขึ้นเฉพาะงวดแรกที่ยังค้างและยังไม่มีใบ (งวดอื่นสั่งได้จากเมนู ⋯)
  const nextToBill =
    view.installments.find(
      (i) => i.progress.remaining > 0 && !i.documents.some((d) => d.type === "INVOICE" && !d.voidedAt),
    )?.id ?? null;

  /**
   * ฟอร์มรับเงิน — กรณีปกติ (โอนครบงวดวันนี้) เห็นแค่วันที่ ช่องทาง และหลักฐาน ยอดเติมไว้แล้ว
   * รายละเอียดที่ใช้นาน ๆ ครั้ง (รับไม่ครบ/หัก ณ ที่จ่าย/อ้างอิง/หมายเหตุ) พับไว้ใต้ลิงก์เดียว
   */
  function renderForm(item: InstallmentWithPaymentsDto, invoiceNo: string | null) {
    if (!form || !view) return null;
    const amount = Number(form.amount || 0);
    const wht = Number(form.withholdingAmount || 0);
    const ret = Number(form.retentionAmount || 0);
    const net = amount - wht - ret;
    // ลูกค้านิติบุคคลเท่านั้นที่หัก ณ ที่จ่าย — บุคคลธรรมดาไม่ต้องเห็นช่องที่เป็น 0 ตลอด
    const showWithholding = item.expectedWithholding != null || wht > 0;
    const label = "flex flex-col gap-1 text-xs text-slate-500";

    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-medium text-slate-600">
          {formTitle(Boolean(editing), Boolean(form.notice))} งวด{" "}
          {item.seq}
          {invoiceNo && <span className="font-normal text-slate-500"> · ตามใบแจ้งหนี้ {invoiceNo}</span>}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className={label}>
            <span>วันที่รับเงิน</span>
            <DateInput
              max={view.today}
              className={INPUT}
              value={form.paidOn}
              onChange={(v) => setForm({ ...form, paidOn: v })}
            />
          </label>
          <label className={label}>
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
          {/* เงินสด/เช็คไม่มีสลิป ชื่อคนรับคือร่องรอยเดียวว่าเงินอยู่กับใคร */}
          {handCarried(form.method) && (
            <label className={label}>
              <span>ผู้รับเงิน</span>
              <input
                className={`${INPUT} w-40`}
                value={form.receivedBy}
                onChange={(e) => setForm({ ...form, receivedBy: e.target.value })}
              />
            </label>
          )}
          <div className="min-w-[16rem] flex-1">
            <EvidencePicker
              method={form.method}
              files={form.files}
              existingCount={(editing?.evidence.length ?? 0) + (form.notice?.evidence.length ?? 0)}
              attached={(form.notice?.evidence ?? []).map((e) => ({
                id: e.id,
                fileName: e.fileName,
                url: paymentNoticeEvidenceUrl(projectId, contractId, form.notice!.id, e.id),
              }))}
              onChange={(files) => setForm({ ...form, files })}
              onError={(m) => toast.error(m)}
            />
          </div>
        </div>

        {form.more && renderMoreFields(showWithholding)}

        <FormAmountSummary
          amountLabel={amountLabelOf(amount, item)}
          amount={amount}
          wht={wht}
          ret={ret}
          net={net}
          notice={form.notice}
          more={form.more}
        />
        {form.reviewing && renderReview(item)}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {editing ? (
            <span />
          ) : (
            <button
              type="button"
              aria-expanded={form.more}
              onClick={() => setForm({ ...form, more: !form.more })}
              className="link-pill -ml-2.5 inline-flex items-center gap-1 text-xs font-medium text-brand"
            >
              <ChevronDown size={13} className={`transition-transform ${form.more ? "rotate-180" : ""}`} />
              {moreToggleLabel(form.more, showWithholding)}
            </button>
          )}
          <div className="flex items-center gap-2">
            {form.reviewing ? (
              <>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setForm({ ...form, reviewing: false })}>
                  กลับไปแก้
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void submit(item.id)}>
                  <Check size={14} /> ยืนยันบันทึก
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" disabled={busy} onClick={closeForm}>
                  <X size={14} /> ยกเลิก
                </Button>
                <Button size="sm" disabled={busy} onClick={startReview}>
                  <Check size={14} /> {editing ? "บันทึกการแก้ไข" : "บันทึกรับเงิน"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /** รายละเอียดที่ใช้นาน ๆ ครั้ง — ยอดรับไม่ครบ · หัก ณ ที่จ่าย · เงินประกัน · อ้างอิง · หมายเหตุ */
  function renderMoreFields(showWithholding: boolean) {
    if (!form || !view) return null;
    const label = "flex flex-col gap-1 text-xs text-slate-500";
    return (
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3">
            <label className={label}>
              <span>ยอดที่ชำระ</span>
              <input
                type="number"
                step="0.01"
                min="0"
                className={`${INPUT} w-36 text-right tabular-nums`}
                value={form.amount}
                onChange={(e) =>
                  setForm({
                    ...form,
                    amount: e.target.value,
                    // ยังไม่ได้แตะช่องเงินประกัน → คิดตาม % ของยอดใหม่ให้
                    retentionAmount: form.retentionTouched
                      ? form.retentionAmount
                      : String(retentionOf(Number(e.target.value || 0), view.retention.pct)),
                  })
                }
              />
            </label>
            {showWithholding && (
              <label className={label}>
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
            )}
            {showRetention && (
              <label className={label}>
                <span>กันเงินประกัน{view.retention.pct != null ? ` ${view.retention.pct}%` : ""}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={`${INPUT} w-28 text-right tabular-nums`}
                  value={form.retentionAmount}
                  onChange={(e) => setForm({ ...form, retentionAmount: e.target.value, retentionTouched: true })}
                />
              </label>
            )}
            <label className={label}>
              <span>{form.method === "CHEQUE" ? "เลขที่เช็ค" : "เลขอ้างอิง"}</span>
              <input
                className={`${INPUT} w-40`}
                placeholder={form.method === "TRANSFER" ? "เลขอ้างอิงบนสลิป" : ""}
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
              />
            </label>
            <label className={`${label} min-w-40 flex-1`}>
              <span>หมายเหตุ</span>
              <input className={INPUT} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
          </div>
    );
  }

  /**
   * ขั้นตรวจทานก่อนบันทึก (ข้อ 1) — ยอดตัวใหญ่ให้ตาเห็นอีกรอบ + คำเตือนสิ่งผิดสังเกต (เตือน ไม่ห้าม)
   * คำเตือนคิดด้วย paymentWarnings ใน shared-types (มีเทสต์ที่ server/tests/lib/payment-warnings.test.ts)
   */
  function renderReview(item: InstallmentWithPaymentsDto) {
    if (!form || !view) return null;
    const amount = Number(form.amount || 0);
    const net = amount - Number(form.withholdingAmount || 0) - Number(form.retentionAmount || 0);
    // แก้รายการเดิม: คืนยอดเดิมกลับเข้าไปก่อนเทียบ ไม่งั้นแก้ยอดเดิมจะขึ้นว่า "รับเกิน"
    const editingAmount = editing ? Number(editing.amount) : 0;
    const warnings = paymentWarnings(
      {
        installmentId: item.id,
        amount,
        paidOn: form.paidOn,
        method: form.method,
        hasEvidence:
          form.files.length > 0 || (editing?.evidence.length ?? 0) > 0 || (form.notice?.evidence.length ?? 0) > 0,
        today: view.today,
        editingPaymentId: editing?.id ?? null,
      },
      view.installments.map((i) => ({
        id: i.id,
        seq: i.seq,
        remaining:
          i.id === item.id && editing
            ? Math.max(Number(i.amount) - (i.progress.paidAmount - editingAmount), 0)
            : i.progress.remaining,
        payments: i.payments.map((p) => ({ id: p.id, paidOn: p.paidOn, amount: Number(p.amount) })),
      })),
    );
    const verifier = user?.role === "OWNER" ? "คุณ (เจ้าของกิจการ) หรือพนักงานอื่น" : "พนักงานอื่นหรือเจ้าของกิจการ";
    return (
      <div className="mt-3 rounded-md border border-slate-300 bg-white p-3">
        <p className="text-xs font-medium text-slate-500">ตรวจทานก่อนบันทึก</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
          {money(amount)} <span className="text-sm font-normal text-slate-500">บาท</span>
        </p>
        <p className="text-sm text-slate-600">
          งวดที่ {item.seq} · {item.milestone}
          <br />
          รับวันที่ {thaiDate(form.paidOn)} · {PAYMENT_METHOD_LABELS[form.method]}
          {Math.abs(net - amount) > 0.009 && (
            <>
              {" "}· เข้าบัญชีจริง <span className="tabular-nums">{money(net)}</span>
            </>
          )}
        </p>
        {warnings.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {warnings.map((w) => (
              <li key={w} className="flex gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
                {w}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-emerald-700">ไม่พบอะไรผิดสังเกต</p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          บันทึกแล้วจะเป็น "รอยืนยันกับบัญชี" — {verifier}ต้องเปิดแอปธนาคารเทียบแล้วกดยืนยัน จึงออกใบเสร็จได้และลูกค้าจะได้รับแจ้ง
        </p>
      </div>
    );
  }
  // ช่องเงินประกันโผล่เฉพาะสัญญาที่มีข้อนี้ (หรือเคยถูกกันแล้ว) — สัญญาอื่นหน้าตาเหมือนเดิมเป๊ะ
  const showRetention = view.retention.pct != null || view.retention.balance.held > 0;

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
          {view.retention.balance.outstanding > 0 && (
            <>
              {" "}
              · เงินประกันรอคืน{" "}
              <span className="tabular-nums text-slate-700">{money(view.retention.balance.outstanding)}</span>
            </>
          )}
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
        {/* แบบ B (ผู้ใช้เลือก 17 ต.ค.): ตัวเลขสามคอลัมน์ติดกันแบบสมุดบัญชี ยอดงวด | รับแล้ว | คงเหลือ
            วันครบกำหนดย้ายไปก่อนตัวเลข — เดิมคั่นกลางระหว่างยอดงวดกับรับแล้ว ตาต้องกระโดดข้ามช่องวันที่
            ยังไม่มีเงิน/ไม่เหลือแล้ว = "—" ไม่ใช่ 0.00 (0.00 ดูเหมือนตัวเลขจริงที่ต้องอ่าน) */}
        {/* iPad (<1280): วันครบกำหนดไปใต้เงื่อนไข · รับแล้วซ้อนใต้ยอดงวด · สถานะซ้อนใต้คงเหลือ — พอดีจอไม่ต้องปัดข้าง
            (ผู้ใช้สั่ง 18 ต.ค.) · คอมเป็นแบบ B สามคอลัมน์เหมือนเดิม */}
        <table className={`w-full text-sm ${narrow ? "" : "min-w-[52rem]"}`}>
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 pr-2 font-medium">งวด</th>
              <th className="py-2 pr-2 font-medium">{narrow ? "เงื่อนไข · ครบกำหนด" : "เงื่อนไข"}</th>
              {!narrow && <th className="py-2 pr-2 font-medium">ครบกำหนด</th>}
              <th className="whitespace-nowrap py-2 pr-2 text-right font-medium">{narrow ? "ยอด / รับแล้ว" : "ยอดงวด"}</th>
              {!narrow && <th className="py-2 pr-2 text-right font-medium">รับแล้ว</th>}
              <th className="py-2 pr-3 text-right font-medium">คงเหลือ</th>
              {!narrow && <th className="py-2 pr-2 font-medium">สถานะ</th>}
              <th className="py-2 font-medium"><span className="sr-only">คำสั่ง</span></th>
            </tr>
          </thead>
          <tbody>
            {view.installments.map((item) => {
              const p = item.progress;
              const invoice = item.documents.find((d) => d.type === "INVOICE" && !d.voidedAt);
              const formOpen = openFor === item.id && form != null;
              const next = nextStepOf(item, nextToBill, canVerify);
              const voidingDoc = voiding ? item.documents.find((d) => d.id === voiding) : undefined;
              const menu = rowMenuOf(item, next, formOpen);

              return (
                <Fragment key={item.id}>
                <tr className={`align-top ${formOpen ? "" : "border-b border-slate-100"}`}>
                  <td className="py-2.5 pr-2 tabular-nums text-slate-500">{item.seq}</td>
                  <td className="py-2.5 pr-2">
                    <p className="text-slate-800">{item.milestone}</p>
                    {narrow && (
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <span>ครบกำหนด</span>
                        <DateInput
                          aria-label={`วันครบกำหนดงวดที่ ${item.seq}`}
                          className={`${INPUT} w-36`}
                          value={item.dueOn ?? ""}
                          disabled={busy}
                          onChange={(v) => void changeDue(item.id, v)}
                        />
                      </div>
                    )}
                    <InstallmentInvoice
                      item={item}
                      today={view.today}
                      ctx={docCtx}
                      formOpen={invoiceFor === item.id}
                      onFormClose={() => setInvoiceFor(null)}
                    />
                    {renderPayments(item)}
                    <VoidedReceipts item={item} ctx={docCtx} />
                    {voidingDoc && (
                      <div className="mt-1.5">
                        <VoidForm doc={voidingDoc} ctx={docCtx} onClose={() => setVoiding(null)} />
                      </div>
                    )}
                    {!formOpen &&
                      item.pendingNotices.map((n) => (
                        <PaymentNoticeBox
                          key={n.id}
                          notice={n}
                          seq={item.seq}
                          expected={view ? receiptDefaultsOf(item, view.retention.pct).transfer : null}
                          busy={busy}
                          evidenceUrl={(evidenceId) => paymentNoticeEvidenceUrl(projectId, contractId, n.id, evidenceId)}
                          onConfirm={() => openAdd(item, n)}
                          onConfirmSlip={() => void confirmBySlip(item, n)}
                          onRecheckSlip={() => void recheckSlip(n.id)}
                          onReject={(reason) => rejectNotice(n.id, reason)}
                        />
                      ))}
                    {item.slipRejectedNotices.length > 0 && (
                      <SlipRejectedNotices
                        notices={item.slipRejectedNotices}
                        evidenceUrl={(noticeId, evidenceId) =>
                          paymentNoticeEvidenceUrl(projectId, contractId, noticeId, evidenceId)
                        }
                      />
                    )}
                  </td>
                  {!narrow && (
                    <td className="py-2.5 pr-2">
                      <DateInput
                        aria-label={`วันครบกำหนดงวดที่ ${item.seq}`}
                        className={`${INPUT} w-36`}
                        value={item.dueOn ?? ""}
                        disabled={busy}
                        onChange={(v) => void changeDue(item.id, v)}
                      />
                    </td>
                  )}
                  <td className="py-2.5 pr-2 text-right tabular-nums text-slate-700">
                    {money(Number(item.amount))}
                    {narrow && (
                      <span className="block whitespace-nowrap text-xs text-slate-500">
                        {p.paidAmount > 0 ? `รับ ${money(p.paidAmount)}` : "ยังไม่ได้รับ"}
                      </span>
                    )}
                  </td>
                  <PaidCell p={p} narrow={narrow} />
                  <RemainingCell p={p} narrow={narrow} />
                  <td className={`py-2.5 pr-2 ${narrow ? "hidden" : ""}`}>
                    <span
                      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}
                    >
                      {p.statusLabel}
                    </span>
                    {p.daysOverdue != null && (
                      <p className="mt-0.5 text-xs text-amber-700">เกินกำหนด {p.daysOverdue} วัน</p>
                    )}

                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {/* ขั้นถัดไปของงวด — ปุ่มเดียว (ไม่มี = ไม่มีอะไรต้องทำตอนนี้) */}
                      {next && !formOpen && invoiceFor !== item.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="whitespace-nowrap"
                          disabled={busy}
                          onClick={() => runNext(item, next)}
                        >
                          {next.label}
                        </Button>
                      )}
                      <RowMenu items={menu} label={`คำสั่งอื่นของงวดที่ ${item.seq}`} disabled={busy} />
                    </div>
                  </td>
                </tr>
                {/* ฟอร์มกางเต็มความกว้างใต้แถว — เดิมเบียดอยู่ในช่องเงื่อนไขจนช่องตกบรรทัด */}
                {formOpen && (
                  <tr className="border-b border-slate-100">
                    <td colSpan={narrow ? 5 : 8} className="pb-3">
                      {renderForm(item, invoice?.docNo ?? null)}
                    </td>
                  </tr>
                )}
                </Fragment>
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

      <RetentionPanel projectId={projectId} contractId={contractId} view={view} onChange={setView} />
    </div>
  );
}
