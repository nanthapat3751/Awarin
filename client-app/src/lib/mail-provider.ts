/**
 * เดาผู้ให้บริการอีเมลจากโดเมน เพื่อทำปุ่ม "เปิดกล่องจดหมาย" ให้กดทีเดียวถึง
 *
 * คนที่เพิ่งกดขอลิงก์รีเซ็ตรหัสผ่านต้องสลับไปเปิดเมลทันที ปุ่มนี้ตัดขั้นตอน "หาแท็บอีเมลของตัวเอง"
 * ออกไป ซึ่งเป็นจุดที่คนหลุดจากขั้นตอนบ่อยที่สุด
 *
 * **ดูจากโดเมนที่ผู้ใช้พิมพ์มาเองเท่านั้น ไม่ได้ถามเซิร์ฟเวอร์** จึงไม่มีทางกลายเป็นช่องบอกว่า
 * อีเมลไหนมีบัญชีในระบบ — ปุ่มขึ้นเหมือนกันทั้งอีเมลที่มีบัญชีและไม่มี
 *
 * **โดเมนที่ไม่รู้จักจะไม่มีปุ่ม** (เช่น @ku.th หรือโดเมนบริษัท) เพราะเดาไม่ได้ว่าองค์กรนั้นใช้
 * Google Workspace หรือ Microsoft 365 — เดาผิดแล้วพาไปผิดที่ แย่กว่าไม่มีปุ่ม · ถ้าต้องการให้
 * ครอบคลุมโดเมนองค์กรด้วย ต้องให้เซิร์ฟเวอร์ถาม MX ของโดเมนนั้น ซึ่งเป็นงานแยก
 */
export interface MailProvider {
  /** ชื่อที่ขึ้นบนปุ่ม */
  name: string;
  url: string;
}

const GMAIL: MailProvider = { name: "Gmail", url: "https://mail.google.com/" };
const OUTLOOK: MailProvider = { name: "Outlook", url: "https://outlook.live.com/mail/0/" };
const YAHOO: MailProvider = { name: "Yahoo Mail", url: "https://mail.yahoo.com/" };
const ICLOUD: MailProvider = { name: "iCloud Mail", url: "https://www.icloud.com/mail/" };
const PROTON: MailProvider = { name: "Proton Mail", url: "https://mail.proton.me/" };

const BY_DOMAIN: Record<string, MailProvider> = {
  "gmail.com": GMAIL,
  "googlemail.com": GMAIL,
  "outlook.com": OUTLOOK,
  "outlook.co.th": OUTLOOK,
  "hotmail.com": OUTLOOK,
  "hotmail.co.th": OUTLOOK,
  "live.com": OUTLOOK,
  "msn.com": OUTLOOK,
  "yahoo.com": YAHOO,
  "yahoo.co.th": YAHOO,
  "ymail.com": YAHOO,
  "icloud.com": ICLOUD,
  "me.com": ICLOUD,
  "mac.com": ICLOUD,
  "proton.me": PROTON,
  "protonmail.com": PROTON,
  "pm.me": PROTON,
};

export function mailProviderFor(email: string): MailProvider | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return BY_DOMAIN[email.slice(at + 1).trim().toLowerCase()] ?? null;
}
