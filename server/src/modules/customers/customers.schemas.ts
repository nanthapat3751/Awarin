import { z } from "zod";

/** เลขประจำตัวผู้เสียภาษีไทยมี 13 หลักเสมอ — "" = ล้างค่า */
const taxId = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === "" || /^\d{13}$/.test(v), "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก");

/**
 * แก้ข้อมูลติดต่อของลูกค้าจากฝั่งพนักงาน
 *
 * **ไม่มีอีเมลโดยตั้งใจ** — อีเมลคือชื่อผู้ใช้ที่ลูกค้าใช้ล็อกอิน ถ้าพนักงานแก้ได้ก็เท่ากับย้าย
 * บัญชีไปให้คนอื่นได้เงียบ ๆ การแก้อีเมลควรผ่านตัวลูกค้าเองหรือขั้นตอนที่ยืนยันตัวตนก่อน
 *
 * ทุกฟิลด์ optional = ส่งมาเฉพาะช่องที่แก้ ("" หมายถึงล้างค่าให้ว่าง ต่างจากไม่ส่งมาเลย)
 *
 * ช่องของนิติบุคคลไม่ถูกบังคับที่นี่ เพราะคำขอหนึ่งครั้งอาจส่งมาแค่ช่องเดียว — กฎ "เป็นนิติบุคคล
 * แล้วต้องมีชื่อนิติบุคคล" ตรวจที่เซอร์วิสจากสถานะปลายทางหลังรวมกับค่าที่มีอยู่เดิม
 */
export const updateCustomerSchema = z
  .object({
    fullName: z.string().trim().min(1, "กรุณากรอกชื่อ-นามสกุล").max(200).optional(),
    phone: z.string().trim().max(30).optional(),
    address: z.string().trim().max(500).optional(),
    customerType: z.enum(["INDIVIDUAL", "COMPANY"]).optional(),
    companyName: z.string().trim().max(200).optional(),
    taxId: taxId.optional(),
    branch: z.string().trim().max(100).optional(),
    contactPerson: z.string().trim().max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "ไม่มีข้อมูลที่จะแก้ไข" });

export const setCustomerActiveSchema = z.object({
  active: z.boolean(),
  /** เหตุผลตอนระงับ — เก็บไว้ให้ตอบได้ว่าทำไมบัญชีนี้ถูกปิด (ไม่บังคับตอนเปิดคืน) */
  reason: z.string().trim().max(200).optional(),
});

export const customerNoteSchema = z.object({
  body: z.string().trim().min(1, "กรุณาพิมพ์บันทึก").max(2000, "บันทึกยาวเกิน 2,000 ตัวอักษร"),
});

/**
 * ตัวเลขหน้า/ขนาดหน้าที่มากับ query string
 *
 * `coerce` เพราะค่ามาจาก URL เป็นข้อความเสมอ · ค่าที่ผิดรูปแบบไม่ทำให้คำขอพัง แต่ตกกลับไปใช้
 * ค่าเริ่มต้น (เซอร์วิสบีบให้อยู่ในช่วงที่ปลอดภัยอีกชั้น) — หน้าที่ 0 หรือติดลบไม่ควรเป็น error 400
 * ให้ผู้ใช้เห็น มันคือลิงก์เก่าหรือคนพิมพ์ URL เอง
 */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().catch(undefined),
  pageSize: z.coerce.number().int().positive().optional().catch(undefined),
});

export const customerDirectoryQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  sort: z.enum(["name", "createdAt", "lastLogin"]).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  view: z.enum(["verified", "unverified"]).optional().catch(undefined),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerNoteInput = z.infer<typeof customerNoteSchema>;
export type SetCustomerActiveInput = z.infer<typeof setCustomerActiveSchema>;
