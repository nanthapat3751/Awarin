import type {
  BoqDiffLineValuesDto,
  BoqPriceDriftDto,
  BoqPriceDriftLineDto,
  BoqVersionDiffDto,
  BoqVersionSummaryDto,
} from "@systemboq/shared-types";

import { BOQ_ITEM_ORDER } from "../../lib/boq-order";
import { writeAuditLog } from "../../lib/audit-log";
import { diffBoqItems, type DiffItem } from "../../lib/boq-diff";
import { calculateLineAmounts, deriveMaterialUnitPrice, round2 } from "../../lib/pricing";
import { prisma } from "../../lib/prisma";
import {
  BoqError,
  assertNotCustom,
  getLatestVersion,
  getOrCreateEditableVersion,
  isVersionQuoted,
  loadProjectOrThrow,
  recalculateVersion,
} from "./boq.service";

/**
 * สองเรื่องที่ช่วยพนักงาน "ทบทวน" ราคาใน BOQ — ไม่ได้เปลี่ยนสูตรคิดราคาใด ๆ:
 *   1. เทียบสองเวอร์ชัน (ลูกค้าถามว่าฉบับก่อนกับฉบับนี้ต่างกันตรงไหน)
 *   2. ราคาในคลังวัสดุเปลี่ยนหลังจากตั้งราคาในโครงการ (ราคาใน BOQ ถูกตรึงไว้โดยตั้งใจ —
 *      ถ้าไม่มีอะไรบอก โครงการที่ยังไม่ส่งก็จะใช้ราคาเก่าไปโดยไม่มีใครรู้)
 */

// ---------- ราคาในคลังเปลี่ยน ----------

/** ยังตกลงราคากันไม่จบ — สถานะอื่น (อนุมัติ/เสร็จ/ยกเลิก) ห้ามชวนให้ไปแตะราคา */
const OPEN_STATUSES = new Set(["DRAFT", "QUOTED", "REJECTED"]);

type ItemWithComponents = Awaited<ReturnType<typeof loadItems>>[number];

function loadItems(where: { projectVersionId: string; id?: { in: string[] }; sourceItemId?: { in: string[] } }) {
  return prisma.boqItem.findMany({
    where,
    orderBy: BOQ_ITEM_ORDER,
    include: { components: { orderBy: { sortOrder: "asc" } } },
  });
}

type CatalogMaterial = { id: string; materialUnitPrice: unknown; laborUnitPrice: unknown; priceChangedAt: Date };

async function loadCatalog(items: ItemWithComponents[]): Promise<Map<string, CatalogMaterial>> {
  const ids = new Set<string>();
  for (const i of items) {
    if (i.materialId) ids.add(i.materialId);
    for (const c of i.components) if (c.componentMaterialId) ids.add(c.componentMaterialId);
  }
  if (ids.size === 0) return new Map();
  // วัสดุที่อยู่ในถังขยะไม่ถือเป็น "ราคาปัจจุบัน" — บรรทัดนั้นคงราคาเดิม
  const rows = await prisma.material.findMany({
    where: { id: { in: [...ids] }, deletedAt: null },
    select: { id: true, materialUnitPrice: true, laborUnitPrice: true, priceChangedAt: true },
  });
  return new Map(rows.map((m) => [m.id, m]));
}

interface CatalogPrice {
  materialUnitPrice: number;
  laborUnitPrice: number;
  /** ราคาต่อหน่วยวัสดุย่อยตามคลัง เรียงตามแถว components ของบรรทัด */
  componentPrices: number[];
  componentChanges: BoqPriceDriftLineDto["components"];
  /** เวลาที่ราคาในคลังเปลี่ยนล่าสุด นับเฉพาะแหล่งที่ราคา "ต่างจริง" (Material.priceChangedAt) */
  changedAt: Date | null;
}

