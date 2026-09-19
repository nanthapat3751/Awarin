import type { Withholding } from "../billing-party";

/**
 * บล็อก "ผู้ว่าจ้าง" และบรรทัดภาษีหัก ณ ที่จ่าย ที่ใช้ร่วมกันทุกเอกสาร
 *
 * ใบเสนอราคาฝั่งพนักงาน / ใบเสนอราคาฝั่งลูกค้า / สัญญา เป็นเอกสารสามใบของดีลเดียวกัน ถ้าต่างคน
 * ต่างเขียนบล็อกนี้เอง วันหนึ่งมันจะเรียกผู้ว่าจ้างคนละชื่อหรือแสดงเลขภาษีไม่ครบ แล้วไม่มีใครรู้
 * จนกว่าลูกค้าจะทักกลับมา
 */

export interface CustomerPartyPdfData {
  customerName: string | null;
  customerAddress: string | null;
  /** ช่องด้านล่างมีค่าเฉพาะผู้ว่าจ้างที่เป็นนิติบุคคล */
  customerIsCompany?: boolean;
  customerTaxId?: string | null;
  customerBranch?: string | null;
  customerContactPerson?: string | null;
}

export function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * บรรทัดระบุตัวผู้ว่าจ้างในหัวเอกสาร
 *
 * `label` ต่างกันตามเอกสาร: ใบเสนอราคาใช้คำว่า "ลูกค้า" (ยังไม่ได้เป็นคู่สัญญา) ส่วนสัญญาใช้
 * "ผู้ว่าจ้าง" ตามถ้อยคำในตัวสัญญาเอง
 */
export function renderCustomerParty(data: CustomerPartyPdfData, label: string): string {
  const lines = [`<div>${label}: ${escapeHtml(data.customerName ?? "-")}</div>`];

  if (data.customerIsCompany) {
    // เลขประจำตัวผู้เสียภาษีกับสาขาต้องอยู่ด้วยกัน — ใบกำกับภาษีที่ระบุแค่เลขแต่ไม่บอกสาขาถือว่าไม่ครบ
    const taxParts = [
      data.customerTaxId ? `เลขประจำตัวผู้เสียภาษี ${escapeHtml(data.customerTaxId)}` : null,
      data.customerBranch ? escapeHtml(data.customerBranch) : null,
    ].filter(Boolean);
    if (taxParts.length > 0) lines.push(`<div>${taxParts.join(" · ")}</div>`);
  }

  if (data.customerAddress) {
    lines.push(`<div>ที่อยู่: ${escapeHtml(data.customerAddress)}</div>`);
  }

  // ผู้ประสานงานมีความหมายเฉพาะกับนิติบุคคล — ของบุคคลธรรมดามันคือคนเดียวกับผู้ว่าจ้าง
  if (data.customerIsCompany && data.customerContactPerson) {
    lines.push(`<div>ผู้ประสานงาน: ${escapeHtml(data.customerContactPerson)}</div>`);
  }

  return lines.join("\n          ");
}

/**
 * สองแถวท้ายตารางสรุปยอด: ยอดที่ถูกหักไว้ และยอดที่โอนจริง
 *
 * **ไม่ใช่ส่วนลด** — มูลค่างานยังเท่าเดิมทุกบาท เงินส่วนนี้ผู้ว่าจ้างนำส่งสรรพากรแทนเราและออก
 * หนังสือรับรองให้ไปใช้เครดิตภาษีตอนสิ้นปี จึงต้องอยู่ **ใต้** บรรทัด "รวมมูลค่าทั้งสิ้น" และ
 * ไม่แตะยอดรวม ถ้าเอาไปหักในยอดรวม ตัวเลขมูลค่าสัญญาจะผิดทันที
 */
export function renderWithholdingRows(w: Withholding | null): string {
  if (!w) return "";
  return `
          <tr><td class="label">หักภาษี ณ ที่จ่าย ${w.pct}% (ของมูลค่างานก่อนภาษีมูลค่าเพิ่ม ${money(w.base)})</td><td class="num">-${money(w.tax)}</td></tr>
          <tr class="grand"><td class="label">ยอดชำระสุทธิ</td><td class="num">${money(w.netTransfer)}</td></tr>`;
}

/** คำอธิบายใต้ตาราง — กันเข้าใจผิดว่าเป็นส่วนลดหรือว่าเราลดราคาให้ */
export function withholdingNote(w: Withholding | null): string {
  if (!w) return "";
  return `<p class="note">ผู้ว่าจ้างเป็นนิติบุคคล จึงมีหน้าที่หักภาษี ณ ที่จ่าย ${w.pct}% ของมูลค่างานก่อนภาษีมูลค่าเพิ่ม นำส่งกรมสรรพากร และออกหนังสือรับรองการหักภาษี ณ ที่จ่ายให้ผู้รับจ้าง — ยอดที่หักไม่ใช่ส่วนลด มูลค่างานตามเอกสารนี้ยังคงเดิม</p>`;
}

/** สไตล์ของคำอธิบายด้านบน — เอกสารแต่ละใบ import ไปต่อท้าย CSS ของตัวเอง */
export const BILLING_NOTE_CSS = `
  .note { margin-top: 8px; font-size: 11px; color: #444; line-height: 1.5; }
`;
