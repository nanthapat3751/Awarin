import type { DashboardSummaryDto, PendingWorkDto } from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function getDashboardSummary(): Promise<{ summary: DashboardSummaryDto }> {
  return apiFetch("/api/dashboard/summary");
}

export function getPendingWork(): Promise<{ pendingWork: PendingWorkDto }> {
  return apiFetch("/api/dashboard/pending-work");
}
