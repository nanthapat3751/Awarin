import { z } from "zod";

export const transitionQuoteSchema = z.object({
  toStatus: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "REVISED"]),
});

export type TransitionQuoteInput = z.infer<typeof transitionQuoteSchema>;

// วันสุดท้ายที่ยืนราคา (YYYY-MM-DD ตามเวลาไทย) · null = ไม่กำหนดวันหมดอายุ
export const quoteValiditySchema = z.object({
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ต้องเป็น YYYY-MM-DD")
    .nullable(),
});
