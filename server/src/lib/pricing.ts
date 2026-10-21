// ตรรกะการคิดราคาล้วน ๆ (BR-01..BR-06 ใน MASTER_PROMPT.md §5) ไม่มีการเข้าถึง DB ที่นี่
import { roundTo, applyNetRounding } from "@systemboq/shared-types";

// การปัดยอดสุทธิอยู่ใน shared-types เพราะหน้าจอต้องพรีวิวด้วยสูตรเดียวกันเป๊ะ
export { applyNetRounding, ROUNDING_UNITS, type NetRounding } from "@systemboq/shared-types";
//
// รายการหนึ่งบรรทัดใน BOQ จะพกทั้งราคาค่าวัสดุ และค่าแรงมาด้วยกัน (วิธี Unit Cost)
// — เช่น "เข็มตอก I 22 L 24": วัสดุ 7,500/หน่วย ค่าแรง 1,500/หน่วย —
// แทนที่จะแยกเป็นสองแถวในแคตตาล็อก

export interface BoqLineInput {
  quantity: number;
  materialUnitPrice: number;
  laborUnitPrice: number;
}

export interface BoqLineAmounts {
  materialTotal: number;
  laborTotal: number;
  lineTotal: number;
}

/**
 * ส่วนที่เพิ่มเข้ามาทีหลังของสายคำนวณ — แยกเป็นก้อนเดียวเพื่อไม่ให้พารามิเตอร์ตามตำแหน่งยาวจนอ่านไม่ออก
 *
 * ไม่ส่งมาเลย = ไม่มีค่าเผื่อเหลือเผื่อขาด ไม่ปัดยอด ซึ่งคือพฤติกรรมเดิมทุกประการ
 */
export interface PricingExtras {
  /** ค่าเผื่อเหลือเผื่อขาด % ของต้นทุนตรง — บวกเข้าเป็น "ค่างานต้นทุน" ก่อนคิดกำไร */
  contingencyPercent?: number | null;
  /** ปัดยอดสุทธิ (รวม VAT) ลงให้เป็นทวีคูณของค่านี้ — null/ไม่ส่ง = ไม่ปัด (ดู applyNetRounding) */
  roundingUnit?: number | null;
}

export interface PricingBreakdown {
  directCost: number;
  contingencyPercent: number;
  contingencyAmount: number;
  /** ค่างานต้นทุน = ต้นทุนตรง + ค่าเผื่อเหลือเผื่อขาด — ฐานของค่าดำเนินการ/กำไร */
  baseCost: number;
  overheadProfitPercent: number;
  overheadProfitAmount: number;
  /** เปอร์เซ็นต์ส่วนลด ถ้าลดเป็น % — null คือลดเป็นจำนวนเงินคงที่ หรือไม่ลด */
  discountPercent: number | null;
  discountAmount: number;
  /** หน่วยที่ปัดยอดสุทธิ (บาท) — null = ไม่ปัด */
  roundingUnit: number | null;
  /** ส่วนลดปัดเศษที่หักก่อน VAT เพื่อให้ยอดสุทธิลงตัว — 0 เมื่อไม่ปัดหรือยอดลงตัวอยู่แล้ว */
  roundingAmount: number;
  /** ฐานคิด VAT = ต้นทุนตรง + ค่าดำเนินการ/กำไร − ส่วนลด − ส่วนลดปัดเศษ */
  subtotalBeforeVat: number;
  vatPercent: number;
  vatAmount: number;
  netPrice: number;
  pricePerSqm: number | null;
}

/**
 * ส่วนลดที่พนักงานตกลงกับลูกค้า กรอกได้สองแบบ แต่ผลลัพธ์เก็บเป็น "จำนวนเงิน" เสมอ
 * — percent มาก่อน amount ถ้าเผลอส่งมาทั้งคู่ เพราะ % คือค่าที่ผูกกับยอดจึงคิดใหม่ได้เมื่อ BOQ ขยับ
 */
export interface DiscountInput {
  percent?: number | null;
  amount?: number | null;
}

/**
 * อ่านส่วนลดออกจากแถว ProjectVersion (ค่าเป็น Prisma.Decimal) ให้อยู่ในรูปที่ calculatePricing กิน
 *
 * ต้องเช็ค null ของ discountPct ตรง ๆ ห้ามพึ่ง Number() เพราะ Number(null) = 0 ซึ่งจะแปลว่า
 * "ลด 0%" แล้วส่วนลดที่กรอกเป็นบาทจะหายไปทั้งก้อนโดยไม่มีใครรู้
 */
export function discountOf(version: { discountPct: unknown; discountAmt: unknown }): DiscountInput {
  if (version.discountPct != null) return { percent: Number(version.discountPct) };
  return { amount: version.discountAmt != null ? Number(version.discountAmt) : 0 };
}

