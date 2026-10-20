import type { ChangeOrderLineDto, ChangeOrderStatus } from "@systemboq/shared-types";

import { bahtText } from "../baht-text";
import { money, renderCustomerParty, type CustomerPartyPdfData } from "./billing-block";
import { renderHtmlToPdf } from "./browser";
import type { CompanyDocFields } from "./company-blocks";
import { sarabunFontFaceCss } from "./fonts";
import { documentChrome, LETTERHEAD_CSS, renderLetterhead } from "./letterhead";

/**
 * ใบแจ้งงานเพิ่ม-ลด (Variation Order) — เอกสารแนบท้ายสัญญาที่ลงนามแล้ว
 *
 * ตัวเลขทุกตัวมาจากแถว ChangeOrder ที่ตรึงไว้ (ไม่คิดใหม่ตอนพิมพ์) · ราคาเป็นราคาขายแบบเดียวกับ
 * ใบเสนอราคาที่ลูกค้าถือ จึงเทียบกับใบเดิมได้ทีละบรรทัด · ไม่มีราคาทุน/กำไรหลุดออกไป
 */
export interface ChangeOrderPdfData extends CompanyDocFields, CustomerPartyPdfData {
  docNo: string;
  seq: number;
  status: ChangeOrderStatus;
  date: Date;
  contractNo: string;
  contractSignedAt: Date | null;
  projectNo: string;
  projectName: string;
  title: string;
  note: string | null;
  extensionDays: number | null;
  lines: ChangeOrderLineDto[];
  addAmount: number;
  deductAmount: number;
  adjustAmount: number;
  netBeforeVat: number;
  vatAmount: number;
  totalAmount: number;
  /** มูลค่าสัญญาก่อน → หลังใบนี้ (null = สัญญาเก่าไม่มียอดตรึง) */
  amountBefore: number | null;
  amountAfter: number | null;
  respondedAt: Date | null;
  respondedVia: "PORTAL" | "PAPER" | null;
  /** ผู้ลงนามฝั่งบริษัทที่ตรึงไว้กับสัญญา */
  contractorName: string | null;
  contractorTitle: string | null;
  installmentChanges: { seq: number; milestone: string; from: string | null; to: string }[] | null;
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const bangkokParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function thaiDate(d: Date): string {
  const parts = Object.fromEntries(bangkokParts.formatToParts(d).map((p) => [p.type, p.value]));
  return `${Number(parts.day)} ${THAI_MONTHS[Number(parts.month) - 1]} ${Number(parts.year) + 543}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const qty = (v: string | null) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 3 }));
const signed = (n: number) => (n > 0 ? `+${money(n)}` : n < 0 ? `−${money(-n)}` : money(0));

const KIND_LABEL: Record<ChangeOrderLineDto["kind"], string> = { added: "เพิ่ม", removed: "ตัดออก", changed: "แก้" };

function side(q: string | null, price: string | null, total: string): string {
  if (q == null) return `<td class="num muted" colspan="2">—</td>`;
  return `<td class="num">${qty(q)} × ${money(Number(price))}</td><td class="num">${money(Number(total))}</td>`;
}

function renderLines(lines: ChangeOrderLineDto[]): string {
  const rows = lines
    .map(
      (l, i) => `
        <tr>
          <td class="c">${i + 1}</td>
          <td>
            <span class="kind kind-${l.kind}">${KIND_LABEL[l.kind]}</span>
            ${l.categoryCode ? `<span class="code">${escapeHtml(l.categoryCode)}</span>` : ""}
            ${escapeHtml(l.name)}
          </td>
          <td class="c">${escapeHtml(l.unit)}</td>
          ${side(l.beforeQty, l.beforeUnitPrice, l.beforeTotal)}
          ${side(l.afterQty, l.afterUnitPrice, l.afterTotal)}
          <td class="num strong ${Number(l.delta) < 0 ? "minus" : ""}">${signed(Number(l.delta))}</td>
        </tr>`,
    )
    .join("");
  return `
    <table class="items">
      <thead>
        <tr>
          <th class="c" rowspan="2" style="width:30px">ลำดับ</th>
          <th rowspan="2">รายการ</th>
          <th class="c" rowspan="2" style="width:44px">หน่วย</th>
          <th class="c" colspan="2">ตามสัญญาเดิม</th>
          <th class="c" colspan="2">ใหม่</th>
          <th class="num" rowspan="2" style="width:92px">เพิ่ม / ลด</th>
        </tr>
        <tr>
          <th class="num">จำนวน × ราคา</th><th class="num">เป็นเงิน</th>
          <th class="num">จำนวน × ราคา</th><th class="num">เป็นเงิน</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function row(label: string, value: string, cls = ""): string {
  return `<tr class="${cls}"><td class="label">${label}</td><td class="num">${value}</td></tr>`;
}

function renderTotals(d: ChangeOrderPdfData): string {
  const rows = [row("รวมงานเพิ่ม", money(d.addAmount)), row("รวมงานลด", d.deductAmount > 0 ? `−${money(d.deductAmount)}` : money(0))];
  if (d.adjustAmount !== 0) rows.push(row("ปรับส่วนลด / ปัดเศษ", signed(d.adjustAmount)));
  if (d.vatAmount !== 0) {
    rows.push(row("เพิ่ม/ลดสุทธิก่อนภาษีมูลค่าเพิ่ม", signed(d.netBeforeVat)), row("ภาษีมูลค่าเพิ่ม", signed(d.vatAmount)));
  }
  const direction = d.totalAmount > 0 ? "เพิ่มขึ้น" : d.totalAmount < 0 ? "ลดลง" : "ไม่เปลี่ยน";
  rows.push(row(`มูลค่างาน${direction}สุทธิ`, signed(d.totalAmount), "grand"));
  if (d.amountBefore != null && d.amountAfter != null) {
    rows.push(row("มูลค่าสัญญาก่อนใบนี้", money(d.amountBefore), "sub"), row("มูลค่าสัญญาหลังใบนี้", money(d.amountAfter), "net"));
  }
  return `
    <table class="totals">${rows.join("")}</table>
    <div class="words">(${d.totalAmount === 0 ? "ศูนย์บาทถ้วน" : `${direction} ${bahtText(Math.abs(d.totalAmount))}`})</div>`;
}

function renderTerms(d: ChangeOrderPdfData): string {
  const items = [
    d.extensionDays && d.extensionDays > 0
      ? `ขยายระยะเวลาก่อสร้างออกไปอีก ${d.extensionDays} วัน นับต่อจากกำหนดเดิมตามสัญญา`
      : "ระยะเวลาก่อสร้างคงเดิมตามสัญญา",
    d.totalAmount > 0
      ? "ค่างานเพิ่มเรียกเก็บเป็นงวดใหม่ต่อท้ายงวดตามสัญญา เมื่อทำงานตามใบนี้แล้วเสร็จ"
      : d.totalAmount < 0
        ? "ค่างานที่ลดลงหักจากงวดท้ายที่ยังไม่ได้ชำระ"
        : null,
    `ข้อความอื่นในสัญญาเลขที่ ${escapeHtml(d.contractNo)} คงเดิมทุกประการ`,
  ].filter(Boolean);
  const applied =
    d.installmentChanges?.length && d.status === "APPROVED"
      ? `<div class="applied">ปรับงวดเงินแล้ว: ${d.installmentChanges
          .map((c) =>
            c.from == null
              ? `งวดที่ ${c.seq} (ใหม่) ${money(Number(c.to))} บาท`
              : `งวดที่ ${c.seq} ${money(Number(c.from))} → ${money(Number(c.to))} บาท`,
          )
          .join(" · ")}</div>`
      : "";
  return `<ol class="terms">${items.map((t) => `<li>${t}</li>`).join("")}</ol>${applied}`;
}

function renderSignatures(d: ChangeOrderPdfData): string {
  const approvedOnline = d.status === "APPROVED" && d.respondedVia === "PORTAL" && d.respondedAt;
  const owner = approvedOnline
    ? `<div class="sign-line online">อนุมัติผ่านระบบออนไลน์</div>
       <div class="sign-who"><div>( ${escapeHtml(d.customerName ?? "ผู้ว่าจ้าง")} )</div><div class="sign-date">เมื่อ ${thaiDate(d.respondedAt!)}</div></div>`
    : `<div class="sign-line">ลงชื่อ ....................................... ผู้ว่าจ้าง</div>
       <div class="sign-who"><div>( ${escapeHtml(d.customerName ?? ".......................................")} )</div><div class="sign-date">วันที่ ........./........./.........</div></div>`;
  const contractor = `<div class="sign-line">ลงชื่อ ....................................... ผู้รับจ้าง</div>
       <div class="sign-who"><div>( ${escapeHtml(d.contractorName ?? d.companyName)} )</div>${
         d.contractorTitle ? `<div>${escapeHtml(d.contractorTitle)}</div>` : ""
       }<div class="sign-date">วันที่ ........./........./.........</div></div>`;
  return `<div class="signers"><div class="sign-col">${owner}</div><div class="sign-col">${contractor}</div></div>`;
}

function renderStatusMarks(d: ChangeOrderPdfData): string {
  if (d.status === "DRAFT") return `<div class="watermark" aria-hidden="true">ร่าง</div>`;
  if (d.status === "CANCELLED") {
    return `<div class="watermark red" aria-hidden="true">ยกเลิก</div><div class="banner">ใบนี้ถูกยกเลิกแล้ว · ใช้อ้างอิงไม่ได้</div>`;
  }
  if (d.status === "REJECTED") {
    return `<div class="banner">ผู้ว่าจ้างไม่อนุมัติใบนี้${d.respondedAt ? ` เมื่อ ${thaiDate(d.respondedAt)}` : ""} · ไม่มีผลกับสัญญา</div>`;
  }
  return "";
}

export function buildChangeOrderHtml(d: ChangeOrderPdfData): string {
  const meta = [
    `เลขที่ ${d.docNo}`,
    `วันที่ ${thaiDate(d.date)}`,
    `อ้างอิงสัญญา ${d.contractNo}`,
    `ครั้งที่ ${d.seq}`,
  ];
  return `
    <!doctype html>
    <html lang="th">
      <head>
        <meta charset="utf-8" />
        <style>
          ${sarabunFontFaceCss()}
          ${LETTERHEAD_CSS}
          * { font-family: "Sarabun", sans-serif; box-sizing: border-box; }
          body { margin: 0; font-size: 12px; color: #1a1a1a; }
          @page { size: A4; }
          .party { line-height: 1.8; }
          .subject { margin-top: 10px; line-height: 1.7; }
          .subject b { font-weight: 700; }
          .note { white-space: pre-line; color: #333; }
          table.items { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
          table.items th { font-weight: 700; border-bottom: 1.5px solid #888; padding: 4px; background: #f3f4f8; }
          table.items td { padding: 5px 4px; border-bottom: 1px solid #ddd; vertical-align: top; }
          table.items tr { page-break-inside: avoid; }
          .c { text-align: center; }
          .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
          .muted { color: #999; }
          .strong { font-weight: 700; }
          .minus { color: #a32020; }
          .code { color: #555; margin-right: 4px; }
          .kind { display: inline-block; min-width: 34px; text-align: center; border-radius: 3px; padding: 0 4px; margin-right: 4px; font-size: 10px; font-weight: 700; }
          .kind-added { background: #e7f0ff; color: #000099; }
          .kind-removed { background: #fdeaea; color: #a32020; }
          .kind-changed { background: #f1f1f1; color: #444; }
          table.totals { margin: 10px 0 0 auto; min-width: 58%; border-collapse: collapse; }
          table.totals td { padding: 3px 4px; }
          table.totals .num { width: 140px; }
          table.totals .grand td { font-weight: 700; border-top: 1px solid #888; padding-top: 6px; }
          table.totals .sub td { color: #555; padding-top: 8px; }
          table.totals .net td { font-weight: 700; }
          .words { text-align: right; margin-top: 4px; font-size: 11px; }
          ol.terms { margin: 14px 0 0; padding-left: 18px; line-height: 1.7; }
          .applied { margin-top: 6px; font-size: 11px; color: #444; }
          .signers { display: flex; justify-content: space-between; gap: 24px; margin-top: 36px; page-break-inside: avoid; }
          .sign-col { width: 46%; text-align: center; }
          .sign-line { padding-top: 40px; white-space: nowrap; }
          .sign-line.online { padding-top: 26px; font-weight: 700; color: #000099; }
          .sign-who { margin-top: 6px; line-height: 1.6; }
          .sign-date { color: #555; }
          .watermark { position: fixed; top: 38%; left: 0; right: 0; text-align: center; font-size: 120px; font-weight: 700; color: rgba(0, 0, 153, 0.08); transform: rotate(-24deg); pointer-events: none; }
          .watermark.red { color: rgba(190, 18, 60, 0.14); }
          .banner { margin-bottom: 10px; padding: 6px 10px; border: 1.5px solid #be123c; color: #be123c; font-weight: 700; }
        </style>
      </head>
      <body>
        ${renderStatusMarks(d)}
        ${renderLetterhead(d, { titleTh: "ใบแจ้งงานเพิ่ม-ลด", titleEn: "VARIATION ORDER", meta })}
        <div class="party">
          ${renderCustomerParty(d, "ผู้ว่าจ้าง")}
          <div>โครงการ: ${escapeHtml(d.projectName)} (${escapeHtml(d.projectNo)})</div>
          <div>อ้างอิง: สัญญาเลขที่ ${escapeHtml(d.contractNo)}${d.contractSignedAt ? ` ลงนามเมื่อ ${thaiDate(d.contractSignedAt)}` : ""}</div>
        </div>
        <div class="subject">
          <div><b>เรื่อง</b> ${escapeHtml(d.title)}</div>
          ${d.note ? `<div class="note">${escapeHtml(d.note)}</div>` : ""}
        </div>
        ${renderLines(d.lines)}
        ${renderTotals(d)}
        ${renderTerms(d)}
        ${renderSignatures(d)}
      </body>
    </html>`;
}

export async function renderChangeOrderPdf(d: ChangeOrderPdfData): Promise<Uint8Array> {
  return renderHtmlToPdf(
    buildChangeOrderHtml(d),
    documentChrome({ companyName: d.companyName, docLabel: `ใบแจ้งงานเพิ่ม-ลดเลขที่ ${d.docNo}`, logoSmall: d.logoSmall }),
    { title: `ใบแจ้งงานเพิ่ม-ลด ${d.docNo} · ${d.projectName}`, author: d.companyName, subject: `สัญญา ${d.contractNo} ครั้งที่ ${d.seq}` },
  );
}
