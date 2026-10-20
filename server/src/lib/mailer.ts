import type { MailCheckDto, MailStatusDto, MailTransportMode } from "@systemboq/shared-types";
import nodemailer, { type Transporter } from "nodemailer";

import { clientBaseUrl } from "./access-token";
import { prisma } from "./prisma";

/**
 * ส่งอีเมลออกจากระบบ — ตัวเดียวที่รู้จักผู้ให้บริการส่งเมล ที่อื่นเรียกแค่ sendMail()
 *
 * **ทำไมเป็น SMTP ไม่ใช่ SDK ของเจ้าใดเจ้าหนึ่ง:** Resend · Brevo · Amazon SES · Gmail
 * ต่อผ่าน SMTP ได้หมด เปลี่ยนผู้ให้บริการทีหลังจึงแก้แค่ .env ไม่ต้องแตะโค้ดหรือลงไลบรารีใหม่
 *
 * **ค่าเริ่มต้นคือโหมด console** — พิมพ์เมลลง log แทนการส่งจริง เครื่อง dev และเทสต์จึงทำงานได้ครบ
 * โดยไม่ต้องมีคีย์ และไม่มีทางยิงเมลจริงไปหาลูกค้าจริงโดยบังเอิญ ตอน deploy ค่อยตั้ง
 * MAIL_TRANSPORT=smtp พร้อม SMTP_* (ดู .env.example)
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** ข้อความล้วน — จำเป็นเสมอ ตัวอ่านเมลบางตัวไม่แสดง HTML */
  text: string;
  html?: string;
  /** รูปที่ HTML อ้างด้วย src="cid:..." — แนบไปกับเมล (ใช้กับโลโก้หัวจดหมาย) */
  inlineImages?: { cid: string; filename: string; content: Buffer; contentType: string }[];
}

export function transportMode(): MailTransportMode {
  const mode = (process.env.MAIL_TRANSPORT ?? "console").toLowerCase();
  if (mode === "smtp") return "smtp";
  if (mode === "silent") return "silent";
  return "console";
}

/**
 * เมลฉบับล่าสุดที่ "ส่ง" ในโหมดที่ไม่ได้ส่งจริง — มีไว้ให้เทสต์อ่านรหัสยืนยันออกมาได้
 * (ฐานข้อมูลเก็บแต่แฮชของรหัส อ่านย้อนไม่ได้) · ไม่เคยบันทึกอะไรในโหมด smtp
 */
const outbox: MailMessage[] = [];
const OUTBOX_LIMIT = 20;

export function lastMailTo(to: string): MailMessage | undefined {
  return [...outbox].reverse().find((m) => m.to.toLowerCase() === to.toLowerCase());
}

export function clearOutbox(): void {
  outbox.length = 0;
}

/**
 * เตือนตอนเซิร์ฟเวอร์เริ่มทำงานว่าอีเมล "ไม่ได้ออกไปจริง"
 *
 * โหมด console/silent ตั้งใจให้เป็นค่าเริ่มต้นเพื่อไม่ให้เผลอยิงเมลจริงไปหาลูกค้าจริง แต่ผลข้างเคียง
 * คือคนที่ทดลองใช้งานจริง (กดลืมรหัสผ่านแล้วรอเมล) จะไม่ได้อะไรเลยและไม่มีอะไรบอกว่าทำไม —
 * เคยเกิดขึ้นจริงตอนทดสอบ เสียเวลาไล่หาสาเหตุที่หน้าเว็บทั้งที่หน้าเว็บทำงานถูกต้อง
 */
