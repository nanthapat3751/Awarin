import crypto from "node:crypto";

import { normalizeEmail } from "@systemboq/shared-types";

import { clientBaseUrl, staffBaseUrl } from "../../lib/access-token";
import { writeAuditLog } from "../../lib/audit-log";
import { composeMail } from "../../lib/mail-template";
import { sendMail } from "../../lib/mailer";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

import { AuthError } from "./auth.error";
import { newPasswordProblem } from "./new-password";

/**
 * ลืมรหัสผ่าน / ตั้งรหัสผ่านใหม่ด้วยตัวเอง — ลูกค้า (ขอด้วยอีเมล) และพนักงาน (ขอด้วยชื่อผู้ใช้)
 *
 * **พนักงานใช้ได้เฉพาะเมื่ออีเมลของบัญชียืนยันแล้ว** — อีเมลพนักงานถูกกรอกโดย OWNER หรือแก้เองได้
 * ถ้ายอมส่งลิงก์ไปอีเมลที่ยังไม่มีใครพิสูจน์ว่าเป็นของเจ้าตัว ลิงก์ (= กุญแจบัญชี) อาจไปตกที่คนอื่น
 * เมลของพนักงานมีแต่ลิงก์ ไม่มีรหัส 6 หลัก (ไม่มีหน้าเว็บค้างไว้ให้กรอก) และตั้งรหัสแล้วยังต้องผ่าน 2FA ตามปกติ
 *
 * **เมลเดียวมีทั้งปุ่ม (ลิงก์) และรหัส 6 หลัก** — ลูกค้ามักอ่านเมลในมือถือแต่เปิดเว็บค้างไว้ในคอม
 * จึงเลือกได้ว่าจะกดปุ่ม (ตั้งรหัสบนเครื่องที่อ่านเมล) หรือพิมพ์รหัสลงหน้าเว็บที่เปิดค้างไว้
 *
 * ลิงก์เป็น token 32 ไบต์ (256 บิต) เดาไม่ได้ในตัวเอง ส่วนรหัส 6 หลักมีแค่ล้านแบบ จึงพึ่งเพดาน:
 * ผิดได้ MAX_CODE_ATTEMPTS ครั้งต่อรหัสแล้วแถวถูกลบ + ขอรหัสใหม่ได้ทุก 60 วินาทีต่อบัญชี +
 * เพดานต่อไอพีที่ route — โอกาสเดาถูกจึงต่ำมาก และรหัสกับลิงก์อยู่แถวเดียวกัน ใช้อันไหนก่อนอีกอันตาย
 *
 * **ทำไมไม่ใช้ AccountAccessToken ที่มีอยู่แล้ว:** ตารางนั้นบังคับ createdById (ต้องมีพนักงาน
 * เป็นคนออกให้) และการ redeem ของมัน**ออก session ให้ทันที** ซึ่งไม่เหมาะกับลิงก์ที่ระบบส่งเอง
 * ทางอีเมล — ที่นี่ตั้งรหัสเสร็จแล้วต้องไปล็อกอินใหม่ ไม่แถม session ให้ใคร
 *
 * **หลักที่ยึดตลอดไฟล์นี้: ห้ามบอกว่าอีเมลไหนมีบัญชีอยู่** ทุกคำตอบของขั้นตอน "ขอลิงก์" เหมือนกัน
 * หมดไม่ว่าจะมีบัญชีจริงหรือไม่ ไม่งั้นหน้านี้จะกลายเป็นเครื่องมือกวาดรายชื่ออีเมลลูกค้า
 */

