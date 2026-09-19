import { z } from "zod";

const clauseSchema = z.object({
  heading: z.string().trim().min(1, "หัวข้อต้องไม่ว่าง").max(200, "หัวข้อยาวเกินไป"),
  body: z.string().trim().min(1, "เนื้อความต้องไม่ว่าง").max(20000, "เนื้อความยาวเกินไป"),
});

export const contractStructureSchema = z.object({
  coverSubtitle: z.string().trim().max(300).default(""),
  preamble: z.string().trim().min(1, "อารัมภบทต้องไม่ว่าง").max(5000),
  clauses: z.array(clauseSchema).min(1, "ต้องมีข้อสัญญาอย่างน้อยหนึ่งข้อ").max(60),
  closing: z.string().trim().max(5000).default(""),
});

export const createContractTemplateSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อแม่แบบ").max(200),
  description: z.string().trim().max(500).nullable().optional(),
  docTitle: z.string().trim().min(1, "กรุณากรอกชื่อเอกสาร").max(200),
  structure: contractStructureSchema,
});

export const updateContractTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    docTitle: z.string().trim().min(1).max(200).optional(),
    structure: contractStructureSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "ไม่มีข้อมูลที่จะแก้ไข" });

/** แก้เนื้อสัญญาเฉพาะฉบับ (หลังแช่แข็งจากแม่แบบแล้ว) */
export const updateContractBodySchema = z.object({
  docTitle: z.string().trim().min(1).max(200).optional(),
  body: contractStructureSchema,
});

export type CreateContractTemplateInput = z.infer<typeof createContractTemplateSchema>;
export type UpdateContractTemplateInput = z.infer<typeof updateContractTemplateSchema>;
export type UpdateContractBodyInput = z.infer<typeof updateContractBodySchema>;

/** งวดการชำระเงินของสัญญาฉบับหนึ่ง — ส่งมาทั้งชุด ระบบเขียนทับของเดิมทั้งหมด */
export const updateInstallmentsSchema = z.object({
  installments: z
    .array(
      z.object({
        milestone: z.string().trim().min(1, "เงื่อนไขงวดต้องไม่ว่าง").max(500),
        amount: z.number().min(0).max(1_000_000_000),
      }),
    )
    .min(1, "ต้องมีอย่างน้อยหนึ่งงวด")
    .max(60),
});

export type UpdateInstallmentsInput = z.infer<typeof updateInstallmentsSchema>;
