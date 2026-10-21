import type {
  CustomerBillingDocDto,
  CustomerContractRetentionDto,
  CustomerDueItemDto,
  CustomerInstallmentOptionDto,
  CustomerPaymentsDto,
  CustomerUpcomingDto,
} from "@systemboq/shared-types";
import { billingDocLabel } from "@systemboq/shared-types";
import { Check, ChevronRight, FileText, Receipt } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { EmptyState } from "../components/EmptyState";
import { FormAlert } from "../components/FormAlert";
import { Pagination } from "../components/Pagination";
import { PortalPage } from "../components/PortalPage";
import { PaymentsSkeleton } from "../components/Skeleton";
import { billingDocViewerPath } from "../lib/document-pdf";
import { listMyPayments } from "../lib/my-api";
import { usePageMeta } from "../lib/page-meta";
import { money, thaiDate } from "../lib/payment-format";
import { describeFailure, isRetryable, type Failure } from "../lib/request-failure";

const CARD = "rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-sm sm:p-5";
/**
 * จำนวนต่อหน้าของแต่ละแท็บ — ข้อมูลมาครบในคำขอเดียว (ลูกค้าหนึ่งรายมีไม่กี่สิบรายการ) จึงแบ่งหน้าฝั่งเว็บ
 * การ์ดงวดถัดไป/เงินประกันสูง (มีตารางงวดในการ์ด) จึงต่อหน้าน้อยกว่า
 */
const PAGE_SIZE = { due: 10, upcoming: 5, retention: 5, history: 15 } as const;

type Tab = keyof typeof PAGE_SIZE;
const TAB_LABEL: Record<Tab, string> = {
  due: "ต้องชำระ",
  upcoming: "งวดถัดไป",
  retention: "เงินประกันผลงาน",
  history: "ประวัติการชำระ",
};

/** แบ่งหน้ารายการหนึ่งชุด — หน้าเกินจำนวนหน้า (ข้อมูลลดลงหลังโหลดใหม่) ถอยกลับหน้าสุดท้ายเอง */
function paged<T>(items: T[], page: number, size: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pageCount);
  const from = (current - 1) * size;
  return { page: current, pageCount, from, rows: items.slice(from, from + size), total: items.length };
}

/** "รายการ 1–15 จาก 40" — ขึ้นเมื่อมีมากกว่าหนึ่งหน้า */
function RangeNote({ from, count, total, show }: Readonly<{ from: number; count: number; total: number; show: boolean }>) {
  if (!show) return null;
  return (
    <p className="text-xs tabular-nums text-slate-500">
      รายการ {from + 1}–{from + count} จาก {total}
    </p>
  );
}

/** ป้ายสถานะของรายการที่ต้องชำระ — สถานะการแจ้งโอนสำคัญกว่าวันครบกำหนด (ลูกค้ากำลังรอคำตอบ) */
function dueStatus(item: CustomerDueItemDto): { label: string; className: string } {
  if (item.notice?.status === "PENDING") return { label: "แจ้งโอนแล้ว รอตรวจ", className: "bg-sky-100 text-sky-700" };
  if (item.notice?.status === "REJECTED") return { label: "ตรวจไม่พบเงินเข้า", className: "bg-rose-100 text-rose-700" };
  if (item.daysOverdue != null) return { label: `เกินกำหนด ${item.daysOverdue} วัน`, className: "bg-amber-100 text-amber-800" };
  return { label: "รอชำระ", className: "bg-slate-100 text-slate-600" };
}

