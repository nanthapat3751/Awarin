import type { TrashItemType, TrashListDto } from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function listTrash(): Promise<TrashListDto> {
  return apiFetch("/api/trash");
}

export function restoreTrashItem(type: TrashItemType, id: string): Promise<void> {
  return apiFetch(`/api/trash/${type}/${encodeURIComponent(id)}/restore`, { method: "POST" });
}

// ลบถาวร (กู้ไม่ได้) — ฝั่ง server อนุญาตเฉพาะ OWNER
export function purgeTrashItem(type: TrashItemType, id: string): Promise<void> {
  return apiFetch(`/api/trash/${type}/${encodeURIComponent(id)}`, { method: "DELETE" });
}
