/**
 * ปัดยอดสุทธิ (รวม VAT) — ใช้ทั้งเซิร์ฟเวอร์ (lib/pricing.ts) และพรีวิวบนหน้าจอ ให้ได้ตัวเลขเดียวกัน
 */

/**
 * ปัดครึ่งขึ้นที่ `places` ตำแหน่ง — ทุกจุดที่คิดเงิน/ปริมาณต้องใช้ตัวนี้
 *
 * float เก็บเลขที่ลงท้าย 5 พอดีไม่ได้เป๊ะ เช่น 145 × 6.4483 = 935.0035 แต่ได้ 935.00349999…
 * แล้ว Math.round ปัดลงเป็น 935.003 (ควร 935.004) · บวก Number.EPSILON ไม่ช่วยเพราะเล็กกว่า
 * ระยะห่างของ float ที่หลักร้อยขึ้นไป — ตัดผลคูณให้เหลือ 15 หลักซึ่ง double เก็บได้แน่นอนก่อนปัด
 * เศษหลอกจะหายไปเหลือ .5 จริง
 */
export function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(Number((value * factor).toPrecision(15))) / factor;
}

function round2(value: number): number {
  return roundTo(value, 2);
}

/** หน่วยปัดยอดสุทธิที่ให้เลือก (บาท) — 1 = ตัดสตางค์ทิ้ง */
export const ROUNDING_UNITS = [1, 100, 1000, 10000] as const;

export interface NetRounding {
  roundingAmount: number;
  subtotalBeforeVat: number;
  vatAmount: number;
  netPrice: number;
}

/**
 * ปัดยอดสุทธิ (รวม VAT) ลงให้เป็นทวีคูณของ unit — ทำเป็น "ส่วนลดปัดเศษ" ที่หัก **ก่อน VAT**
 *
 * ห้ามไปลดตัวเลขยอดสุทธิตรง ๆ แล้วปล่อย VAT เดิม: ฐานภาษีต้องลดตามส่วนลดด้วย ไม่งั้นเก็บ VAT
 * เกินจริงและใบกำกับภาษีผิด
 *
 * **ยอดที่ปัดแล้วคิด VAT แบบ "ราคารวมภาษี ถอดภาษีออก"** (VAT = ยอดสุทธิ × 7/107) ไม่ใช่ ฐาน × 7%
 * เพราะ VAT ปัดเป็นสตางค์ ยอดสุทธิจึงขยับทีละ ~1.07 สตางค์ ราว 6% ของยอดเป้าหมายไปไม่ถึงด้วยวิธี
 * ฐาน × 7% (ได้ 3,418,999.99 แทน 3,419,000 ซึ่งเสียจุดประสงค์ของการปัด) · การถอดภาษีจากราคารวม
 * เป็นวิธีที่ใบกำกับภาษีไทยใช้ทั่วไป ต่างจากฐาน × 7% ไม่เกิน 1 สตางค์ · ใบที่ไม่ได้ปัดยังคิดแบบเดิม
 *
 * ปัด "ลง" เสมอ ลูกค้าไม่จ่ายเกินยอดที่คำนวณได้ · ถ้าปัดแล้วเหลือศูนย์ (ยอดเล็กกว่าหน่วยปัด) ไม่ปัด
 */
export function applyNetRounding(
  subtotalBeforeVat: number,
  vatPercent: number,
  unit: number | null | undefined,
): NetRounding {
  const vatAmount = round2(subtotalBeforeVat * (vatPercent / 100));
  const unrounded = {
    roundingAmount: 0,
    subtotalBeforeVat,
    vatAmount,
    netPrice: round2(subtotalBeforeVat + vatAmount),
  };
  if (unit == null || !Number.isFinite(unit) || unit <= 0) return unrounded;

  const target = round2(Math.floor((unrounded.netPrice + 1e-9) / unit) * unit);
  if (target <= 0 || target === unrounded.netPrice) return unrounded;

  const roundedVat = round2((target * vatPercent) / (100 + vatPercent));
  const roundedSubtotal = round2(target - roundedVat);
  const roundingAmount = round2(subtotalBeforeVat - roundedSubtotal);
  if (roundingAmount < 0) return unrounded;
  return { roundingAmount, subtotalBeforeVat: roundedSubtotal, vatAmount: roundedVat, netPrice: target };
}


/** ป้ายของหน่วยปัด — ใช้ในตัวเลือกบนหน้าจอและบันทึกไทม์ไลน์ */
export function roundingUnitLabel(unit: number | null | undefined): string {
  if (unit == null) return "ไม่ปัด";
  if (unit === 1) return "ตัดสตางค์ทิ้ง";
  return `ปัดลงหลัก${{ 100: "ร้อย", 1000: "พัน", 10000: "หมื่น" }[unit] ?? ` ${unit}`}`;
}