/** อายุลิงก์ 30 นาที — สั้นกว่าลิงก์ที่พนักงานส่งทางแชต (7 วัน) เพราะอันนี้ขอแล้วใช้ทันที */
const TOKEN_TTL_MS = 30 * 60_000;
/** ขอลิงก์ใหม่ได้ทุก 60 วินาทีต่อบัญชี — กันใช้ระบบเรายิงเมลถล่มกล่องจดหมายคนอื่น */
const RESEND_COOLDOWN_MS = 60_000;
/** กรอกรหัสผิดได้กี่ครั้งต่อหนึ่งรหัส — ครบแล้วรหัส (และลิงก์ในเมลเดียวกัน) ตาย ต้องขอใหม่ */
export const MAX_CODE_ATTEMPTS = 5;

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * แฮชของรหัสผูกกับแฮชของลิงก์ในแถวเดียวกัน — รหัสเดียวกันของสองคำขอได้แฮชคนละค่า
 * (รหัสมีแค่ล้านแบบ แฮชเปล่า ๆ เทียบตารางสำเร็จรูปได้ทันทีถ้าฐานข้อมูลหลุด)
 */
function hashCode(tokenHash: string, code: string): string {
  return crypto.createHash("sha256").update(`${tokenHash}:${code}`).digest("hex");
}

function generateToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

/** เก็บแฮชลง DB เท่านั้น · ค้นด้วยแฮชโดยตรง จึงไม่มีการไล่เทียบทีละแถวที่รั่วเวลาได้ */
function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export type ResetAudience = "customer" | "staff";

function resetUrl(raw: string, audience: ResetAudience = "customer"): string {
  return `${audience === "staff" ? staffBaseUrl() : clientBaseUrl()}/reset-password/${raw}`;
}

function staffResetRequestEmail(fullName: string, username: string, email: string, url: string) {
  return composeMail("ลิงก์ตั้งรหัสผ่านใหม่ (ระบบฝั่งบริษัท)", {
    preheader: "กดปุ่มในอีเมลนี้เพื่อตั้งรหัสผ่านใหม่ หมดอายุใน 30 นาที",
    recipientName: fullName,
    account: email,
    topic: "ตั้งรหัสผ่านใหม่",
    paragraphs: [
      `มีคำขอตั้งรหัสผ่านใหม่สำหรับชื่อผู้ใช้ ${username} ในระบบฝั่งบริษัท กดปุ่มด้านล่างเพื่อตั้งรหัสใหม่ แล้วกลับไปเข้าสู่ระบบด้วยรหัสนั้น`,
    ],
    action: { label: "ตั้งรหัสผ่านใหม่", url },
    notes: [
      "ลิงก์หมดอายุใน 30 นาที และใช้ได้ครั้งเดียว",
      "ตั้งรหัสใหม่แล้ว ทุกเครื่องที่เคยเข้าระบบไว้จะถูกออกจากระบบ · ถ้าเปิดยืนยันตัวตน 2 ชั้นไว้ ยังต้องกรอกรหัสจากแอปตามปกติ",
      "ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ",
    ],
  });
}

