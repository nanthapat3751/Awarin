import type { Response } from "express";

const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

/** ตั้ง session cookie แบบ httpOnly + SameSite=Lax (ใช้ร่วมกันทั้ง login และการยืนยัน 2FA) */
export function setSessionCookie(
  res: Response,
  cookieName: string,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

// staff-app กับ client-app รันคนละพอร์ตตอน dev (และโดยทั่วไปอาจเป็นคนละ subdomain ตอน
// prod) แต่ทั้งคู่เรียก API เดียวกันนี้ — การใช้ชื่อ cookie เดียวทำให้การล็อกอินแอปหนึ่งไป
// ทับ session ของอีกแอปเงียบ ๆ ในเบราว์เซอร์เดียวกัน (เช่น session ลูกค้าบน client-app โดน
// การล็อกอินพนักงานในอีกแท็บทับ หรือกลับกัน) การแยกชื่อ cookie ต่อแอปแก้ปัญหานี้: request
// ของแต่ละแอปพก cookie ของตัวเอง และล็อกอินทั้งสองพร้อมกันในเบราว์เซอร์เดียวได้
const staffOrigin = process.env.CORS_ORIGIN_STAFF ?? "http://localhost:5173";
const clientOrigin = process.env.CORS_ORIGIN_CLIENT ?? "http://localhost:5174";

export const STAFF_COOKIE_NAME = process.env.SESSION_COOKIE_NAME_STAFF ?? "systemboq_staff_session";
export const CUSTOMER_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME_CUSTOMER ?? "systemboq_customer_session";

/**
 * เส้นทางที่เป็นของผู้ใช้กลุ่มเดียวเสมอ ไม่ว่า request จะหน้าตาเป็นอย่างไร
 * `/api/my/*` คือพื้นที่ส่วนตัวของลูกค้า ส่วนอย่างอื่นใต้ /api ที่ต้องล็อกอินคือฝั่งพนักงาน
 * เส้นทาง auth ถูกยกเว้นโดยตั้งใจ — /api/auth/logout ต้องปิด session ตัวที่ผู้เรียกถืออยู่จริง
 * ได้ ไม่ว่าจะเป็นของฝั่งไหน
 */
const CUSTOMER_ONLY_PATH = /^\/api\/my(\/|$)/;

/**
 * ตัดสินว่า cookie ตัวไหนใช้กับ request ที่เข้ามา
 *
 * ลำดับสำคัญ:
 *  1. เส้นทางเฉพาะลูกค้า *เมื่อผู้เรียกถือ cookie ลูกค้าอยู่จริง* เบราว์เซอร์จะไม่ส่ง `Origin`
 *     ตอน navigate ระดับบนสุด (เปิดลิงก์ PDF ในแท็บใหม่ หรือวาง URL) ของเดิมที่เช็ค origin
 *     แล้ว "เลือกฝั่งพนักงานก่อน" จะยื่น session พนักงานให้ request ของลูกค้าเอง — กลายเป็น
 *     403 สำหรับคนที่ล็อกอินทั้งสองแอปในเบราว์เซอร์เดียว การบังคับว่าต้องมี cookie อยู่จริง
 *     ทำให้ผู้เรียกที่มีแค่ session พนักงานยังอยู่บน session พนักงาน การเข้าพื้นที่ลูกค้าจึง
 *     ล้มเหลวแบบปฏิเสธสิทธิ์ (403) แทนที่จะดูเหมือน "ยังไม่ล็อกอิน" (401)
 *  2. origin ที่เรียกมา ใช้แยก SPA สองตัวออกจากกันในการเรียก XHR/fetch ปกติ
 *  3. cookie ตัวไหนก็ตามที่มีอยู่จริง — การเรียกแบบ server-to-server, curl, เทสต์ หรือ
 *     การ deploy แบบ same-origin ที่มี cookie อยู่ตัวเดียวอยู่แล้ว
 */
export function resolveCookieName(
  origin: string | undefined,
  cookies: Record<string, unknown>,
  path?: string,
): string {
  if (path && CUSTOMER_ONLY_PATH.test(path) && cookies?.[CUSTOMER_COOKIE_NAME]) {
    return CUSTOMER_COOKIE_NAME;
  }
  if (origin === clientOrigin) return CUSTOMER_COOKIE_NAME;
  if (origin === staffOrigin) return STAFF_COOKIE_NAME;
  return cookies?.[STAFF_COOKIE_NAME] ? STAFF_COOKIE_NAME : CUSTOMER_COOKIE_NAME;
}