export function warnIfMailNotSending(): void {
  const mode = transportMode();
  if (mode === "smtp") return;
  console.warn(
    [
      "",
      "!".repeat(72),
      `[เมล] MAIL_TRANSPORT=${mode} — อีเมลทุกฉบับ "ไม่ถูกส่งออกไปจริง"`,
      mode === "console"
        ? "      เนื้อเมล (รวมลิงก์ตั้งรหัสผ่านและรหัสยืนยัน) จะถูกพิมพ์ลง log นี้แทน"
        : "      เนื้อเมลถูกทิ้งเงียบ ๆ ไม่พิมพ์ลง log",
      "      ตอน deploy ต้องตั้ง MAIL_TRANSPORT=smtp + SMTP_* และ CLIENT_BASE_URL (ดู .env.example)",
      "!".repeat(72),
      "",
    ].join("\n"),
  );
}

export function mailFrom(): string {
  return process.env.MAIL_FROM ?? "Awarin Engineering <no-reply@awarin.co.th>";
}

let cached: Transporter | null = null;
let cachedFor = "";

function smtpTransport(): Transporter {
  const host = process.env.SMTP_HOST;
  if (!host) {
    throw new Error("MAIL_TRANSPORT=smtp แต่ยังไม่ได้ตั้ง SMTP_HOST — ดู .env.example");
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const key = `${host}:${port}:${process.env.SMTP_USER ?? ""}`;
  if (cached && cachedFor === key) return cached;

  cached = nodemailer.createTransport({
    host,
    port,
    // ค่าเริ่มต้นของ nodemailer รอต่อได้ถึง 2 นาที — สมัครสมาชิกรอส่งรหัสยืนยันอยู่ ตั้ง host ผิดทีเดียว
    // หน้าเว็บจะค้างจนผู้ใช้ปิดไปเอง · 15 วินาทีพอสำหรับผู้ให้บริการทุกเจ้าที่ทำงานปกติ
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    // 465 คือ SMTPS (เข้ารหัสตั้งแต่เชื่อมต่อ) ส่วน 587 ใช้ STARTTLS ซึ่ง nodemailer ยกระดับให้เอง
    secure: (process.env.SMTP_SECURE ?? (port === 465 ? "true" : "false")).toLowerCase() === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
  cachedFor = key;
  return cached;
}

function smtpSettings() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    host: process.env.SMTP_HOST || null,
    port,
    secure: (process.env.SMTP_SECURE ?? (port === 465 ? "true" : "false")).toLowerCase() === "true",
    user: process.env.SMTP_USER || null,
  };
}

/**
 * แปล error จาก SMTP เป็นภาษาคน พร้อมบอกว่าต้องแก้ค่าไหนใน .env
 *
 * ข้อความดิบของ nodemailer (เช่น "Invalid login: 535-5.7.8") ไม่บอกว่าผิดที่ไหน — เจอบ่อยที่สุดคือ
 * ใส่รหัสผ่าน Gmail ปกติแทน App Password ซึ่งดูจากข้อความดิบแล้วเดาไม่ออก
 */
export function describeSmtpError(err: unknown): string {
  const e = (err ?? {}) as { code?: unknown; responseCode?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const response = typeof e.responseCode === "number" ? e.responseCode : 0;
  const message = typeof e.message === "string" ? e.message : String(err);
  const { host, port } = smtpSettings();

  if (message.includes("SMTP_HOST")) return message;
  if (code === "EAUTH" || response === 535 || response === 534) {
    return (
      "เข้าสู่ระบบ SMTP ไม่ผ่าน — SMTP_USER หรือ SMTP_PASS ไม่ถูกต้อง · ถ้าใช้ Gmail ต้องใส่ App Password 16 ตัว " +
      "(ไม่ใช่รหัสผ่าน Gmail ปกติ) และบัญชีต้องเปิดการยืนยันตัวตน 2 ขั้นก่อนถึงจะสร้าง App Password ได้"
    );
  }
  if (/wrong version number|ssl3_get_record|tls_validate_record_header/i.test(message)) {
    return (
      `การเข้ารหัสไม่ตรงกับพอร์ต ${port} — พอร์ต 587 ต้องตั้ง SMTP_SECURE=false ` +
      "ส่วนพอร์ต 465 ต้องตั้ง SMTP_SECURE=true"
    );
  }
  if (code === "EDNS" || /ENOTFOUND|EAI_AGAIN/.test(message)) {
    return `หาเซิร์ฟเวอร์ ${host ?? "(ว่าง)"} ไม่เจอ — ตรวจ SMTP_HOST ว่าพิมพ์ถูก เช่น smtp.gmail.com`;
  }
  if (["ETIMEDOUT", "ECONNECTION", "ESOCKET"].includes(code) || /ECONNREFUSED|ECONNRESET|timeout/i.test(message)) {
    return (
      `ต่อ ${host}:${port} ไม่ได้ — ตรวจ SMTP_PORT (Gmail ใช้ 587 หรือ 465) และ SMTP_SECURE ให้ตรงกับพอร์ต ` +
      "หรือเครือข่าย/ไฟร์วอลล์อาจปิดพอร์ตนี้"
    );
  }
  if (code === "EENVELOPE" || response === 550 || response === 553 || response === 554) {
    return (
      "เซิร์ฟเวอร์ไม่รับผู้ส่งหรือผู้รับ — ตั้ง MAIL_FROM ให้เป็นอีเมลเดียวกับ SMTP_USER " +
      "และตรวจว่าอีเมลปลายทางพิมพ์ถูก"
    );
  }
  return `ส่งไม่สำเร็จ: ${message.slice(0, 200)}`;
}

/**
 * ผลตรวจล่าสุดเก็บในตาราง MailTransportCheck (แถวเดียว) ให้ API ทุกตัวเห็นตรงกัน — เดิมอยู่ในหน่วยความจำ
 * หน้า "การส่งอีเมล" จะได้ผลของเครื่องที่บังเอิญรับคำขอ ซึ่งอาจยังไม่เคยตรวจ หรือตรวจไว้ก่อนแก้ค่า
 *
 * เขียนไม่ได้ (DB สะดุด) = ไม่ทำให้การส่งเมล/การตรวจล้ม แค่หน้าตั้งค่าเห็นผลเก่า
 */
async function recordCheck(ok: boolean, problem: string | null): Promise<MailCheckDto> {
  const check: MailCheckDto = { ok, at: new Date().toISOString(), problem };
  const data = { ok, problem, checkedAt: new Date(check.at) };
  await prisma.mailTransportCheck
    .upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data })
    .catch((err: unknown) => console.error("[mailer] บันทึกผลตรวจไม่ได้:", err));
  return check;
}

