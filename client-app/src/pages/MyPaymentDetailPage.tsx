import type { CustomerInstallmentOptionDto, CustomerPaymentDetailDto } from "@systemboq/shared-types";
import { billingDocLabel } from "@systemboq/shared-types";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Landmark,
  Loader2,
  Paperclip,
  QrCode,
  Receipt,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { PaymentAccountCard } from "../components/PaymentAccountCard";
import { FormAlert } from "../components/FormAlert";
import { PaymentNoticeForm, type SentNotice } from "../components/PaymentNoticeForm";
import { PortalPage } from "../components/PortalPage";
import { PaymentDetailSkeleton } from "../components/Skeleton";
import { billingDocViewerPath } from "../lib/document-pdf";
import { ApiError } from "../lib/api";
import { useConfirm } from "../lib/confirm-context";
import { cancelMyPaymentNotice, getMyPayment, myNoticeEvidenceUrl } from "../lib/my-api";
import { usePageMeta } from "../lib/page-meta";
import { money, thaiDate } from "../lib/payment-format";
import { describeFailure, isRetryable, type Failure } from "../lib/request-failure";

const BACK = { to: "/my/payments", label: "การชำระเงินทั้งหมด" };
const CARD = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";
const H2 = "text-lg font-semibold text-slate-900";

type Method = "qr" | "bank";

/** ป้ายขวาของแต่ละงวดในรายการเลือกงวด */
function optionBadge(o: CustomerInstallmentOptionDto): { label: string; className: string } {
  switch (o.state) {
    case "PAID":
      return { label: "ชำระแล้ว", className: "text-emerald-700" };
    case "NOTIFIED":
      return { label: "แจ้งโอนแล้ว รอตรวจ", className: "bg-sky-50 text-sky-700" };
    case "UPCOMING":
      return { label: "ยังไม่ถึงกำหนด", className: "text-slate-400" };
    case "DUE":
      if (o.daysOverdue != null) return { label: `เกินกำหนด ${o.daysOverdue} วัน`, className: "bg-amber-50 text-amber-800" };
      return {
        label: o.dueOn ? `ครบกำหนด ${thaiDate(o.dueOn)}` : "รอชำระ",
        className: "bg-amber-50 text-amber-800",
      };
  }
}

/**
 * เลือกงวดที่จะชำระ — งวดทั้งหมดของสัญญานี้ เลือกแล้วเปลี่ยนหน้าไปงวดนั้น (replace: ปุ่มย้อนกลับยังพากลับหน้ารวม)
 * งวดที่ยังไม่เรียกเก็บกดไม่ได้ — ไม่ชวนจ่ายก่อนเวลา · งวดที่จ่ายแล้วกดดูใบเสร็จได้
 */
