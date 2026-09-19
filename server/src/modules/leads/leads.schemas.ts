import {
  EMAIL_ERROR_MESSAGE,
  THAI_MOBILE_ERROR_MESSAGE,
  normalizeFullName,
  normalizeThaiMobile,
  validateFullName,
} from "@systemboq/shared-types";
import { z } from "zod";

/**
 * ตรวจเบอร์มือถือไทยแล้วเขียนใหม่ให้เป็นรูปแบบมาตรฐาน `0XXXXXXXXX` เพื่อให้ทุกอย่างที่อยู่
 * ปลายทาง (รายการฝั่งพนักงาน, SMS, การจับคู่หาข้อมูลซ้ำ) เห็นรูปแบบเดียว ไม่ว่าลูกค้าจะพิมพ์มา
 * แบบไหน
 */
const thaiMobileSchema = z
  .string()
  .transform((value) => normalizeThaiMobile(value))
  .refine((value): value is string => value !== null, { message: THAI_MOBILE_ERROR_MESSAGE });

/**
 * ตัด/ยุบช่องว่าง และบังคับกติกาชื่อ-นามสกุลที่ใช้ร่วมกัน (ความยาว, ตัวอักษรเท่านั้น, มีทั้ง
 * ชื่อและนามสกุล) เพื่อให้พนักงานไม่ได้รับข้อมูลขยะอย่าง "123" หรือชื่อที่ไม่มีนามสกุล
 * ค่าที่เก็บคือรูปแบบที่ normalize แล้ว
 */
const fullNameSchema = z
  .string()
  .transform((value) => normalizeFullName(value))
  .superRefine((value, ctx) => {
    const message = validateFullName(value);
    if (message !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  });

/**
 * จำเป็น: อีเมลใช้เป็น login ของลูกค้าสำหรับพอร์ทัลด้วย ดังนั้น lead ที่ไม่มีอีเมลจะแปลงเป็น
 * บัญชีลูกค้าไม่ได้ถ้าไม่โทรกลับไปถามก่อน เก็บแบบตัดช่องว่างและแปลงเป็นตัวพิมพ์เล็ก เพื่อไม่ให้
 * คนคนเดียวกลายเป็นลูกค้าสองราย
 */
const contactEmailSchema = z.string().trim().toLowerCase().email(EMAIL_ERROR_MESSAGE);

export const createLeadSchema = z.object({
  name: fullNameSchema,
  phone: thaiMobileSchema,
  email: contactEmailSchema,
  // ฟอร์มนี้เปิดสาธารณะ (ไม่ต้องล็อกอิน) — จำกัดความยาวไว้ กันคนยิง API ตรง ๆ อัดสตริงก้อนใหญ่
  // ลงคอลัมน์นี้ (ยังคงเป็นสตริงอิสระเพราะฝั่งพนักงานเทียบกับ GENERAL_INQUIRY_SERVICE_TYPE เท่านั้น)
  serviceType: z
    .string()
    .trim()
    .min(1, "กรุณาระบุประเภทบริการที่สนใจ")
    .max(120, "ประเภทบริการยาวเกินไป"),
  houseDesignId: z.string().min(1).max(60).optional(),
  // จำกัดความยาว: ฟอร์มสาธารณะที่ไม่มีเพดานความยาวเปิดช่องให้อัดข้อความก้อนใหญ่ลง DB ได้
  message: z
    .string()
    .trim()
    .max(5000, "ข้อความยาวเกินไป")
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  // ข้อมูลโครงการเบื้องต้น (ถ้าลูกค้าทราบ) — ทุกช่อง optional; ช่องว่างที่ส่งมาจะถือว่าไม่กรอก
  // เพื่อไม่ให้เก็บสตริงว่าง/วันที่ไม่ถูกต้องลง DB แล้วไปเติม Project ให้เพี้ยน
  siteAddress: z
    .string()
    .trim()
    .max(1000, "ที่อยู่ยาวเกินไป")
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  areaSqm: z.number().min(0).max(1_000_000).optional(),
  desiredStartDate: z.coerce.date().optional(),
  // รับเฉพาะลิงก์ http/https จริง และจำกัดจำนวน — กัน javascript:/data: (ที่ new URL() มองว่าถูก)
  // หลุดลงมาเป็น stored XSS หากในอนาคตมีการเรนเดอร์ไฟล์แนบเป็นลิงก์บนหน้าพนักงาน
  attachments: z
    .array(
      z
        .string()
        .trim()
        .url()
        .max(2000)
        .refine((u) => /^https?:\/\//i.test(u), { message: "ลิงก์ไม่ถูกต้อง" }),
    )
    .max(20, "ไฟล์แนบมากเกินไป")
    .optional(),
});

export const leadStatusSchema = z.enum(["NEW", "CONTACTED", "QUOTED", "CLOSED", "REJECTED"]);

export const updateLeadStatusSchema = z.object({
  status: leadStatusSchema,
});

export const replyLeadSchema = z.object({
  reply: z.string().trim().min(1, "กรุณาระบุข้อความตอบกลับ").max(2000),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
