/**
 * การตรวจสอบชื่อ-นามสกุล ใช้ร่วมกันระหว่าง API กับหน้าเว็บฝั่งลูกค้า เพื่อให้เบราว์เซอร์และ
 * เซิร์ฟเวอร์ใช้กติกาเดียวกันเป๊ะกับช่อง "ชื่อ-นามสกุล"
 *
 * กติกาประกอบด้วยการตรวจ 3 ข้อ:
 *   1. ความยาว  — อย่างน้อย NAME_MIN_LENGTH ตัวอักษร ไม่เกิน NAME_MAX_LENGTH โดยยุบ
 *                  ช่องว่างหัวท้าย/ที่ซ้ำกันให้เหลือช่องเดียวก่อน
 *   2. เนื้อหา   — อนุญาตเฉพาะตัวอักษร (ไทย ละติน มีเครื่องหมายเสียง) สระ/วรรณยุกต์ไทย
 *                  ช่องว่าง และตัวเชื่อม . - ' เท่านั้น ตัวเลข สัญลักษณ์ และอีโมจิถูกปฏิเสธ
 *   3. รูปแบบ    — ต้องมีทั้งชื่อและนามสกุล (สองคำคั่นด้วยช่องว่าง) ตรงกับวิธีเขียนชื่อ-สกุล
 *                  ไทยพอดี เช่น "สมชาย ใจดี"
 */

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 100;

export const NAME_REQUIRED_MESSAGE = "กรุณากรอกชื่อ-นามสกุล";
export const NAME_TOO_LONG_MESSAGE = `ชื่อต้องยาวไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`;
export const NAME_CHARS_MESSAGE = "ชื่อควรมีเฉพาะตัวอักษร ไม่รวมตัวเลขหรือสัญลักษณ์";
export const NAME_FULL_MESSAGE = "กรุณากรอกทั้งชื่อและนามสกุล";

// \p{L} คือตัวอักษร + \p{M} คือเครื่องหมายประกอบ (สระ/วรรณยุกต์ไทยเป็น nonspacing mark
// ถ้าไม่ใส่ \p{M} จะทำให้ชื่อไทยปกติทั่วไปถูกปฏิเสธ) ส่วนช่องว่างและ . - ' คือตัวเชื่อม
// ที่พบในชื่อจริง เช่น "O'Brien", "ณัฐ-ชนน"
const NAME_ALLOWED_PATTERN = /^[\p{L}\p{M}\s.'-]+$/u;

/** ตัดช่องว่างหัวท้าย แล้วยุบช่องว่างที่ติดกันหลายช่องให้เหลือช่องเดียว */
export function normalizeFullName(value: string): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/**
 * คืนข้อความ error ภาษาไทยอธิบายกติกาข้อแรกที่ชื่อทำผิด หรือคืน null เมื่อผ่านทุกข้อ
 * ลำดับการตรวจเรียงจากถูก-และ-ชัดที่สุดก่อน เพื่อให้ข้อความที่ผู้ใช้เห็นชี้ไปที่ปัญหาจริง
 * (ช่องว่างเปล่าบอก "กรอกก่อน" ไม่ใช่ "ต้องมีนามสกุล")
 */
export function validateFullName(value: string): string | null {
  const normalized = normalizeFullName(value);
  if (normalized.length < NAME_MIN_LENGTH) return NAME_REQUIRED_MESSAGE;
  if (normalized.length > NAME_MAX_LENGTH) return NAME_TOO_LONG_MESSAGE;
  if (!NAME_ALLOWED_PATTERN.test(normalized)) return NAME_CHARS_MESSAGE;
  if (normalized.split(" ").length < 2) return NAME_FULL_MESSAGE;
  return null;
}

export function isValidFullName(value: string): boolean {
  return validateFullName(value) === null;
}
