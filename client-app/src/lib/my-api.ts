import type {
  CustomerAttachmentDto,
  CustomerContractDto,
  CustomerQuoteDetailDto,
  CustomerQuoteSummaryDto,
  LeadDto,
  PaymentAccountDto,
} from "@systemboq/shared-types";

import { API_BASE, apiFetch, downloadFile } from "./api";

export function listMyLeads(): Promise<{ leads: LeadDto[] }> {
  return apiFetch("/api/my/leads");
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
