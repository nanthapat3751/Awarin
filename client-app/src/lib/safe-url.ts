// คืน URL เฉพาะเมื่อขึ้นต้นด้วย http:// หรือ https:// จริงเท่านั้น ไม่งั้นคืน "" — ป้องกันลิงก์
// อันตราย เช่น javascript:/data: ที่ถูกตั้งไว้ในค่า settings แล้วกลายเป็น stored XSS บนเว็บสาธารณะ
export function safeHttpUrl(url: string | undefined | null): string {
  if (!url) return "";
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
}

// ลิงก์ LINE จากค่าในหน้าตั้งค่า: ใส่มาเป็น URL เต็ม (http/https) ก็ใช้ตามนั้น
// ไม่งั้นถือเป็น LINE ID แล้วต่อเป็นลิงก์เพิ่มเพื่อน · ว่าง = ""
export function lineHref(value: string | undefined | null): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://line.me/R/ti/p/${encodeURIComponent(raw)}`;
}
