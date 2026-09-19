import { z } from "zod";

// พนักงานสร้างได้เฉพาะบทบาทภายในองค์กร (ไม่รวม CUSTOMER ซึ่งสมัครผ่านฝั่งลูกค้าเอง)
export const createStaffSchema = z.object({
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  fullName: z.string().min(1, "กรุณากรอกชื่อ-นามสกุล"),
  role: z.enum(["OWNER", "ADMIN"]),
  password: z.string().min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"),
});

export const resetStaffPasswordSchema = z.object({
  newPassword: z.string().min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"),
});

export const setStaffActiveSchema = z.object({
  active: z.boolean(),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
