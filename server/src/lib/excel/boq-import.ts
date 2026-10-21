import ExcelJS from "exceljs";

import { calculateLineAmounts } from "../pricing";
import { roundTo } from "@systemboq/shared-types";

/**
 * อ่านไฟล์ Excel เพื่อนำเข้าบรรทัด BOQ — ใช้ได้กับไฟล์ที่ส่งออกฉบับภายในของระบบเอง (แก้แล้วนำกลับเข้า)
 * แม่แบบนำเข้า และไฟล์จากที่อื่นที่หัวตารางใช้ชื่อคอลัมน์ตามที่รู้จัก
 *
 * อ่านอย่างเดียว ไม่เขียนอะไร — คืนผลรายแถวพร้อมเหตุผลที่ใช้ไม่ได้ ให้คนตรวจก่อนกดยืนยัน
 *
 * **ไม่รับไฟล์ราคาขาย** (ฉบับลูกค้ามีแค่ "ราคาต่อหน่วย" ที่บวกกำไรแล้ว) — นำเข้าเป็นราคาทุนเมื่อไร
 * กำไรจะถูกบวกซ้ำสองชั้นและราคาที่เสนอจะสูงเกินจริงโดยไม่มีใครเห็น
 */

export const IMPORT_MAX_ROWS = 2000;

export interface ImportCategory {
  id: string;
  code: string | null;
  name: string;
  /** หมวดระดับ ITEM และทั้งสายเปิดใช้งาน */
  usable: boolean;
  /** ใช้เดาที่วางรหัสงานใหม่ (ไม่ส่ง = ไม่เสนอสร้างรหัสใหม่) */
  level?: "CATEGORY" | "SUBGROUP" | "ITEM";
  parentId?: string | null;
  /** ตัวมันและทั้งสายเปิดใช้งาน */
  chainActive?: boolean;
}

/** วัสดุในคลังที่ใช้จับคู่ชื่อ — เฉพาะที่ยังใช้งานและไม่อยู่ในถังขยะ */
export interface ImportMaterial {
  id: string;
  code: string | null;
  name: string;
  unit: string;
  categoryId: string | null;
}

/** รหัสงานในไฟล์ไม่มีในระบบ แต่หมวดย่อยแม่มี → เสนอสร้างรหัสนี้ใหม่ใต้หมวดย่อยนั้น */
export interface ImportNewCode {
  code: string;
  parentId: string;
  parentLabel: string;
}

export interface ImportRow {
  /** id บรรทัดเดิมจากคอลัมน์ซ่อนของไฟล์ส่งออก (ว่าง = แถวที่เพิ่มข้างนอก หรือไฟล์จากที่อื่น) */
  lineId: string | null;
  /** ชีต + เลขแถวใน Excel — ให้คนกลับไปหาในไฟล์ได้ (ไฟล์ส่งออกของระบบแยกชีตตามหมวด เลขแถวจึงซ้ำข้ามชีตได้) */
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
  /** ปัญหาของข้อมูลในแถว (ปริมาณ/หน่วย/ราคา) — มี = นำเข้าไม่ได้จนกว่าจะแก้ไฟล์ */
  errors: string[];
  warnings: string[];
  /** ข้อเสนอสร้างรหัสงานใหม่ (เมื่อ categoryId ว่าง) */
  newCode: ImportNewCode | null;
  /** ยังไม่รู้ว่าจะลงรหัสงานไหน — คนต้องเลือกในพรีวิว (ไม่ใช่ error ของข้อมูล) */
  needsCategory: boolean;
  /** หมวดบนสุดที่รหัสในไฟล์ชี้ไป (เช่น B) — ช่วยกรองตอนเลือกเอง */
  hintTop: { id: string; label: string } | null;
  /** วัสดุในคลังที่ชื่อ + หน่วยตรงกันเป๊ะ (เสนอให้ผูก) */
  materialMatch: { id: string; code: string | null; name: string } | null;
}

/** แถวในไฟล์ที่ไม่ใช่บรรทัดงาน — หัวข้อกลุ่ม ("A งานหลังคา") หรือยอดรวม ("รวมมูลค่างาน…") · ข้าม ไม่นับเป็นข้อผิดพลาด */
export interface ImportSkippedRow {
  sheet: string;
  rowNumber: number;
  code: string | null;
  name: string;
  /** heading = หัวข้อกลุ่ม/แถวหัวตารางชั้นสอง · total = ยอดรวม/ยอดหมวด · empty = รายการที่ไม่มีทั้งปริมาณและราคา */
  kind: "heading" | "total" | "empty";
}

/** ชีตที่มีหัวตารางพร้อมคอลัมน์ราคา — ให้คนติ๊กเลือกในพรีวิวว่าจะอ่านชีตไหน */
export interface ImportSheet {
  name: string;
  /** จำนวนบรรทัดงานที่อ่านได้จากชีตนี้ */
  rows: number;
  /** ระบบเลือกให้หรือไม่ (ชีตสรุป/ชีตสำเนาไม่เลือก) — คนแก้ได้ */
  suggested: boolean;
  /** ถูกอ่านในพรีวิวนี้ */
  selected: boolean;
  /** เหตุผลที่ระบบไม่เลือกให้ (null = เลือก) */
  reason: string | null;
}

/** ชุดราคาในไฟล์ — ไฟล์ BOQ บริษัทมีสองชุดข้างกัน (ราคาในใบเสนอราคา / ต้นทุนคุมงบ) */
export interface ImportPriceSet {
  index: number;
  label: string;
}

export interface ImportOptions {
  /** ชุดราคาที่ใช้ (ไม่ส่ง = ชุดแรก = ซ้ายสุด) */
  priceSet?: number;
  /** ชีตที่ให้อ่าน (ไม่ส่ง = ตามที่ระบบเลือกให้) */
  sheets?: string[] | null;
}

