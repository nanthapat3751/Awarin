import type {
  BoqItemDto,
  BoqPriceDriftDto,
  BoqVersionDiffDto,
  MaterialSummaryDto,
  ProjectVersionDto,
} from "@systemboq/shared-types";

import { apiFetch } from "./api";

export interface BoqState {
  version: ProjectVersionDto;
  items: BoqItemDto[];
  editable: boolean;
}

// วัสดุย่อยหนึ่งบรรทัดในสูตรถอดปริมาณ (ส่งไป server ตอนเพิ่ม/แก้บรรทัด BOQ หรือแก้สูตรในแคตตาล็อก)
export interface MaterialComponentInput {
  componentMaterialId?: string | null;
  name: string;
  unit: string;
  qtyPerUnit: number;
  wasteFactorPct?: number | null;
  unitPrice: number;
  sortOrder?: number;
}

export interface BoqMutationResult {
  item: BoqItemDto;
  version: ProjectVersionDto;
}

export function getBoq(projectId: string): Promise<BoqState> {
  return apiFetch(`/api/projects/${projectId}/boq`);
}

// ฐานคำนวณปริมาณ: MANUAL = กรอกเอง; ที่เหลือคิดจากค่าวัดโครงการ × qtyCoefficient × (1+เผื่อเสีย)
export type QtyBasis =
  | "MANUAL"
  | "PER_AREA"
  | "PER_WALL_AREA"
  | "PER_PERIMETER"
  | "PER_VOLUME"
  | "PER_FOOTPRINT"
  | "PER_BATHROOM"
  | "PER_FLOOR";

export function addBoqItem(
  projectId: string,
  input: {
    categoryId: string;
    materialId?: string;
    name?: string;
    unit?: string;
    materialUnitPrice?: number;
    laborUnitPrice?: number;
    quantity?: number;
    qtyBasis?: QtyBasis;
    qtyCoefficient?: number | null;
    wasteFactorPct?: number | null;
    note?: string;
    components?: MaterialComponentInput[];
  },
): Promise<BoqMutationResult> {
  return apiFetch(`/api/projects/${projectId}/boq/items`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateBoqItem(
  projectId: string,
  itemId: string,
  input: {
    quantity?: number;
    materialId?: string | null;
    materialUnitPrice?: number;
    laborUnitPrice?: number;
    qtyBasis?: QtyBasis;
    qtyCoefficient?: number | null;
    wasteFactorPct?: number | null;
    name?: string;
    unit?: string;
    note?: string | null;
    // ไม่ส่ง = ไม่แก้สูตรเดิม; [] = ล้างสูตร (กลับเป็นวัสดุก้อนเดียว); มีรายการ = แทนทั้งชุด
    components?: MaterialComponentInput[] | null;
  },
): Promise<BoqMutationResult> {
  return apiFetch(`/api/projects/${projectId}/boq/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteBoqItem(
  projectId: string,
  itemId: string,
): Promise<{ version: ProjectVersionDto }> {
  return apiFetch(`/api/projects/${projectId}/boq/items/${itemId}`, { method: "DELETE" });
}

// รายงานสรุปปริมาณวัสดุรวมทั้งโครงการ (ถอดปริมาณวัสดุ) — ฝั่ง staff เท่านั้น
export function getMaterialSummary(projectId: string): Promise<MaterialSummaryDto> {
  return apiFetch(`/api/projects/${projectId}/boq/material-summary`);
}

// ---------- ทบทวนราคา: ราคาในคลังเปลี่ยน + เทียบเวอร์ชัน ----------

export function getPriceDrift(projectId: string): Promise<BoqPriceDriftDto> {
  return apiFetch(`/api/projects/${projectId}/boq/price-drift`);
}

/** ใช้ราคาในคลังตอนนี้ — เวอร์ชันที่ส่งเป็นใบเสนอราคาแล้วจะแตกเป็นเวอร์ชันใหม่ */
export function applyCatalogPrices(
  projectId: string,
  itemIds: string[],
): Promise<{ version: ProjectVersionDto; updatedCount: number; newVersion: boolean }> {
  return apiFetch(`/api/projects/${projectId}/boq/price-drift/apply`, {
    method: "POST",
    body: JSON.stringify({ itemIds }),
  });
}

/** คงราคาเดิมไว้ (บันทึกว่าพิจารณาแล้ว — ราคาในคลังเปลี่ยนอีกจะเตือนใหม่) */
export function keepCurrentPrices(projectId: string, itemIds: string[]): Promise<{ keptCount: number }> {
  return apiFetch(`/api/projects/${projectId}/boq/price-drift/keep`, {
    method: "POST",
    body: JSON.stringify({ itemIds }),
  });
}

export function compareBoqVersions(projectId: string, from: number, to: number): Promise<BoqVersionDiffDto> {
  return apiFetch(`/api/projects/${projectId}/boq/versions/compare?from=${from}&to=${to}`);
}

/** เรียงบรรทัดใหม่ — ส่ง id ครบทุกบรรทัดของเวอร์ชันล่าสุดตามลำดับที่ต้องการ */
export function reorderBoqItems(
  projectId: string,
  itemIds: string[],
): Promise<{ version: ProjectVersionDto; newVersion: boolean }> {
  return apiFetch(`/api/projects/${projectId}/boq/items/order`, {
    method: "PUT",
    body: JSON.stringify({ itemIds }),
  });
}
