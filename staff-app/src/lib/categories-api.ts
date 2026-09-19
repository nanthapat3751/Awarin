import type { WorkCategoryDto, WorkCategoryLevel } from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function listCategories(): Promise<{ categories: WorkCategoryDto[] }> {
  return apiFetch("/api/categories");
}

export function createCategory(input: {
  level: WorkCategoryLevel;
  parentId?: string | null;
  code?: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
}): Promise<{ category: WorkCategoryDto }> {
  return apiFetch("/api/categories", { method: "POST", body: JSON.stringify(input) });
}

export function updateCategory(
  id: string,
  input: {
    name?: string;
    code?: string | null;
    description?: string | null;
    sortOrder?: number;
    active?: boolean;
  },
): Promise<{ category: WorkCategoryDto }> {
  return apiFetch(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteCategory(id: string): Promise<void> {
  return apiFetch(`/api/categories/${id}`, { method: "DELETE" });
}
