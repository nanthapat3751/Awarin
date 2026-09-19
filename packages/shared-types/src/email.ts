/** ใช้ร่วมกันเพื่อให้เบราว์เซอร์และ API ปฏิเสธอีเมลผิดรูปแบบด้วยข้อความเดียวกัน */
export const EMAIL_ERROR_MESSAGE = "กรุณากรอกอีเมลให้ถูกต้อง";

/**
 * รูปอีเมลคร่าว ๆ: ส่วนหน้า@โดเมน ที่มีจุดคั่นกลางโดเมน ไม่มีช่องว่างและมี @ ตัวเดียว
 * (เขียนเป็นโค้ดแทน regex /^[^\s@]+@[^\s@]+\.[^\s@]+$/ ที่ย้อนรอยได้ยาวเมื่อโดเมนมีจุดหลายจุด
 * ผลลัพธ์ตรงกับ regex เดิมทุกกรณี)
 */
export function looksLikeEmail(value: string): boolean {
  if (/\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at < 1 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  return domain.slice(1, -1).includes(".");
}
