import type {
  BoqItemDto,
  BoqPriceDriftDto,
  BoqVersionDiffDto,
  ProjectVersionDto,
  RebarCuttingDto,
  StructuralCompareDto,
  StructuralInput,
  StructuralMemberDto,
  StructuralRecomputeDto,
  TakeoffRowInput,
  TileCalcConfig,
} from "@systemboq/shared-types";

import { apiFetch, apiUpload } from "./api";

export interface BoqState {
  version: ProjectVersionDto;
  items: BoqItemDto[];
  editable: boolean;
}

// วัสดุย่อยหนึ่งบรรทัดในสูตรถอดปริมาณ (ส่งไป server ตอนเพิ่ม/แก้บรรทัด BOQ หรือแก้สูตรในแคตตาล็อก)
export interface MaterialComponentInput {
  componentMaterialId?: string | null;
  name: string;
  unit: string;
  qtyPerUnit: number;
  wasteFactorPct?: number | null;
  unitPrice: number;
  sortOrder?: number;
}

export interface BoqMutationResult {
  item: BoqItemDto;
  version: ProjectVersionDto;
}

export function getBoq(projectId: string): Promise<BoqState> {
  return apiFetch(`/api/projects/${projectId}/boq`);
}

// ฐานคำนวณปริมาณ: MANUAL = กรอกเอง; ที่เหลือคิดจากค่าวัดโครงการ × qtyCoefficient × (1+เผื่อเสีย)
export type QtyBasis =
  | "MANUAL"
  | "PER_AREA"
  | "PER_WALL_AREA"
  | "PER_PERIMETER"
  | "PER_VOLUME"
  | "PER_FOOTPRINT"
  | "PER_BATHROOM"
  | "PER_FLOOR"
  | "SHEET";

