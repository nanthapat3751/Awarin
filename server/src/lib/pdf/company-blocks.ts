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
  /** สถานประกอบการของผู้ขาย — พิมพ์ต่อท้ายเลขผู้เสียภาษีบนหัวจดหมาย */
  companyBranch?: string | null;
  companyEmail?: string | null;
  /** ชื่อ/ที่อยู่ภาษาอังกฤษ — พิมพ์บนหัวใบแจ้งหนี้/ใบเสร็จตามแบบฟอร์มของบริษัท · ว่าง = ไม่พิมพ์บรรทัดนั้น */
  companyNameEn?: string | null;
  companyAddressEn?: string | null;
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

// ─────────────────────────── ช่องเซ็นท้ายใบเสนอราคา ───────────────────────────

/** คนเซ็นที่ตรึงลงใบ (QuoteSigner) — ลายเซ็นเป็น data URI เพราะ Puppeteer ไม่มีสิทธิ์โหลดไฟล์ภายนอก */
export interface QuotePdfSigner {
  role: "PROPOSER" | "APPROVER";
  name: string;
  title: string | null;
  phone: string | null;
  signatureDataUrl: string | null;
  signedAt: Date;
}

const signDate = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const ROLE_LABEL: Record<QuotePdfSigner["role"], string> = { PROPOSER: "ผู้เสนอราคา", APPROVER: "ผู้อนุมัติ" };

function renderSignerColumn(role: QuotePdfSigner["role"], signer: QuotePdfSigner | undefined): string {
  // ลายเซ็นลอยทับเส้นประเหมือนเซ็นด้วยปากกาจริง · ไม่มีรูป = เว้นเส้นไว้ให้เซ็นมือ
  const ink = signer?.signatureDataUrl
    ? `<img class="sign-ink" src="${signer.signatureDataUrl}" alt="" />`
    : "";
  const lines = signer
    ? [
        `<div>( ${escapeHtml(signer.name)} )</div>`,
        signer.title ? `<div>${escapeHtml(signer.title)}</div>` : "",
        signer.phone ? `<div>โทร ${escapeHtml(signer.phone)}</div>` : "",
        `<div class="sign-date">วันที่ ${signDate.format(signer.signedAt)}</div>`,
      ].join("")
    : `<div>( ....................................... )</div><div class="sign-date">วันที่ ........./........./.........</div>`;
  return `
        <div class="sign-col">
          <div class="sign-line">${ink}ลงชื่อ ....................................... ${ROLE_LABEL[role]}</div>
          <div class="sign-who">${lines}</div>
        </div>`;
}

/**
 * ท้ายใบเสนอราคา: ใบที่ผ่านขั้นอนุมัติ → สองช่อง "ผู้เสนอราคา + ผู้อนุมัติ" พร้อมลายเซ็นที่ตรึงไว้
 * ใบที่ส่งก่อนมีขั้นอนุมัติ (ไม่มีคนเซ็น) → หน้าตาเดิมทุกประการ ไม่เติมย้อนหลัง
 */
export function renderQuoteSignatures(input: {
  companyName: string;
  signatory?: CompanySignatory | null;
  signers?: QuotePdfSigner[];
}): string {
  const signers = input.signers ?? [];
  const proposer = signers.find((s) => s.role === "PROPOSER");
  if (!proposer) {
    return `
      <div class="signature">
        <div>ลงชื่อ ....................................... ผู้เสนอราคา</div>
        ${renderCompanySigner(input.companyName, input.signatory)}
      </div>`;
  }
  return `
      <div class="signature signers">
        ${renderSignerColumn("PROPOSER", proposer)}
        ${renderSignerColumn("APPROVER", signers.find((s) => s.role === "APPROVER"))}
      </div>
      <div class="sign-company">${escapeHtml(input.companyName)}</div>`;
}

export const SIGNATURE_CSS = `
  .signers { display: flex; justify-content: space-between; gap: 24px; page-break-inside: avoid; }
  .sign-col { width: 46%; text-align: center; }
  .sign-line { position: relative; padding-top: 44px; white-space: nowrap; }
  /* สูงสุด 44px ตั้งบนเส้นประ — ลายเซ็นยาวถูกย่อตามสัดส่วน ไม่ล้นช่อง */
  .sign-ink { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%); max-height: 44px; max-width: 170px; }
  .sign-who { margin-top: 6px; line-height: 1.6; }
  .sign-date { color: #555; }
  .sign-company { margin-top: 10px; text-align: center; font-size: 10px; color: #555; }
`;
