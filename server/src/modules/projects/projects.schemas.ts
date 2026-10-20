import { newAccountEmailSchema } from "../auth/auth.schemas";

import { z } from "zod";

// วันที่ (รับ "YYYY-MM-DD" หรือ ISO) → Date; null = ล้างค่า, undefined = ไม่แก้
const dateField = z.coerce.date().nullable().optional();
const notesField = z.string().trim().max(1000, "ข้อความยาวเกินไป").nullable().optional();
const areaField = z.number().min(0).max(1_000_000).nullable().optional();

// ค่าวัดโครงการสำหรับถอดปริมาณ (Phase 2) — ตัวเลข ≥ 0, null = ล้างค่า, undefined = ไม่แก้
const measureField = z.number().min(0).max(10_000_000).nullable().optional();
// ตัวขับแบบนับ (จำนวนห้องน้ำ/ชั้น) — จำนวนเต็ม ≥ 0
const countField = z.number().int().min(0).max(1000).nullable().optional();

// ช่องเปิดประตู/หน้าต่างหนึ่งแบบ (กว้าง × สูง เป็นเมตร) — ยอดรวมหักออกจากพื้นที่ผนัง
export const projectOpeningSchema = z.object({
  label: z.string().trim().min(1, "ระบุชื่อช่องเปิด เช่น D1, W2").max(80),
  count: z.number().int().min(1).max(10_000),
  width: z.number().positive().max(100),
  height: z.number().positive().max(100),
});

export const createProjectSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อโครงการ"),
  description: notesField,
  siteAddress: notesField,
  areaSqm: areaField,
  wallAreaSqm: measureField,
  perimeterM: measureField,
  concreteVolumeM3: measureField,
  footprintSqm: measureField,
  bathrooms: countField,
  floors: countField,
  startDate: dateField,
  targetEndDate: dateField,
  // ESTIMATE (ค่าเริ่มต้น) = ประเมินจาก BOQ, CUSTOM = ออกแบบใหม่/กำหนดเอง (กรอกราคาเอง + แนบไฟล์)
  type: z.enum(["ESTIMATE", "CUSTOM"]).optional(),
  customerId: z.string().min(1).nullable().optional(),
  houseDesignId: z.string().min(1).nullable().optional(),
  // ถ้าไม่ระบุจะใช้ค่าเริ่มต้นระดับบริษัท (Settings) -- ทำให้โปรเจกต์ที่เคยเสนอราคาด้วยอัตราอื่น
  // (เช่น ดีลที่ต่อรองกัน) เก็บ margin ของตัวเองไว้ได้แทน
  overheadProfitPercent: z.number().min(0).max(100).optional(),
  // ตั้งค่าเมื่อโปรเจกต์นี้ถูกสร้างจาก Lead (ดู leads.service.ts createProjectFromLead)
  // เพื่อให้สถานะวิ่งตามวงจรชีวิตของโปรเจกต์/ใบเสนอราคาอัตโนมัติ
  leadId: z.string().min(1).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: notesField,
  siteAddress: notesField,
  areaSqm: areaField,
  wallAreaSqm: measureField,
  perimeterM: measureField,
  concreteVolumeM3: measureField,
  footprintSqm: measureField,
  bathrooms: countField,
  floors: countField,
  // รายการช่องเปิด — ส่งมา = แทนทั้งชุดแล้วคิดยอดรวมใหม่ · [] หรือ null = ไม่หักช่องเปิด
  openings: z.array(projectOpeningSchema).max(200).nullable().optional(),
  startDate: dateField,
  targetEndDate: dateField,
  customerId: z.string().min(1).nullable().optional(),
  houseDesignId: z.string().min(1).nullable().optional(),
});

export const projectStatusSchema = z.enum([
  "DRAFT",
  "QUOTED",
  "APPROVED",
  "COMPLETED",
  "CANCELLED",
]);

export const transitionProjectSchema = z.object({
  toStatus: projectStatusSchema,
});

// ฝั่งพนักงาน "สร้างบัญชีลูกค้าจากคำขอ + ออกลิงก์เข้าใช้" ทุกฟิลด์เป็น optional: ถ้าเว้นไว้จะใช้
// ข้อมูลจาก lead ต้นทาง; พนักงานกรอกทับได้ (lead อาจไม่มีอีเมล หรือพิมพ์ผิด) — ไม่มีรหัสผ่าน
// เพราะลูกค้าจะตั้งเองผ่านลิงก์ ถ้าโปรเจกต์มีลูกค้าผูกอยู่แล้วจะไม่ใช้ฟิลด์เหล่านี้ (แค่ออกลิงก์ใหม่)
export const issueAccessLinkSchema = z.object({
  // บัญชีใหม่เหมือนกับหน้าสมัคร — ใช้กฎชุดเดียวกัน ไม่งั้นพนักงานพิมพ์ @gmial.com ให้ลูกค้าได้
  email: newAccountEmailSchema.optional(),
  fullName: z.string().min(1, "กรุณากรอกชื่อ-นามสกุล").optional(),
  phone: z.string().min(6, "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง").optional(),
});

