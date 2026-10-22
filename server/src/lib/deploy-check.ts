/**
 * ตรวจค่าตั้งก่อนเปิดระบบจริง (NODE_ENV=production) — เจอเรื่องร้ายแรงแล้วไม่ยอมเปิด
 *
 * ทำไมต้องหยุดตั้งแต่เปิด: ค่าพวกนี้ผิดแล้วไม่มีอะไรพังให้เห็นทันที ระบบเปิดได้ หน้าเว็บใช้ได้ แต่
 *   - ลิงก์ตั้งรหัสผ่าน/เปิดใช้บัญชีในอีเมลชี้กลับ localhost → ลูกค้ากดแล้วไม่มีอะไรเกิดขึ้น
 *   - คุกกี้เข้าสู่ระบบส่งผ่าน http ธรรมดาได้ → ถูกดักกลางทางได้
 *   - MAIL_TRANSPORT ไม่ใช่ smtp → ลูกค้าไม่ได้รหัสยืนยันเลย สมัครและกู้รหัสไม่ได้
 * กว่าจะมีคนรู้ก็ตอนลูกค้าโทรมาบ่น · เครื่อง dev (ไม่ได้ตั้ง NODE_ENV=production) ไม่ตรวจ
 *
 * ระดับ warn = เปิดได้แต่ควรแก้ (เช่น ส่งเมลจาก Gmail ส่วนตัว) — พิมพ์ลง log ทุกครั้งที่เปิด
 * เป็นฟังก์ชันล้วนที่รับ env เข้ามา เทสต์ได้โดยไม่ต้องแตะ process.env
 */

export interface DeployProblem {
  level: "error" | "warn";
  key: string;
  message: string;
}

/** ผู้ให้บริการอีเมลส่วนตัว — ส่งในนามบริษัทจากโดเมนพวกนี้มีโอกาสเข้าสแปมและดูไม่น่าเชื่อถือ */
const PERSONAL_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
]);

/** โดเมนระดับสองของไทย/สากลที่ต้องนับสามส่วน (awarin.co.th ไม่ใช่ co.th) */
const SECOND_LEVEL = new Set(["co.th", "or.th", "ac.th", "go.th", "in.th", "net.th", "co.uk", "com.au"]);

function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  const lastTwo = labels.slice(-2).join(".");
  return SECOND_LEVEL.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "[::1]" || host === "0.0.0.0";
}

/** ดึงอีเมลจาก `"ชื่อ <a@b.c>"` หรือ `a@b.c` */
function addressOf(from: string): string {
  return (bracketed(from) ?? from).trim().toLowerCase();
}

/** ข้อความใน <...> คู่แรกที่มีอะไรอยู่ข้างใน — ไล่หาเองแทน regex ที่ย้อนลองได้หลายทาง */
function bracketed(text: string): string | null {
  for (let open = text.indexOf("<"); open >= 0; open = text.indexOf("<", open + 1)) {
    const close = text.indexOf(">", open + 1);
    if (close < 0) return null;
    if (close > open + 1) return text.slice(open + 1, close);
  }
  return null;
}

function checkBaseUrl(
  env: NodeJS.ProcessEnv,
  key: "CLIENT_BASE_URL" | "STAFF_BASE_URL",
  fallbackKey: "CORS_ORIGIN_CLIENT" | "CORS_ORIGIN_STAFF",
  who: string,
): DeployProblem[] {
  const raw = env[key]?.trim() || env[fallbackKey]?.trim();
  if (!raw) {
    return [{ level: "error", key, message: `ยังไม่ได้ตั้ง ${key} — ลิงก์ในอีเมลของ${who}จะชี้ไปที่ localhost กดแล้วเปิดไม่ได้` }];
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return [{ level: "error", key, message: `${key} ไม่ใช่ที่อยู่เว็บที่ถูกต้อง: "${raw}"` }];
  }
  const problems: DeployProblem[] = [];
  if (isLocalHost(url.hostname)) {
    problems.push({ level: "error", key, message: `${key} ยังชี้ไปที่เครื่องนี้ (${url.origin}) — ลิงก์ในอีเมลของ${who}กดจากที่อื่นไม่ได้` });
  } else if (url.protocol !== "https:") {
    problems.push({ level: "error", key, message: `${key} ต้องขึ้นต้นด้วย https:// (ตอนนี้ ${url.origin}) — ลิงก์ตั้งรหัสผ่านต้องไม่วิ่งผ่าน http ธรรมดา` });
  }
  if (!env[key]?.trim()) {
    problems.push({ level: "warn", key, message: `ไม่ได้ตั้ง ${key} ตรง ๆ จึงใช้ ${fallbackKey} แทน — ตั้งให้ชัดเพื่อไม่ให้ลิงก์เปลี่ยนตามค่า CORS` });
  }
  return problems;
}

export function checkDeployConfig(env: NodeJS.ProcessEnv): DeployProblem[] {
  if (env.NODE_ENV !== "production") return [];
  const problems: DeployProblem[] = [
    ...checkBaseUrl(env, "CLIENT_BASE_URL", "CORS_ORIGIN_CLIENT", "ลูกค้า"),
    ...checkBaseUrl(env, "STAFF_BASE_URL", "CORS_ORIGIN_STAFF", "พนักงาน"),
  ];

  problems.push(...checkUploadBase(env));

  if (env.COOKIE_SECURE !== "true") {
    problems.push({
      level: "error",
      key: "COOKIE_SECURE",
      message: "COOKIE_SECURE ต้องเป็น true บนเซิร์ฟเวอร์จริง (และเว็บต้องเปิดผ่าน HTTPS) — ไม่งั้นคุกกี้เข้าสู่ระบบส่งผ่าน http ธรรมดาได้",
    });
  }

  problems.push(...checkMail(env));
  return problems;
}

