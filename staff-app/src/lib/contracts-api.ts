import type {
  ContractDto,
  ContractInstallmentDto,
  ContractPaymentsViewDto,
  ContractStructureDto,
  PaymentMethod,
  RetentionSettingsInput,
} from "@systemboq/shared-types";

import { API_BASE, apiFetch, apiUpload } from "./api";

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
  /** เงินประกันผลงานที่ผู้ว่าจ้างกันไว้จากครั้งนี้ — การรับคืนเงินประกันไม่ส่งช่องนี้ */
  retentionAmount?: number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  /** คนที่รับเงินสด/เช็คมากับมือ — เซิร์ฟเวอร์ทิ้งค่านี้ถ้าเป็นเงินโอน */
  receivedBy?: string | null;
  /** ยืนยันการแจ้งโอนของลูกค้า — สลิปของลูกค้าย้ายมาติดรายการนี้ */
  noticeId?: string | null;
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

// ---------- หลักฐานการรับเงิน ----------

const evidenceBase = (projectId: string, contractId: string, paymentId: string) =>
  `/api/projects/${projectId}/contracts/${contractId}/payments/${paymentId}/evidence`;

export function uploadPaymentEvidence(
  projectId: string,
  contractId: string,
  paymentId: string,
  file: File,
): Promise<ContractPaymentsViewDto> {
  const fd = new FormData();
  fd.append("file", file);
  return apiUpload(evidenceBase(projectId, contractId, paymentId), fd);
}

export function deletePaymentEvidence(
  projectId: string,
  contractId: string,
  paymentId: string,
  evidenceId: string,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(`${evidenceBase(projectId, contractId, paymentId)}/${evidenceId}`, { method: "DELETE" });
}

/** URL เปิดดูในแท็บใหม่ (navigate ตรง คุกกี้พนักงานติดไปเอง — ดู attachmentPreviewUrl) */
export function paymentEvidenceUrl(projectId: string, contractId: string, paymentId: string, evidenceId: string) {
  return `${API_BASE}${evidenceBase(projectId, contractId, paymentId)}/${evidenceId}`;
}

// ---------- ลูกค้าแจ้งโอน ----------

export function rejectPaymentNotice(
  projectId: string,
  contractId: string,
  noticeId: string,
  reason: string,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(`/api/projects/${projectId}/contracts/${contractId}/payment-notices/${noticeId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** ยืนยัน & ออกใบเสร็จคลิกเดียว — เฉพาะการแจ้งที่ระบบตรวจสลิปผ่าน · receiptError = บันทึกแล้วแต่ออกใบเสร็จไม่ได้ */
export function confirmPaymentNoticeBySlip(
  projectId: string,
  contractId: string,
  noticeId: string,
): Promise<ContractPaymentsViewDto & { receiptError: string | null }> {
  return apiFetch(`/api/projects/${projectId}/contracts/${contractId}/payment-notices/${noticeId}/confirm-slip`, {
    method: "POST",
  });
}

/** ตรวจสลิปอีกครั้ง — การแจ้งที่ยังตรวจไม่ได้ (เช่น สลิปที่ธนาคารให้ตรวจหลังโอนหลายนาที) */
export function recheckPaymentNoticeSlip(
  projectId: string,
  contractId: string,
  noticeId: string,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(`/api/projects/${projectId}/contracts/${contractId}/payment-notices/${noticeId}/recheck-slip`, {
    method: "POST",
  });
}

export function paymentNoticeEvidenceUrl(projectId: string, contractId: string, noticeId: string, evidenceId: string) {
  return `${API_BASE}/api/projects/${projectId}/contracts/${contractId}/payment-notices/${noticeId}/evidence/${evidenceId}`;
}

// ---------- ใบแจ้งหนี้ / ใบเสร็จรับเงิน ----------

/** วางบิลงวดหนึ่ง — กำหนดชำระในใบกลายเป็นวันครบกำหนดของงวดด้วย */
export function issueInvoice(
  projectId: string,
  contractId: string,
  installmentId: string,
  dueOn: string,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(
    `/api/projects/${projectId}/contracts/${contractId}/installments/${installmentId}/invoice`,
    { method: "POST", body: JSON.stringify({ dueOn }) },
  );
}

/** ยืนยันว่าเงินเข้าบัญชีบริษัทจริง (คนที่สองตรวจกับแอปธนาคาร) — ยืนยันแล้วลูกค้าได้รับแจ้ง */
export function verifyPayment(
  projectId: string,
  contractId: string,
  paymentId: string,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(`/api/projects/${projectId}/contracts/${contractId}/payments/${paymentId}/verify`, {
    method: "POST",
  });
}

export function issueReceipt(
  projectId: string,
  contractId: string,
  paymentId: string,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(`/api/projects/${projectId}/contracts/${contractId}/payments/${paymentId}/receipt`, {
    method: "POST",
  });
}

export function voidBillingDoc(
  projectId: string,
  contractId: string,
  docId: string,
  reason: string,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(`/api/projects/${projectId}/contracts/${contractId}/documents/${docId}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// ---------- เงินประกันผลงาน ----------

const retentionUrl = (projectId: string, contractId: string, suffix = "") =>
  `/api/projects/${projectId}/contracts/${contractId}/retention${suffix}`;

/** ตั้ง % (ก่อนลงนาม: ทุกคน · หลังลงนาม: OWNER) หรือวันครบกำหนดคืน — payments = null ถ้ายังไม่ลงนาม */
export function setRetention(
  projectId: string,
  contractId: string,
  input: RetentionSettingsInput,
): Promise<{ contract: ContractDto; payments: ContractPaymentsViewDto | null }> {
  return apiFetch(retentionUrl(projectId, contractId), { method: "PATCH", body: JSON.stringify(input) });
}

export function recordRetentionRelease(
  projectId: string,
  contractId: string,
  input: PaymentInput,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(retentionUrl(projectId, contractId, "/releases"), { method: "POST", body: JSON.stringify(input) });
}

export function updateRetentionRelease(
  projectId: string,
  contractId: string,
  releaseId: string,
  input: PaymentInput,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(retentionUrl(projectId, contractId, `/releases/${releaseId}`), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteRetentionRelease(
  projectId: string,
  contractId: string,
  releaseId: string,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(retentionUrl(projectId, contractId, `/releases/${releaseId}`), { method: "DELETE" });
}

export function issueRetentionInvoice(
  projectId: string,
  contractId: string,
  dueOn: string,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(retentionUrl(projectId, contractId, "/invoice"), { method: "POST", body: JSON.stringify({ dueOn }) });
}

export function issueRetentionReceipt(
  projectId: string,
  contractId: string,
  releaseId: string,
): Promise<ContractPaymentsViewDto> {
  return apiFetch(retentionUrl(projectId, contractId, `/releases/${releaseId}/receipt`), { method: "POST" });
}
