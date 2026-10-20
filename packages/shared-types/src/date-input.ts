// ช่องวันที่แบบ วว/ดด/ปปปป (พ.ศ.) + ปฏิทินไทย — ตัวแปลงที่ใช้ร่วมกันทั้งสองแอป
//
// ทำไมไม่ใช้ <input type="date">: เบราว์เซอร์จัดรูปแบบตามภาษาของเครื่อง เว็บสั่งไม่ได้ เครื่องที่ตั้ง
// อังกฤษแบบอเมริกาจะขึ้น ดด/วว/ปปปป (10/24/2026 = 24 ต.ค.) คนไทยอ่านสลับวันกับเดือน
// และปฏิทินที่เด้งขึ้นเป็นภาษาอังกฤษ ค.ศ. (ผู้ใช้เลือกปฏิทินไทยแบบ A + ปี พ.ศ. ทั้งหมด 17 ต.ค.)
// ค่าที่เก็บ/ส่งเซิร์ฟเวอร์ยังเป็น YYYY-MM-DD (ค.ศ.) เหมือนเดิมทุกอย่าง — เปลี่ยนแค่ที่ตาเห็น

/** ปีที่ห่างกันระหว่าง พ.ศ. กับ ค.ศ. */
export const BE_OFFSET = 543;

export const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
] as const;

export const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
] as const;

/** วันในสัปดาห์ เริ่มวันอาทิตย์แบบปฏิทินไทยทั่วไป */
export const THAI_WEEKDAYS_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

/** "2026-10-24" → "24/10/2569" (ปี พ.ศ.) · ค่าว่างหรือรูปแบบผิด → "" */
export function isoToDmy(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${Number(m[1]) + BE_OFFSET}` : "";
}

/** จัดตัวเลขที่พิมพ์ให้เป็น วว/ดด/ปปปป ระหว่างพิมพ์ (ใส่ / ให้เอง ตัดตัวที่ไม่ใช่ตัวเลข) */
export function maskDmy(text: string): string {
  const d = text.replace(/\D/g, "").slice(0, 8);
  let out = d.slice(0, 2);
  if (d.length > 2) out += `/${d.slice(2, 4)}`;
  if (d.length > 4) out += `/${d.slice(4, 8)}`;
  return out;
}

/**
 * "24/10/2569" → "2026-10-24" · ยังพิมพ์ไม่ครบหรือไม่ใช่วันที่จริง (31/02) → null
 * ปีตั้งแต่ 2400 = พ.ศ. (แปลงเป็น ค.ศ.) · ต่ำกว่านั้น = ค.ศ. — คนที่ติดมือพิมพ์ 2026 ก็ยังใช้ได้
 */
export function dmyToIso(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year >= 2400) year -= BE_OFFSET;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** วันนี้ตามเวลาเครื่อง (ไม่ใช่ UTC — ตี 1 ของไทยยังเป็นวันเดียวกัน) เป็น YYYY-MM-DD */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** "2026-10" → "ตุลาคม 2569" · รูปแบบผิด → "" */
export function monthLabelTh(ym: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym ?? "");
  if (!m) return "";
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? `${THAI_MONTHS[month - 1]} ${Number(m[1]) + BE_OFFSET}` : "";
}

export interface CalendarDay {
  iso: string;
  day: number;
  /** อยู่ในเดือนที่กำลังดู (false = วันท้ายเดือนก่อน/ต้นเดือนถัดไปที่เติมให้ครบแถว) */
  inMonth: boolean;
}

/**
 * ตารางวันของเดือนหนึ่ง (month0 = 0-11) — 6 แถว × 7 วันเสมอ เริ่มวันอาทิตย์
 * จำนวนแถวคงที่ให้ปฏิทินสูงเท่ากันทุกเดือน กดเปลี่ยนเดือนแล้วปุ่มไม่ขยับหนีเมาส์
 */
export function calendarWeeks(year: number, month0: number): CalendarDay[][] {
  const first = new Date(Date.UTC(year, month0, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + w * 7 + d);
      row.push({
        iso: `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`,
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === month0,
      });
    }
    weeks.push(row);
  }
  return weeks;
}

/** เลื่อนวันที่ YYYY-MM-DD ไป n วัน (ลบได้) */
export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}
