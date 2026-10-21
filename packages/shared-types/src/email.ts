/** ใช้ร่วมกันเพื่อให้เบราว์เซอร์และ API ปฏิเสธอีเมลผิดรูปแบบด้วยข้อความเดียวกัน */
export const EMAIL_ERROR_MESSAGE = "กรุณากรอกอีเมลให้ถูกต้อง";

/**
 * รูปอีเมลคร่าว ๆ: ส่วนหน้า@โดเมน ที่มีจุดคั่นกลางโดเมน ไม่มีช่องว่างและมี @ ตัวเดียว
 * (เขียนเป็นโค้ดแทน regex /^[^\s@]+@[^\s@]+\.[^\s@]+$/ ที่ย้อนรอยได้ยาวเมื่อโดเมนมีจุดหลายจุด
 * ผลลัพธ์ตรงกับ regex เดิมทุกกรณี)
 */
export function looksLikeEmail(value: string): boolean {
  if (/\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at < 1 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  return domain.slice(1, -1).includes(".");
}

/**
 * ตัดช่องว่างและแปลงเป็นตัวพิมพ์เล็ก — ต้องเรียกก่อนบันทึกและก่อนค้นหาทุกครั้ง
 *
 * Postgres แยกตัวพิมพ์ใหญ่-เล็ก ถ้าไม่ทำตรงนี้จะเกิดสองอาการพร้อมกัน:
 * สมัครด้วย `Pim@Gmail.com` แล้ววันหลังพิมพ์ `pim@gmail.com` จะเข้าไม่ได้ (และระบบบอกแค่
 * "อีเมลหรือรหัสผ่านไม่ถูกต้อง" หาสาเหตุไม่เจอ) · และคนคนเดียวสมัครซ้ำได้สองบัญชี
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * โดเมนอีเมลใช้แล้วทิ้ง — สมัครแล้วกล่องจดหมายหายไปในไม่กี่นาที ติดต่อกลับไม่ได้เลย
 * ไม่ใช่รายการที่ครบถ้วน (มีโดเมนใหม่ทุกวัน) แต่ครอบคลุมตัวที่คนใช้บ่อยที่สุด
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com", "20minutemail.com", "33mail.com", "dispostable.com",
  "fakeinbox.com", "getnada.com", "guerrillamail.com", "guerrillamail.info",
  "mailinator.com", "maildrop.cc", "mailnesia.com", "mintemail.com",
  "mohmal.com", "sharklasers.com", "temp-mail.org", "tempmail.com",
  "tempmailo.com", "throwawaymail.com", "trashmail.com", "yopmail.com",
]);

/**
 * โดเมนที่คนพิมพ์ผิดบ่อย → โดเมนที่ตั้งใจจะพิมพ์
 * เจอแล้วไม่ได้ห้าม แต่ถามกลับว่าหมายถึงอันไหน เพราะเดาแทนผู้ใช้แล้วผิดจะแย่กว่า
 */
const EMAIL_DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com",
  "gmail.con": "gmail.com", "gmaill.com": "gmail.com", "gmail.cm": "gmail.com",
  "gnail.com": "gmail.com", "gamil.com": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.co": "hotmail.com",
  "yahooo.com": "yahoo.com", "yaho.com": "yahoo.com",
  "outlook.co": "outlook.com", "outlok.com": "outlook.com",
};

/** โดเมนของอีเมล (ตัวพิมพ์เล็ก) — คืน "" ถ้าไม่มี @ */
export function emailDomain(value: string): string {
  const at = value.lastIndexOf("@");
  return at < 0 ? "" : value.slice(at + 1).toLowerCase();
}

/**
 * ข้อห้ามที่ "เหนือกว่ารูปแบบ" — เรียกหลังผ่านการตรวจรูปแบบแล้ว คืน null ถ้าไม่มีปัญหา
 *
 * ใช้เฉพาะตอน **สร้างบัญชีใหม่** ห้ามใช้ตอนเข้าสู่ระบบ เพราะบัญชีที่มีอยู่ก่อนกฎนี้จะโดนล็อกออก
 * จากระบบตัวเองทันที (เช่น บัญชีทดสอบที่ใช้โดเมน example.com)
 */
export function newAccountEmailProblem(value: string): string | null {
  const domain = emailDomain(normalizeEmail(value));
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return "อีเมลชั่วคราวใช้สมัครไม่ได้ กรุณาใช้อีเมลที่ใช้งานจริง";
  }
  const meant = EMAIL_DOMAIN_TYPOS[domain];
  if (meant) return `โดเมน "${domain}" น่าจะพิมพ์ผิด — หมายถึง "${meant}" หรือเปล่า`;
  return null;
}

/** ผู้ให้บริการเมลที่คนไทยใช้บ่อย — ใช้เดาว่าโดเมนที่พิมพ์มาใกล้ตัวไหน */
const POPULAR_EMAIL_DOMAINS = [
  "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "live.com",
  "hotmail.co.th", "yahoo.co.th", "outlook.co.th",
];

/**
 * โดเมนจริงที่หน้าตาใกล้ตัวยอดนิยม — ห้าม "แก้" ให้ (mail.com ห่างจาก gmail.com แค่ตัวเดียว
 * แต่เป็นผู้ให้บริการจริง) ถ้าเดาทับ ลูกค้าจะได้คำแนะนำผิด ๆ ทุกครั้งที่พิมพ์อีเมลของตัวเองถูก
 */
const REAL_LOOKALIKE_DOMAINS = new Set([
  ...POPULAR_EMAIL_DOMAINS,
  "mail.com", "email.com", "gmx.com", "ymail.com", "aol.com", "msn.com", "me.com", "mac.com",
  "googlemail.com", "live.co.uk", "hotmail.co.uk", "yahoo.co.uk", "outlook.jp", "hotmail.fr",
]);

/** ระยะแก้ไขแบบนับการสลับตัวอักษรติดกันเป็นหนึ่งครั้ง (gmial → gmail = 1) */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * "หมายถึง somchai@gmail.com หรือเปล่า?" — คืนอีเมลที่น่าจะตั้งใจพิมพ์ หรือ null
 *
 * **คำแนะนำเท่านั้น ไม่ได้ห้าม** (ต่างจาก newAccountEmailProblem ที่ห้ามเฉพาะรายการพิมพ์ผิดที่แน่ชัด)
 * — การเดาแบบใกล้เคียงผิดได้ จึงให้ลูกค้ากดยืนยันเอง ไม่แก้ให้เงียบ ๆ และไม่ตีกลับตอนสมัคร
 * แก้เฉพาะส่วนโดเมน ชื่อหน้า @ เดาไม่ได้ว่าตั้งใจพิมพ์อะไร
 */
export function suggestEmailFix(value: string): string | null {
  const email = normalizeEmail(value);
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain.includes(".")) return null;

  const listed = EMAIL_DOMAIN_TYPOS[domain];
  if (listed) return `${local}@${listed}`;
  if (REAL_LOOKALIKE_DOMAINS.has(domain)) return null;

  // โดเมนสั้นยอมพลาดได้ตัวเดียว ยาวยอมสองตัว — กันจับคู่มั่วกับโดเมนบริษัทสั้น ๆ
  const tolerance = domain.length >= 9 ? 2 : 1;
  let best: string | null = null;
  let bestDistance = tolerance + 1;
  for (const candidate of POPULAR_EMAIL_DOMAINS) {
    const distance = editDistance(domain, candidate);
    if (distance <= tolerance && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best ? `${local}@${best}` : null;
}
