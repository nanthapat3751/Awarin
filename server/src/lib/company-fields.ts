import type { PaymentAccountDto } from "@systemboq/shared-types";

/**
 * แปลงค่าตั้งแบบข้อความ → ข้อมูลบริษัทที่พิมพ์บนเอกสาร (ฟังก์ชันล้วน ไม่แตะฐานข้อมูล)
 *
 * แยกจาก company-profile.ts ที่อ่าน DB เพื่อให้ตัวแทนค่าตัวแปรสัญญาและตัวสร้าง PDF เรียกใช้ได้
 * โดยไม่ลาก Prisma ติดมาด้วย
 */

/** ผู้มีอำนาจลงนามฝั่งบริษัท — พิมพ์ใต้เส้นเซ็น */
export interface CompanySignatory {
  name: string;
  title: string | null;
}

type SettingsLike = Record<string, string | undefined>;

function text(settings: SettingsLike, key: string): string | null {
  return settings[key]?.trim() || null;
}

export function signatoryFrom(settings: SettingsLike): CompanySignatory | null {
  const name = text(settings, "companySignatoryName");
  if (!name) return null;
  return { name, title: text(settings, "companySignatoryTitle") };
}

/**
 * บัญชีรับเงิน — ต้องมีครบสามอย่าง (ธนาคาร ชื่อบัญชี เลขที่บัญชี) จึงถือว่ามี
 * หน้าตั้งค่าบังคับให้กรอกครบหรือว่างทั้งหมดอยู่แล้ว ตรงนี้กันไว้อีกชั้นไม่ให้พิมพ์บัญชีครึ่ง ๆ กลาง ๆ
 * ออกไปถึงลูกค้า (เลขบัญชีไม่มีชื่อธนาคาร = โอนไม่ได้)
 */
export function paymentAccountFrom(settings: SettingsLike): PaymentAccountDto | null {
  const bankName = text(settings, "paymentBankName");
  const accountName = text(settings, "paymentAccountName");
  const accountNo = text(settings, "paymentAccountNo");
  if (!bankName || !accountName || !accountNo) return null;
  return {
    bankName,
    branch: text(settings, "paymentBankBranch"),
    accountName,
    accountNo,
    promptPay: text(settings, "paymentPromptPay"),
  };
}

/** "สาขา" นำหน้าให้เอง — ถ้าพนักงานพิมพ์มาแล้วก็ไม่ใส่ซ้ำ ("สาขาสาขาบางแค") */
export function branchLabel(branch: string): string {
  return branch.startsWith("สาขา") ? branch : `สาขา${branch}`;
}

/**
 * บัญชีรับเงินเป็นประโยคเดียว — ใช้แทนค่าตัวแปร {{บัญชีรับเงิน}} ในเนื้อสัญญา
 * เช่น "ธนาคารกสิกรไทย สาขาบางแค ชื่อบัญชี บริษัท ก จำกัด เลขที่บัญชี 123-4-56789-0"
 */
export function paymentAccountLine(account: PaymentAccountDto): string {
  return [
    account.bankName,
    account.branch ? branchLabel(account.branch) : null,
    `ชื่อบัญชี ${account.accountName}`,
    `เลขที่บัญชี ${account.accountNo}`,
  ]
    .filter(Boolean)
    .join(" ");
}
