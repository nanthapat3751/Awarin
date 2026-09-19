import type { MaterialDto } from "@systemboq/shared-types";

import type { MaterialComponentInput } from "./boq-api";
import { apiFetch } from "./api";

export function listMaterials(categoryId?: string): Promise<{ materials: MaterialDto[] }> {
  const query = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : "";
  return apiFetch(`/api/materials${query}`);
}

export function createMaterial(input: {
  categoryId?: string | null;
  name: string;
  spec?: string | null;
  unit: string;
  supplier?: string | null;
  materialUnitPrice: number;
  laborUnitPrice: number;
  wasteFactorPct?: number | null;
  components?: MaterialComponentInput[];
}): Promise<{ material: MaterialDto }> {
  return apiFetch("/api/materials", { method: "POST", body: JSON.stringify(input) });
}

export function updateMaterial(
  id: string,
  input: {
    categoryId?: string | null;
    name?: string;
    spec?: string | null;
    unit?: string;
    supplier?: string | null;
    materialUnitPrice?: number;
    laborUnitPrice?: number;
    wasteFactorPct?: number | null;
    active?: boolean;
    // ไม่ส่ง = ไม่แก้สูตร; [] = ล้างสูตร; มีรายการ = แทนทั้งชุด (materialUnitPrice คิดใหม่จากผลรวม)
    components?: MaterialComponentInput[] | null;
  },
): Promise<{ material: MaterialDto }> {
  return apiFetch(`/api/materials/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteMaterial(id: string): Promise<void> {
  return apiFetch(`/api/materials/${id}`, { method: "DELETE" });
}
