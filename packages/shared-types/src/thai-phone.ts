/**
 * การจัดการเบอร์มือถือไทย ใช้ร่วมกันระหว่าง API กับหน้าเว็บทั้งสองฝั่ง เพื่อให้เบราว์เซอร์
 * และเซิร์ฟเวอร์ตัดสิน "เบอร์ที่ถูกต้อง" ตรงกันเสมอ
 *
 * รูปแบบที่รับได้ (หลังตัดตัวคั่นออกแล้ว):
 *   0XXXXXXXXX      รูปแบบในประเทศ 10 หลัก
 *   +66XXXXXXXXX    รูปแบบสากล +66 ตามด้วย 9 หลัก
 *
 * เบอร์มือถือไทยขึ้นต้น 06, 08 และ 09 — เบอร์บ้าน (02, 03x, ...) ถูกปฏิเสธโดยตั้งใจ
 * เพราะเบอร์ต้องรับ SMS ได้
 */

const MOBILE_LEADING_DIGITS = new Set(["6", "8", "9"]);

/** ลบตัวคั่นที่คนพิมพ์จริง ๆ ออก: ช่องว่าง ขีด และวงเล็บ */
export function stripPhoneSeparators(raw: string): string {
  return raw.replace(/[\s\-()]/g, "");
}

/**
 * คืนเบอร์ในรูปแบบมาตรฐานที่ใช้เก็บ `0XXXXXXXXX` หรือคืน null ถ้าไม่ใช่เบอร์มือถือไทย
 * ที่ถูกต้อง ใช้รูปแบบในประเทศเป็นมาตรฐานเพราะเป็นแบบที่พนักงานอ่านและกดโทร ส่วนตอน
 * ส่งเบอร์ให้ SMS gateway ให้ใช้ `thaiMobileToE164`
 */
export function normalizeThaiMobile(raw: string): string | null {
  const cleaned = stripPhoneSeparators(raw ?? "");
  if (cleaned === "") return null;

  let national: string;
  if (cleaned.startsWith("+66")) {
    national = cleaned.slice(3);
  } else if (cleaned.startsWith("0")) {
    national = cleaned.slice(1);
  } else {
    return null;
  }

  if (!/^\d{9}$/.test(national)) return null;
  if (!MOBILE_LEADING_DIGITS.has(national[0])) return null;

  return `0${national}`;
}

export function isValidThaiMobile(raw: string): boolean {
  return normalizeThaiMobile(raw) !== null;
}

/** `0812345678` -> `+66812345678` รูปแบบที่ SMS gateway ต้องการ */
export function thaiMobileToE164(raw: string): string | null {
  const normalized = normalizeThaiMobile(raw);
  return normalized === null ? null : `+66${normalized.slice(1)}`;
}

/** `0812345678` -> `081-234-5678` ใช้แสดงผลเท่านั้น — ห้ามเก็บรูปแบบนี้ลงฐานข้อมูล */
export function formatThaiMobile(raw: string): string {
  const normalized = normalizeThaiMobile(raw);
  if (normalized === null) return raw;
  return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

// บอกกติกาแทนที่จะยกตัวอย่าง: ตัวอย่างที่จัดรูปแบบแล้วอย่าง "081-234-5678" จะทำให้
// เข้าใจผิดว่าต้องมีขีด ทั้งที่จริงตัวคั่นถูกตัดออก และรับรูปแบบ +66 ได้ด้วย
export const THAI_MOBILE_ERROR_MESSAGE =
  "กรุณากรอกเบอร์มือถือ 10 หลัก ขึ้นต้นด้วย 06, 08 หรือ 09";
