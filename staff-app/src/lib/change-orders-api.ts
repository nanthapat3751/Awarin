import type { ChangeOrderPreviewDto, ContractChangeOrdersDto } from "@systemboq/shared-types";

import { apiFetch } from "./api";

/** ใบงานเพิ่ม-ลดของสัญญาหนึ่งฉบับ — ทุกคำสั่งคืนรายการชุดล่าสุดกลับมาให้วาดใหม่ทันที */
const base = (projectId: string, contractId: string) => `/api/projects/${projectId}/contracts/${contractId}/change-orders`;

export interface ChangeOrderInput {
  title: string;
  note?: string | null;
  extensionDays?: number | null;
}

export function listChangeOrders(projectId: string, contractId: string): Promise<ContractChangeOrdersDto> {
  return apiFetch(base(projectId, contractId));
}

/** ตัวอย่างก่อนออกใบ — เทียบ BOQ ตามสัญญากับ BOQ ล่าสุด ยังไม่บันทึกอะไร */
export function previewChangeOrder(projectId: string, contractId: string): Promise<ChangeOrderPreviewDto> {
  return apiFetch(`${base(projectId, contractId)}/preview`);
}

export function createChangeOrder(projectId: string, contractId: string, input: ChangeOrderInput): Promise<ContractChangeOrdersDto> {
  return apiFetch(base(projectId, contractId), { method: "POST", body: JSON.stringify(input) });
}

export function updateChangeOrder(
  projectId: string,
  contractId: string,
  id: string,
  input: ChangeOrderInput,
): Promise<ContractChangeOrdersDto> {
  return apiFetch(`${base(projectId, contractId)}/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function changeOrderAction(
  projectId: string,
  contractId: string,
  id: string,
  action: "refresh" | "send" | "cancel",
): Promise<ContractChangeOrdersDto> {
  return apiFetch(`${base(projectId, contractId)}/${id}/${action}`, { method: "POST" });
}

/** บันทึกผลจากใบที่ลูกค้าเซ็นกระดาษ */
export function recordChangeOrderDecision(
  projectId: string,
  contractId: string,
  id: string,
  input: { decision: "APPROVE" | "REJECT"; note?: string | null },
): Promise<ContractChangeOrdersDto> {
  return apiFetch(`${base(projectId, contractId)}/${id}/decision`, { method: "POST", body: JSON.stringify(input) });
}
