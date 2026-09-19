// ตรรกะการคิดราคาล้วน ๆ (BR-01..BR-06 ใน MASTER_PROMPT.md §5) ไม่มีการเข้าถึง DB ที่นี่
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

export interface PricingBreakdown {
  directCost: number;
  overheadProfitPercent: number;
  overheadProfitAmount: number;
  /** เปอร์เซ็นต์ส่วนลด ถ้าลดเป็น % — null คือลดเป็นจำนวนเงินคงที่ หรือไม่ลด */
  discountPercent: number | null;
  discountAmount: number;
  /** ฐานคิด VAT = ต้นทุนตรง + ค่าดำเนินการ/กำไร − ส่วนลด */
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
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
 * BR-01..BR-06: ต้นทุนตรง -> ค่าดำเนินการ/กำไร -> ส่วนลด -> VAT -> ราคาสุทธิ -> ราคาต่อตารางเมตร
 *
 * ส่วนลดหัก "ก่อน" VAT เสมอ ตามหลักภาษีไทย (ส่วนลดที่ให้ทันทีขณะขายไม่ต้องนำมารวมเป็นฐานภาษี)
 * ถ้าไปหักหลัง VAT จะเก็บ VAT เกินจริงและใบกำกับภาษีจะผิด
 */
export function calculatePricing(
  items: BoqLineInput[],
  overheadProfitPercent: number,
  vatPercent: number,
  houseAreaSqm?: number | null,
  discount?: DiscountInput,
): PricingBreakdown {
  assertNonNegative(overheadProfitPercent, "overheadProfitPercent");
  assertNonNegative(vatPercent, "vatPercent");

  const directCost = round2(
    items.reduce((sum, item) => {
      assertValidLine(item);
      return sum + item.quantity * item.materialUnitPrice + item.quantity * item.laborUnitPrice;
    }, 0),
  );

  const overheadProfitAmount = round2(directCost * (overheadProfitPercent / 100));
  const beforeDiscount = round2(directCost + overheadProfitAmount);
  const resolved = resolveDiscountAmount(beforeDiscount, discount);
  const subtotalBeforeVat = round2(beforeDiscount - resolved.amount);
  const vatAmount = round2(subtotalBeforeVat * (vatPercent / 100));
  const netPrice = round2(subtotalBeforeVat + vatAmount);
  const pricePerSqm =
    houseAreaSqm != null && houseAreaSqm > 0 ? round2(netPrice / houseAreaSqm) : null;

  return {
    directCost,
    overheadProfitPercent,
    overheadProfitAmount,
    discountPercent: resolved.percent,
    discountAmount: resolved.amount,
    subtotalBeforeVat,
    vatPercent,
    vatAmount,
    netPrice,
    pricePerSqm,
  };
}
