import ExcelJS from "exceljs";
import { z } from "zod";

import { writeAuditLog } from "../../lib/audit-log";
import {
  IMPORT_MAX_ROWS,
  parseBoqImport,
  type ImportCategory,
  type ImportMaterial,
  type ImportOptions,
  type ImportPreview,
} from "../../lib/excel/boq-import";
import { BOQ_ITEM_ORDER } from "../../lib/boq-order";
import { calculateLineAmounts } from "../../lib/pricing";
import { prisma } from "../../lib/prisma";
import {
  assertNotCustom,
  BoqError,
  getLatestVersion,
  getOrCreateEditableVersion,
  loadProjectOrThrow,
  recalculateVersion,
} from "./boq.service";
import { roundTo } from "@systemboq/shared-types";

/**
 * นำเข้าบรรทัด BOQ จาก Excel — สองขั้น: พรีวิว (ไม่เขียนอะไร) → ยืนยัน (เขียนทีเดียวทั้งชุด)
 *
 * ขั้นยืนยันรับรายการที่ผ่านการพรีวิวมาเป็น JSON แล้วตรวจซ้ำทุกช่องที่นี่ ไม่เชื่อหน้าจอ
 * · เขียนเข้า "เวอร์ชันที่แก้ได้" ตามกฎ BR-07 (เวอร์ชันที่ส่งใบเสนอราคาแล้วจะถูก clone ก่อน)
 * · บรรทัดที่นำเข้าคิดปริมาณแบบกรอกเอง ราคาตรึงตามไฟล์เสมอ (ผูกคลังแล้วก็ไม่ดึงราคาคลังมาทับ)
 * · ของที่ไม่รู้จัก (คนเลือกในพรีวิว): รหัสงานใหม่ใต้หมวดย่อย · เพิ่มเข้าคลังวัสดุ · ผูกกับวัสดุที่มีอยู่
 *   สร้างทั้งหมดในธุรกรรมเดียวกับบรรทัด — พังกลางทางไม่เหลือรหัส/วัสดุกำพร้า
 */

/** หมวดทั้งหมด + ใช้ได้ไหม (ระดับ ITEM และทั้งสายเปิดใช้งาน) — คิดในหน่วยความจำทีเดียว ไม่ถามทีละหมวด */
async function importCategories(): Promise<ImportCategory[]> {
  const all = await prisma.workCategory.findMany({
    select: { id: true, code: true, name: true, level: true, active: true, parentId: true },
  });
  const byId = new Map(all.map((c) => [c.id, c]));
  const chainActive = (id: string): boolean => {
    for (let c = byId.get(id); c; c = c.parentId ? byId.get(c.parentId) : undefined) {
      if (!c.active) return false;
    }
    return true;
  };
  return all.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    usable: c.level === "ITEM" && chainActive(c.id),
    level: c.level,
    parentId: c.parentId,
    chainActive: chainActive(c.id),
  }));
}

/** วัสดุที่จับคู่ชื่อได้ — ใช้งานอยู่และไม่อยู่ในถังขยะ */
async function importMaterials(): Promise<ImportMaterial[]> {
  return prisma.material.findMany({
    where: { active: true, deletedAt: null },
    select: { id: true, code: true, name: true, unit: true, categoryId: true },
  });
}

// ─────────────── ไฟล์ส่งออกที่ถูกแก้ข้างนอกแล้วนำกลับ (แก้ / เพิ่ม / ลบ) ───────────────

type SyncField = "name" | "quantity" | "unit" | "materialUnitPrice" | "laborUnitPrice" | "note" | "category";
type SyncValue = string | number | null;
export interface SyncChange {
  field: SyncField;
  before: SyncValue;
  after: SyncValue;
}
export interface SyncRowInfo {
  /** changed = จะแก้บรรทัดเดิม · unchanged = เหมือนเดิม · added = เพิ่มเป็นบรรทัดใหม่ · error = ข้อมูลเสีย (บรรทัดเดิมไม่ถูกแตะ) */
  status: "changed" | "unchanged" | "added" | "error";
  /** บรรทัดในเวอร์ชันล่าสุดที่แถวนี้ชี้ไป */
  lineId: string | null;
  changes: SyncChange[];
}
export interface SyncSummary {
  fileVersionNo: number;
  currentVersionNo: number;
  counts: { changed: number; unchanged: number; added: number; removed: number };
  /** บรรทัดในระบบที่ไม่มีในไฟล์แล้ว (ถูกลบข้างนอก) */
  removed: { lineId: string; code: string | null; name: string; quantity: number; unit: string; lineTotal: number }[];
}

const r2 = (v: number) => roundTo(v, 2);
const r3 = (v: number) => roundTo(v, 3);
const BASIS_LABEL: Record<string, string> = { SHEET: "ใบถอดแบบ" };

