import { looksLikeEmail } from "@systemboq/shared-types";
import { SITE_IMAGE_KEYS, isSafeImageUrl } from "@systemboq/shared-types";
import { z } from "zod";

import { isValidPromptPayId } from "../../lib/promptpay";

import { MAX_QUOTE_VALIDITY_DAYS } from "../../lib/quote-terms";

export const PAYMENT_ACCOUNT_KEYS = [
  "paymentBankName",
  "paymentBankBranch",
  "paymentAccountName",
  "paymentAccountNo",
  "paymentPromptPay",
] as const;

/** ตัวเลขล้วน — เลขบัญชี/พร้อมเพย์พิมพ์ขีดหรือเว้นวรรคมาได้ */
function digitCount(value: string): number {
  return value.replace(/\D/g, "").length;
}

const DIGITS_AND_SEPARATORS = /^[\d\s-]*$/;

// อนุญาตเฉพาะคีย์ใน whitelist นี้ — Setting เป็นที่เก็บ key/value แบบอิสระ แต่มีแค่คีย์เหล่านี้
// ที่ตั้งใจให้แก้ผ่านแอปได้ (คีย์อื่นอาจถูกเพิ่มมาจากฟีเจอร์ในอนาคต)
export const EDITABLE_SETTING_KEYS = [
  "companyName",
  "companyAddress",
  // ชื่อ/ที่อยู่ภาษาอังกฤษ — หัวใบแจ้งหนี้/ใบเสร็จตามแบบฟอร์มของบริษัท (ว่าง = ไม่พิมพ์)
  "companyNameEn",
  "companyAddressEn",
  "companyPhone",
  // ใช้พิมพ์บนหัวเอกสาร (ใบเสนอราคา/BOQ/สัญญา) — ไม่อยู่ใน PUBLIC_SETTING_KEYS
  // เพราะเว็บสาธารณะไม่ต้องใช้
  "companyTaxId",
  // จดทะเบียนภาษีมูลค่าเพิ่มหรือยัง ("true"/"") + สถานประกอบการ — ใบเสร็จจะเป็น "ใบเสร็จรับเงิน/
  // ใบกำกับภาษี" ก็ต่อเมื่อช่องนี้เป็นจริง (มีเลขผู้เสียภาษีไม่ได้แปลว่าจด VAT — นิติบุคคลทุกรายมีเลข)
  "companyVatRegistered",
  "companyBranch",
  "companyEmail",
  "companyFacebook",
  "companyYoutube",
  "companyLine",
  // ผู้มีอำนาจลงนาม — พิมพ์ใต้เส้นเซ็นฝั่งบริษัท (สัญญาตรึงค่าไว้ตอนออกฉบับ)
  "companySignatoryName",
  "companySignatoryTitle",
  // บัญชีรับเงิน — ไม่อยู่ในชุดสาธารณะ ลูกค้าเห็นผ่านหน้าสัญญาของตัวเองเท่านั้น (ต้องล็อกอิน)
  ...PAYMENT_ACCOUNT_KEYS,
  // ค่าตั้งต้นของใบเสนอราคา — ตรึงลงใบตอนกดส่ง (Quote.validUntil / Quote.terms)
  "quoteValidityDays",
  "quoteTerms",
  "overheadProfitPercent",
  // ส่วนที่เป็น "ค่าดำเนินการ" ภายใน overheadProfitPercent — กำไรคือส่วนที่เหลือ
  // ค่าว่าง = ยังไม่ได้แยก (โครงการใหม่จะไม่มีการแบ่งติดมาด้วย)
  "overheadPercent",
  "vatPercent",
  // เงินประกันผลงานตั้งต้นของสัญญาใหม่ (%) — ค่าว่าง = ไม่มี (ไม่เดา 5% ให้)
  "retentionPercent",
  // รูปภาพของเว็บไซต์สาธารณะ (ทะเบียนช่องอยู่ใน @systemboq/shared-types → SITE_IMAGE_SLOTS)
  ...SITE_IMAGE_KEYS,
] as const;

/**
 * คีย์ที่แก้ได้เฉพาะเจ้าของระบบ (OWNER) — อัตรากำไรคือการตัดสินใจทางธุรกิจของเจ้าของ
 * ADMIN ยังเห็นค่าได้ (ต้องใช้คิดราคา) แต่เปลี่ยนไม่ได้ · VAT ไม่อยู่ในชุดนี้
 */
export const OWNER_ONLY_SETTING_KEYS = ["overheadProfitPercent", "overheadPercent"] as const;

// ชุดย่อยที่ปลอดภัยให้เปิดเผยบน client-app แบบสาธารณะ/ไม่ต้องล็อกอิน — อัตรา margin เก็บไว้ภายใน
export const PUBLIC_SETTING_KEYS = [
  "companyName",
  "companyAddress",
  "companyPhone",
  "companyEmail",
  "companyFacebook",
  "companyYoutube",
  "companyLine",
  // เว็บลูกค้าต้องอ่านได้โดยไม่ต้องล็อกอิน จึงอยู่ในชุดสาธารณะด้วย
  ...SITE_IMAGE_KEYS,
] as const;

