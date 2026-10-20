import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@systemboq/shared-types";

import { bahtText } from "../baht-text";
import { WITHHOLDING_TAX_PCT } from "../billing-party";
import { round2 } from "../pricing";
import { money, type CustomerPartyPdfData } from "./billing-block";
import { renderHtmlToPdf } from "./browser";
import type { CompanyDocFields } from "./company-blocks";
import { sarabunFontFaceCss } from "./fonts";
import { companyLogoDataUri, documentChrome } from "./letterhead";


/**
 * ใบแจ้งหนี้ / ใบเสร็จรับเงิน (/ใบกำกับภาษี) ของงวดเงินตามสัญญา
 *
 * ทุกตัวเลขและชื่อในนี้มาจากแถว BillingDocument ที่ตรึงไว้ตอนออก ไม่ได้คำนวณใหม่ — พิมพ์ซ้ำกี่ครั้ง
 * ก็ต้องได้เอกสารเดิม (มีแค่หัวจดหมายบริษัทที่อ่านค่าปัจจุบันเหมือนเอกสารใบอื่นของระบบ)
 *
 * **หน้าตาตามแบบฟอร์ม Excel ของบริษัท (ผู้ใช้สั่ง 18 ต.ค.):** หัวกลางหน้า (โลโก้ซ้าย) · ชื่อเอกสารไทย/อังกฤษ
 * · ตารางข้อมูลผู้ว่าจ้างช่องหัวสีฟ้า · ตารางรายการ 6 คอลัมน์ + แถวว่างเส้นประ · หมายเหตุ + ยอดรวมขวา
 * · จำนวนเงินตัวอักษร · ช่องผู้วางบิล/ผู้รับวางบิล (ทุกใบ ตามแบบเดิม) — ต่างจากแบบ Excel ข้อเดียวโดยตั้งใจ:
 * **แยกยอด VAT ให้เห็นทุกใบ** (แบบเดิมเขียน "ราคารวม VAT แล้ว" แต่ช่อง VAT ว่าง ใบกำกับภาษีตาม ม.86/4 ต้องแยก)
 */
/**
 * ฉบับที่พิมพ์ (ผู้ใช้เลือกแบบ C 18 ต.ค.):
 * - ORIGINAL = ต้นฉบับหน้าเดียว — ลูกค้าเปิดจากพอร์ทัล
 * - ORIGINAL_AND_COPY = ต้นฉบับ + สำเนาในไฟล์เดียว 2 หน้า — ฝั่งบริษัทพิมพ์ ฉีกต้นฉบับให้ลูกค้า เก็บสำเนา
 * เนื้อหาสองหน้าเหมือนกันทุกตัวอักษร ต่างแค่ป้ายมุมขวาบน · ใบกำกับภาษีต้นฉบับมีได้ใบเดียว
 * อีกใบต้องเขียนว่าสำเนาชัด ๆ (กันใช้ขอคืนภาษีซื้อซ้ำ)
 */
export type BillingDocEdition = "ORIGINAL" | "ORIGINAL_AND_COPY";

export interface BillingDocPdfData extends CustomerPartyPdfData, CompanyDocFields {
  type: "INVOICE" | "RECEIPT";
  /** ไม่ส่ง = ต้นฉบับหน้าเดียว */
  edition?: BillingDocEdition;
  /** ใบเสร็จที่เป็นใบกำกับภาษีด้วย — ตรึงมาจากแถว ห้ามคำนวณใหม่ตอนพิมพ์ */
  isTaxInvoice?: boolean;
  /** ออกแทนใบเลขที่นี้ที่ถูกยกเลิก */
  replacesDocNo?: string | null;
  docNo: string;
  issuedOn: Date;
  dueOn: Date | null;
  contractNo: string;
  projectNo: string;
  projectName: string;
  seq: number;
  milestone: string;
  amount: number;
  vatAmount: number | null;
  paidBefore: number | null;
  withholdingAmount: number | null;
  /**
   * เงินประกันผลงานที่ผู้ว่าจ้างกันไว้ (ใบแจ้งหนี้ = ที่จะกัน · ใบเสร็จ = ที่กันจริง) — null/0 = ไม่กัน
   * ใบเสร็จ: มูลค่าที่รับชำระ (และฐาน VAT ของใบกำกับภาษี) = amount − ยอดนี้
   */
  retentionAmount?: number | null;
  /** ใบคืนเงินประกันผลงาน (ของทั้งสัญญา ไม่ใช่ของงวด) */
  forRetention?: boolean;
  /** ใบเสร็จ: เลขใบแจ้งหนี้ของงวดเดียวกัน (ช่อง Invoice No.) — null = ไม่ได้วางบิลก่อน */
  invoiceNo?: string | null;
  method: PaymentMethod | null;
  reference: string | null;
  issuedByName: string;
  issuedByTitle: string | null;
  signatureDataUrl: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
}

