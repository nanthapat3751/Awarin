import type {
  ContractDto,
  ContractPaymentsViewDto,
} from "@systemboq/shared-types";
import { AlertTriangle, CalendarClock, ChevronRight } from "lucide-react";

// เงินตามสัญญาของโครงการเดียว — แดชบอร์ดตอบ "ทั้งบริษัทรอเก็บเท่าไร" ส่วนนี้ตอบ "งานนี้เก็บถึงไหน"
// ตัวเลขทุกตัวมาจาก GET .../payments ตัวเดียวกับแผงรับเงิน (ห้ามคิดเองที่หน้าจอ ไม่งั้นขัดกัน)

const money = (n: number) =>
  n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function thaiDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** สถานะเงินที่ต้องให้คนเห็น — นับแต่งวดที่ยังเก็บไม่ครบ (งวดที่รับครบแล้วไม่ต้องมีวัน) */
function moneyFacts(view: ContractPaymentsViewDto) {
  const unpaid = view.installments.filter((i) => i.progress.remaining > 0);
  const undated = unpaid.filter((i) => !i.dueOn).length;
  const next = unpaid
    .filter((i) => i.dueOn)
    .sort((a, b) => a.dueOn!.localeCompare(b.dueOn!))
    .find((i) => i.dueOn! >= view.today);
  const total = view.summary.planTotal;
  const pct =
    total > 0 ? Math.min(100, (view.summary.paidAmount / total) * 100) : 0;
  return { undated, next, total, pct };
}

/**
 * ส่วนในการ์ดสถานะของแท็บภาพรวม (ใต้ "ขั้นตอนถัดไป" เหนือไทม์ไลน์) — สัญญาที่ลงนามแล้วฉบับละหนึ่งบล็อก
 * ไม่ทำเป็นการ์ดแยกใต้ไทม์ไลน์ เพราะไทม์ไลน์ยาว ต้องเลื่อนไกลกว่าจะเจอเรื่องเงิน
 */
export function ContractMoneySummary({
  contracts,
  views,
  onOpen,
}: Readonly<{
  contracts: ContractDto[];
  views: Map<string, ContractPaymentsViewDto>;
  onOpen: (contractId: string) => void;
}>) {
  const signed = contracts.filter((c) => c.signedAt && views.has(c.id));
  if (signed.length === 0) return null;

  return (
    <div className="border-t border-slate-100 pt-4">
      <p className="text-sm font-medium text-slate-700">เงินตามสัญญา</p>
      <div className="divide-y divide-slate-100">
        {signed.map((c) => {
          const view = views.get(c.id)!;
          const { summary } = view;
          const header = (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs text-slate-500">{view.contractNo}</span>
              {view.contractAmount != null && (
                <button
                  type="button"
                  onClick={() => onOpen(c.id)}
                  className="link-pill -mr-2.5 flex items-center gap-0.5 text-xs font-medium text-brand"
                >
                  ติดตามรับเงิน <ChevronRight size={13} />
                </button>
              )}
            </div>
          );
          if (!view.hasPlan) {
            return (
              <div key={c.id} className="py-3 text-sm last:pb-0">
                {header}
                <p className="mt-1 text-slate-500">
                  {view.contractAmount == null
                    ? "สัญญาเก่าที่ไม่ได้บันทึกมูลค่าและงวดเงินไว้ — ยังติดตามรับเงินในระบบไม่ได้"
                    : "ยังไม่มีแผนงวดเงิน — ตั้งงวดก่อนจึงจะบันทึกรับเงินได้"}
                </p>
              </div>
            );
          }
          const { undated, next, total, pct } = moneyFacts(view);
          const retention = view.retention.balance.outstanding;
          return (
            <div key={c.id} className="py-3 last:pb-0">
              {header}
              <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <Stat label="มูลค่าสัญญา" value={money(total)} />
                <Stat
                  label={`เก็บแล้ว ${Math.round(pct)}% · ${summary.paidCount}/${summary.totalCount} งวด`}
                  value={money(summary.paidAmount)}
                />
                <Stat label="คงเหลือ" value={money(summary.remaining)} />
              </div>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
                aria-hidden
              >
                <div
                  className={`h-full rounded-full ${summary.overdueCount > 0 ? "bg-red-500" : "bg-emerald-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="mt-2 flex flex-col gap-1 text-xs">
                {summary.overdueCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    className="link-pill -ml-2.5 flex w-fit items-center gap-1.5 text-left font-medium text-red-700 hover:bg-red-50"
                  >
                    <AlertTriangle size={13} className="shrink-0" /> ค้างชำระ{" "}
                    {summary.overdueCount} งวด รวม{" "}
                    {money(summary.overdueAmount)} บาท
                  </button>
                )}
                {undated > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    className="link-pill -ml-2.5 flex w-fit items-center gap-1.5 text-left font-medium text-amber-700 hover:bg-amber-50"
                  >
                    <AlertTriangle size={13} className="shrink-0" /> {undated}{" "}
                    งวดยังไม่ตั้งวันครบกำหนด — ระบบจึงเตือนค้างชำระไม่ได้ ·
                    ตั้งวัน ›
                  </button>
                )}
                {next && (
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <CalendarClock
                      size={13}
                      className="shrink-0 text-slate-400"
                    />{" "}
                    งวดถัดไป: งวดที่ {next.seq} {next.milestone} ·{" "}
                    {thaiDate(next.dueOn!)} · {money(next.progress.remaining)}{" "}
                    บาท
                  </span>
                )}
                {retention > 0 && (
                  <span className="text-slate-500">
                    เงินประกันผลงานรอคืน {money(retention)} บาท
                  </span>
                )}
                {summary.remaining <= 0.005 && (
                  <span className="font-medium text-emerald-700">
                    เก็บครบทุกงวดแล้ว
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0 rounded-md bg-slate-50 px-2.5 py-1.5">
      <span className="block truncate text-[11px] text-slate-500">{label}</span>
      <span className="block truncate font-medium tabular-nums text-slate-800">
        {value}
      </span>
    </div>
  );
}
