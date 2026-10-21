import fs from "node:fs";
import path from "node:path";

import type { PdfChrome } from "./browser";
import { sarabunFontFaceCss } from "./fonts";

// อ้างอิงจาก process.cwd() (โฟลเดอร์ราก package server ทั้งตอนรันด้วย `tsx` dev และ
// `node dist/server.js`) เหมือนที่ fonts.ts ทำ เพราะ src/assets เป็น static asset
const LOGO_PATH = path.resolve(process.cwd(), "src/assets/company-logo.png");
// โลโก้อีกไฟล์ที่เล็กกว่ามาก สำหรับแถบหัวที่ถูกวาดซ้ำทุกหน้า — Chrome อาจฝังรูปซ้ำหน้าละครั้ง
// ถ้าใช้ไฟล์ 31KB เอกสาร 7 หน้าจะโตขึ้นเป็นหลักร้อย KB โดยไม่ได้อะไรเพิ่ม (แสดงแค่สูง 11px)
const LOGO_SMALL_PATH = path.resolve(process.cwd(), "src/assets/company-logo-small.png");

let cachedLogo: string | null | undefined;
let cachedLogoSmall: string | null | undefined;

/**
 * โลโก้ **ตั้งต้น** ของบริษัทเป็น data URI พร้อมฝังใน HTML ของ PDF
 * (บริษัทอัปโหลดโลโก้ของตัวเองได้จากหน้าตั้งค่า — ดู lib/company-logo.ts ซึ่งจะกลับมาใช้ไฟล์นี้
 * เมื่อยังไม่เคยอัปโหลด หรือกด "กลับไปใช้โลโก้เดิม")
 *
 * ต้องเป็น data URI เท่านั้น — PDF ถูกสร้างด้วย `page.setContent(html)` ซึ่งไม่มี base URL
 * ให้อ้างอิง ฉะนั้น <img src="/logo.png"> จะไม่ขึ้น. ไฟล์ถูกย่อไว้ที่ 240px (~31KB) แล้ว
 * เพราะต้นฉบับ 307KB จะทำให้ PDF ทุกใบโตขึ้นเกิน 400KB โดยไม่จำเป็น
 *
 * อ่านครั้งเดียวแล้วแคชไว้ตลอดอายุ process; ถ้าไม่มีไฟล์ให้คืน null แล้วหัวเอกสารจะพิมพ์
 * แบบไม่มีโลโก้ (ออกเอกสารได้ตามปกติ ไม่พังทั้งคำขอ)
 */
