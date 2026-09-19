import type { LeadDto, LeadStatus, ProjectDto } from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function listLeads(): Promise<{ leads: LeadDto[] }> {
  return apiFetch("/api/leads");
}

export function updateLeadStatus(id: string, status: LeadStatus): Promise<{ lead: LeadDto }> {
  return apiFetch(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function createProjectFromLead(id: string): Promise<{ project: ProjectDto }> {
  return apiFetch(`/api/leads/${id}/create-project`, { method: "POST" });
}

export function replyToLead(id: string, reply: string): Promise<{ lead: LeadDto }> {
  return apiFetch(`/api/leads/${id}/reply`, { method: "PATCH", body: JSON.stringify({ reply }) });
}

// ลบคำขอ → ย้ายเข้าถังขยะ (204 no content)
export function deleteLead(id: string): Promise<void> {
  return apiFetch(`/api/leads/${id}`, { method: "DELETE" });
}