async function readLastCheck(): Promise<MailCheckDto | null> {
  const row = await prisma.mailTransportCheck.findUnique({ where: { id: 1 } });
  return row ? { ok: row.ok, at: row.checkedAt.toISOString(), problem: row.problem } : null;
}

/**
 * ลองเชื่อมต่อ + ล็อกอิน SMTP โดยไม่ส่งเมล — คืน null ถ้าไม่ได้อยู่โหมด smtp (ไม่มีอะไรให้ตรวจ)
 *
 * ไม่มีการตรวจนี้ ค่าที่ตั้งผิดจะรู้ก็ต่อเมื่อลูกค้าคนแรกกดลืมรหัสผ่านแล้วเมลไม่มา
 */
export async function verifyMailTransport(): Promise<MailCheckDto | null> {
  if (transportMode() !== "smtp") return null;
  try {
    await smtpTransport().verify();
    return recordCheck(true, null);
  } catch (err) {
    return recordCheck(false, describeSmtpError(err));
  }
}

export async function mailStatus(): Promise<MailStatusDto> {
  const mode = transportMode();
  return {
    mode,
    from: mailFrom(),
    smtp: mode === "smtp" ? smtpSettings() : null,
    linkBaseUrl: clientBaseUrl(),
    lastCheck: mode === "smtp" ? await readLastCheck() : null,
  };
}

