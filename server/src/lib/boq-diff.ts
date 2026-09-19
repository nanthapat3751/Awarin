import type { BoqDiffField, BoqDiffKind } from "@systemboq/shared-types";

/**
 * เทียบรายการ BOQ สองเวอร์ชัน — ตรรกะล้วน ไม่แตะ DB
 *
 * จับคู่สองชั้น:
 *   1. สายตระกูล (lineage) — บรรทัดที่ถูกคัดลอกต่อกันมาตอนแตกเวอร์ชัน (BoqItem.sourceItemId)
 *      ตัวเรียกไล่สายให้แล้วว่าบรรทัดใน "หลัง" สืบมาจากบรรทัดไหนใน "ก่อน" → จับคู่ได้แม้แก้ชื่อ
 *   2. บรรทัดที่ไม่มีสาย (คัดลอกก่อนระบบเก็บ sourceItemId) — จับด้วยวัสดุเดียวกันในหมวดเดียวกัน
 *      หรือชื่อ+หน่วยเดียวกัน ตามลำดับที่เจอ
 * ที่เหลือฝั่งหลัง = เพิ่มใหม่ · ที่เหลือฝั่งก่อน = ถูกลบ
 */
export interface DiffItem {
  id: string;
  /**
   * ฝั่ง "หลัง": id ของบรรทัดในเวอร์ชัน "ก่อน" ที่สายคัดลอกไล่ถึง · null = ไล่ไม่ถึง (เพิ่มใหม่
   * หรือสายขาดตรงบรรทัดที่คัดลอกก่อนมี sourceItemId) → ใช้การจับคู่ชั้นที่ 2 · ฝั่ง "ก่อน" ไม่ใช้
   */
  lineage: string | null;
  categoryId: string;
  materialId: string | null;
  name: string;
  unit: string;
  quantity: number;
  materialUnitPrice: number;
  laborUnitPrice: number;
  lineTotal: number;
  sortOrder: number;
}

export interface DiffResult {
  kind: BoqDiffKind;
  before: DiffItem | null;
  after: DiffItem | null;
  changed: BoqDiffField[];
}

function fallbackKey(i: DiffItem): string {
  return i.materialId ? `m:${i.materialId}|${i.categoryId}` : `c:${i.categoryId}|${i.name.trim()}|${i.unit.trim()}`;
}

// Decimal จาก DB แปลงเป็น number แล้ว — เทียบที่ความละเอียดของคอลัมน์ กันเศษ floating point
const same = (a: number, b: number, places: number) => Math.round(a * 10 ** places) === Math.round(b * 10 ** places);

export function changedFields(before: DiffItem, after: DiffItem): BoqDiffField[] {
  const fields: BoqDiffField[] = [];
  if (before.name.trim() !== after.name.trim()) fields.push("name");
  if (before.unit.trim() !== after.unit.trim()) fields.push("unit");
  if (!same(before.quantity, after.quantity, 3)) fields.push("quantity");
  if (!same(before.materialUnitPrice, after.materialUnitPrice, 2)) fields.push("materialUnitPrice");
  if (!same(before.laborUnitPrice, after.laborUnitPrice, 2)) fields.push("laborUnitPrice");
  return fields;
}

/** รอบแรก: จับคู่ตามสายคัดลอก (lineage) — แม่นที่สุดเพราะรู้แน่ว่าบรรทัดไหนคัดลอกมาจากไหน */
function pairByLineage(
  before: DiffItem[],
  after: DiffItem[],
  pairs: Map<DiffItem, DiffItem>,
  usedBefore: Set<DiffItem>,
): void {
  const byId = new Map(before.map((b) => [b.id, b]));
  for (const a of after) {
    const b = a.lineage ? byId.get(a.lineage) : undefined;
    if (b && !usedBefore.has(b)) {
      pairs.set(a, b);
      usedBefore.add(b);
    }
  }
}

/** รอบสอง: บรรทัดที่ยังไม่มีคู่ จับตามหมวด+ชื่อ+หน่วย ไล่ตามลำดับบรรทัด */
function pairByFallbackKey(
  before: DiffItem[],
  after: DiffItem[],
  pairs: Map<DiffItem, DiffItem>,
  usedBefore: Set<DiffItem>,
): void {
  const pool = new Map<string, DiffItem[]>();
  for (const b of [...before].sort((x, y) => x.sortOrder - y.sortOrder)) {
    if (usedBefore.has(b)) continue;
    const key = fallbackKey(b);
    pool.set(key, [...(pool.get(key) ?? []), b]);
  }
  for (const a of [...after].sort((x, y) => x.sortOrder - y.sortOrder)) {
    if (pairs.has(a)) continue;
    const candidates = pool.get(fallbackKey(a));
    const b = candidates?.shift();
    if (b) {
      pairs.set(a, b);
      usedBefore.add(b);
    }
  }
}

export function diffBoqItems(before: DiffItem[], after: DiffItem[]): DiffResult[] {
  const pairs = new Map<DiffItem, DiffItem>(); // after → before
  const usedBefore = new Set<DiffItem>();
  pairByLineage(before, after, pairs, usedBefore);
  pairByFallbackKey(before, after, pairs, usedBefore);

  const results: DiffResult[] = after.map((a) => {
    const b = pairs.get(a);
    if (!b) return { kind: "added", before: null, after: a, changed: [] };
    const changed = changedFields(b, a);
    return { kind: changed.length ? "changed" : "unchanged", before: b, after: a, changed };
  });
  for (const b of before) {
    if (!usedBefore.has(b)) results.push({ kind: "removed", before: b, after: null, changed: [] });
  }
  return results;
}
