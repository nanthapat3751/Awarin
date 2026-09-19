import { z } from "zod";

// สเปกบ้าน: จำนวนเต็มไม่ติดลบ + เพดานกัน typo (ชั้นสูงสุด 50, ห้อง 0–50)
const floorsField = z.number().int().min(1).max(50);
const roomsField = z.number().int().min(0).max(50);
// ค่าวัดถอดปริมาณ: ไม่ติดลบ + เพดานกันค่าเพี้ยน
const measureField = z.number().min(0).max(10_000_000);

export const createHouseDesignSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อแบบบ้าน"),
  description: z.string().optional(),
  area: z.number().min(0).optional(),
  wallAreaSqm: measureField.optional(),
  perimeterM: measureField.optional(),
  concreteVolumeM3: measureField.optional(),
  footprintSqm: measureField.optional(),
  floors: floorsField.optional(),
  bedrooms: roomsField.optional(),
  bathrooms: roomsField.optional(),
  exteriorImages: z.array(z.string().url()).optional(),
  interiorImages: z.array(z.string().url()).optional(),
  plans: z.array(z.string().url()).optional(),
  published: z.boolean().optional(),
});

export const updateHouseDesignSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  area: z.number().min(0).nullable().optional(),
  wallAreaSqm: measureField.nullable().optional(),
  perimeterM: measureField.nullable().optional(),
  concreteVolumeM3: measureField.nullable().optional(),
  footprintSqm: measureField.nullable().optional(),
  floors: floorsField.nullable().optional(),
  bedrooms: roomsField.nullable().optional(),
  bathrooms: roomsField.nullable().optional(),
  exteriorImages: z.array(z.string().url()).optional(),
  interiorImages: z.array(z.string().url()).optional(),
  plans: z.array(z.string().url()).optional(),
  published: z.boolean().optional(),
  // เปิด/ปิดการแสดงในโซนแบบบ้านแนะนำของหน้าแรก
  featured: z.boolean().optional(),
});

// จัดลำดับแบบบ้านแนะนำ (ลากเรียง) — ส่งรายการ id ตามลำดับใหม่
export const reorderFeaturedHouseDesignsSchema = z.object({
  orderedIds: z.array(z.string().min(1)).max(50),
});

export type CreateHouseDesignInput = z.infer<typeof createHouseDesignSchema>;
export type UpdateHouseDesignInput = z.infer<typeof updateHouseDesignSchema>;
export type ReorderFeaturedHouseDesignsInput = z.infer<typeof reorderFeaturedHouseDesignsSchema>;
