import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { NotificationDto } from "@systemboq/shared-types";

import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notifyNotificationsChanged,
  onNotificationsChanged,
} from "../lib/notifications-api";
import { notificationVisual, timeAgo } from "../lib/notifications-format";
import { PortalIcon } from "./PortalPage";
import { NotificationListSkeleton } from "./Skeleton";
import { Tooltip } from "./Tooltip";

/** จำนวนที่โชว์ในแผง — เกินกว่านี้ให้ไปดูที่หน้ารวม */
const PANEL_LIMIT = 8;

type Tab = "all" | "unread";

export function NotificationBell() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);

  async function refreshCount() {
    try {
      const res = await getUnreadCount();
      setUnreadCount(res.count);
    } catch {
      // เงียบไว้ — การ poll นับเลขล้มเหลวไม่ควรไปรบกวนส่วนอื่นของแอป
    }
  }

  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, 30_000);
    // อัปเดตทันทีเมื่อมีการกดอ่านจากหน้ารวม ไม่ต้องรอ poll รอบถัดไป
    const off = onNotificationsChanged(refreshCount);
    return () => {
      clearInterval(timer);
      off();
    };
  }, []);

  // ปิดเมื่อคลิกนอกแผง — เดิมไม่มี ต้องกดกระดิ่งซ้ำเท่านั้นถึงจะปิด (ยืนยันด้วยการวัดหน้าจริง)
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function load(nextTab: Tab) {
    setLoading(true);
    try {
      const res = await listNotifications({ limit: PANEL_LIMIT, unreadOnly: nextTab === "unread" });
      setNotifications(res.notifications);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    const next = !open;
    // ต้องตั้ง loading ก่อนเปิด ไม่งั้นเฟรมแรกของแผงจะ render ด้วย loading=false
    // แล้วโชว์ "ยังไม่มีการแจ้งเตือน" แวบหนึ่งทั้งที่ข้อมูลกำลังมา
    if (next) setLoading(true);
    setOpen(next);
    if (next) await load(tab);
  }

  async function switchTab(nextTab: Tab) {
    setTab(nextTab);
    await load(nextTab);
  }

  // พาไปหน้าปลายทางทันที แล้วบันทึก "อ่านแล้ว" ตามหลัง — เดิมรอเซิร์ฟเวอร์ตอบก่อนค่อยไป
  // เน็ตช้ากดแล้วเหมือนไม่มีอะไรเกิดขึ้น · บันทึกไม่สำเร็จ = แค่ยังขึ้นว่ายังไม่อ่านในรอบหน้า (ไม่เสียหาย)
  function handleClickNotification(n: NotificationDto) {
    setOpen(false);
    if (n.link) navigate(n.link);
    if (n.read) return;
    setUnreadCount((c) => Math.max(0, c - 1));
    setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    markNotificationRead(n.id)
      .then(() => notifyNotificationsChanged())
      .catch(() => undefined);
  }

  // กันกดซ้ำระหว่างส่ง + บอกว่ากำลังทำ (เดิมไม่มีอะไรเปลี่ยนจนเซิร์ฟเวอร์ตอบ และพังก็เงียบ)
  const [markingAll, setMarkingAll] = useState(false);
  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setUnreadCount(0);
      if (tab === "unread") setNotifications([]);
      else setNotifications((list) => list.map((n) => ({ ...n, read: true })));
      notifyNotificationsChanged();
    } catch {
      // ไม่สำเร็จ = ปล่อยสถานะเดิมไว้ ปุ่มยังอยู่ให้กดใหม่ได้
    } finally {
      setMarkingAll(false);
    }
  }

  const tabClass = (t: Tab) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      tab === t ? "bg-brand text-white" : "text-slate-500 hover:bg-slate-100"
    }`;

  return (
    <div className="relative" ref={containerRef}>
      <Tooltip label="การแจ้งเตือน">
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={open}
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-black/5 lg:h-9 lg:w-9"
          aria-label={unreadCount > 0 ? `การแจ้งเตือน (${unreadCount} รายการใหม่)` : "การแจ้งเตือน"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zm.995-14.901a1 1 0 1 0-1.99 0A5.002 5.002 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7 0-2.42-1.72-4.44-4.005-4.901z" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-[1.15rem] h-[1.15rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </Tooltip>

      {open && (
        // จอเล็ก: ยึดกับขอบจอ (fixed) เพราะแผงกว้าง 320px เท่ากับความกว้างจอพอดี ถ้ายึดกับปุ่ม
        // แบบเดิมจะยื่นพ้นขอบซ้ายไป 64px แล้วเนื้อหาโดนตัด — จอ sm ขึ้นไปยึดกับปุ่มเหมือนเดิม
        <div className="notif-panel fixed inset-x-3 top-[calc(var(--nav-h)+4px)] z-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:z-10 sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => switchTab("all")} className={tabClass("all")}>
                ทั้งหมด
              </button>
              <button type="button" onClick={() => switchTab("unread")} className={tabClass("unread")}>
                ยังไม่อ่าน{unreadCount > 0 ? ` ${unreadCount}` : ""}
              </button>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="link-pill -mr-2.5 shrink-0 text-xs font-medium text-brand disabled:opacity-60"
              >
                {markingAll ? "กำลังบันทึก..." : "อ่านทั้งหมด"}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {/* แผงยิง API ตอนกดเปิด ไม่ได้โหลดมาพร้อมหน้า จึงเห็นช่วงรอจริง */}
            {loading && <NotificationListSkeleton count={3} compact />}
            {!loading && notifications.length === 0 && (
              <div className="px-3 py-8 text-center">
                <p className="text-sm text-slate-500">
                  {tab === "unread" ? "อ่านครบทุกรายการแล้ว" : "ยังไม่มีการแจ้งเตือน"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  เมื่อมีใบเสนอราคา สัญญา หรือความคืบหน้าของโครงการ จะแจ้งให้ทราบที่นี่
                </p>
              </div>
            )}
            {!loading &&
              notifications.map((n) => {
                const v = notificationVisual(n);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleClickNotification(n)}
                    className={`flex w-full items-start gap-3 border-b border-slate-50 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                      n.read ? "" : "bg-brand/5"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${v.chip}`}
                    >
                      <PortalIcon name={v.icon} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm ${n.read ? "text-slate-500" : "font-medium text-slate-800"}`}
                      >
                        {n.message}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {timeAgo(n.createdAt)}
                      </span>
                    </span>
                    {/* จุดน้ำเงินท้ายแถว = ยังไม่อ่าน (ไม่พึ่งพื้นหลังอ่อนอย่างเดียว เผื่อคนแยกสียาก) */}
                    {!n.read && (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="ยังไม่อ่าน" />
                    )}
                  </button>
                );
              })}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/my/notifications");
            }}
            className="block w-full border-t border-slate-100 px-3 py-2.5 text-center text-sm font-medium text-brand transition-colors hover:bg-slate-50"
          >
            ดูทั้งหมด →
          </button>
        </div>
      )}
    </div>
  );
}
