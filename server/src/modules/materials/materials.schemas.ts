import { z } from "zod";

import { materialComponentInputSchema } from "../boq/boq.schemas";

// ขนาดกระเบื้อง (ไม่บังคับ) — ตัวคิดกระเบื้องในบรรทัด BOQ หยิบไปเติมให้
const tileFields = {
  tileWidthMm: z.number().int().min(20, "ขนาดแผ่นอย่างน้อย 20 มม.").max(3000, "ขนาดแผ่นไม่เกิน 3,000 มม.").nullable().optional(),
  tileLengthMm: z.number().int().min(20, "ขนาดแผ่นอย่างน้อย 20 มม.").max(3000, "ขนาดแผ่นไม่เกิน 3,000 มม.").nullable().optional(),
  tileThicknessMm: z.number().positive("ความหนาต้องมากกว่า 0").max(50, "ความหนาไม่เกิน 50 มม.").nullable().optional(),
  tilePiecesPerBox: z.number().int("แผ่นต่อกล่องต้องเป็นจำนวนเต็ม").positive().max(10_000).nullable().optional(),
};

export const createMaterialSchema = z.object({
  categoryId: z.string().min(1).nullable().optional(),
  name: z.string().min(1, "กรุณากรอกชื่อรายการ"),
  spec: z.string().trim().max(200, "สเปกยาวเกินไป").nullable().optional(),
  unit: z.string().min(1, "กรุณากรอกหน่วยนับ"),
  supplier: z.string().trim().max(200, "ชื่อผู้จำหน่ายยาวเกินไป").nullable().optional(),
  materialUnitPrice: z.number().min(0),
  laborUnitPrice: z.number().min(0).default(0),
  wasteFactorPct: z.number().min(0).max(100).nullable().optional(),
  ...tileFields,
  // สูตรวัสดุย่อย (ว่าง = วัสดุก้อนเดียว); ถ้ามี materialUnitPrice จะถูกคิดจากผลรวมของสูตรอัตโนมัติ
  components: z.array(materialComponentInputSchema).max(60).optional(),
});

export const updateMaterialSchema = z.object({
  categoryId: z.string().min(1).nullable().optional(),
  name: z.string().min(1).optional(),
  spec: z.string().trim().max(200, "สเปกยาวเกินไป").nullable().optional(),
  unit: z.string().min(1).optional(),
  supplier: z.string().trim().max(200, "ชื่อผู้จำหน่ายยาวเกินไป").nullable().optional(),
  materialUnitPrice: z.number().min(0).optional(),
  laborUnitPrice: z.number().min(0).optional(),
  wasteFactorPct: z.number().min(0).max(100).nullable().optional(),
  ...tileFields,
  active: z.boolean().optional(),
  // ไม่ส่ง = ไม่แก้สูตร; null/[] = ล้างสูตร; มีรายการ = แทนทั้งชุด (materialUnitPrice คิดจากผลรวมใหม่)
  components: z.array(materialComponentInputSchema).max(60).nullable().optional(),
});

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
