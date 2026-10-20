import { TAKEOFF_MAX_ROWS } from "@systemboq/shared-types";
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
  // ใบถอดแบบ: ปริมาณ = ผลรวมแถว (จำนวน × ยาว × กว้าง × สูง) − แถวหัก × (1+เผื่อเสีย)
  "SHEET",
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

// มิติของใบถอดแบบเป็นเมตร — 10 กม. ก็เกินงานบ้านไปมากแล้ว กันพิมพ์ศูนย์เกินจนล้นคอลัมน์
const dimensionSchema = z.number().positive().max(10_000).nullable().optional();

/** หนึ่งแถวของใบถอดแบบ (ดู shared-types/takeoff.ts) */
export const takeoffRowInputSchema = z.object({
  label: z.string().trim().min(1, "ระบุชิ้นส่วน/ตำแหน่งของแถว").max(120),
  count: z.number().positive().max(1_000_000),
  length: dimensionSchema,
  width: dimensionSchema,
  height: dimensionSchema,
  barDia: z.number().int().min(4).max(50).nullable().optional(),
  deduct: z.boolean().optional(),
  // แถวจากตัวคิดชิ้นส่วน — ส่งกลับมาตอนแก้ใบถอดแบบ ความผูกพันกับชิ้นส่วนจะได้ไม่หาย
  memberKey: z.string().trim().min(1).max(40).nullable().optional(),
});
export type TakeoffRowInputDto = z.infer<typeof takeoffRowInputSchema>;
const takeoffRowsSchema = z.array(takeoffRowInputSchema).max(TAKEOFF_MAX_ROWS);

// ราคาเป็นบาท ว่างได้ (ยังไม่รู้ราคา) — ตัวคิดตั้งราคาวัสดุได้ก็ต่อเมื่อกรอกครบ (ตรวจใน service)
const tilePriceSchema = z.number().min(0).max(10_000_000).nullable();

/** ค่าที่กรอกในตัวคิดกระเบื้อง — รูปเดียวกับ TileCalcConfig ใน shared-types/tile.ts */
export const tileCalcSchema = z.object({
  sourceMaterialId: z.string().min(1).nullable(),
  tileName: z.string().trim().max(120),
  widthMm: z.number().min(20).max(3000),
  lengthMm: z.number().min(20).max(3000),
  thicknessMm: z.number().positive().max(50),
  jointMm: z.number().min(0).max(20),
  piecesPerBox: z.number().int().positive().max(10_000).nullable(),
  rotate: z.boolean(),
  pattern: z.enum(["STRAIGHT", "DIAGONAL", "HERRINGBONE"]),
  wastePct: z.number().min(0).max(50),
  adhesive: z
    .object({
      kgPerSqm: z.number().positive().max(30),
      bagKg: z.number().positive().max(100),
      wastePct: z.number().min(0).max(50),
      pricePerBag: tilePriceSchema,
    })
    .nullable(),
  grout: z
    .object({
      packKg: z.number().positive().max(100),
      wastePct: z.number().min(0).max(50),
      pricePerPack: tilePriceSchema,
    })
    .nullable(),
  trim: z
    .object({
      lengthM: z.number().positive().max(100_000),
      pieceLengthM: z.number().positive().max(20),
      pricePerPiece: tilePriceSchema,
    })
    .nullable(),
  tilePrice: tilePriceSchema,
  tilePriceUnit: z.enum(["SQM", "BOX", "PIECE"]),
  priced: z.boolean(),
});

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
    // ใบถอดแบบ — ต้องมีเมื่อ qtyBasis = SHEET (ปริมาณคิดจากแถวเหล่านี้ ไม่รับ quantity)
    takeoffRows: takeoffRowsSchema.optional(),
    // ตัวคิดกระเบื้อง (บรรทัดหน่วยพื้นที่) — priced = วัสดุย่อยคิดจากค่านี้แทน components ที่ส่งมา
    tileCalc: tileCalcSchema.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    const basis = v.qtyBasis ?? "MANUAL";
    if (basis === "SHEET") {
      if (!v.takeoffRows?.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["takeoffRows"], message: "ใบถอดแบบต้องมีอย่างน้อย 1 แถว" });
      }
      return;
    }
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
  // ใบถอดแบบ: ไม่ส่ง = คงแถวเดิม · ส่งมา = แทนทั้งชุด (ใช้กับ qtyBasis = SHEET)
  takeoffRows: takeoffRowsSchema.optional(),
  // ตัวคิดกระเบื้อง: ไม่ส่ง = คงค่าเดิม (และคิดวัสดุย่อยใหม่ถ้าปริมาณขยับ) · null = เลิกใช้ตัวคิด
  tileCalc: tileCalcSchema.nullable().optional(),
});

