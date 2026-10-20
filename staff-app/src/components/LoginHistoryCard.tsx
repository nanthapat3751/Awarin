import type { LoginEventDto, LoginEventTone } from "@systemboq/shared-types";
import { CircleAlert, CircleCheck, CircleDot, Lock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { getLoginHistory } from "../lib/account-api";
import { ApiError } from "../lib/api";
import { dayGroupLabel } from "../lib/notifications-format";
import { Pagination } from "./Pagination";
import { GeoCredit, whereText } from "./SessionsCard";
import { PanelSkeleton } from "./Skeleton";

const TONE: Record<LoginEventTone, { Icon: typeof CircleCheck; className: string }> = {
  success: { Icon: CircleCheck, className: "text-emerald-600" },
  danger: { Icon: CircleAlert, className: "text-red-600" },
  warning: { Icon: Lock, className: "text-amber-600" },
  neutral: { Icon: CircleDot, className: "text-slate-400" },
};

const timeOnly = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" });

function EventRow({ event }: Readonly<{ event: LoginEventDto }>) {
  const { Icon, className } = TONE[event.tone];
  const where = whereText(event.ip, event.ipKind, event.ipGeo);
  const sub = [event.detail, event.device, where].filter(Boolean).join(" · ");
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon size={18} className={`mt-0.5 shrink-0 ${className}`} aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex flex-wrap items-center gap-2 text-slate-800">
          {event.title}
          {event.ipGeo?.foreign && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">ต่างประเทศ</span>
          )}
        </p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      <time dateTime={event.at} className="shrink-0 text-xs tabular-nums text-slate-400">
        {timeOnly.format(new Date(event.at))}
      </time>
    </li>
  );
}

/**
 * ประวัติการเข้าสู่ระบบ (แบบ "กิจกรรมความปลอดภัยล่าสุด") — เข้าได้/ใส่รหัสผิด/ถูกล็อก/เปลี่ยนรหัส
 * เห็นแถว "รหัสผ่านไม่ถูกต้อง" ที่ไม่ได้ทำเอง = มีคนกำลังเดารหัสบัญชีนี้
 */
export function LoginHistoryCard() {
  const [events, setEvents] = useState<LoginEventDto[] | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(15);
  const [days, setDays] = useState(90);
  // เปลี่ยนหน้าแล้วจางรายการเดิมไว้จนหน้าใหม่มา — ไม่ให้กล่องหดเป็นโครงกระดูกแล้วหน้ากระโดด
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const topRef = useRef<HTMLElement>(null);

  const load = useCallback(async (want: number) => {
    try {
      const res = await getLoginHistory(want);
      setEvents(res.events);
      setPage(res.page);
      setTotal(res.total);
      setPageSize(res.pageSize);
      setPageCount(Math.max(1, Math.ceil(res.total / res.pageSize)));
      setDays(res.days);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดประวัติไม่สำเร็จ");
    } finally {
      setStale(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  function goPage(next: number) {
    setStale(true);
    void load(next);
    // กดเปลี่ยนหน้าจากท้ายรายการแล้วต้องได้เริ่มอ่านจากหัวกล่อง ไม่ใช่โผล่กลางรายการ
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // จัดกลุ่มตามวัน (วันนี้ / เมื่อวาน / วันที่) — อ่านง่ายกว่าวันที่ซ้ำทุกแถว
  const groups: { label: string; items: LoginEventDto[] }[] = [];
  for (const e of events ?? []) {
    const label = dayGroupLabel(e.at);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }

  return (
    <section ref={topRef} className="scroll-mt-4 bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium text-slate-800">ประวัติการเข้าสู่ระบบ</p>
        <p className="mt-0.5 text-xs text-slate-500">
          ย้อนหลัง {days} วัน · เห็น "รหัสผ่านไม่ถูกต้อง" ที่ไม่ได้ทำเอง แปลว่ามีคนพยายามเดารหัส ให้เปลี่ยนรหัสผ่าน
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {events == null && !error && <PanelSkeleton lines={4} />}
      {events?.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีประวัติในช่วงนี้</p>}
      {total > pageSize && (
        <p className="text-xs tabular-nums text-slate-500">
          แสดง {from}-{to} จาก {total} รายการ
        </p>
      )}
      {groups.length > 0 && (
        <div className={`flex flex-col gap-3 transition-opacity ${stale ? "opacity-50" : ""}`} aria-busy={stale}>
      {groups.map((g) => (
        <div key={g.label}>
          <p className="text-xs font-medium text-slate-500">{g.label}</p>
          <ul className="divide-y divide-slate-100">
            {g.items.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </ul>
        </div>
      ))}
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} onChange={goPage} className="mt-1" />
      <GeoCredit show={(events ?? []).some((e) => e.ipGeo)} />
    </section>
  );
}
