import { apiFetch } from "./api";

export interface TwoFactorStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

export function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  return apiFetch("/api/auth/2fa/status");
}

export function setupTwoFactor(): Promise<{ otpauthUri: string; qrDataUrl: string; secret: string }> {
  return apiFetch("/api/auth/2fa/setup", { method: "POST" });
}

export function activateTwoFactor(token: string): Promise<{ backupCodes: string[] }> {
  return apiFetch("/api/auth/2fa/activate", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

// เพิ่มอุปกรณ์ (มือถือเครื่องอื่น) หลังเปิด 2FA แล้ว — คืน QR ของ secret เดิม (เครื่องเก่าไม่พัง)
export function addTwoFactorDevice(
  currentPassword: string,
): Promise<{ otpauthUri: string; qrDataUrl: string; secret: string }> {
  return apiFetch("/api/auth/2fa/add-device", {
    method: "POST",
    body: JSON.stringify({ currentPassword }),
  });
}

export function disableTwoFactor(currentPassword: string): Promise<void> {
  return apiFetch("/api/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ currentPassword }),
  });
}

export function regenerateBackupCodes(token: string): Promise<{ backupCodes: string[] }> {
  return apiFetch("/api/auth/2fa/backup-codes", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}