/**
 * ราคาที่บรรทัดนี้ "ควรเป็น" ถ้าตั้งจากคลังตอนนี้ — null = ไม่มีอะไรในคลังให้เทียบ
 *
 * บรรทัดที่แตกสูตรวัสดุ: ไล่ราคาจาก "วัสดุดิบ" ของแต่ละแถว ไม่ใช่ราคาก้อนของวัสดุแม่ เพราะสูตรใน
 * คลังเองก็ตรึงราคาวัสดุดิบไว้ — ปูนขึ้นราคาแล้วราคาก้อนของ "คอนกรีต 1 ม³" ในคลังไม่ขยับตาม
 * สูตร (ปริมาณต่อหน่วย/เผื่อเสีย) ของบรรทัดคงเดิม เปลี่ยนแค่ราคาต่อหน่วย
 */
/** ราคาวัสดุย่อยตามคลังของบรรทัดที่แตกสูตร — วันที่ที่ราคาต่างจริงถูกเติมลง changedDates */
function componentCatalogPrices(
  item: ItemWithComponents,
  catalog: Map<string, CatalogMaterial>,
  changedDates: Date[],
) {
  const componentPrices: number[] = [];
  const componentChanges: CatalogPrice["componentChanges"] = [];
  let hasSource = false;
  for (const c of item.components) {
    const raw = c.componentMaterialId ? catalog.get(c.componentMaterialId) : undefined;
    const from = Number(c.unitPrice);
    const to = raw ? Number(raw.materialUnitPrice) : from;
    if (raw) hasSource = true;
    if (raw && round2(to) !== round2(from)) {
      changedDates.push(raw.priceChangedAt);
      componentChanges.push({ name: c.name, unit: c.unit, from: from.toFixed(2), to: to.toFixed(2) });
    }
    componentPrices.push(to);
  }
  const materialUnitPrice = deriveMaterialUnitPrice(
    item.components.map((c, idx) => ({
      qtyPerUnit: Number(c.qtyPerUnit),
      wasteFactorPct: c.wasteFactorPct == null ? null : Number(c.wasteFactorPct),
      unitPrice: componentPrices[idx],
    })),
  );
  return { materialUnitPrice, componentPrices, componentChanges, hasSource };
}

function catalogPriceOf(item: ItemWithComponents, catalog: Map<string, CatalogMaterial>): CatalogPrice | null {
  const parent = item.materialId ? catalog.get(item.materialId) : undefined;
  const changedDates: Date[] = [];
  const currentMaterial = Number(item.materialUnitPrice);
  const currentLabor = Number(item.laborUnitPrice);

  let laborUnitPrice = currentLabor;
  if (parent) {
    laborUnitPrice = Number(parent.laborUnitPrice);
    if (round2(laborUnitPrice) !== round2(currentLabor)) changedDates.push(parent.priceChangedAt);
  }

  let materialUnitPrice: number;
  let componentPrices: number[] = [];
  let componentChanges: CatalogPrice["componentChanges"] = [];
  let hasSource = Boolean(parent);

  if (item.components.length > 0) {
    const fromComponents = componentCatalogPrices(item, catalog, changedDates);
    ({ materialUnitPrice, componentPrices, componentChanges } = fromComponents);
    hasSource ||= fromComponents.hasSource;
  } else if (parent) {
    materialUnitPrice = Number(parent.materialUnitPrice);
    if (round2(materialUnitPrice) !== round2(currentMaterial)) changedDates.push(parent.priceChangedAt);
  } else {
    return null;
  }

  if (!hasSource) return null;
  const changedAt = changedDates.length ? new Date(Math.max(...changedDates.map((d) => d.getTime()))) : null;
  return { materialUnitPrice, laborUnitPrice, componentPrices, componentChanges, changedAt };
}

function differs(item: ItemWithComponents, price: CatalogPrice): boolean {
  return (
    round2(price.materialUnitPrice) !== round2(Number(item.materialUnitPrice)) ||
    round2(price.laborUnitPrice) !== round2(Number(item.laborUnitPrice))
  );
}

