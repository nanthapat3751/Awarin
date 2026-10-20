import { loadCompanyProfile } from "./company-profile";
import type { MailMessage } from "./mailer";

/**
 * แม่แบบอีเมลทุกฉบับที่ระบบส่ง — แบบการ์ดกลางจอ (แนวเมลบัญชี Google): พื้นเทาอ่อน →
 * การ์ดขาวมีโลโก้ + หัวข้อกลาง + อีเมลบัญชีผู้รับ → เนื้อความสั้น → รหัส/ปุ่มกลางการ์ด → ท้ายเมลตัวเล็กนอกการ์ด
 * ภาษาแบบ "คุณ" สั้น ๆ ไม่มี เรียน/ขอแสดงความนับถือ — เมลระบบอัตโนมัติไม่ใช่จดหมายราชการ
 *
 * ชื่อ ที่อยู่ เบอร์ อีเมล เลขผู้เสียภาษี และโลโก้ ดึงจากหน้าตั้งค่าชุดเดียวกับ PDF (loadCompanyProfile)
 * เปลี่ยนในหน้าตั้งค่าแล้วเมลเปลี่ยนตาม · ช่องที่ยังว่างไม่พิมพ์ ไม่เติมข้อมูลขึ้นมาเอง
 *
 * ข้อจำกัดของโปรแกรมอ่านเมลที่ทำให้หน้าตาโค้ดต่างจากหน้าเว็บ:
 *   - จัดวางด้วย <table> และ style แบบ inline เท่านั้น — Gmail/Outlook ตัด <style> กับ flex/grid ทิ้ง
 *   - โลโก้แนบไปกับเมลแบบ CID (inline attachment) — Gmail บล็อก data URI และรูปจากเซิร์ฟเวอร์
 *     ที่ยังเป็น localhost คนนอกโหลดไม่ได้ · CID แสดงได้ทันทีโดยไม่ต้องมีเว็บจริง
 *   - ปุ่มเป็นลิงก์ใน <td> ที่ลงสีพื้น (bulletproof button) Outlook จึงกดได้ทั้งปุ่ม ไม่ใช่แค่ตัวอักษร
 *
 * **ทุกข้อความผ่าน escapeHtml** — ชื่อลูกค้ามาจากช่องสมัครสมาชิก ถ้าไม่ escape ใครก็ตั้งชื่อเป็น
 * HTML แล้วฝังลิงก์หลอกลงในเมลที่ออกจากบริษัทได้
 */

const BRAND = "#000099";
const INK = "#202124";
const BODY = "#3c4043";
const MUTED = "#5f6368";
const FAINT = "#70757a";
const CARD_BORDER = "#dadce0";
const DIVIDER = "#e8eaed";
const PAGE = "#f6f8fc";
const FONT = "'Sarabun','Leelawadee UI','Leelawadee',Tahoma,Arial,sans-serif";

/** ใช้เมื่ออ่านข้อมูลบริษัทไม่ได้ — เมลยืนยัน/ลืมรหัสต้องส่งออกได้แม้ฐานข้อมูลสะดุด */
export const FALLBACK_COMPANY_NAME = "Awarin Engineering Co., Ltd.";
/** ชื่อสั้นท้ายหัวเรื่องเมล */
export const MAIL_SUBJECT_SUFFIX = "Awarin Engineering";
export const LOGO_CID = "company-logo@systemboq";

export interface MailContent {
  /** ข้อความตัวอย่างที่กล่องจดหมายโชว์ต่อจากหัวเรื่อง — ไม่แสดงในตัวเมล */
  preheader: string;
  /** null = ไม่ทักชื่อ (เช่น เมลทดสอบที่ส่งถึงใครก็ได้) */
  recipientName: string | null;
  /** อีเมลบัญชีผู้รับ — แสดงใต้หัวข้อให้รู้ทันทีว่าเมลนี้เกี่ยวกับบัญชีไหน */
  account?: string | null;
  /** หัวข้อใหญ่กลางการ์ด */
  topic: string;
  paragraphs: string[];
  /** รหัสตัวเลขที่ต้องให้เด่นที่สุดในเมล */
  code?: string;
  action?: { label: string; url: string };
  /** หมายเหตุตัวเล็กก่อนคำลงท้าย เช่น อายุลิงก์ / ถ้าไม่ได้เป็นคนขอ */
  notes?: string[];
}

