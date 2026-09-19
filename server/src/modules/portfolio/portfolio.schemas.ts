import { z } from "zod";

export const portfolioTypeSchema = z.enum(["DESIGN", "CONSTRUCTION"]);

export const createPortfolioSchema = z.object({
  title: z.string().min(1, "กรุณากรอกชื่อผลงาน"),
  type: portfolioTypeSchema,
  description: z.string().optional(),
  images: z.array(z.string().url()).optional(),
  published: z.boolean().optional(),
});

export const updatePortfolioSchema = z.object({
  title: z.string().min(1).optional(),
  type: portfolioTypeSchema.optional(),
  description: z.string().nullable().optional(),
  images: z.array(z.string().url()).optional(),
  published: z.boolean().optional(),
  // เปิด/ปิดการแสดงในโซนสำรวจผลงานของหน้าบริการ
  featured: z.boolean().optional(),
});

// จัดลำดับผลงานเด่น (ลากเรียง) — ส่งรายการ id ตามลำดับใหม่
export const reorderFeaturedSchema = z.object({
  orderedIds: z.array(z.string().min(1)).max(50),
});

export type CreatePortfolioInput = z.infer<typeof createPortfolioSchema>;
export type UpdatePortfolioInput = z.infer<typeof updatePortfolioSchema>;
export type ReorderFeaturedInput = z.infer<typeof reorderFeaturedSchema>;