/** บรรทัดในเวอร์ชันล่าสุด + ข้อมูลที่ใช้ตัดสินว่าแก้อะไรได้ */
async function latestLines(projectId: string) {
  const latest = await getLatestVersion(projectId);
  const lines = await prisma.boqItem.findMany({
    where: { projectVersionId: latest.id },
    orderBy: BOQ_ITEM_ORDER,
    include: { category: { select: { code: true, name: true } }, _count: { select: { components: true } } },
  });
  return { latest, lines };
}

/**
 * id ในไฟล์ → บรรทัดในเวอร์ชันล่าสุด: ตรงตัว หรือไล่สายคัดลอก (sourceItemId) ย้อนขึ้นไป
 * — ไฟล์ส่งออกจากเวอร์ชัน 2 แล้วระบบแตกเป็นเวอร์ชัน 3 ระหว่างนั้น ก็ยังจับคู่บรรทัดเดิมได้
 */
async function lineageMap(projectId: string, currentIds: string[]): Promise<Map<string, string>> {
  const all = await prisma.boqItem.findMany({
    where: { projectVersion: { projectId } },
    select: { id: true, sourceItemId: true },
  });
  const parentOf = new Map(all.map((a) => [a.id, a.sourceItemId]));
  const toCurrent = new Map<string, string>();
  for (const id of currentIds) {
    let cursor: string | null = id;
    for (let guard = 0; cursor && guard < 200; guard++) {
      if (!toCurrent.has(cursor)) toCurrent.set(cursor, id);
      cursor = parentOf.get(cursor) ?? null;
    }
  }
  return toCurrent;
}

/** ข้อจำกัดของบรรทัดเดิม: ตัวเลขบางช่องระบบคิดเอง แก้จากไฟล์ไม่ได้ */
function lineLocks(line: { qtyBasis: string; tileCalc: unknown; _count: { components: number } }) {
  const hasComponents = line._count.components > 0;
  const hasTile = line.tileCalc != null;
  return { qtyLocked: hasComponents || hasTile, priceLocked: hasComponents, unitLocked: hasTile };
}

type LatestLine = Awaited<ReturnType<typeof latestLines>>["lines"][number];

/** เทียบแถวในไฟล์กับบรรทัดเดิม — คืนช่องที่จะเปลี่ยนจริง + คำเตือนของช่องที่แก้จากไฟล์ไม่ได้ */
function diffLine(row: ImportPreview["rows"][number], line: LatestLine) {
  const changes: SyncChange[] = [];
  const warnings: string[] = [];
  const locks = lineLocks(line);
  const push = (field: SyncField, before: SyncValue, after: SyncValue) => {
    if (before !== after) changes.push({ field, before, after });
  };
  push("name", line.name.trim(), row.name.trim());
  diffQuantity(row, line, locks.qtyLocked, push, warnings);
  if (line.unit.trim() !== row.unit.trim()) {
    if (locks.unitLocked) warnings.push("หน่วยของบรรทัดที่ใช้ตัวคิดกระเบื้องแก้จากไฟล์ไม่ได้");
    else push("unit", line.unit.trim(), row.unit.trim());
  }
  if (r2(Number(line.materialUnitPrice)) !== r2(row.materialUnitPrice)) {
    if (locks.priceLocked) warnings.push("ค่าวัสดุบรรทัดนี้คิดจากสูตรวัสดุย่อย — แก้ในไฟล์ไม่มีผล");
    else push("materialUnitPrice", r2(Number(line.materialUnitPrice)), r2(row.materialUnitPrice));
  }
  push("laborUnitPrice", r2(Number(line.laborUnitPrice)), r2(row.laborUnitPrice));
  push("note", line.note?.trim() || null, row.note?.trim() || null);
  if (row.categoryId && row.categoryId !== line.categoryId) {
    push("category", line.category.code ?? line.category.name, row.code ?? row.categoryName);
  } else if (!row.categoryId && row.code && row.code.toUpperCase() !== (line.category.code ?? "").toUpperCase()) {
    warnings.push(`รหัส ${row.code} ไม่มีในระบบ — คงรหัสงานเดิม ${line.category.code ?? ""}`.trim());
  }
  return { changes, warnings };
}

