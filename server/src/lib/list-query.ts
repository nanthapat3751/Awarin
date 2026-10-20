// ตัวช่วยของหน้ารายการที่แบ่งหน้าที่เซิร์ฟเวอร์ (โครงการ / คำขอลูกค้า) — อ่านค่าจาก query string
// ที่มาจาก URL ของเบราว์เซอร์ตรง ๆ จึงต้องทนค่าเพี้ยนทุกตัว (ค่าผิด = เหมือนไม่ได้ส่ง ไม่ใช่ error)

/** มาตรฐานของทั้งระบบ: หน้าละ 15 รายการ */
export const LIST_PAGE_SIZE = 15;

const BANGKOK_OFFSET_MS = 7 * 60 * 60_000;

/**
 * ช่วงเวลาตามปฏิทินไทย (เวลาไทย ไม่มี DST) → ช่วง UTC สำหรับกรอง createdAt
 * year เป็น ค.ศ. · month 1–12 ไม่ส่ง = ทั้งปี · ค่าเพี้ยน = ไม่กรอง (null)
 */
export function createdPeriod(yearRaw: unknown, monthRaw: unknown): { gte: Date; lt: Date } | null {
  const year = Number(yearRaw);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return null;
  const month = monthRaw == null || monthRaw === "" ? null : Number(monthRaw);
  if (month == null || !Number.isInteger(month) || month < 1 || month > 12) {
    return {
      gte: new Date(Date.UTC(year, 0, 1) - BANGKOK_OFFSET_MS),
      lt: new Date(Date.UTC(year + 1, 0, 1) - BANGKOK_OFFSET_MS),
    };
  }
  return {
    gte: new Date(Date.UTC(year, month - 1, 1) - BANGKOK_OFFSET_MS),
    lt: new Date(Date.UTC(year, month, 1) - BANGKOK_OFFSET_MS),
  };
}

/** เลขหน้าที่ใช้จริง — ค่าเพี้ยน = 1 · เกินหน้าสุดท้าย = หน้าสุดท้าย (ไม่ส่งหน้าว่างกลับไป) */
export function clampPage(requested: unknown, total: number, pageSize = LIST_PAGE_SIZE): number {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.floor(Number(requested));
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, lastPage);
}

/** คำค้น: ตัดช่องว่าง · ว่าง = ไม่ค้น · ยาวเกินตัดทิ้ง (กันคำค้นยาวผิดปกติไปถ่วงฐานข้อมูล) */
export function searchText(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const q = raw.trim().slice(0, 100);
  return q || undefined;
}
