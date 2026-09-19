import type { WorkCategoryDto } from "@systemboq/shared-types";

export function buildCategoryPath(id: string, byId: Map<string, WorkCategoryDto>): string {
  const parts: string[] = [];
  let current: WorkCategoryDto | undefined = byId.get(id);
  while (current) {
    parts.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return parts.join(" > ");
}

export interface CategoryParts {
  /** หมวดใหญ่ระดับบนสุด (CATEGORY) — ใช้ทำ badge สี */
  top: WorkCategoryDto | null;
  /** หมวดย่อยระดับกลาง (SUBGROUP) — ใช้เป็นข้อความบรรทัดรอง */
  sub: WorkCategoryDto | null;
  /** งานย่อยล่างสุด (ITEM) — มักซ้ำกับชื่อรายการ จึงตัดออกจากการแสดงผลในตาราง */
  leaf: WorkCategoryDto | null;
}

/**
 * ไล่หมวดจาก id (ระดับ ITEM) ขึ้นไปถึงราก แล้วแยกออกเป็น หมวดใหญ่ / หมวดย่อย / งานย่อยล่างสุด
 * เพื่อให้ตารางแสดงเป็น "badge หมวดใหญ่ + หมวดย่อยตัวเล็ก" โดยไม่ต้องโชว์ path ยาวเต็ม ๆ ที่
 * segment สุดท้ายมักซ้ำกับชื่อรายการ
 */
export function categoryParts(id: string, byId: Map<string, WorkCategoryDto>): CategoryParts {
  const chain: WorkCategoryDto[] = [];
  let current: WorkCategoryDto | undefined = byId.get(id);
  while (current) {
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return {
    top: chain[0] ?? null,
    sub: chain.length >= 2 ? chain[1] : null,
    leaf: chain.at(-1) ?? null,
  };
}