/**
 * ปิดอีเมลบางส่วน เช่น `somchai@gmail.com` → `s••••••@gmail.com`
 *
 * หน้าเปิดลิงก์ต้องบอกให้ได้ว่ากำลังตั้งรหัสให้บัญชีไหน แต่ token อยู่ใน URL ซึ่งติดไปกับ
 * ประวัติเบราว์เซอร์และอาจถูกแชร์ต่อโดยไม่ตั้งใจ — โชว์อีเมลเต็มเท่ากับเพิ่มข้อมูลส่วนบุคคล
 * ให้รั่วไปพร้อมกัน (ต่างจากหน้า /activate ที่ลิงก์ถูกส่งมือต่อมือจากพนักงาน)
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "•••••";
  // จำนวนจุดคงที่เสมอ ไม่ผูกกับความยาวจริง — ถ้าไล่จุดตามความยาว หน้าเว็บจะบอกใบ้ว่าชื่อบัญชี
  // ยาวกี่ตัวอักษร ซึ่งเป็นข้อมูลที่ไม่จำเป็นต้องให้ และช่วยคนที่พยายามเดาอีเมลให้แคบลง
  return email[0] + "•••••" + email.slice(at);
}

function resetRequestEmail(fullName: string, email: string, url: string, code: string) {
  return composeMail("คำขอตั้งรหัสผ่านใหม่", {
    preheader: `รหัสตั้งรหัสผ่านใหม่ของคุณคือ ${code} หรือกดปุ่มในอีเมลนี้ หมดอายุใน 30 นาที`,
    recipientName: fullName,
    account: email,
    topic: "ตั้งรหัสผ่านใหม่",
    paragraphs: [
      "มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ กรอกรหัสนี้ในหน้าที่เปิดค้างไว้ หรือกดปุ่ม “ตั้งรหัสผ่านใหม่” ก็ได้",
    ],
    code,
    action: { label: "ตั้งรหัสผ่านใหม่", url },
    notes: [
      "รหัสและปุ่มหมดอายุใน 30 นาที ใช้อย่างใดอย่างหนึ่งได้ครั้งเดียว",
      "อย่าบอกรหัสนี้กับใคร พนักงานของบริษัทจะไม่ขอรหัสนี้จากคุณไม่ว่ากรณีใด",
      "ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ",
    ],
  });
}

function resetDoneEmail(fullName: string, email: string) {
  return composeMail("รหัสผ่านของคุณถูกเปลี่ยนแล้ว", {
    preheader: "รหัสผ่านบัญชีของคุณเพิ่งถูกตั้งใหม่",
    recipientName: fullName,
    account: email,
    topic: "รหัสผ่านของคุณถูกเปลี่ยนแล้ว",
    paragraphs: [
      "รหัสผ่านบัญชีของคุณเพิ่งถูกตั้งใหม่ และทุกเครื่องที่เคยเข้าสู่ระบบไว้ถูกออกจากระบบแล้วเพื่อความปลอดภัย",
    ],
    notes: ["ถ้าคุณไม่ได้เปลี่ยนเอง ติดต่อบริษัทโดยด่วนตามช่องทางท้ายอีเมลนี้"],
  });
}

/** บัญชีที่ขอตั้งรหัสใหม่ได้: ลูกค้าเท่านั้น และต้องยังใช้งานอยู่ */
async function findResettableCustomer(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true, email: true, fullName: true, role: true, active: true },
  });
  // พนักงานตั้งใจไม่ให้รีเซ็ตทางนี้ — ฝั่งบริษัทล็อกอินด้วย username ไม่ใช่อีเมล และอีเมลพนักงาน
  // เป็นช่องที่แก้ได้ในหน้าบัญชี ถ้าเปิดทางนี้ไว้ อีเมลจะกลายเป็นกุญแจสำรองของบัญชีพนักงานโดยปริยาย
  if (!user || user.role !== "CUSTOMER" || !user.active || !user.email) return null;
  return user;
}

/** พนักงานที่ขอลิงก์ทางอีเมลได้: ยังใช้งานอยู่ และอีเมลยืนยันแล้วเท่านั้น */
async function findResettableStaff(username: string) {
  const user = await prisma.user.findUnique({
    where: { username: username.trim().toLowerCase() },
    select: { id: true, email: true, username: true, fullName: true, role: true, active: true, emailVerifiedAt: true },
  });
  if (!user || (user.role !== "OWNER" && user.role !== "ADMIN") || !user.active) return null;
  if (!user.email || !user.emailVerifiedAt) return null;
  return user;
}

/**
 * ขอลิงก์ตั้งรหัสผ่านใหม่ (ลูกค้า — ด้วยอีเมล)
 *
 * **ไม่คืนค่าอะไรเลยและไม่เคยโยน error ที่แยกกรณีได้** ผู้เรียก (route) ตอบข้อความเดียวกันเสมอ
 * ก่อนจะเรียกฟังก์ชันนี้ด้วยซ้ำ เพื่อให้เวลาตอบกลับเท่ากันทุกกรณี ไม่ว่าจะมีบัญชีนั้นจริงหรือไม่
 * (ถ้าส่งเมลก่อนแล้วค่อยตอบ คำขอที่มีบัญชีจริงจะช้ากว่าอย่างเห็นได้ชัด = บอกใบ้ว่ามีบัญชี)
 */
export async function requestPasswordReset(email: string, requestIp?: string): Promise<void> {
  const user = await findResettableCustomer(email);
  if (!user) return;
  await issueReset(user, "customer", requestIp);
}

