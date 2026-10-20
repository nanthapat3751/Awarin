/** ตัวเลขเงิน 2 ตำแหน่งมีลูกน้ำ — ใช้ทุกที่ที่โชว์ยอดเงินให้ลูกค้า */
export const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** วันที่ล้วน (YYYY-MM-DD) — อ่านเป็น UTC ให้ตรงกับคอลัมน์ DATE ที่เซิร์ฟเวอร์เก็บ */
export function thaiDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
