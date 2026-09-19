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
