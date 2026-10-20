import crypto from "node:crypto";

import { prisma } from "./prisma";

// อายุลิงก์เข้าใช้ (วัน) — นานพอให้ลูกค้าเปิดลิงก์ที่ทีมงานส่งทาง LINE/แชตได้ไม่รีบ แต่ไม่นานจน
// เสี่ยงถ้าลิงก์หลุด (ปรับผ่าน env ได้)
const ACCESS_TOKEN_TTL_DAYS = Number(process.env.ACCESS_TOKEN_TTL_DAYS ?? 7);

/** ตัด / ท้าย URL ออกให้หมด (วนแทน regex /\/+$/ ที่ย้อนรอยได้ยาวเมื่อมี / ติดกันกลางข้อความ) */
function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end -= 1;
  return url.slice(0, end);
}

// ฐาน URL ของเว็บฝั่งลูกค้า (client-app) สำหรับประกอบลิงก์เข้าใช้ — ใช้ CLIENT_BASE_URL ก่อน ถ้าไม่มี
// ถอยไปใช้ค่า CORS_ORIGIN_CLIENT (ซึ่งชี้ที่เว็บลูกค้าอยู่แล้ว) แล้วค่อยเป็นค่า dev
export function clientBaseUrl(): string {
  return withoutTrailingSlashes(
    process.env.CLIENT_BASE_URL ??
    process.env.CORS_ORIGIN_CLIENT ??
    "http://localhost:5174",
  );
}

/** ที่อยู่หน้าเว็บฝั่งพนักงาน — ลิงก์ตั้งรหัสผ่านใหม่ของพนักงานชี้มาที่นี่ (ตอน deploy ต้องตั้ง STAFF_BASE_URL) */
export function staffBaseUrl(): string {
  return withoutTrailingSlashes(
    process.env.STAFF_BASE_URL ??
    process.env.CORS_ORIGIN_STAFF ??
    "http://localhost:5173",
  );
}

/** สุ่ม token 32 ไบต์ (URL-safe) คืนทั้งตัวจริง (ใส่ในลิงก์) และแฮช (เก็บลง DB) */
export function generateAccessToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  return { raw, hash: hashAccessToken(raw) };
}

/** แฮชของ token ที่เก็บใน DB — ตรวจตอน redeem โดยเทียบแฮช ไม่เก็บตัวจริงไว้เลย */
export function hashAccessToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function accessTokenExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60_000);
}

/** ลิงก์เต็มที่ลูกค้าเปิดเพื่อตั้งรหัสผ่าน/เข้าใช้ — ชี้ไปหน้า /activate/:token ของเว็บลูกค้า */
export function buildActivateUrl(raw: string): string {
  return `${clientBaseUrl()}/activate/${raw}`;
}

/**
 * ออกลิงก์เข้าใช้ใหม่ให้ผู้ใช้คนหนึ่ง
 *
 * เผาลิงก์เก่าที่ยังไม่ถูกใช้ทิ้งก่อนเสมอ ให้เหลือลิงก์ที่ใช้ได้ทีละหนึ่งอันเท่านั้น — ไม่งั้นลิงก์เก่า
 * ที่เคยส่งไปทางแชตจะยังเปิดได้อยู่ กลายเป็นทางเข้าที่เราไม่รู้ว่ามีกี่ทาง
 *
 * อยู่ที่นี่เพราะมีสองทางที่ออกลิงก์ได้ (จากหน้าโครงการ และจากแฟ้มลูกค้า) กฎ "เหลือทีละหนึ่ง"
 * ต้องเหมือนกันทั้งสองทาง
 */
export async function issueAccessTokenFor(
  userId: string,
  createdById: string,
): Promise<{ url: string; expiresAt: Date }> {
  await prisma.accountAccessToken.deleteMany({ where: { userId, usedAt: null } });
  const { raw, hash } = generateAccessToken();
  const expiresAt = accessTokenExpiry();
  await prisma.accountAccessToken.create({
    data: { userId, tokenHash: hash, expiresAt, createdById },
  });
  return { url: buildActivateUrl(raw), expiresAt };
}

export { ACCESS_TOKEN_TTL_DAYS };
