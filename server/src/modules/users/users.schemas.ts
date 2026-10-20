import { z } from "zod";

import { newPasswordField, refinePasswordWith } from "../../lib/password-field";
import { newAccountEmailSchema } from "../auth/auth.schemas";

// พนักงานสร้างได้เฉพาะบทบาทภายในองค์กร (ไม่รวม CUSTOMER ซึ่งสมัครผ่านฝั่งลูกค้าเอง)
export const createStaffSchema = z.object({
  // ชื่อเข้าระบบฝั่งบริษัท — จำกัดชุดตัวอักษรให้พิมพ์ซ้ำได้ไม่ผิด (ไม่มีช่องว่าง ไม่มีตัวพิมพ์ใหญ่
  // ที่จะทำให้คนจำสลับ) เซิร์ฟเวอร์แปลงเป็นพิมพ์เล็กก่อนบันทึกอยู่แล้ว
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัวอักษร")
    .max(30, "ชื่อผู้ใช้ยาวเกินไป")
    .regex(/^[a-z0-9][a-z0-9._-]*$/, "ใช้ได้เฉพาะ a-z 0-9 จุด ขีดกลาง ขีดล่าง และต้องขึ้นต้นด้วยตัวอักษรหรือตัวเลข"),
  fullName: z.string().min(1, "กรุณากรอกชื่อ-นามสกุล"),
  // อีเมลกู้รหัสผ่าน — ยังไม่ถือว่ายืนยันจนกว่าเจ้าตัวกรอกรหัสจากเมลในหน้าบัญชีของฉัน
  email: newAccountEmailSchema,
  role: z.enum(["OWNER", "ADMIN"]),
  password: z.string(),
}).superRefine(refinePasswordWith((v) => [v.username, v.fullName]));

/**
 * OWNER ตั้งรหัสใหม่ให้พนักงานคนอื่น — ตรวจกฎที่ไม่ต้องรู้ตัวตนที่นี่ ส่วนข้อ "ห้ามมีชื่อของ
 * เจ้าของบัญชีอยู่ในรหัส" ตรวจใน resetStaffPassword() ตอนโหลดบัญชีปลายทางขึ้นมาแล้ว
 */
export const resetStaffPasswordSchema = z.object({
  newPassword: newPasswordField,
  // พนักงานทำมือถือที่ใช้ยืนยันตัวตน 2 ชั้นหายและไม่มีรหัสสำรอง — ปิด 2FA ไปพร้อมกัน
  disableTwoFactor: z.boolean().optional().default(false),
});

export const setStaffActiveSchema = z.object({
  active: z.boolean(),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
