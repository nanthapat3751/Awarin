/**
 * แยก AuthError ออกมาไว้ไฟล์ของตัวเอง เพื่อให้ทั้ง auth.service และ twofactor.service ใช้ร่วมกัน
 * ได้โดยไม่เกิด import วนกัน (auth.service → twofactor.service → auth.error, ไม่ย้อนกลับ)
 */
export class AuthError extends Error {
  status: number;
  /** วินาทีที่ต้องรอก่อนลองใหม่ (ใช้กับสถานะถูกล็อก 423) — frontend เอาไปนับถอยหลัง + ตั้ง header Retry-After */
  retryAfterSeconds?: number;

  constructor(message: string, status = 401, retryAfterSeconds?: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
