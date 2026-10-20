/**
 * หน้าที่ลูกค้าตั้งใจเปิดก่อนถูกพามาหน้าเข้าสู่ระบบ (BUG-001)
 *
 * ลิงก์ในอีเมลแจ้งเตือนพาลูกค้าตรงไปที่ใบเสนอราคา/สัญญา ถ้ายังไม่ได้เข้าสู่ระบบ ProtectedRoute จะพามาที่
 * /login พร้อม state.from — เข้าสู่ระบบเสร็จต้องกลับไปที่หน้านั้น ไม่ใช่ทิ้งไว้หน้าแรกให้หาเอง
 *
 * ส่งทาง location.state ไม่ใช่ ?next= ใน URL: state มาจากโค้ดของเว็บเราเท่านั้น คนนอกแนบมากับลิงก์ไม่ได้
 * แต่ยังกรองซ้ำอีกชั้นเผื่อ state ค้างมาจากที่อื่น — รับเฉพาะ path ภายในเว็บ ("/…" แต่ไม่ใช่ "//…"
 * หรือ "/\…" ซึ่งเบราว์เซอร์ตีความเป็นโดเมนอื่น) กัน open redirect
 */
const AUTH_PAGES = ["/login", "/register"];

export function returnPathFrom(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== "string" || !from.startsWith("/")) return "/";
  if (from.startsWith("//") || from.startsWith("/\\")) return "/";
  const path = from.split(/[?#]/)[0];
  if (AUTH_PAGES.includes(path)) return "/";
  return from;
}
