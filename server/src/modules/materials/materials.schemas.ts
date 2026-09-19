import { z } from "zod";

import { materialComponentInputSchema } from "../boq/boq.schemas";

export const createMaterialSchema = z.object({
  categoryId: z.string().min(1).nullable().optional(),
  name: z.string().min(1, "กรุณากรอกชื่อรายการ"),
  spec: z.string().trim().max(200, "สเปกยาวเกินไป").nullable().optional(),
  unit: z.string().min(1, "กรุณากรอกหน่วยนับ"),
  supplier: z.string().trim().max(200, "ชื่อผู้จำหน่ายยาวเกินไป").nullable().optional(),
  materialUnitPrice: z.number().min(0),
  laborUnitPrice: z.number().min(0).default(0),
  wasteFactorPct: z.number().min(0).max(100).nullable().optional(),
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
  active: z.boolean().optional(),
  // ไม่ส่ง = ไม่แก้สูตร; null/[] = ล้างสูตร; มีรายการ = แทนทั้งชุด (materialUnitPrice คิดจากผลรวมใหม่)
  components: z.array(materialComponentInputSchema).max(60).nullable().optional(),
});

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
