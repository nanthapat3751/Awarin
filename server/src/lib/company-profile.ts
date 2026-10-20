import type { PaymentAccountDto } from "@systemboq/shared-types";

import { getCompanyLogos } from "./company-logo";
import { type CompanySignatory, paymentAccountFrom, signatoryFrom } from "./company-fields";
import { getSettingsMap } from "./settings";

/**
 * ข้อมูลบริษัทที่ต้องพิมพ์บนเอกสาร รวมไว้ที่เดียว
 *
 * เดิมตัวสร้าง PDF ทั้งสามใบต่างคนต่างอ่าน companyName/Address/Phone/TaxId จากค่าตั้งเอง
 * พอมีข้อมูลเพิ่ม (อีเมล โลโก้ ผู้ลงนาม บัญชีรับเงิน) ถ้ายังเขียนแยกกันสี่ที่ วันหนึ่งจะมีเอกสาร
 * ใบหนึ่งลืมพิมพ์บางอย่างโดยไม่มีใครรู้
 */
export interface CompanyProfile {
  companyName: string;
  companyAddress: string;
  /** ภาษาอังกฤษ (ว่าง = null) — หัวใบแจ้งหนี้/ใบเสร็จ */
  companyNameEn: string | null;
  companyAddressEn: string | null;
  companyPhone: string;
  companyTaxId: string | null;
  companyEmail: string | null;
  /** จดทะเบียนภาษีมูลค่าเพิ่มแล้ว — ตัวตัดสินว่าใบเสร็จออกเป็นใบกำกับภาษีได้ไหม */
  vatRegistered: boolean;
  /** "สำนักงานใหญ่" หรือ "สาขาที่ 00001" — ใบกำกับภาษีต้องระบุ */
  companyBranch: string | null;
  /** data URI ของโลโก้ที่ใช้พิมพ์จริง (ของที่อัปโหลด หรือไฟล์ตั้งต้น) */
  logo: string | null;
  logoSmall: string | null;
  signatory: CompanySignatory | null;
  paymentAccount: PaymentAccountDto | null;
}

export async function loadCompanyProfile(): Promise<CompanyProfile> {
  const [settings, logos] = await Promise.all([getSettingsMap(), getCompanyLogos()]);
  return {
    companyName: settings.companyName ?? "-",
    companyAddress: settings.companyAddress ?? "-",
    companyNameEn: settings.companyNameEn?.trim() || null,
    companyAddressEn: settings.companyAddressEn?.trim() || null,
    companyPhone: settings.companyPhone ?? "-",
    // ค่าว่างนับเป็น "ยังไม่ได้ตั้ง" — เดิมส่ง "" ต่อไปตรง ๆ ตัวแปร {{เลขภาษีผู้รับจ้าง}} ในสัญญาจึงออกมา
    // เป็นช่องว่างเปล่า แทนที่จะเป็นเส้นประให้เขียนเติมเหมือนช่องอื่นที่ยังไม่มีค่า
    companyTaxId: settings.companyTaxId?.trim() || null,
    companyEmail: settings.companyEmail?.trim() || null,
    vatRegistered: settings.companyVatRegistered === "true",
    companyBranch: settings.companyBranch?.trim() || null,
    logo: logos.logo,
    logoSmall: logos.logoSmall,
    signatory: signatoryFrom(settings),
    paymentAccount: paymentAccountFrom(settings),
  };
}
