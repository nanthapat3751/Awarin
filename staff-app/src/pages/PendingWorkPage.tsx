import { ArrowDown, ArrowUp, ChevronRight, CircleCheckBig } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { PendingWorkDto } from "@systemboq/shared-types";

import { buttonClasses } from "../components/Button";
import { Layout } from "../components/Layout";
import { Pagination } from "../components/Pagination";
import { PageHeader } from "../components/PageHeader";
import { ApiError } from "../lib/api";
import { getPendingWork } from "../lib/dashboard-api";
import { setPendingBadge } from "../lib/pending-count";
import {
  buildPendingItems,
  LEVEL_LABEL,
  LEVEL_ORDER,
  type PendingItem,
  type PendingLevel,
} from "../lib/pending-items";
import { rowNavClass, stopRowNav, useRowNav } from "../lib/row-nav";
import { ListSkeleton } from "../components/Skeleton";

// หน้างานที่รอดำเนินการ — แบบ C ตารางรายการ (ผู้ใช้เลือก 18 ต.ค. แทนแบบ A การ์ดรายระดับที่อ่านยาก)
// ตารางเดียวทุกระดับ: เรื่อง (จุดสีบอกความเร่ง) · โครงการ · รายละเอียด · ยอด · รอมา · ปุ่มทำต่อ
// ค่าเริ่มต้นเรียงตามความเร่ง (เร่ง → ควรทำวันนี้ → ติดตาม) กดหัว "ยอด"/"รอมา" เรียงใหม่ได้ · เกณฑ์ระดับอยู่ที่ lib/pending-items.ts

/** สีของแต่ละระดับ — เขียนคลาสเต็มเพราะ Tailwind อ่านได้เฉพาะ literal */
const LEVEL_STYLE: Record<PendingLevel, { dot: string }> = {
  urgent: { dot: "bg-red-600" },
  soon: { dot: "bg-amber-500" },
  watch: { dot: "bg-slate-400" },
};

const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Filter = PendingLevel | "all";
type SortField = "amount" | "days";
/** null = เรียงตามความเร่ง (ลำดับจาก buildPendingItems) */
type Sort = { field: SortField; dir: "asc" | "desc" } | null;

/** ค่าที่ไม่มี (ไม่มียอด/ไม่มีอายุ) อยู่ท้ายเสมอไม่ว่าจะเรียงทางไหน — ไม่ทำเหมือนเป็นศูนย์ */
function sortItems(list: PendingItem[], sort: Sort): PendingItem[] {
  if (!sort) return list;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const x = a[sort.field];
    const y = b[sort.field];
    if (x == null || y == null) return (x == null ? 1 : 0) - (y == null ? 1 : 0);
    return (x - y) * sign;
  });
}

function ageText(days: number | null): string {
  if (days == null) return "—";
  return days === 0 ? "วันนี้" : `${days} วัน`;
}

