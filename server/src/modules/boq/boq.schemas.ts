import { z } from "zod";

// ฐานคำนวณปริมาณ (quantity take-off): MANUAL = กรอกเอง; ที่เหลือคิดจากค่าวัดของโครงการ ×
// สัมประสิทธิ์ × (1+เผื่อเสีย) — พื้นที่พื้น / พื้นที่ผนัง / ความยาวรอบรูป / ปริมาตร
const qtyBasisSchema = z.enum([
  "MANUAL",
  "PER_AREA",
  "PER_WALL_AREA",
  "PER_PERIMETER",
  "PER_VOLUME",
  "PER_FOOTPRINT",
  "PER_BATHROOM",
  "PER_FLOOR",
]);
// ปริมาณต่อ 1 หน่วยของตัวขับ (เช่น กระเบื้อง 1.0/ตร.ม.) — บวกได้เท่านั้น
const coefficientSchema = z.number().positive().max(100_000);
const wasteSchema = z.number().min(0).max(100);

// วัสดุย่อยหนึ่งบรรทัดในสูตรถอดปริมาณ (bill of materials) — ต่อ 1 หน่วยของรายการแม่.
// ใช้ร่วมกันทั้งตอนเพิ่ม/แก้บรรทัด BOQ และตอนตั้งสูตรในแคตตาล็อก Material (materials.schemas import ตัวนี้)
export const materialComponentInputSchema = z.object({
  // อ้างวัสดุดิบจากแคตตาล็อก (ว่าง/null = กรอกเอง) — ใช้จับกลุ่มในรายงานสรุปวัสดุ
  componentMaterialId: z.string().min(1).nullable().optional(),
  name: z.string().min(1),
  unit: z.string().min(1),
  qtyPerUnit: z.number().positive().max(1_000_000),
  wasteFactorPct: wasteSchema.nullable().optional(),
  unitPrice: z.number().min(0),
  sortOrder: z.number().int().optional(),
});
export type MaterialComponentInputDto = z.infer<typeof materialComponentInputSchema>;

export const createBoqItemSchema = z
  .object({
    categoryId: z.string().min(1),
    materialId: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    unit: z.string().min(1).optional(),
    materialUnitPrice: z.number().min(0).optional(),
    laborUnitPrice: z.number().min(0).optional(),
    // MANUAL ต้องมี quantity; PER_AREA ต้องมี qtyCoefficient (บังคับใน .superRefine)
    quantity: z.number().positive().optional(),
    qtyBasis: qtyBasisSchema.optional(),
    qtyCoefficient: coefficientSchema.nullable().optional(),
    wasteFactorPct: wasteSchema.nullable().optional(),
    sortOrder: z.number().int().optional(),
    note: z.string().optional(),
    // สูตรวัสดุย่อย (ว่าง/ไม่ส่ง = วัสดุก้อนเดียว ใช้ materialUnitPrice ที่กรอก/มาจากวัสดุ);
    // ถ้าส่งมา ราคาวัสดุต่อหน่วยจะคิดจากผลรวมของวัสดุย่อยแทน
    components: z.array(materialComponentInputSchema).max(60).optional(),
  })
  .superRefine((v, ctx) => {
    const basis = v.qtyBasis ?? "MANUAL";
    if (basis !== "MANUAL" && v.qtyCoefficient == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["qtyCoefficient"], message: "ต้องระบุปริมาณต่อ 1 หน่วย" });
    }
    if (basis === "MANUAL" && v.quantity == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quantity"], message: "ต้องระบุปริมาณ" });
    }
  });

export const updateBoqItemSchema = z.object({
  categoryId: z.string().min(1).optional(),
  // สลับวัสดุของบรรทัด: ส่ง materialId ใหม่ (หรือ null = เปลี่ยนเป็นรายการกรอกเอง)
  materialId: z.string().min(1).nullable().optional(),
  name: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  materialUnitPrice: z.number().min(0).optional(),
  laborUnitPrice: z.number().min(0).optional(),
  quantity: z.number().positive().optional(),
  qtyBasis: qtyBasisSchema.optional(),
  qtyCoefficient: coefficientSchema.nullable().optional(),
  wasteFactorPct: wasteSchema.nullable().optional(),
  sortOrder: z.number().int().optional(),
  note: z.string().nullable().optional(),
  // สูตรวัสดุย่อย: ไม่ส่ง (undefined) = ไม่แก้ของเดิม; [] = ล้างสูตร (กลับไปวัสดุก้อนเดียว);
  // มีรายการ = แทนสูตรทั้งชุดแล้วคิดราคาวัสดุต่อหน่วยใหม่จากผลรวม
  components: z.array(materialComponentInputSchema).max(60).nullable().optional(),
});

export type CreateBoqItemInput = z.infer<typeof createBoqItemSchema>;
export type UpdateBoqItemInput = z.infer<typeof updateBoqItemSchema>;
