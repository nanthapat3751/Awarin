import type { BoqItem } from "@prisma/client";

import { BOQ_ITEM_ORDER } from "./boq-order";
import { prisma } from "./prisma";

/**
 * บรรทัด BOQ พร้อมรหัสงานของหมวดระดับ ITEM ที่มันสังกัดอยู่ เช่น "B-02-01"
 * + หมวดย่อย (ชั้นถัดจากหมวดบนสุด เช่น B-04 งานฐานราก) — null = บรรทัดอยู่ตรงหมวดใหญ่
 */
export type BoqGroupedItem = BoqItem & {
  categoryCode: string | null;
  subgroup: { id: string; code: string | null; name: string } | null;
};

export interface BoqCategoryGroup {
  categoryLabel: string;
  categoryName: string;
  items: BoqGroupedItem[];
}

/**
 * จัดกลุ่มรายการ BOQ ของโปรเจกต์เวอร์ชันหนึ่ง ตามหมวดงานระดับบนสุด (A, B, C, ...)
 * เรียงตาม sortOrder ของหมวดเอง ใช้ร่วมกันทั้งตัวสร้าง PDF ฝั่งพนักงานและฝั่งลูกค้า
 * เพื่อให้เอกสารทั้งสองแสดงหมวดในลำดับเดียวกัน (เดิมเคยเขียนซ้ำสองที่แล้วลำดับหมวดเพี้ยน
 * จึงรวมมาไว้ที่เดียว)
 */
export async function groupBoqItemsByTopCategory(
  projectVersionId: string,
): Promise<BoqCategoryGroup[]> {
  const items = await prisma.boqItem.findMany({
    where: { projectVersionId },
    orderBy: BOQ_ITEM_ORDER,
  });
  if (items.length === 0) return [];

  const categories = await prisma.workCategory.findMany();
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  function topAncestor(categoryId: string) {
    let current = categoryById.get(categoryId);
    while (current?.parentId) {
      const parent = categoryById.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
    return current;
  }

  /** ชั้นที่อยู่ใต้หมวดบนสุดพอดี (แบบเดียวกับแถบหมวดย่อยในหน้าโครงการ) — บรรทัดที่ผูกกับหมวดบนสุดตรง ๆ = null */
  function subgroupOf(categoryId: string) {
    let node = categoryById.get(categoryId);
    while (node?.parentId) {
      const parent = categoryById.get(node.parentId);
      if (!parent?.parentId) break;
      node = parent;
    }
    if (!node?.parentId || node.id === categoryId) return null;
    return { id: node.id, code: node.code, name: node.name };
  }

  const groupsByTopId = new Map<string, BoqCategoryGroup>();
  const topSortOrder = new Map<string, number>();
  const order: string[] = [];

  for (const item of items) {
    const top = topAncestor(item.categoryId);
    const topId = top?.id ?? "uncategorized";

    if (!groupsByTopId.has(topId)) {
      groupsByTopId.set(topId, {
        categoryLabel: top?.code ?? "-",
        categoryName: top?.name ?? "ไม่ระบุหมวด",
        items: [],
      });
      topSortOrder.set(topId, top?.sortOrder ?? Number.MAX_SAFE_INTEGER);
      order.push(topId);
    }

    groupsByTopId.get(topId)!.items.push({
      ...item,
      categoryCode: categoryById.get(item.categoryId)?.code ?? null,
      subgroup: subgroupOf(item.categoryId),
    });
  }

  const sortedOrder = [...order].sort((a, b) => topSortOrder.get(a)! - topSortOrder.get(b)!);
  return sortedOrder.map((topId) => groupsByTopId.get(topId)!);
}
