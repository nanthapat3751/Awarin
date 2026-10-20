import type {
  CustomerPaymentDetailDto,
  CustomerPaymentsDto,
  CustomerAttachmentDto,
  CustomerContractDto,
  CustomerQuoteDetailDto,
  CustomerQuoteSummaryDto,
  CustomerLeadDto,
  PaymentAccountDto,
} from "@systemboq/shared-types";

import { API_BASE, apiFetch, apiUpload, downloadFile } from "./api";

export function listMyLeads(): Promise<{ leads: CustomerLeadDto[] }> {
  return apiFetch("/api/my/leads");
}

export function getMyLead(id: string): Promise<{ lead: CustomerLeadDto }> {
  return apiFetch(`/api/my/leads/${encodeURIComponent(id)}`);
}

export function listMyQuotes(): Promise<{ quotes: CustomerQuoteSummaryDto[] }> {
  return apiFetch("/api/my/quotes");
}

export function getMyQuote(id: string): Promise<{ quote: CustomerQuoteDetailDto }> {
  return apiFetch(`/api/my/quotes/${id}`);
}

export function respondToQuote(
  id: string,
  action: "ACCEPT" | "REJECT" | "REQUEST_REVISION",
  note?: string,
): Promise<{ quote: CustomerQuoteSummaryDto }> {
  return apiFetch(`/api/my/quotes/${id}/respond`, {
    method: "POST",
    body: JSON.stringify({ action, note }),
  });
}

// ดาวน์โหลดไฟล์แนบที่พนักงานเปิดให้เห็น (ใบเสนอราคา/แบบ ฉบับจริง)
export function downloadMyAttachment(
  quoteId: string,
  attachment: Pick<CustomerAttachmentDto, "id" | "fileName">,
): Promise<void> {
  return downloadFile(`/api/my/quotes/${quoteId}/attachments/${attachment.id}/download`, attachment.fileName);
}

/**
 * URL สำหรับ "เปิดดู" ไฟล์แนบในแท็บใหม่ (PDF/รูปเท่านั้น — ดู isPreviewableAttachment)
 *
 * คืนเป็น URL ตรง ๆ ไม่ผ่าน fetch/blob โดยตั้งใจ เพื่อให้ window.open ถูกเรียกในจังหวะที่ผู้ใช้กด
 * จริง ๆ ไม่งั้นตัวบล็อกป๊อปอัป (โดยเฉพาะ iOS Safari) จะกินแท็บใหม่ทิ้งเพราะมันเปิดหลัง await
 * ฝั่ง API รับคุกกี้ลูกค้าได้แม้ไม่มี header Origin เพราะเส้นทาง /api/my/* ถูกจับคู่กับคุกกี้
 * ลูกค้าไว้แล้ว (resolveCookieName) และคุกกี้เป็น SameSite=Lax จึงติดไปกับการเปิดแท็บแบบนี้
 */
export function myAttachmentPreviewUrl(quoteId: string, attachmentId: string): string {
  return `${API_BASE}/api/my/quotes/${quoteId}/attachments/${attachmentId}/preview`;
}

/** `payTo` = บัญชีรับเงินของบริษัท (null = บริษัทยังไม่ได้ตั้ง) — ใช้ร่วมทุกสัญญาในหน้า */
export function listMyContracts(): Promise<{
  contracts: CustomerContractDto[];
  payTo: PaymentAccountDto | null;
}> {
  return apiFetch("/api/my/contracts");
}

/** หน้าการชำระเงิน — ยอดที่ต้องชำระ งวดถัดไป และประวัติของทุกสัญญา */
export function listMyPayments(): Promise<{ payments: CustomerPaymentsDto }> {
  return apiFetch("/api/my/payments");
}

/** หน้าจ่ายงวดเดียว — ยอดที่ต้องโอน + QR + บัญชี + สถานะการแจ้งโอน */
export function getMyPayment(installmentId: string): Promise<{ payment: CustomerPaymentDetailDto }> {
  return apiFetch(`/api/my/payments/${installmentId}`);
}

/** แจ้งโอนเงินพร้อมสลิป (ก้อนเดียว multipart) — คืนรายการสัญญาชุดใหม่ที่มีสถานะการแจ้งแล้ว */
export function submitPaymentNotice(
  contractId: string,
  input: { installmentId: string; paidOn: string; amount: number; note: string },
  files: File[],
): Promise<{ contracts: CustomerContractDto[]; payTo: PaymentAccountDto | null }> {
  const fd = new FormData();
  fd.append("installmentId", input.installmentId);
  fd.append("paidOn", input.paidOn);
  fd.append("amount", String(input.amount));
  if (input.note) fd.append("note", input.note);
  for (const f of files) fd.append("files", f);
  return apiUpload(`/api/my/contracts/${contractId}/payment-notices`, fd);
}

/** ยกเลิกการแจ้งโอนของตัวเอง (แนบสลิปผิด/พิมพ์ยอดผิด) — ได้ระหว่างที่บริษัทยังไม่ได้ตรวจ */
export function cancelMyPaymentNotice(contractId: string, noticeId: string): Promise<{ ok: true }> {
  return apiFetch(`/api/my/contracts/${contractId}/payment-notices/${noticeId}/cancel`, { method: "POST" });
}

/** เปิดดูสลิปที่ตัวเองส่ง (navigate ตรง — path /api/my ใช้คุกกี้ลูกค้าเสมอ) */
export function myNoticeEvidenceUrl(contractId: string, noticeId: string, evidenceId: string): string {
  return `${API_BASE}/api/my/contracts/${contractId}/payment-notices/${noticeId}/evidence/${evidenceId}`;
}

/** ลูกค้าอนุมัติ/ไม่อนุมัติใบงานเพิ่ม-ลด — คืนรายการสัญญาชุดใหม่ (มูลค่าและงวดเงินขยับแล้ว) */
export function respondChangeOrder(
  contractId: string,
  changeOrderId: string,
  input: { decision: "APPROVE" | "REJECT"; note?: string | null },
): Promise<{ contracts: CustomerContractDto[]; payTo: PaymentAccountDto | null }> {
  return apiFetch(`/api/my/contracts/${contractId}/change-orders/${changeOrderId}/respond`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
