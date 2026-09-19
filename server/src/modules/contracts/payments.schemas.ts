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
  method: z.enum(["TRANSFER", "CASH", "CHEQUE", "OTHER"]).default("TRANSFER"),
  reference: z.string().trim().max(200).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
};

export const recordPaymentSchema = z.object(paymentFields);
export const updatePaymentSchema = z.object(paymentFields);

/** null = ล้างวันครบกำหนดกลับเป็น "ยังไม่ถึงงวด" */
export const setInstallmentDueSchema = z.object({
  dueOn: isoDate.nullable(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
