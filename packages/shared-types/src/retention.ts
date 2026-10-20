import { roundTo } from "./rounding";
// ---------- เงินประกันผลงาน (retention) ----------
//
// ผู้ว่าจ้างกันเงินไว้ร้อยละหนึ่งของยอดงวด (รวม VAT) ทุกงวด แล้วคืนเมื่อพ้นระยะรับประกันผลงาน
//
// เก็บแบบเดียวกับภาษีหัก ณ ที่จ่าย: ทุกครั้งที่รับเงิน บันทึก "ยอดที่ถือว่าชำระงวดแล้ว" แยกจากเงินที่ถูกกันไว้
// งวดจึงปิดได้ตามจริง (หนี้ส่วนนั้นย้ายไปเป็นก้อน "เงินประกันรอคืน") ไม่งั้นทุกงวดจะค้าง 5% ตลอดกาล
// ทั้งที่ลูกค้าทำตามสัญญาครบ

function round2(value: number): number {
  return roundTo(value, 2);
}

/** เงินประกันที่จะถูกกันจากยอดหนึ่งก้อน — pct ว่าง/ศูนย์ = ไม่กัน */
export function retentionOf(amount: number, pct: number | null | undefined): number {
  if (pct == null || !Number.isFinite(pct) || pct <= 0 || !Number.isFinite(amount) || amount <= 0) return 0;
  return round2((amount * pct) / 100);
}

/**
 * ภาษีหัก ณ ที่จ่ายของงวดหลังกันเงินประกันแล้ว — ผู้ว่าจ้างหักภาษีจากเงินที่จ่ายจริงเท่านั้น
 * ส่วนของเงินประกันจะถูกหักตอนคืน (ผลรวมทั้งสัญญาจึงเท่าเดิม)
 */
export function withholdingAfterRetention(withholding: number, installmentAmount: number, retention: number): number {
  if (installmentAmount <= 0 || retention <= 0) return withholding;
  return round2((withholding * (installmentAmount - retention)) / installmentAmount);
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

export interface RetentionBalance {
  /** ที่ถูกกันไว้แล้วจริงจากทุกการรับเงิน */
  held: number;
  /** ที่ได้คืนแล้ว (ก่อนหักภาษี ณ ที่จ่าย) */
  released: number;
  /** ยังรอคืน — 0 เมื่อคืนครบหรือเกิน */
  outstanding: number;
  /** คืนเกินที่กันไว้ — ไม่ตัดทิ้ง เงินที่เข้ามาจริงต้องเห็น */
  overReleased: number;
  /** ภาษีหัก ณ ที่จ่ายที่ถูกหักตอนคืน */
  withheldOnRelease: number;
  /** เลยวันครบกำหนดคืนมากี่วันทั้งที่ยังคืนไม่ครบ — null = ไม่เลย/ไม่ได้ตั้งวัน/คืนครบแล้ว */
  daysOverdue: number | null;
}

/** ยอดเงินประกันของสัญญาหนึ่งฉบับ — คำนวณสด ไม่เก็บสถานะ (แพตเทิร์นเดียวกับ installmentProgress) */
export function retentionBalance(input: {
  held: number;
  releases: { amount: number; withholdingAmount: number }[];
  dueOn: string | null;
  today: string;
}): RetentionBalance {
  const held = round2(input.held);
  const released = round2(input.releases.reduce((s, r) => s + r.amount, 0));
  const diff = round2(held - released);
  const overdue = input.dueOn != null ? daysBetween(input.dueOn, input.today) : 0;
  return {
    held,
    released,
    outstanding: Math.max(diff, 0),
    overReleased: diff < 0 ? round2(-diff) : 0,
    withheldOnRelease: round2(input.releases.reduce((s, r) => s + r.withholdingAmount, 0)),
    daysOverdue: input.dueOn != null && overdue > 0 && diff > 0 ? overdue : null,
  };
}
