import { z } from "zod";

/** หัวใบงานเพิ่ม-ลด — ตัวเลขทั้งหมดมาจาก BOQ ไม่รับจากหน้าจอ */
export const changeOrderInputSchema = z.object({
  title: z.string().trim().min(1, "ระบุเรื่อง เช่น ลูกค้าขอเปลี่ยนกระเบื้องห้องนอน").max(200),
  note: z.string().trim().max(2000).nullable().optional(),
  extensionDays: z.number().int().min(0).max(3650).nullable().optional(),
});
export type ChangeOrderInput = z.infer<typeof changeOrderInputSchema>;

/** อนุมัติ/ไม่อนุมัติ — ไม่อนุมัติต้องบอกเหตุผล (พนักงานต้องรู้ว่าจะแก้อะไรต่อ) */
export const decisionSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "REJECT" && !v.note) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "บอกเหตุผลที่ไม่อนุมัติด้วย" });
    }
  });
export type DecisionInput = z.infer<typeof decisionSchema>;
