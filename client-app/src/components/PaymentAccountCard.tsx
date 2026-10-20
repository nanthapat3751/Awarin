import type { PaymentAccountDto } from "@systemboq/shared-types";
import { Check, Copy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const ROW = "flex items-center justify-between gap-4 py-3";
const LABEL = "shrink-0 text-xs text-slate-500";

/**
 * แถวที่แตะทั้งแถวเพื่อคัดลอก (แบบ B — ผู้ใช้เลือก 18 ต.ค. แบบรายการในแอปธนาคาร)
 *
 * ลูกค้าส่วนใหญ่โอนผ่านแอปธนาคารบนมือถือเครื่องเดียวกับที่เปิดหน้านี้ — แถวทั้งแถวเป็นเป้ากด (สูง ≥ 44px)
 * ไม่ต้องเล็งปุ่มเล็ก · คัดลอกเฉพาะตัวเลข เพราะแอปธนาคารบางเจ้าไม่รับขีดที่ติดมากับเลขบัญชี
 * ไอคอนคัดลอกสีแบรนด์ข้างเลขคือสิ่งที่บอกว่าแถวนี้กดได้ (แถวธนาคาร/ชื่อบัญชีไม่มี = กดไม่ได้)
 */
function CopyRow({ label, value, children }: Readonly<{ label: string; value: string; children: ReactNode }>) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            ?.writeText(value.replace(/\D/g, ""))
            .then(() => setCopied(true))
            // คัดลอกไม่ได้ (เบราว์เซอร์ไม่อนุญาต) — เลขยังอยู่บนจอให้จดเองได้ ไม่ต้องขึ้น error
            .catch(() => undefined);
        }}
        aria-label={`คัดลอก${label} ${value}`}
        className={`${ROW} -mx-2 min-h-11 w-[calc(100%+1rem)] rounded-lg px-2 text-left transition-colors hover:bg-slate-50 active:bg-slate-100`}
      >
        <span className={LABEL}>{label}</span>
        <span className="flex min-w-0 items-center gap-2">
          {copied && (
            <span className="text-xs font-medium text-emerald-700" aria-hidden>
              คัดลอกแล้ว
            </span>
          )}
          {children}
          {copied ? (
            <Check size={15} className="shrink-0 text-emerald-700" aria-hidden />
          ) : (
            <Copy size={15} className="shrink-0 text-brand" aria-hidden />
          )}
        </span>
      </button>
      {/* โปรแกรมอ่านหน้าจอได้ยินผลการคัดลอก — ตัวหนังสือบนจออยู่ใน aria-label ของปุ่มที่อ่านไปแล้ว */}
      <span className="sr-only" aria-live="polite">
        {copied ? `คัดลอก${label}แล้ว` : ""}
      </span>
    </li>
  );
}

/**
 * บัญชีที่ให้โอน (โอนเองแทนการสแกน QR) — อยู่ในช่อง "โอนเข้าบัญชี" ของหน้าจ่ายงวด
 * รายการป้ายซ้าย/ค่าขวา เส้นคั่นบาง · เลขแสดงตามที่บริษัทพิมพ์ไว้ในหน้าตั้งค่า (แต่ละธนาคารวางขีดไม่เหมือนกัน)
 */
export function PaymentAccountCard({ account }: Readonly<{ account: PaymentAccountDto }>) {
  let branch: string | null = null;
  if (account.branch) branch = account.branch.startsWith("สาขา") ? account.branch : `สาขา${account.branch}`;
  return (
    <ul className="-my-3 divide-y divide-slate-100 text-sm">
      <li className={ROW}>
        <span className={LABEL}>ธนาคาร</span>
        <span className="min-w-0 text-right text-slate-800">
          {account.bankName}
          {branch && <span className="text-slate-500"> · {branch}</span>}
        </span>
      </li>
      <li className={ROW}>
        <span className={LABEL}>ชื่อบัญชี</span>
        <span className="min-w-0 text-right font-medium text-slate-900">{account.accountName}</span>
      </li>
      <CopyRow label="เลขที่บัญชี" value={account.accountNo}>
        <span className="text-base font-semibold tracking-wide tabular-nums text-slate-900">{account.accountNo}</span>
      </CopyRow>
      {account.promptPay && (
        <CopyRow label="พร้อมเพย์" value={account.promptPay}>
          <span className="font-medium tabular-nums text-slate-900">{account.promptPay}</span>
        </CopyRow>
      )}
    </ul>
  );
}