export interface ImportPreview {
  /** ไฟล์ส่งออกจากระบบ (มีชีตลับ) — โครงการ/เวอร์ชันที่ส่งออก · null = ไฟล์จากที่อื่น */
  source: { projectId: string; versionId: string; versionNo: number } | null;
  /** ชีตที่อ่านบรรทัดมา ตามลำดับในไฟล์ */
  sheetNames: string[];
  /** ชีตที่มีหัวตารางแต่ไม่ได้อ่าน (ไม่มีคอลัมน์ราคาทุน) — บอกให้คนรู้ ไม่ทิ้งเงียบ ๆ */
  skippedSheets: string[];
  rows: ImportRow[];
  /** หัวข้อ/ยอดรวมที่ข้าม — ให้คนเปิดดูได้ว่าระบบข้ามอะไรไปบ้าง ไม่ทิ้งเงียบ ๆ */
  skippedRows: ImportSkippedRow[];
  /** ทุกชีตที่อ่านได้ พร้อมสถานะเลือก/ไม่เลือก */
  sheets: ImportSheet[];
  /** ชุดราคาที่เลือกได้ (มีมากกว่า 1 ชุดเมื่อไฟล์มีราคาสองชุดข้างกัน) */
  priceSets: ImportPriceSet[];
  priceSet: number;
  /** ปัญหาระดับไฟล์/ชีต เช่น ไม่พบคอลัมน์ค่าแรง — ห้ามให้ตัวเลขเป็น 0 เงียบ ๆ */
  headerWarnings: string[];
}

export class ImportFileError extends Error {}

/**
 * ชื่อหัวคอลัมน์ที่รู้จัก — เทียบแบบ "ตรงตัว" หลังตัดช่องว่าง/จุด/วงเล็บท้ายออก (ดู normalize)
 * ห้ามเทียบแบบ "มีคำนี้อยู่ข้างใน": "จำนวนเงิน" จะกลายเป็น "จำนวน" (ปริมาณ) แล้วนำเข้าตัวเลขผิดเงียบ ๆ
 * "ราคาต่อหน่วย" โดด ๆ ไม่อยู่ในนี้โดยตั้งใจ — แยกไม่ออกว่าราคาทุนหรือราคาขาย (ราคาขายนำเข้า = บวกกำไรซ้ำ)
 */
const COLUMN_NAMES = {
  code: ["รหัส", "รหัสงาน", "รหัสหมวด", "ลำดับ", "ลำดับที่", "ที่", "No", "Item", "Item No"],
  name: ["รายการ", "รายละเอียด", "รายการงาน", "รายการวัสดุ", "ชื่อรายการ", "Description"],
  quantity: ["ปริมาณ", "จำนวน", "ปริมาณงาน", "Qty", "Quantity"],
  unit: ["หน่วย", "หน่วยนับ", "Unit"],
  materialUnitPrice: [
    "ค่าวัสดุ/หน่วย",
    "ราคาวัสดุ/หน่วย",
    "ราคาวัสดุต่อหน่วย",
    "ค่าวัสดุต่อหน่วย",
    "ราคาวัสดุ",
    "Material",
    "Material Unit Price",
  ],
  laborUnitPrice: [
    "ค่าแรง/หน่วย",
    "ราคาค่าแรง/หน่วย",
    "ค่าแรงต่อหน่วย",
    "ราคาค่าแรงต่อหน่วย",
    "ราคาค่าแรง",
    "ค่าแรงงานต่อหน่วย",
    "ค่าแรงงาน/หน่วย",
    "Labor",
    "Labour",
    "Labor Unit Price",
  ],
  note: ["หมายเหตุ", "Remark", "Remarks", "Note"],
  /** คอลัมน์ซ่อนในไฟล์ส่งออกฉบับภายใน — id บรรทัดเดิมในระบบ */
  lineId: ["รหัสบรรทัด"],
} as const;

/**
 * หัวตารางสองชั้นแบบฟอร์ม BOQ ไทย (ปร.4): ชั้นบน "ค่าวัสดุ" / "ค่าแรง" (ผสานคลุมสองช่อง)
 * ชั้นล่าง "ราคาต่อหน่วย" | "จำนวนเงิน" — ช่อง "ราคาต่อหน่วย" ใต้ค่าวัสดุ = ค่าวัสดุ/หน่วย
 */
const MATERIAL_GROUP = ["ค่าวัสดุ", "วัสดุ", "ราคาวัสดุ", "ค่าวัสดุอุปกรณ์", "Material", "Materials", "Material Cost"];
const LABOR_GROUP = ["ค่าแรง", "ค่าแรงงาน", "แรงงาน", "ราคาค่าแรง", "Labor", "Labour", "Labor Cost", "Labour Cost"];
const UNIT_PRICE_SUB = ["ราคาต่อหน่วย", "ราคา/หน่วย", "หน่วยละ", "ต่อหน่วย", "ราคา", "Unit Price", "Rate", "Price/Unit"];

type ColumnKey = keyof typeof COLUMN_NAMES;
type HeaderColumns = Partial<Record<ColumnKey, number>>;
/** ทุกคอลัมน์ที่จับได้ของแต่ละชนิด เรียงซ้ายไปขวา — ใช้แยกชุดราคาที่ซ้ำกันข้างกัน */
type HeaderAll = Partial<Record<ColumnKey, number[]>>;

function record(columns: HeaderColumns, all: HeaderAll, key: ColumnKey, col: number) {
  columns[key] ??= col;
  const list = all[key] ?? [];
  list.push(col);
  all[key] = list;
}

/** ตัดวงเล็บพร้อมข้อความข้างใน — ไล่ทีละตัวแทน regex ที่ย้อนลองได้หลายทาง · "(" ที่ไม่มี ")" ปิดตามมาเก็บไว้ตามเดิม */
function stripParens(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const close = s[i] === "(" ? s.indexOf(")", i + 1) : -1;
    if (close >= 0) {
      i = close + 1;
    } else {
      out += s[i];
      i++;
    }
  }
  return out;
}

/** ตัดช่องว่าง จุด โคลอน และวงเล็บต่อท้ายเช่น "(บาท)" ออก แล้วเป็นตัวพิมพ์เล็ก — "No." = "no" · "ค่าวัสดุ (บาท)" = "ค่าวัสดุ" */
const normalize = (s: string) =>
  stripParens(s)
    .replace(/[\s.:]+/g, "")
    .toLowerCase();

const inList = (list: readonly string[], text: string) => text !== "" && list.some((n) => normalize(n) === text);

function keyOf(text: string): ColumnKey | null {
  if (!text) return null;
  for (const key of Object.keys(COLUMN_NAMES) as ColumnKey[]) if (inList(COLUMN_NAMES[key], text)) return key;
  return null;
}

