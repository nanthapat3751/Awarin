import crypto from "node:crypto";

import { authenticator } from "otplib";
import QRCode from "qrcode";

// ชื่อผู้ออก (issuer) ที่จะโชว์ในแอป Google Authenticator
const ISSUER = "Awarin Engineering";

// ยอมรับรหัสของช่วงก่อนหน้า/ถัดไป 3 ช่วง (รวม ±90 วิ) เผื่อเวลาเครื่อง/มือถือคลาดกัน — เป็น
// สาเหตุอันดับหนึ่งของ "รหัสถูกแต่ระบบว่าผิด"; กว้างขึ้นเล็กน้อยเพื่อ UX โดยยังปลอดภัยพอ (มี
// rate limit กันเดารหัสอยู่แล้ว)
authenticator.options = { window: 3 };

const BACKUP_CODE_COUNT = 10;
// ชุดอักขระอ่านง่าย (ตัด 0/O/1/I ที่สับสน); 256 หารด้วย 32 ลงตัว → byte % 32 กระจายเท่ากันไม่มี bias
const BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** สร้าง TOTP secret (base32) สำหรับผูกกับแอป Authenticator */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** URI มาตรฐาน otpauth:// สำหรับสร้าง QR ให้สแกน */
export function buildOtpAuthUri(accountEmail: string, secret: string): string {
  return authenticator.keyuri(accountEmail, ISSUER, secret);
}

/** เรนเดอร์ QR เป็น data URL (PNG) ฝั่ง server เพื่อให้ frontend แค่ <img src> ได้เลย */
export function buildQrDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri, { margin: 1, width: 220 });
}

/** ตรวจรหัส 6 หลักจากแอปกับ secret (รองรับช่วงเวลาคลาดเล็กน้อยตาม window ด้านบน) */
export function verifyTotp(token: string, secret: string): boolean {
  const cleaned = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  try {
    return authenticator.verify({ token: cleaned, secret });
  } catch {
    return false;
  }
}

/** ทำให้รหัสสำรองอยู่ในรูปมาตรฐานก่อนแฮช/เทียบ (ตัดช่องว่าง/ขีด แล้วพิมพ์ใหญ่) */
export function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

/** แฮชรหัสสำรอง (sha256) — รหัสสุ่มเอนโทรปีสูงพอ จึงไม่ต้องใช้ argon2 */
export function hashBackupCode(code: string): string {
  return crypto.createHash("sha256").update(normalizeBackupCode(code)).digest("hex");
}

/** สร้างรหัสสำรองชุดใหม่ คืนทั้งตัวจริง (โชว์ครั้งเดียว) และตัวแฮช (เก็บลง DB) */
export function generateBackupCodes(): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i += 1) {
    const bytes = crypto.randomBytes(8);
    let raw = "";
    for (const b of bytes) raw += BACKUP_ALPHABET[b % BACKUP_ALPHABET.length];
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    plain.push(code);
    hashed.push(hashBackupCode(code));
  }
  return { plain, hashed };
}