/** ขอลิงก์ตั้งรหัสผ่านใหม่ (พนักงาน — ด้วยชื่อผู้ใช้) · หลักเดียวกับของลูกค้า: ไม่บอกอะไรผู้ขอเลย */
export async function requestStaffPasswordReset(username: string, requestIp?: string): Promise<void> {
  const user = await findResettableStaff(username);
  if (!user) return;
  await issueReset(user, "staff", requestIp);
}

async function issueReset(
  user: { id: string; email: string | null; fullName: string; username?: string | null },
  audience: ResetAudience,
  requestIp?: string,
): Promise<void> {

  // กวาดลิงก์ที่หมดอายุแล้วของทุกคนทิ้งไปด้วย — ไม่งั้นแถวที่ไม่มีใครใช้ (พร้อมไอพีของคนขอ)
  // จะค้างในฐานข้อมูลตลอดกาล ทั้งที่ไม่มีประโยชน์อะไรแล้ว · ถูกอยู่แล้วเพราะมี index ที่ expiresAt
  await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  const latest = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) return;

  const { raw, hash } = generateToken();
  const code = generateCode();
  // เหลือลิงก์ (และรหัส) ที่ใช้ได้ทีละหนึ่งชุดเสมอ — ชุดเก่าที่ส่งไปแล้วต้องตายทันทีที่ขอใหม่
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        // เมลพนักงานไม่มีรหัส 6 หลัก — ไม่เก็บแฮชรหัสไว้ให้ใครมาไล่เดา
        codeHash: audience === "customer" ? hashCode(hash, code) : null,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        requestIp: requestIp ?? null,
      },
    }),
  ]);

  const mail =
    audience === "staff"
      ? await staffResetRequestEmail(user.fullName, user.username ?? "", user.email!, resetUrl(raw, "staff"))
      : await resetRequestEmail(user.fullName, user.email!, resetUrl(raw), code);
  const sent = await sendMail({ to: user.email!, ...mail });
  if (!sent) {
    // ส่งไม่ออก = ลบทิ้ง ไม่งั้นช่วงพัก 60 วินาทีจะกันไม่ให้ลูกค้ากดขอใหม่ ทั้งที่ยังไม่เคยได้ลิงก์เลย
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    console.error("[password-reset] ส่งอีเมลลิงก์ตั้งรหัสผ่านไม่สำเร็จ", { userId: user.id });
    return;
  }

  await writeAuditLog({
    userId: user.id,
    action: "PASSWORD_RESET_REQUESTED",
    entityType: "User",
    entityId: user.id,
    ip: requestIp,
  });
}

/**
 * ทางกู้ของบัญชีพนักงานจากเครื่องเซิร์ฟเวอร์ (scripts/staff-recover.ts) — ใช้เมื่อ OWNER คนเดียวลืมรหัส
 * และไม่มีอีเมลที่ยืนยันแล้ว · ออกลิงก์ตั้งรหัสใหม่ (30 นาที ใช้ครั้งเดียว) แล้วคืนให้ผู้รันคำสั่ง
 * ไม่ส่งเมล · ไม่มีปลายทาง HTTP เรียกฟังก์ชันนี้ คนที่ใช้ได้ต้องเข้าถึงเครื่องเซิร์ฟเวอร์อยู่แล้ว
 */
export async function createStaffRecoveryLink(username: string): Promise<{ url: string; fullName: string; role: string }> {
  const user = await prisma.user.findUnique({
    where: { username: username.trim().toLowerCase() },
    select: { id: true, fullName: true, role: true, active: true },
  });
  if (!user || (user.role !== "OWNER" && user.role !== "ADMIN")) {
    throw new AuthError(`ไม่พบบัญชีพนักงานชื่อผู้ใช้ "${username}"`, 404);
  }
  if (!user.active) throw new AuthError("บัญชีนี้ถูกระงับอยู่ — เปิดใช้งานก่อน", 400);

  const { raw, hash } = generateToken();
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hash, codeHash: null, expiresAt: new Date(Date.now() + TOKEN_TTL_MS), requestIp: "server-cli" },
    }),
  ]);
  await writeAuditLog({
    userId: user.id,
    action: "PASSWORD_RESET_REQUESTED",
    entityType: "User",
    entityId: user.id,
    details: { via: "server-cli" },
  });
  return { url: resetUrl(raw, "staff"), fullName: user.fullName, role: user.role };
}

