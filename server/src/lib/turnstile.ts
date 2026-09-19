// ตรวจ token ของ Cloudflare Turnstile (CAPTCHA) กับ siteverify API เพื่อยืนยันว่าผู้ส่งฟอร์มเป็น
// มนุษย์ ไม่ใช่บอท
//
// ถ้าไม่ได้ตั้ง TURNSTILE_SECRET_KEY จะ "ข้าม" การตรวจ (คืน true) — รองรับ dev/test/การติดตั้งที่
// ยังไม่ผูกบัญชี Cloudflare ให้ฟอร์มยังใช้งานได้ พอ deploy จริงค่อยตั้ง secret เพื่อบังคับใช้
// (การไม่ตั้งค่าเป็นการเลือกอย่างชัดเจนของผู้ดูแล เหมือน optional integration อื่น ๆ)
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstile(
  token: string | undefined,
  remoteip?: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // ยังไม่ผูก Cloudflare → ข้ามการตรวจ
  if (!token) return false;

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        ...(remoteip ? { remoteip } : {}),
      }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // เรียก Cloudflare ไม่สำเร็จ (เน็ตล่ม/บริการล่ม) — ถือว่าไม่ผ่าน ปลอดภัยไว้ก่อน
    return false;
  }
}
