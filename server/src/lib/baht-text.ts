/**
 * อ่านจำนวนเงินเป็นตัวหนังสือไทย — "2600000" → "สองล้านหกแสนบาทถ้วน"
 *
 * สัญญาและเอกสารการเงินของไทยต้องมีจำนวนเงินเป็นตัวหนังสือกำกับตัวเลขเสมอ เพื่อกันการแก้ตัวเลข
 * ภายหลัง (เติมเลข 0 ต่อท้ายทำได้ แต่แก้ตัวหนังสือให้เนียนทำไม่ได้) — ไม่มีฟังก์ชันนี้ในระบบมาก่อน
 */

const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/**
 * อ่านเลข 1–999,999 (ไม่รวมหลักล้าน)
 *
 * กฎพิเศษของภาษาไทยสามข้อที่ต้องดักเป็นกรณีเฉพาะ ไม่งั้นจะได้ "หนึ่งสิบหนึ่ง" แทน "สิบเอ็ด":
 *   หลักสิบเป็น 1 → "สิบ" (ไม่ใช่ "หนึ่งสิบ") · หลักสิบเป็น 2 → "ยี่สิบ" · หลักหน่วยเป็น 1 → "เอ็ด"
 */
function readBelowMillion(n: number): string {
  const s = String(n);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const digit = Number(s[i]);
    if (digit === 0) continue;
    const place = s.length - i - 1;
    if (place === 1 && digit === 1) out += "สิบ";
    else if (place === 1 && digit === 2) out += "ยี่สิบ";
    // "เอ็ด" ใช้เฉพาะตอนมีหลักอื่นนำหน้า — เลข 1 โดด ๆ ยังอ่านว่า "หนึ่ง"
    else if (place === 0 && digit === 1 && s.length > 1) out += "เอ็ด";
    else out += DIGITS[digit] + PLACES[place];
  }
  return out;
}

/** อ่านจำนวนเต็มทุกขนาด — เกินล้านตัดเป็นกลุ่มแล้วต่อด้วยคำว่า "ล้าน" ซ้อนกันไปเรื่อย ๆ */
function readInteger(n: number): string {
  if (n === 0) return "ศูนย์";
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  if (millions > 0) {
    return readInteger(millions) + "ล้าน" + (rest > 0 ? readBelowMillion(rest) : "");
  }
  return readBelowMillion(n);
}

/**
 * "หนึ่งล้านห้าหมื่นบาทถ้วน" / "หนึ่งพันห้าสิบเก้าบาทสามสิบสตางค์"
 *
 * ปัดเป็นสตางค์ก่อนแยกส่วน เพื่อไม่ให้เลขทศนิยมลอย ๆ อย่าง 0.1+0.2 ทำให้ได้ "เก้าสิบเก้าสตางค์"
 */
export function bahtText(amount: number): string {
  if (!Number.isFinite(amount)) throw new Error("amount must be a finite number");
  const negative = amount < 0;
  const totalSatang = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(totalSatang / 100);
  const satang = totalSatang % 100;

  const tail = satang > 0 ? `${readBelowMillion(satang)}สตางค์` : "ถ้วน";
  return `${negative ? "ลบ" : ""}${readInteger(baht)}บาท${tail}`;
}