// ปัดเงินเป็น 2 ตำแหน่งเฉพาะตอนจบของแต่ละค่าที่คำนวณได้ เพื่อเลี่ยงไม่ให้ความคลาดเคลื่อน
// ของ floating point สะสมทบไปตลอดสายการคำนวณ
export function round2(value: number): number {
  return roundTo(value, 2);
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite number >= 0`);
  }
}

function assertValidLine(line: BoqLineInput): void {
  assertNonNegative(line.quantity, "quantity");
  assertNonNegative(line.materialUnitPrice, "materialUnitPrice");
  assertNonNegative(line.laborUnitPrice, "laborUnitPrice");
}

export function calculateLineAmounts(line: BoqLineInput): BoqLineAmounts {
  assertValidLine(line);
  const materialTotal = round2(line.quantity * line.materialUnitPrice);
  const laborTotal = round2(line.quantity * line.laborUnitPrice);
  const lineTotal = round2(materialTotal + laborTotal);
  return { materialTotal, laborTotal, lineTotal };
}

// ---------- Bill of materials (แตกวัสดุย่อยต่อบรรทัด) ----------

export interface MaterialComponentInput {
  qtyPerUnit: number; // ปริมาณวัสดุย่อยต่อ 1 หน่วยของรายการแม่ (ก่อนเผื่อเสีย)
  wasteFactorPct: number | null;
  unitPrice: number;
}

/**
 * ปริมาณวัสดุย่อยที่ต้องใช้จริงต่อ 1 หน่วยของรายการแม่ = qtyPerUnit × (1 + เผื่อเสีย%).
 * ใช้ทั้งตอนคิดราคาต่อหน่วย และตอนรวมปริมาณสั่งซื้อในรายงานสรุปวัสดุ ให้สูตรตรงกันที่เดียว
 */
export function componentQtyPerUnit(c: { qtyPerUnit: number; wasteFactorPct: number | null }): number {
  return c.qtyPerUnit * (1 + (c.wasteFactorPct ?? 0) / 100);
}

/**
 * ราคาวัสดุต่อ 1 หน่วยของบรรทัด (materialUnitPrice) เมื่อบรรทัดถูกแตกเป็นวัสดุย่อย =
 * Σ ( ปริมาณต่อหน่วยรวมเผื่อเสีย × ราคาต่อหน่วยของวัสดุย่อย ) แล้วปัด 2 ตำแหน่งตอนจบ.
 * ค่านี้ไปแทน materialUnitPrice ที่พิมพ์เอง — ปลายน้ำ (materialTotal/ราคารวม/PDF) ทำงานเหมือนเดิม
 */
export function deriveMaterialUnitPrice(components: MaterialComponentInput[]): number {
  const sum = components.reduce((acc, c) => {
    assertNonNegative(c.qtyPerUnit, "qtyPerUnit");
    assertNonNegative(c.unitPrice, "unitPrice");
    return acc + componentQtyPerUnit(c) * c.unitPrice;
  }, 0);
  return round2(sum);
}

/**
 * ยอดส่วนลดจริงจากฐาน "ราคาก่อนหักส่วนลด" (ต้นทุนตรง + ค่าดำเนินการ/กำไร)
 *
 * ตัดไม่ให้เกินฐาน เพราะส่วนลดที่มากกว่าราคาจะทำให้ยอดสุทธิติดลบ แล้วไหลไปโผล่เป็นตัวเลขติดลบ
 * ทั้งในสัญญาและมูลค่าไปป์ไลน์บนแดชบอร์ด — ปิดที่ต้นทางนี้ที่เดียว
 */
export function resolveDiscountAmount(
  base: number,
  discount: DiscountInput | undefined,
): { percent: number | null; amount: number } {
  if (!discount) return { percent: null, amount: 0 };

  if (discount.percent != null) {
    assertNonNegative(discount.percent, "discountPercent");
    if (discount.percent > 100) throw new Error("discountPercent must be <= 100");
    return { percent: discount.percent, amount: round2(base * (discount.percent / 100)) };
  }

  if (discount.amount != null) {
    assertNonNegative(discount.amount, "discountAmount");
    return { percent: null, amount: Math.min(round2(discount.amount), base) };
  }

  return { percent: null, amount: 0 };
}

/**
 * ตัวคูณที่พับ "ทุกอย่างที่บวกทับต้นทุน" ไว้ในราคาต่อหน่วยของแต่ละบรรทัดฝั่งลูกค้า (BR-09)
 *
 * เอกสารฝั่งลูกค้าไม่แยกแถวต้นทุน/กำไรออกมา แต่โชว์ราคาต่อบรรทัดที่รวมแล้ว ตัวคูณจึงต้องครบ
 * ทุกชั้นที่อยู่เหนือต้นทุนตรง (เผื่อเหลือเผื่อขาด + ค่าดำเนินการ/กำไร) ไม่งั้นผลบวกทุกบรรทัด
 * จะไม่เท่ากับยอดก่อนลดที่พิมพ์อยู่ท้ายใบ
 */
export function customerLineMultiplier(version: { contingencyPct: unknown; overheadProfitPct: unknown }): number {
  const contingency = 1 + Number(version.contingencyPct ?? 0) / 100;
  return contingency * (1 + Number(version.overheadProfitPct) / 100);
}

/** ค่างานต้นทุน = ต้นทุนตรง + ค่าเผื่อเหลือเผื่อขาด */
function resolveBaseCost(directCost: number, percent: number) {
  assertNonNegative(percent, "contingencyPercent");
  const amount = round2(directCost * (percent / 100));
  return { percent, amount, baseCost: round2(directCost + amount) };
}

/**
 * BR-01..BR-06: ต้นทุนตรง -> เผื่อเหลือเผื่อขาด -> ค่าดำเนินการ/กำไร -> ส่วนลด -> VAT -> ราคาสุทธิ
 *
 * ส่วนลดหัก "ก่อน" VAT เสมอ ตามหลักภาษีไทย (ส่วนลดที่ให้ทันทีขณะขายไม่ต้องนำมารวมเป็นฐานภาษี)
 * ถ้าไปหักหลัง VAT จะเก็บ VAT เกินจริงและใบกำกับภาษีจะผิด
 */
function markupChain(
  directCost: number,
  overheadProfitPercent: number,
  vatPercent: number,
  discount: DiscountInput | undefined,
  contingencyPercent: number | null | undefined,
  roundingUnit: number | null | undefined,
) {
  assertNonNegative(overheadProfitPercent, "overheadProfitPercent");
  assertNonNegative(vatPercent, "vatPercent");
  // ไม่ได้ตั้งค่าเผื่อ = 0%
  const contingency = resolveBaseCost(directCost, contingencyPercent ?? 0);

  const overheadProfitAmount = round2(contingency.baseCost * (overheadProfitPercent / 100));
  const beforeDiscount = round2(contingency.baseCost + overheadProfitAmount);
  const resolved = resolveDiscountAmount(beforeDiscount, discount);
  const rounded = applyNetRounding(round2(beforeDiscount - resolved.amount), vatPercent, roundingUnit);

  return {
    contingency,
    overheadProfitPercent,
    overheadProfitAmount,
    resolved,
    roundingAmount: rounded.roundingAmount,
    subtotalBeforeVat: rounded.subtotalBeforeVat,
    vatPercent,
    vatAmount: rounded.vatAmount,
    netPrice: rounded.netPrice,
  };
}

export function calculatePricing(
  items: BoqLineInput[],
  overheadProfitPercent: number,
  vatPercent: number,
  houseAreaSqm?: number | null,
  discount?: DiscountInput,
  extras?: PricingExtras,
): PricingBreakdown {
  // ต้องบวกจาก "ยอดบรรทัดที่ปัดแล้ว" เท่านั้น ห้ามบวกค่าดิบแล้วค่อยปัดทีเดียวตอนท้าย —
  // ใบเสนอราคาพิมพ์ทั้งยอดรายบรรทัด (lineTotal ที่ปัดแล้ว) และยอดรวมนี้ในหน้าเดียวกัน
  // ถ้าคิดคนละวิธี ลูกค้าเอาเครื่องคิดเลขบวกคอลัมน์แล้วจะไม่ตรงกับยอดรวม (เคยเพี้ยนจริง 0.01 บาท)
  const directCost = round2(
    items.reduce((sum, item) => sum + calculateLineAmounts(item).lineTotal, 0),
  );

  const chain = markupChain(
    directCost,
    overheadProfitPercent,
    vatPercent,
    discount,
    extras?.contingencyPercent,
    extras?.roundingUnit,
  );

  return {
    directCost,
    contingencyPercent: chain.contingency.percent,
    contingencyAmount: chain.contingency.amount,
    baseCost: chain.contingency.baseCost,
    overheadProfitPercent: chain.overheadProfitPercent,
    overheadProfitAmount: chain.overheadProfitAmount,
    discountPercent: chain.resolved.percent,
    discountAmount: chain.resolved.amount,
    roundingUnit: extras?.roundingUnit ?? null,
    roundingAmount: chain.roundingAmount,
    subtotalBeforeVat: chain.subtotalBeforeVat,
    vatPercent: chain.vatPercent,
    vatAmount: chain.vatAmount,
    netPrice: chain.netPrice,
    pricePerSqm:
      houseAreaSqm != null && houseAreaSqm > 0 ? round2(chain.netPrice / houseAreaSqm) : null,
  };
}
