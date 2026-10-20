// ---------- ตรวจก่อนบันทึกรับเงิน (เตือน ไม่ห้าม) ----------
//
// กันความผิดพลาดจากคนกรอก: พิมพ์ศูนย์ขาด/เกิน · บันทึกซ้ำ · ผิดงวด · ลืมแนบสลิป · วันที่ย้อนหลังไกล
// เป็นคำเตือนให้กดยืนยันอีกรอบ ไม่ปฏิเสธ — เงินที่เข้ามาจริงไม่ตรงงวดก็มีได้ (ระบบที่ปฏิเสธความจริงสอนให้คนโกหกมัน)

import { roundTo } from "./rounding";

export interface PaymentCheckInstallment {
  id: string;
  seq: number;
  /** ยอดที่ยังขาดของงวด (ก่อนบันทึกรายการนี้ — ถ้าแก้รายการเดิม ต้องคืนยอดเดิมกลับเข้าไปแล้ว) */
  remaining: number;
  payments: { id: string; paidOn: string; amount: number }[];
}

export interface PaymentCheckInput {
  installmentId: string;
  amount: number;
  /** YYYY-MM-DD */
  paidOn: string;
  method: "TRANSFER" | "CASH" | "CHEQUE" | "OTHER";
  /** มีสลิป/หลักฐานแล้ว (ไฟล์ที่เลือกในฟอร์ม หรือที่แนบไว้กับรายการเดิม) */
  hasEvidence: boolean;
  /** วันนี้ YYYY-MM-DD */
  today: string;
  /** แก้รายการเดิม — ไม่นับตัวเองเป็นรายการซ้ำ */
  editingPaymentId?: string | null;
}

/** ระยะที่ถือว่า "บันทึกย้อนหลังไกล" (วัน) */
export const PAYMENT_BACKDATE_WARN_DAYS = 30;

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function daysBetweenIso(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** ตัวเลขห่างกันประมาณ 10 / 100 / 1,000 เท่า = น่าจะพิมพ์ศูนย์ขาดหรือเกิน */
function digitSlip(amount: number, expected: number): boolean {
  if (amount <= 0 || expected <= 0) return false;
  const ratio = amount > expected ? amount / expected : expected / amount;
  return [10, 100, 1000].some((k) => Math.abs(ratio - k) / k < 0.01);
}

/** คำเตือนก่อนบันทึก — อาเรย์ว่าง = ไม่มีอะไรผิดสังเกต */
export function paymentWarnings(input: PaymentCheckInput, installments: readonly PaymentCheckInstallment[]): string[] {
  const out: string[] = [];
  const target = installments.find((i) => i.id === input.installmentId);
  if (!target) return out;
  const amount = roundTo(input.amount, 2);
  const remaining = roundTo(target.remaining, 2);

  if (remaining <= 0) {
    out.push(`งวดที่ ${target.seq} รับครบแล้ว — บันทึกเพิ่มจะกลายเป็นรับเกิน ตรวจว่าเลือกงวดถูกหรือเปล่า`);
  } else if (digitSlip(amount, remaining)) {
    out.push(`ยอด ${fmt(amount)} ต่างจากยอดค้างของงวด (${fmt(remaining)}) หลายเท่า — พิมพ์ศูนย์ขาดหรือเกินหรือเปล่า`);
  } else if (amount > remaining) {
    out.push(`ยอดเกินยอดค้างของงวด ${fmt(roundTo(amount - remaining, 2))} บาท (ค้าง ${fmt(remaining)})`);
  } else if (amount < remaining) {
    out.push(`รับไม่ครบงวด ยังขาดอีก ${fmt(roundTo(remaining - amount, 2))} บาท`);
  }

  // บันทึกซ้ำ: ยอดเดียวกัน วันเดียวกัน ในสัญญาเดียวกัน (งวดไหนก็ได้ — กดผิดงวดแล้วกดใหม่ก็ซ้ำ)
  for (const inst of installments) {
    const dup = inst.payments.find(
      (p) => p.id !== input.editingPaymentId && p.paidOn === input.paidOn && roundTo(p.amount, 2) === amount,
    );
    if (dup) {
      out.push(`มีรายการรับ ${fmt(amount)} บาท วันเดียวกันในงวดที่ ${inst.seq} อยู่แล้ว — บันทึกซ้ำหรือเปล่า`);
      break;
    }
  }

  const earlier = installments
    .filter((i) => i.seq < target.seq && roundTo(i.remaining, 2) > 0)
    .map((i) => i.seq);
  if (earlier.length > 0 && remaining > 0) {
    out.push(`งวดที่ ${earlier.join(", ")} ยังค้างอยู่ — ตรวจว่าบันทึกถูกงวด`);
  }

  const back = daysBetweenIso(input.paidOn, input.today);
  if (back > PAYMENT_BACKDATE_WARN_DAYS) {
    out.push(`วันที่รับเงินย้อนหลัง ${back} วัน — ตรวจว่าพิมพ์ปีหรือเดือนถูก`);
  }

  if (input.method === "TRANSFER" && !input.hasEvidence) {
    out.push("ยังไม่ได้แนบสลิป — คนยืนยันจะต้องเปิดแอปธนาคารเทียบเอง");
  }
  return out;
}