/**
 * บรรทัดที่ต้องเตือน = ราคาต่างจากคลัง และคลังเปลี่ยน "หลัง" จากที่ตั้งราคาบรรทัดนี้
 * (ราคาที่พนักงานพิมพ์เองให้ต่างจากคลังตั้งแต่แรก ไม่ต้องเตือนซ้ำทุกครั้งที่เปิดหน้า)
 * บรรทัดเก่าที่ไม่มี pricedAt → ไม่รู้ลำดับ เตือนเมื่อต่าง
 */
function isDrifted(item: ItemWithComponents, price: CatalogPrice): boolean {
  if (!differs(item, price) || !price.changedAt) return false;
  return item.pricedAt == null || price.changedAt > item.pricedAt;
}

export async function getPriceDrift(projectId: string): Promise<BoqPriceDriftDto> {
  const project = await loadProjectOrThrow(projectId);
  const empty: BoqPriceDriftDto = { applicable: false, versionQuoted: false, lines: [], directCostDelta: "0.00" };
  if (project.type === "CUSTOM" || !OPEN_STATUSES.has(project.status)) return empty;

  const version = await getLatestVersion(projectId);
  const items = await loadItems({ projectVersionId: version.id });
  const catalog = await loadCatalog(items);

  const lines: BoqPriceDriftLineDto[] = [];
  let delta = 0;
  for (const item of items) {
    const price = catalogPriceOf(item, catalog);
    if (!price || !isDrifted(item, price)) continue;
    const quantity = Number(item.quantity);
    const next = calculateLineAmounts({
      quantity,
      materialUnitPrice: price.materialUnitPrice,
      laborUnitPrice: price.laborUnitPrice,
    });
    delta += next.lineTotal - Number(item.lineTotal);
    lines.push({
      itemId: item.id,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity.toString(),
      current: {
        materialUnitPrice: Number(item.materialUnitPrice).toFixed(2),
        laborUnitPrice: Number(item.laborUnitPrice).toFixed(2),
        lineTotal: Number(item.lineTotal).toFixed(2),
      },
      catalog: {
        materialUnitPrice: price.materialUnitPrice.toFixed(2),
        laborUnitPrice: price.laborUnitPrice.toFixed(2),
        lineTotal: next.lineTotal.toFixed(2),
      },
      components: price.componentChanges,
      catalogUpdatedAt: price.changedAt!.toISOString(),
      pricedAt: item.pricedAt?.toISOString() ?? null,
    });
  }

  return {
    applicable: true,
    versionQuoted: await isVersionQuoted(version.id),
    lines,
    directCostDelta: round2(delta).toFixed(2),
  };
}

/** itemIds ต้องเป็นบรรทัดของเวอร์ชันล่าสุดทั้งหมด — ไม่ใช่ = หน้าจอค้างข้อมูลเก่า */
async function assertLatestItems(projectId: string, itemIds: string[]) {
  const latest = await getLatestVersion(projectId);
  const found = await prisma.boqItem.count({ where: { projectVersionId: latest.id, id: { in: itemIds } } });
  if (found !== new Set(itemIds).size) {
    throw new BoqError("รายการ BOQ เปลี่ยนไปแล้ว กรุณาโหลดหน้านี้ใหม่", 409);
  }
  return latest;
}

async function assertOpenProject(projectId: string) {
  const project = await loadProjectOrThrow(projectId);
  assertNotCustom(project);
  if (!OPEN_STATUSES.has(project.status)) {
    throw new BoqError("โครงการนี้ตกลงราคาแล้ว ไม่อัปเดตราคาตามคลัง", 409);
  }
}

/**
 * อัปเดตบรรทัดที่เลือกให้ใช้ราคาในคลังตอนนี้ — ผ่านกฎ BR-07 เหมือนการแก้ BOQ ทุกทาง:
 * เวอร์ชันที่ส่งเป็นใบเสนอราคาแล้วจะถูกแตกเป็นเวอร์ชันใหม่ ใบที่ส่งไปไม่เปลี่ยน
 * (id ที่หน้าจอส่งมาเป็นของเวอร์ชันเดิม → แปลงผ่าน sourceItemId)
 */
