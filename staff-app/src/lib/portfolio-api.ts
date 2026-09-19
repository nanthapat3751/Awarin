import type { PortfolioDto, PortfolioType } from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function listPortfolio(): Promise<{ portfolio: PortfolioDto[] }> {
  return apiFetch("/api/portfolio");
}

export function getPortfolioItem(id: string): Promise<{ item: PortfolioDto }> {
  return apiFetch(`/api/portfolio/${id}`);
}

export function createPortfolioItem(input: {
  title: string;
  type: PortfolioType;
  description?: string;
  images?: string[];
  published?: boolean;
}): Promise<{ item: PortfolioDto }> {
  return apiFetch("/api/portfolio", { method: "POST", body: JSON.stringify(input) });
}

export function updatePortfolioItem(
  id: string,
  input: Partial<{
    title: string;
    type: PortfolioType;
    description: string | null;
    images: string[];
    published: boolean;
    featured: boolean;
  }>,
): Promise<{ item: PortfolioDto }> {
  return apiFetch(`/api/portfolio/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

// จัดลำดับผลงานเด่นใหม่ (ส่งรายการ id ตามลำดับที่ลากเรียง)
export function reorderFeaturedPortfolio(orderedIds: string[]): Promise<void> {
  return apiFetch("/api/portfolio/featured/reorder", {
    method: "PATCH",
    body: JSON.stringify({ orderedIds }),
  });
}

export function deletePortfolioItem(id: string): Promise<void> {
  return apiFetch(`/api/portfolio/${id}`, { method: "DELETE" });
}
