import { isSafeImageUrl } from "@systemboq/shared-types";
import { z } from "zod";

/**
 * ลิงก์รูปในข้อมูลที่บันทึก (แบบบ้าน · ผลงาน) — รับ 2 แบบ:
 *   - รูปที่อัปโหลดเข้าระบบ: `/uploads/<ไฟล์>` (uploadUrlMiddleware ตัดโดเมนของเราออกก่อนถึงตัวตรวจนี้)
 *   - ลิงก์รูปจากเว็บอื่น: http/https
 *
 * **ห้ามใช้ z.string().url()** — มันไม่รับ path สัมพัทธ์ รูปที่อัปโหลดทุกรูปจึงโดนตีกลับ "ข้อมูลไม่ถูกต้อง"
 * ตอนกดบันทึก (บั๊กที่ผู้ใช้เจอ 17 ต.ค.: อัปรูปแบบบ้าน/ผลงานแล้วบันทึกไม่ได้) และ .url() ยังรับ javascript: ด้วย
 * ใช้กฎเดียวกับรูปของหน้าเว็บ (isSafeImageUrl) — ค่าพวกนี้ไปอยู่ใน `<img src>` ของเว็บสาธารณะ
 */
export const imageUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(isSafeImageUrl, { message: "ลิงก์รูปต้องเป็นรูปที่อัปโหลด หรือขึ้นต้นด้วย http:// หรือ https://" });

export const imageListSchema = z.array(imageUrlSchema).max(60, "รูปมากเกินไป (ไม่เกิน 60 รูปต่อหมวด)");