function InstallmentPicker({
  options,
  selectedId,
  selectedToPay,
  loadingId,
}: Readonly<{
  options: CustomerInstallmentOptionDto[];
  selectedId: string;
  selectedToPay: number | null;
  /** งวดที่เพิ่งกดและกำลังโหลด — วงหมุนแทนวงกลมเลือก บอกว่าระบบรับการกดแล้ว */
  loadingId: string | null;
}>) {
  return (
    <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="งวดของสัญญานี้">
      {options.map((o) => {
        const selected = o.installmentId === selectedId;
        const badge = optionBadge(o);
        const disabled = o.state === "UPCOMING" && !selected;
        let mark: ReactNode = <span className="block h-5 w-5 rounded-full border border-slate-300" />;
        if (o.installmentId === loadingId) {
          mark = <Loader2 size={20} className="text-brand motion-safe:animate-spin" aria-hidden />;
        } else if (selected) {
          mark = (
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-brand">
              <span className="h-2 w-2 rounded-full bg-brand" />
            </span>
          );
        } else if (o.state === "PAID") {
          mark = (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Check size={12} strokeWidth={3} aria-hidden />
            </span>
          );
        }
        const inner = (
          <>
            <span className="shrink-0">{mark}</span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm ${selected ? "font-medium text-slate-900" : "text-slate-700"}`}>
                งวดที่ {o.seq} <span className={selected ? "font-normal text-slate-600" : "text-slate-500"}>· {o.milestone}</span>
              </span>
              <span className="block text-xs tabular-nums text-slate-400">{money(o.amount)} บาท</span>
              {/* มือถือ: การ์ดสรุปอยู่ล่าง QR — บอกยอดที่ต้องโอนจริงไว้ที่งวดที่เลือกด้วย */}
              {selected && selectedToPay != null && (
                <span className="mt-0.5 block text-sm font-semibold tabular-nums text-slate-900 lg:hidden">
                  ต้องโอน ฿{money(selectedToPay)}
                </span>
              )}
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
          </>
        );
        const row = `flex min-h-14 items-center gap-3 px-4 py-3 ${
          selected ? "relative z-10 bg-brand/[0.03] ring-2 ring-inset ring-brand" : ""
        }`;
        return (
          // แถวแรก/แถวสุดท้ายโค้งมุมตามกรอบนอก (12px − เส้นขอบ 1px) — กรอบนาวีของงวดที่เลือกเป็นวงแหวนด้านใน
          // ถ้าแถวเป็นมุมเหลี่ยม วงแหวนจะถูกมุมโค้งของกรอบนอกตัดจนดูหลุดกรอบ
          <li
            key={o.installmentId}
            className="border-b border-slate-100 last:border-b-0 first:*:rounded-t-[11px] last:*:rounded-b-[11px]"
          >
            {disabled ? (
              <div className={`${row} opacity-60`} aria-disabled="true">
                {inner}
              </div>
            ) : (
              <Link
                to={`/my/payments/${o.installmentId}`}
                replace
                aria-current={selected ? "page" : undefined}
                className={`${row} transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
                  selected ? "" : "hover:bg-slate-50"
                } ${o.state === "PAID" && !selected ? "opacity-75" : ""}`}
              >
                {inner}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** ช่องทางชำระ — การ์ดเลือก QR / โอนเข้าบัญชี แล้วแสดงรายละเอียดของที่เลือกด้านล่าง */
function PayMethods({ p, method, onMethod }: Readonly<{ p: CustomerPaymentDetailDto; method: Method; onMethod: (m: Method) => void }>) {
  const tiles: { id: Method; label: string; hint: string; icon: ReactNode }[] = [];
  if (p.payQr) tiles.push({ id: "qr", label: "QR พร้อมเพย์", hint: "ยอดใส่ไว้ใน QR แล้ว", icon: <QrCode size={18} aria-hidden /> });
  if (p.payTo) tiles.push({ id: "bank", label: "โอนเข้าบัญชี", hint: "คัดลอกเลขบัญชีไปวางในแอป", icon: <Landmark size={18} aria-hidden /> });

  if (tiles.length === 0) {
    return (
      <p className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        ยังไม่มีช่องทางโอนในระบบ — ติดต่อบริษัทเพื่อขอเลขบัญชี แล้วกลับมาแจ้งโอนพร้อมแนบสลิปที่หน้านี้
      </p>
    );
  }
  return (
    <>
      <div role="radiogroup" aria-label="ช่องทางชำระ" className={`mt-3 grid gap-3 ${tiles.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {tiles.map((t) => {
          const on = t.id === method;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onMethod(t.id)}
              className={`flex min-h-11 flex-col items-start gap-1.5 rounded-xl bg-white p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                on ? "ring-2 ring-brand" : "ring-1 ring-slate-200 hover:ring-slate-300"
              }`}
            >
              <span className={on ? "text-brand" : "text-slate-500"}>{t.icon}</span>
              <span>
                <span className={`block text-sm font-medium ${on ? "text-slate-900" : "text-slate-700"}`}>{t.label}</span>
                <span className="block text-xs text-slate-500">{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        {method === "qr" && p.payQr ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <img
              src={p.payQr.dataUrl}
              alt={`QR พร้อมเพย์ งวดที่ ${p.seq} ยอด ${money(p.payQr.amount)} บาท`}
              className="h-48 w-48 shrink-0"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 self-stretch text-sm text-slate-600">
              <p>สแกนด้วยแอปธนาคารใดก็ได้ ยอด {money(p.payQr.amount)} บาท ใส่ไว้ใน QR แล้ว</p>
              {p.payTo && (
                <p>
                  ก่อนกดยืนยันในแอป ตรวจว่าชื่อผู้รับเป็น{" "}
                  <span className="font-medium text-slate-900">{p.payTo.accountName}</span>
                </p>
              )}
              <p className="text-xs text-slate-500">ใช้มือถือเครื่องนี้จ่าย? บันทึกรูป QR แล้วเลือก “สแกนจากรูป” ในแอปธนาคาร</p>
              <a
                href={p.payQr.dataUrl}
                download={`promptpay-งวด${p.seq}.png`}
                className="mt-1 inline-flex min-h-11 items-center justify-center gap-1.5 self-start rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 lg:min-h-0 lg:py-1.5"
              >
                <Download size={15} aria-hidden /> บันทึกรูป QR
              </a>
            </div>
          </div>
        ) : (
          p.payTo && <PaymentAccountCard account={p.payTo} />
        )}
      </div>
    </>
  );
}

/** สรุปงวด (บนสุดของการ์ดขวา) — ยอดตัวใหญ่ + ที่มาของยอดแบบใบเสร็จ + วันครบกำหนด + ใบแจ้งหนี้ */
function Summary({ p }: Readonly<{ p: CustomerPaymentDetailDto }>) {
  const rows: [string, string][] = [[p.notBilledYet || p.paid ? "ยอดงวด" : `ยอดงวดที่ ${p.seq}`, money(p.installmentAmount)]];
  if (!p.notBilledYet && !p.paid) {
    if (p.breakdown.paidBefore > 0) rows.push(["หัก ชำระแล้ว", `−${money(p.breakdown.paidBefore)}`]);
    if (p.breakdown.retention) rows.push(["หัก เงินประกันผลงาน (คืนเมื่อพ้นระยะประกัน)", `−${money(p.breakdown.retention)}`]);
    if (p.breakdown.withholding) rows.push(["หัก ภาษี ณ ที่จ่าย", `−${money(p.breakdown.withholding)}`]);
  }
  if (p.dueOn && !p.paid) rows.push(["ครบกำหนด", thaiDate(p.dueOn)]);

  return (
    <div>
      <p className="text-sm text-slate-500">รายละเอียดงวด</p>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">งวดที่ {p.seq}</h2>
      <p className="text-sm text-slate-500">{p.milestone}</p>

      {p.paid ? (
        <p className="mt-4 flex items-center gap-2 text-xl font-semibold text-emerald-700">
          <CheckCircle2 size={24} aria-hidden /> ชำระครบแล้ว
        </p>
      ) : (
        <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
          <span className="text-3xl font-semibold tabular-nums text-slate-900">
            ฿{money(p.notBilledYet ? p.installmentAmount : p.amountToPay)}
          </span>
          <span className="text-sm text-slate-500">{p.notBilledYet ? "ยอดงวด" : "ต้องโอน"}</span>
        </p>
      )}
      {p.daysOverdue != null && !p.paid && (
        <p className="mt-1 text-sm font-medium text-amber-800">เกินกำหนด {p.daysOverdue} วัน</p>
      )}

      <dl className="mt-4 flex flex-col gap-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 text-slate-600">
            <dt>{label}</dt>
            <dd className="shrink-0 tabular-nums text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
      {p.invoice && (
        <Link
          to={billingDocViewerPath(p.contractId, p.invoice.id)}
          target="_blank"
          rel="noreferrer"
          className="link-pill -ml-2.5 mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand lg:min-h-0"
        >
          <FileText size={15} aria-hidden /> {billingDocLabel(p.invoice)} {p.invoice.docNo}
        </Link>
      )}

      {/* รับเงินแล้ว (บางส่วนหรือครบ) + ใบเสร็จ */}
      {(p.payments.length > 0 || p.receipts.length > 0) && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-900">บริษัทได้รับเงินแล้ว</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-600">
            {p.payments.map((pay) => (
              <li key={pay.id} className="flex justify-between gap-3">
                <span>{thaiDate(pay.paidOn)}</span>
                <span className="tabular-nums text-slate-800">{money(pay.amount)}</span>
              </li>
            ))}
          </ul>
          {p.receipts.length > 0 && (
            <p className="-ml-2.5 mt-2 flex flex-wrap gap-x-1">
              {p.receipts.map((r) => (
                <Link
                  key={r.id}
                  to={billingDocViewerPath(p.contractId, r.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="link-pill inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand lg:min-h-0"
                >
                  <Receipt size={14} aria-hidden /> {billingDocLabel(r)} {r.docNo}
                </Link>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * หน้าจ่ายงวด (แบบ D ที่ผู้ใช้เลือก 13 ต.ค. 2026) — ปลายทางของปุ่ม "จ่ายเลย" แจ้งเตือนใบแจ้งหนี้ และลิงก์ที่ทีมงานส่งให้
 * ซ้าย: เลือกงวดของสัญญานี้ → ช่องทางชำระ (QR / เลขบัญชี) · ขวา: การ์ดสรุปยอด + แจ้งโอนพร้อมสลิป + ปุ่มส่ง
 * มือถือเรียงลงมาตามลำดับเดียวกัน (เลือกงวด → จ่าย → แนบสลิป)
 */
export function MyPaymentDetailPage() {
  const { installmentId = "" } = useParams();
  const [p, setP] = useState<CustomerPaymentDetailDto | null>(null);
  // โหลดพังของงวดไหน — งวดที่พังไม่นับเป็น "กำลังโหลด" หน้าจึงกลับมากดได้ (เดิมค้างจางกดอะไรไม่ได้เลย)
  const [failed, setFailed] = useState<{ id: string; failure: Failure } | null>(null);
  const [justSent, setJustSent] = useState<SentNotice | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const confirm = useConfirm();
  usePageMeta(p ? `ชำระงวดที่ ${p.seq} · ${p.projectName}` : "ชำระเงิน");

  // นับรอบคำขอ — กดสลับงวดเร็ว ๆ แล้วคำตอบของงวดก่อนมาถึงทีหลัง ห้ามทับงวดล่าสุด
  // (ไม่งั้นข้อมูลไม่ตรงงวดใน URL หน้าจะค้างจางเหมือนกำลังโหลดตลอดไป)
  const seq = useRef(0);
  const load = useCallback(() => {
    const mine = ++seq.current;
    setFailed(null);
    return getMyPayment(installmentId)
      .then((res) => {
        if (mine === seq.current) setP(res.payment);
      })
      .catch((err) => {
        if (mine === seq.current) setFailed({ id: installmentId, failure: describeFailure(err, "โหลดข้อมูลงวดไม่สำเร็จ") });
      });
  }, [installmentId]);

  // เปลี่ยนงวด = เริ่มใหม่ (ช่องทางกลับเป็นค่าตั้งต้น ข้อความ "ส่งแล้ว" ของงวดก่อนไม่ติดมา)
  useEffect(() => {
    setJustSent(null);
    setMethod(null);
    setCancelError(null);
    void load();
  }, [load]);

  /** ยกเลิกการแจ้งของตัวเอง (ข้อ B) — แล้วฟอร์มแจ้งโอนกลับมาให้ส่งใหม่ทันที */
  async function cancelNotice(contractId: string, noticeId: string) {
    const ok = await confirm(
      "ยกเลิกการแจ้งโอนนี้? ใช้เมื่อแนบสลิปผิดใบหรือพิมพ์ยอดผิด — ยกเลิกแล้วแจ้งใหม่พร้อมสลิปที่ถูกต้องได้ทันที",
      { confirmLabel: "ยกเลิกการแจ้ง", cancelLabel: "ไม่ยกเลิก", variant: "danger" },
    );
    if (!ok) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelMyPaymentNotice(contractId, noticeId);
      setJustSent(null);
      await load();
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : "ยกเลิกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setCancelling(false);
    }
  }

  const subtitle = p ? `${p.projectName} · สัญญา ${p.contractNo}` : "รายละเอียดการชำระเงิน";

  const failureBox = failed && (
    <FormAlert
      kind={failed.failure.kind}
      message={failed.failure.message}
      focus={false}
      onRetry={isRetryable(failed.failure.kind) ? () => void load() : undefined}
    />
  );

  if (failed && !p) {
    return (
      <PortalPage title="ชำระเงิน" subtitle="รายละเอียดการชำระเงิน" back={BACK}>
        {failureBox}
      </PortalPage>
    );
  }
  if (!p) {
    return (
      <PortalPage title="ชำระเงิน" subtitle={subtitle} back={BACK} wide>
        <PaymentDetailSkeleton />
      </PortalPage>
    );
  }

  // กำลังโหลดงวดที่เพิ่งเลือก — คงหน้าเดิมไว้แบบจาง ๆ แทนการกระพริบเป็นโครงร่าง
  // โหลดงวดนั้นพังแล้ว = ไม่ใช่กำลังโหลด → หน้าเดิมกลับมากดได้ พร้อมกล่องแจ้งและปุ่มลองใหม่ด้านบน
  const stale = p.installmentId !== installmentId && failed?.id !== installmentId;
  const pending = p.notice?.status === "PENDING";
  const rejected = p.notice?.status === "REJECTED";
  const showPay = !p.paid && !p.notBilledYet && !pending && !justSent;
  const activeMethod: Method = method ?? (p.payQr ? "qr" : "bank");

  const rejectedBox = rejected && p.notice && (
    <div className="mt-4 flex gap-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-900">
      <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-600" aria-hidden />
      <div>
        <p className="font-medium">การแจ้งโอน {money(Number(p.notice.amount))} บาท ยังตรวจไม่พบเงินเข้า</p>
        {p.notice.rejectReason && <p className="mt-0.5">{p.notice.rejectReason}</p>}
        <p className="mt-1 text-rose-800">ตรวจรายการในแอปธนาคาร แล้วแจ้งโอนใหม่ด้านล่าง หรือติดต่อบริษัท</p>
      </div>
    </div>
  );

  // ส่งสำเร็จแล้วแต่ข้อมูลงวดยังโหลดไม่เสร็จ — ใช้ค่าที่ลูกค้าเพิ่งส่งแสดงไปก่อน (เดิมฟอร์มหายเฉย ๆ 1–2 วินาที)
  const shownNotice =
    pending && p.notice
      ? { amount: Number(p.notice.amount), paidOn: p.notice.paidOn, evidence: p.notice.evidence, fileCount: p.notice.evidence.length }
      : justSent && { amount: justSent.amount, paidOn: justSent.paidOn, evidence: null, fileCount: justSent.fileCount };

  let aside: ReactNode;
  if (p.canNotify && !justSent) {
    aside = (
      <PaymentNoticeForm
        key={p.installmentId}
        contractId={p.contractId}
        installmentId={p.installmentId}
        defaultAmount={p.amountToPay}
        summary={
          <>
            <Summary p={p} />
            {rejectedBox}
          </>
        }
        onSubmitted={(sent) => {
          setJustSent(sent);
          void load();
        }}
      />
    );
  } else {
    aside = (
      <div className={CARD}>
        <Summary p={p} />
        {p.notBilledYet && (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            ยังไม่ถึงกำหนดชำระงวดนี้ — บริษัทจะส่งใบแจ้งหนี้เมื่องานถึงงวด
          </p>
        )}
        {/* แจ้งโอนแล้ว — ลูกค้ากำลังรอคำตอบ */}
        {shownNotice && (
          <div role="status" className="mt-4 flex gap-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
            <Clock size={18} className="mt-0.5 shrink-0 text-sky-600" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium">
                แจ้งโอนแล้ว {money(shownNotice.amount)} บาท (โอนวันที่ {thaiDate(shownNotice.paidOn)})
              </p>
              <p className="mt-0.5 text-sky-800">
                {/* ระบบตรวจสลิปกับธนาคารผ่านแล้ว — แต่ยังไม่ใช่ "ชำระแล้ว" จนกว่าบริษัทกดยืนยัน (ไม่บอกเกินจริง) */}
                {pending && p.notice?.slipVerified
                  ? "ระบบตรวจสลิปกับธนาคารแล้ว รอบริษัทยืนยัน — งวดจะเปลี่ยนเป็นชำระแล้วเมื่อยืนยัน และคุณจะได้รับแจ้งเตือน"
                  : "รอบริษัทตรวจสอบกับบัญชี — งวดจะเปลี่ยนเป็นชำระแล้วเมื่อตรวจพบเงินเข้า และคุณจะได้รับแจ้งเตือน"}
              </p>
              <p className="-ml-2.5 mt-1 flex flex-wrap gap-x-1">
                {shownNotice.evidence && p.notice
                  ? shownNotice.evidence.map((e, i, all) => (
                      <a
                        key={e.id}
                        href={myNoticeEvidenceUrl(p.contractId, p.notice!.id, e.id)}
                        target="_blank"
                        rel="noopener"
                        className="link-pill inline-flex min-h-11 items-center gap-1 font-medium text-brand lg:min-h-0"
                      >
                        <Paperclip size={13} aria-hidden />
                        สลิปที่ส่ง{all.length > 1 ? ` ${i + 1}` : ""}
                      </a>
                    ))
                  : (
                    // ลิงก์เปิดสลิปมาพร้อมข้อมูลงวดชุดใหม่ — ระหว่างนี้บอกจำนวนไฟล์ที่ส่งไปแทน
                    <span className="inline-flex min-h-11 items-center gap-1 px-2.5 text-sky-800 lg:min-h-0">
                      <Paperclip size={13} aria-hidden /> แนบสลิป {shownNotice.fileCount} ไฟล์
                    </span>
                  )}
              </p>
              {/* ข้อ A: ยอดในสลิปตามธนาคารไม่ตรงกับที่กรอก — บอกทันที (ส่วนใหญ่คือแนบผิดใบ/พิมพ์ผิด) */}
              {pending && p.notice?.slipAmountMismatch && (
                <div className="mt-2 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
                  <p>
                    <span className="font-medium">
                      ยอดในสลิปคือ {money(Number(p.notice.slipAmountMismatch.slipAmount))} บาท ไม่ตรงกับที่คุณกรอก (
                      {money(shownNotice.amount)} บาท)
                    </span>
                    <span className="block text-amber-800">
                      ถ้าแนบสลิปผิดใบหรือพิมพ์ยอดผิด กด "ยกเลิกการแจ้งนี้" แล้วส่งใหม่ได้เลย
                    </span>
                  </p>
                </div>
              )}
              {/* ข้อ B: ยกเลิกเองได้ระหว่างที่บริษัทยังไม่ได้ตรวจ — ไม่ต้องรอพนักงานกด "ไม่ตรง" */}
              {pending && p.notice?.canCancel && (
                <div className="mt-2">
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={() => void cancelNotice(p.contractId, p.notice!.id)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 lg:min-h-9"
                  >
                    {cancelling ? "กำลังยกเลิก..." : "ยกเลิกการแจ้งนี้"}
                  </button>
                  {cancelError && <p className="mt-1 text-sm text-red-700">{cancelError}</p>}
                </div>
              )}
            </div>
          </div>
        )}
        {rejectedBox}
      </div>
    );
  }

  return (
    <PortalPage title="ชำระเงิน" subtitle={subtitle} back={BACK} wide>
      {failureBox && <div className="mb-4">{failureBox}</div>}
      <div
        aria-busy={stale}
        className={`grid gap-8 transition-opacity lg:grid-cols-12 ${stale ? "pointer-events-none opacity-60" : ""}`}
      >
        <div className="flex min-w-0 flex-col gap-8 lg:col-span-7">
          <section aria-labelledby="pick-heading">
            <h2 id="pick-heading" className={H2}>
              เลือกงวดที่จะชำระ
            </h2>
            <div className="mt-3">
              <InstallmentPicker
                options={p.installments}
                selectedId={stale ? installmentId : p.installmentId}
                selectedToPay={showPay && !stale ? p.amountToPay : null}
                loadingId={stale ? installmentId : null}
              />
            </div>
          </section>
          {showPay && (
            <section aria-labelledby="method-heading">
              <h2 id="method-heading" className={H2}>
                ชำระด้วย
              </h2>
              <PayMethods p={p} method={activeMethod} onMethod={setMethod} />
            </section>
          )}
        </div>
        <aside className="min-w-0 lg:col-span-5" aria-label="สรุปยอดและแจ้งโอน">
          {aside}
        </aside>
      </div>
    </PortalPage>
  );
}
