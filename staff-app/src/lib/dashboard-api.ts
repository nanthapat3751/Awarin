import type {
  DashboardCashDto,
  DashboardPipelineDto,
  DashboardSummaryDto,
  PendingWorkDto,
} from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function getDashboardSummary(): Promise<{ summary: DashboardSummaryDto }> {
  return apiFetch("/api/dashboard/summary");
}

export function getPendingWork(): Promise<{ pendingWork: PendingWorkDto }> {
  return apiFetch("/api/dashboard/pending-work");
}

export function getPipeline(): Promise<{ pipeline: DashboardPipelineDto }> {
  return apiFetch("/api/dashboard/pipeline");
}

export function getContractCash(): Promise<{ cash: DashboardCashDto }> {
  return apiFetch("/api/dashboard/contract-cash");
}