export function companyLogoDataUri(): string | null {
  if (cachedLogo === undefined) {
    try {
      cachedLogo = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString("base64")}`;
    } catch {
      cachedLogo = null;
    }
  }
  return cachedLogo;
}

/** โลโก้ขนาดเล็ก (64px) สำหรับแถบหัวที่วาดซ้ำทุกหน้า */
export function companyLogoSmallDataUri(): string | null {
  if (cachedLogoSmall === undefined) {
    try {
      cachedLogoSmall = `data:image/png;base64,${fs.readFileSync(LOGO_SMALL_PATH).toString("base64")}`;
    } catch {
      cachedLogoSmall = null;
    }
  }
  return cachedLogoSmall;
}

export interface CompanyLetterheadData {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  /** เลขประจำตัวผู้เสียภาษี — ไม่บังคับ ถ้าไม่ได้ตั้งค่าไว้จะไม่พิมพ์บรรทัดนี้ */
  companyTaxId?: string | null;
  /** "สำนักงานใหญ่" / "สาขาที่ 00001" — ใบกำกับภาษีต้องระบุสถานประกอบการของผู้ขาย */
  companyBranch?: string | null;
  companyEmail?: string | null;
  /** data URI ของโลโก้ที่บริษัทอัปโหลดเอง — ไม่ส่ง = ไฟล์ตั้งต้น · null = ไม่มีโลโก้ */
  logo?: string | null;
}

/** โทรกับอีเมลอยู่บรรทัดเดียวกัน — หัวจดหมายสูงขึ้นอีกบรรทัดจะไปดันเนื้อหาทุกหน้าที่ตามมา */
function contactLine(phone: string, email: string | null | undefined): string {
  const parts = [
    phone ? `โทร. ${escapeHtml(phone)}` : null,
    email ? `อีเมล ${escapeHtml(email)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? `<div>${parts.join(" · ")}</div>` : "";
}

export interface DocumentTitleData {
  /** ชื่อเอกสารภาษาไทย เช่น "ใบเสนอราคา" */
  titleTh: string;
  /** ชื่อเอกสารภาษาอังกฤษ เช่น "QUOTATION" */
  titleEn: string;
  /** บรรทัดย่อยฝั่งขวา เช่น เลขที่เอกสาร/วันที่ */
  meta: string[];
}

/** "เลขประจำตัวผู้เสียภาษี … · สาขา" — ไม่มีเลขผู้เสียภาษี = ไม่พิมพ์บรรทัดนี้ */
function taxIdLine(taxId: string | null | undefined, branch: string | null | undefined): string {
  if (!taxId) return "";
  const branchText = branch ? ` · ${escapeHtml(branch)}` : "";
  return `<div>เลขประจำตัวผู้เสียภาษี ${escapeHtml(taxId)}${branchText}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * หัวจดหมายของบริษัท: โลโก้ + ชื่อ + ที่อยู่ + โทร/อีเมล + เลขผู้เสียภาษี ทางซ้าย,
 * ชื่อ/เลขที่/วันที่ของเอกสารทางขวา
 *
 * ใช้ร่วมกันทั้งใบเสนอราคา ใบ BOQ และสัญญา เพื่อให้เอกสารทุกใบที่ออกจากระบบหน้าตาเหมือนกัน
 * (ก่อนหน้านี้ทั้งสามใบพิมพ์ข้อมูลบริษัทกันคนละแบบ และใบเสนอราคาไม่พิมพ์ที่อยู่เลยทั้งที่
 * รับค่ามาแล้ว)
 */
export function renderLetterhead(company: CompanyLetterheadData, doc: DocumentTitleData): string {
  const logo = company.logo !== undefined ? company.logo : companyLogoDataUri();
  const metaRows = doc.meta.map((line) => `<div>${escapeHtml(line)}</div>`).join("");

  return `
    <div class="letterhead">
      <div class="letterhead-company">
        ${logo ? `<img class="letterhead-logo" src="${logo}" alt="" />` : ""}
        <div class="letterhead-lines">
          <div class="letterhead-name">${escapeHtml(company.companyName)}</div>
          ${company.companyAddress ? `<div>${escapeHtml(company.companyAddress)}</div>` : ""}
          ${contactLine(company.companyPhone, company.companyEmail)}
          ${taxIdLine(company.companyTaxId, company.companyBranch)}
        </div>
      </div>
      <div class="letterhead-doc">
        <div class="letterhead-title">${escapeHtml(doc.titleTh)}</div>
        <div class="letterhead-title-en">${escapeHtml(doc.titleEn)}</div>
        ${metaRows}
      </div>
    </div>
  `;
}

/** CSS ของหัวจดหมาย — แทรกเข้าไปใน <style> ของเอกสารแต่ละใบ */
export const LETTERHEAD_CSS = `
  .letterhead {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding-bottom: 10px;
    margin-bottom: 14px;
    border-bottom: 1.5px solid #888;
  }
  .letterhead-company { display: flex; align-items: flex-start; gap: 10px; }
  /* กรอบ 96×52 แทนความกว้างตายตัว — บริษัทอัปโหลดโลโก้เองได้แล้ว โลโก้สี่เหลี่ยมจัตุรัสที่กว้าง 96px
     จะสูง 96px ดันหัวจดหมายทุกหน้าลงไปเกือบนิ้ว; โลโก้ตั้งต้น (240×128) ยังออกมา 96×51 เท่าเดิม */
  .letterhead-logo { width: auto; height: auto; max-width: 96px; max-height: 52px; }
  .letterhead-lines { font-size: 9.5px; line-height: 1.6; }
  .letterhead-name { font-size: 12px; font-weight: 700; }
  .letterhead-doc { text-align: right; font-size: 9.5px; line-height: 1.6; white-space: nowrap; }
  .letterhead-title { font-size: 15px; font-weight: 700; }
  .letterhead-title-en { font-size: 9px; letter-spacing: 0.08em; margin-bottom: 4px; }
`;


export interface RunningHeadData {
  companyName: string;
  /** ป้ายบอกว่าเป็นเอกสารอะไรเลขที่อะไร เช่น "ใบเสนอราคาเลขที่ QT-2026-0342" */
  docLabel: string;
  /** โลโก้ไฟล์เล็กที่บริษัทอัปโหลดเอง — ไม่ส่ง = ไฟล์ตั้งต้น · null = ไม่มีโลโก้ */
  logoSmall?: string | null;
  /**
   * ไม่พิมพ์ "หน้า N/M" — ใบแจ้งหนี้/ใบเสร็จฉบับพิมพ์ของบริษัทเป็นต้นฉบับ+สำเนาในไฟล์เดียว แผ่นต้นฉบับที่ฉีก
   * ให้ลูกค้าจะเขียนว่า "หน้า 1/2" ชวนให้คิดว่าได้เอกสารไม่ครบ
   */
  hidePageNumbers?: boolean;
}

const RUNNING_TEXT_STYLE = "font-family:'Sarabun',sans-serif;font-size:7pt;color:#777;";

/**
 * ช่องเซ็นกำกับต้องเข้มและใหญ่กว่าแถบข้อมูล — มันคือ "ของที่คนต้องเขียนลงไปจริง"
 * ไม่ใช่ข้อมูลอ้างอิงอย่างเลขหน้า/เลขที่เอกสาร ของเดิมใช้ 7pt สีเทาเท่ากันทั้งสองแถว
 * เลยอ่านเป็นก้อนเดียวและช่องเซ็นจมหายไปกับข้อมูลประกอบ
 */
const INITIALS_TEXT_STYLE = "font-family:'Sarabun',sans-serif;font-size:8pt;color:#333;";

/**
 * แถบบาง ๆ ที่ Chrome วาดซ้ำ **ทุกหน้า** ที่ท้ายกระดาษ:
 * โลโก้เล็ก + ชื่อบริษัท | เอกสารเลขที่อะไร | หน้า x/y
 *
 * ทำไมต้องมี: ใบเสนอราคายาว 7 หน้าและไม่เคยมีเลขหน้าเลย ถ้ากระดาษหล่นหรือส่งต่อไม่ครบ
 * จะไม่มีใครรู้ว่าขาดหน้าไหน และหน้าที่หลุดมาเดี่ยว ๆ ก็บอกไม่ได้ว่าเป็นของใบไหน
 * (บางหน้าเป็นตารางตัวเลขล้วนไม่มีหัวข้ออะไรเลย เพราะหมวดงานยาวเกินหนึ่งหน้า)
 *
 * ทำไมอยู่ "ท้ายหน้า" ไม่ใช่หัวหน้า: Chrome ซ่อนแถบเฉพาะหน้าแรกไม่ได้ (ไม่มี CSS ตามเลขหน้า)
 * ถ้าวางไว้ด้านบน หน้า 1 จะมีโลโก้ซ้ำสองที่ห่างกันไม่ถึงนิ้ว — ย้ายลงล่างแล้วโลโก้ยังอยู่ครบ
 * ทุกหน้าเหมือนเดิม แต่ไม่ชนกับหัวจดหมาย
 *
 * ต้องฝัง @font-face ซ้ำในเทมเพลต เพราะแถบนี้ถูกเรนเดอร์คนละเอกสารกับตัวหน้า จึงไม่ได้
 * รับฟอนต์ไทยจาก <style> ของหน้าเอกสาร — ถ้าไม่ฝัง ตัวไทยจะกลายเป็นฟอนต์สำรองของระบบ
 * และต้องกำหนด font-size เองด้วย (ค่าเริ่มต้นของ Chrome คือ 0 = มองไม่เห็นทั้งแถบ)
 */
export function documentChrome(
  data: RunningHeadData,
  sideMargin = "15mm",
  /**
   * เพิ่มช่องเซ็นกำกับ "ทุกหน้า" เหนือแถบท้ายกระดาษ — สัญญาไทยเซ็นกำกับรายหน้าเพื่อกันการ
   * สับเปลี่ยนแผ่นระหว่างที่เอกสารอยู่กับอีกฝ่าย. ต้องทำในเทมเพลตท้ายกระดาษของ Chrome เท่านั้น
   * เพราะ CSS ในตัวเอกสารไม่มีทางรู้ว่าหน้าจบตรงไหน
   */
  initials?: { left: string; right: string },
): PdfChrome {
  const logo = data.logoSmall !== undefined ? data.logoSmall : companyLogoSmallDataUri();

  // ต้องส่งเทมเพลตเปล่ามาด้วย ไม่งั้น Chrome ใส่หัวกระดาษมาตรฐานของตัวเอง (วันที่ + ชื่อไฟล์) ให้
  const headerTemplate = "<div></div>";

  const initialsRow = initials
    ? `<div style="display:flex;justify-content:space-between;${INITIALS_TEXT_STYLE}padding-bottom:4px;margin-bottom:4px;border-bottom:1px solid #e0e0e0;">
         <span>${escapeHtml(initials.left)}</span>
         <span>${escapeHtml(initials.right)}</span>
       </div>`
    : "";

  /**
   * **ต้องมีองค์ประกอบรากเดียว** — Chrome วางเทมเพลตท้ายกระดาษไว้ในกล่องที่เป็น flex
   * ถ้าส่งสอง <div> ระดับบนสุดไป มันจะเอาไป **วางเรียงข้างกัน** ไม่ใช่ซ้อนกัน
   * แต่ละอันจึงเหลือกว้างครึ่งเดียว แล้วข้อความข้างในตกบรรทัดกลางคำ (เคยเกิดจริงกับสัญญา
   * ที่ออกไปแล้ว เพราะเป็นเอกสารเดียวที่ส่ง initials มา จึงมีสองแถว — ใบเสนอราคามีแถวเดียวเลยไม่เคยพัง)
   * ห้ามแยก initialsRow ออกมาเป็นพี่น้องของแถบข้อมูลเด็ดขาด
   */
  const footerTemplate = `<style>${sarabunFontFaceCss()}</style>
    <div style="width:100%;box-sizing:border-box;padding:0 ${sideMargin};${RUNNING_TEXT_STYLE}">
      ${initialsRow}
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="display:flex;align-items:center;gap:5px;">
          ${logo ? `<img src="${logo}" style="height:13px;width:auto;max-width:60px;object-fit:contain;" />` : ""}
          <span>${escapeHtml(data.companyName)}</span>
        </span>
        <span>${escapeHtml(data.docLabel)}</span>
        ${data.hidePageNumbers ? "<span></span>" : `<span>หน้า <span class="pageNumber"></span>/<span class="totalPages"></span></span>`}
      </div>
    </div>`;

  return {
    headerTemplate,
    footerTemplate,
    // เผื่อที่ด้านล่างให้แถบโดยเฉพาะ ไม่งั้น Chrome จะตัดแถบทิ้ง; ด้านบนกลับไปเท่าเดิมได้
    // มีช่องเซ็นกำกับต้องเผื่อเพิ่มอีกแถว ไม่งั้นแถบท้ายจะทับเนื้อหา
    margin: {
      top: "15mm",
      bottom: initials ? "26mm" : "18mm",
      left: sideMargin,
      right: sideMargin,
    },
  };
}
