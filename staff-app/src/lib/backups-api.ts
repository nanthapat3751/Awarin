import type { BackupStatusDto } from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function getBackupStatus(): Promise<BackupStatusDto> {
  return apiFetch("/api/backups");
}

/** สำรองทันที — รอจนเสร็จ (ปกติไม่กี่วินาที) แล้วได้สถานะล่าสุดกลับมา */
export function runBackupNow(): Promise<BackupStatusDto> {
  return apiFetch("/api/backups", { method: "POST" });
}
