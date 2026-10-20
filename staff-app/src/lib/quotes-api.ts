import type { QuoteDto, QuoteStatus } from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function listQuotes(projectId: string): Promise<{ quotes: QuoteDto[] }> {
  return apiFetch(`/api/projects/${projectId}/quotes`);
}

export function createQuote(projectId: string): Promise<{ quote: QuoteDto }> {
  return apiFetch(`/api/projects/${projectId}/quotes`, { method: "POST" });
}

export function deleteQuote(projectId: string, quoteId: string): Promise<void> {
  return apiFetch(`/api/projects/${projectId}/quotes/${quoteId}`, { method: "DELETE" });
}

export function transitionQuote(
  projectId: string,
  quoteId: string,
  toStatus: QuoteStatus,
): Promise<{ quote: QuoteDto }> {
  return apiFetch(`/api/projects/${projectId}/quotes/${quoteId}/transition`, {
    method: "POST",
    body: JSON.stringify({ toStatus }),
  });
}

/** แก้วันสุดท้ายที่ยืนราคา (YYYY-MM-DD) ของใบที่ส่งแล้ว · null = ไม่มีกำหนดหมดอายุ */
export function setQuoteValidity(
  projectId: string,
  quoteId: string,
  validUntil: string | null,
): Promise<{ quote: QuoteDto }> {
  return apiFetch(`/api/projects/${projectId}/quotes/${quoteId}/validity`, {
    method: "PATCH",
    body: JSON.stringify({ validUntil }),
  });
}

// ── ขั้นอนุมัติก่อนส่ง ──
// submit = ขออนุมัติ (ใครก็ได้) · approve/return = เจ้าของเท่านั้น · withdraw = คนที่ขอ (หรือเจ้าของ)

type ApprovalStep = "submit" | "approve" | "withdraw";

export function quoteApproval(projectId: string, quoteId: string, step: ApprovalStep): Promise<void> {
  return apiFetch<void>(`/api/projects/${projectId}/quotes/${quoteId}/approval/${step}`, { method: "POST" });
}

export function returnQuoteForChanges(projectId: string, quoteId: string, note: string): Promise<void> {
  return apiFetch<void>(`/api/projects/${projectId}/quotes/${quoteId}/approval/return`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}
