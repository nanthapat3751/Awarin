import type { SiteImageKey } from "@systemboq/shared-types";

import { apiFetch, apiUpload } from "./api";

export function getSettings(): Promise<{ settings: Record<string, string> }> {
  return apiFetch("/api/settings");
}

export function updateSettings(
  input: Partial<{
    companyName: string;
    companyAddress: string;
    companyPhone: string;
    companyTaxId: string;
    companyEmail: string;
    companyFacebook: string;
    companyYoutube: string;
    companyLine: string;
    companySignatoryName: string;
    companySignatoryTitle: string;
    paymentBankName: string;
    paymentBankBranch: string;
    paymentAccountName: string;
    paymentAccountNo: string;
    paymentPromptPay: string;
    /** ยืนราคากี่วันนับจากวันที่ส่ง — null = ไม่มีกำหนด */
    quoteValidityDays: number | null;
    /** เงื่อนไขท้ายใบเสนอราคา บรรทัดละข้อ */
    quoteTerms: string;
    /** แก้ได้เฉพาะ OWNER (เซิร์ฟเวอร์ตอบ 403 ถ้าค่าเปลี่ยน) */
    overheadProfitPercent: number;
    /** ส่วนที่เป็นค่าดำเนินการภายในอัตรารวม — null = ยังไม่แยก */
    overheadPercent: number | null;
    vatPercent: number;
  }> &
    // รูปภาพเว็บไซต์ (คีย์มาจากทะเบียน SITE_IMAGE_SLOTS) — หน้าคลังรูปส่งมาทีละคีย์
    Partial<Record<SiteImageKey, string>>,
): Promise<{ settings: Record<string, string> }> {
  return apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify(input) });
}

/** โลโก้ที่ใช้พิมพ์บนเอกสารตอนนี้ — `custom: false` = ไฟล์ตั้งต้นของระบบ */
export interface DocumentLogo {
  logo: string | null;
  custom: boolean;
}

export function getDocumentLogo(): Promise<DocumentLogo & { defaultLogo: string | null }> {
  return apiFetch("/api/settings/logo");
}

/** ส่งโลโก้สองขนาดที่ย่อแล้ว (ดู lib/logo-resize.ts) — เซิร์ฟเวอร์ตรวจแค่ว่าเป็น PNG ไม่เกินเพดาน */
export function uploadDocumentLogo(large: Blob, small: Blob): Promise<DocumentLogo> {
  const form = new FormData();
  form.append("logo", large, "logo.png");
  form.append("logoSmall", small, "logo-small.png");
  return apiUpload("/api/settings/logo", form);
}

export function resetDocumentLogo(): Promise<DocumentLogo> {
  return apiFetch("/api/settings/logo", { method: "DELETE" });
}
