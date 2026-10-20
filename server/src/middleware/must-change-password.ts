import type { NextFunction, Request, Response } from "express";

/**
 * ปิดทางใช้งานทุกอย่างจนกว่าจะเปลี่ยนรหัสผ่านที่คนอื่นตั้งให้
 *
 * ธง mustChangePassword ตั้งตอน OWNER สร้างบัญชีพนักงานใหม่หรือรีเซ็ตรหัสให้พนักงานคนอื่น
 * รหัสนั้นเดินทางผ่าน LINE/กระดาษ/ปากเปล่า จึงมีคนรู้อย่างน้อยสองคนเสมอ
 *
 * **ทำไมต้องกันที่เซิร์ฟเวอร์ด้วย ไม่ใช่แค่บังหน้าจอไว้** หน้าจอที่บังไว้ฝั่งเบราว์เซอร์อย่างเดียว
 * ข้ามได้ด้วยแท็บที่เปิดค้างไว้ก่อนหน้า หรือเรียก API ตรง ๆ — แล้ว "บังคับ" ก็จะไม่ได้บังคับอะไรเลย
 *
 * **เปิดช่องไว้เท่าที่จำเป็นต้องใช้เพื่อเปลี่ยนรหัส** ถ้าปิดหมดจริง ๆ จะเปลี่ยนรหัสไม่ได้เลย:
 *   - `/api/auth/me`              หน้าเว็บต้องรู้ว่าตัวเองติดธงนี้อยู่ ถึงจะแสดงหน้าเปลี่ยนรหัสได้
 *   - `/api/auth/change-password` ปลายทางที่ปลดธงนี้
 *   - `/api/auth/logout`          ต้องออกจากระบบได้เสมอ ไม่งั้นบัญชีจะค้างอยู่ในสถานะไปไหนไม่ได้
 *   - `/api/auth/staff/login`     ล็อกอินซ้ำหลังคุกกี้หมดอายุ (ยังไม่ทันได้เปลี่ยนรหัส)
 *
 * คืน 403 พร้อม code ให้ฝั่งเว็บแยกได้ว่าไม่ใช่ "หมดสิทธิ์" แต่เป็น "ยังไม่ได้เปลี่ยนรหัส"
 */
const ALLOWED_PATHS: ReadonlySet<string> = new Set([
  "/api/auth/me",
  "/api/auth/change-password",
  "/api/auth/logout",
  "/api/auth/staff/login",
]);

export function blockUntilPasswordChanged(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user?.mustChangePassword || ALLOWED_PATHS.has(req.path)) {
    next();
    return;
  }

  res.status(403).json({
    error: "ต้องตั้งรหัสผ่านใหม่ก่อนใช้งานระบบ",
    code: "MUST_CHANGE_PASSWORD",
  });
}