// ผูก lead ที่มีอยู่ (ยังไม่ถูกผูก) เข้ากับโปรเจกต์ที่สร้างไว้แล้ว สำหรับโปรเจกต์ที่เริ่มจากศูนย์
// แทนที่จะเริ่มจาก lead -- จะดึงลูกค้า/แบบบ้านของ lead เข้ามาด้วย
export const linkLeadToProjectSchema = z.object({
  leadId: z.string().min(1),
});

// ราคาของโครงการกำหนดเอง (CUSTOM): พนักงานกรอก "ยอดก่อน VAT" (กำไรรวมอยู่ในนี้แล้ว) ระบบบวก VAT
// 7% ให้เอง กรอก 0 ได้ (ล้างราคา) แต่ต้อง > 0 ก่อนออกใบเสนอราคา -- ดู createQuote
export const setCustomPriceSchema = z.object({
  subtotalBeforeVat: z.number().min(0, "ราคาต้องไม่ติดลบ").max(1_000_000_000, "ราคาสูงเกินไป"),
});

/**
 * แก้อัตราค่าดำเนินการ+กำไร / VAT ของโครงการที่สร้างไปแล้ว
 *
 * เดิมตั้งได้ครั้งเดียวตอนสร้างโครงการ (createProjectSchema.overheadProfitPercent) และ VAT
 * บังคับใช้ค่าจากหน้าตั้งค่าเสมอ ไม่มีทางแก้ทีหลังเลย — พอต่อรองราคากับลูกค้าจึงต้องสร้าง
 * โครงการใหม่ทั้งใบ
 *
 * ส่งมาอย่างเดียวก็ได้ อีกตัวจะคงค่าเดิมไว้ แต่ต้องมีอย่างน้อยหนึ่งตัว ไม่งั้นเป็นคำขอเปล่า
 */
const discountNoteField = z.string().trim().max(200, "เหตุผลส่วนลดยาวเกินไป").optional();

/**
 * ส่วนลดกรอกได้สองแบบ เลยใช้ union แยกตาม mode แทนที่จะมีสองช่องแล้วเดาว่าผู้ใช้หมายถึงอันไหน
 * — NONE = ยกเลิกส่วนลด, PERCENT = ลดเป็น % ของราคาก่อนส่วนลด (คิดใหม่เมื่อ BOQ ขยับ),
 *   AMOUNT = ลดเป็นจำนวนเงินคงที่ตามที่ตกลงกับลูกค้า
 */
const discountPatchSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("NONE") }),
  z.object({
    mode: z.literal("PERCENT"),
    value: z.number().min(0).max(100, "ส่วนลดเกิน 100%"),
    note: discountNoteField,
  }),
  z.object({
    mode: z.literal("AMOUNT"),
    value: z.number().min(0).max(1_000_000_000),
    note: discountNoteField,
  }),
]);

export const updateVersionRatesSchema = z
  .object({
    overheadProfitPercent: z.number().min(0).max(100).optional(),
    /**
     * ส่วนที่เป็นค่าดำเนินการภายในอัตรารวม — กำไรคือส่วนที่เหลือ
     * null = ล้างการแบ่ง กลับไปเป็นก้อนรวมเหมือนเดิม
     */
    overheadPercent: z.number().min(0).max(100).nullable().optional(),
    vatPercent: z.number().min(0).max(100).optional(),
    discount: discountPatchSchema.optional(),
    /** ค่าเผื่อเหลือเผื่อขาด % ของต้นทุนตรง — 0 คือไม่เผื่อ */
    contingencyPercent: z.number().min(0).max(100).optional(),
    /** ปัดยอดสุทธิ (รวม VAT) ลงเป็นทวีคูณของหน่วยนี้ (บาท) — null = เลิกปัด */
    roundingUnit: z.union([z.literal(1), z.literal(100), z.literal(1000), z.literal(10000)]).nullable().optional(),
  })
  .refine(
    (v) =>
      v.overheadProfitPercent != null ||
      v.overheadPercent !== undefined ||
      v.vatPercent != null ||
      v.discount != null ||
      v.contingencyPercent != null ||
      v.roundingUnit !== undefined,
    { message: "ต้องระบุอัตราหรือส่วนลดอย่างน้อยหนึ่งค่า" },
  );

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type IssueAccessLinkInput = z.infer<typeof issueAccessLinkSchema>;
export type LinkLeadToProjectInput = z.infer<typeof linkLeadToProjectSchema>;
export type SetCustomPriceInput = z.infer<typeof setCustomPriceSchema>;
export type UpdateVersionRatesInput = z.infer<typeof updateVersionRatesSchema>;