const INVALID = "ลิงก์นี้ใช้ไม่ได้แล้วหรือหมดอายุ กรุณาขอลิงก์ใหม่อีกครั้ง";
/**
 * ข้อความเดียวทุกกรณีของรหัส (ผิด / หมดอายุ / ผิดจนครบเพดาน / ไม่มีบัญชีนี้)
 * ห้ามแยกข้อความ "ผิดครบแล้ว" — คนนอกกดขอรหัสให้อีเมลใดก็ได้ แล้วเดาผิดไล่ไปจนครบ ถ้าข้อความ
 * เปลี่ยนเมื่อครบ แปลว่าอีเมลนั้นมีบัญชีจริง (มีแต่บัญชีจริงที่มีรหัสให้นับครั้ง)
 */
export const CODE_INVALID = `รหัสไม่ถูกต้องหรือหมดอายุ — กรอกผิดเกิน ${MAX_CODE_ATTEMPTS} ครั้งต้องขอรหัสใหม่`;

/** ลิงก์ของลูกค้าใช้ตั้งรหัสพนักงานไม่ได้ และกลับกัน — ปลายทางต้องตรงกับชนิดบัญชี */
function audienceAllows(role: string, audience: ResetAudience): boolean {
  return audience === "customer" ? role === "CUSTOMER" : role === "OWNER" || role === "ADMIN";
}

/** หา token ที่ยังใช้ได้ — ข้อความผิดพลาดเหมือนกันทุกกรณี (ไม่มี / หมดอายุ / บัญชีถูกปิด) */
async function findUsableToken(raw: string, audience: ResetAudience = "customer") {
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          // username กับ passwordHash ไม่ได้ใช้แสดงผลที่ไหน — ดึงมาเพื่อส่งให้
          // assertNewPasswordUsable ตรวจ "ห้ามมีข้อมูลตัวเองในรหัส" และ "ห้ามตั้งรหัสเดิมซ้ำ"
          username: true,
          passwordHash: true,
          fullName: true,
          role: true,
          active: true,
          emailVerifiedAt: true,
        },
      },
    },
  });
  if (!row || row.expiresAt < new Date() || !audienceAllows(row.user.role, audience) || !row.user.active) {
    throw new AuthError(INVALID, 400);
  }
  return row;
}

/**
 * เปิดลิงก์ — แค่ตรวจว่ายังใช้ได้ **ไม่เผา token ทิ้ง**
 *
 * สำคัญ: โปรแกรมอ่านอีเมลและตัวสแกนความปลอดภัยหลายตัวจะ "กดลิงก์ล่วงหน้า" เอง ถ้าการเปิดลิงก์
 * ทำให้ token ถูกใช้ไปเลย ลูกค้าจะเจอลิงก์ตายก่อนได้แตะด้วยซ้ำ — การเผา token เกิดตอนกดตั้งรหัสจริง
 * (POST) เท่านั้น
 */
export async function inspectResetToken(
  raw: string,
  audience: ResetAudience = "customer",
): Promise<{ maskedEmail: string; username: string | null }> {
  const row = await findUsableToken(raw, audience);
  // ชื่อผู้ใช้ของพนักงานโชว์เต็ม — เป็นชื่อเข้าระบบที่ต้องใช้หลังตั้งรหัส ไม่ใช่ข้อมูลส่วนบุคคล
  // ลิงก์จากคำสั่งกู้บนเซิร์ฟเวอร์อาจเป็นบัญชีที่ไม่มีอีเมล — ส่งค่าว่าง ให้หน้าเว็บไม่ต้องโชว์จุดปิดอีเมลเปล่า ๆ
  return {
    maskedEmail: row.user.email ? maskEmail(row.user.email) : "",
    username: audience === "staff" ? row.user.username : null,
  };
}