function SortHeader({
  field,
  label,
  sort,
  onSort,
}: Readonly<{ field: SortField; label: string; sort: Sort; onSort: (field: SortField) => void }>) {
  const active = sort?.field === field;
  let ariaSort: "ascending" | "descending" | "none" = "none";
  if (active) ariaSort = sort.dir === "asc" ? "ascending" : "descending";
  return (
    <th className="whitespace-nowrap px-3 py-2 text-right" aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-slate-900 ${
          active ? "font-semibold text-slate-900" : ""
        }`}
      >
        {label}
        {active && (sort.dir === "asc" ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
      </button>
    </th>
  );
}

/** หน้าละ 15 งาน (ผู้ใช้สั่ง) — นับข้ามระดับ เรียงก่อนแล้วค่อยตัดหน้า */
const PAGE_SIZE = 15;

function ItemRow({ item, rowNav }: Readonly<{ item: PendingItem; rowNav: ReturnType<typeof useRowNav> }>) {
  return (
    <tr {...rowNav(item.href)} className={`group border-t border-slate-100 align-top ${rowNavClass}`}>
      <td className="px-3 py-2.5">
        <span className="flex items-start gap-2">
          <span
            aria-hidden
            title={LEVEL_LABEL[item.level]}
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${LEVEL_STYLE[item.level].dot}`}
          />
          <span className="sr-only">{LEVEL_LABEL[item.level]}</span>
          <span className="font-medium text-slate-800">{item.category}</span>
        </span>
      </td>
      <td className="px-3 py-2.5">
        <p className="text-slate-800">{item.title}</p>
        {item.customer && <p className="text-xs text-slate-500">{item.customer}</p>}
      </td>
      <td className="px-3 py-2.5">
        <p className="text-slate-700">{item.reason}</p>
        <p className="text-xs tabular-nums text-slate-500">{item.refs}</p>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-800">
        {item.amount == null ? <span className="text-slate-400">—</span> : money(item.amount)}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-600">{ageText(item.days)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {/* ปุ่มเป็นลิงก์จริง (คลิกกลางเปิดแท็บใหม่ได้) — หยุดไม่ให้ซ้อนกับการนำทางของทั้งแถว */}
        <Link
          to={item.href}
          onClick={stopRowNav}
          aria-label={item.action}
          title={item.action}
          className={`${buttonClasses("ghost", "sm")} whitespace-nowrap group-hover:border-brand group-hover:text-brand`}
        >
          {/* จอแคบกว่า 1280 (iPad) เหลือแค่ลูกศร ตารางจะได้ไม่ต้องเลื่อนข้าง — ชื่อปุ่มยังอยู่ใน title/aria-label */}
          <span className="hidden xl:inline">{item.action}</span>
          <ChevronRight size={14} aria-hidden />
        </Link>
      </td>
    </tr>
  );
}