/** ค่าในช่องเป็นข้อความ — สูตรใช้ผลที่คำนวณไว้, ลิงก์/ข้อความหลายรูปแบบเอาแค่ตัวอักษร */
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((t) => t.text).join("").trim();
    if ("text" in value) return String(value.text).trim();
  }
  return "";
}

/** ค่าตัวเลข — รับทั้งตัวเลขจริง ผลของสูตร และข้อความแบบ "1,234.50" · ว่าง = null · อ่านไม่ออก = NaN */
function cellNumber(value: ExcelJS.CellValue): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "result" in value) return cellNumber(value.result as ExcelJS.CellValue);
  const text = cellText(value).replaceAll(",", "");
  if (text === "" || text === "-" || text === "—") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** ข้อความหัวคอลัมน์ (normalize แล้ว) — ช่องที่ถูกผสาน (merge) ใช้ข้อความของช่องหลัก */
function headerText(ws: ExcelJS.Worksheet, row: number, col: number): string {
  const cell = ws.getCell(row, col);
  return normalize(cellText((cell.isMerged ? cell.master : cell).value));
}

const hasCostColumn = (c: HeaderColumns) => c.materialUnitPrice !== undefined || c.laborUnitPrice !== undefined;

/** หัวตารางแถวเดียว */
function singleRowHeader(ws: ExcelJS.Worksheet, r: number) {
  const columns: HeaderColumns = {};
  const all: HeaderAll = {};
  let salePrice = false;
  ws.getRow(r).eachCell((cell, col) => {
    const text = normalize(cellText(cell.value));
    const key = keyOf(text);
    if (key) record(columns, all, key, col);
    if (inList(["ราคาต่อหน่วย", "ราคา/หน่วย"], text)) salePrice = true;
  });
  return { columns, all, salePrice };
}

/**
 * หัวตารางสองชั้น (แถว r + r+1) — ช่องใต้ "ค่าวัสดุ"/"ค่าแรง" ตัดสินจากชั้นล่างเท่านั้น
 * ("ราคาต่อหน่วย" = ราคา/หน่วย · "จำนวนเงิน" = ยอดเงิน ไม่ใช้) ห้ามตกไปจับชื่อชั้นบน ไม่งั้นคอลัมน์จำนวนเงิน
 * ใต้ "ราคาวัสดุ" จะกลายเป็นราคาต่อหน่วย · ช่องอื่นที่ผสานสองชั้น (รายการ/จำนวน/หน่วย) อ่านชื่อได้ทั้งบนและล่าง
 */
function twoRowHeader(ws: ExcelJS.Worksheet, r: number): { columns: HeaderColumns; all: HeaderAll; viaGroup: boolean } {
  const columns: HeaderColumns = {};
  const all: HeaderAll = {};
  // จับราคาได้จาก "ชั้นบนเป็นกลุ่ม + ชั้นล่างเป็นราคา/หน่วย" จริง ๆ ไหม — ใช่ = แถวล่างคือหัวชั้นสอง ไม่ใช่ข้อมูล
  let viaGroup = false;
  const width = Math.max(ws.getRow(r).cellCount, ws.getRow(r + 1).cellCount);
  // หัวกลุ่มที่ไม่ได้ผสานช่อง: ชื่อ "ค่าวัสดุ" อยู่ช่องแรกช่องเดียว ช่องถัดไปว่าง → ช่องว่างข้างบนที่มีหัวชั้นล่าง
  // ถือว่าอยู่กลุ่มเดียวกับช่องซ้าย
  let carried = "";
  for (let col = 1; col <= width; col++) {
    const sub = headerText(ws, r + 1, col);
    const ownTop = headerText(ws, r, col);
    if (ownTop) carried = ownTop;
    const top = ownTop || (sub ? carried : "");
    const { key, fromGroup } = twoRowKey(top, sub);
    if (fromGroup) viaGroup = true;
    if (key && !mergedFromLeft(ws, r + 1, col)) record(columns, all, key, col);
  }
  return { columns, all, viaGroup };
}

/** หัวกลุ่มราคา "ค่าวัสดุ" / "ค่าแรง" → คอลัมน์ที่ช่องชั้นล่างของมันเป็นราคาต่อหน่วย */
function groupKeyOf(top: string): ColumnKey | null {
  if (inList(MATERIAL_GROUP, top)) return "materialUnitPrice";
  if (inList(LABOR_GROUP, top)) return "laborUnitPrice";
  return null;
}

/** ชนิดคอลัมน์ของช่องหัวสองชั้น — ใต้หัวกลุ่มราคาตัดสินจากชั้นล่างเท่านั้น (fromGroup = จับราคาผ่านกลุ่มได้จริง) */
function twoRowKey(top: string, sub: string): { key: ColumnKey | null; fromGroup: boolean } {
  const group = groupKeyOf(top);
  if (group && sub !== top) {
    const key = inList(UNIT_PRICE_SUB, sub) ? group : null;
    return { key, fromGroup: key !== null };
  }
  return { key: keyOf(sub) ?? keyOf(top) ?? keyOf(top + sub), fromGroup: false };
}

/**
 * ช่องที่ผสานต่อจากช่องซ้าย (คอลัมน์ของช่องหลักไม่ใช่คอลัมน์นี้) ไม่นับซ้ำ — "ราคาวัสดุ" ผสานสองช่องคือหัวเดียว
 * ผสานแนวตั้ง ("รายการ" แถว 3–4) ยังเป็นคอลัมน์เดียวกัน ต้องนับ
 */
function mergedFromLeft(ws: ExcelJS.Worksheet, row: number, col: number): boolean {
  const cell = ws.getCell(row, col);
  const colOf = (address: string) => address.replace(/\d+/g, "");
  return cell.isMerged && colOf(cell.master.address) !== colOf(cell.address);
}

type FoundHeader = { row: number; top: number; columns: HeaderColumns; all: HeaderAll; salePriceOnly: boolean };