/**
 * ยืนยันรหัส 6 หลักจากเมล (ทางเลือกแทนการกดลิงก์) — ถูกแล้วได้ลิงก์ใหม่กลับไปให้หน้าเว็บ
 * ตั้งรหัสผ่านต่อในหน้าเดิม ผ่านเส้นทางเดียวกับการกดลิงก์ (inspect → resetPassword)
 *
 * ลิงก์ในเมลตายทันทีที่รหัสถูกใช้ (แฮชลิงก์ถูกเปลี่ยน) และรหัสถูกล้างทิ้ง — ใช้อันไหนก่อนอีกอันตาย
 * ทุกการเปลี่ยนแถวเป็น updateMany แบบมีเงื่อนไข: ยิงพร้อมกันหลายคำขอก็นับครั้ง/ใช้รหัสได้ทีละหนึ่งจริง
 */
export async function verifyResetCode(email: string, code: string): Promise<{ token: string; maskedEmail: string }> {
  const user = await findResettableCustomer(email);
  const row = user
    ? await prisma.passwordResetToken.findFirst({
        where: { userId: user.id, expiresAt: { gt: new Date() }, codeHash: { not: null } },
        select: { id: true, tokenHash: true, codeHash: true, codeAttempts: true },
      })
    : null;
  if (!user || !row?.codeHash || row.codeAttempts >= MAX_CODE_ATTEMPTS) throw new AuthError(CODE_INVALID, 400);

  const expected = Buffer.from(row.codeHash, "hex");
  const given = Buffer.from(hashCode(row.tokenHash, code), "hex");
  if (!crypto.timingSafeEqual(expected, given)) {
    // นับครั้งแบบมีเงื่อนไข — คำขอที่ยิงพร้อมกันจะนับเกินเพดานไม่ได้
    await prisma.passwordResetToken.updateMany({
      where: { id: row.id, codeAttempts: { lt: MAX_CODE_ATTEMPTS } },
      data: { codeAttempts: { increment: 1 } },
    });
    // ครบเพดาน = ลบทั้งแถว ลิงก์ในเมลเดียวกันตายด้วย (มีคนกำลังไล่เดาอยู่ ไม่ควรเหลือกุญแจไว้)
    await prisma.passwordResetToken.deleteMany({ where: { id: row.id, codeAttempts: { gte: MAX_CODE_ATTEMPTS } } });
    throw new AuthError(CODE_INVALID, 400);
  }

  // รหัสถูก: เปลี่ยนแฮชลิงก์ (ลิงก์ในเมลตาย) + ล้างรหัส ในคำสั่งเดียวที่มีเงื่อนไขว่ารหัสยังเป็นตัวเดิม
  // — สองคำขอที่ถือรหัสถูกยิงมาพร้อมกัน จะมีแค่อันเดียวที่ได้ count = 1
  const { raw, hash } = generateToken();
  const claimed = await prisma.passwordResetToken.updateMany({
    where: { id: row.id, codeHash: row.codeHash, codeAttempts: { lt: MAX_CODE_ATTEMPTS } },
    data: { tokenHash: hash, codeHash: null },
  });
  if (claimed.count !== 1) throw new AuthError(CODE_INVALID, 400);
  return { token: raw, maskedEmail: maskEmail(user.email!) };
}

/**
 * ตั้งรหัสผ่านใหม่จากลิงก์
 *
 * **ไม่ออก session ให้** ตั้งเสร็จต้องไปล็อกอินเองด้วยรหัสใหม่ — คนที่อ่านอีเมลได้จะได้ไม่ได้
 * session ติดมือไปฟรี ๆ จากการกดลิงก์เฉย ๆ และการบังคับล็อกอินซ้ำก็ยืนยันว่ารหัสใหม่ใช้ได้จริง
 */
