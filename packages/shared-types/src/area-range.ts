/**
 * ช่วงพื้นที่ใช้สอยที่ลูกค้าเลือกในฟอร์มติดต่อ (งานออกแบบ/ก่อสร้าง) — ผู้ใช้เลือกแบบนี้ 16 ต.ค. 2026
 *
 * บังคับเลือกหนึ่งอย่าง (ช่วง หรือ "ยังไม่ทราบ" หรือพิมพ์ตัวเลขเอง) เพื่อให้พนักงานรู้ขนาดงานคร่าว ๆ
 * ก่อนโทรกลับ โดยไม่บังคับให้ลูกค้าเดาตัวเลข · **ช่วงไม่ถูกเติมลงพื้นที่ของโครงการ** — พื้นที่โครงการ
 * ขับการถอดปริมาณ BOQ ต้องเป็นตัวเลขจริงที่พนักงานยืนยันแล้วเท่านั้น
 */
export const AREA_RANGES = [
  { value: "LT100", label: "ต่ำกว่า 100 ตร.ม." },
  { value: "100_200", label: "100–200 ตร.ม." },
  { value: "200_300", label: "200–300 ตร.ม." },
  { value: "GT300", label: "มากกว่า 300 ตร.ม." },
  { value: "UNKNOWN", label: "ยังไม่ทราบ" },
] as const;

export type AreaRange = (typeof AREA_RANGES)[number]["value"];

export const AREA_RANGE_VALUES = AREA_RANGES.map((r) => r.value) as [AreaRange, ...AreaRange[]];

export function isAreaRange(value: unknown): value is AreaRange {
  return typeof value === "string" && (AREA_RANGE_VALUES as string[]).includes(value);
}

/** ชื่อช่วงสำหรับแสดงผล — ค่าที่ไม่รู้จัก (ข้อมูลเก่า/ผิด) = null ไม่แสดงอะไร */
export function areaRangeLabel(value: string | null | undefined): string | null {
  return AREA_RANGES.find((r) => r.value === value)?.label ?? null;
}
