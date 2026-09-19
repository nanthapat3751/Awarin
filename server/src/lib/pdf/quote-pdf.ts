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
  QUOTE_TERMS_CSS,
  renderCompanySigner,
  renderQuoteTerms,
} from "./company-blocks";
import { documentChrome, LETTERHEAD_CSS, renderLetterhead } from "./letterhead";

export interface QuotePdfItem {
  /** รหัสงานของหมวดในบรรทัดนี้ ("B-02-01"); ถ้าไม่มีจะใช้เลขลำดับวิ่งแทน */
  code: string | null;
  name: string;
  quantity: string;
  unit: string;
  materialUnitPrice: string;
  materialTotal: string;
  laborUnitPrice: string;
  laborTotal: string;
  lineTotal: string;
  note: string | null;
}

export interface QuotePdfCategoryGroup {
  categoryLabel: string;
  categoryName: string;
  items: QuotePdfItem[];
  subtotal: number;
}

export interface QuotePdfData extends CustomerPartyPdfData, CompanyDocFields {
  quoteNo: string;
  revisionNo: number;
  projectNo: string;
  projectName: string;
  siteAddress: string | null;
  date: Date;
  /** ยืนราคา + เงื่อนไขที่ตรึงลงใบตอนส่ง — ใบร่างยังไม่มี (ไม่พิมพ์) */
  validUntil?: Date | null;
  terms?: string[];
  groups: QuotePdfCategoryGroup[];
  directCost: number;
  overheadProfitPct: number;
  overheadProfitAmt: number;
  // ส่วนลด: pct มีค่าเมื่อลดเป็น % (เอาไปโชว์ในวงเล็บ) — amt = 0 คือไม่มีส่วนลด แถวจะไม่ถูกพิมพ์เลย
  discountPct: number | null;
  discountAmt: number;
  discountNote: string | null;
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

function renderSummarySection(data: QuotePdfData): string {
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

  // ส่วนลดหักก่อน VAT — ฐานภาษีจึงเป็นยอดหลังหักส่วนลดแล้ว (ดู calculatePricing)
  const beforeDiscount = data.directCost + data.overheadProfitAmt;
  const beforeVat = beforeDiscount - data.discountAmt;
  // ไม่มีส่วนลด = ไม่พิมพ์แถวเลย ใบเสนอราคาที่ไม่ได้ลดจะหน้าตาเหมือนเดิมทุกประการ
  const discountRow =
    data.discountAmt > 0
      ? `<tr><td class="label">${discountLabel(data.discountPct, data.discountNote)}</td><td class="num">-${money(data.discountAmt)}</td></tr>`
      : "";

  return `
    <div class="section">
      ${renderLetterhead(data, {
        titleTh: "รายการประมาณราคา",
        titleEn: "BILL OF QUANTITY",
        meta: [
          `เลขที่ใบเสนอราคา ${data.quoteNo} (ฉบับที่ ${data.revisionNo})`,
          `วันที่ ${formatDate(data.date)}`,
        ],
      })}
      <p class="subtitle">สรุปมูลค่างานตามหมวดงาน</p>

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
          <tr><td class="label">รวมมูลค่างานก่อสร้าง</td><td class="num" style="width:120px">${money(data.directCost)}</td></tr>
          <tr><td class="label">ค่าดำเนินการและกำไร (${data.overheadProfitPct}%)</td><td class="num">${money(data.overheadProfitAmt)}</td></tr>
          ${discountRow}
          <tr><td class="label">รวมมูลค่าก่อนภาษีมูลค่าเพิ่ม</td><td class="num">${money(beforeVat)}</td></tr>
          <tr><td class="label">ภาษีมูลค่าเพิ่ม (${data.vatPct}%)</td><td class="num">${money(data.vatAmt)}</td></tr>
          <tr class="grand"><td class="label">รวมมูลค่าทั้งสิ้น</td><td class="num">${money(data.netPrice)}</td></tr>${renderWithholdingRows(data.withholding ?? null)}
        </tbody>
      </table>
      ${withholdingNote(data.withholding ?? null)}
      ${renderQuoteTerms(data.validUntil, data.terms)}

      <div class="signature">
        <div>ลงชื่อ ....................................... ผู้เสนอราคา</div>
        ${renderCompanySigner(data.companyName, data.signatory)}
      </div>
    </div>`;
}

function renderDetailSection(group: QuotePdfCategoryGroup): string {
  const rows = group.items
    .map(
      (item, idx) => `
        <tr>
          <td>${escapeHtml(item.code ?? String(idx + 1))}</td>
          <td>${escapeHtml(item.name)}</td>
          <td class="num">${item.quantity}</td>
          <td>${escapeHtml(item.unit)}</td>
          <td class="num">${money(Number(item.materialUnitPrice))}</td>
          <td class="num">${money(Number(item.materialTotal))}</td>
          <td class="num">${money(Number(item.laborUnitPrice))}</td>
          <td class="num">${money(Number(item.laborTotal))}</td>
          <td class="num" style="font-weight:700">${money(Number(item.lineTotal))}</td>
          <td>${item.note ? escapeHtml(item.note) : ""}</td>
        </tr>`,
    )
    .join("");

  return `
    <div class="section">
      <div class="header-row">
        <h1>BILL OF QUANTITY</h1>
        <span>${escapeHtml(group.categoryLabel)} ${escapeHtml(group.categoryName)}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>รหัส</th><th>รายการ</th><th class="num">จำนวน</th><th>หน่วย</th>
            <th class="num">วัสดุ/หน่วย</th><th class="num">รวมวัสดุ</th>
            <th class="num">แรง/หน่วย</th><th class="num">รวมแรง</th>
            <th class="num">ราคารวม</th><th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="subtotal-row">
            <td colspan="8" class="label num">รวมมูลค่า${escapeHtml(group.categoryName)}</td>
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
    .totals { margin-top: 4px; }
    .totals td { border: none; padding: 3px 6px; }
    .totals .label { text-align: right; }
    .totals .grand td { font-weight: 700; font-size: 12px; border-top: 1.5px solid #888; padding-top: 8px; }
    .subtotal-row td { font-weight: 700; border-top: 1.5px solid #888; border-bottom: none; }
    .signature { margin-top: 50px; font-size: 10px; }
    ${QUOTE_TERMS_CSS}
  `;
}

/**
 * HTML ที่จะถูกพิมพ์เป็น PDF — แยกออกมาเพื่อให้เทสต์ตรวจ "สิ่งที่พิมพ์จริง" ได้โดยไม่ต้องเปิด
 * เบราว์เซอร์ (ตัวเลขบนเอกสารที่ส่งลูกค้าผิดคือความเสียหายที่ย้อนกลับไม่ได้)
 */
export function buildQuotePdfHtml(data: QuotePdfData): string {
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

export async function renderQuotePdf(data: QuotePdfData): Promise<Uint8Array> {
  return renderHtmlToPdf(
    buildQuotePdfHtml(data),
    documentChrome({
      companyName: data.companyName,
      docLabel: `BOQ เลขที่ ${data.quoteNo}`,
      logoSmall: data.logoSmall,
    }),
    // ชื่อในไฟล์ตั้งให้ตรงกับชื่อแท็บที่หน้าดูเอกสารของ staff-app ใช้ (lib/document-pdf.ts)
    // เอกสารเดียวกันจะได้ไม่ถูกเรียกคนละชื่อในสองที่
    {
      title: `BOQ ${data.quoteNo} · ${data.projectName}`,
      author: data.companyName,
      subject: `โครงการ ${data.projectNo} ${data.projectName}`,
    },
  );
}