export async function applyCatalogPrices(projectId: string, itemIds: string[], actorId: string) {
  await assertOpenProject(projectId);
  const latest = await assertLatestItems(projectId, itemIds);
  const version = await getOrCreateEditableVersion(projectId, actorId);
  const items = await loadItems(
    version.id === latest.id
      ? { projectVersionId: version.id, id: { in: itemIds } }
      : { projectVersionId: version.id, sourceItemId: { in: itemIds } },
  );
  const catalog = await loadCatalog(items);
  const now = new Date();
  const changes: { name: string; from: string; to: string }[] = [];

  for (const item of items) {
    const price = catalogPriceOf(item, catalog);
    if (!price) continue;
    const amounts = calculateLineAmounts({
      quantity: Number(item.quantity),
      materialUnitPrice: price.materialUnitPrice,
      laborUnitPrice: price.laborUnitPrice,
    });
    changes.push({
      name: item.name,
      from: Number(item.lineTotal).toFixed(2),
      to: amounts.lineTotal.toFixed(2),
    });
    await prisma.$transaction([
      ...item.components
        .map((c, idx) => ({ c, to: price.componentPrices[idx] }))
        .filter(({ c, to }) => round2(to) !== round2(Number(c.unitPrice)))
        .map(({ c, to }) => prisma.boqItemComponent.update({ where: { id: c.id }, data: { unitPrice: to } })),
      prisma.boqItem.update({
        where: { id: item.id },
        data: {
          materialUnitPrice: price.materialUnitPrice,
          laborUnitPrice: price.laborUnitPrice,
          materialTotal: amounts.materialTotal,
          laborTotal: amounts.laborTotal,
          lineTotal: amounts.lineTotal,
          pricedAt: now,
        },
      }),
    ]);
  }

  const updated = await recalculateVersion(version.id);
  await writeAuditLog({
    userId: actorId,
    action: "REFRESH_BOQ_PRICES",
    entityType: "ProjectVersion",
    entityId: version.id,
    details: { projectId, versionNo: version.versionNo, lines: changes },
  });
  return { version: updated, updatedCount: changes.length, newVersion: version.id !== latest.id };
}

/** ตั้งใจใช้ราคาเดิม — ไม่แตะราคา ไม่แตกเวอร์ชัน แค่บันทึกว่าพิจารณาแล้ว (คลังเปลี่ยนอีกจะเตือนใหม่) */
export async function keepCurrentPrices(projectId: string, itemIds: string[], actorId: string) {
  await assertOpenProject(projectId);
  const latest = await assertLatestItems(projectId, itemIds);
  const { count } = await prisma.boqItem.updateMany({
    where: { projectVersionId: latest.id, id: { in: itemIds } },
    data: { pricedAt: new Date() },
  });
  await writeAuditLog({
    userId: actorId,
    action: "KEEP_BOQ_PRICES",
    entityType: "ProjectVersion",
    entityId: latest.id,
    details: { projectId, versionNo: latest.versionNo, count },
  });
  return { keptCount: count };
}

// ---------- เทียบเวอร์ชัน ----------

function money(v: unknown): string {
  return Number(v).toFixed(2);
}

