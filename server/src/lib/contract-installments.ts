import { round2 } from "./pricing";

/**
 * งวดการชำระเงินของสัญญา (ข้อ 7)
 *
 * เดิมยอดแต่ละงวดเป็นข้อความที่พนักงานพิมพ์เอง ระบบไม่มีทางรู้ว่ารวมแล้วเท่ามูลค่าสัญญาหรือไม่
 * — ไฟล์ Word เดิมก็ไม่รู้ ทำให้ความผิดพลาดหลักแสนหลุดไปถึงลูกค้าได้โดยไม่มีอะไรดักเลย
 */

export interface InstallmentInput {
  milestone: string;
  amount: number;
}

/**
 * งวดมาตรฐานของบ้านพักอาศัย — เงื่อนไขงานถอดมาจากสัญญาจริงของบริษัท
 * (บ้านคุณปวีณา แสงกล้า: 520k / 390k / 390k / 520k / 442k / 260k / 78k จาก 2.6 ล้าน)
 */
export const DEFAULT_INSTALLMENT_PLAN: { milestone: string; percent: number }[] = [
  { milestone: "เซ็นสัญญา แล้วเสร็จ", percent: 20 },
  { milestone: "ตอกเข็ม ทำฐานราก ทำคานชั้น 1 วางแผ่นพื้นชั้น 1 ทำเสาชั้น 1 แล้วเสร็จ", percent: 15 },
  { milestone: "ทำคานชั้น 2 วางแผ่นพื้นชั้น 2 ทำเสาชั้น 2 ขึ้นโครงหลังคา แล้วเสร็จ", percent: 15 },
  { milestone: "ทำการมุงหลังคา ก่ออิฐ ติดตั้งวงกบ แล้วเสร็จ", percent: 20 },
  { milestone: "ทำการฉาบปูน ตีฝ้า เดินสายไฟร้อยท่อ แล้วเสร็จ", percent: 17 },
  { milestone: "ทำการทาสี ติดตั้งประตู ติดตั้งหน้าต่าง ติดตั้งราวบันได แล้วเสร็จ", percent: 10 },
  { milestone: "เก็บงานทั้งหมดพร้อมส่งงาน", percent: 3 },
];

/**
 * แบ่งยอดตามเปอร์เซ็นต์ให้รวมกลับมาได้ "เท่าเดิมเป๊ะ"
 *
 * ปัดทีละงวดแล้วบวกกันมักขาด/เกินไปไม่กี่สตางค์ (เช่น 3 งวดจาก 100 บาทที่ 33.33%)
 * งวดสุดท้ายจึงรับเศษที่เหลือทั้งหมดแทนการปัดของตัวเอง — ยอดรวมจะตรงเสมอโดยไม่ต้องเชื่อการปัด
 */
export function splitByPercent(
  total: number,
  plan: { milestone: string; percent: number }[],
): InstallmentInput[] {
  if (plan.length === 0) return [];
  const rounded = round2(total);
  const head = plan.slice(0, -1).map((p) => ({
    milestone: p.milestone,
    amount: round2(rounded * (p.percent / 100)),
  }));
  const used = round2(head.reduce((sum, i) => sum + i.amount, 0));
  const last = plan.at(-1);
  return [...head, { milestone: last?.milestone ?? "", amount: round2(rounded - used) }];
}

export function installmentTotal(items: { amount: number }[]): number {
  return round2(items.reduce((sum, i) => sum + i.amount, 0));
}

/** ข้อความอธิบายว่ายอดรวมยังไม่ตรง — null = ตรงแล้ว */
export function installmentMismatch(items: { amount: number }[], contractAmount: number): string | null {
  const sum = installmentTotal(items);
  const target = round2(contractAmount);
  if (sum === target) return null;
  const diff = round2(target - sum);
  const money = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return diff > 0
    ? `ยอดงวดรวม ${money(sum)} บาท ยังขาดอีก ${money(diff)} บาท จึงจะครบมูลค่าสัญญา ${money(target)} บาท`
    : `ยอดงวดรวม ${money(sum)} บาท เกินมูลค่าสัญญา ${money(target)} บาท อยู่ ${money(-diff)} บาท`;
}
