import type { PaymentAccountDto } from "@systemboq/shared-types";

import { branchLabel, type CompanySignatory } from "../company-fields";

/**
 * ข้อมูลฝั่งบริษัทที่ตัวสร้าง PDF ทุกใบรับเข้ามา (ใบเสนอราคา · BOQ · สัญญา)
 *
 * ช่องที่เพิ่มทีหลังเป็น optional ทั้งหมด — `undefined` ของ logo/logoSmall แปลว่า "ใช้ไฟล์ตั้งต้น"
 * (เอกสารที่สร้างจากเทสต์หรือโค้ดเก่าจึงหน้าตาเหมือนเดิม) ส่วน `null` แปลว่าไม่มีโลโก้จริง ๆ
 */
export interface CompanyDocFields {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyTaxId?: string | null;
  companyEmail?: string | null;
  logo?: string | null;
  logoSmall?: string | null;
  /** null/ไม่ส่ง = พิมพ์ชื่อบริษัทใต้เส้นเซ็นเหมือนเดิม */
  signatory?: CompanySignatory | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * บรรทัดใต้เส้น "ลงชื่อ ....... ผู้รับจ้าง / ผู้เสนอราคา"
 *
 * สัญญาในนามนิติบุคคลต้องบอกว่า "ใคร" เซ็นแทนบริษัท ในตำแหน่งอะไร — เดิมพิมพ์แค่ชื่อบริษัท
 * ในวงเล็บ ซึ่งอ่านแล้วไม่รู้ว่าลายเซ็นบนเส้นนั้นเป็นของใคร ยังไม่ได้ตั้งผู้ลงนาม = พิมพ์แบบเดิม
 */
export function renderCompanySigner(companyName: string, signatory: CompanySignatory | null | undefined): string {
  if (!signatory) {
    return `<div style="margin-top:16px">( ${escapeHtml(companyName)} )</div>`;
  }
  return `<div style="margin-top:16px">( ${escapeHtml(signatory.name)} )</div>
              ${signatory.title ? `<div>${escapeHtml(signatory.title)}</div>` : ""}
              <div>${escapeHtml(companyName)}</div>`;
}

/**
 * กล่อง "การชำระเงิน" ท้ายสรุปใบเสนอราคา — ลูกค้าตกลงราคาแล้วต้องรู้ว่าจะโอนไปที่ไหน
 * (เดิมไม่มีบัญชีรับเงินอยู่ในเอกสารหรือระบบเลยสักที่)
 */
export function renderPaymentAccount(account: PaymentAccountDto | null | undefined): string {
  if (!account) return "";
  const bankLine = [
    escapeHtml(account.bankName),
    account.branch ? escapeHtml(branchLabel(account.branch)) : null,
  ]
    .filter(Boolean)
    .join(" ");
  return `
      <div class="payment">
        <div class="payment-title">การชำระเงิน</div>
        <div>โอนเข้าบัญชี ${bankLine}</div>
        <div>ชื่อบัญชี ${escapeHtml(account.accountName)} · เลขที่บัญชี <span class="payment-no">${escapeHtml(
          account.accountNo,
        )}</span></div>
        ${account.promptPay ? `<div>หรือพร้อมเพย์ <span class="payment-no">${escapeHtml(account.promptPay)}</span></div>` : ""}
      </div>`;
}

export const PAYMENT_CSS = `
  .payment { margin-top: 14px; padding: 8px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 10px; line-height: 1.7; page-break-inside: avoid; }
  .payment-title { font-weight: 700; }
  .payment-no { font-weight: 700; letter-spacing: 0.02em; }
`;

/** อ่านคอลัมน์ DATE ด้วยเมธอด UTC — เมธอดตามเวลาเครื่องจะเลื่อนวันบนเครื่องที่เขตเวลาติดลบ */
function formatBusinessDate(d: Date): string {
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

/**
 * ยืนราคา + เงื่อนไข — วางก่อนกล่องการชำระเงินและช่องเซ็น เพราะเป็นสิ่งที่ลูกค้าตกลงด้วยตอนเซ็นรับ
 * ไม่มีทั้งคู่ = ไม่พิมพ์อะไรเลย ใบเก่าหน้าตาเหมือนเดิมทุกประการ
 */
export function renderQuoteTerms(validUntil: Date | null | undefined, terms: string[] = []): string {
  if (!validUntil && terms.length === 0) return "";
  const validity = validUntil
    ? `<div class="terms-validity">ยืนราคาถึงวันที่ ${formatBusinessDate(validUntil)}</div>`
    : "";
  const termItem = (term: string) => `<li>${escapeHtml(term)}</li>`;
  const list =
    terms.length > 0
      ? `<ol>${terms.map(termItem).join("")}</ol>`
      : "";
  return `
      <div class="terms">
        <div class="terms-title">เงื่อนไข</div>
        ${validity}
        ${list}
      </div>`;
}

export const QUOTE_TERMS_CSS = `
  .terms { margin-top: 14px; font-size: 10px; line-height: 1.7; page-break-inside: avoid; }
  .terms-title { font-weight: 700; }
  .terms-validity { font-weight: 700; }
  .terms ol { margin: 2px 0 0; padding-left: 18px; }
`;
