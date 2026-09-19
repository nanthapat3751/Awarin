import { parseIsoDate, todayIso, toIsoDate } from "./business-date";

/**
 * ยืนราคา + เงื่อนไขท้ายใบเสนอราคา
 *
 * หน้าตั้งค่าเก็บ "ค่าตั้งต้น" (กี่วัน / ข้อความเงื่อนไข) แล้วค่าทั้งสองถูกตรึงลงใบตอนกดส่ง
 * (Quote.validUntil / Quote.terms) — ไฟล์นี้เป็นฟังก์ชันล้วน ไม่แตะฐานข้อมูล
 */

export const QUOTE_VALIDITY_DAYS_KEY = "quoteValidityDays";
export const QUOTE_TERMS_KEY = "quoteTerms";

/** ยืนราคานานสุดที่ยอมให้ตั้ง — เกินปีราคาวัสดุขยับจนตัวเลขในใบไม่มีความหมายแล้ว */
export const MAX_QUOTE_VALIDITY_DAYS = 365;

/** ค่าในหน้าตั้งค่า → จำนวนวัน · ว่าง/เพี้ยน = ไม่กำหนดยืนราคา */
export function quoteValidityDaysFrom(settings: Record<string, string>): number | null {
  const raw = settings[QUOTE_VALIDITY_DAYS_KEY]?.trim();
  if (!raw) return null;
  const days = Number(raw);
  return Number.isInteger(days) && days >= 1 && days <= MAX_QUOTE_VALIDITY_DAYS ? days : null;
}

/** ข้อความเงื่อนไขที่จะตรึงลงใบ · ว่าง = null (ไม่พิมพ์หัวข้อเงื่อนไข) */
export function quoteTermsFrom(settings: Record<string, string>): string | null {
  const text = settings[QUOTE_TERMS_KEY]?.trim();
  return text || null;
}

/**
 * ข้อความเงื่อนไข → รายการทีละข้อ
 *
 * เอกสารใส่เลขข้อให้เอง — คนพิมพ์มักพิมพ์ "1." "2)" "-" "•" นำหน้ามาเองด้วย ถ้าไม่ตัดออก
 * จะได้ "1. 1. ชำระเงิน…" ซ้อนกันบนเอกสาร
 */
export function termLines(terms: string | null | undefined): string[] {
  if (!terms) return [];
  return terms
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:\d{1,2}\s*[.)]|[-•*])\s*/, "").trim())
    .filter((line) => line !== "");
}

/** "YYYY-MM-DD" + n วัน → "YYYY-MM-DD" (คิดบน UTC ล้วน จึงไม่เพี้ยนตามเขตเวลาของเครื่อง) */
export function addDaysIso(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  if (!date) throw new Error(`Invalid ISO date: ${iso}`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * วันสุดท้ายที่ยืนราคา นับจากวันที่ส่ง (ตามเวลาไทย) — ส่งวันที่ 1 ยืน 30 วัน = ถึงสิ้นวันที่ 31
 * คืนเป็น Date ที่เที่ยงคืน UTC สำหรับคอลัมน์ DATE
 */
export function validUntilFrom(days: number | null, sentOn: string = todayIso()): Date | null {
  if (days == null) return null;
  return parseIsoDate(addDaysIso(sentOn, days));
}

/**
 * พ้นกำหนดยืนราคาแล้วหรือยัง — วันที่ระบุยังนับว่ายืนราคาอยู่ทั้งวัน (เทียบกับ "วันนี้" ตามเวลาไทย
 * ไม่ใช่นาฬิกา UTC ของเซิร์ฟเวอร์ ไม่งั้นช่วงเที่ยงคืนถึงเจ็ดโมงเช้าใบจะหมดอายุช้าไปหนึ่งวัน)
 */
export function isQuoteExpired(validUntil: Date | null, today: string = todayIso()): boolean {
  const last = toIsoDate(validUntil);
  return last != null && last < today;
}
