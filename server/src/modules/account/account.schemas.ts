import { z } from "zod";

import { newAccountEmailSchema } from "../auth/auth.schemas";

// ช่องที่เว้นว่างได้: ส่งมาเป็น "" หรือช่องว่างล้วน = ล้างค่า (เก็บ null) ไม่ใช่เก็บข้อความว่าง
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);

export const updateMyProfileSchema = z.object({
  fullName: z.string().trim().min(1, "กรุณากรอกชื่อ").max(100),
  jobTitle: optionalText(100),
  // รับเครื่องหมายคั่นได้ตามที่คนไทยพิมพ์กัน (081-234-5678, 02 123 4567 ต่อ 12) แต่ต้องมีตัวเลขพอเป็นเบอร์
  workPhone: optionalText(30).refine((v) => v == null || v.replaceAll(/\D/g, "").length >= 6, {
    message: "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง",
  }),
});

export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;

/** ตั้ง/เปลี่ยนอีเมลกู้รหัสผ่าน — ต้องใส่รหัสผ่านปัจจุบันเสมอ (กันคนที่ได้เครื่องค้างไปยึดบัญชี) */
export const setRecoveryEmailSchema = z.object({
  email: newAccountEmailSchema,
  currentPassword: z.string().min(1, "กรอกรหัสผ่านปัจจุบัน"),
});

export const verifyRecoveryEmailSchema = z.object({
  code: z
    .string()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "รหัสยืนยันเป็นตัวเลข 6 หลัก")),
});
