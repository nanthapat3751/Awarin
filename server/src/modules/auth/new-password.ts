import { passwordProblem } from "@systemboq/shared-types";

import { verifyPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

/** ข้อมูลบัญชีที่ต้องมีก่อนตรวจได้ — ทุก select ที่เรียกฟังก์ชันนี้ต้องดึงครบ 5 ช่องนี้ */
export interface PasswordOwner {
  id: string;
  email: string | null;
  username: string | null;
  fullName: string;
  passwordHash: string;
}

/**
 * ตรวจรหัสผ่านใหม่อีกชั้น เมื่อรู้แล้วว่าเป็นบัญชีของใคร — คืนข้อความปัญหา หรือ null ถ้าผ่าน
 *
 * สคีมา zod ตรวจได้แค่กฎที่ไม่ต้องรู้ตัวตน (ความยาว / ผสมอักขระ / บัญชีดำ) เพราะตอน parse ยังไม่รู้
 * ว่า token หรือ session ที่ส่งมาเป็นของใคร · สองข้อที่เหลือจึงต้องมาตรวจที่นี่:
 *
 *   1. **ห้ามมีข้อมูลตัวเองอยู่ในรหัส** — ชื่อ อีเมล ชื่อผู้ใช้ เบอร์โทร ชื่อบริษัท
 *      "somchai2026!" ผ่านกฎผสมอักขระสบาย แต่ใครที่เห็นชื่อบนใบเสนอราคาก็เดาได้
 *
 *   2. **ห้ามตั้งรหัสเดิมซ้ำ** — คนที่ถูกบังคับเปลี่ยนรหัสจะลองใส่รหัสเดิมกลับไปเป็นอย่างแรก
 *      และคนที่เพิ่งกู้บัญชีคืนหลังถูกเดารหัสได้ ต้องไม่ตั้งรหัสที่คนอื่นรู้แล้วกลับเข้าไปอีก
 *
 * ข้อ 2 ต้องแฮชเทียบซึ่งกิน CPU จึงวางไว้ท้ายสุด หลังกฎที่เช็คได้ฟรีทั้งหมด — ไม่ให้ปลายทาง
 * ตั้งรหัสผ่านกลายเป็นช่องยิงให้เครื่องแฮช argon2 รอบเปล่า
 *
 * **คืนค่าแทนการโยน error โดยตั้งใจ** ฟังก์ชันนี้ถูกเรียกจากทั้งโมดูล auth (โยน AuthError) และ
 * โมดูล users (โยน UserError) ซึ่ง route ของแต่ละฝั่งดักเฉพาะ error ของตัวเอง ถ้าโยนข้ามฝั่ง
 * จะกลายเป็น 500 พร้อมข้อความที่ผู้ใช้อ่านไม่ได้ แทนที่จะเป็น 400 พร้อมเหตุผลที่บอกว่าต้องแก้อะไร
 */
export async function newPasswordProblem(
  user: PasswordOwner,
  newPassword: string,
): Promise<string | null> {
  // ลูกค้าเท่านั้นที่มีโปรไฟล์ (เบอร์โทร/ชื่อบริษัท) — พนักงานได้ null แล้วข้ามสองข้อนั้นไป
  const profile = await prisma.customerProfile.findUnique({
    where: { userId: user.id },
    select: { phone: true, companyName: true },
  });

  const problem = passwordProblem(newPassword, [
    user.email,
    user.username,
    user.fullName,
    profile?.phone,
    profile?.companyName,
  ]);
  if (problem !== null) return problem;

  if (await verifyPassword(user.passwordHash, newPassword)) {
    return "รหัสผ่านใหม่ต้องไม่ใช่รหัสเดิมที่ใช้อยู่";
  }

  return null;
}
