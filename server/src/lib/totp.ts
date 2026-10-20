import crypto from "node:crypto";

import { authenticator } from "otplib";
import QRCode from "qrcode";

// ชื่อผู้ออก (issuer) ที่จะโชว์ในแอป Google Authenticator
const ISSUER = "Awarin Engineering";

// ยอมรับรหัสของช่วงก่อนหน้า/ถัดไป 3 ช่วง (รวม ±90 วิ) เผื่อเวลาเครื่อง/มือถือคลาดกัน — เป็น
// สาเหตุอันดับหนึ่งของ "รหัสถูกแต่ระบบว่าผิด" · ช่วงกว้างไม่ได้แปลว่ารหัสใช้ซ้ำได้: ผู้เรียกต้องจด
// ช่วงที่ใช้แล้ว (totpStep + User.totpLastStep) และมีเพดานกรอกผิดต่อบัญชีกันเดา
authenticator.options = { window: 3 };

// ความยาวหนึ่งช่วงของรหัส (วินาที) — ค่ามาตรฐานของแอป Authenticator ทุกตัว
const TOTP_PERIOD_SECONDS = 30;

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

/**
 * ตรวจรหัส 6 หลักจากแอปกับ secret (รองรับเวลาคลาดตาม window ด้านบน)
 * คืน "ช่วงเวลา" ของรหัสที่ตรง (เลขนับช่วง 30 วิจาก epoch) หรือ null ถ้าไม่ตรง — ผู้เรียกเอาเลขนี้
 * ไปเทียบกับ User.totpLastStep เพื่อไม่รับรหัสที่ใช้ไปแล้ว (ดู consumeTotpStep ใน twofactor.service)
 */
export function totpStep(token: string, secret: string, now = Date.now()): number | null {
  const cleaned = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return null;
  try {
    // ใช้เวลาเดียวกันทั้งตอนตรวจและตอนคำนวณช่วง — ถ้าข้ามรอยต่อ 30 วิระหว่างสองจังหวะ เลขช่วงจะเพี้ยนไปหนึ่ง
    const delta = authenticator.clone({ epoch: now }).checkDelta(cleaned, secret);
    if (delta === null) return null;
    return Math.floor(now / 1000 / TOTP_PERIOD_SECONDS) + delta;
  } catch {
    return null;
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
