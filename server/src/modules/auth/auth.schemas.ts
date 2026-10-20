import {
  EMAIL_ERROR_MESSAGE,
  newAccountEmailProblem,
  normalizeEmail,
  normalizeFullName,
  normalizeThaiMobile,
  THAI_MOBILE_ERROR_MESSAGE,
  validateFullName,
} from "@systemboq/shared-types";
import { z } from "zod";

import { newPasswordField, refinePasswordWith } from "../../lib/password-field";

/**
 * อีเมลตอน **เข้าสู่ระบบ** — ตัดช่องว่างและแปลงเป็นพิมพ์เล็กเท่านั้น ไม่เอากฎบัญชีใหม่มาใช้
 * บัญชีที่สมัครไว้ก่อนมีกฎ (เช่นโดเมน example.com) ต้องเข้าระบบตัวเองได้ต่อไป
 */
const loginEmailSchema = z
  .string()
  .transform(normalizeEmail)
  .pipe(z.string().email(EMAIL_ERROR_MESSAGE));

/**
 * อีเมลตอน **สร้างบัญชีใหม่** — normalize + รูปแบบ + กฎที่เหนือกว่ารูปแบบ (อีเมลใช้แล้วทิ้ง,
 * โดเมนที่พิมพ์ผิดบ่อย) · การเช็คว่าโดเมนรับเมลได้จริงเป็นงานที่ต้องถาม DNS จึงทำแยกที่ route
 * ด้วย domainAcceptsMail() ไม่ได้อยู่ในสคีมานี้ เพราะ safeParse เป็น sync
 */
export const newAccountEmailSchema = z
  .string()
  .transform(normalizeEmail)
  .pipe(z.string().email(EMAIL_ERROR_MESSAGE))
  .superRefine((value, ctx) => {
    const problem = newAccountEmailProblem(value);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

/**
 * ล็อกอินสองฝั่งใช้คนละกุญแจ — พนักงานใช้ชื่อผู้ใช้ ลูกค้าใช้อีเมลที่สมัครไว้
 *
 * เดิมใช้สคีมาเดียวกันทั้งคู่ (บังคับรูปแบบอีเมล) ซึ่งบังคับให้พนักงานพิมพ์อีเมลเต็มทั้งที่
 * ระบบไม่เคยส่งอีเมลถึงพนักงานเลย
 */
export const staffLoginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const customerLoginSchema = z.object({
  email: loginEmailSchema,
  password: z.string().min(1),
});

/**
 * สมัครสมาชิก — ปลายทางเดียวที่ตรวจรหัสผ่านได้ครบทุกข้อในครั้งเดียว เพราะชื่อ อีเมล และเบอร์โทร
 * ของเจ้าตัวมาในคำขอเดียวกันอยู่แล้ว (ที่อื่นต้องโหลดบัญชีขึ้นมาก่อนจึงตรวจข้อนั้นใน service)
 */
export const registerCustomerSchema = z
  .object({
    email: newAccountEmailSchema,
    password: z.string(),
    // กฎชุดเดียวกับหน้าสมัคร (shared-types) — หน้าเว็บเตือนรายช่อง เซิร์ฟเวอร์กันคำขอที่ข้ามหน้าเว็บมา
    fullName: z
      .string()
      .superRefine((v, ctx) => {
        const problem = validateFullName(v);
        if (problem) ctx.addIssue({ code: "custom", message: problem });
      })
      .transform(normalizeFullName),
    // เก็บรูปแบบมาตรฐาน 0XXXXXXXXX (ตัดขีด/ช่องว่าง, +66 → 0) แบบเดียวกับคำขอจากหน้าติดต่อเรา
    phone: z
      .string()
      .refine((v) => normalizeThaiMobile(v) !== null, THAI_MOBILE_ERROR_MESSAGE)
      .transform((v) => normalizeThaiMobile(v) ?? v),
    address: z.string().optional(),
  })
  .superRefine(refinePasswordWith((v) => [v.email, v.fullName, v.phone]));

/**
 * ลืมรหัสผ่าน — ใช้กติกาอีเมลชุด "ล็อกอิน" (แค่รูปแบบ + ตัดพิมพ์ใหญ่) ไม่ใช่ชุด "บัญชีใหม่"
 *
 * กฎบัญชีใหม่ (ปัดโดเมนใช้แล้วทิ้ง/ทักว่าพิมพ์ผิด) เอามาใช้ตรงนี้ไม่ได้ — บัญชีที่สมัครไว้ก่อน
 * มีกฎพวกนั้นจะขอตั้งรหัสใหม่ไม่ได้เลย ทั้งที่เป็นบัญชีถูกต้องที่ใช้งานอยู่จริง
 */
/** พนักงานขอลิงก์ตั้งรหัสใหม่ด้วยชื่อผู้ใช้ — ตรวจแค่รูปร่างคร่าว ๆ (ค่าเพี้ยน = ตอบเหมือนไม่มีบัญชี) */
export const staffForgotPasswordSchema = z.object({
  username: z.string().trim().min(1, "กรอกชื่อผู้ใช้").max(60),
});

export const forgotPasswordSchema = z.object({
  email: loginEmailSchema,
});

/**
 * ตั้งรหัสผ่านใหม่จากลิงก์ — token เป็น base64url ของ 32 ไบต์ (43 ตัวอักษร)
 * จำกัดความยาวไว้กันคนยิงสตริงยาว ๆ มาให้เสียเวลาแฮช
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: newPasswordField,
});

/** ยืนยันด้วยรหัส 6 หลักจากเมลแทนการกดลิงก์ — ช่องว่างที่คนพิมพ์คั่นไว้ (482 913) ตัดให้ก่อนตรวจ */
export const verifyResetCodeSchema = z.object({
  email: loginEmailSchema,
  code: z
    .string()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "รหัสต้องเป็นตัวเลข 6 หลัก")),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: newPasswordField,
});