export async function compareVersions(projectId: string, fromNo: number, toNo: number): Promise<BoqVersionDiffDto> {
  await loadProjectOrThrow(projectId);
  if (fromNo >= toNo) throw new BoqError("เวอร์ชันที่เทียบต้องเป็นเวอร์ชันเก่ากับเวอร์ชันที่ใหม่กว่า");

  const versions = await prisma.projectVersion.findMany({
    where: { projectId, versionNo: { gte: fromNo, lte: toNo } },
    orderBy: { versionNo: "asc" },
    include: {
      quotes: {
        where: { status: { not: "DRAFT" } },
        orderBy: { createdAt: "asc" },
        select: { quoteNo: true, status: true },
      },
    },
  });
  const from = versions.find((v) => v.versionNo === fromNo);
  const to = versions.find((v) => v.versionNo === toNo);
  if (!from || !to) throw new BoqError("ไม่พบเวอร์ชันที่ระบุ", 404);

  const items = await prisma.boqItem.findMany({
    where: { projectVersionId: { in: versions.map((v) => v.id) } },
    orderBy: BOQ_ITEM_ORDER,
    include: { category: { select: { code: true, name: true } } },
  });
  const byVersion = new Map<string, typeof items>();
  for (const i of items) byVersion.set(i.projectVersionId, [...(byVersion.get(i.projectVersionId) ?? []), i]);

  // ไล่สายคัดลอกทีละเวอร์ชัน (แต่ละเวอร์ชันคัดลอกจากเวอร์ชันก่อนหน้าติดกันเสมอ) จนถึงเวอร์ชัน "หลัง"
  const lineage = new Map<string, string | null>();
  for (const v of versions) {
    for (const i of byVersion.get(v.id) ?? []) {
      // เวอร์ชันต้นทางเป็นจุดเริ่มสาย · เวอร์ชันถัดไปสืบจากบรรทัดที่คัดลอกมา (ไม่มีต้นทาง = บรรทัดใหม่)
      let origin: string | null = null;
      if (v.id === from.id) origin = i.id;
      else if (i.sourceItemId) origin = lineage.get(i.sourceItemId) ?? null;
      lineage.set(i.id, origin);
    }
  }

  const rowById = new Map(items.map((i) => [i.id, i]));
  const toDiffItem = (i: (typeof items)[number]): DiffItem => ({
    id: i.id,
    lineage: lineage.get(i.id) ?? null,
    categoryId: i.categoryId,
    materialId: i.materialId,
    name: i.name,
    unit: i.unit,
    quantity: Number(i.quantity),
    materialUnitPrice: Number(i.materialUnitPrice),
    laborUnitPrice: Number(i.laborUnitPrice),
    lineTotal: Number(i.lineTotal),
    sortOrder: i.sortOrder,
  });
  const values = (d: DiffItem | null): BoqDiffLineValuesDto | null => {
    if (!d) return null;
    const row = rowById.get(d.id)!;
    return {
      name: row.name,
      unit: row.unit,
      quantity: row.quantity.toString(),
      materialUnitPrice: money(row.materialUnitPrice),
      laborUnitPrice: money(row.laborUnitPrice),
      lineTotal: money(row.lineTotal),
    };
  };

  const results = diffBoqItems(
    (byVersion.get(from.id) ?? []).map(toDiffItem),
    (byVersion.get(to.id) ?? []).map(toDiffItem),
  );

  const codeOf = (d: DiffItem) => rowById.get(d.id)!.category.code ?? "";
  const lines = results
    .map((r) => {
      const ref = (r.after ?? r.before)!;
      const category = rowById.get(ref.id)!.category;
      return {
        sortCode: codeOf(ref),
        sortOrder: ref.sortOrder,
        dto: {
          kind: r.kind,
          categoryCode: category.code,
          categoryName: category.name,
          before: values(r.before),
          after: values(r.after),
          changed: r.changed,
          lineTotalDelta: round2((r.after?.lineTotal ?? 0) - (r.before?.lineTotal ?? 0)).toFixed(2),
        },
      };
    })
    // เรียงตามรหัสงานเหมือนตาราง BOQ — บรรทัดที่ถูกลบอยู่ในหมวดเดิมของมัน ไม่ไปกองท้ายตาราง
    .sort(
      (a, b) =>
        a.sortCode.localeCompare(b.sortCode, "en", { numeric: true }) || a.sortOrder - b.sortOrder,
    )
    .map((l) => l.dto);

  const summary = (v: typeof from): BoqVersionSummaryDto => ({
    versionNo: v.versionNo,
    createdAt: v.createdAt.toISOString(),
    directCost: money(v.directCost),
    overheadProfitPct: money(v.overheadProfitPct),
    overheadProfitAmt: money(v.overheadProfitAmt),
    discountAmt: money(v.discountAmt),
    vatPct: money(v.vatPct),
    vatAmt: money(v.vatAmt),
    netPrice: money(v.netPrice),
    quotes: v.quotes,
  });

  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const l of lines) counts[l.kind] += 1;
  return { from: summary(from), to: summary(to), lines, counts };
}
