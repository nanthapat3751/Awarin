import { z } from "zod";

export const saveTemplateSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อแม่แบบ"),
  description: z.string().trim().max(500, "คำอธิบายยาวเกินไป").optional(),
});

// แก้ไขชื่อ/คำอธิบายแม่แบบภายหลัง — ส่งมาเฉพาะช่องที่ต้องการเปลี่ยน (description = null เพื่อล้างค่า)
export const updateTemplateSchema = z
  .object({
    name: z.string().min(1, "กรุณากรอกชื่อแม่แบบ").optional(),
    description: z.string().trim().max(500, "คำอธิบายยาวเกินไป").nullable().optional(),
  })
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: "ไม่มีข้อมูลที่จะแก้ไข",
  });

export const applyTemplateSchema = z.object({
  templateId: z.string().min(1),
});

// แก้ "สูตรถอดปริมาณ" ของบรรทัดในแม่แบบโดยตรง (ไม่ต้อง save-as ใหม่): MANUAL ต้องมี quantity;
// ฐานอื่นต้องมี qtyCoefficient (บังคับใน superRefine) — ให้ตรงกับกติกาของ createBoqItemSchema
export const updateTemplateItemSchema = z
  .object({
    qtyBasis: z.enum([
      "MANUAL",
      "PER_AREA",
      "PER_WALL_AREA",
      "PER_PERIMETER",
      "PER_VOLUME",
      "PER_FOOTPRINT",
      "PER_BATHROOM",
      "PER_FLOOR",
    ]),
    quantity: z.number().positive().optional(),
    qtyCoefficient: z.number().positive().max(100_000).nullable().optional(),
    wasteFactorPct: z.number().min(0).max(100).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.qtyBasis === "MANUAL" && v.quantity == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quantity"], message: "ต้องระบุปริมาณ" });
    }
    if (v.qtyBasis !== "MANUAL" && v.qtyCoefficient == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["qtyCoefficient"], message: "ต้องระบุปริมาณต่อ 1 หน่วย" });
    }
  });

export type SaveTemplateInput = z.infer<typeof saveTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type ApplyTemplateInput = z.infer<typeof applyTemplateSchema>;
export type UpdateTemplateItemInput = z.infer<typeof updateTemplateItemSchema>;
