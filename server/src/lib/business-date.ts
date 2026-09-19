/**
 * วันที่ทางธุรกิจ (ไม่มีเวลา) — วันครบกำหนดชำระ วันที่รับเงิน
 *
 * คอลัมน์ชนิด DATE ใน PostgreSQL ไม่มีเขตเวลา แต่ Prisma คืนมาเป็น Date ที่เที่ยงคืน **UTC**
 * ถ้าอ่านกลับด้วยเมธอดตามเวลาเครื่อง วันที่จะเลื่อนไปหนึ่งวันบนเครื่องที่ตั้งเขตเวลาติดลบ
 * — จึงต้องอ่าน/เขียนเป็น UTC ตลอดทาง และใช้เวลาไทยเฉพาะตอนถามว่า "วันนี้วันที่เท่าไร"
 */

/** ธุรกิจอยู่ที่นครปฐม — "วันนี้" ต้องเป็นวันตามเวลาไทย ไม่ใช่ตามนาฬิกา UTC ของเซิร์ฟเวอร์ */
export const BUSINESS_TIME_ZONE = "Asia/Bangkok";

/**
 * วันนี้ตามเวลาไทย รูปแบบ YYYY-MM-DD
 *
 * ห้ามใช้ `new Date().toISOString().slice(0, 10)` เพราะช่วงเที่ยงคืนถึงเจ็ดโมงเช้าตามเวลาไทย
 * นาฬิกา UTC ยังเป็นเมื่อวาน — งวดที่ครบกำหนดวันนี้จะยังไม่ถูกนับว่าถึงกำหนดจนกว่าจะสาย ๆ
 */
export function todayIso(): string {
  // en-CA ให้รูปแบบ YYYY-MM-DD พอดี ไม่ต้องประกอบเอง
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** อ่านคอลัมน์ DATE กลับเป็น YYYY-MM-DD (null คงเป็น null) */
export function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/**
 * "YYYY-MM-DD" → Date ที่เที่ยงคืน UTC สำหรับเขียนลงคอลัมน์ DATE
 * คืน null เมื่อรูปแบบผิดหรือไม่ใช่วันที่ที่มีอยู่จริง (เช่น 2026-02-31)
 */
export function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // กันวันที่ที่ JS ปัดให้เอง เช่น 2026-02-31 กลายเป็น 2026-03-03
  return date.toISOString().slice(0, 10) === value ? date : null;
}
