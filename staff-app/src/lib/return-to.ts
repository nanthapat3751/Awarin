/**
 * หน้าที่พนักงานตั้งใจเปิดก่อนถูกพามาหน้าเข้าสู่ระบบ (แบบเดียวกับ BUG-001 ฝั่งลูกค้า)
 *
 * เปิดลิงก์โครงการ/ใบเสนอราคาที่เพื่อนส่งมาตอนเซสชันหมดอายุ → ProtectedRoute พามาที่ /login พร้อม
 * state.from — เข้าสู่ระบบเสร็จต้องกลับไปที่หน้านั้น ไม่ใช่ทิ้งไว้แดชบอร์ดให้หาเอง
 *
 * ส่งทาง location.state ไม่ใช่ ?next= ใน URL: state มาจากโค้ดของเว็บเราเท่านั้น คนนอกแนบมากับลิงก์ไม่ได้
 * แต่ยังกรองซ้ำอีกชั้น — รับเฉพาะ path ภายในเว็บ ("/…" แต่ไม่ใช่ "//…" หรือ "/\…" ซึ่งเบราว์เซอร์
 * ตีความเป็นโดเมนอื่น) กัน open redirect · ฉบับฝั่งลูกค้าอยู่ที่ client-app/src/lib/return-to.ts
 */
const AUTH_PAGES = ["/login", "/forgot-password", "/reset-password"];

export function returnPathFrom(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== "string" || !from.startsWith("/")) return "/";
  if (from.startsWith("//") || from.startsWith("/\\")) return "/";
  const path = from.split(/[?#]/)[0];
  if (AUTH_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) return "/";
  return from;
}