function findHeader(ws: ExcelJS.Worksheet): FoundHeader | null {
  const last = Math.min(ws.rowCount, 60);
  const complete = (c: HeaderColumns) => c.name !== undefined && c.quantity !== undefined && hasCostColumn(c);
  // หัวสองชั้นแบบ ปร.4 ที่เริ่มแถวถัดไป — ถ้ามี ต้องใช้อันนั้น ไม่ใช่จับแถวนี้คู่กับแถวถัดไป
  // (ไฟล์บริษัท: แถว 2 "โครงการ :" + แถว 3 "รายการ/จำนวน/ราคาวัสดุ/ค่าแรงงาน" ครบพอให้ผ่าน แต่ "ค่าแรงงาน"
  // เป็นหัวกลุ่ม ต้องอ่านคู่กับแถว 4 "หน่วยละ" — เดิมรับคู่ 2+3 ไปก่อน ค่าแรงทั้งไฟล์เป็น 0 เงียบ ๆ)
  const groupedAt = (r: number) => {
    if (r >= last) return null;
    const two = twoRowHeader(ws, r);
    return two.viaGroup && complete(two.columns) ? two : null;
  };
  for (let r = 1; r <= last; r++) {
    const hit = headerAt(ws, r, last, complete, groupedAt);
    if (hit) return hit;
  }
  return null;
}

/** หัวตารางที่เริ่มแถว r (หรือแถวถัดไปถ้าเป็นหัวสองชั้นแบบ ปร.4) — ไม่ใช่ = null */
function headerAt(
  ws: ExcelJS.Worksheet,
  r: number,
  last: number,
  complete: (c: HeaderColumns) => boolean,
  groupedAt: (r: number) => ReturnType<typeof twoRowHeader> | null,
): FoundHeader | null {
  const single = singleRowHeader(ws, r);
  const two = r < last ? twoRowHeader(ws, r) : null;
  // หัวสองชั้นที่จับราคาผ่านกลุ่ม (ค่าวัสดุ → ราคาต่อหน่วย) มาก่อนหัวแถวเดียวเสมอ — ไม่งั้นชั้นบน "ราคาวัสดุ"
  // ถูกรับเป็นหัวแถวเดียว แล้วคอลัมน์ "จำนวนเงิน" ใต้มันกลายเป็นราคาต่อหน่วย (ตัวเลขผิดเงียบ ๆ)
  if (two?.viaGroup && complete(two.columns)) return { row: r + 1, top: r, columns: two.columns, all: two.all, salePriceOnly: false };
  const next = groupedAt(r + 1);
  if (next) return { row: r + 2, top: r + 1, columns: next.columns, all: next.all, salePriceOnly: false };
  if (complete(single.columns)) return { row: r, top: r, columns: single.columns, all: single.all, salePriceOnly: false };
  // แถวเดียวยังไม่ครบราคา → ลองอ่านรวมกับแถวถัดไปเป็นหัวสองชั้น (บรรทัดข้อมูลเริ่มหลังแถวล่าง)
  if (two && complete(two.columns)) return { row: r + 1, top: r, columns: two.columns, all: two.all, salePriceOnly: false };
  if (single.columns.name !== undefined && single.columns.quantity !== undefined) {
    return { row: r, top: r, columns: single.columns, all: single.all, salePriceOnly: single.salePrice };
  }
  return null;
}

const colLetter = (col: number) => {
  let s = "";
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCodePoint(65 + ((n - 1) % 26)) + s;
  return s;
};

/**
 * ชุดราคาที่วางข้างกัน (ราคาเสนอ C–I / ต้นทุน L–R) — ชุดที่ i ใช้คอลัมน์ราคา/ปริมาณ/หน่วยลำดับที่ i
 * ชื่อชุดอ่านจากแถวเหนือหัวตาราง (เช่น "ต้นทุน") ไม่มี = "ชุดที่ n"
 */
function priceSetsOf(ws: ExcelJS.Worksheet, h: FoundHeader): { label: string; columns: HeaderColumns }[] {
  const mats = h.all.materialUnitPrice ?? [];
  const labs = h.all.laborUnitPrice ?? [];
  const count = Math.max(mats.length, labs.length, 1);
  const sets: { label: string; columns: HeaderColumns }[] = [];
  for (let i = 0; i < count; i++) {
    const columns: HeaderColumns = {
      ...h.columns,
      materialUnitPrice: mats[i],
      laborUnitPrice: labs[i],
      quantity: h.all.quantity?.[i] ?? h.columns.quantity,
      unit: h.all.unit?.[i] ?? h.columns.unit,
    };
    const priceCols = [columns.materialUnitPrice, columns.laborUnitPrice].filter((c): c is number => c !== undefined);
    const label = labelAbove(ws, h, priceCols) || defaultSetLabel(count, i);
    const span = [columns.quantity, ...priceCols].filter((c): c is number => c !== undefined);
    const range = span.length ? `คอลัมน์ ${colLetter(Math.min(...span))}–${colLetter(Math.max(...span))}` : "";
    sets.push({ label: [label, range].filter(Boolean).join(" · "), columns });
  }
  return sets;
}

/** ป้ายเหนือหัวตาราง (ช่องหลักของช่องที่ผสาน) — ข้อความสั้นที่ไม่ใช่ชื่อคอลัมน์ เช่น "ต้นทุน" · ไม่มี = "" */
function labelAbove(ws: ExcelJS.Worksheet, h: FoundHeader, priceCols: number[]): string {
  if (h.top <= 1 || priceCols.length === 0) return "";
  const cell = ws.getCell(h.top - 1, priceCols[0]);
  const text = cellText((cell.isMerged ? cell.master : cell).value).trim();
  return text && text.length <= 30 && !keyOf(normalize(text)) ? text : "";
}

function defaultSetLabel(count: number, i: number): string {
  if (count === 1) return "ชุดราคาเดียว";
  return i === 0 ? "ชุดซ้าย" : `ชุดที่ ${i + 1}`;
}

/** ชื่อเทียบคลัง: ตัดช่องว่างซ้ำ ไม่สนตัวพิมพ์ · หน่วย: ตัดจุดและช่องว่าง ("ลบ.ม." = "ลบม") */
const nameKey = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const unitKey = (s: string) => s.replace(/[\s.]/g, "").toLowerCase();

/**
 * วัสดุในคลังที่ชื่อและหน่วยตรงกับแถว "เป๊ะ" — ชื่อคล้าย ๆ ไม่นับ (ผูกผิดแล้วราคา/การเตือนเพี้ยนเงียบ ๆ)
 * ตรงหลายตัว: เลือกตัวที่อยู่รหัสงานเดียวกับแถว · ยังเหลือหลายตัว = ไม่เดา
 */