/** ปริมาณ: บรรทัดที่ระบบคิดปริมาณเองแก้จากไฟล์ไม่ได้ · บรรทัดที่คิดจากค่าวัดจะกลายเป็นกรอกเอง */
function diffQuantity(
  row: ImportPreview["rows"][number],
  line: LatestLine,
  qtyLocked: boolean,
  push: (field: SyncField, before: SyncValue, after: SyncValue) => void,
  warnings: string[],
): void {
  const qtyBefore = r3(Number(line.quantity));
  const qtyAfter = r3(row.quantity ?? 0);
  if (qtyBefore === qtyAfter) return;
  if (qtyLocked) {
    warnings.push("ปริมาณบรรทัดนี้ระบบคิดจากสูตรวัสดุย่อย/ตัวคิดกระเบื้อง — แก้ในไฟล์ไม่มีผล ให้แก้ในระบบ");
    return;
  }
  push("quantity", qtyBefore, qtyAfter);
  if (line.qtyBasis !== "MANUAL") {
    warnings.push(`ปริมาณเดิมคิดจาก${BASIS_LABEL[line.qtyBasis] ?? "ค่าวัดของโครงการ"} — จะเปลี่ยนเป็นกรอกปริมาณเอง`);
  }
}

type PreviewRow = BoqImportPreviewDto["rows"][number];

/** แถวที่ชี้บรรทัดเดิม: แก้ / เหมือนเดิม / ข้อมูลเสีย (ไม่แตะบรรทัดเดิม) */
function syncExistingRow(row: PreviewRow, line: LatestLine, currentId: string): void {
  if (row.errors.length > 0) {
    row.sync = { status: "error", lineId: currentId, changes: [] };
    row.warnings.push("ข้อมูลในไฟล์ไม่ครบ — บรรทัดเดิมในระบบจะไม่ถูกแก้");
    return;
  }
  const { changes, warnings } = diffLine(row, line);
  row.warnings.push(...warnings);
  // บรรทัดเดิมคงรหัสงาน/วัสดุของมัน — ข้อเสนอสำหรับแถวใหม่ไม่ใช้กับแถวนี้
  const categoryChanged = changes.some((c) => c.field === "category");
  if (!categoryChanged) {
    row.categoryId = line.categoryId;
    row.categoryName = `${line.category.code ?? ""} ${line.category.name}`.trim();
  }
  row.newCode = null;
  row.needsCategory = false;
  row.materialMatch = null;
  row.sync = { status: changes.length > 0 ? "changed" : "unchanged", lineId: currentId, changes };
}

/** ไฟล์ส่งออกจากโครงการนี้: จับคู่แถวกับบรรทัดในเวอร์ชันล่าสุด แล้วสรุปแก้/เพิ่ม/ลบ */
async function syncWithLatest(projectId: string, rows: PreviewRow[], fileVersionNo: number): Promise<SyncSummary> {
  const { latest, lines } = await latestLines(projectId);
  const byId = new Map(lines.map((l) => [l.id, l]));
  const toCurrent = await lineageMap(projectId, lines.map((l) => l.id));
  const used = new Set<string>();
  for (const row of rows) {
    const currentId = row.lineId ? toCurrent.get(row.lineId) : undefined;
    if (row.lineId && currentId && !used.has(currentId)) {
      // แถวเดิม — แม้ข้อมูลเสียก็นับว่า "ยังอยู่" (ห้ามตีความเป็นการลบบรรทัดเดิม)
      used.add(currentId);
      syncExistingRow(row, byId.get(currentId)!, currentId);
      continue;
    }
    if (row.lineId) {
      row.warnings.push(
        currentId ? "แถวนี้ซ้ำกับบรรทัดเดิมอีกแถว (คัดลอกแถวมา) — จะเพิ่มเป็นบรรทัดใหม่" : "ไม่พบบรรทัดเดิมในระบบ (อาจถูกลบไปแล้ว) — จะเพิ่มเป็นบรรทัดใหม่",
      );
    }
    row.sync = { status: row.errors.length > 0 ? "error" : "added", lineId: null, changes: [] };
  }
  const removed = lines.filter((l) => !used.has(l.id));
  const countOf = (status: SyncRowInfo["status"]) => rows.filter((r) => r.sync?.status === status).length;
  return {
    fileVersionNo,
    currentVersionNo: latest.versionNo,
    counts: { changed: countOf("changed"), unchanged: countOf("unchanged"), added: countOf("added"), removed: removed.length },
    removed: removed.map((l) => ({
      lineId: l.id,
      code: l.category.code,
      name: l.name,
      quantity: Number(l.quantity),
      unit: l.unit,
      lineTotal: Number(l.lineTotal),
    })),
  };
}

