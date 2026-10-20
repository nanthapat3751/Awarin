import { z } from "zod";

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ต้องเป็น ปปปป-ดด-วว");

const costType = z.enum(["MATERIAL", "LABOR", "SUBCONTRACT", "EQUIPMENT", "OVERHEAD", "OTHER"]);

/** สาเหตุเกินงบ — เซิร์ฟเวอร์ตรวจเองว่ารายการนี้ดันหมวดเกินงบจริงหรือไม่ (ไม่เชื่อหน้าจอ) */
const overrunFields = {
  overrunReason: z.enum(["CUSTOMER_CHANGE", "PRICE_INCREASE", "REWORK", "TAKEOFF_SHORT", "OTHER"]).nullable().optional(),
  overrunNote: z.string().trim().max(500, "รายละเอียดยาวเกิน 500 ตัวอักษร").nullable().optional(),
  /** ลูกค้าขอเปลี่ยน + ออกใบงานเพิ่ม-ลดไว้แล้ว */
  changeOrderId: z.string().min(1).nullable().optional(),
};

const moneyFields = {
  categoryId: z.string().min(1).nullable(),
  costType,
  description: z.string().trim().min(1, "กรุณาระบุรายการ").max(300, "รายการยาวเกิน 300 ตัวอักษร"),
  vendor: z.string().trim().max(200).nullable().optional(),
  reference: z.string().trim().max(100).nullable().optional(),
  /** ยอดก่อน VAT */
  amount: z.number().positive("ยอดเงินต้องมากกว่า 0").max(1_000_000_000),
  /** ภาษีซื้อในบิล — 0 = บิลไม่มี VAT */
  vatAmount: z.number().min(0).max(1_000_000_000).default(0),
  note: z.string().trim().max(1000).nullable().optional(),
};

export const projectCostSchema = z.object({
  /** วันที่ในบิล/วันที่จ่ายจริง */
  spentOn: isoDate,
  ...moneyFields,
  /** จ่ายตามยอดผูกพันใบไหน */
  commitmentId: z.string().min(1).nullable().optional(),
  ...overrunFields,
});

export const projectCommitmentSchema = z.object({
  /** วันที่สั่ง/ตกลง */
  committedOn: isoDate,
  ...moneyFields,
  ...overrunFields,
});

export const commitmentStatusSchema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });

/** ผูกใบงานเพิ่ม-ลด หรือ (เฉพาะเจ้าของ) ตัดสินใจไม่เก็บเงินลูกค้า */
export const voResolutionSchema = z
  .object({
    changeOrderId: z.string().min(1).nullable().optional(),
    waived: z.boolean().optional(),
  })
  .refine((v) => v.changeOrderId !== undefined || v.waived !== undefined, "ไม่มีอะไรให้เปลี่ยน");

export type ProjectCostInputParsed = z.infer<typeof projectCostSchema>;
export type ProjectCommitmentInputParsed = z.infer<typeof projectCommitmentSchema>;
export type VoResolutionParsed = z.infer<typeof voResolutionSchema>;
