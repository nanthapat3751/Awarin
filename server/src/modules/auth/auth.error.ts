/**
 * แยก AuthError ออกมาไว้ไฟล์ของตัวเอง เพื่อให้ทั้ง auth.service และ twofactor.service ใช้ร่วมกัน
 * ได้โดยไม่เกิด import วนกัน (auth.service → twofactor.service → auth.error, ไม่ย้อนกลับ)
 */
export class AuthError extends Error {
  status: number;
  /** วินาทีที่ต้องรอก่อนลองใหม่ (ใช้กับสถานะถูกล็อก 423) — frontend เอาไปนับถอยหลัง + ตั้ง header Retry-After */
  retryAfterSeconds?: number;
  /** เซสชันครึ่งทางของ 2FA ถูกทิ้งแล้ว — หน้าล็อกอินต้องพากลับไปขั้นกรอกรหัสผ่าน (กรอกรหัสต่อไม่มีประโยชน์) */
  restartLogin: boolean;

  constructor(message: string, status = 401, retryAfterSeconds?: number, opts: { restartLogin?: boolean } = {}) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.restartLogin = opts.restartLogin ?? false;
  }
}