export interface BoqImportPreviewDto extends ImportPreview {
  rows: (ImportPreview["rows"][number] & { sync: SyncRowInfo | null })[];
  /** ไฟล์ส่งออกจากโครงการนี้ — นำเข้าเป็น "การแก้" ได้ · null = นำเข้าเป็นบรรทัดใหม่อย่างเดียว */
  sync: SyncSummary | null;
  /** ไฟล์ส่งออกจากโครงการอื่น — บอกให้รู้ (นำเข้าเป็นบรรทัดใหม่) */
  fromOtherProject: boolean;
  summary: {
    total: number;
    /** พร้อมนำเข้าตามที่ระบบเสนอ (ไม่มี error และรู้แล้วว่าลงรหัสไหน/สร้างรหัสใหม่) */
    ready: number;
    withErrors: number;
    /** ต้องเลือกรหัสงานเองในพรีวิว */
    needsCategory: number;
    /** เสนอสร้างรหัสงานใหม่ */
    newCodes: number;
    /** ชื่อ+หน่วยตรงกับวัสดุในคลัง */
    matched: number;
    directCost: number;
  };
}

export async function previewBoqImport(
  projectId: string,
  buffer: Buffer,
  defaultCategoryId: string | null,
  options: ImportOptions = {},
): Promise<BoqImportPreviewDto> {
  assertNotCustom(await loadProjectOrThrow(projectId));
  const preview = await parseBoqImport(buffer, await importCategories(), defaultCategoryId, await importMaterials(), options);
  const sameProject = preview.source?.projectId === projectId;
  const rows: BoqImportPreviewDto["rows"] = preview.rows.map((r) => ({ ...r, sync: null }));
  const sync = sameProject ? await syncWithLatest(projectId, rows, preview.source!.versionNo) : null;

  const valid = rows.filter((r) => r.errors.length === 0);
  const ready = valid.filter((r) => !r.needsCategory);
  return {
    ...preview,
    rows,
    sync,
    fromOtherProject: !!preview.source && !sameProject,
    summary: {
      total: preview.rows.length,
      ready: ready.length,
      withErrors: preview.rows.length - valid.length,
      needsCategory: valid.length - ready.length,
      newCodes: valid.filter((r) => r.newCode).length,
      matched: valid.filter((r) => r.materialMatch).length,
      directCost: Math.round(ready.reduce((s, r) => s + r.lineTotal, 0) * 100) / 100,
    },
  };
}

export const commitBoqImportSchema = z.object({
  /**
   * append = ต่อท้ายบรรทัดเดิม · replace = ลบบรรทัดเดิมของเวอร์ชันที่แก้ได้ทั้งหมดก่อน ·
   * sync = ไฟล์ส่งออกที่ถูกแก้แล้วนำกลับ: แถวที่มี lineId แก้บรรทัดเดิม · ไม่มี = เพิ่ม · removeLineIds = ลบ
   */
  mode: z.enum(["append", "replace", "sync"]),
  /** sync: บรรทัด (ของเวอร์ชันล่าสุดตอนพรีวิว) ที่ถูกลบออกจากไฟล์และให้ลบในระบบด้วย */
  removeLineIds: z.array(z.string().min(1)).max(IMPORT_MAX_ROWS).optional(),
  rows: z
    .array(
      z
        .object({
        /** sync: บรรทัดเดิม (เวอร์ชันล่าสุดตอนพรีวิว) ที่แถวนี้แก้ — ต้องคู่กับ categoryId */
        lineId: z.string().min(1).optional(),
        /** ลงรหัสงานที่มีอยู่ */
        categoryId: z.string().min(1).optional(),
        /** หรือสร้างรหัสงานใหม่ (ระดับรายการ) ใต้หมวดย่อย — code ว่าง = ให้ระบบต่อเลขให้ · ชื่อ = ชื่อบรรทัด */
        newCategory: z
          .object({ parentId: z.string().min(1), code: z.string().trim().min(1).max(30).nullable() })
          .optional(),
        /** ผูกกับวัสดุในคลังที่มีอยู่ */
        materialId: z.string().min(1).optional(),
        /** เพิ่มบรรทัดนี้เข้าคลังวัสดุเป็นวัสดุใหม่ (ชื่อ/หน่วย/ราคาตามไฟล์) แล้วผูกให้ */
        addToLibrary: z.boolean().optional(),
        name: z.string().trim().min(1).max(300),
        quantity: z.number().positive().max(1e9),
        unit: z.string().trim().min(1).max(50),
        materialUnitPrice: z.number().min(0).max(1e10),
        laborUnitPrice: z.number().min(0).max(1e10),
        note: z.string().trim().max(1000).nullable().optional(),
      })
        .refine((r) => !!r.categoryId !== !!r.newCategory, { message: "แต่ละบรรทัดต้องเลือกรหัสงานที่มีอยู่หรือสร้างใหม่อย่างใดอย่างหนึ่ง" })
        .refine((r) => !(r.materialId && r.addToLibrary), { message: "เลือกผูกวัสดุเดิมหรือเพิ่มเข้าคลังอย่างใดอย่างหนึ่ง" })
        .refine((r) => !r.lineId || (!!r.categoryId && !r.materialId && !r.addToLibrary), {
          message: "แถวที่แก้บรรทัดเดิมต้องระบุรหัสงาน และไม่สร้าง/ผูกวัสดุใหม่",
        }),
    )
    .max(IMPORT_MAX_ROWS),
})
  .refine((v) => v.rows.length > 0 || (v.mode === "sync" && (v.removeLineIds?.length ?? 0) > 0), {
    message: "ไม่มีรายการให้นำเข้า",
    path: ["rows"],
  })
  .refine((v) => v.mode === "sync" || (!v.removeLineIds?.length && v.rows.every((r) => !r.lineId)), {
    message: "แก้/ลบบรรทัดเดิมได้เฉพาะโหมดอัปเดตตามไฟล์",
  });

