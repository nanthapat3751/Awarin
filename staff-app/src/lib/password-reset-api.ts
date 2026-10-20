import { apiFetch } from "./api";

// ลืมรหัสผ่านฝั่งพนักงาน (หน้าสาธารณะ ไม่ต้องล็อกอิน) — ลิงก์ไปที่อีเมลที่ยืนยันแล้วของบัญชี

/** ขอลิงก์ — เซิร์ฟเวอร์ตอบ ok เหมือนกันทุกกรณี ไม่บอกว่าชื่อผู้ใช้มีจริงหรือมีอีเมลไหม */
export function requestStaffPasswordReset(username: string): Promise<{ ok: true }> {
  return apiFetch("/api/auth/staff/forgot-password", { method: "POST", body: JSON.stringify({ username }) });
}

/** เปิดลิงก์ — ตรวจว่ายังใช้ได้ (ไม่เผาลิงก์ทิ้ง) และบอกว่าเป็นบัญชีไหน */
export function inspectStaffResetToken(token: string): Promise<{ maskedEmail: string; username: string | null }> {
  return apiFetch(`/api/auth/staff/reset-password/${encodeURIComponent(token)}`);
}

export function submitStaffPasswordReset(token: string, password: string): Promise<{ ok: true }> {
  return apiFetch("/api/auth/staff/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
}