function matchMaterial(materials: ImportMaterial[], name: string, unit: string, categoryId: string | null) {
  const hits = materials.filter((m) => nameKey(m.name) === nameKey(name) && unitKey(m.unit) === unitKey(unit));
  if (hits.length <= 1) return hits[0] ?? null;
  const same = hits.filter((m) => m.categoryId === categoryId);
  return same.length === 1 ? same[0] : null;
}

/**
 * รหัสในไฟล์ไม่มีในระบบ: ไล่ตัดท้ายรหัสหาหมวดแม่ที่มีจริง (B-04-15 → B-04 → B)
 * แม่เป็นหมวดย่อยที่ใช้งานได้ = เสนอสร้างรหัสนี้ใต้มัน · เจอแค่หมวดบนสุด = บอกใบ้ให้เลือกในหมวดนั้น
 */
function suggestPlacement(code: string, byCode: Map<string, ImportCategory>, byId: Map<string, ImportCategory>) {
  const parts = code.toUpperCase().split("-");
  for (let k = parts.length - 1; k >= 1; k--) {
    const ancestor = byCode.get(parts.slice(0, k).join("-"));
    if (!ancestor) continue;
    const label = `${ancestor.code ?? ""} ${ancestor.name}`.trim();
    if (ancestor.level === "SUBGROUP" && ancestor.chainActive !== false && k === parts.length - 1) {
      return { newCode: { code: code.toUpperCase(), parentId: ancestor.id, parentLabel: label }, hintTop: topOf(ancestor, byId) };
    }
    return { newCode: null, hintTop: topOf(ancestor, byId) };
  }
  return { newCode: null, hintTop: null };
}

