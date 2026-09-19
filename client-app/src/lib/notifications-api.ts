import type { NotificationDto } from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function listNotifications(opts?: {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}): Promise<{ notifications: NotificationDto[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  if (opts?.unreadOnly) params.set("filter", "unread");
  const qs = params.toString();
  return apiFetch(qs ? `/api/notifications?${qs}` : "/api/notifications");
}

export function getUnreadCount(): Promise<{ count: number }> {
  return apiFetch("/api/notifications/unread-count");
}

export function markNotificationRead(id: string): Promise<void> {
  return apiFetch(`/api/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead(): Promise<void> {
  return apiFetch("/api/notifications/mark-all-read", { method: "POST" });
}

/**
 * กระดิ่ง (บนแถบเมนู) กับหน้ารวม (/my/notifications) เป็นคนละคอมโพเนนต์ ต่างคนต่างถือสถานะ
 * กดอ่านที่ฝั่งหนึ่งอีกฝั่งจึงไม่รู้ — ตัวเลขบนกระดิ่งเคยค้างอยู่จนกว่าจะ poll รอบถัดไป (30 วินาที)
 * ใช้ event ของ window เป็นตัวส่งสัญญาณ เบากว่าการยก state ขึ้น context ทั้งแอปเพื่อเรื่องเดียว
 */
const CHANGED_EVENT = "notifications:changed";

export function notifyNotificationsChanged(): void {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function onNotificationsChanged(handler: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, handler);
  return () => window.removeEventListener(CHANGED_EVENT, handler);
}
