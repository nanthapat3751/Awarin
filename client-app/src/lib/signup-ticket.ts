/**
 * ตั๋วแก้อีเมลจากหน้ายืนยัน — เซิร์ฟเวอร์ให้มาตอนสมัคร ใช้พิสูจน์ว่าคนที่ขอแก้อีเมลคือเบราว์เซอร์ที่
 * เพิ่งสมัครจริง (ไม่ใช่ใครก็ได้ที่รู้อีเมลแล้วมาขอย้ายบัญชีที่รอยืนยันไปอีเมลตัวเอง)
 *
 * เก็บใน sessionStorage (แท็บเดียว ปิดแล้วหาย) ไม่ใช่ localStorage — เป็นกุญแจลับ ไม่ควรค้างในเครื่อง
 * นาน · ไม่มีตั๋ว (เปิดคนละแท็บ/คนละเครื่อง) หน้ายืนยันยังพาไปสมัครใหม่ได้ ซึ่งทับบัญชีที่ยังไม่ยืนยันได้
 * ทุก storage access ห่อ try/catch — โหมดส่วนตัวบางเบราว์เซอร์โยน error ตอนเข้าถึง
 */
const KEY = "signup-ticket";

interface StoredTicket {
  email: string;
  ticket: string;
}

export function saveSignupTicket(email: string, ticket: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ email, ticket } satisfies StoredTicket));
  } catch {
    // เก็บไม่ได้ก็แค่แก้อีเมลจากหน้ายืนยันไม่ได้ — ยังสมัครใหม่ได้
  }
}

/** ตั๋วของอีเมลนี้ — null ถ้าไม่มี หรือเป็นของการสมัครอื่น */
export function readSignupTicket(email: string): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredTicket>;
    return stored.email === email && typeof stored.ticket === "string" ? stored.ticket : null;
  } catch {
    return null;
  }
}

export function clearSignupTicket(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ไม่มีอะไรให้ลบ
  }
}
