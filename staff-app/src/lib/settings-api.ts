import type { SiteImageKey, TakeoffRulePresets } from "@systemboq/shared-types";

import { apiFetch, apiUpload } from "./api";

/** QR ทดสอบ 1 บาทจากเลขพร้อมเพย์ที่กำลังกรอก (ยังไม่ต้องบันทึก) */
export function previewPromptPayQr(promptPay: string): Promise<{ amount: number; dataUrl: string }> {
  return apiFetch("/api/settings/promptpay-preview", { method: "POST", body: JSON.stringify({ promptPay }) });
}

/** ชุดกฎการถอดปริมาณ (ชุดเสนอราคา / ชุดสั่งตัด) — อ่านได้ทุกคนฝั่งบริษัท */
export function getTakeoffRules(): Promise<{ rules: TakeoffRulePresets }> {
  return apiFetch("/api/settings/takeoff-rules");
}

/** บันทึกชุดกฎ — เฉพาะเจ้าของ (เซิร์ฟเวอร์ปฏิเสธคนอื่น) */
export function saveTakeoffRules(rules: TakeoffRulePresets): Promise<{ rules: TakeoffRulePresets }> {
  return apiFetch("/api/settings/takeoff-rules", { method: "PUT", body: JSON.stringify({ rules }) });
}

export function getSettings(): Promise<{ settings: Record<string, string> }> {
  return apiFetch("/api/settings");
}

export function updateSettings(
  input: Partial<{
    companyName: string;
    companyAddress: string;
    companyPhone: string;
    companyTaxId: string;
    /** จดทะเบียน VAT แล้ว — เปิดได้เมื่อมีเลขผู้เสียภาษี 13 หลักและระบุสถานประกอบการ */
    companyVatRegistered: boolean;
    /** "สำนักงานใหญ่" / "สาขาที่ 00001" — พิมพ์บนใบกำกับภาษี */
    companyBranch: string;
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
    /** เงินประกันผลงานตั้งต้นของสัญญาใหม่ — null = ไม่มี */
    retentionPercent: number | null;
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