/**
 * รายงานสถานะเมลตอนเซิร์ฟเวอร์เริ่มทำงาน — โหมดไม่ส่งจริงเตือนตัวโต ส่วนโหมด smtp ลองต่อจริงทันที
 * ไม่ทำให้เซิร์ฟเวอร์ล้ม ส่วนอื่นของระบบยังต้องใช้งานได้แม้เมลเสีย
 */
export async function reportMailOnStartup(): Promise<void> {
  if (transportMode() !== "smtp") {
    warnIfMailNotSending();
    return;
  }
  const { host, port, user } = smtpSettings();
  const check = await verifyMailTransport();
  if (check?.ok) {
    console.log(`[เมล] ส่งจริงผ่าน ${host}:${port} (${user ?? "ไม่ล็อกอิน"}) — เชื่อมต่อสำเร็จ`);
    if (/localhost|127\.0\.0\.1/.test(clientBaseUrl())) {
      console.warn(`[เมล] ลิงก์ในเมลยังชี้ไปที่ ${clientBaseUrl()} — ตอน deploy ต้องตั้ง CLIENT_BASE_URL`);
    }
    return;
  }
  console.warn(
    [
      "",
      "!".repeat(72),
      `[เมล] MAIL_TRANSPORT=smtp แต่ต่อ ${host ?? "(ไม่ได้ตั้ง SMTP_HOST)"}:${port} ไม่สำเร็จ — เมลจะส่งไม่ออก`,
      `      ${check?.problem ?? ""}`,
      "!".repeat(72),
      "",
    ].join("\n"),
  );
}

/**
 * ส่งเมลหนึ่งฉบับ — คืน true ถ้าส่งออกไปแล้ว
 *
 * **ไม่โยน error ออกไป** เพราะทุกจุดที่เรียกใช้อยู่กลางเส้นทางที่ผู้ใช้กำลังรอ (สมัครสมาชิก,
 * ขอรหัสใหม่) ถ้าเมลส่งไม่ออกต้องบอกผู้ใช้ด้วยข้อความที่เข้าใจได้ ไม่ใช่หน้าจอพัง — คนเรียก
 * ตัดสินใจเองว่าจะทำอะไรต่อจากค่าที่คืนมา
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const mode = transportMode();

  if (mode !== "smtp") {
    outbox.push(message);
    if (outbox.length > OUTBOX_LIMIT) outbox.shift();
  }

  if (mode === "silent") return true;

  if (mode === "console") {
    console.info(
      [
        "",
        "─".repeat(72),
        "[เมลจำลอง] MAIL_TRANSPORT=console — ไม่ได้ส่งออกไปจริง",
        `ถึง     : ${message.to}`,
        `จาก     : ${mailFrom()}`,
        `เรื่อง   : ${message.subject}`,
        "─".repeat(72),
        message.text,
        "─".repeat(72),
        "",
      ].join("\n"),
    );
    return true;
  }

  try {
    await smtpTransport().sendMail({
      from: mailFrom(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: (message.inlineImages ?? []).map((img) => ({
        filename: img.filename,
        content: img.content,
        contentType: img.contentType,
        cid: img.cid,
        contentDisposition: "inline" as const,
      })),
    });
    return true;
  } catch (err) {
    // เก็บไว้ใน log ให้ดูย้อนหลังได้ว่าเมลฉบับไหนส่งไม่ออก แต่ไม่พ่นรายละเอียดกลับไปหาผู้ใช้
    console.error("[mailer] ส่งอีเมลไม่สำเร็จ", { to: message.to, subject: message.subject, err });
    // ให้หน้าตั้งค่าเห็นด้วย ไม่ต้องรอไปเปิด log — ส่งไม่ออกส่วนใหญ่คือค่าการเชื่อมต่อผิด
    await recordCheck(false, describeSmtpError(err));
    return false;
  }
}
