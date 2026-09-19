import type { Prisma } from "@prisma/client";

/**
 * ลำดับบรรทัด BOQ ที่ทุกจุดต้องใช้ตรงกัน (หน้าจอ · PDF สองฉบับ · แม่แบบ · แตกเวอร์ชัน)
 *
 * id เป็นตัวตัดสินรองเมื่อ sortOrder เท่ากัน — บรรทัดที่เพิ่มก่อนมีปุ่มเลื่อนลำดับถูกบันทึกเป็น 0
 * ทั้งหมด และ cuid เรียงตามเวลาที่สร้าง จึงได้ "ตามลำดับที่เพิ่ม" แบบคงที่ ไม่ขึ้นกับว่า Postgres
 * จะคืนแถวลำดับไหน (ไม่ใส่ = ลำดับในใบเสนอราคาอาจสลับเองได้)
 */
export const BOQ_ITEM_ORDER: Prisma.BoqItemOrderByWithRelationInput[] = [{ sortOrder: "asc" }, { id: "asc" }];