function topOf(c: ImportCategory, byId: Map<string, ImportCategory>) {
  let top = c;
  for (let p = top.parentId ? byId.get(top.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) top = p;
  return { id: top.id, label: `${top.code ?? ""} ${top.name}`.trim() };
}

/** ชีตลับของไฟล์ส่งออก (_systemboq) — คีย์/ค่า สองคอลัมน์ · ไม่ครบ = ถือว่าไม่ใช่ไฟล์จากระบบ */
function readSource(wb: ExcelJS.Workbook): ImportPreview["source"] {
  const ws = wb.getWorksheet("_systemboq");
  if (!ws) return null;
  const values = new Map<string, string>();
  ws.eachRow((row) => values.set(cellText(row.getCell(1).value), cellText(row.getCell(2).value)));
  const projectId = values.get("projectId");
  const versionId = values.get("versionId");
  const versionNo = Number(values.get("versionNo"));
  return projectId && versionId && Number.isFinite(versionNo) ? { projectId, versionId, versionNo } : null;
}

const SUMMARY_WORDS = /^(รวม|ยอด|ภาษี|ส่วนลด|ค่าดำเนินการ|ค่าเผื่อ|ค่างานต้นทุน|ราคากลาง)/;

/**
 * แถวที่ไม่ใช่บรรทัดงาน (null = บรรทัดงาน ตรวจข้อมูลตามปกติ)
 * - ยอดรวม: ขึ้นต้นด้วย "รวม/ยอด/ภาษี/…" และช่องปริมาณไม่มีตัวเลข
 * - หัวข้อ: มีแต่ชื่อ — ไม่มีปริมาณ หน่วย และราคาเลยสักช่อง (ไฟล์ BOQ บริษัทใช้คั่นกลุ่มงาน)
 * แถวที่กรอกมาบางช่อง (เช่น มีราคาแต่ไม่มีปริมาณ) ยังเป็นบรรทัดงานที่ข้อมูลไม่ครบ → ขึ้นข้อผิดพลาดให้แก้
 */
function skipKind(
  name: string,
  quantity: number | null,
  unit: string,
  mat: number | null,
  lab: number | null,
  headings: Set<string>,
): ImportSkippedRow["kind"] | null {
  if ((quantity == null || Number.isNaN(quantity)) && SUMMARY_WORDS.test(name)) return "total";
  if (quantity == null && !unit && mat == null && lab == null) return "heading";
  // แถวหัวตารางชั้นสองที่ซ้ำชื่อหัว ("รายการ" / "จำนวน" ...) — ไม่ใช่งาน
  if (keyOf(normalize(name)) === "name") return "heading";
  // ยอดรวมหมวด: ชื่อซ้ำหัวข้อที่ผ่านมาในชีต + ไม่มีราคาต่อหน่วย (เช่น "หมวดงานเตรียมการ | 1 | งาน | | | 81,920")
  if (headings.has(nameKey(name)) && mat == null && lab == null) return "total";
  // รายการที่ไม่ได้ใช้: มีชื่อ+หน่วย แต่ไม่มีทั้งปริมาณและราคา (แบบฟอร์มที่เว้นไว้)
  if ((quantity == null || quantity === 0) && mat == null && lab == null) return "empty";
  return null;
}

/** ชีตสรุป: ชื่อชีตมี "สรุป" หรือทุกบรรทัดที่อ่านได้ขึ้นต้นด้วย "หมวด" (แถวระดับหมวดล้วน) */
function summaryReason(sheetName: string, rowNames: string[]): string | null {
  if (/สรุป|summary/i.test(sheetName)) return "ชีตสรุป";
  if (rowNames.length > 0 && rowNames.every((n) => n.trim().startsWith("หมวด"))) return "มีแต่ยอดระดับหมวด (ชีตสรุป)";
  return null;
}

const COPY_WORDS = /สำรอง|สำเนา|\bcopy\b|\bold\b|เก่า/i;

/** มีคำว่า back up / back-up / backup ไหม — ไล่หาเองแทน regex `back\s*-?\s*up` ที่ย้อนลองได้หลายทาง */
function mentionsBackup(name: string): boolean {
  const lower = name.toLowerCase();
  for (let at = lower.indexOf("back"); at >= 0; at = lower.indexOf("back", at + 1)) {
    let j = at + 4;
    while (j < lower.length && lower[j].trim() === "") j++;
    if (lower[j] === "-") j++;
    while (j < lower.length && lower[j].trim() === "") j++;
    if (lower.startsWith("up", j)) return true;
  }
  return false;
}

/** ชื่อชีตที่บอกว่าเป็นฉบับสำรอง/สำเนา (ไฟล์บริษัทมี "BOQ (BackUp)" ที่เป็น BOQ เก่าทั้งชุด) */
const isCopySheet = (name: string) => mentionsBackup(name) || COPY_WORDS.test(name);

/** ชีตสำเนา: ชื่อบรรทัดซ้ำกับชีตที่อยู่ก่อนหน้าเกือบทั้งหมด (เช่น "BOQ (BackUp)") — อ่านทั้งคู่ = ยอดเบิ้ลสองเท่า */
function duplicateOf(rowNames: string[], earlier: { name: string; names: Set<string> }[]): string | null {
  if (rowNames.length < 5) return null;
  const mine = new Set(rowNames.map(nameKey));
  for (const e of earlier) {
    // หารด้วยชีตที่ใหญ่กว่า — ชีตเล็ก 3 บรรทัดที่บังเอิญชื่อซ้ำกับชีตใหญ่ไม่นับว่าเป็นสำเนา
    if (e.names.size < 5) continue;
    let same = 0;
    for (const n of mine) if (e.names.has(n)) same++;
    if (same / Math.max(mine.size, e.names.size) >= 0.8) return e.name;
  }
  return null;
}

type SheetContext = {
  byCode: Map<string, ImportCategory>;
  byId: Map<string, ImportCategory>;
  fallback: ImportCategory | null;
  materials: ImportMaterial[];
};

/** ข้อมูลในแถวที่ใช้ไม่ได้ (ชื่อ/ปริมาณ/หน่วย/ราคา) — ว่าง = แถวนี้ใช้ได้ */
function rowErrors(name: string, quantity: number | null, unit: string, mat: number | null, lab: number | null): string[] {
  const errors: string[] = [];
  if (name.length > 300) errors.push("ชื่อรายการยาวเกิน 300 ตัวอักษร");
  if (quantity == null) errors.push("ไม่มีปริมาณ");
  else if (Number.isNaN(quantity)) errors.push("ปริมาณไม่ใช่ตัวเลข");
  else if (quantity <= 0) errors.push("ปริมาณต้องมากกว่า 0");
  if (!unit) errors.push("ไม่มีหน่วย");
  if (Number.isNaN(mat) || Number.isNaN(lab)) errors.push("ราคาไม่ใช่ตัวเลข");
  else if ((mat ?? 0) < 0 || (lab ?? 0) < 0) errors.push("ราคาติดลบไม่ได้");
  else if (mat == null && lab == null) errors.push("ไม่มีราคาวัสดุและค่าแรง");
  return errors;
}

type Placement = {
  category: ImportCategory | null;
  newCode: ImportNewCode | null;
  hintTop: ImportRow["hintTop"];
  material: ImportMaterial | null;
};

/**
 * ลำดับการหารหัสงาน: รหัสในไฟล์ตรง → วัสดุในคลังชื่อ+หน่วยตรง (ใช้รหัสงานของวัสดุนั้น) →
 * เสนอสร้างรหัสใหม่ใต้หมวดย่อยแม่ (B) → หมวดสำรองที่เลือกไว้ → ให้คนเลือกในพรีวิว (D)
 */
function placeRow(code: string | null, name: string, unit: string, ctx: SheetContext, warnings: string[]): Placement {
  const { byCode, byId, materials } = ctx;
  let category: ImportCategory | null = null;
  const matched = code ? byCode.get(code.toUpperCase()) : undefined;
  if (matched?.usable) category = matched;
  const material = matchMaterial(materials, name, unit, category?.id ?? null);
  const viaMaterial = material?.categoryId ? byId.get(material.categoryId) : undefined;
  if (!category && viaMaterial?.usable) {
    category = viaMaterial;
    // ไม่มีรหัสในไฟล์ = ไม่มีอะไรให้เตือน (หน้าจอแสดงป้าย "✓ MAT-xxxx" แทน)
    if (code) warnings.push(`รหัส ${code} ไม่มีในระบบ — ใช้รหัสงานของ ${material?.code ?? "วัสดุ"} ที่ชื่อตรงกันแทน`);
  }
  if (category) return { category, newCode: null, hintTop: null, material };
  return { ...placeWithoutCategory(code, matched, ctx, warnings), material };
}

/** ยังไม่ได้รหัสงาน: เสนอรหัสใหม่ใต้หมวดย่อยแม่ → หมวดสำรองที่เลือกไว้ → ให้คนเลือก (พร้อมบอกเหตุผล) */
function placeWithoutCategory(
  code: string | null,
  matched: ImportCategory | undefined,
  ctx: SheetContext,
  warnings: string[],
): Omit<Placement, "material"> {
  let newCode: ImportNewCode | null = null;
  let hintTop: ImportRow["hintTop"] = null;
  if (code) {
    const placement = matched ? { newCode: null, hintTop: topOf(matched, ctx.byId) } : suggestPlacement(code, ctx.byCode, ctx.byId);
    newCode = placement.newCode;
    hintTop = placement.hintTop;
  }
  if (newCode) return { category: null, newCode, hintTop };
  if (ctx.fallback) {
    if (code) warnings.push(`รหัส ${code} ${matched ? "ไม่ใช่หมวดระดับรายการหรือถูกปิดใช้งาน" : "ไม่มีในระบบ"} — ใส่ในหมวดที่เลือกไว้`);
    return { category: ctx.fallback, newCode: null, hintTop };
  }
  if (code) warnings.push(matched ? `รหัส ${code} ไม่ใช่หมวดระดับรายการ หรือถูกปิดใช้งาน` : `ไม่พบหมวดงานรหัส ${code}`);
  return { category: null, newCode: null, hintTop };
}

/** ค่าที่อ่านได้จากหนึ่งแถว */
type RowCells = {
  name: string;
  quantity: number | null;
  unit: string;
  mat: number | null;
  lab: number | null;
  code: string | null;
  lineId: string | null;
  note: string | null;
};

function importRowOf(sheet: string, rowNumber: number, c: RowCells, ctx: SheetContext): ImportRow {
  const errors = rowErrors(c.name, c.quantity, c.unit, c.mat, c.lab);
  const warnings: string[] = [];
  const { category, newCode, hintTop, material } = placeRow(c.code, c.name, c.unit, ctx, warnings);
  const materialUnitPrice = Number.isFinite(c.mat) && c.mat != null ? roundTo(c.mat, 2) : 0;
  const laborUnitPrice = Number.isFinite(c.lab) && c.lab != null ? roundTo(c.lab, 2) : 0;
  const qty = c.quantity != null && Number.isFinite(c.quantity) && c.quantity > 0 ? roundTo(c.quantity, 3) : null;
  return {
    lineId: c.lineId,
    sheet,
    rowNumber,
    code: c.code,
    categoryId: category?.id ?? null,
    categoryName: category ? `${category.code ?? ""} ${category.name}`.trim() : null,
    name: c.name.slice(0, 300),
    quantity: qty,
    unit: c.unit,
    materialUnitPrice,
    laborUnitPrice,
    lineTotal: qty != null && errors.length === 0 ? calculateLineAmounts({ quantity: qty, materialUnitPrice, laborUnitPrice }).lineTotal : 0,
    note: c.note,
    errors,
    warnings,
    newCode,
    needsCategory: !category && !newCode,
    hintTop,
    materialMatch: material ? { id: material.id, code: material.code, name: material.name } : null,
  };
}

/** อ่านบรรทัดของชีตเดียวด้วยคอลัมน์ชุดที่เลือก — ยังไม่ตัดสินว่าจะเอาชีตนี้หรือไม่ */
function parseSheet(
  ws: ExcelJS.Worksheet,
  headerRow: number,
  col: HeaderColumns,
  ctx: SheetContext,
): { rows: ImportRow[]; skipped: ImportSkippedRow[] } {
  const rows: ImportRow[] = [];
  const skipped: ImportSkippedRow[] = [];
  // หัวข้อที่ผ่านมาในชีต — แถวที่ชื่อซ้ำหัวข้อและไม่มีราคาต่อหน่วย = ยอดรวมของหมวดนั้น
  const headings = new Set<string>();
  const get = (row: ExcelJS.Row, key: ColumnKey) => (col[key] === undefined ? null : row.getCell(col[key]!).value);
  // ช่องที่ถูกผสาน (merge) จากช่องอื่น = ว่าง — ไม่งั้น "รวมมูลค่างาน…" ที่ผสานยาวทั้งแถว
  // จะถูกอ่านเป็นปริมาณ/หน่วยที่เป็นข้อความ · ชื่อรายการยังอ่านจากช่องหลักได้ (หัวข้อที่ผสานรหัส+ชื่อ)
  const own = (row: ExcelJS.Row, key: ColumnKey) => {
    if (col[key] === undefined) return null;
    const cell = row.getCell(col[key]!);
    return cell.type === ExcelJS.ValueType.Merge ? null : cell.value;
  };
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (row.hidden) continue;
    const name = cellText(get(row, "name"));
    if (!name) continue;
    const cells: RowCells = {
      name,
      quantity: cellNumber(own(row, "quantity")),
      unit: cellText(own(row, "unit")),
      mat: cellNumber(own(row, "materialUnitPrice")),
      lab: cellNumber(own(row, "laborUnitPrice")),
      code: cellText(own(row, "code")) || null,
      lineId: cellText(own(row, "lineId")) || null,
      note: null,
    };
    // แถวที่มีรหัสบรรทัดเดิมเป็นบรรทัดงานเสมอ — ข้ามไปจะกลายเป็น "บรรทัดหายจากไฟล์" แล้วถูกเสนอให้ลบ
    const kind = cells.lineId ? null : skipKind(name, cells.quantity, cells.unit, cells.mat, cells.lab, headings);
    if (kind) {
      if (kind === "heading") headings.add(nameKey(name));
      skipped.push({ sheet: ws.name, rowNumber: r, code: cells.code, name: name.slice(0, 300), kind });
      continue;
    }
    if (rows.length >= IMPORT_MAX_ROWS) {
      throw new ImportFileError(`ไฟล์มีรายการเกิน ${IMPORT_MAX_ROWS.toLocaleString("th-TH")} บรรทัด — แบ่งเป็นหลายไฟล์แล้วนำเข้าทีละไฟล์`);
    }
    cells.note = cellText(get(row, "note")) || null;
    rows.push(importRowOf(ws.name, r, cells, ctx));
  }
  return { rows, skipped };
}