export function addBoqItem(
  projectId: string,
  input: {
    categoryId: string;
    materialId?: string;
    name?: string;
    unit?: string;
    materialUnitPrice?: number;
    laborUnitPrice?: number;
    quantity?: number;
    qtyBasis?: QtyBasis;
    qtyCoefficient?: number | null;
    wasteFactorPct?: number | null;
    note?: string;
    components?: MaterialComponentInput[];
    // ใบถอดแบบ — ใช้กับ qtyBasis = "SHEET" (ปริมาณคิดจากแถวพวกนี้)
    takeoffRows?: TakeoffRowInput[];
  },
): Promise<BoqMutationResult> {
  return apiFetch(`/api/projects/${projectId}/boq/items`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** เพิ่มหลายบรรทัดจากคลังในครั้งเดียว (ปุ่ม "เพิ่มหลายรายการ") — ผิดบรรทัดเดียว = ไม่เพิ่มเลยสักบรรทัด */
export function addBoqItems(
  projectId: string,
  items: { categoryId: string; materialId: string; quantity: number }[],
): Promise<{ version: BoqMutationResult["version"]; created: number }> {
  return apiFetch(`/api/projects/${projectId}/boq/items/batch`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export function updateBoqItem(
  projectId: string,
  itemId: string,
  input: {
    quantity?: number;
    materialId?: string | null;
    materialUnitPrice?: number;
    laborUnitPrice?: number;
    qtyBasis?: QtyBasis;
    qtyCoefficient?: number | null;
    wasteFactorPct?: number | null;
    name?: string;
    unit?: string;
    note?: string | null;
    // ไม่ส่ง = ไม่แก้สูตรเดิม; [] = ล้างสูตร (กลับเป็นวัสดุก้อนเดียว); มีรายการ = แทนทั้งชุด
    components?: MaterialComponentInput[] | null;
    // ไม่ส่ง = คงแถวเดิม; ส่งมา = แทนทั้งชุด (qtyBasis = "SHEET")
    takeoffRows?: TakeoffRowInput[];
    // ตัวคิดกระเบื้อง: ไม่ส่ง = คงค่าเดิม · null = เลิกใช้ · priced = วัสดุย่อยคิดจากค่านี้ที่เซิร์ฟเวอร์
    tileCalc?: TileCalcConfig | null;
  },
): Promise<BoqMutationResult> {
  return apiFetch(`/api/projects/${projectId}/boq/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** ตัวคิดชิ้นส่วนโครงสร้าง: เติมแถวใบถอดแบบลงบรรทัดเดิม (itemId) หรือสร้างบรรทัดใหม่ (newItem) */
export interface TakeoffTarget {
  itemId?: string;
  newItem?: {
    categoryId: string;
    materialId?: string;
    name?: string;
    unit?: string;
    materialUnitPrice?: number;
    laborUnitPrice?: number;
  };
  rows: TakeoffRowInput[];
}

/** member = ชิ้นส่วนที่เป็นที่มาของแถว — เซิร์ฟเวอร์เก็บไว้คิดรายการสั่งเหล็กหน้างาน (ชุดสั่งตัด) */
export function applyTakeoff(
  projectId: string,
  targets: TakeoffTarget[],
  member?: StructuralInput,
): Promise<{ version: ProjectVersionDto; lines: number; created: number }> {
  return apiFetch(`/api/projects/${projectId}/boq/takeoff/apply`, {
    method: "POST",
    body: JSON.stringify({ targets, member }),
  });
}

/** ชิ้นส่วนโครงสร้างที่ลงไว้ในเวอร์ชันล่าสุด พร้อมบรรทัดที่แต่ละชิ้นมีแถวอยู่ */
export function listStructuralMembers(projectId: string): Promise<{ members: StructuralMemberDto[] }> {
  return apiFetch(`/api/projects/${projectId}/boq/structural-members`);
}

export interface MemberWriteResult {
  version: ProjectVersionDto;
  lines: number;
  created: number;
  /** บรรทัดที่ไม่เหลือแถวแล้วถูกลบ */
  removed: number;
  /** แตกเวอร์ชันใหม่เพราะเวอร์ชันเดิมส่งใบเสนอราคาแล้ว */
  newVersion: boolean;
}

/** แก้ชิ้นส่วน = ลงทับด้วย key เดิม — แถวเดิมของชิ้นนี้ถูกถอดออกก่อน */
export function replaceStructuralMember(
  projectId: string,
  key: string,
  targets: TakeoffTarget[],
  member: StructuralInput,
): Promise<MemberWriteResult> {
  return apiFetch(`/api/projects/${projectId}/boq/structural-members/${key}`, {
    method: "PUT",
    body: JSON.stringify({ targets, member }),
  });
}

/** คิดทุกชิ้นใหม่ด้วยชุดเสนอราคาปัจจุบัน — apply=false พรีวิวอย่างเดียว */
export function recomputeStructuralMembers(
  projectId: string,
  apply: boolean,
): Promise<{ recompute: StructuralRecomputeDto }> {
  return apiFetch(`/api/projects/${projectId}/boq/structural-members/recompute`, {
    method: "POST",
    body: JSON.stringify({ apply }),
  });
}

export function deleteStructuralMember(projectId: string, key: string): Promise<MemberWriteResult> {
  return apiFetch(`/api/projects/${projectId}/boq/structural-members/${key}`, { method: "DELETE" });
}

/** แผนตัดเหล็กหน้างาน (ชุดสั่งตัด) แยกตามขนาด เทียบเส้น 10/12 ม. */
export function getRebarCutting(projectId: string): Promise<{ cutting: RebarCuttingDto }> {
  return apiFetch(`/api/projects/${projectId}/boq/rebar-cutting`);
}

/** Excel รายการสั่งเหล็กหน้างาน (สรุปขนาด · รายชิ้นส่วน · แผนตัด) */
export const rebarBbsPath = (projectId: string) => `/api/projects/${projectId}/boq/rebar-bbs.xlsx`;

/** เทียบเหล็กเสริม ชุดเสนอราคา (ใน BOQ) กับชุดสั่งตัด ของเวอร์ชันล่าสุด */
export function getStructuralCompare(projectId: string): Promise<{ compare: StructuralCompareDto }> {
  return apiFetch(`/api/projects/${projectId}/boq/structural-compare`);
}

export function deleteBoqItem(
  projectId: string,
  itemId: string,
): Promise<{ version: ProjectVersionDto }> {
  return apiFetch(`/api/projects/${projectId}/boq/items/${itemId}`, { method: "DELETE" });
}

// ---------- นำเข้าจาก Excel (พรีวิว → ยืนยัน) ----------

export type BoqImportSyncField = "name" | "quantity" | "unit" | "materialUnitPrice" | "laborUnitPrice" | "note" | "category";

export interface BoqImportRow {
  /** id บรรทัดเดิมจากคอลัมน์ซ่อนของไฟล์ส่งออก */
  lineId: string | null;
  /** เทียบกับบรรทัดเดิม (เฉพาะไฟล์ส่งออกจากโครงการนี้) */
  sync: {
    status: "changed" | "unchanged" | "added" | "error";
    /** บรรทัดในเวอร์ชันล่าสุดที่แถวนี้แก้ */
    lineId: string | null;
    changes: { field: BoqImportSyncField; before: string | number | null; after: string | number | null }[];
  } | null;
  /** ชีตที่บรรทัดนี้มา — ไฟล์ส่งออกแยกชีตตามหมวด เลขแถวจึงซ้ำข้ามชีตได้ */
  sheet: string;
  rowNumber: number;
  code: string | null;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  quantity: number | null;
  unit: string;
  materialUnitPrice: number;
  laborUnitPrice: number;
  lineTotal: number;
  note: string | null;
  /** ข้อมูลในแถวเสีย (ปริมาณ/หน่วย/ราคา) — มี = นำเข้าไม่ได้ */
  errors: string[];
  warnings: string[];
  /** รหัสในไฟล์ไม่มีในระบบ แต่หมวดย่อยแม่มี → เสนอสร้างรหัสนี้ใต้มัน */
  newCode: { code: string; parentId: string; parentLabel: string } | null;
  /** ยังไม่รู้ว่าลงรหัสงานไหน — ต้องเลือกในพรีวิว */
  needsCategory: boolean;
  /** หมวดบนสุดที่รหัสในไฟล์ชี้ไป (ช่วยเลือก) */
  hintTop: { id: string; label: string } | null;
  /** วัสดุในคลังที่ชื่อ + หน่วยตรงเป๊ะ */
  materialMatch: { id: string; code: string | null; name: string } | null;
}

export interface BoqImportPreview {
  /** ชีตที่อ่านบรรทัดมา ตามลำดับในไฟล์ */
  sheetNames: string[];
  /** ชีตที่มีหัวตารางแต่ไม่ได้อ่าน (ไม่มีคอลัมน์ราคาทุน) */
  skippedSheets: string[];
  rows: BoqImportRow[];
  /** หัวข้อกลุ่ม/ยอดรวมในไฟล์ที่ข้าม (ไม่ใช่บรรทัดงาน) */
  skippedRows: { sheet: string; rowNumber: number; code: string | null; name: string; kind: "heading" | "total" | "empty" }[];
  /** ทุกชีตที่มีหัวตารางพร้อมราคา — ระบบเลือกให้ก่อน (ไม่เอาชีตสรุป/ชีตสำรอง) แล้วติ๊กเปลี่ยนได้ */
  sheets: { name: string; rows: number; suggested: boolean; selected: boolean; reason: string | null }[];
  /** ชุดราคาที่เลือกได้ (ไฟล์บริษัทมีสองชุดข้างกัน: ราคาในใบเสนอราคา / ต้นทุน) */
  priceSets: { index: number; label: string }[];
  priceSet: number;
  /** ปัญหาระดับชีต เช่น หาคอลัมน์ค่าแรงไม่เจอ */
  headerWarnings: string[];
  /** ไฟล์ส่งออกจากโครงการนี้ — นำเข้าเป็นการแก้ได้ */
  sync: {
    fileVersionNo: number;
    currentVersionNo: number;
    counts: { changed: number; unchanged: number; added: number; removed: number };
    removed: { lineId: string; code: string | null; name: string; quantity: number; unit: string; lineTotal: number }[];
  } | null;
  fromOtherProject: boolean;
  summary: {
    total: number;
    ready: number;
    withErrors: number;
    needsCategory: number;
    newCodes: number;
    matched: number;
    directCost: number;
  };
}

/** บรรทัดที่ส่งไปยืนยัน — รหัสงานที่มีอยู่ (categoryId) หรือสร้างใหม่ (newCategory) อย่างใดอย่างหนึ่ง */
export interface BoqImportCommitRow {
  /** sync: บรรทัดเดิมที่แถวนี้แก้ */
  lineId?: string;
  categoryId?: string;
  newCategory?: { parentId: string; code: string | null };
  materialId?: string;
  addToLibrary?: boolean;
  name: string;
  quantity: number;
  unit: string;
  materialUnitPrice: number;
  laborUnitPrice: number;
  note: string | null;
}

/** อ่านไฟล์และตรวจรายแถว — ยังไม่เขียนอะไรลงโครงการ */
export function previewBoqImport(
  projectId: string,
  file: File,
  defaultCategoryId: string | null,
  options: { priceSet?: number; sheets?: string[] | null } = {},
): Promise<BoqImportPreview> {
  const form = new FormData();
  if (defaultCategoryId) form.append("defaultCategoryId", defaultCategoryId);
  if (options.priceSet != null) form.append("priceSet", String(options.priceSet));
  if (options.sheets) form.append("sheets", JSON.stringify(options.sheets));
  form.append("file", file);
  return apiUpload(`/api/projects/${projectId}/boq/import/preview`, form);
}

export function commitBoqImport(
  projectId: string,
  body: { mode: "append" | "replace" | "sync"; rows: BoqImportCommitRow[]; removeLineIds?: string[] },
): Promise<{
  version: ProjectVersionDto;
  imported: number;
  updated: number;
  removed: number;
  createdCategories: { id: string; code: string | null; name: string }[];
  createdMaterials: { id: string; code: string; name: string }[];
  linkedMaterials: number;
}> {
  return apiFetch(`/api/projects/${projectId}/boq/import`, { method: "POST", body: JSON.stringify(body) });
}

// ---------- ทบทวนราคา: ราคาในคลังเปลี่ยน + เทียบเวอร์ชัน ----------

export function getPriceDrift(projectId: string): Promise<BoqPriceDriftDto> {
  return apiFetch(`/api/projects/${projectId}/boq/price-drift`);
}

/** ใช้ราคาในคลังตอนนี้ — เวอร์ชันที่ส่งเป็นใบเสนอราคาแล้วจะแตกเป็นเวอร์ชันใหม่ */
export function applyCatalogPrices(
  projectId: string,
  itemIds: string[],
): Promise<{ version: ProjectVersionDto; updatedCount: number; newVersion: boolean }> {
  return apiFetch(`/api/projects/${projectId}/boq/price-drift/apply`, {
    method: "POST",
    body: JSON.stringify({ itemIds }),
  });
}

/** คงราคาเดิมไว้ (บันทึกว่าพิจารณาแล้ว — ราคาในคลังเปลี่ยนอีกจะเตือนใหม่) */
export function keepCurrentPrices(projectId: string, itemIds: string[]): Promise<{ keptCount: number }> {
  return apiFetch(`/api/projects/${projectId}/boq/price-drift/keep`, {
    method: "POST",
    body: JSON.stringify({ itemIds }),
  });
}

export function compareBoqVersions(projectId: string, from: number, to: number): Promise<BoqVersionDiffDto> {
  return apiFetch(`/api/projects/${projectId}/boq/versions/compare?from=${from}&to=${to}`);
}

/** เรียงบรรทัดใหม่ — ส่ง id ครบทุกบรรทัดของเวอร์ชันล่าสุดตามลำดับที่ต้องการ */
export function reorderBoqItems(
  projectId: string,
  itemIds: string[],
): Promise<{ version: ProjectVersionDto; newVersion: boolean }> {
  return apiFetch(`/api/projects/${projectId}/boq/items/order`, {
    method: "PUT",
    body: JSON.stringify({ itemIds }),
  });
}