function DueCard({ item }: Readonly<{ item: CustomerDueItemDto }>) {
  const status = dueStatus(item);
  const pending = item.notice?.status === "PENDING";
  return (
    <Link
      to={`/my/payments/${item.installmentId}`}
      className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-brand/40 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500">
          {item.projectName} · สัญญา {item.contractNo}
        </p>
        <p className="mt-0.5 font-medium text-slate-800">
          งวดที่ {item.seq} <span className="font-normal text-slate-600">{item.milestone}</span>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className={`rounded-full px-2 py-0.5 font-medium ${status.className}`}>{status.label}</span>
          {item.dueOn && <span>ครบกำหนด {thaiDate(item.dueOn)}</span>}
          {item.invoice && <span>ใบแจ้งหนี้ {item.invoice.docNo}</span>}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-base font-semibold tabular-nums text-slate-900">{money(item.amountToPay)}</span>
        <span
          className={`inline-flex items-center gap-0.5 rounded-md px-3 py-1.5 text-xs font-medium ${
            pending
              ? "border border-slate-300 text-slate-600"
              : "bg-slate-800 text-white group-hover:bg-slate-900"
          }`}
        >
          {pending ? "ดูรายละเอียด" : "จ่ายเลย"}
          <ChevronRight size={14} aria-hidden />
        </span>
      </div>
    </Link>
  );
}

/** ไม่มียอดค้าง — ตอบคำถามแรกของลูกค้า ("ต้องจ่ายอะไรไหม") ทันทีที่เปิดหน้า แทนการ์ดเปล่าที่เขียนว่า "ไม่มี" */
function AllClearBanner() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 sm:px-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        <Check size={22} strokeWidth={2.5} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-emerald-900">ไม่มียอดที่ต้องชำระตอนนี้</p>
        <p className="text-sm text-emerald-800">เมื่อถึงงวด บริษัทจะส่งใบแจ้งหนี้ และคุณจะได้รับแจ้งเตือน</p>
      </div>
    </div>
  );
}

/** สถานะของแต่ละงวดในไทม์ไลน์: จุด + ข้อความสั้น (งวดถัดไปที่ยังไม่เรียกเก็บเน้นด้วยวงฟ้า) */
function timelineMark(o: CustomerInstallmentOptionDto, isNext: boolean): { dot: ReactNode; note: ReactNode } {
  switch (o.state) {
    case "PAID":
      return {
        dot: (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Check size={12} strokeWidth={3} aria-hidden />
          </span>
        ),
        note: <span className="text-emerald-700">ชำระแล้ว</span>,
      };
    case "NOTIFIED":
      return {
        dot: <span className="m-1 block h-3 w-3 rounded-full bg-sky-500" />,
        note: <span className="text-sky-700">แจ้งโอนแล้ว รอตรวจ</span>,
      };
    case "DUE":
      return {
        dot: <span className="m-1 block h-3 w-3 rounded-full bg-amber-500" />,
        note: (
          <span className="text-amber-800">
            {dueText(o.daysOverdue, o.dueOn)}
          </span>
        ),
      };
    case "UPCOMING":
      return isNext
        ? {
            dot: <span className="block h-5 w-5 rounded-full border-4 border-white bg-sky-500 ring-2 ring-sky-200" />,
            note: <span className="text-sky-700">งวดถัดไป · รอใบแจ้งหนี้</span>,
          }
        : { dot: <span className="m-1 block h-3 w-3 rounded-full bg-slate-300" />, note: null };
  }
}

/** แสดงก่อนพับ — งวดที่จ่ายแล้วล่าสุดหนึ่งงวด (ให้เห็นว่ามาถึงไหนแล้ว) + งวดถัดจากนั้น */
const COLLAPSED_ROWS = 4;

/**
 * ตารางงวดทั้งสัญญาแบบไทม์ไลน์ (แบบ C) — ต่อใต้การ์ดงวดถัดไป ให้รู้ล่วงหน้าว่างวดต่อ ๆ ไปเท่าไร
 * งวดที่เรียกเก็บแล้ว/จ่ายแล้วกดไปหน้าจ่ายงวดนั้นได้ · งวดที่ยังไม่เรียกเก็บเป็นข้อมูลเฉย ๆ
 */
