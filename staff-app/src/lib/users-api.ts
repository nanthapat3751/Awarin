import type { Role, StaffUserDto } from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function listStaff(): Promise<{ users: StaffUserDto[] }> {
  return apiFetch("/api/users");
}

export function createStaff(input: {
  email: string;
  fullName: string;
  role: Extract<Role, "OWNER" | "ADMIN">;
  password: string;
}): Promise<{ user: StaffUserDto }> {
  return apiFetch("/api/users", { method: "POST", body: JSON.stringify(input) });
}

export function resetStaffPassword(id: string, newPassword: string): Promise<void> {
  return apiFetch(`/api/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
}

export function setStaffActive(id: string, active: boolean): Promise<void> {
  return apiFetch(`/api/users/${id}/active`, {
    method: "POST",
    body: JSON.stringify({ active }),
  });
}