export type CommitBoqImportInput = z.infer<typeof commitBoqImportSchema>;

const CHILD_DIGITS = 2;
const MATERIAL_PREFIX = "MAT-";

/** เลขรหัสลูกตัวถัดไปใต้ parent ที่ยังว่าง — จองในหน่วยความจำ ใช้ซ้ำในคำขอเดียวได้หลายตัวไม่ชนกัน */
function allocateChildCode(parentCode: string, taken: Set<string>): string {
  const prefix = `${parentCode}-`;
  let highest = 0;
  for (const code of taken) {
    if (!code.startsWith(prefix)) continue;
    const suffix = code.slice(prefix.length);
    if (/^\d+$/.test(suffix)) highest = Math.max(highest, Number(suffix));
  }
  for (let n = highest + 1; ; n++) {
    const code = prefix + String(n).padStart(CHILD_DIGITS, "0");
    if (!taken.has(code)) {
      taken.add(code);
      return code;
    }
  }
}

function allocateMaterialCode(taken: Set<string>): string {
  let highest = 0;
  for (const code of taken) {
    const suffix = code.startsWith(MATERIAL_PREFIX) ? code.slice(MATERIAL_PREFIX.length) : "";
    if (/^\d+$/.test(suffix)) highest = Math.max(highest, Number(suffix));
  }
  const code = MATERIAL_PREFIX + String(highest + 1).padStart(4, "0");
  taken.add(code);
  return code;
}

type ImportCategoryRow = Awaited<ReturnType<typeof importCategories>>[number];

/** รหัสงานในคำขอยังใช้ได้ · รหัสใหม่: แม่ต้องเป็นหมวดย่อยที่ใช้งานได้ และรหัสที่ระบุต้องยังว่าง */
function assertImportCategories(input: CommitBoqImportInput, catById: Map<string, ImportCategoryRow>, takenCodes: Set<string>): void {
  const badCategory = input.rows.find((r) => r.categoryId && !catById.get(r.categoryId)?.usable);
  if (badCategory) {
    throw new BoqError(`หมวดงานของ "${badCategory.name}" ไม่มีแล้วหรือถูกปิดใช้งาน — กรุณาพรีวิวไฟล์ใหม่`, 409);
  }
  // มีคนสร้างรหัสระหว่างพรีวิว = ให้พรีวิวใหม่
  for (const r of input.rows) {
    if (!r.newCategory) continue;
    const parent = catById.get(r.newCategory.parentId);
    if (parent?.level !== "SUBGROUP" || !parent.chainActive) {
      throw new BoqError(`หมวดย่อยที่จะสร้างรหัสใหม่ให้ "${r.name}" ไม่มีแล้วหรือถูกปิดใช้งาน — กรุณาพรีวิวไฟล์ใหม่`, 409);
    }
    if (!parent.code && !r.newCategory.code) {
      throw new BoqError(`หมวดย่อย "${parent.name}" ไม่มีรหัส จึงต่อเลขรหัสงานใหม่ให้ "${r.name}" ไม่ได้ — ใส่รหัสในไฟล์หรือเลือกรหัสที่มีอยู่`, 400);
    }
  }
  assertNewCodesFree(input, takenCodes);
}

/** รหัสที่ขอสร้างต้องยังว่าง และรหัสเดียวกันต้องอยู่ใต้หมวดย่อยเดียวกันทั้งไฟล์ */
function assertNewCodesFree(input: CommitBoqImportInput, takenCodes: Set<string>): void {
  const codeOwners = new Map<string, string>();
  for (const r of input.rows) {
    const code = r.newCategory?.code?.toUpperCase();
    if (!code) continue;
    const key = `${r.newCategory!.parentId}|${code}`;
    if (takenCodes.has(code)) throw new BoqError(`รหัส ${code} ถูกใช้แล้ว — กรุณาพรีวิวไฟล์ใหม่`, 409);
    if (codeOwners.has(code) && codeOwners.get(code) !== key) {
      throw new BoqError(`รหัส ${code} ถูกขอสร้างใต้หมวดย่อยต่างกันสองที่ในไฟล์เดียว`, 400);
    }
    codeOwners.set(code, key);
  }
}

