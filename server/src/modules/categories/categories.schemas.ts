import { z } from "zod";

export const workCategoryLevelSchema = z.enum(["CATEGORY", "SUBGROUP", "ITEM"]);

export const createCategorySchema = z.object({
  parentId: z.string().min(1).nullable().optional(),
  level: workCategoryLevelSchema,
  code: z.string().min(1).optional(),
  name: z.string().min(1, "กรุณากรอกชื่อหมวดงาน"),
  description: z.string().trim().max(300, "คำอธิบายยาวเกินไป").nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateCategorySchema = z.object({
  parentId: z.string().min(1).nullable().optional(),
  code: z.string().min(1).nullable().optional(),
  name: z.string().min(1).optional(),
  description: z.string().trim().max(300, "คำอธิบายยาวเกินไป").nullable().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