export const updateSettingsSchema = z.object({
  companyName: z.string().min(1).optional(),
  companyAddress: z.string().optional(),
  companyNameEn: z.string().trim().max(200, "ชื่อภาษาอังกฤษยาวเกิน 200 ตัวอักษร").optional(),
  companyAddressEn: z.string().trim().max(500, "ที่อยู่ภาษาอังกฤษยาวเกิน 500 ตัวอักษร").optional(),
  companyPhone: z.string().optional(),
  companyTaxId: z.string().optional(),
  companyVatRegistered: z.boolean().optional(),
  companyBranch: z.string().trim().max(60, "สาขายาวเกิน 60 ตัวอักษร").optional(),
  // อีเมลขึ้นทั้งบนหัวเอกสารและเว็บสาธารณะ (ลิงก์ mailto:) — ผิดรูปแบบแล้วลูกค้ากดส่งไม่ถึง
  companyEmail: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === "" || looksLikeEmail(v), {
      message: "อีเมลไม่ถูกต้อง",
    })
    .optional(),
  companyFacebook: z.string().optional(),
  companyYoutube: z.string().optional(),
  companyLine: z.string().optional(),
  companySignatoryName: z.string().max(120).optional(),
  companySignatoryTitle: z.string().max(120).optional(),
  paymentBankName: z.string().max(120).optional(),
  paymentBankBranch: z.string().max(120).optional(),
  paymentAccountName: z.string().max(200).optional(),
  // เลขบัญชีธนาคารไทยยาว 10 หลัก (ธนาคารของรัฐบางแห่ง 12) — ผิดไปหลักเดียวเงินลูกค้าเข้าบัญชีคนอื่น
  paymentAccountNo: z
    .string()
    .refine(
      (v) =>
        v.trim() === "" ||
        (DIGITS_AND_SEPARATORS.test(v) && digitCount(v) >= 10 && digitCount(v) <= 12),
      { message: "เลขที่บัญชีต้องเป็นตัวเลข 10–12 หลัก" },
    )
    .optional(),
  // พร้อมเพย์ของนิติบุคคล = เลขประจำตัวผู้เสียภาษี 13 หลัก · ของบุคคล = เบอร์มือถือ 10 หลัก
  paymentPromptPay: z
    .string()
    .refine(
      (v) =>
        v.trim() === "" ||
        // เบอร์มือถือต้องขึ้นต้น 0 — ไม่งั้นแปลงเป็นบัญชีพร้อมเพย์ไม่ได้ QR จะหายไปเงียบ ๆ
        (DIGITS_AND_SEPARATORS.test(v) && isValidPromptPayId(v) && [10, 13].includes(digitCount(v))),
      { message: "พร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก (ขึ้นต้น 0) หรือเลขประจำตัวผู้เสียภาษี 13 หลัก" },
    )
    .optional(),
  // null = ไม่กำหนดยืนราคา (ใบที่ส่งจากนี้ไม่มีวันหมดอายุ)
  quoteValidityDays: z
    .number()
    .int("จำนวนวันต้องเป็นจำนวนเต็ม")
    .min(1, "ยืนราคาอย่างน้อย 1 วัน")
    .max(MAX_QUOTE_VALIDITY_DAYS, `ยืนราคาได้ไม่เกิน ${MAX_QUOTE_VALIDITY_DAYS} วัน`)
    .nullable()
    .optional(),
  quoteTerms: z.string().max(2000, "เงื่อนไขยาวเกิน 2,000 ตัวอักษร").optional(),
  overheadProfitPercent: z.number().min(0).max(100).optional(),
  // null = ล้างการแบ่ง (กลับไปเป็นก้อนรวมเหมือนเดิม)
  overheadPercent: z.number().min(0).max(100).nullable().optional(),
  vatPercent: z.number().min(0).max(100).optional(),
  // null = สัญญาใหม่ไม่มีเงินประกันผลงาน
  retentionPercent: z.number().min(0).max(20, "เงินประกันผลงานไม่ควรเกิน 20%").nullable().optional(),
  // ค่าเหล่านี้ถูกเสิร์ฟให้คนทั่วไปแล้วเอาไปใส่ `<img src>` — ต้องกัน javascript:/data:
  // ไม่ให้ถูกบันทึกเป็นค่าไว้ตั้งแต่แรก (stored XSS) ค่าว่าง = กลับไปใช้รูปเริ่มต้น
  ...Object.fromEntries(
    SITE_IMAGE_KEYS.map((key) => [
      key,
      z
        .string()
        .max(2048)
        .refine((v) => v.trim() === "" || isSafeImageUrl(v), {
          message: "ต้องเป็นลิงก์ http/https หรือเส้นทางในเว็บที่ขึ้นต้นด้วย /",
        })
        .optional(),
    ]),
  ),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** ชุดกฎหนึ่งชุด — ค่ามาตรฐานมีเพดานกันพิมพ์ผิดจนตัวคิดได้เลขเพี้ยน (ทาบ 400d / เหล็กยาว 0) */
const takeoffRuleSetSchema = z.object({
  deductCover: z.boolean(),
  bends: z.boolean(),
  laps: z.boolean(),
  hooks: z.boolean(),
  fullDepthLayers: z.boolean(),
  lapFactor: z.number().min(10).max(100),
  bendFactor: z.number().min(0).max(50),
  stockLength: z.number().min(3).max(20),
  hookFactor: z.number().min(0).max(30),
});

export const takeoffRulesSchema = z.object({
  tender: takeoffRuleSetSchema.extend({
    // ขนาดเหล็ก (มม.) → เผื่อเสีย % · null = ไม่ใส่ให้
    wastePct: z.record(z.string().regex(/^\d{1,2}$/), z.number().min(0).max(50).nullable()),
  }),
  site: takeoffRuleSetSchema,
});
