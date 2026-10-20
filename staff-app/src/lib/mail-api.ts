import type { MailStatusDto, MailTestResultDto } from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function getMailStatus(): Promise<MailStatusDto> {
  return apiFetch("/api/mail");
}

/** ลองเชื่อมต่อ + ล็อกอิน SMTP ใหม่โดยไม่ส่งเมล แล้วได้สถานะล่าสุดกลับมา */
export function verifyMail(): Promise<MailStatusDto> {
  return apiFetch("/api/mail/verify", { method: "POST" });
}

export function sendTestMail(to: string): Promise<MailTestResultDto> {
  return apiFetch("/api/mail/test", { method: "POST", body: JSON.stringify({ to }) });
}