export interface MailBrand {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  branch: string | null;
  /** PNG สำหรับแนบแบบ CID — null = ไม่มีโลโก้ (หัวจดหมายเหลือแค่ชื่อ) */
  logo: { png: Buffer; width: number; height: number } | null;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** ลิงก์ในเมลต้องเป็น http(s) เท่านั้น — กัน javascript: หรือ data: หลุดเข้า href */
function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function greeting(content: MailContent): string | null {
  const name = content.recipientName;
  if (!name) return null;
  // ชื่อไทยติดคำว่าคุณ (คุณสมชาย) · ชื่ออังกฤษเว้นวรรค (คุณ John) ไม่งั้นอ่านเป็นคำเดียว
  return /^[\u0E00-\u0E7F]/.test(name) ? `สวัสดีคุณ${name}` : `สวัสดีคุณ ${name}`;
}

/** บรรทัดติดต่อท้ายจดหมาย — เฉพาะช่องที่กรอกไว้จริงในหน้าตั้งค่า */
function contactLines(brand: MailBrand): string[] {
  const lines: string[] = [];
  if (brand.address) lines.push(brand.address);
  const reach = [brand.phone && `โทร ${brand.phone}`, brand.email && `อีเมล ${brand.email}`].filter(Boolean);
  if (reach.length) lines.push(reach.join(" · "));
  if (brand.taxId) {
    lines.push(`เลขประจำตัวผู้เสียภาษี ${brand.taxId}${brand.branch ? ` (${brand.branch})` : ""}`);
  }
  return lines;
}

const DISCLAIMER = "อีเมลนี้ส่งจากระบบอัตโนมัติ ตอบกลับไม่ได้ · มีข้อสงสัยติดต่อบริษัทตามช่องทางด้านล่าง";

// ─────────────────────────── HTML ───────────────────────────

/**
 * โลโก้กลางหัวการ์ด — อยู่บนพื้นขาวของการ์ด ไม่ใช่พื้นเทา เพราะไฟล์โลโก้ส่วนใหญ่มีพื้นขาวทึบ
 * วางบนพื้นเทาแล้วกลายเป็นกล่องขาวลอย · ไม่มีโลโก้ = ชื่อบริษัทตัวหนาแทน
 */
function brandMark(brand: MailBrand): string {
  if (!brand.logo) {
    return `<div style="margin-bottom:20px;font-size:15px;font-weight:700;color:${BRAND};">${escapeHtml(brand.name)}</div>`;
  }
  // แสดงสูง 48px — ไฟล์จริงใหญ่กว่า จอความละเอียดสูงจึงยังคม
  const h = 48;
  const w = Math.round((brand.logo.width / brand.logo.height) * h);
  return `<img src="cid:${LOGO_CID}" width="${w}" height="${h}" alt="${escapeHtml(brand.name)}" style="display:block;margin:0 auto 20px;border:0;outline:none;">`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:${BODY};">${escapeHtml(text)}</p>`;
}

function codeBlock(code: string): string {
  return `
        <div style="margin:22px 0 24px;text-align:center;font-family:${FONT};font-size:34px;font-weight:700;letter-spacing:8px;color:${INK};">${escapeHtml(code)}</div>`;
}

function actionButton(action: { label: string; url: string }): string {
  // ลิงก์ที่ไม่ใช่เว็บไม่แสดงทั้งปุ่มและข้อความสำรอง — ปุ่มที่กดแล้วไม่ไปไหนแย่กว่าไม่มีปุ่ม
  if (!isHttpUrl(action.url)) return "";
  const href = escapeHtml(action.url);
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:22px auto 18px;">
          <tr><td bgcolor="${BRAND}" style="border-radius:6px;">
            <a href="${href}" target="_blank" style="display:inline-block;padding:12px 32px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(action.label)}</a>
          </td></tr>
        </table>
        <p style="margin:0 0 18px;font-size:12px;line-height:1.6;color:${MUTED};">ถ้ากดปุ่มไม่ได้ คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์<br><a href="${href}" target="_blank" style="color:${BRAND};word-break:break-all;">${escapeHtml(action.url)}</a></p>`;
}

export function renderMailHtml(content: MailContent, brand: MailBrand): string {
  const hello = greeting(content);
  const notes = (content.notes ?? [])
    .map((n) => `<p style="margin:0 0 6px;font-size:13px;line-height:1.65;color:${MUTED};">${escapeHtml(n)}</p>`)
    .join("");
  const contacts = contactLines(brand)
    .map((l) => `${escapeHtml(l)}<br>`)
    .join("");

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(content.topic)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(content.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};">
  <tr><td align="center" style="padding:32px 12px;font-family:${FONT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid ${CARD_BORDER};border-radius:8px;font-family:${FONT};">
      <tr><td style="padding:32px 28px 12px;text-align:center;">
        ${brandMark(brand)}
        <div style="font-size:22px;font-weight:700;line-height:1.4;color:${INK};">${escapeHtml(content.topic)}</div>
        ${content.account ? `<div style="margin-top:6px;font-size:14px;color:${MUTED};">${escapeHtml(content.account)}</div>` : ""}
      </td></tr>
      <tr><td style="padding:16px 28px 28px;">
        <div style="border-top:1px solid ${DIVIDER};padding-top:22px;">
          ${hello ? paragraph(hello) : ""}
          ${content.paragraphs.map(paragraph).join("")}
          ${content.code ? codeBlock(content.code) : ""}
          ${content.action ? actionButton(content.action) : ""}
          ${notes ? `<div style="margin-top:6px;">${notes}</div>` : ""}
        </div>
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
      <tr><td style="padding:18px 24px 0;text-align:center;font-family:${FONT};font-size:12px;line-height:1.7;color:${FAINT};">
        ${escapeHtml(DISCLAIMER)}<br><br>
        <b style="color:${MUTED};">${escapeHtml(brand.name)}</b><br>
        ${contacts}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ─────────────────────────── ข้อความล้วน ───────────────────────────

/** ฉบับข้อความล้วน — เนื้อหาเดียวกับ HTML ทุกบรรทัด สำหรับโปรแกรมอ่านเมลที่ไม่แสดง HTML */
export function renderMailText(content: MailContent, brand: MailBrand): string {
  const hello = greeting(content);
  const lines: string[] = [content.topic];
  if (content.account) lines.push(content.account);
  lines.push("");
  if (hello) lines.push(hello, "");
  lines.push(...content.paragraphs);
  if (content.code) lines.push("", `    ${content.code}`);
  if (content.action && isHttpUrl(content.action.url)) lines.push("", `${content.action.label}: ${content.action.url}`);
  if (content.notes?.length) lines.push("", ...content.notes);
  lines.push("", "—".repeat(24), DISCLAIMER, "", brand.name, ...contactLines(brand));
  return lines.join("\n");
}

// ─────────────────────────── ประกอบเมล ───────────────────────────

function meaningful(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v && v !== "-" ? v : null;
}

function logoFromDataUri(dataUri: string | null): MailBrand["logo"] {
  if (!dataUri?.startsWith("data:image/png;base64,")) return null;
  const png = Buffer.from(dataUri.slice(dataUri.indexOf(",") + 1), "base64");
  if (png.length < 24 || png.toString("ascii", 12, 16) !== "IHDR") return null;
  return { png, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

export async function loadMailBrand(): Promise<MailBrand> {
  try {
    const p = await loadCompanyProfile();
    return {
      name: meaningful(p.companyName) ?? FALLBACK_COMPANY_NAME,
      address: meaningful(p.companyAddress),
      phone: meaningful(p.companyPhone),
      email: meaningful(p.companyEmail),
      taxId: meaningful(p.companyTaxId),
      branch: meaningful(p.companyBranch),
      logo: logoFromDataUri(p.logo),
    };
  } catch (err) {
    console.error("[mail] อ่านข้อมูลบริษัทไม่สำเร็จ — ส่งเมลแบบไม่มีหัวจดหมายเต็ม", err);
    return { name: FALLBACK_COMPANY_NAME, address: null, phone: null, email: null, taxId: null, branch: null, logo: null };
  }
}

/** ประกอบเมลหนึ่งฉบับ (หัวเรื่อง + HTML + ข้อความล้วน + โลโก้แนบ) พร้อมส่งให้ sendMail */
export async function composeMail(subject: string, content: MailContent): Promise<Omit<MailMessage, "to">> {
  const brand = await loadMailBrand();
  return {
    subject: `${subject} — ${MAIL_SUBJECT_SUFFIX}`,
    text: renderMailText(content, brand),
    html: renderMailHtml(content, brand),
    inlineImages: brand.logo ? [{ cid: LOGO_CID, filename: "logo.png", content: brand.logo.png, contentType: "image/png" }] : [],
  };
}
