import type { HouseDesignDto } from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function listHouseDesigns(): Promise<{ houseDesigns: HouseDesignDto[] }> {
  return apiFetch("/api/house-designs");
}

export function getHouseDesign(id: string): Promise<{ houseDesign: HouseDesignDto }> {
  return apiFetch(`/api/house-designs/${id}`);
}

export function createHouseDesign(input: {
  name: string;
  description?: string;
  area?: number;
  wallAreaSqm?: number;
  perimeterM?: number;
  concreteVolumeM3?: number;
  footprintSqm?: number;
  floors?: number;
  bedrooms?: number;
  bathrooms?: number;
  exteriorImages?: string[];
  interiorImages?: string[];
  plans?: string[];
  published?: boolean;
}): Promise<{ houseDesign: HouseDesignDto }> {
  return apiFetch("/api/house-designs", { method: "POST", body: JSON.stringify(input) });
}

export function updateHouseDesign(
  id: string,
  input: Partial<{
    name: string;
    description: string | null;
    area: number | null;
    wallAreaSqm: number | null;
    perimeterM: number | null;
    concreteVolumeM3: number | null;
    footprintSqm: number | null;
    floors: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    exteriorImages: string[];
    interiorImages: string[];
    plans: string[];
    published: boolean;
    featured: boolean;
  }>,
): Promise<{ houseDesign: HouseDesignDto }> {
  return apiFetch(`/api/house-designs/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

// จัดลำดับแบบบ้านแนะนำใหม่ (ส่งรายการ id ตามลำดับที่ลากเรียง)
export function reorderFeaturedHouseDesigns(orderedIds: string[]): Promise<void> {
  return apiFetch("/api/house-designs/featured/reorder", {
    method: "PATCH",
    body: JSON.stringify({ orderedIds }),
  });
}

export function deleteHouseDesign(id: string): Promise<void> {
  return apiFetch(`/api/house-designs/${id}`, { method: "DELETE" });
}
