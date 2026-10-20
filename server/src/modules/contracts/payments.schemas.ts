import { z } from "zod";

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ต้องเป็น ปปปป-ดด-วว");

const paymentFields = {
  /** วันที่ได้รับเงินจริง ไม่ใช่วันที่นั่งบันทึก */
  paidOn: isoDate,
  amount: z.number().positive("ยอดที่รับต้องมากกว่า 0").max(1_000_000_000),
  /** 0 = ไม่ได้ถูกหัก (ลูกค้าบุคคลธรรมดา) — เซิร์ฟเวอร์ตรวจอีกชั้นว่าต้องน้อยกว่ายอดที่รับ */
  withholdingAmount: z.number().min(0).max(1_000_000_000).default(0),
  /** เงินประกันผลงานที่ผู้ว่าจ้างกันไว้จากครั้งนี้ (0 = ไม่กัน) — การรับคืนเงินประกันไม่ใช้ช่องนี้ */
  retentionAmount: z.number().min(0).max(1_000_000_000).default(0),
  method: z.enum(["TRANSFER", "CASH", "CHEQUE", "OTHER"]).default("TRANSFER"),
  reference: z.string().trim().max(200).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  /** คนที่รับเงินสด/เช็คมากับมือ — เซิร์ฟเวอร์ทิ้งค่านี้ถ้าช่องทางเป็นโอน */
  receivedBy: z.string().trim().max(120).nullable().optional(),
};

export const recordPaymentSchema = z.object({
  ...paymentFields,
  /** ยืนยันการแจ้งโอนของลูกค้า — รายการนี้กลายเป็นผลของการแจ้งนั้น และสลิปย้ายมาติด */
  noticeId: z.string().min(1).nullable().optional(),
});
export const updatePaymentSchema = z.object(paymentFields);

/** null = ล้างวันครบกำหนดกลับเป็น "ยังไม่ถึงงวด" */
export const setInstallmentDueSchema = z.object({
  dueOn: isoDate.nullable(),
});

/** วางบิล: กำหนดชำระในใบ = วันครบกำหนดของงวด */
export const issueInvoiceSchema = z.object({ dueOn: isoDate });

/** ยกเลิกใบแจ้งหนี้/ใบเสร็จต้องมีเหตุผลเสมอ — เป็นร่องรอยเดียวว่าทำไมเลขที่นี้ใช้ไม่ได้ */
export const voidBillingDocSchema = z.object({
  reason: z.string().trim().min(1, "กรุณาระบุเหตุผลที่ยกเลิก").max(300, "เหตุผลยาวเกิน 300 ตัวอักษร"),
});

/** ตั้งเงินประกันผลงาน — ส่งเฉพาะช่องที่จะเปลี่ยน · pct null/0 = ไม่มีเงินประกัน */
export const setRetentionSchema = z
  .object({
    pct: z.number().min(0).max(20, "เงินประกันผลงานไม่ควรเกิน 20%").nullable().optional(),
    dueOn: isoDate.nullable().optional(),
  })
  .refine((v) => v.pct !== undefined || v.dueOn !== undefined, { message: "ไม่มีอะไรให้บันทึก" });

/** วางบิลคืนเงินประกันผลงาน */
export const issueRetentionInvoiceSchema = z.object({ dueOn: isoDate });

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
