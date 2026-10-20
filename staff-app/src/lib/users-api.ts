import type { MySessionDto, Role, StaffUserDto } from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function listStaff(): Promise<{ users: StaffUserDto[] }> {
  return apiFetch("/api/users");
}

export function createStaff(input: {
  username: string;
  fullName: string;
  email: string;
  role: Extract<Role, "OWNER" | "ADMIN">;
  password: string;
}): Promise<{ user: StaffUserDto }> {
  return apiFetch("/api/users", { method: "POST", body: JSON.stringify(input) });
}

export function resetStaffPassword(id: string, newPassword: string, disableTwoFactor = false): Promise<void> {
  return apiFetch(`/api/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword, disableTwoFactor }),
  });
}

export function setStaffActive(id: string, active: boolean): Promise<void> {
  return apiFetch(`/api/users/${id}/active`, {
    method: "POST",
    body: JSON.stringify({ active }),
  });
}

// ── เครื่องที่พนักงานเข้าสู่ระบบอยู่ (OWNER) ──

export async function listStaffSessions(id: string): Promise<MySessionDto[]> {
  const res = await apiFetch<{ sessions: MySessionDto[] }>(`/api/users/${id}/sessions`);
  return res.sessions;
}

export function revokeStaffSession(id: string, handle: string): Promise<void> {
  return apiFetch(`/api/users/${id}/sessions/${encodeURIComponent(handle)}`, { method: "DELETE" });
}

export async function revokeAllStaffSessions(id: string): Promise<number> {
  const res = await apiFetch<{ count: number }>(`/api/users/${id}/sessions/revoke-all`, { method: "POST" });
  return res.count;
}
