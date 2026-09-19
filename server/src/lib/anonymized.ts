/**
 * บัญชีที่ลูกค้าใช้สิทธิ์ขอลบข้อมูลตาม PDPA
 *
 * เราไม่ลบแถวทิ้ง เพราะโครงการ/ใบเสนอราคา/สัญญา/บันทึกกิจกรรมอ้างถึงผู้ใช้คนนี้อยู่ และต้องเก็บไว้
 * ตามข้อกำหนดด้านบัญชี จึงล้างเฉพาะฟิลด์ที่ระบุตัวตนแล้วเขียนอีเมลทับด้วยโดเมนปลอมนี้
 *
 * โดเมนนี้คือ "เครื่องหมาย" เดียวที่บอกว่าบัญชีถูกลบไปแล้ว จึงต้องอยู่ที่เดียวและใช้ร่วมกัน —
 * ทั้งตอนเขียน (auth.service) และตอนอ่านเพื่อกันไม่ให้บัญชีที่ลบแล้วถูกนำกลับมาใช้
 */
const ANONYMIZED_EMAIL_DOMAIN = "@anonymized.local";

export function anonymizedEmail(userId: string): string {
  return `deleted-${userId}${ANONYMIZED_EMAIL_DOMAIN}`;
}

/** บัญชีนี้ถูกลบตามคำขอของเจ้าของข้อมูลไปแล้วหรือยัง */
export function isAnonymized(email: string): boolean {
  return email.endsWith(ANONYMIZED_EMAIL_DOMAIN);
}
