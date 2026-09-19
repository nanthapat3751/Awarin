import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerCustomerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"),
  fullName: z.string().min(1, "กรุณากรอกชื่อ-นามสกุล"),
  phone: z.string().min(6, "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง"),
  address: z.string().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"),
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
  password: z.string().min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"),
  address: optionalAddress,
});

/**
 * ลูกค้าแก้ข้อมูลติดต่อของตัวเอง (โปรไฟล์) — ทุกช่องไม่บังคับ ส่งมาเฉพาะช่องที่ต้องการเปลี่ยน
 *
 * ช่องของนิติบุคคลต้องให้ลูกค้ากรอกเองได้ด้วย ไม่ใช่ให้พนักงานกรอกให้อย่างเดียว — บริษัทที่เข้ามา
 * ขอใบเสนอราคาเองทางเว็บจะถูกออกเอกสารในนาม "ชื่อคนที่สมัคร" จนกว่าจะมีใครสังเกตเห็นและแก้ให้
 */
export const updateProfileSchema = z.object({
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

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type RedeemAccessInput = z.infer<typeof redeemAccessSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