/**
 * รูปที่อัปโหลดเก็บเป็น path สัมพัทธ์ แล้ว API ต่อโดเมนนี้ให้ตอนส่งออก (ดู lib/upload-urls.ts)
 * ไม่ตั้ง = ใช้ http://localhost:4000 → รูปแบบบ้าน/ผลงาน/รูปหน้าเว็บพังทุกรูปบนเว็บจริง
 * (เคยเกิดตอนขึ้นระบบครั้งแรก — หน้าเว็บเปิดได้ปกติ จึงไม่มีอะไรเตือน)
 */
function checkUploadBase(env: NodeJS.ProcessEnv): DeployProblem[] {
  const key = "PUBLIC_UPLOAD_BASE_URL";
  const raw = env[key]?.trim();
  if (!raw) {
    return [{ level: "error", key, message: `ยังไม่ได้ตั้ง ${key} (เช่น https://api.<โดเมน>) — รูปทุกรูปบนเว็บจะชี้ไปที่ localhost และไม่ขึ้น` }];
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return [{ level: "error", key, message: `${key} ไม่ใช่ที่อยู่เว็บที่ถูกต้อง: "${raw}"` }];
  }
  if (isLocalHost(url.hostname)) {
    return [{ level: "error", key, message: `${key} ยังชี้ไปที่เครื่องนี้ (${url.origin}) — คนอื่นเปิดรูปไม่ได้` }];
  }
  if (url.protocol !== "https:") {
    return [{ level: "error", key, message: `${key} ต้องขึ้นต้นด้วย https:// (ตอนนี้ ${url.origin}) — เว็บ https โหลดรูปจาก http ไม่ได้` }];
  }
  return [];
}

/** เมลต้องส่งจริง (smtp) · ผู้ส่งไม่ควรเป็นอีเมลส่วนตัว หรือคนละโดเมนกับเว็บ */
function checkMail(env: NodeJS.ProcessEnv): DeployProblem[] {
  const problems: DeployProblem[] = [];
  const mode = (env.MAIL_TRANSPORT ?? "console").toLowerCase();
  if (mode !== "smtp") {
    problems.push({
      level: "error",
      key: "MAIL_TRANSPORT",
      message: `MAIL_TRANSPORT=${mode} ไม่ได้ส่งอีเมลจริง — ลูกค้าจะไม่ได้รหัสยืนยันอีเมลและรหัสตั้งรหัสผ่านใหม่ ต้องตั้งเป็น smtp พร้อม SMTP_*`,
    });
  } else {
    const from = addressOf(env.MAIL_FROM ?? "");
    const fromDomain = from.split("@")[1] ?? "";
    if (PERSONAL_MAIL_DOMAINS.has(fromDomain)) {
      problems.push({
        level: "warn",
        key: "MAIL_FROM",
        message: `ส่งอีเมลจากบัญชีส่วนตัว (${fromDomain}) — มีโอกาสเข้าสแปม ลูกค้าไม่คุ้นชื่อผู้ส่ง และ Gmail จำกัดราว 500 ฉบับ/วัน ควรใช้อีเมลโดเมนบริษัทที่ตั้ง SPF/DKIM/DMARC แล้ว`,
      });
    } else if (fromDomain) {
      const siteHost = siteHostOf(env);
      if (siteHost && !isLocalHost(siteHost) && registrableDomain(siteHost) !== registrableDomain(fromDomain)) {
        problems.push({
          level: "warn",
          key: "MAIL_FROM",
          message: `อีเมลผู้ส่ง (@${fromDomain}) คนละโดเมนกับเว็บ (${siteHost}) — ลูกค้าอาจสงสัยว่าเป็นเมลปลอม ตรวจว่าตั้งใจแบบนี้`,
        });
      }
    }
  }
  return problems;
}

/** โดเมนของเว็บฝั่งลูกค้า (ว่าง = ไม่ได้ตั้ง/อ่านไม่ออก) */
function siteHostOf(env: NodeJS.ProcessEnv): string {
  const site = env.CLIENT_BASE_URL?.trim() || env.CORS_ORIGIN_CLIENT?.trim();
  if (!site) return "";
  try {
    return new URL(site).hostname;
  } catch {
    return "";
  }
}

/** พิมพ์ผลตรวจ · คืน true ถ้ามีเรื่องร้ายแรง (ผู้เรียกต้องไม่เปิดระบบ) */
export function reportDeployConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  const problems = checkDeployConfig(env);
  if (problems.length === 0) return false;
  const errors = problems.filter((p) => p.level === "error");
  const lines = [
    "",
    "=".repeat(72),
    errors.length > 0
      ? `[ตรวจค่าตั้งก่อนเปิดระบบจริง] พบ ${errors.length} เรื่องที่ต้องแก้ — ไม่เปิดระบบจนกว่าจะแก้ (ดู server/.env.production.example)`
      : "[ตรวจค่าตั้งก่อนเปิดระบบจริง] เปิดได้ แต่มีเรื่องที่ควรแก้",
    ...problems.map((p) => `  ${p.level === "error" ? "✗ ต้องแก้" : "! ควรแก้"}  ${p.message}`),
    "=".repeat(72),
    "",
  ];
  (errors.length > 0 ? console.error : console.warn)(lines.join("\n"));
  return errors.length > 0;
}
