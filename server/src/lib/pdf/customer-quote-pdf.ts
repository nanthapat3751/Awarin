import type { PaymentAccountDto } from "@systemboq/shared-types";

import { renderHtmlToPdf } from "./browser";
import { sarabunFontFaceCss } from "./fonts";
import type { Withholding } from "../billing-party";
import {
  BILLING_NOTE_CSS,
  renderCustomerParty,
  renderWithholdingRows,
  withholdingNote,
  type CustomerPartyPdfData,
} from "./billing-block";
import {
  type CompanyDocFields,
  PAYMENT_CSS,
  QUOTE_TERMS_CSS,
  renderCompanySigner,
  renderPaymentAccount,
  renderQuoteTerms,
} from "./company-blocks";
import { documentChrome, LETTERHEAD_CSS, renderLetterhead } from "./letterhead";

export interface CustomerQuotePdfItem {
  /** รหัสงานของหมวดในบรรทัดนี้ ("B-02-01"); ถ้าไม่มีจะใช้เลขลำดับวิ่งแทน */
  code: string | null;
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
  note: string | null;
}

export interface CustomerQuotePdfCategoryGroup {
  categoryLabel: string;
  categoryName: string;
  items: CustomerQuotePdfItem[];
  subtotal: number;
}

// BR-09: เอกสารนี้คือใบเสนอราคาฉบับของลูกค้า — ห้ามมีรายละเอียดต้นทุนค่าวัสดุ/ค่าแรง หรือ
// อัตรา overhead/กำไรเด็ดขาด ให้มีแค่ราคาขายต่อรายการที่บวก markup แล้ว และสรุปยอดรวม/VAT/
// ยอดสุทธิมาตรฐานเท่านั้น ดู myQuotes.service.ts
export interface CustomerQuotePdfData extends CustomerPartyPdfData, CompanyDocFields {
  /** บัญชีรับเงินของบริษัท — null/ไม่ส่ง = ยังไม่ได้ตั้ง ไม่พิมพ์กล่องการชำระเงิน */
  paymentAccount?: PaymentAccountDto | null;
  quoteNo: string;
  revisionNo: number;
  projectNo: string;
  projectName: string;
  siteAddress: string | null;
  date: Date;
  /** วันสุดท้ายที่ยืนราคา (คอลัมน์ DATE = เที่ยงคืน UTC) · null/ไม่ส่ง = ไม่พิมพ์ */
  validUntil?: Date | null;
  /** เงื่อนไขท้ายใบ ทีละข้อ (ตัดเลขข้อที่พิมพ์มาเองออกแล้ว — ดู termLines) */
  terms?: string[];
  groups: CustomerQuotePdfCategoryGroup[];
  // ยอดรวมของทุกหมวดก่อนหักส่วนลด = ผลบวกของราคาที่ลูกค้าเห็นในตารางด้านบน (ต้องตรงกันเป๊ะ)
  beforeDiscount: number;
  discountPct: number | null;
  discountAmt: number;
  discountNote: string | null;
  subtotalBeforeVat: number;
  vatPct: number;
  vatAmt: number;
  netPrice: number;
  /** null = ไม่ต้องหัก (ผู้ว่าจ้างเป็นบุคคลธรรมดา) — ดู lib/billing-party.ts */
  withholding?: Withholding | null;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** ป้ายแถวส่วนลด: "ส่วนลด (5%) — หมายเหตุ" (หมายเหตุ escape แล้ว) */
function discountLabel(pct: number | null, note: string | null): string {
  const pctPart = pct == null ? "" : ` (${pct}%)`;
  const notePart = note ? ` <span style="color:#555">— ${escapeHtml(note)}</span>` : "";
  return `ส่วนลด${pctPart}${notePart}`;
}

function renderSummarySection(data: CustomerQuotePdfData): string {
  const rows = data.groups
    .map(
      (group) => `
        <tr>
          <td>${escapeHtml(group.categoryLabel)}</td>
          <td>${escapeHtml(group.categoryName)}</td>
          <td class="num">${money(group.subtotal)}</td>
        </tr>`,
    )
    .join("");

  // ไม่มีส่วนลด = ไม่พิมพ์อะไรเพิ่ม ใบที่ไม่ได้ลดหน้าตาเหมือนเดิมทุกประการ
  // มีส่วนลด = ต้องโชว์ยอดก่อนลดด้วย ไม่งั้นลูกค้าบวกตัวเลขในตารางแล้วไม่ตรงกับยอดก่อน VAT
  const discountRows =
    data.discountAmt > 0
      ? `<tr><td class="label">รวมมูลค่างาน</td><td class="num" style="width:120px">${money(
          data.beforeDiscount,
        )}</td></tr>
          <tr><td class="label">${discountLabel(data.discountPct, data.discountNote)}</td><td class="num">-${money(data.discountAmt)}</td></tr>`
      : "";

  return `
    <div class="section">
      ${renderLetterhead(data, {
        titleTh: "ใบเสนอราคา",
        titleEn: "QUOTATION",
        meta: [
          `เลขที่ ${data.quoteNo} (ฉบับที่ ${data.revisionNo})`,
          `วันที่ ${formatDate(data.date)}`,
        ],
      })}

      <div class="info-grid">
        <div>
          <div>โครงการ: ${escapeHtml(data.projectName)}</div>
          <div>เลขที่โครงการ: ${escapeHtml(data.projectNo)}</div>
          ${renderCustomerParty(data, "ลูกค้า")}
          ${data.siteAddress ? `<div>สถานที่ก่อสร้าง: ${escapeHtml(data.siteAddress)}</div>` : ""}
        </div>
      </div>

      <table>
        <thead>
          <tr><th>ลำดับ</th><th>หมวดงาน</th><th class="num">ราคารวม</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <table class="totals">
        <tbody>
          ${discountRows}
          <tr><td class="label">รวมมูลค่าก่อนภาษีมูลค่าเพิ่ม</td><td class="num" style="width:120px">${money(data.subtotalBeforeVat)}</td></tr>
          <tr><td class="label">ภาษีมูลค่าเพิ่ม (${data.vatPct}%)</td><td class="num">${money(data.vatAmt)}</td></tr>
          <tr class="grand"><td class="label">รวมมูลค่าทั้งสิ้น</td><td class="num">${money(data.netPrice)}</td></tr>${renderWithholdingRows(data.withholding ?? null)}
        </tbody>
      </table>
      ${withholdingNote(data.withholding ?? null)}
      ${renderQuoteTerms(data.validUntil, data.terms)}
      ${renderPaymentAccount(data.paymentAccount)}

      <div class="signature">
        <div>ลงชื่อ ....................................... ผู้เสนอราคา</div>
        ${renderCompanySigner(data.companyName, data.signatory)}
      </div>
    </div>`;
}

function renderDetailSection(group: CustomerQuotePdfCategoryGroup): string {
  const rows = group.items
    .map(
      (item, idx) => `
        <tr>
          <td>${escapeHtml(item.code ?? String(idx + 1))}</td>
          <td>${escapeHtml(item.name)}</td>
          <td class="num">${item.quantity}</td>
          <td>${escapeHtml(item.unit)}</td>
          <td class="num">${money(Number(item.unitPrice))}</td>
          <td class="num" style="font-weight:700">${money(Number(item.lineTotal))}</td>
          <td>${item.note ? escapeHtml(item.note) : ""}</td>
        </tr>`,
    )
    .join("");

  return `
    <div class="section">
      <div class="header-row">
        <h1>QUOTATION</h1>
        <span>${escapeHtml(group.categoryLabel)} ${escapeHtml(group.categoryName)}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>รหัส</th><th>รายการ</th><th class="num">จำนวน</th><th>หน่วย</th>
            <th class="num">ราคาต่อหน่วย</th><th class="num">ราคารวม</th><th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="subtotal-row">
            <td colspan="5" class="label num">รวมมูลค่า${escapeHtml(group.categoryName)}</td>
            <td class="num">${money(group.subtotal)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

function baseStyles(): string {
  return `
    ${sarabunFontFaceCss()}
    ${LETTERHEAD_CSS}
    * { font-family: "Sarabun", sans-serif; box-sizing: border-box; }
    body { margin: 0; font-size: 11px; color: #1a1a1a; }
    /* ระยะขอบกำหนดที่ page.pdf() แทน เพราะต้องเผื่อที่ให้แถบหัว/ท้ายทุกหน้า */
    @page { size: A4; }
    .section { page-break-before: always; }
    .section:first-child { page-break-before: auto; }
    h1 { font-size: 16px; font-weight: 700; margin: 0; }
    .subtitle { font-size: 11px; font-weight: 700; margin: 6px 0 14px; }
    .header-row { display: flex; justify-content: space-between; align-items: baseline; }
    .info-grid { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 10px; }
    .info-grid > div { line-height: 1.7; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
    th, td { padding: 4px 6px; text-align: left; border-bottom: 1px solid #ddd; vertical-align: top; }
    th { font-weight: 700; border-bottom: 1.5px solid #888; }
    .num { text-align: right; }
    ${BILLING_NOTE_CSS}
    ${PAYMENT_CSS}
    ${QUOTE_TERMS_CSS}
    .totals { margin-top: 4px; }
    .totals td { border: none; padding: 3px 6px; }
    .totals .label { text-align: right; }
    .totals .grand td { font-weight: 700; font-size: 12px; border-top: 1.5px solid #888; padding-top: 8px; }
    .subtotal-row td { font-weight: 700; border-top: 1.5px solid #888; border-bottom: none; }
    .signature { margin-top: 50px; font-size: 10px; }
  `;
}

/** ดู buildQuotePdfHtml — เหตุผลเดียวกัน แต่ใบนี้คือใบที่ลูกค้าได้รับจริง */
export function buildCustomerQuotePdfHtml(data: CustomerQuotePdfData): string {
  const detailSections = data.groups
    .filter((g) => g.items.length > 0)
    .map((g) => renderDetailSection(g))
    .join("");

  return `
    <!doctype html>
    <html lang="th">
      <head>
        <meta charset="utf-8" />
        <style>${baseStyles()}</style>
      </head>
      <body>
        ${renderSummarySection(data)}
        ${detailSections}
      </body>
    </html>`;
}

export async function renderCustomerQuotePdf(data: CustomerQuotePdfData): Promise<Uint8Array> {
  return renderHtmlToPdf(
    buildCustomerQuotePdfHtml(data),
    documentChrome({
      companyName: data.companyName,
      docLabel: `ใบเสนอราคาเลขที่ ${data.quoteNo}`,
      logoSmall: data.logoSmall,
    }),
    {
      title: `ใบเสนอราคา ${data.quoteNo} · ${data.projectName}`,
      author: data.companyName,
      subject: `โครงการ ${data.projectNo} ${data.projectName}`,
    },
  );
}
