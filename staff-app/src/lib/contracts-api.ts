import type {
  ContractDto,
  ContractInstallmentDto,
  ContractPaymentsViewDto,
  ContractStructureDto,
  PaymentMethod,
} from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function listContracts(projectId: string): Promise<{ contracts: ContractDto[] }> {
  return apiFetch(`/api/projects/${projectId}/contracts`);
}

export function createContract(
  projectId: string,
  templateId?: string,
): Promise<{ contract: ContractDto }> {
  return apiFetch(`/api/projects/${projectId}/contracts`, {
    method: "POST",
    body: JSON.stringify(templateId ? { templateId } : {}),
  });
}

/** แก้ถ้อยคำของสัญญาฉบับนี้ (ไม่ใช่แม่แบบ) — เซิร์ฟเวอร์ปฏิเสธถ้าลงนามไปแล้ว */
export function updateContractBody(
  projectId: string,
  contractId: string,
  input: { docTitle?: string; body: ContractStructureDto },
): Promise<{ contract: ContractDto }> {
  return apiFetch(`/api/projects/${projectId}/contracts/${contractId}/body`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function signContract(
  projectId: string,
  contractId: string,
): Promise<{ contract: ContractDto }> {
  return apiFetch(`/api/projects/${projectId}/contracts/${contractId}/sign`, { method: "POST" });
}

export function listInstallments(
  projectId: string,
  contractId: string,
): Promise<{
  installments: ContractInstallmentDto[];
  /** ยอดที่งวดต้องรวมให้ได้ — มาจากเซิร์ฟเวอร์เพราะสัญญาเก่ามี amount เป็น null */
  contractAmount: number;
  /** เนื้อสัญญามีบล็อกตารางงวดงานไหม ถ้าไม่มี งวดที่กรอกจะไม่ถูกพิมพ์ลงเอกสาร */
  printsTable: boolean;
}> {
  return apiFetch(`/api/projects/${projectId}/contracts/${contractId}/installments`);
}

/** เขียนทับทั้งชุด — เซิร์ฟเวอร์ปฏิเสธถ้ายอดรวมไม่เท่ามูลค่าสัญญา หรือสัญญาลงนามแล้ว */
export function updateInstallments(
  projectId: string,
  contractId: string,
  installments: { milestone: string; amount: number }[],
): Promise<{ installments: ContractInstallmentDto[] }> {
  return apiFetch(`/api/projects/${projectId}/contracts/${contractId}/installments`, {
    method: "PUT",
    body: JSON.stringify({ installments }),
  });
}

// ---------- ติดตามการจ่ายเงินรายงวด ----------
//
// ทุกปลายทางคืน "ภาพรวมทั้งฉบับ" กลับมาเสมอ ไม่ใช่เฉพาะแถวที่เพิ่งแก้ — เพราะการรับเงินหนึ่งครั้ง
// เปลี่ยนทั้งสถานะงวดนั้นและยอดสรุปทั้งสัญญา การประกอบผลลัพธ์เองที่หน้าจอคือทางที่ตัวเลขจะเพี้ยน

export function getContractPayments(
  projectId: string,
  contractId: string,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(`/api/projects/${projectId}/contracts/${contractId}/payments`);
}

/** null = ล้างวันครบกำหนดกลับเป็น "ยังไม่ถึงงวด" */
export function setInstallmentDue(
  projectId: string,
  contractId: string,
  installmentId: string,
  dueOn: string | null,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(
    `/api/projects/${projectId}/contracts/${contractId}/installments/${installmentId}/due`,
    { method: "PATCH", body: JSON.stringify({ dueOn }) },
  );
}

export interface PaymentInput {
  paidOn: string;
  amount: number;
  withholdingAmount: number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
}

export function recordPayment(
  projectId: string,
  contractId: string,
  installmentId: string,
  input: PaymentInput,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(
    `/api/projects/${projectId}/contracts/${contractId}/installments/${installmentId}/payments`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updatePayment(
  projectId: string,
  contractId: string,
  paymentId: string,
  input: PaymentInput,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(`/api/projects/${projectId}/contracts/${contractId}/payments/${paymentId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deletePayment(
  projectId: string,
  contractId: string,
  paymentId: string,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(`/api/projects/${projectId}/contracts/${contractId}/payments/${paymentId}`, {
    method: "DELETE",
  });
}
