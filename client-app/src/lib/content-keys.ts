/**
 * key สำหรับรายการที่ไม่มี id และไม่สลับลำดับ (ตัวอักษรของป้าย · ช่องรหัสทีละหลัก · ข้อย่อย · ช่วงข้อความ)
 * ใช้เนื้อหาเป็น key แล้วเติมครั้งที่พบเมื่อซ้ำ แทนการใช้ลำดับในอาร์เรย์เป็น key ตรง ๆ
 */
export function contentKeys(labels: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return n === 1 ? label : `${label}#${n}`;
  });
}