export function PendingWorkPage() {
  const rowNav = useRowNav();
  const [data, setData] = useState<PendingWorkDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>(null);

  async function silentRefresh() {
    try {
      const res = await getPendingWork();
      setData(res.pendingWork);
    } catch {
      // เงียบไว้ -- การ poll เบื้องหลังที่ล้มเหลวไม่ควรรบกวนส่วนที่เหลือของหน้า
    }
  }

  useEffect(() => {
    getPendingWork()
      .then((res) => setData(res.pendingWork))
      .catch((err) => setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = setInterval(silentRefresh, 30_000);
    return () => clearInterval(timer);
  }, []);

  const items = useMemo(() => (data ? buildPendingItems(data) : []), [data]);
  // ตัวเลขบนเมนูซ้ายคิดจากรายการชุดเดียวกับหน้านี้ (เร่ง + ควรทำวันนี้) จึงตรงกันเสมอ
  useEffect(() => {
    if (data) setPendingBadge(items);
  }, [data, items]);

  const counts = useMemo(() => {
    const c: Record<PendingLevel, number> = { urgent: 0, soon: 0, watch: 0 };
    for (const it of items) c[it.level] += 1;
    return c;
  }, [items]);
  // ระดับที่เลือกกรองไว้ไม่มีของแล้ว (เคลียร์หมดระหว่างรีเฟรช) → กลับไปดูทั้งหมด
  const activeFilter: Filter = filter !== "all" && counts[filter] === 0 ? "all" : filter;
  const shownLevels = LEVEL_ORDER.filter((lv) => counts[lv] > 0 && (activeFilter === "all" || activeFilter === lv));
  // เรียงตามระดับ (เร่ง → ควรทำวันนี้ → ติดตาม) แล้วค่อยตัดหน้า — งานรีบสุดอยู่หน้าแรกเสมอ
  const shownItems = sortItems(
    shownLevels.flatMap((lv) => items.filter((it) => it.level === lv)),
    sort,
  );
  const pageCount = Math.max(1, Math.ceil(shownItems.length / PAGE_SIZE));
  // รีเฟรชเบื้องหลังทุก 30 วิ งานอาจหมดจนหน้าที่เปิดอยู่ไม่มีแล้ว → ไปหน้าสุดท้ายที่ยังมี
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageItems = shownItems.slice(pageStart, pageStart + PAGE_SIZE);

  function changeFilter(next: Filter) {
    setFilter(next);
    setPage(1);
  }
  // กดหัวคอลัมน์: มาก→น้อย → น้อย→มาก → กลับไปเรียงตามความเร่ง
  function toggleSort(field: SortField) {
    setSort((cur) => {
      if (cur?.field !== field) return { field, dir: "desc" };
      return cur.dir === "desc" ? { field, dir: "asc" } : null;
    });
    setPage(1);
  }
  function changePage(next: number) {
    setPage(next);
    window.scrollTo({ top: 0 });
  }

  return (
    <Layout>
      <PageHeader
        title="งานที่รอดำเนินการ"
        subtitle="รวมทุกอย่างที่ค้างให้ทำ ไม่ต้องไล่เปิดทีละโครงการ · ตัวเลขบนเมนูนับงานเร่ง + ควรทำวันนี้ และลดลงเองเมื่อจัดการเสร็จ ไม่ต้องกดอ่าน"
      />

      {loading && <ListSkeleton rows={6} />}
      {error && <p className="text-red-600">{error}</p>}

      {data && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-12 text-center">
          <CircleCheckBig size={36} className="text-emerald-600" aria-hidden />
          <p className="text-lg font-medium text-slate-800">ไม่มีงานค้าง</p>
          <p className="text-sm text-slate-500">มีเรื่องที่ต้องทำเมื่อไหร่ ระบบจะรวมมาไว้ที่หน้านี้เอง</p>
        </div>
      )}

      {data && items.length > 0 && (
        <>
          <fieldset className="mb-4 flex flex-wrap items-center gap-2 min-w-0" aria-label="กรองตามความเร่ง">
            {(["all", ...LEVEL_ORDER] as Filter[])
              .filter((f) => f === "all" || counts[f] > 0)
              .map((f) => {
                const pressed = activeFilter === f;
                const n = f === "all" ? items.length : counts[f];
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => changeFilter(f)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors ${
                      pressed
                        ? "border-brand bg-brand text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {f !== "all" && <span aria-hidden className={`h-2 w-2 rounded-full ${LEVEL_STYLE[f].dot}`} />}
                    {f === "all" ? "ทั้งหมด" : LEVEL_LABEL[f]}
                    <span
                      className={`rounded-full px-1.5 text-xs font-medium tabular-nums ${
                        pressed ? "bg-white/25 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {n}
                    </span>
                  </button>
                );
              })}
          </fieldset>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-sm md:min-w-0">
              <thead className="text-left text-xs font-medium text-slate-600 [&_th]:border-b [&_th]:border-slate-300 [&_th]:bg-slate-200">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">เรื่อง</th>
                  <th className="whitespace-nowrap px-3 py-2">โครงการ / ผู้ติดต่อ</th>
                  <th className="whitespace-nowrap px-3 py-2">รายละเอียด</th>
                  <SortHeader field="amount" label="ยอด (บาท)" sort={sort} onSort={toggleSort} />
                  <SortHeader field="days" label="รอมา" sort={sort} onSort={toggleSort} />
                  <th className="px-3 py-2">
                    <span className="sr-only">ทำต่อ</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((it) => (
                  <ItemRow key={it.key} item={it} rowNav={rowNav} />
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="mt-4 text-center">
              <p className="text-xs text-slate-500 tabular-nums" aria-live="polite">
                งาน {pageStart + 1}–{pageStart + pageItems.length} จาก {shownItems.length}
              </p>
              <Pagination page={safePage} pageCount={pageCount} onChange={changePage} className="mt-1.5" />
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