export async function commitBoqImport(projectId: string, input: CommitBoqImportInput, actorId: string) {
  assertNotCustom(await loadProjectOrThrow(projectId));

  const categories = await importCategories();
  const catById = new Map(categories.map((c) => [c.id, c]));
  const takenCodes = new Set(categories.map((c) => c.code).filter((c): c is string => !!c));
  assertImportCategories(input, catById, takenCodes);

  const linkIds = [...new Set(input.rows.map((r) => r.materialId).filter((id): id is string => !!id))];
  const linkable = new Set(
    (await prisma.material.findMany({ where: { id: { in: linkIds }, active: true, deletedAt: null }, select: { id: true } })).map((m) => m.id),
  );
  const badLink = input.rows.find((r) => r.materialId && !linkable.has(r.materialId));
  if (badLink) throw new BoqError(`วัสดุที่จะผูกกับ "${badLink.name}" ไม่มีแล้วหรือถูกปิดใช้งาน — กรุณาพรีวิวไฟล์ใหม่`, 409);

  const materialCodes = new Set(
    (await prisma.material.findMany({ where: { code: { startsWith: MATERIAL_PREFIX } }, select: { code: true } })).map((m) => m.code!),
  );

  // sync: id ที่หน้าจอส่งมาเป็นของ "เวอร์ชันล่าสุดตอนพรีวิว" — ถ้าเวอร์ชันนั้นส่งใบเสนอราคาแล้ว
  // ระบบจะแตกเวอร์ชันใหม่ตอนนี้ → แปลง id ผ่าน sourceItemId (แบบเดียวกับเรียงลำดับ/อัปเดตราคา)
  const latestBefore = input.mode === "sync" ? await getLatestVersion(projectId) : null;
  const version = await getOrCreateEditableVersion(projectId, actorId);
  const editableLines =
    input.mode === "sync"
      ? await prisma.boqItem.findMany({
          where: { projectVersionId: version.id },
          include: { _count: { select: { components: true } } },
        })
      : [];
  const lineFor = new Map<string, (typeof editableLines)[number]>();
  for (const l of editableLines) {
    lineFor.set(version.id === latestBefore?.id ? l.id : (l.sourceItemId ?? l.id), l);
  }
  const wantedIds = [...input.rows.map((r) => r.lineId).filter((id): id is string => !!id), ...(input.removeLineIds ?? [])];
  if (wantedIds.some((id) => !lineFor.has(id))) throw new BoqError("บรรทัด BOQ เปลี่ยนไปหลังพรีวิว (มีคนแก้/ลบระหว่างนั้น) — กรุณาพรีวิวไฟล์ใหม่", 409);
  if (new Set(wantedIds).size !== wantedIds.length) throw new BoqError("บรรทัดเดิมเดียวกันถูกแก้/ลบซ้ำในคำขอเดียว", 400);

  const now = new Date();
  const created = { categories: [] as { id: string; code: string | null; name: string }[], materials: [] as { id: string; code: string; name: string }[] };
  const removed = await prisma.$transaction(async (tx) => {
    // 1) รหัสงานใหม่ — รหัสเดียวกันหลายบรรทัด = สร้างครั้งเดียว · ไม่ระบุรหัส = หนึ่งรหัสต่อหนึ่งบรรทัด (ชื่อ = ชื่อบรรทัด)
    const newCategoryId = new Map<string, string>();
    const sortOrderByParent = new Map<string, number>();
    const categoryIdOf = async (r: CommitBoqImportInput["rows"][number], index: number): Promise<string> => {
      if (r.categoryId) return r.categoryId;
      const nc = r.newCategory!;
      const key = nc.code ? `code:${nc.code.toUpperCase()}` : `row:${index}`;
      const existing = newCategoryId.get(key);
      if (existing) return existing;
      const parent = catById.get(nc.parentId)!;
      const code = nc.code ? nc.code.toUpperCase() : allocateChildCode(parent.code!, takenCodes);
      takenCodes.add(code);
      if (!sortOrderByParent.has(nc.parentId)) {
        const last = await tx.workCategory.findFirst({ where: { parentId: nc.parentId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
        sortOrderByParent.set(nc.parentId, last?.sortOrder ?? 0);
      }
      const sortOrder = sortOrderByParent.get(nc.parentId)! + 1;
      sortOrderByParent.set(nc.parentId, sortOrder);
      const category = await tx.workCategory.create({
        data: { parentId: nc.parentId, level: "ITEM", code, name: r.name, sortOrder },
      });
      created.categories.push({ id: category.id, code: category.code, name: category.name });
      newCategoryId.set(key, category.id);
      return category.id;
    };

    // 2) วัสดุใหม่ในคลัง — ชื่อ+หน่วย+รหัสงานเดียวกันหลายบรรทัด = สร้างครั้งเดียว
    const newMaterialId = new Map<string, string>();
    const materialIdOf = async (r: CommitBoqImportInput["rows"][number], categoryId: string): Promise<string | null> => {
      if (r.materialId) return r.materialId;
      if (!r.addToLibrary) return null;
      const key = `${categoryId}|${r.name.trim().toLowerCase()}|${r.unit.trim()}`;
      const existing = newMaterialId.get(key);
      if (existing) return existing;
      const material = await tx.material.create({
        data: {
          categoryId,
          code: allocateMaterialCode(materialCodes),
          name: r.name,
          unit: r.unit,
          materialUnitPrice: roundTo(r.materialUnitPrice, 2),
          laborUnitPrice: roundTo(r.laborUnitPrice, 2),
        },
      });
      created.materials.push({ id: material.id, code: material.code!, name: material.name });
      newMaterialId.set(key, material.id);
      return material.id;
    };

    const newRows = input.rows.filter((r) => !r.lineId);
    const resolved: { categoryId: string; materialId: string | null }[] = [];
    for (const [i, r] of newRows.entries()) {
      const categoryId = await categoryIdOf(r, i);
      resolved.push({ categoryId, materialId: await materialIdOf(r, categoryId) });
    }

    // sync: แก้บรรทัดเดิมตามไฟล์ — กฎเดียวกับพรีวิว (ตัวเลขที่ระบบคิดเองไม่ถูกทับ) คิดซ้ำที่นี่ ไม่เชื่อหน้าจอ
    for (const r of input.rows.filter((row) => row.lineId)) {
      await tx.boqItem.update(syncedLineUpdate(r, lineFor.get(r.lineId!)!, now));
    }
    const removeIds = (input.removeLineIds ?? []).map((id) => lineFor.get(id)!.id);
    const removedCount = removeIds.length ? (await tx.boqItem.deleteMany({ where: { id: { in: removeIds } } })).count : 0;

    const deleted =
      input.mode === "replace"
        ? (await tx.boqItem.deleteMany({ where: { projectVersionId: version.id } })).count
        : removedCount;
    const last =
      input.mode === "replace"
        ? -1
        : ((await tx.boqItem.aggregate({ where: { projectVersionId: version.id }, _max: { sortOrder: true } }))._max
            .sortOrder ?? -1);
    await tx.boqItem.createMany({
      data: newRows.map((r, i) => {
        const quantity = roundTo(r.quantity, 3);
        const materialUnitPrice = roundTo(r.materialUnitPrice, 2);
        const laborUnitPrice = roundTo(r.laborUnitPrice, 2);
        const amounts = calculateLineAmounts({ quantity, materialUnitPrice, laborUnitPrice });
        return {
          projectVersionId: version.id,
          categoryId: resolved[i].categoryId,
          materialId: resolved[i].materialId,
          name: r.name,
          quantity,
          qtyBasis: "MANUAL",
          unit: r.unit,
          materialUnitPrice,
          materialTotal: amounts.materialTotal,
          laborUnitPrice,
          laborTotal: amounts.laborTotal,
          lineTotal: amounts.lineTotal,
          sortOrder: last + 1 + i,
          note: r.note || null,
          pricedAt: now,
        };
      }),
    });
    return deleted;
  });

  for (const c of created.categories) {
    await writeAuditLog({ userId: actorId, action: "CREATE_CATEGORY", entityType: "WorkCategory", entityId: c.id, details: { name: c.name, level: "ITEM", source: "IMPORT_BOQ_EXCEL" } });
  }
  for (const m of created.materials) {
    await writeAuditLog({ userId: actorId, action: "CREATE_MATERIAL", entityType: "Material", entityId: m.id, details: { name: m.name, source: "IMPORT_BOQ_EXCEL" } });
  }

  const updated = await recalculateVersion(version.id);
  const linked = input.rows.filter((r) => r.materialId).length;
  const updatedLines = input.rows.filter((r) => r.lineId).length;
  await writeAuditLog({
    userId: actorId,
    action: "IMPORT_BOQ_EXCEL",
    entityType: "ProjectVersion",
    entityId: version.id,
    details: {
      projectId,
      versionNo: version.versionNo,
      mode: input.mode,
      imported: input.rows.length - updatedLines,
      updated: updatedLines,
      removed,
      directCost: Number(updated.directCost),
      createdCategories: created.categories.length,
      createdMaterials: created.materials.length,
      linkedMaterials: linked,
    },
  });
  return {
    version: updated,
    imported: input.rows.length - updatedLines,
    updated: updatedLines,
    removed,
    createdCategories: created.categories,
    createdMaterials: created.materials,
    linkedMaterials: linked,
  };
}

/** คำสั่งแก้บรรทัดเดิมตามไฟล์ — ตัวเลขที่ระบบคิดเอง (สูตรวัสดุย่อย/ตัวคิดกระเบื้อง) ไม่ถูกทับ */
function syncedLineUpdate(
  r: CommitBoqImportInput["rows"][number],
  line: { id: string; quantity: unknown; qtyBasis: string; unit: string; materialUnitPrice: unknown; laborUnitPrice: unknown; tileCalc: unknown; _count: { components: number } },
  now: Date,
) {
  const locks = lineLocks(line);
  const qtyIn = r3(r.quantity);
  const qtyChanged = qtyIn !== r3(Number(line.quantity));
  const quantity = qtyChanged && !locks.qtyLocked ? qtyIn : Number(line.quantity);
  const toManual = qtyChanged && !locks.qtyLocked && line.qtyBasis !== "MANUAL";
  const materialUnitPrice = locks.priceLocked ? Number(line.materialUnitPrice) : r2(r.materialUnitPrice);
  const laborUnitPrice = r2(r.laborUnitPrice);
  const amounts = calculateLineAmounts({ quantity, materialUnitPrice, laborUnitPrice });
  const repriced =
    materialUnitPrice !== r2(Number(line.materialUnitPrice)) || laborUnitPrice !== r2(Number(line.laborUnitPrice));
  return {
    where: { id: line.id },
    data: {
      categoryId: r.categoryId,
      name: r.name,
      unit: locks.unitLocked ? line.unit : r.unit,
      quantity,
      qtyBasis: toManual ? ("MANUAL" as const) : undefined,
      qtyCoefficient: toManual ? null : undefined,
      materialUnitPrice,
      materialTotal: amounts.materialTotal,
      laborUnitPrice,
      laborTotal: amounts.laborTotal,
      lineTotal: amounts.lineTotal,
      note: r.note || null,
      pricedAt: repriced ? now : undefined,
      // ปริมาณไม่ได้มาจากใบถอดแบบแล้ว — แถวถอดแบบเดิมต้องออกไปด้วย (เหมือนเปลี่ยนฐานในหน้าแก้ไข)
      takeoffRows: toManual ? { deleteMany: {} } : undefined,
    },
  };
}

/**
 * แม่แบบนำเข้า: คำอธิบาย + หัวตารางที่ระบบอ่านได้ + ชีตรหัสหมวดงานที่ใช้ได้
 *
 * ตัวอย่างเขียนเป็นบรรทัดคำอธิบายเหนือหัวตาราง ไม่ใส่เป็นแถวข้อมูล — แถวตัวอย่างที่ลืมลบจะถูกนำเข้า
 * เป็นงานจริงพร้อมราคา
 */
export async function buildImportTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("BOQ");
  ws.columns = [14, 44, 11, 9, 15, 15, 28].map((width) => ({ width, style: { font: { name: "Tahoma", size: 10 } } }));

  const categories = (await importCategories()).filter((c) => c.usable && c.code);
  const exampleCode = categories[0]?.code ?? "B-01-01";
  const notes = [
    ["แม่แบบนำเข้า BOQ"],
    ['รหัส = รหัสหมวดงานระดับรายการ (ดูชีต "รหัสหมวดงาน") · ค่าวัสดุ/ค่าแรง = ราคาทุนต่อหน่วย ยังไม่บวกกำไร'],
    [`ตัวอย่าง: ${exampleCode} | งานเทคอนกรีตฐานราก | 12.5 | ลบ.ม. | 2400 | 500`],
    [],
  ];
  for (const n of notes) ws.addRow(n);
  ws.getRow(1).font = { name: "Tahoma", size: 12, bold: true, color: { argb: "FF000099" } };
  ws.getRow(3).font = { name: "Tahoma", size: 10, color: { argb: "FF5A6078" } };

  const head = ws.addRow(["รหัส", "รายการ", "ปริมาณ", "หน่วย", "ค่าวัสดุ/หน่วย", "ค่าแรง/หน่วย", "หมายเหตุ"]);
  head.eachCell((c) => {
    c.font = { name: "Tahoma", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000099" } };
  });
  ws.views = [{ state: "frozen", ySplit: head.number }];

  const ref = wb.addWorksheet("รหัสหมวดงาน");
  ref.columns = [{ width: 14 }, { width: 50 }];
  ref.addRow(["รหัส", "หมวดงาน"]).font = { name: "Tahoma", bold: true };
  categories.sort((a, b) => (a.code ?? "").localeCompare(b.code ?? "", "en", { numeric: true }));
  for (const c of categories) {
    ref.addRow([c.code, c.name]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