/**
 * อ่าน "ทุกชีต" ที่มีหัวตาราง "รายการ" + "ปริมาณ" ตามลำดับในไฟล์ — ไฟล์ส่งออกของระบบแยกชีตตามหมวด
 * (หมวดยาวต่อหลายชีต) อ่านแค่ชีตแรกจะได้บรรทัดไม่ครบโดยไม่มีใครรู้ · ชีตใบถอดแบบ/รายการสั่งซื้อ
 * ไม่มีหัวตารางคู่นี้จึงไม่ถูกอ่าน · ชีตที่ซ่อนอยู่ข้าม (คนเปิดไฟล์มองไม่เห็น ไม่ควรถูกนำเข้าแบบลับ ๆ)
 */
function sheetsWithHeader(wb: ExcelJS.Workbook): { ws: ExcelJS.Worksheet; header: FoundHeader }[] {
  const found: { ws: ExcelJS.Worksheet; header: FoundHeader }[] = [];
  for (const ws of wb.worksheets) {
    if (ws.state !== undefined && ws.state !== "visible") continue;
    const header = findHeader(ws);
    if (header) found.push({ ws, header });
  }
  if (found.length === 0) {
    throw new ImportFileError(
      'ไม่พบหัวตารางในไฟล์ — ต้องมีคอลัมน์ชื่องาน ("รายการ" / "รายละเอียด" / "Description") และจำนวน ("ปริมาณ" / "จำนวน" / "Qty")',
    );
  }
  return found;
}

/** ชีตที่มีคอลัมน์ราคาทุน — ไม่มีเลยสักชีต = บอกเหตุ (ไฟล์ราคาขายของลูกค้า / ไม่มีคอลัมน์ราคา) */
function costSheetsOf(found: { ws: ExcelJS.Worksheet; header: FoundHeader }[]) {
  const costSheets = found.filter((x) => hasCostColumn(x.header.columns));
  if (costSheets.length > 0) return costSheets;
  if (found.some((x) => x.header.salePriceOnly)) {
    throw new ImportFileError(
      'ไฟล์นี้มีแต่ "ราคาต่อหน่วย" ซึ่งเป็นราคาขาย (ฉบับลูกค้า) — นำเข้าเป็นราคาทุนไม่ได้ เพราะกำไรจะถูกบวกซ้ำ ใช้ไฟล์ฉบับภายในหรือแม่แบบนำเข้า',
    );
  }
  throw new ImportFileError(
    'ไม่พบคอลัมน์ราคาทุน — ต้องมี "ค่าวัสดุ/หน่วย" หรือ "ค่าแรง/หน่วย" (หรือ "ราคาวัสดุ" / "ราคาค่าแรง") หรือหัวสองชั้นแบบ ปร.4: "ค่าวัสดุ" / "ค่าแรง" แล้วแถวล่างเป็น "ราคาต่อหน่วย"',
  );
}

