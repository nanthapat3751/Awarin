import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { NotificationDto } from "@systemboq/shared-types";

import { EmptyState } from "../components/EmptyState";
import { Pagination } from "../components/Pagination";
import { PortalIcon, PortalPage } from "../components/PortalPage";
import { ApiError } from "../lib/api";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notifyNotificationsChanged,
  onNotificationsChanged,
} from "../lib/notifications-api";
import { groupByDay, notificationVisual, timeAgo } from "../lib/notifications-format";

/** จำนวนต่อหน้า — API รับ limit สูงสุด 50 */
const PAGE_SIZE = 15;

type Tab = "all" | "unread";

export function MyNotificationsPage() {
  const navigate = useNavigate();
  const listTopRef = useRef<HTMLDivElement>(null);
  const isFirstPageEffect = useRef(true);
  const [tab, setTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextTab: Tab, nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listNotifications({
        limit: PAGE_SIZE,
        offset: (nextPage - 1) * PAGE_SIZE,
        unreadOnly: nextTab === "unread",
      });
      setItems(res.notifications);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดการแจ้งเตือนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab, page);
  }, [tab, page, load]);

  // กดอ่านจากแผงกระดิ่งขณะเปิดหน้านี้ค้างไว้ → โหลดหน้าปัจจุบันใหม่ให้ตรงกัน
  useEffect(() => onNotificationsChanged(() => load(tab, page)), [tab, page, load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // อ่านรายการท้าย ๆ ในแท็บ "ยังไม่อ่าน" จนหน้านั้นว่าง จะค้างอยู่บนหน้าที่ไม่มีอยู่แล้ว
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // เปลี่ยนหน้าแล้วต้องเลื่อนกลับขึ้นหัวรายการ ไม่งั้นสายตาค้างอยู่กลางรายการชุดใหม่
  useEffect(() => {
    if (isFirstPageEffect.current) {
      isFirstPageEffect.current = false;
      return;
    }
    const el = listTopRef.current;
    if (!el) return;
    // แถบเมนูเป็น fixed — ต้องหักความสูงออก ไม่งั้นหัวรายการไปซ่อนอยู่ใต้แถบ
    const navH =
      Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--nav-h"), 10) ||
      64;
    const top = el.getBoundingClientRect().top + window.scrollY - navH - 16;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: Math.max(0, top), behavior: reduced ? "auto" : "smooth" });
  }, [page]);

  function switchTab(nextTab: Tab) {
    setTab(nextTab);
    setPage(1);
  }

  async function handleClick(n: NotificationDto) {
    if (!n.read) {
      await markNotificationRead(n.id);
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      notifyNotificationsChanged();
    }
    if (n.link) navigate(n.link);
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    if (tab === "unread") {
      setItems([]);
      setTotal(0);
      setPage(1);
    } else {
      setItems((list) => list.map((n) => ({ ...n, read: true })));
    }
    notifyNotificationsChanged();
  }

  const hasUnread = items.some((n) => !n.read);
  const groups = groupByDay(items);
  const firstOnPage = (page - 1) * PAGE_SIZE + 1;
  const lastOnPage = (page - 1) * PAGE_SIZE + items.length;

  const tabClass = (t: Tab) =>
    `min-h-11 rounded-full px-4 text-sm font-medium transition-colors ${
      tab === t ? "bg-brand text-white" : "bg-white/70 text-slate-600 hover:bg-white"
    }`;

  return (
    <PortalPage title="การแจ้งเตือน" subtitle="ความคืบหน้าของคำขอ ใบเสนอราคา และสัญญาของคุณ">
      <div ref={listTopRef} className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => switchTab("all")} className={tabClass("all")}>
            ทั้งหมด
          </button>
          <button type="button" onClick={() => switchTab("unread")} className={tabClass("unread")}>
            ยังไม่อ่าน
          </button>
        </div>
        {hasUnread && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="min-h-11 text-sm text-slate-500 transition-colors hover:text-brand"
          >
            ทำเครื่องหมายอ่านทั้งหมด
          </button>
        )}
      </div>

      {loading && items.length === 0 && <p className="text-slate-400">กำลังโหลด...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          title={tab === "unread" ? "อ่านครบทุกรายการแล้ว" : "ยังไม่มีการแจ้งเตือน"}
          description="เมื่อทีมงานส่งใบเสนอราคา ออกสัญญา หรือโครงการมีความคืบหน้า เราจะแจ้งให้ทราบที่นี่"
          ctaLabel="ดูใบเสนอราคาของฉัน"
          ctaTo="/my/quotes"
        />
      )}

      {/* ระหว่างสลับหน้าให้รายการเดิมค้างไว้แบบจาง ๆ ถ้าถอดออกทั้งก้อน แถวเลขหน้าจะกระโดดหาย */}
      <div className={loading && items.length > 0 ? "pointer-events-none opacity-50" : undefined}>
        {groups.map((group) => (
          <section key={group.label} className="mb-5">
            {/* หัวกลุ่มตามวัน — ทำให้กวาดตาหาว่า "เมื่อวานมีอะไรบ้าง" ได้โดยไม่ต้องอ่านเวลาทีละแถว */}
            <h2 className="mb-2 px-1 text-xs font-medium tracking-wide text-slate-500">
              {group.label}
            </h2>
            <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-sm">
              {group.items.map((n, i) => {
                const v = notificationVisual(n);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleClick(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                      i > 0 ? "border-t border-slate-100" : ""
                    } ${n.read ? "" : "bg-brand/5"}`}
                  >
                    <span
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${v.chip}`}
                    >
                      <PortalIcon name={v.icon} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm ${n.read ? "text-slate-600" : "font-medium text-slate-800"}`}
                      >
                        {n.message}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {timeAgo(n.createdAt)}
                        {n.link ? " · แตะเพื่อเปิดดู" : ""}
                      </span>
                    </span>
                    {!n.read && (
                      <span
                        className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand"
                        aria-label="ยังไม่อ่าน"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      {pageCount > 1 && (
        <p className="mt-2 text-center text-xs tabular-nums text-slate-400">
          แสดง {firstOnPage}-{lastOnPage} จากทั้งหมด {total} รายการ
        </p>
      )}
    </PortalPage>
  );
}
