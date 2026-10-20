import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { NotificationDto } from "@systemboq/shared-types";

import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../lib/notifications-api";
import { groupByDay, notificationVisual, timeAgo } from "../lib/notifications-format";
import { ListSkeleton } from "../components/Skeleton";

const PAGE_SIZE = 15;

type Filter = "unread" | "all";

export function NotificationsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  async function fetchPage(f: Filter, p: number) {
    setLoading(true);
    try {
      const res = await listNotifications({
        limit: PAGE_SIZE,
        offset: (p - 1) * PAGE_SIZE,
        unreadOnly: f === "unread",
      });
      setItems(res.notifications);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPage(filter, safePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, safePage]);

  function changeFilter(f: Filter) {
    setFilter(f);
    setPage(1);
  }

  async function handleClick(n: NotificationDto) {
    if (!n.read) {
      await markNotificationRead(n.id);
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    if (n.link) navigate(n.link);
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setPage(1);
    await fetchPage(filter, 1);
  }

  const groups = groupByDay(items);

  return (
    <Layout>
      <PageHeader
        title="การแจ้งเตือน"
        action={
          // หน้าเต็มใช้คำเต็ม "ทำเครื่องหมายอ่านทั้งหมด" ส่วนในแผงกระดิ่งที่แคบใช้ "อ่านทั้งหมด"
          // — แบ่งแบบเดียวกับฝั่งลูกค้าเป๊ะ
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="link-pill -mr-2.5 min-h-11 whitespace-nowrap text-sm font-medium text-brand lg:min-h-0"
          >
            ทำเครื่องหมายอ่านทั้งหมด
          </button>
        }
      />

      <div className="flex gap-2 mb-4">
        {(["unread", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => changeFilter(f)}
            className={`text-sm rounded-full px-4 py-1.5 border transition-colors ${
              filter === f
                ? "bg-slate-800 text-white border-slate-800"
                : "border-slate-300 text-slate-500 hover:bg-slate-50"
            }`}
          >
            {f === "unread" ? "ยังไม่อ่าน" : "ทั้งหมด"}
          </button>
        ))}
      </div>

      {loading && <ListSkeleton rows={6} />}

      {!loading && items.length === 0 && (
        <p className="text-slate-500 py-8 text-center">
          {filter === "unread" ? "ไม่มีการแจ้งเตือนที่ยังไม่อ่าน" : "ยังไม่มีการแจ้งเตือน"}
        </p>
      )}

      {!loading && groups.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border-b border-slate-200">
                {group.label}
              </p>
              {group.items.map((n) => {
                const { Icon, colorClass } = notificationVisual(n);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-4 py-3 text-sm border-b border-slate-100 last:border-b-0 flex items-start gap-3 border-l-2 hover:bg-slate-50 ${
                      n.read
                        ? "text-slate-700 border-l-transparent"
                        : "text-slate-800 font-medium bg-blue-50/40 border-l-blue-500"
                    }`}
                  >
                    <span
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}
                    >
                      <Icon size={18} />
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
          ))}
        </div>
      )}

      <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
    </Layout>
  );
}