/** ระบบเลือกชีตให้ก่อน: ไม่เอาชีตสรุป ชีตสำเนาของชีตที่เลือกไปแล้ว และชีตที่ไม่มีบรรทัดงาน */
function sheetChoices(parsed: { ws: ExcelJS.Worksheet; rows: ImportRow[] }[], picked: string[] | null | undefined): ImportSheet[] {
  const kept: { name: string; names: Set<string> }[] = [];
  return parsed.map((p) => {
    const names = p.rows.map((r) => r.name);
    const reason = sheetSkipReason(p.ws.name, names, kept);
    if (!reason) kept.push({ name: p.ws.name, names: new Set(names.map(nameKey)) });
    const suggested = reason === null;
    return {
      name: p.ws.name,
      rows: p.rows.length,
      suggested,
      selected: picked ? picked.includes(p.ws.name) : suggested,
      reason,
    };
  });
}

function sheetSkipReason(sheetName: string, names: string[], kept: { name: string; names: Set<string> }[]): string | null {
  const summary = summaryReason(sheetName, names);
  if (summary) return summary;
  if (isCopySheet(sheetName)) return "ชื่อชีตบอกว่าเป็นฉบับสำรอง/สำเนา";
  const dup = duplicateOf(names, kept);
  if (dup) return `ซ้ำกับชีต "${dup}"`;
  return names.length === 0 ? "ไม่มีบรรทัดงาน" : null;
}

/** ห้ามให้ราคาฝั่งไหนเป็น 0 เงียบ ๆ เพราะหาคอลัมน์ไม่เจอ · ชีตที่ไม่มีชุดราคาที่เลือกต้องบอก */
function priceSetWarnings(
  chosen: { ws: ExcelJS.Worksheet; set: { columns: HeaderColumns }; sets: unknown[] }[],
  requested: number,
  firstSetCount: number,
): string[] {
  const out: string[] = [];
  for (const p of chosen) {
    if (p.sets.length <= requested && firstSetCount > 1) out.push(`ชีต "${p.ws.name}" มีราคาชุดเดียว — ใช้ชุดนั้นแทนชุดที่เลือก`);
    if (p.set.columns.laborUnitPrice === undefined) out.push(`ชีต "${p.ws.name}": ไม่พบคอลัมน์ค่าแรง — ค่าแรงทุกบรรทัดจะเป็น 0`);
    if (p.set.columns.materialUnitPrice === undefined) out.push(`ชีต "${p.ws.name}": ไม่พบคอลัมน์ราคาวัสดุ — ราคาวัสดุทุกบรรทัดจะเป็น 0`);
  }
  return out;
}

export async function parseBoqImport(
  buffer: Buffer,
  categories: ImportCategory[],
  defaultCategoryId: string | null,
  materials: ImportMaterial[] = [],
  options: ImportOptions = {},
): Promise<ImportPreview> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ImportFileError("เปิดไฟล์ไม่ได้ — ต้องเป็นไฟล์ Excel นามสกุล .xlsx");
  }

  const found = sheetsWithHeader(wb);
  const costSheets = costSheetsOf(found);

  const ctx = {
    byCode: new Map(categories.filter((c) => c.code).map((c) => [c.code!.trim().toUpperCase(), c])),
    byId: new Map(categories.map((c) => [c.id, c])),
    fallback: defaultCategoryId ? categories.find((c) => c.id === defaultCategoryId && c.usable) ?? null : null,
    materials,
  };

  // ชุดราคา: แต่ละชีตมีชุดของตัวเอง ชีตที่มีชุดเดียวใช้ชุดนั้นเสมอ · ตัวเลือกที่แสดงมาจากชีตแรกที่ถูกอ่าน
  const setsOf = new Map(costSheets.map((x) => [x.ws, priceSetsOf(x.ws, x.header)]));
  const requested = Math.max(Math.trunc(options.priceSet ?? 0), 0);
  const headerWarnings: string[] = [];

  const parsed = costSheets.map(({ ws, header }) => {
    const sets = setsOf.get(ws)!;
    const set = sets[requested] ?? sets[0];
    const { rows, skipped } = parseSheet(ws, header.row, set.columns, ctx);
    return { ws, set, sets, rows, skipped };
  });

  const sheets = sheetChoices(parsed, options.sheets);
  const chosen = parsed.filter((_, i) => sheets[i].selected);
  if (chosen.length === 0) {
    throw new ImportFileError(options.sheets ? "ยังไม่ได้เลือกชีตที่จะนำเข้า" : "ไม่พบบรรทัดรายการใต้หัวตาราง");
  }

  const firstSets = chosen[0].sets;
  const priceSet = Math.min(requested, firstSets.length - 1);
  headerWarnings.push(...priceSetWarnings(chosen, requested, firstSets.length));

  const rows = chosen.flatMap((p) => p.rows);
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new ImportFileError(`ไฟล์มีรายการเกิน ${IMPORT_MAX_ROWS.toLocaleString("th-TH")} บรรทัด — แบ่งเป็นหลายไฟล์แล้วนำเข้าทีละไฟล์`);
  }
  if (rows.length === 0) throw new ImportFileError("ไม่พบบรรทัดรายการใต้หัวตาราง");
  return {
    source: readSource(wb),
    sheetNames: chosen.map((p) => p.ws.name),
    skippedSheets: found.filter((x) => !hasCostColumn(x.header.columns)).map((x) => x.ws.name),
    rows,
    skippedRows: chosen.flatMap((p) => p.skipped),
    sheets,
    priceSets: firstSets.map((s, index) => ({ index, label: s.label })),
    priceSet,
    headerWarnings,
  };
}
