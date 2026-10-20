import { passwordProblem } from "@systemboq/shared-types";

// ตัดตัวที่อ่านสับสนเวลาบอกกันทางโทรศัพท์/LINE (0/O, 1/l/I) ออก
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
// สัญลักษณ์ที่เรียกชื่อง่ายเวลาบอกกันปากเปล่า — เลี่ยง ' " ` \ | ที่สับสนหรือพิมพ์ยากบนมือถือ
const SYMBOLS = "!@#$%&*?";

function pick(chars: string, n: number): string[] {
  const bytes = crypto.getRandomValues(new Uint32Array(n));
  return [...bytes].map((b) => chars[b % chars.length]);
}

/**
 * รหัสเริ่มต้นแบบสุ่มที่ผ่านกฎรหัสผ่านของระบบ (12 ตัว มีพิมพ์ใหญ่/เล็ก/ตัวเลข/อักขระพิเศษ) — ใช้ตอนเพิ่มพนักงาน
 * และรีเซ็ตรหัส เจ้าตัวถูกบังคับให้ตั้งรหัสใหม่เองตอนเข้าครั้งแรกอยู่แล้ว รหัสนี้จึงแค่ต้องปลอดภัยพอและบอกต่อง่าย
 */
export function generateTempPassword(personal: (string | null | undefined)[] = []): string {
  for (;;) {
    const chars = [...pick(UPPER, 3), ...pick(LOWER, 5), ...pick(DIGITS, 3), ...pick(SYMBOLS, 1)];
    // สลับตำแหน่ง (Fisher–Yates) ไม่ให้ขึ้นต้นด้วยพิมพ์ใหญ่ทุกครั้ง
    const order = crypto.getRandomValues(new Uint32Array(chars.length));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = order[i] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const candidate = chars.join("");
    if (passwordProblem(candidate, personal) === null) return candidate;
  }
}
