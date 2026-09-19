import type { TemplateDetailDto, TemplateDto } from "@systemboq/shared-types";

import { apiFetch } from "./api";
import type { QtyBasis } from "./boq-api";

export function listTemplates(): Promise<{ templates: TemplateDto[] }> {
  return apiFetch("/api/templates");
}

export function getTemplate(id: string): Promise<{ template: TemplateDetailDto }> {
  return apiFetch(`/api/templates/${id}`);
}

export function deleteTemplate(id: string): Promise<void> {
  return apiFetch(`/api/templates/${id}`, { method: "DELETE" });
}

export function saveProjectAsTemplate(
  projectId: string,
  name: string,
  description?: string,
): Promise<{ template: TemplateDto }> {
  return apiFetch(`/api/projects/${projectId}/templates/save-as`, {
    method: "POST",
    body: JSON.stringify({ name, description: description?.trim() || undefined }),
  });
}

export function updateTemplate(
  id: string,
  input: { name?: string; description?: string | null },
): Promise<{ template: TemplateDto }> {
  return apiFetch(`/api/templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// แก้สูตรถอดปริมาณของบรรทัดในแม่แบบโดยตรง (index = ตำแหน่งใน structure)
export function updateTemplateItemRecipe(
  id: string,
  index: number,
  input: {
    qtyBasis: QtyBasis;
    quantity?: number;
    qtyCoefficient?: number | null;
    wasteFactorPct?: number | null;
  },
): Promise<{ template: TemplateDetailDto }> {
  return apiFetch(`/api/templates/${id}/items/${index}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function applyTemplateToProject(
  projectId: string,
  templateId: string,
): Promise<{ appliedCount: number; skippedCount: number }> {
  return apiFetch(`/api/projects/${projectId}/templates/apply`, {
    method: "POST",
    body: JSON.stringify({ templateId }),
  });
}
