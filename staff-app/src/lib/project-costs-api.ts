import type {
  CommitmentStatus,
  ProjectCommitmentInput,
  ProjectCostInput,
  ProjectCostReportDto,
} from "@systemboq/shared-types";

import { apiFetch } from "./api";

const base = (projectId: string) => `/api/projects/${projectId}/costs`;

/** งบเทียบใช้จริง + รายการบิลทั้งหมด (ส่วนกำไรเป็น null ถ้าไม่ใช่ OWNER) */
export function getProjectCosts(projectId: string): Promise<ProjectCostReportDto> {
  return apiFetch(base(projectId));
}

export function createProjectCost(projectId: string, input: ProjectCostInput): Promise<ProjectCostReportDto> {
  return apiFetch(base(projectId), { method: "POST", body: JSON.stringify(input) });
}

export function updateProjectCost(
  projectId: string,
  costId: string,
  input: ProjectCostInput,
): Promise<ProjectCostReportDto> {
  return apiFetch(`${base(projectId)}/${costId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteProjectCost(projectId: string, costId: string): Promise<ProjectCostReportDto> {
  return apiFetch(`${base(projectId)}/${costId}`, { method: "DELETE" });
}

// ---------- ยอดผูกพัน (สั่งแล้วยังไม่จ่าย) ----------

export function createProjectCommitment(projectId: string, input: ProjectCommitmentInput): Promise<ProjectCostReportDto> {
  return apiFetch(`${base(projectId)}/commitments`, { method: "POST", body: JSON.stringify(input) });
}

export function updateProjectCommitment(
  projectId: string,
  commitmentId: string,
  input: ProjectCommitmentInput,
): Promise<ProjectCostReportDto> {
  return apiFetch(`${base(projectId)}/commitments/${commitmentId}`, { method: "PATCH", body: JSON.stringify(input) });
}

/** ปิดยอด (ไม่มีบิลตามมาอีก) / เปิดยอดอีกครั้ง */
export function setProjectCommitmentStatus(
  projectId: string,
  commitmentId: string,
  status: CommitmentStatus,
): Promise<ProjectCostReportDto> {
  return apiFetch(`${base(projectId)}/commitments/${commitmentId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export function deleteProjectCommitment(projectId: string, commitmentId: string): Promise<ProjectCostReportDto> {
  return apiFetch(`${base(projectId)}/commitments/${commitmentId}`, { method: "DELETE" });
}

/** ปิดป้ายรอออก VO: ผูกใบงานเพิ่ม-ลด หรือ (เจ้าของ) ไม่เก็บเงินลูกค้า */
export function resolveCostVo(
  projectId: string,
  target: { kind: "cost" | "commitment"; id: string },
  input: { changeOrderId?: string | null; waived?: boolean },
): Promise<ProjectCostReportDto> {
  const path = target.kind === "cost" ? `${base(projectId)}/${target.id}/vo` : `${base(projectId)}/commitments/${target.id}/vo`;
  return apiFetch(path, { method: "PATCH", body: JSON.stringify(input) });
}

// ---------- ราคาในคลังเปลี่ยนหลังเซ็นสัญญา ----------

/** ซื้อแล้ว/ล็อกราคาแล้ว — ไม่นับในยอดกระทบจนกว่าราคาคลังจะขยับอีกรอบ */
export function ackPriceDrift(projectId: string, itemId: string): Promise<ProjectCostReportDto> {
  return apiFetch(`${base(projectId)}/price-drift/${itemId}/ack`, { method: "POST" });
}

export function unackPriceDrift(projectId: string, itemId: string): Promise<ProjectCostReportDto> {
  return apiFetch(`${base(projectId)}/price-drift/${itemId}/ack`, { method: "DELETE" });
}
