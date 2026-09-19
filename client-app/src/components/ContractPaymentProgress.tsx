import type {
  CustomerContractPaymentDto,
  InstallmentStatus,
  PaymentAccountDto,
} from "@systemboq/shared-types";
import { Check, ChevronDown, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { Collapsible } from "./Collapsible";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** วันที่ล้วน (YYYY-MM-DD) — อ่านเป็น UTC ให้ตรงกับคอลัมน์ DATE ที่เซิร์ฟเวอร์เก็บ */
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

/**
 * ปุ่มคัดลอกเลขบัญชี — ลูกค้าส่วนใหญ่โอนผ่านแอปธนาคารบนมือถือเครื่องเดียวกับที่เปิดหน้านี้
 * คัดลอกเฉพาะตัวเลข เพราะแอปธนาคารบางเจ้าไม่รับขีดที่ติดมากับเลขบัญชี
 */
function CopyDigits({ value, label }: Readonly<{ value: string; label: string }>) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          ?.writeText(value.replace(/\D/g, ""))
          .then(() => setCopied(true))
          // คัดลอกไม่ได้ (เบราว์เซอร์ไม่อนุญาต) — เลขยังอยู่บนจอให้จดเองได้ ไม่ต้องขึ้น error
          .catch(() => undefined);
      }}
      aria-label={`คัดลอก${label}`}
      className="inline-flex min-h-11 items-center gap-1 rounded-md px-1.5 font-medium text-brand transition-colors hover:bg-white lg:min-h-0 lg:py-0.5"
    >
      {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      {copied ? "คัดลอกแล้ว" : "คัดลอก"}
    </button>
  );
}

/** บัญชีที่ให้โอน — ขึ้นเฉพาะใต้สัญญาที่ยังมียอดค้าง (จ่ายครบแล้วไม่ต้องบอกว่าโอนไปที่ไหน) */
function PayTo({ account }: Readonly<{ account: PaymentAccountDto }>) {
  let branch: string | null = null;
  if (account.branch) branch = account.branch.startsWith("สาขา") ? account.branch : `สาขา${account.branch}`;
  return (
    <div className="mt-3 rounded-lg bg-slate-50/80 px-3 py-2.5 text-xs text-slate-600">
      <p className="font-medium text-slate-700">โอนชำระเข้าบัญชี</p>
      <p className="mt-1">
        {account.bankName}
        {branch && ` · ${branch}`}
      </p>
      <p>ชื่อบัญชี {account.accountName}</p>
      <p className="flex flex-wrap items-center gap-x-1">
        เลขที่บัญชี{" "}
        <span className="text-sm font-medium tabular-nums text-slate-800">{account.accountNo}</span>
        <CopyDigits value={account.accountNo} label="เลขที่บัญชี" />
      </p>
      {account.promptPay && (
        <p className="flex flex-wrap items-center gap-x-1">
          พร้อมเพย์{" "}
          <span className="text-sm font-medium tabular-nums text-slate-800">{account.promptPay}</span>
          <CopyDigits value={account.promptPay} label="เลขพร้อมเพย์" />
        </p>
      )}
    </div>
  );
}

/**
 * ความคืบหน้าการชำระเงินในมุมลูกค้า
 *
 * บรรทัดสรุปเห็นทันที ส่วนตารางงวดพับไว้ — คนส่วนใหญ่เปิดหน้านี้มาเพื่อดาวน์โหลดสัญญา
 * ไม่ใช่มาอ่านตารางเจ็ดแถว การกางไว้ตลอดจะดันปุ่มของสัญญาฉบับถัดไปตกจอไปเฉย ๆ
 */
export function ContractPaymentProgress({
  payment,
  payTo,
}: Readonly<{
  payment: CustomerContractPaymentDto;
  /** บัญชีรับเงินของบริษัท — null = บริษัทยังไม่ได้ตั้ง */
  payTo: PaymentAccountDto | null;
}>) {
  const [open, setOpen] = useState(false);
  const pct = payment.planTotal > 0 ? (payment.paidAmount / payment.planTotal) * 100 : 0;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="text-slate-600">
          ชำระแล้ว{" "}
          <span className="font-medium tabular-nums text-slate-800">{money(payment.paidAmount)}</span>{" "}
          จาก <span className="tabular-nums">{money(payment.planTotal)}</span> บาท
        </span>
        <span className="text-xs text-slate-500">
          {payment.paidCount} จาก {payment.totalCount} งวด
          {payment.remaining > 0 && (
            <> · คงเหลือ <span className="tabular-nums">{money(payment.remaining)}</span> บาท</>
          )}
        </span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>

      {payTo && payment.remaining > 0 && <PayTo account={payTo} />}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800 lg:min-h-0"
      >
        {open ? "ซ่อนรายละเอียดงวด" : "ดูรายละเอียดงวด"}
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      <Collapsible open={open}>
        <ul className="flex flex-col gap-2 pt-1">
          {payment.installments.map((item) => (
            <li
              key={item.seq}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg bg-slate-50/80 px-3 py-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <p className="text-slate-700">
                  <span className="text-slate-400">งวดที่ {item.seq}</span> {item.milestone}
                </p>
                <p className="mt-0.5 text-slate-400">
                  {item.dueOn ? `ครบกำหนด ${thaiDate(item.dueOn)}` : "ยังไม่ถึงกำหนด"}
                  {item.lastPaidOn && ` · ได้รับล่าสุด ${thaiDate(item.lastPaidOn)}`}
                  {item.daysOverdue != null && (
                    <span className="text-amber-700"> · เกินกำหนด {item.daysOverdue} วัน</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-baseline gap-2">
                <span className="tabular-nums text-slate-700">{money(Number(item.amount))}</span>
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[item.status]}`}
                >
                  {item.statusLabel}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Collapsible>
    </div>
  );
}
