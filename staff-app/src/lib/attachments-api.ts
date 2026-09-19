import type {
  AttachmentKind,
  AttachmentVisibility,
  QuoteAttachmentDto,
} from "@systemboq/shared-types";

import { API_BASE, apiFetch, apiUpload, downloadFile } from "./api";

const base = (projectId: string, quoteId: string) =>
  `/api/projects/${projectId}/quotes/${quoteId}/attachments`;

export function uploadAttachment(
  projectId: string,
  quoteId: string,
  file: File,
  kind: AttachmentKind,
  visibility: AttachmentVisibility,
): Promise<{ attachment: QuoteAttachmentDto }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  fd.append("visibility", visibility);
  return apiUpload(base(projectId, quoteId), fd);
}

export function updateAttachment(
  projectId: string,
  quoteId: string,
  attachmentId: string,
  patch: { kind?: AttachmentKind; visibility?: AttachmentVisibility },
): Promise<{ attachment: QuoteAttachmentDto }> {
  return apiFetch(`${base(projectId, quoteId)}/${attachmentId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteAttachment(
  projectId: string,
  quoteId: string,
  attachmentId: string,
): Promise<void> {
  return apiFetch(`${base(projectId, quoteId)}/${attachmentId}`, { method: "DELETE" });
}

export function downloadAttachment(
  projectId: string,
  quoteId: string,
  attachment: Pick<QuoteAttachmentDto, "id" | "fileName">,
): Promise<void> {
  return downloadFile(`${base(projectId, quoteId)}/${attachment.id}/download`, attachment.fileName);
}

/**
 * URL สำหรับ "เปิดดู" ไฟล์แนบในแท็บใหม่ (PDF/รูปเท่านั้น — ดู isPreviewableAttachment)
 *
 * คืน URL ตรง ๆ ไม่ผ่าน fetch/blob เพื่อให้แท็บถูกเปิดในจังหวะที่ผู้ใช้กดจริง ตัวบล็อกป๊อปอัป
 * จึงไม่กินทิ้ง คุกกี้พนักงานติดไปด้วยเพราะเป็น SameSite=Lax และ resolveCookieName เลือกคุกกี้
 * พนักงานให้เมื่อไม่มี header Origin (การ navigate ระดับบนสุดไม่ส่ง Origin)
 */
export function attachmentPreviewUrl(
  projectId: string,
  quoteId: string,
  attachmentId: string,
): string {
  return `${API_BASE}${base(projectId, quoteId)}/${attachmentId}/preview`;
}