function ScheduleTimeline({ items, nextSeq }: Readonly<{ items: CustomerInstallmentOptionDto[]; nextSeq: number }>) {
  const [expanded, setExpanded] = useState(false);
  const firstOpen = items.findIndex((o) => o.state !== "PAID");
  const start = Math.max(0, (firstOpen < 0 ? items.length : firstOpen) - 1);
  const collapsible = items.length > COLLAPSED_ROWS + 1;
  const shown = !collapsible || expanded ? items : items.slice(start, start + COLLAPSED_ROWS);
  const hiddenCount = items.length - shown.length;

  return (
    <div>
      <p className="text-xs font-medium text-slate-500">ตารางงวดทั้งหมด · {items.length} งวด</p>
      <ol className="mt-3">
        {shown.map((o, i) => {
          const isNext = o.state === "UPCOMING" && o.seq === nextSeq;
          const { dot, note } = timelineMark(o, isNext);
          const strong = isNext || o.state === "DUE" || o.state === "NOTIFIED";
          const last = i === shown.length - 1 && (!collapsible || hiddenCount === 0);
          const body = (
            <span className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <span className="min-w-0">
                <span className={`block text-sm ${strong ? "font-medium text-slate-900" : "text-slate-600"}`}>
                  งวดที่ {o.seq} · {o.milestone}
                </span>
                {note && <span className="block text-xs">{note}</span>}
              </span>
              <span className={`shrink-0 text-sm tabular-nums ${strong ? "font-medium text-slate-900" : "text-slate-500"}`}>
                {money(o.amount)}
              </span>
            </span>
          );
          return (
            <li key={o.installmentId} className="relative flex gap-3 pb-4 last:pb-0">
              {/* เส้นเชื่อมจุด — ลากจากใต้จุดนี้ถึงจุดถัดไป */}
              {!last && <span aria-hidden className="absolute bottom-0 left-[9px] top-6 w-0.5 bg-slate-200" />}
              <span className="relative shrink-0 pt-0.5">{dot}</span>
              {o.state === "UPCOMING" ? (
                body
              ) : (
                <Link
                  to={`/my/payments/${o.installmentId}`}
                  className="-mx-2 -my-1 flex min-w-0 flex-1 rounded-md px-2 py-1 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand"
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="link-pill ml-5.5 mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand lg:min-h-0"
        >
          {expanded ? "ย่อ" : `+ ดูทั้งหมด ${items.length} งวด`}
        </button>
      )}
    </div>
  );
}

/**
 * การ์ดงวดถัดไปของหนึ่งสัญญา (แบบ D — ผู้ใช้เลือก 16 ต.ค.) หัว "งวดที่ N จาก M" + ป้ายสถานะ
 * ใต้เส้นคั่นเป็นตารางสองคอลัมน์ งาน/สัญญา/ยอด — ชื่องานยาวไม่แย่งความเด่นกับหัวอีก · ไทม์ไลน์งวดทั้งสัญญาด้านล่าง
 */
function UpcomingCard({
  u,
  schedule,
}: Readonly<{ u: CustomerUpcomingDto; schedule: CustomerInstallmentOptionDto[] | undefined }>) {
  // "จาก M" นับจากตารางงวดจริงของสัญญา — ไม่มีตารางก็ไม่เดา
  const total = schedule?.length ?? 0;
  return (
    <article className={CARD}>
      <div className="-mx-4 -mt-1 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 pb-3 sm:-mx-5 sm:px-5">
        <h3 className="text-base font-semibold text-slate-900">
          งวดที่ {u.seq}
          {total > 1 && <span className="font-normal text-slate-500"> จาก {total}</span>}
        </h3>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          ยังไม่ต้องชำระ · รอใบแจ้งหนี้
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
        <dt className="text-slate-500">งาน</dt>
        <dd className="leading-relaxed text-slate-800">{u.milestone}</dd>
        <dt className="text-slate-500">สัญญา</dt>
        <dd className="text-slate-800">
          {u.contractNo} <span className="text-slate-500">· {u.projectName}</span>
        </dd>
        <dt className="self-center text-slate-500">ยอดงวดนี้</dt>
        <dd className="text-xl font-semibold tabular-nums text-slate-900">฿{money(u.amount)}</dd>
      </dl>
      {schedule && schedule.length > 1 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <ScheduleTimeline items={schedule} nextSeq={u.seq} />
        </div>
      )}
    </article>
  );
}

/**
 * การชำระเงิน (แบบ A + ไทม์ไลน์ของแบบ C — ผู้ใช้เลือก 13 ต.ค. 2026)
 * บนสุดตอบว่า "ต้องจ่ายไหม": มียอดค้าง = รายการให้กดจ่าย · ไม่มี = แถบเขียว
 * ต่อด้วยงวดถัดไปของแต่ละสัญญา (การ์ดเด่น + ตารางงวด) และประวัติ/ใบเสร็จ — ส่วนที่ว่างเหลือบรรทัดเดียว ไม่เป็นการ์ดเปล่า
 */
/** ลิงก์เปิดใบแจ้งหนี้/ใบเสร็จ — relative z-10 ให้กดได้แม้อยู่ในแถวที่ทั้งแถวเป็นลิงก์ใบเสร็จ */
function DocLink({ contractId, doc }: Readonly<{ contractId: string; doc: CustomerBillingDocDto }>) {
  const Icon = doc.type === "INVOICE" ? FileText : Receipt;
  return (
    <Link
      to={billingDocViewerPath(contractId, doc.id)}
      target="_blank"
      rel="noreferrer"
      className="link-pill relative z-10 -ml-2.5 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand lg:min-h-0"
    >
      <Icon size={12} aria-hidden />
      {billingDocLabel(doc)} {doc.docNo}
    </Link>
  );
}

/**
 * เงินประกันผลงาน — เงินที่ลูกค้าหักไว้จากทุกงวด และต้องคืนให้บริษัทเมื่อพ้นประกัน
 * บอกตรง ๆ ว่ายอดนี้ไม่ใช่หนี้ค้างของงวด (งวดที่ถูกหักแสดงว่าชำระครบแล้ว)
 * ย้ายมาจากหน้าสัญญา 18 ต.ค. — เป็นเรื่องเงิน จึงอยู่หน้าการชำระเงิน
 */
function RetentionCard({ r, showContract }: Readonly<{ r: CustomerContractRetentionDto; showContract: boolean }>) {
  const { retention } = r;
  let dueNote = "";
  if (retention.outstanding > 0) {
    dueNote = retention.dueOn ? `ครบกำหนดคืน ${thaiDate(retention.dueOn)}` : "ชำระคืนเมื่อพ้นระยะรับประกันผลงาน";
  } else if (retention.held > 0) dueNote = "คืนครบแล้ว";
  return (
    <div className={`${CARD} text-sm`}>
      {showContract && (
        <p className="mb-1 text-xs text-slate-500">
          {r.projectName} · สัญญา {r.contractNo}
        </p>
      )}
      <p className="text-slate-700">
        หักไว้แล้ว <span className="font-semibold tabular-nums text-slate-900">{money(retention.held)}</span> บาท
        {retention.pct != null && <span className="text-slate-500"> ({retention.pct}% ของแต่ละงวด)</span>}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">
        {retention.released > 0 && (
          <>
            ชำระคืนแล้ว <span className="tabular-nums">{money(retention.released)}</span> บาท{dueNote && " · "}
          </>
        )}
        {dueNote}
      </p>
      <p className="mt-1 text-xs text-slate-500">ยอดนี้ไม่ใช่ยอดค้างชำระ — งวดที่ถูกหักไว้นับว่าชำระครบแล้ว</p>
      {retention.documents.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-x-1">
          {retention.documents.map((d) => (
            <DocLink key={d.id} contractId={r.contractId} doc={d} />
          ))}
        </p>
      )}
    </div>
  );
}

type PanelProps = Readonly<{ data: CustomerPaymentsDto; page: number; onPage: (page: number) => void }>;

function DuePanel({ data, page, onPage }: PanelProps) {
  if (data.due.length === 0) return <AllClearBanner />;
  const v = paged(data.due, page, PAGE_SIZE.due);
  return (
    <section aria-label="ต้องชำระ">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-slate-600">
          รวม <span className="text-lg font-semibold tabular-nums text-slate-900">{money(data.totalToPay)}</span> บาท
          {data.overdueCount > 0 && <span className="ml-2 text-xs text-amber-800">· เกินกำหนด {data.overdueCount} รายการ</span>}
        </p>
        <RangeNote from={v.from} count={v.rows.length} total={v.total} show={v.pageCount > 1} />
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {v.rows.map((item) => (
          <DueCard key={item.installmentId} item={item} />
        ))}
      </div>
      <Pagination page={v.page} pageCount={v.pageCount} onChange={onPage} />
    </section>
  );
}

function UpcomingPanel({ data, page, onPage }: PanelProps) {
  if (data.upcoming.length === 0) {
    return <p className="text-sm text-slate-500">ไม่มีงวดที่รอเรียกเก็บ — ทุกงวดเรียกเก็บแล้วหรือชำระครบแล้ว</p>;
  }
  const v = paged(data.upcoming, page, PAGE_SIZE.upcoming);
  return (
    <section aria-label="งวดถัดไป">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-slate-500">งวดที่ยังไม่ถึงคิวเรียกเก็บ — ยังไม่ต้องชำระ บริษัทจะส่งใบแจ้งหนี้เมื่อถึงงวด</p>
        <RangeNote from={v.from} count={v.rows.length} total={v.total} show={v.pageCount > 1} />
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {v.rows.map((u) => (
          <UpcomingCard key={u.contractId} u={u} schedule={data.schedules.find((x) => x.contractId === u.contractId)?.installments} />
        ))}
      </div>
      <Pagination page={v.page} pageCount={v.pageCount} onChange={onPage} />
    </section>
  );
}

function RetentionPanel({ data, page, onPage }: PanelProps) {
  const v = paged(data.retentions, page, PAGE_SIZE.retention);
  return (
    <section aria-label="เงินประกันผลงาน">
      <RangeNote from={v.from} count={v.rows.length} total={v.total} show={v.pageCount > 1} />
      <div className="mt-1 flex flex-col gap-3">
        {v.rows.map((r) => (
          <RetentionCard key={r.contractId} r={r} showContract={data.schedules.length > 1} />
        ))}
      </div>
      <Pagination page={v.page} pageCount={v.pageCount} onChange={onPage} />
    </section>
  );
}

function HistoryPanel({ data, page, onPage }: PanelProps) {
  if (data.history.length === 0) {
    return <p className="text-sm text-slate-500">ยังไม่มีรายการ — ใบเสร็จจะอยู่ที่นี่หลังบริษัทยืนยันรับเงิน</p>;
  }
  const v = paged(data.history, page, PAGE_SIZE.history);
  return (
    <section aria-label="ประวัติการชำระ">
      <div className="flex justify-end">
        <RangeNote from={v.from} count={v.rows.length} total={v.total} show={v.pageCount > 1} />
      </div>
      <ul className={`${CARD} mt-1 flex flex-col divide-y divide-slate-100 py-2 sm:py-2`}>
        {v.rows.map((h) => (
          // ทั้งแถวกดเปิดใบเสร็จได้ (ผู้ใช้สั่ง 18 ต.ค.) — ลิงก์ใบเสร็จยืดคลุมแถวด้วย after:inset-0
          // ไม่ห่อทั้งแถวด้วย <a> เพราะใบแจ้งหนี้ในแถวต้องกดแยกได้ (ลิงก์ซ้อนลิงก์ไม่ได้)
          // -mx-2/px-2 ให้พื้นตอนชี้ยื่นออกจากตัวหนังสือนิดหนึ่ง ยังอยู่ในขอบการ์ด (p-4)
          <li
            key={h.id}
            className={`relative -mx-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-2 py-2.5 text-sm ${
              h.receipt ? "group transition-colors hover:bg-slate-50 has-[a:active]:bg-slate-100" : ""
            }`}
          >
            <div className="min-w-0">
              <p className="text-slate-700">
                งวดที่ {h.seq} <span className="text-slate-500">· {h.projectName}</span>
              </p>
              <p className="text-xs text-slate-500">
                ชำระ {thaiDate(h.paidOn)} · สัญญา {h.contractNo}
              </p>
              {h.invoice && <DocLink contractId={h.contractId} doc={h.invoice} />}
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums text-slate-800">{money(h.amount)}</span>
              {h.receipt ? (
                <Link
                  to={billingDocViewerPath(h.contractId, h.receipt.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="link-pill -mr-2.5 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand after:absolute after:inset-0 after:rounded-lg group-hover:bg-brand/[0.08] lg:min-h-0"
                >
                  <Receipt size={13} aria-hidden />
                  {billingDocLabel(h.receipt)}
                </Link>
              ) : (
                <span className="text-xs text-slate-400">รอออกใบเสร็จ</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Pagination page={v.page} pageCount={v.pageCount} onChange={onPage} />
    </section>
  );
}

export function MyPaymentsPage() {
  usePageMeta("การชำระเงิน");
  const [data, setData] = useState<CustomerPaymentsDto | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  // แท็บอยู่ใน ?tab= — ลิงก์ตรงเข้าแท็บได้ และกดย้อนกลับไม่หลุดออกจากหน้า (replace ไม่สร้างประวัติทุกครั้งที่สลับ)
  const [searchParams, setSearchParams] = useSearchParams();
  const [pages, setPages] = useState<Record<Tab, number>>({ due: 1, upcoming: 1, retention: 1, history: 1 });
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  // นับรอบคำขอ — ใช้เฉพาะคำตอบของรอบล่าสุด (กดลองใหม่ซ้อน/StrictMode ยิงสองรอบ คำตอบที่มาช้าห้ามทับ)
  const seq = useRef(0);

  // แยกเหตุตามชนิด (เน็ตหลุด/ระบบขัดข้อง = กดลองใหม่ได้) — เดิมทุกกรณีขึ้น "ลองเข้าสู่ระบบใหม่" แม้แค่เน็ตหลุด
  const load = useCallback(() => {
    const mine = ++seq.current;
    setFailure(null);
    listMyPayments()
      .then((res) => {
        if (mine === seq.current) setData(res.payments);
      })
      .catch((err) => {
        if (mine === seq.current) setFailure(describeFailure(err, "โหลดข้อมูลการชำระเงินไม่สำเร็จ"));
      });
  }, []);

  useEffect(load, [load]);

  const noContracts = data?.due.length === 0 && data.upcoming.length === 0 && data.history.length === 0;
  // แท็บเงินประกันขึ้นเฉพาะลูกค้าที่มีสัญญาที่มีเงินประกันผลงาน
  const tabs: Tab[] = data && data.retentions.length > 0 ? ["due", "upcoming", "retention", "history"] : ["due", "upcoming", "history"];
  const asked = searchParams.get("tab") as Tab | null;
  const tab: Tab = asked && tabs.includes(asked) ? asked : "due";
  const counts: Record<Tab, number> = {
    due: data?.due.length ?? 0,
    upcoming: data?.upcoming.length ?? 0,
    retention: data?.retentions.length ?? 0,
    history: data?.history.length ?? 0,
  };

  function selectTab(next: Tab, focus = false) {
    setSearchParams(next === "due" ? {} : { tab: next }, { replace: true });
    if (focus) tabRefs.current[next]?.focus();
  }

  // ลูกศรซ้าย/ขวา/Home/End สลับแท็บ (แพตเทิร์น tablist มาตรฐาน)
  function onTabKey(e: React.KeyboardEvent) {
    const i = tabs.indexOf(tab);
    const target =
      { ArrowRight: tabs[(i + 1) % tabs.length], ArrowLeft: tabs[(i - 1 + tabs.length) % tabs.length], Home: tabs[0], End: tabs.at(-1) }[
        e.key
      ];
    if (!target) return;
    e.preventDefault();
    selectTab(target, true);
  }

  // เปลี่ยนหน้า = เลื่อนกลับหัวแท็บ (ปุ่มเลขหน้าอยู่ท้ายรายการ ถ้าไม่เลื่อน ลูกค้าจะเห็นท้ายหน้าใหม่ก่อน)
  function changePage(which: Tab, next: number) {
    setPages((prev) => ({ ...prev, [which]: next }));
    const el = panelRef.current;
    if (!el) return;
    const navH =
      Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--nav-h"), 10) || 64;
    const top = el.getBoundingClientRect().top + window.scrollY - navH - 16;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: Math.max(0, top), behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <PortalPage title="การชำระเงิน" subtitle="ยอดที่ต้องชำระ งวดถัดไป และใบเสร็จของทุกสัญญา">
      {!data && !failure && <PaymentsSkeleton />}
      {failure && (
        <FormAlert
          kind={failure.kind}
          message={failure.message}
          focus={false}
          onRetry={isRetryable(failure.kind) ? load : undefined}
        />
      )}
      {noContracts && (
        <EmptyState
          title="ยังไม่มีรายการชำระเงิน"
          description="เมื่อลงนามสัญญาแล้ว งวดที่ต้องชำระและใบเสร็จจะแสดงที่นี่"
        />
      )}

      {data && !noContracts && (
        <div>
          {/* แบบ A (ผู้ใช้เลือก 19 ต.ค.): แท็บแทนหน้ายาว — เห็นทีละเรื่อง แต่ละแท็บแบ่งหน้าเอง */}
          <div
            role="tablist"
            aria-label="การชำระเงิน"
            // เส้นฐานเป็นเงาด้านใน ไม่ใช่ border + -mb-px — กันแถบเลื่อนแนวตั้ง 1px บน Windows (เคยเจอที่ฝั่งพนักงาน)
            className="-mx-4 flex gap-1 overflow-x-auto overflow-y-hidden px-4 shadow-[inset_0_-1px_0_var(--color-slate-200)] [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((t) => {
              const on = t === tab;
              return (
                <button
                  key={t}
                  ref={(el) => {
                    tabRefs.current[t] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`pay-tab-${t}`}
                  aria-selected={on}
                  aria-controls="pay-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => selectTab(t)}
                  onKeyDown={onTabKey}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
                    on ? "border-brand font-semibold text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {TAB_LABEL[t]}
                  {counts[t] > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                        t === "due" && on ? "bg-brand text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {counts[t]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div ref={panelRef} id="pay-panel" role="tabpanel" aria-labelledby={`pay-tab-${tab}`} className="scroll-mt-24 pt-5">
            {tab === "due" && <DuePanel data={data} page={pages.due} onPage={(n) => changePage("due", n)} />}
            {tab === "upcoming" && (
              <UpcomingPanel data={data} page={pages.upcoming} onPage={(n) => changePage("upcoming", n)} />
            )}
            {tab === "retention" && (
              <RetentionPanel data={data} page={pages.retention} onPage={(n) => changePage("retention", n)} />
            )}
            {tab === "history" && (
              <HistoryPanel data={data} page={pages.history} onPage={(n) => changePage("history", n)} />
            )}
          </div>
        </div>
      )}
    </PortalPage>
  );
}

function dueText(daysOverdue: number | null, dueOn: string | null) {
  if (daysOverdue != null) return `เกินกำหนด ${daysOverdue} วัน`;
  return dueOn ? `ต้องชำระ · ครบกำหนด ${thaiDate(dueOn)}` : "ต้องชำระ";
}
