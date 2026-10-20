import type {
  AuthenticatedUser,
  LoginHistoryDto,
  MySessionDto,
  MySignatureDto,
  UpdateMyStaffProfileInput,
} from "@systemboq/shared-types";

import { apiFetch, apiUpload } from "./api";

// หน้า "บัญชีของฉัน" — ทุกเส้นทางคืน user ฉบับล่าสุด เพื่อส่งต่อให้ auth context (เมนูข้างอัปเดตทันที)

export async function updateMyProfile(input: UpdateMyStaffProfileInput): Promise<AuthenticatedUser> {
  const res = await apiFetch<{ user: AuthenticatedUser }>("/api/account/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.user;
}

export async function uploadMyAvatar(image: Blob): Promise<AuthenticatedUser> {
  const form = new FormData();
  // ชื่อไฟล์ไม่มีผล — เซิร์ฟเวอร์สร้างไฟล์ใหม่และตั้งชื่อเอง
  form.append("file", image, `avatar.${image.type === "image/webp" ? "webp" : "png"}`);
  const res = await apiUpload<{ user: AuthenticatedUser }>("/api/account/avatar", form);
  return res.user;
}

export async function removeMyAvatar(): Promise<AuthenticatedUser> {
  const res = await apiFetch<{ user: AuthenticatedUser }>("/api/account/avatar", { method: "DELETE" });
  return res.user;
}

export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch<void>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// ── อุปกรณ์ที่เข้าสู่ระบบ ──

export async function listMySessions(): Promise<MySessionDto[]> {
  const res = await apiFetch<{ sessions: MySessionDto[] }>("/api/account/sessions");
  return res.sessions;
}

export async function revokeMySession(handle: string): Promise<void> {
  await apiFetch<void>(`/api/account/sessions/${encodeURIComponent(handle)}`, { method: "DELETE" });
}

export async function revokeOtherSessions(): Promise<number> {
  const res = await apiFetch<{ count: number }>("/api/account/sessions/revoke-others", { method: "POST" });
  return res.count;
}

export async function getLoginHistory(page = 1): Promise<LoginHistoryDto> {
  return apiFetch<LoginHistoryDto>(`/api/account/login-history?page=${page}`);
}

// ── อีเมลกู้รหัสผ่าน ──

export interface SendCodeResult {
  sent: boolean;
  retryAfterSeconds: number;
}

export function setRecoveryEmail(email: string, currentPassword: string): Promise<{ user: AuthenticatedUser; code: SendCodeResult }> {
  return apiFetch("/api/account/email", { method: "POST", body: JSON.stringify({ email, currentPassword }) });
}

export async function resendRecoveryCode(): Promise<SendCodeResult> {
  const res = await apiFetch<{ code: SendCodeResult }>("/api/account/email/send-code", { method: "POST" });
  return res.code;
}

export async function verifyRecoveryEmail(code: string): Promise<AuthenticatedUser> {
  const res = await apiFetch<{ user: AuthenticatedUser }>("/api/account/email/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return res.user;
}

// ── ลายเซ็น ──

export async function getMySignature(): Promise<MySignatureDto> {
  const res = await apiFetch<{ signature: MySignatureDto }>("/api/account/signature");
  return res.signature;
}

export async function saveMySignature(image: Blob): Promise<MySignatureDto> {
  const form = new FormData();
  form.append("file", image, `signature.${image.type === "image/png" ? "png" : "jpg"}`);
  const res = await apiUpload<{ signature: MySignatureDto }>("/api/account/signature", form);
  return res.signature;
}

export async function removeMySignature(): Promise<void> {
  await apiFetch<void>("/api/account/signature", { method: "DELETE" });
}

// ── ความปลอดภัย ──

/** เปลี่ยนรหัสผ่านล่าสุดเมื่อไร — null = บัญชีเก่าก่อนระบบเก็บเวลานี้ (หน้าจอไม่โชว์บรรทัดนี้) */
export async function getMySecurity(): Promise<{ passwordChangedAt: string | null }> {
  return apiFetch<{ passwordChangedAt: string | null }>("/api/account/security");
}
