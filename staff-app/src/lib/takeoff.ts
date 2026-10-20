import type { ProjectOpeningDto, TakeoffRowDto, TakeoffRowInput } from "@systemboq/shared-types";

/** แถวใบถอดแบบจาก API (ทศนิยมเป็นข้อความ) → แถวสำหรับส่งกลับ/คิดยอด */
export function takeoffInputsOf(rows: TakeoffRowDto[]): TakeoffRowInput[] {
  const n = (v: string | null) => (v == null ? null : Number(v));
  return rows.map((r) => ({
    label: r.label,
    count: Number(r.count),
    length: n(r.length),
    width: n(r.width),
    height: n(r.height),
    barDia: r.barDia,
    deduct: r.deduct,
    // แถวจากตัวคิดชิ้นส่วน — ส่งกลับไปด้วย ไม่งั้นแก้ใบทีเดียวความผูกพันกับชิ้นส่วนหาย
    memberKey: r.memberKey,
  }));
}

/** ยอดรวมช่องเปิด (ตร.ม.) — ตรงกับที่เซิร์ฟเวอร์คิด (ปัด 2 ตำแหน่ง) */
export function openingsTotal(openings: ProjectOpeningDto[]): number {
  return Math.round(openings.reduce((s, o) => s + o.count * o.width * o.height, 0) * 100) / 100;
}