export async function resetPassword(
  raw: string,
  newPassword: string,
  meta: { ip?: string; userAgent?: string },
  audience: ResetAudience = "customer",
): Promise<void> {
  const row = await findUsableToken(raw, audience);
  // ตรวจก่อนเผา token — ถ้าตรวจหลังลบ คนที่ตั้งรหัสไม่ผ่านกฎจะเสียลิงก์ไปเปล่า ๆ ต้องขอใหม่
  const problem = await newPasswordProblem(row.user, newPassword);
  if (problem !== null) throw new AuthError(problem, 400);
  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    // ลบ token ก่อนทำอย่างอื่น แล้วเช็คว่าเราคือคนที่ลบได้จริง — ถ้ามีคำขอสองอันถือ token เดียวกัน
    // ยิงเข้ามาพร้อมกัน จะมีแค่อันเดียวที่ deleteMany คืน count = 1 อีกอันได้ 0 แล้ว rollback ทิ้ง
    // (ถ้าเช็คว่า "ยังใช้ได้ไหม" ก่อนแล้วค่อยลบทีหลัง ทั้งสองอันจะผ่านด่านตรวจไปพร้อมกัน)
    const claimed = await tx.passwordResetToken.deleteMany({ where: { id: row.id } });
    if (claimed.count !== 1) throw new AuthError(INVALID, 400);

    await tx.user.update({
      where: { id: row.userId },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        // ตัด session ที่ค้างอยู่ทุกเครื่องทันที — ถ้าบัญชีถูกยึดไปก่อนหน้านี้ การตั้งรหัสใหม่
        // ต้องไล่คนนั้นออกด้วย ไม่ใช่แค่เปลี่ยนรหัสแล้วปล่อยคุกกี้เดิมใช้ต่อได้
        sessionVersion: { increment: 1 },
        // ปลดล็อกบัญชีที่โดนล็อกจากการกรอกรหัสผิดหลายครั้ง — ไม่งั้นคนที่ลืมรหัสจนโดนล็อก
        // จะตั้งรหัสใหม่ได้แต่ยังเข้าไม่ได้อยู่ดี
        failedAttempts: 0,
        lockedUntil: null,
        // กดลิงก์ในกล่องจดหมายได้ = พิสูจน์แล้วว่าคุมอีเมลนี้จริง ซึ่งคือสิ่งเดียวกับที่การยืนยัน
        // อีเมลต้องการ · บัญชีที่สมัครค้างไว้ไม่เคยยืนยันจึงไม่ต้องไปวนกรอกรหัส 6 หลักอีกรอบ
        // เขียนเฉพาะตอนยังไม่เคยยืนยัน — ไม่ทับวันยืนยันเดิมของคนที่ยืนยันไปนานแล้ว
        ...(row.user.emailVerifiedAt === null ? { emailVerifiedAt: new Date() } : {}),
        // พนักงานตั้งรหัสเองแล้ว — รหัสที่ OWNER เคยตั้งให้ (ต้องเปลี่ยนก่อนใช้) หมดความหมาย
        ...(audience === "staff" ? { mustChangePassword: false } : {}),
      },
    });
    // ลิงก์ตั้งรหัสใบอื่นของบัญชีนี้ตายพร้อมกัน
    await tx.passwordResetToken.deleteMany({ where: { userId: row.userId } });
    // ลิงก์ที่พนักงานเคยออกให้แล้วยังไม่ถูกใช้ ก็เป็นกุญแจตั้งรหัสผ่านเหมือนกัน ต้องตายด้วย
    await tx.accountAccessToken.deleteMany({ where: { userId: row.userId, usedAt: null } });
    // รหัสยืนยันอีเมลที่ค้างอยู่ไม่มีความหมายแล้ว เพราะเพิ่งยืนยันผ่านลิงก์นี้ไปแทน
    await tx.emailVerification.deleteMany({ where: { userId: row.userId } });
  });

  await writeAuditLog({
    userId: row.userId,
    action: "PASSWORD_RESET",
    entityType: "User",
    entityId: row.userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  // แจ้งให้เจ้าของบัญชีรู้ว่ารหัสถูกเปลี่ยน — ส่งไม่ออกก็ไม่ถือว่าการตั้งรหัสล้มเหลว
  if (row.user.email) {
    const to = row.user.email;
    void resetDoneEmail(row.user.fullName, to).then((mail) => sendMail({ to, ...mail }));
  }
}
