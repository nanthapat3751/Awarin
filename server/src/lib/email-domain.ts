import dns from "node:dns/promises";

import { emailDomain } from "@systemboq/shared-types";

/**
 * ถามระบบชื่อโดเมนว่า "โดเมนนี้รับอีเมลได้จริงไหม" — กันโดเมนที่กุขึ้นมาเอง
 * (`@บริษัทไม่มีจริง.com`) ซึ่งการตรวจรูปแบบจับไม่ได้
 *
 * **สิ่งที่วิธีนี้ทำไม่ได้:** พิสูจน์ว่ากล่องจดหมายนั้นมีจริงและเป็นของคนที่กำลังสมัคร
 * `ไม่มีใครใช้ชื่อนี้@gmail.com` ก็ผ่านด่านนี้ เพราะ gmail.com รับเมลได้ — เรื่องนั้นต้องใช้
 * การส่งรหัสไปยืนยันเท่านั้น (ดู lib/mailer.ts)
 */

/** ปิดได้ด้วย EMAIL_MX_CHECK=off — เทสต์ปิดไว้ (ดู tests/setup-env.ts) เพราะใช้โดเมน example.com */
function enabled(): boolean {
  return (process.env.EMAIL_MX_CHECK ?? "on").toLowerCase() !== "off";
}

/** DNS ช้าหรือค้างต้องไม่ทำให้หน้าสมัครค้างตาม */
const LOOKUP_TIMEOUT_MS = 3_000;

/** จำคำตอบไว้สั้น ๆ — โดเมนยอดฮิตถูกถามซ้ำบ่อย และช่วยให้เทสต์ไม่ยิง DNS ซ้ำ */
const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map<string, { ok: boolean; at: number }>();

async function withTimeout<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), LOOKUP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * true = โดเมนรับอีเมลได้ (หรือเราไม่แน่ใจ)
 *
 * **ปล่อยผ่านเมื่อไม่แน่ใจโดยตั้งใจ** — DNS ล่ม เน็ตมีปัญหา หรือหมดเวลา ต้องไม่ทำให้ลูกค้าจริง
 * สมัครไม่ได้ ยอมให้อีเมลปลอมหลุดเข้ามาดีกว่าปิดประตูใส่คนที่ตั้งใจจะจ้างเรา
 */
export async function domainAcceptsMail(email: string): Promise<boolean> {
  if (!enabled()) return true;
  const domain = emailDomain(email);
  if (!domain) return true;

  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.ok;

  const ok = await withTimeout(lookup(domain), true);
  cache.set(domain, { ok, at: Date.now() });
  return ok;
}

async function lookup(domain: string): Promise<boolean> {
  try {
    const mx = await dns.resolveMx(domain);
    if (mx.length > 0) return true;
  } catch (err) {
    // ENOTFOUND = ไม่มีโดเมนนี้อยู่จริง · ENODATA = มีโดเมนแต่ไม่ได้ประกาศ MX
    // สองอันนี้คือคำตอบจริง ส่วน error อื่น (DNS ล่ม/timeout) ให้ปล่อยผ่าน
    if (!isDefinitiveDnsError(err)) return true;
  }
  // ไม่มี MX ยังไม่แปลว่ารับเมลไม่ได้ — RFC 5321 ข้อ 5.1 ให้ถอยไปใช้ A/AAAA แทน
  try {
    const a = await dns.resolve4(domain).catch(() => dns.resolve6(domain));
    return a.length > 0;
  } catch (err) {
    return !isDefinitiveDnsError(err);
  }
}

function isDefinitiveDnsError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN";
}

/** ล้างแคช — ใช้ในเทสต์เท่านั้น */
export function clearDomainCache(): void {
  cache.clear();
}
