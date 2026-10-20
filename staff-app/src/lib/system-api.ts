import type { IpCheckDto } from "@systemboq/shared-types";

import { apiFetch } from "./api";

/** ไอพีที่เซิร์ฟเวอร์เห็นจากคำขอนี้ + ผลตัดสินว่าเชื่อถือได้ไหม (เฉพาะ OWNER) */
export function getIpCheck(): Promise<IpCheckDto> {
  return apiFetch("/api/system/ip-check");
}
