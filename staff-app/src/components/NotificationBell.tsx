import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { NotificationDto } from "@systemboq/shared-types";

import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../lib/notifications-api";
import { notificationVisual, timeAgo } from "../lib/notifications-format";
import { Tooltip } from "./Tooltip";

const PREVIEW_COUNT = 6;

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  async function refreshCount() {
    try {
      const res = await getUnreadCount();
      setUnreadCount(res.count);
    } catch {
      // silent — a failed unread-count poll shouldn't disrupt the rest of the app
    }
  }

  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, 30_000);
    return () => clearInterval(timer);
  }, []);

  // ปิดเมื่อคลิกนอกพื้นที่กระดิ่ง/dropdown
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      const res = await listNotifications({ limit: PREVIEW_COUNT });
      setNotifications(res.notifications);
    }
  }

  async function handleClickNotification(n: NotificationDto) {
    if (!n.read) {
      await markNotificationRead(n.id);
      setUnreadCount((c) => Math.max(0, c - 1));
      setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setUnreadCount(0);
    setNotifications((list) => list.map((n) => ({ ...n, read: true })));
  }

  function goToAll() {
    setOpen(false);
    navigate("/notifications");
  }

  return (
    <div className="relative" ref={containerRef}>
      <Tooltip label="การแจ้งเตือน">
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={open}
          className="relative text-slate-700 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-full p-2 transition-colors"
          aria-label="การแจ้งเตือน"
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
            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-medium leading-none rounded-full min-w-4 h-4 px-1 flex items-center justify-center ring-2 ring-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </Tooltip>

      {/* z-40: เหนือปุ่มในการ์ด (relative z-10) และแถบหัวติดจอ (z-30) ที่อยู่ทีหลังใน DOM แต่ยังใต้ modal (z-50) */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-40">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-sm font-medium text-slate-700">
              การแจ้งเตือน
              {unreadCount > 0 && (
                <span className="ml-1.5 rounded-full bg-brand/10 px-1.5 py-0.5 align-middle text-xs font-medium text-brand">
                  {unreadCount > 99 ? "99+" : unreadCount} ใหม่
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              // ข้อความล้วน ไม่ใช่ชิป — รูปแบบเดียวกับแผงกระดิ่งฝั่งลูกค้า ให้สองแอปพูดภาษาเดียวกัน
              // แต่ใช้ "สี" ของฝั่งพนักงาน: เป็นของกดได้ชิ้นเดียวในแถบหัว ถ้าเป็นเทาจางจะจมกว่า
              // ป้ายนับและจุดยังไม่อ่านที่เป็นน้ำเงินอยู่รอบ ๆ
              <button
                type="button"
                onClick={handleMarkAllRead}
                title="ทำเครื่องหมายว่าอ่านแล้วทุกการแจ้งเตือน"
                className="link-pill -mr-2.5 shrink-0 text-xs font-medium text-brand"
              >
                อ่านทั้งหมด
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="text-sm text-slate-500 px-3 py-4 text-center">ยังไม่มีการแจ้งเตือน</p>
            )}
            {notifications.map((n) => {
              const { Icon, colorClass } = notificationVisual(n);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClickNotification(n)}
                  className={`w-full text-left px-3 py-2 text-sm border-b border-slate-100 flex items-start gap-2.5 border-l-2 transition-colors ${
                    n.read
                      ? "text-slate-700 border-l-transparent hover:bg-slate-50"
                      : "text-slate-800 bg-blue-50 border-l-blue-500 font-medium hover:bg-blue-100"
                  }`}
                >
                  <span
                    className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}
                  >
                    <Icon size={15} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block">{n.message}</span>
                    <span className="block text-xs text-slate-500 mt-0.5 font-normal">
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                  {!n.read && (
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={goToAll}
            className="w-full text-center text-sm text-slate-700 bg-slate-50 hover:bg-slate-200 hover:text-slate-800 py-2.5 border-t border-slate-200 font-medium transition-colors"
          >
            ดูทั้งหมด →
          </button>
        </div>
      )}
    </div>
  );
}