export const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1),
});

// รหัสตอนล็อกอินขั้นที่สอง: รับได้ทั้งรหัส TOTP 6 หลัก และรหัสสำรอง (เช่น XXXX-XXXX)
export const verifyTwoFactorSchema = z.object({
  code: z.string().trim().min(6).max(20),
});

// รหัส 6 หลักจากแอปตอนเปิดใช้/สร้างรหัสสำรองใหม่
export const twoFactorTokenSchema = z.object({
  token: z.string().trim().min(6).max(10),
});

// ที่อยู่ (ไม่บังคับ): ตัดช่องว่าง, ถือว่าช่องว่าง = ไม่กรอก, จำกัดความยาวกันข้อมูลขยะ
const optionalAddress = z
  .string()
  .trim()
  .max(1000, "ที่อยู่ยาวเกินไป")
  .transform((v) => (v === "" ? undefined : v))
  .optional();

// ตั้งรหัสผ่านผ่านลิงก์เข้าใช้ครั้งเดียว (ลูกค้าที่ทีมงานสร้างบัญชีให้) — เก็บที่อยู่เพิ่มได้ (ไม่บังคับ)
// เพื่อให้ใบเสนอราคา/สัญญาพิมพ์ "ที่อยู่ผู้ว่าจ้าง" ได้โดยทีมงานไม่ต้องกรอกซ้ำ
export const redeemAccessSchema = z.object({
  password: newPasswordField,
  address: optionalAddress,
});

/**
 * ลูกค้าแก้ข้อมูลติดต่อของตัวเอง (โปรไฟล์) — ทุกช่องไม่บังคับ ส่งมาเฉพาะช่องที่ต้องการเปลี่ยน
 *
 * ช่องของนิติบุคคลต้องให้ลูกค้ากรอกเองได้ด้วย ไม่ใช่ให้พนักงานกรอกให้อย่างเดียว — บริษัทที่เข้ามา
 * ขอใบเสนอราคาเองทางเว็บจะถูกออกเอกสารในนาม "ชื่อคนที่สมัคร" จนกว่าจะมีใครสังเกตเห็นและแก้ให้
 */
export const updateProfileSchema = z.object({
  // ชื่อเจ้าของบัญชี (อยู่ที่ User ไม่ใช่ CustomerProfile) — ใช้เป็นผู้ว่าจ้างบนเอกสารเมื่อเป็นบุคคลธรรมดา
  fullName: z.string().trim().min(1, "กรุณากรอกชื่อ-นามสกุล").max(200, "ชื่อยาวเกินไป").optional(),
  phone: z.string().trim().min(6, "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง").max(30).optional(),
  address: z.string().trim().max(1000, "ที่อยู่ยาวเกินไป").nullable().optional(),
  customerType: z.enum(["INDIVIDUAL", "COMPANY"]).optional(),
  companyName: z.string().trim().max(200).nullable().optional(),
  taxId: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || /^\d{13}$/.test(v), "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก")
    .nullable()
    .optional(),
  branch: z.string().trim().max(100).nullable().optional(),
  contactPerson: z.string().trim().max(200).nullable().optional(),
});

export type StaffLoginInput = z.infer<typeof staffLoginSchema>;
export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;
export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type RedeemAccessInput = z.infer<typeof redeemAccessSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * ยืนยันอีเมลด้วยรหัส 6 หลัก — normalize อีเมลเหมือนตอนเข้าสู่ระบบ (ไม่ใช้กฎบัญชีใหม่
 * เพราะบัญชีถูกสร้างไปแล้ว) · รหัสตัดช่องว่างให้ คนมักคัดลอกมาจากเมลแล้วติดช่องว่างมาด้วย
 */
export const verifyEmailSchema = z.object({
  email: loginEmailSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "รหัสยืนยันเป็นตัวเลข 6 หลัก"),
});

export const resendCodeSchema = z.object({
  email: loginEmailSchema,
});

/** แก้อีเมลจากหน้ายืนยัน — อีเมลใหม่ใช้กฎชุดบัญชีใหม่ (เหมือนตอนสมัคร) */
export const changeSignupEmailSchema = z.object({
  email: loginEmailSchema,
  ticket: z.string().min(20).max(200),
  newEmail: newAccountEmailSchema,
});