const TITLES = {
  INVOICE: { th: "ใบแจ้งหนี้", en: "Invoice" },
  RECEIPT: { th: "ใบเสร็จรับเงิน", en: "Receipt" },
  TAX_INVOICE: { th: "ใบเสร็จรับเงิน/ใบกำกับภาษี", en: "Receipt / Tax Invoice" },
} as const;

/**
 * ชื่อเอกสารตามชนิดที่ตรึงไว้ในแถว
 *
 * คำว่า "ใบกำกับภาษี" ต้องปรากฏเด่นชัดตามมาตรา 86/4 (1) — จึงอยู่ในหัวเอกสารเหมือนชื่อใบอื่น
 * ไม่ใช่ข้อความเล็ก ๆ ท้ายหน้า
 */
function titleOf(data: Pick<BillingDocPdfData, "type" | "isTaxInvoice">) {
  return data.type === "RECEIPT" && data.isTaxInvoice ? TITLES.TAX_INVOICE : TITLES[data.type];
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** คอลัมน์ DATE อ่านด้วยเมธอด UTC — เมธอดตามเวลาเครื่องเลื่อนวันบนเครื่องที่เขตเวลาติดลบ */
function thaiDate(d: Date): string {
  return `${d.getUTCDate()} ${THAI_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}

/** วันที่แบบสั้นในช่องตาราง (5/3/2565) ตามแบบฟอร์มของบริษัท */
function shortDate(d: Date): string {
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear() + 543}`;
}

const voidedAtFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const esc = (v: string | null | undefined) => (v ? escapeHtml(v) : "");

/** ยอดที่ต้องชำระ (ใบแจ้งหนี้) / ยอดที่รับ (ใบเสร็จ) — ตัวที่พิมพ์เป็นตัวหนังสือกำกับ */
export function billingGrandTotal(
  data: Pick<BillingDocPdfData, "type" | "amount" | "paidBefore" | "retentionAmount">,
): number {
  const retention = data.retentionAmount ?? 0;
  return data.type === "INVOICE"
    ? round2(data.amount - (data.paidBefore ?? 0) - retention)
    : round2(data.amount - retention);
}

/**
 * ตัวเลขของตารางยอดรวม
 * ใบแจ้งหนี้: รายการ = ค่างานงวดก่อน VAT · ทั้งสิ้น = ยอดงวด · แล้วหักที่ชำระแล้ว/เงินประกัน → ยอดที่ต้องชำระ
 * ใบเสร็จ: รายการ = ที่รับครั้งนี้ก่อน VAT (VAT ของใบตรึงตามเงินที่รับจริง) · ทั้งสิ้น = ที่รับ
 * ไม่รู้ยอด VAT (สัญญาเก่า) = ช่อง VAT เป็นขีด รายการเท่ายอดรวม (ไม่เดาตัวเลข)
 */
function figuresOf(data: BillingDocPdfData) {
  const due = billingGrandTotal(data);
  const full = data.type === "INVOICE" ? data.amount : due;
  const vat = data.vatAmount;
  const beforeVat = vat == null ? full : round2(full - vat);
  return { due, full, vat, beforeVat };
}

function totalRow(label: string, value: string, cls = ""): string {
  return `<tr class="${cls}"><td class="tl">${label}</td><td class="tv">${value}</td></tr>`;
}

function renderTotals(data: BillingDocPdfData): string {
  const { due, full, vat, beforeVat } = figuresOf(data);
  const wh = data.withholdingAmount ?? 0;
  const retention = data.retentionAmount ?? 0;
  const rows: string[] = [];
  // ใบเสร็จที่ผู้ว่าจ้างกันเงินประกันไว้: ยอดงวดเต็ม → หักส่วนที่กัน ก่อนถึงยอดที่รับจริง (VAT คิดจากยอดที่รับ)
  if (data.type === "RECEIPT" && retention > 0) {
    rows.push(
      totalRow(`ค่างานงวดที่ ${data.seq}`, money(data.amount)),
      totalRow("หัก เงินประกันผลงานที่ผู้ว่าจ้างกันไว้", `-${money(retention)}`),
    );
  }
  rows.push(
    totalRow("ลดราคา / Discount", "-"),
    totalRow("รวมเงิน / Total", money(beforeVat)),
    totalRow("ภาษีมูลค่าเพิ่ม (Vat) 7%", vat == null ? "-" : money(vat)),
    totalRow("จำนวนเงินทั้งสิ้น / Grand Total", money(full), "strong"),
  );
  if (data.type === "INVOICE") {
    if ((data.paidBefore ?? 0) > 0) rows.push(totalRow("หัก ชำระแล้ว", `-${money(data.paidBefore ?? 0)}`));
    if (retention > 0) rows.push(totalRow("หัก เงินประกันผลงาน", `-${money(retention)}`));
    if (due !== full) rows.push(totalRow("ยอดที่ต้องชำระ / Amount Due", money(due), "strong"));
    if (wh > 0) {
      rows.push(
        totalRow(`หักภาษี ณ ที่จ่าย ${WITHHOLDING_TAX_PCT}%`, `-${money(wh)}`),
        totalRow("ยอดโอนสุทธิ", money(round2(due - wh)), "strong"),
      );
    }
  } else if (wh > 0) {
    rows.push(totalRow("ภาษีหัก ณ ที่จ่าย", `-${money(wh)}`), totalRow("รับเงินสุทธิ", money(round2(due - wh)), "strong"));
  }
  return `<table class="totals">${rows.join("")}</table>`;
}

/** หมายเหตุ (ช่องซ้ายของตารางยอดรวม) — ทุกเรื่องที่คนรับเอกสารต้องรู้ เรียงเป็นบรรทัด */
function notesOf(data: BillingDocPdfData): string[] {
  const notes: string[] = [`อ้างอิงสัญญาเลขที่ ${esc(data.contractNo)} · โครงการ ${esc(data.projectNo)}`];
  const retention = data.retentionAmount ?? 0;
  if (data.type === "INVOICE") {
    if (data.dueOn) notes.push(`<b>กำหนดชำระภายในวันที่ ${thaiDate(data.dueOn)}</b>`);
    if (retention > 0) {
      notes.push("เงินประกันผลงานที่หักไว้ ผู้ว่าจ้างจะคืนให้เมื่อพ้นระยะรับประกันผลงานตามสัญญา — บริษัทจะออกใบกำกับภาษีของเงินส่วนนี้เมื่อได้รับคืน");
    }
    if ((data.withholdingAmount ?? 0) > 0) {
      notes.push(`ผู้ว่าจ้างเป็นนิติบุคคล กรุณาหักภาษี ณ ที่จ่าย ${WITHHOLDING_TAX_PCT}% ของมูลค่างานก่อนภาษีมูลค่าเพิ่ม และส่งหนังสือรับรองการหักภาษี ณ ที่จ่ายให้บริษัทพร้อมการชำระเงิน`);
    }
    notes.push("เอกสารนี้ไม่ใช่ใบกำกับภาษี — บริษัทจะออกใบเสร็จรับเงิน/ใบกำกับภาษีให้เมื่อได้รับชำระเงินแล้ว");
  } else {
    const paid = [
      `ชำระโดย ${data.method ? PAYMENT_METHOD_LABELS[data.method] : "-"}`,
      data.reference ? `เลขอ้างอิง ${escapeHtml(data.reference)}` : null,
      `ได้รับเงินวันที่ ${thaiDate(data.issuedOn)}`,
    ].filter(Boolean);
    notes.push(paid.join(" · "));
    if (retention > 0) notes.push("เงินประกันผลงานที่ผู้ว่าจ้างกันไว้ จะได้รับคืนเมื่อพ้นระยะรับประกันผลงานตามสัญญา");
    if (data.method === "CHEQUE") notes.push("ชำระด้วยเช็ค — ใบเสร็จนี้สมบูรณ์เมื่อบริษัทเรียกเก็บเงินตามเช็คได้แล้ว");
  }
  if (data.vatAmount == null) notes.push("สัญญาฉบับนี้ไม่ได้แยกยอดภาษีมูลค่าเพิ่มไว้ ยอดในเอกสารจึงไม่แยก VAT");
  if (data.replacesDocNo) notes.push(`ออกแทนเอกสารเลขที่ ${escapeHtml(data.replacesDocNo)} ที่ยกเลิก`);
  return notes;
}

/** ลายน้ำ "ยกเลิก" — position: fixed พิมพ์ซ้ำทุกหน้าเอง จึงใส่ครั้งเดียวต่อไฟล์ (ใส่ต่อหน้าจะซ้อนจนเข้ม) */
function renderVoidMark(data: BillingDocPdfData): string {
  return data.voidedAt ? `<div class="void-mark" aria-hidden="true">ยกเลิก</div>` : "";
}

function renderVoided(data: BillingDocPdfData): string {
  if (!data.voidedAt) return "";
  return `
    <div class="void-banner">เอกสารนี้ถูกยกเลิกเมื่อ ${voidedAtFormat.format(data.voidedAt)}${
      data.voidReason ? ` — ${escapeHtml(data.voidReason)}` : ""
    } · ใช้อ้างอิงไม่ได้</div>`;
}

/** บรรทัดรายการ (หัวข้อโครงการขีดเส้นใต้ + รายการงวด) ตามแบบฟอร์ม */
function itemOf(data: BillingDocPdfData): { title: string; sub: string | null } {
  if (data.forRetention) {
    return {
      title: data.type === "INVOICE" ? "คืนเงินประกันผลงาน" : "รับคืนเงินประกันผลงาน",
      sub: "ที่ผู้ว่าจ้างหักไว้จากค่างานแต่ละงวด",
    };
  }
  return { title: `${escapeHtml(data.projectName)} งวดที่ ${data.seq}`, sub: escapeHtml(data.milestone) };
}

/** ชื่อบริษัทบรรทัดแรกของหัว: ชื่อไทย + สาขา / ชื่ออังกฤษ (ตามแบบฟอร์ม) */
function companyLine(data: BillingDocPdfData): string {
  const branch = data.companyBranch?.trim();
  const branchText = branch ? (branch.startsWith("สาขา") ? ` ${branch}` : ` สาขา ${branch}`) : "";
  const en = data.companyNameEn?.trim();
  return `${escapeHtml(data.companyName)}${escapeHtml(branchText)}${en ? ` / ${escapeHtml(en)}` : ""}`;
}

type CopyLabel = "ต้นฉบับ" | "สำเนา";

function renderHeader(data: BillingDocPdfData, label: CopyLabel): string {
  const logo = data.logo !== undefined ? data.logo : companyLogoDataUri();
  const contact = [
    data.companyPhone && data.companyPhone !== "-" ? `โทรศัพท์ / Tel : ${escapeHtml(data.companyPhone)}` : null,
    data.companyEmail ? `อีเมล์ / E-mail : ${escapeHtml(data.companyEmail)}` : null,
  ].filter(Boolean);
  const title = titleOf(data);
  // ป้ายฉบับมุมขวาบน ทุกชนิดเอกสาร — ใบกำกับภาษีต้องระบุว่าฉบับไหนเป็นของผู้ซื้อ
  return `
    <div class="head">
      <div class="original">${label}</div>
      ${logo ? `<img class="head-logo" src="${logo}" alt="" />` : ""}
      <div class="head-lines">
        <div class="head-name">${companyLine(data)}</div>
        ${data.companyAddress && data.companyAddress !== "-" ? `<div>${escapeHtml(data.companyAddress)}</div>` : ""}
        ${data.companyAddressEn ? `<div>${escapeHtml(data.companyAddressEn)}</div>` : ""}
        ${contact.length ? `<div>${contact.join("&nbsp;&nbsp;")}</div>` : ""}
        ${data.companyTaxId ? `<div>เลขประจำตัวผู้เสียภาษี / Tax ID : ${escapeHtml(data.companyTaxId)}</div>` : ""}
      </div>
    </div>
    <h1 class="doc-title">${escapeHtml(title.th.replace("/", " / "))} (${escapeHtml(title.en)})</h1>`;
}

/** ตารางข้อมูลผู้ว่าจ้าง ช่องหัวสีฟ้า (บริษัท · Tax ID · ผู้ติดต่อ · ที่อยู่ · โทรศัพท์ | วันที่ · เลขเอกสาร) */
function renderParty(data: BillingDocPdfData): string {
  // บุคคลธรรมดา: ช่องบริษัทว่าง ชื่ออยู่ช่องผู้ติดต่อ (แบบฟอร์มของบริษัทกรอกแบบนี้) · นิติบุคคล: ชื่อบริษัท + ผู้ประสานงาน
  const company = data.customerIsCompany ? esc(data.customerName) : "";
  const contact = data.customerIsCompany ? esc(data.customerContactPerson) : esc(data.customerName);
  const taxId = data.customerIsCompany
    ? [esc(data.customerTaxId), esc(data.customerBranch)].filter(Boolean).join(" · ")
    : "";
  let docLabel = "เลขที่ใบแจ้งหนี้ / Invoice No.";
  if (data.type === "RECEIPT") docLabel = data.isTaxInvoice ? "เลขที่ใบกำกับภาษี / Tax Invoice No." : "เลขที่ใบเสร็จ / Receipt No.";
  const r2 =
    data.type === "INVOICE"
      ? ["ครบกำหนด / Due Date", data.dueOn ? shortDate(data.dueOn) : ""]
      : ["เลขที่ใบแจ้งหนี้ / Invoice No.", esc(data.invoiceNo)];
  return `
    <table class="grid party">
      <colgroup><col style="width:21%" /><col style="width:36%" /><col style="width:24%" /><col style="width:19%" /></colgroup>
      <tr><th>บริษัท / Company</th><td>${company}</td><th>วันที่ / Date</th><td class="c">${shortDate(data.issuedOn)}</td></tr>
      <tr><th>Tax ID</th><td>${taxId}</td><th>${r2[0]}</th><td class="c">${r2[1]}</td></tr>
      <tr><th>ชื่อผู้ติดต่อ / Contact person</th><td>${contact}</td><th>เลขที่สัญญา / Contract No.</th><td class="c">${esc(data.contractNo)}</td></tr>
      <tr class="tall"><th>ที่อยู่ / Address</th><td>${esc(data.customerAddress)}</td><th>${docLabel}</th><td class="c">${escapeHtml(data.docNo)}</td></tr>
      <tr><th>โทรศัพท์ / Tel No.</th><td>${esc(data.customerPhone)}</td><td class="blank"></td><td class="blank"></td></tr>
    </table>`;
}

/** แถวว่างใต้รายการ ให้ตารางยาวเท่าแบบฟอร์ม (เส้นประ) */
const FILLER_ROWS = 8;

function renderItems(data: BillingDocPdfData): string {
  const { beforeVat } = figuresOf(data);
  const item = itemOf(data);
  const filler = Array.from({ length: FILLER_ROWS }, () => `<tr class="fill"><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("");
  return `
    <table class="grid items">
      <colgroup><col style="width:8%" /><col style="width:44%" /><col style="width:11%" /><col style="width:9%" /><col style="width:14%" /><col style="width:14%" /></colgroup>
      <thead>
        <tr><th>ลำดับ<br />No.</th><th>รายการ<br />Description</th><th>จำนวน<br />Quantity</th><th>หน่วย<br />Unit</th><th>ราคา/หน่วย<br />Baht/Unit</th><th>จำนวนเงิน<br />Amount</th></tr>
      </thead>
      <tbody>
        <tr class="group"><td></td><td><u>${escapeHtml(data.projectName)}</u></td><td></td><td></td><td></td><td></td></tr>
        <tr>
          <td class="c">1</td>
          <td>${item.title}${item.sub ? `<div class="sub">${item.sub}</div>` : ""}</td>
          <td class="c">1</td>
          <td class="c">เหมา</td>
          <td class="n">${money(beforeVat)}</td>
          <td class="n">${money(beforeVat)}</td>
        </tr>
        ${filler}
      </tbody>
    </table>`;
}

function renderSummary(data: BillingDocPdfData): string {
  const { due } = figuresOf(data);
  return `
    <table class="grid summary">
      <colgroup><col style="width:58%" /><col style="width:42%" /></colgroup>
      <tr>
        <td class="notes"><b>หมายเหตุ :</b> ${notesOf(data).map((n) => `<div>${n}</div>`).join("")}</td>
        <td class="tot">${renderTotals(data)}</td>
      </tr>
      <tr><td class="words" colspan="2">${bahtText(due)}</td></tr>
    </table>`;
}

/** ช่องเซ็น ผู้วางบิล / ผู้รับวางบิล ทุกใบ (ตามแบบฟอร์มเดิมของบริษัท — ผู้ใช้เลือกคงคำเดิม) */
function renderSignatures(data: BillingDocPdfData): string {
  const ink = data.signatureDataUrl ? `<img class="sign-ink" src="${data.signatureDataUrl}" alt="" />` : "";
  const who = `${escapeHtml(data.issuedByName)}${data.issuedByTitle ? ` · ${escapeHtml(data.issuedByTitle)}` : ""}`;
  return `
    <table class="grid signs">
      <colgroup><col style="width:17%" /><col style="width:33%" /><col style="width:17%" /><col style="width:33%" /></colgroup>
      <tr class="sign-row"><th>ผู้วางบิล</th><td class="c">${ink}<div class="sign-who">${who}</div></td><th>ผู้รับวางบิล</th><td></td></tr>
      <tr><th>วันที่</th><td class="c">${shortDate(data.issuedOn)}</td><th>วันที่</th><td></td></tr>
    </table>`;
}

function labelsOf(data: BillingDocPdfData): CopyLabel[] {
  return data.edition === "ORIGINAL_AND_COPY" ? ["ต้นฉบับ", "สำเนา"] : ["ต้นฉบับ"];
}

// ใบแจ้งหนี้ไม่พิมพ์บัญชีรับเงิน/QR พร้อมเพย์ (ผู้ใช้สั่งเอาออก 18 ต.ค. — ล้นหน้า 2 และไม่มีในแบบฟอร์มของบริษัท)
// ลูกค้าดูช่องทางชำระและสแกนจ่ายได้ในพอร์ทัล
export function buildBillingDocHtml(data: BillingDocPdfData): string {
  return `
    <!doctype html>
    <html lang="th">
      <head>
        <meta charset="utf-8" />
        <style>
          ${sarabunFontFaceCss()}
          * { font-family: "Sarabun", sans-serif; box-sizing: border-box; }
          html, body { background: #fff; }
          body { margin: 0; font-size: 12px; color: #111; }
          @page { size: A4; }
          .head { position: relative; text-align: center; line-height: 1.55; min-height: 96px; padding: 4px 92px 0 158px; }
          .head-logo { position: absolute; left: 0; top: 14px; max-height: 76px; max-width: 148px; }
          .head-name { font-weight: 700; font-size: 13.5px; }
          /* กรอบต้นฉบับอยู่ในพื้นที่หน้าเต็มทั้งสี่ด้าน — เดิม top ติดลบ เส้นบนถูกขอบหน้า PDF ตัด */
          .original { position: absolute; right: 0; top: 4px; border: 1px solid #111; padding: 2px 18px; font-size: 13px; line-height: 1.5; }
          .doc-title { text-align: center; font-size: 19px; font-weight: 700; margin: 14px 0 12px; }
          table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
          table.grid th, table.grid td { border: 1px solid #111; padding: 4px 6px; vertical-align: top; }
          table.grid th { background: #c6d9f1; font-weight: 400; text-align: left; }
          table.grid td.c { text-align: center; }
          table.grid td.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
          table.grid td.blank { border-left-color: transparent; border-right-color: transparent; border-bottom-color: transparent; }
          table.party th { font-size: 11px; white-space: nowrap; }
          table.party tr.tall td, table.party tr.tall th { height: 46px; }
          table.items { margin-top: 12px; }
          table.items thead th { text-align: center; line-height: 1.35; padding: 5px 4px; }
          table.items tbody td { border-top: 1px dotted #555; border-bottom: 1px dotted #555; height: 23px; }
          table.items tbody tr.group td { border-top: 1px solid #111; }
          table.items .sub { font-size: 10.5px; color: #444; }
          table.summary { margin-top: -1px; }
          table.summary td.notes { line-height: 1.6; font-size: 11px; }
          table.summary td.tot { padding: 0; }
          table.totals { width: 100%; border-collapse: collapse; }
          table.totals td { padding: 3px 6px; border-bottom: 1px solid #111; }
          table.totals tr:last-child td { border-bottom: none; }
          table.totals td.tl { border-right: 1px solid #111; }
          table.totals td.tv { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; width: 40%; }
          table.totals tr.strong td { font-weight: 700; }
          table.summary td.words { background: #c6d9f1; text-align: center; font-weight: 700; }
          table.signs { margin-top: -1px; }
          table.signs tr.sign-row td, table.signs tr.sign-row th { height: 58px; vertical-align: bottom; }
          .sign-ink { display: block; margin: 0 auto 2px; max-height: 40px; max-width: 160px; }
          .sign-who { font-size: 11px; }
          .void-mark {
            position: fixed; top: 38%; left: 0; right: 0; text-align: center;
            font-size: 120px; font-weight: 700; color: rgba(190, 18, 60, 0.14);
            transform: rotate(-24deg); pointer-events: none;
          }
          .void-banner { margin-bottom: 12px; padding: 6px 10px; border: 1.5px solid #be123c; color: #be123c; font-weight: 700; }
          .sheet + .sheet { break-before: page; }
        </style>
      </head>
      <body>
        ${renderVoidMark(data)}
        ${labelsOf(data)
          .map(
            (label) => `
        <section class="sheet">
          ${renderVoided(data)}
          ${renderHeader(data, label)}
          ${renderParty(data)}
          ${renderItems(data)}
          ${renderSummary(data)}
          ${renderSignatures(data)}
        </section>`,
          )
          .join("")}
      </body>
    </html>`;
}

export async function renderBillingDocPdf(data: BillingDocPdfData): Promise<Uint8Array> {
  const title = titleOf(data).th;
  return renderHtmlToPdf(
    buildBillingDocHtml(data),
    documentChrome({
      companyName: data.companyName,
      docLabel: `${title}เลขที่ ${data.docNo}`,
      logoSmall: data.logoSmall,
      hidePageNumbers: data.edition === "ORIGINAL_AND_COPY",
    }),
    {
      title: `${title} ${data.docNo} · ${data.projectName}`,
      author: data.companyName,
      subject: data.forRetention
        ? `สัญญา ${data.contractNo} คืนเงินประกันผลงาน`
        : `สัญญา ${data.contractNo} งวดที่ ${data.seq}`,
    },
  );
}