// ---------- ตัวคิดโครงสร้าง: ลงแถวใบถอดแบบหลายบรรทัดพร้อมกัน ----------

const newSheetLineSchema = z.object({
  categoryId: z.string().min(1),
  materialId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  unit: z.string().trim().min(1).max(30).optional(),
  materialUnitPrice: z.number().min(0).optional(),
  laborUnitPrice: z.number().min(0).optional(),
});

/**
 * ขนาด/เหล็กของชิ้นส่วนที่กรอกในหน้าต่าง (StructuralInput) — ตรวจโครงหลักที่นี่ ที่เหลือให้ตัวคิดตรวจเอง
 * (service เรียก structuralTakeoff ซ้ำ ถ้าตัวคิดบอกว่าข้อมูลผิดก็ไม่เก็บ)
 */
const structuralMemberSchema = z
  .object({
    kind: z.enum(["FOOTING", "COLUMN", "BEAM", "SLAB", "STAIR"]),
    label: z.string().trim().min(1).max(40),
    count: z.number().int().positive().max(100_000),
    width: z.number().positive().max(1000),
    depth: z.number().positive().max(1000),
    length: z.number().positive().max(10_000),
    settings: z.object({ cover: z.number().min(0).max(1) }).passthrough(),
  })
  .passthrough();

/** ปลายทางหนึ่งก้อน: เติมแถวลงบรรทัดเดิม (itemId) หรือสร้างบรรทัดใหม่ (newItem) */
export const applyTakeoffSchema = z.object({
  // ชิ้นส่วนที่เป็นที่มาของแถวทั้งหมดในคำขอนี้ — เก็บไว้คิดซ้ำด้วยชุดสั่งตัด (ไม่ส่ง = แถวธรรมดา)
  member: structuralMemberSchema.optional(),
  targets: z
    .array(
      z
        .object({
          itemId: z.string().min(1).optional(),
          newItem: newSheetLineSchema.optional(),
          rows: z.array(takeoffRowInputSchema).min(1).max(100),
        })
        .refine((t) => Boolean(t.itemId) !== Boolean(t.newItem), "เลือกบรรทัดเดิมหรือสร้างใหม่อย่างใดอย่างหนึ่ง"),
    )
    .min(1)
    .max(20),
});
export type ApplyTakeoffInput = z.infer<typeof applyTakeoffSchema>;

/** แก้ชิ้นส่วนที่ลงไปแล้ว = ลงทับ: ต้องส่งขนาดใหม่เสมอ · ปลายทางอย่างน้อยหนึ่งก้อน (ไม่อยากเหลืออะไร = ลบ) */
export const replaceMemberSchema = applyTakeoffSchema.extend({ member: structuralMemberSchema });
export const memberKeySchema = z.string().uuid();
/** คิดใหม่ทั้งโครงการ: apply=false = พรีวิวอย่างเดียว ไม่เขียนอะไร */
export const recomputeMembersSchema = z.object({ apply: z.boolean() });

export type CreateBoqItemInput = z.infer<typeof createBoqItemSchema>;

/**
 * เพิ่มหลายบรรทัดในครั้งเดียว (ปุ่ม "เพิ่มหลายรายการ") — ใช้สคีมาเดียวกับบรรทัดเดี่ยวทุกบรรทัด
 * เพดาน 50 กันการยิงก้อนใหญ่ที่คิดราคาทั้งเวอร์ชันซ้ำทีละบรรทัดจนคำขอค้าง
 */
export const createBoqItemsSchema = z.object({
  items: z.array(createBoqItemSchema).min(1, "เลือกอย่างน้อย 1 รายการ").max(50, "เพิ่มได้ครั้งละไม่เกิน 50 รายการ"),
});
export type UpdateBoqItemInput = z.infer<typeof updateBoqItemSchema>;
