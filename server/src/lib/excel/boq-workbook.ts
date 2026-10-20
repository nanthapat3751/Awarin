import ExcelJS from "exceljs";
import { roundTo } from "@systemboq/shared-types";

/**
 * สร้างไฟล์ Excel (.xlsx) ของ BOQ — สองแบบจากตัวสร้างเดียวกัน
 *
 * - **ภายใน** (buildInternalBoqWorkbook): ราคาทุนแยกวัสดุ/ค่าแรงทุกบรรทัด ยอดรวมทุกขั้น
 *   เป็นสูตร Excel ตามลำดับเดียวกับ lib/pricing.ts (ต้นทุน → เผื่อเหลือ → ค่าดำเนินการ+กำไร → ส่วนลด →
 *   ปัดยอด → VAT) แก้ปริมาณ/ราคาในไฟล์แล้วทั้งใบคิดใหม่ได้ · ห้ามส่งให้ลูกค้า (มีราคาทุน)
 * - **ลูกค้า** (buildCustomerBoqWorkbook): ราคาต่อบรรทัดที่พับกำไรแล้วชุดเดียวกับใบเสนอราคา PDF
 *   ยอดสรุปท้ายใบเป็นตัวเลขจากระบบ (ไม่ใช่สูตร) ให้ตรงกับใบเสนอราคาที่ส่งไปทุกสตางค์
 *
 * โครงไฟล์ทั้งสองแบบ: ชีต "สรุป" หน้าแรก (ยอดรายหมวด + ยอดท้ายใบ) → ชีตละหนึ่งหมวด (หมวดเกิน
 * LINES_PER_SHEET บรรทัดต่อชีตใหม่ พร้อมยอดยกมา/ยกไป) → ชีตแนบ · พิมพ์ทุกชีตมีหัวตารางซ้ำทุกหน้า + เลขหน้า
 *
 * ทุกสูตรใส่ผลลัพธ์ที่ระบบคิดไว้แล้ว (cached result) ด้วย โปรแกรมที่ไม่คำนวณสูตรเอง (พรีวิวในมือถือ,
 * Google Drive) จึงยังเห็นตัวเลขถูก · ข้อความจากผู้ใช้เขียนเป็นข้อความเสมอ ไม่มีทางกลายเป็นสูตร
 * (ช่องข้อความใน .xlsx ไม่ถูกตีความเป็นสูตรเหมือน CSV)
 */

const FONT = "Tahoma";
const NAVY = "FF000099";
const RULE = "FFC8CCD8";
/** เส้นเข้มของแบบมินิมอล (ใต้หัวตาราง / บนแถวรวม / เส้นคู่ใต้ยอดสุทธิ) */
const INK = "FF1F2937";
const MUTED = "FF6B7280";
/** แถวสลับสีจาง ๆ ของตารางหน้าสรุป */
const ZEBRA = "FFF8F9FC";
const MONEY = "#,##0.00";
const QTY = "#,##0.###";

/**
 * ปริมาณ: จำนวนเต็มใช้ "#,##0" — รูปแบบ "#,##0.###" ของ Excel ทิ้งจุดค้างท้ายจำนวนเต็ม ("16.")
 * ทศนิยมยังโชว์ได้ถึง 3 ตำแหน่งเหมือนเดิม
 */
function qty(cell: ExcelJS.Cell) {
  cell.numFmt = typeof cell.value === "number" && Number.isInteger(cell.value) ? "#,##0" : QTY;
}

export interface WorkbookMeta {
  companyName: string;
  projectNo: string;
  projectName: string;
  customerName: string | null;
  siteAddress: string | null;
  exportedAt: Date;
}

/** หมวดย่อยของบรรทัด เช่น B-04 งานฐานราก — null = บรรทัดอยู่ตรงหมวดใหญ่ ไม่มีหมวดย่อย */
export interface SubgroupRef {
  code: string | null;
  name: string;
}

export interface InternalLine {
  /** id บรรทัด BOQ — เขียนลงคอลัมน์ซ่อน ให้นำไฟล์กลับเข้ามาแล้วรู้ว่าแถวไหนคือบรรทัดเดิม (แก้/เพิ่ม/ลบ) */
  id?: string;
  subgroup?: SubgroupRef | null;
  code: string | null;
  name: string;
  quantity: number;
  unit: string;
  materialUnitPrice: number;
  laborUnitPrice: number;
  materialTotal: number;
  laborTotal: number;
  lineTotal: number;
  note: string | null;
}

export interface InternalGroup {
  label: string;
  name: string;
  lines: InternalLine[];
}

/** ตัวเลขของเวอร์ชันตามที่ระบบบันทึกไว้ — ใช้เป็นผลลัพธ์ของสูตร และเป็นตัวเลขของโครงการที่ไม่มี BOQ */
export interface VersionPricing {
  versionNo: number;
  isCustom: boolean;
  directCost: number;
  contingencyPct: number;
  contingencyAmt: number;
  overheadProfitPct: number;
  overheadProfitAmt: number;
  discountPct: number | null;
  discountAmt: number;
  discountNote: string | null;
  roundingUnit: number | null;
  roundingAmt: number;
  vatPct: number;
  vatAmt: number;
  netPrice: number;
}

/** ใบถอดแบบของหนึ่งบรรทัด (qtyBasis = SHEET) — พิมพ์เป็นชีตแนบ ให้ตรวจที่มาของปริมาณได้ */
export interface TakeoffSheetBlock {
  code: string | null;
  name: string;
  unit: string;
  wasteFactorPct: number;
  /** ปริมาณที่บรรทัดใช้จริง (ผลรวม × เผื่อเสีย ปัด 3 ตำแหน่ง) */
  quantity: number;
  rows: {
    label: string;
    count: number;
    length: number | null;
    width: number | null;
    height: number | null;
    barDia: number | null;
    deduct: boolean;
    /** ค่าของแถวที่ระบบคิด (ติดเครื่องหมายแล้ว) */
    value: number;
  }[];
}

const r2 = (v: number) => roundTo(v, 2);

function thaiDateTime(d: Date): string {
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }) + " น.";
}

function thaiDate(d: Date): string {
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" });
}

function newWorkbook(meta: WorkbookMeta): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.companyName;
  wb.created = meta.exportedAt;
  // ให้ Excel คิดสูตรใหม่ทั้งไฟล์ตอนเปิด (ผลลัพธ์ที่ฝังไว้ใช้กับโปรแกรมที่ไม่คิดสูตรเอง)
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}

/** ท้ายกระดาษทุกหน้าที่พิมพ์: เลข+ชื่อโครงการ ซ้าย · "หน้า x / y" ขวา (& เป็นรหัสคำสั่งของ Excel ต้องเขียนซ้อน) */
function pageFooter(meta: WorkbookMeta): string {
  const project = `${meta.projectNo} ${meta.projectName}`.replaceAll("&", "&&");
  return `&L&8${project}&R&8หน้า &P / &N`;
}

function sheet(wb: ExcelJS.Workbook, name: string, widths: number[], meta: WorkbookMeta): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { defaultRowHeight: 18 },
    headerFooter: { oddFooter: pageFooter(meta) },
  });
  ws.columns = widths.map((width) => ({ width, style: { font: { name: FONT, size: 10 } } }));
  return ws;
}

const colLetter = (col: number) => String.fromCodePoint(64 + col);

/** ชื่อชีตในสูตร/ลิงก์ — ครอบ ' เสมอ (ชื่อไทยมีช่องว่าง) และ ' ในชื่อต้องเขียนซ้อน */
const sheetRef = (name: string) => `'${name.replaceAll("'", "''")}'`;

type TitleLine = { text: string; bold?: boolean; size?: number; color?: string };

function titleBlock(ws: ExcelJS.Worksheet, lines: TitleLine[]) {
  for (const l of lines) {
    const row = ws.addRow([l.text]);
    row.getCell(1).font = { name: FONT, size: l.size ?? 10, bold: l.bold ?? false, color: { argb: l.color ?? "FF1B1F2E" } };
  }
  ws.addRow([]);
}

/** หัวคอลัมน์ที่เป็นข้อความ — ชิดซ้ายแม้อยู่หลังคอลัมน์ตัวเลข (เดิม "หมายเหตุ"/"หน่วย" ชิดขวาไม่ตรงกับข้อมูล) */
const TEXT_HEADERS = new Set(["หน่วย", "หน่วยซื้อ", "หมายเหตุ", "เหล็ก"]);

/**
 * หัวตารางแบบมินิมอล (แบบ B ผู้ใช้เลือก 14 ต.ค. 2026): ไม่มีพื้นสีทึบ ตัวหนาสีเข้ม + เส้นเข้มใต้หัว
 * (เดิมแถบนาวีทึบเต็มความกว้าง ดูหนักและเปลืองหมึกตอนพิมพ์)
 */
function headerRow(ws: ExcelJS.Worksheet, labels: string[], numericFrom: number) {
  const row = ws.addRow(labels);
  row.height = 22;
  row.eachCell((cell, col) => {
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: INK } };
    cell.alignment = {
      vertical: "middle",
      horizontal: col >= numericFrom && !TEXT_HEADERS.has(String(cell.value)) ? "right" : "left",
      wrapText: true,
    };
    cell.border = { bottom: { style: "medium", color: { argb: INK } } };
  });
  // ตรึงหัวตารางไว้เวลาเลื่อน + พิมพ์หัวตารางซ้ำทุกหน้ากระดาษ
  ws.views = [{ state: "frozen", ySplit: row.number }];
  ws.pageSetup.printTitlesRow = `${row.number}:${row.number}`;
  return row;
}

function groupHeader(ws: ExcelJS.Worksheet, text: string, width: number) {
  const row = ws.addRow([text]);
  for (let c = 1; c <= width; c++) row.getCell(c).font = { name: FONT, size: 10, bold: true, color: { argb: NAVY } };
  return row;
}

function money(cell: ExcelJS.Cell) {
  cell.numFmt = MONEY;
  cell.alignment = { horizontal: "right" };
}

function topBorder(row: ExcelJS.Row, from: number, to: number) {
  for (let c = from; c <= to; c++) row.getCell(c).border = { top: { style: "thin", color: { argb: RULE } } };
}

const THIN: Partial<ExcelJS.Border> = { style: "thin", color: { argb: RULE } };

/** ความสูงแถวในตาราง (pt) — ค่าเริ่มต้น 18 ชิดจนตัวอักษรไทยเกือบแตะเส้น ผู้ใช้ขอให้ห่างบน-ล่างขึ้น */
const ROW_H = 24;
/** ความสูงต่อบรรทัดเมื่อชื่อรายการยาวจนตัดขึ้นบรรทัดใหม่ */
const WRAP_LINE_H = 13.5;

/**
 * ความกว้างข้อความโดยประมาณ (หน่วยเดียวกับความกว้างคอลัมน์ Excel) — อักษรไทยกว้างกว่าเลข/อังกฤษ ช่องว่างแคบสุด
 * สระบน-ล่าง/วรรณยุกต์ไม่กินที่ · น้ำหนักเทียบจากที่ Excel ตัดบรรทัดจริงในคอลัมน์กว้าง 44
 */
function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    if (/[ัิ-ฺ็-๎]/.test(ch)) continue;
    if (ch === " ") w += 0.45;
    else if (/[฀-๿]/.test(ch)) w += 1.15;
    else w += 0.85;
  }
  return w;
}

/**
 * เว้นระยะบน-ล่างของแถว + จัดทุกช่องกึ่งกลางแนวตั้ง
 * ตั้งความสูงเองแล้ว Excel ไม่ขยายแถวให้ชื่อที่ตัดบรรทัดอีก → ประมาณจำนวนบรรทัดจากความกว้างชื่อ/ความกว้างคอลัมน์
 * เผื่อไว้เล็กน้อย ให้สูงเกินดีกว่าตัวอักษรถูกตัดหาย
 */
function roomy(row: ExcelJS.Row, from: number, to: number) {
  let lines = 1;
  const name = row.getCell(2);
  if (name.alignment?.wrapText && typeof name.value === "string") {
    const width = row.worksheet.getColumn(2).width ?? 10;
    lines = Math.max(1, Math.ceil(textWidth(name.value) / (width * 0.97)));
  }
  row.height = Math.max(row.height ?? 0, lines === 1 ? ROW_H : lines * WRAP_LINE_H + 9);
  for (let c = from; c <= to; c++) {
    const cell = row.getCell(c);
    cell.alignment = { ...cell.alignment, vertical: "middle" };
  }
}

/**
 * ตัวอักษรทั้งแถว (+ พื้นถ้าส่ง fill มา) — แบบมินิมอลไม่ระบายพื้นแถวรวมแล้ว ใช้ตัวหนา + เส้นแทน
 * ใส่ทุกช่อง from..to รวมช่องว่าง ไม่ใช่เฉพาะช่องที่มีค่า
 */
function paintRow(row: ExcelJS.Row, from: number, to: number, fill: string | null, font: Partial<ExcelJS.Font>) {
  for (let c = from; c <= to; c++) {
    const cell = row.getCell(c);
    if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    cell.font = { name: FONT, size: 10, ...font };
  }
}

/**
 * ตีเส้นบางสีเทาทุกด้านของทุกช่อง (All Borders) — ผู้ใช้สั่ง ให้ตารางมีเส้นครบทั้งบนจอและตอนพิมพ์
 * เส้นเข้มใต้หัวตาราง (medium) ที่ตั้งไว้ก่อนแล้วคงไว้ ไม่ถูกเส้นบางทับ
 */
function gridCells(row: ExcelJS.Row, from: number, to: number) {
  for (let c = from; c <= to; c++) {
    const cell = row.getCell(c);
    const bottom = cell.border?.bottom?.style === "medium" ? cell.border.bottom : THIN;
    cell.border = { top: THIN, left: THIN, bottom, right: THIN };
  }
  roomy(row, from, to);
}

/** แถวยอดรวมแบบบัญชี: เส้นเข้มบางด้านบน + เส้นคู่ด้านล่าง (สีเข้ม) · เส้นตั้งบางเหมือนช่องอื่น */
function totalRule(row: ExcelJS.Row, from: number, to: number) {
  for (let c = from; c <= to; c++) {
    row.getCell(c).border = {
      top: { style: "thin", color: { argb: INK } },
      bottom: { style: "double", color: { argb: INK } },
      left: THIN,
      right: THIN,
    };
  }
  roomy(row, from, to);
}

/** แถวรวมหมวดย่อย / ยอดยกมา: ไม่มีพื้น — เส้นเข้มบาง ๆ ด้านบนแยกจากบรรทัดงาน */
function subtotalRule(row: ExcelJS.Row, from: number, to: number) {
  for (let c = from; c <= to; c++) {
    const cell = row.getCell(c);
    cell.border = { ...cell.border, top: { style: "thin", color: { argb: INK } } };
  }
}

/** แถวสรุปท้ายใบ: ป้ายอยู่คอลัมน์ labelCol ชิดขวา ตัวเลขอยู่คอลัมน์ถัดไป */
function summaryRow(
  ws: ExcelJS.Worksheet,
  labelCol: number,
  label: string,
  value: ExcelJS.CellValue,
  opts: { bold?: boolean; hidden?: boolean; grand?: boolean } = {},
): ExcelJS.Row {
  const row = ws.addRow([]);
  const l = row.getCell(labelCol);
  l.value = label;
  l.alignment = { horizontal: "right" };
  l.font = { name: FONT, size: opts.grand ? 11 : 10, bold: opts.bold || opts.grand, color: { argb: opts.grand ? INK : MUTED } };
  const v = row.getCell(labelCol + 1);
  v.value = value;
  money(v);
  // ยอดสุทธิตัวใหญ่สีน้ำเงินบริษัท เส้นคู่ใต้แบบงบการเงิน — จุดเดียวในไฟล์ที่ใช้สี
  v.font = { name: FONT, size: opts.grand ? 13 : 10, bold: opts.bold || opts.grand, color: { argb: opts.grand ? NAVY : "FF1B1F2E" } };
  if (opts.grand) totalRule(row, labelCol, labelCol + 1);
  if (opts.hidden) row.hidden = true;
  return row;
}

const f = (formula: string, result: number): ExcelJS.CellFormulaValue => ({ formula, result });

function discountLabel(p: VersionPricing): string {
  const pct = p.discountPct != null ? ` ${p.discountPct}%` : "";
  return `ส่วนลด${pct}${p.discountNote ? ` (${p.discountNote})` : ""}`;
}

function roundingLabel(unit: number | null): string {
  if (unit === 1) return "ส่วนลดปัดเศษ (ตัดสตางค์)";
  return `ส่วนลดปัดเศษ (ปัดลงหลัก${{ 100: "ร้อย", 1000: "พัน", 10000: "หมื่น" }[unit ?? 0] ?? ` ${unit}`})`;
}

// ─────────────────────────── แบ่งชีต ───────────────────────────

/** บรรทัดงานต่อชีตสูงสุด — หมวดที่ยาวกว่านี้ต่อชีตใหม่ พร้อมยอดยกมา/ยกไป */
export const LINES_PER_SHEET = 100;

const SUMMARY_SHEET = "สรุป";
/** ชื่อชีตที่ระบบใช้เอง — ชีตหมวดห้ามชนชื่อเหล่านี้ */
// "รายการสั่งซื้อ" ถอดออก 18 ต.ค. แต่ยังจองชื่อไว้ — ไฟล์เก่ามีชีตนี้ ชื่อหมวดไม่ควรมาชน
const FIXED_SHEETS = [SUMMARY_SHEET, "ใบถอดแบบ", "รายการสั่งซื้อ"];
const SHEET_NAME_MAX = 31;

const thaiWords = new Intl.Segmenter("th", { granularity: "word" });

/**
 * ตัดให้ไม่เกิน max ตัว — ตัดตรงรอยต่อคำ (ไทยไม่มีเว้นวรรค ตัดตามตัวอักษรจะได้ "ป้องกั") แล้วต่อ "…"
 * ให้รู้ว่าชื่อถูกย่อ · คำเดียวยาวเกินทั้งก้อนค่อยตัดตามตัวอักษร
 */
function cutTo(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = "";
  for (const { segment } of thaiWords.segment(text)) {
    if (out.length + segment.length > max - 1) break;
    out += segment;
  }
  if (out.trim() === "") {
    for (const ch of text) {
      if (out.length + ch.length > max - 1) break;
      out += ch;
    }
  }
  return `${out.trimEnd()}…`;
}

/**
 * ชื่อชีตที่ Excel รับแน่นอน — ชื่อหมวดมาจากผู้ใช้ ห้ามเชื่อ: ไม่เกิน 31 ตัวอักษร · ไม่มี : \ / ? * [ ] ·
 * ไม่ขึ้นต้น/ลงท้ายด้วย ' · ไม่ว่าง · ไม่ใช่ "History" (Excel จองไว้) · ไม่ซ้ำชีตอื่นแบบไม่สนตัวพิมพ์
 * (ชนเมื่อไรเติมเลขต่อท้าย) · `used` = ชื่อตัวพิมพ์เล็กของชีตที่ใช้ไปแล้ว ฟังก์ชันนี้เติมให้เอง
 * `suffix` (เช่น " (2)") ไม่ถูกตัดทิ้ง — ตัดชื่อหมวดให้สั้นลงแทน
 */
export function safeSheetName(base: string, used: Set<string>, suffix = ""): string {
  const clean = base.replace(/[:\\/?*[\]]/g, "-").replace(/\s+/g, " ").trim();
  for (let n = 1; ; n++) {
    const tail = `${n > 1 ? ` ${n}` : ""}${suffix}`;
    const head = cutTo(clean, SHEET_NAME_MAX - tail.length).replace(/^['\s]+|['\s]+$/g, "") || "หมวด";
    const name = `${head}${tail}`;
    const key = name.toLowerCase();
    if (key !== "history" && !used.has(key)) {
      used.add(key);
      return name;
    }
  }
}

/** ชื่อแท็บไม่ต้องมี "หมวดงาน"/"หมวด" นำหน้าทุกแท็บ (กินที่ 31 ตัว) — หัวกระดาษในชีตยังใช้ชื่อเต็ม */
function tabName(categoryName: string): string {
  return categoryName.replace(/^หมวด(งาน)?\s*/, "") || categoryName;
}

interface CategorySheetSpec<L> {
  widths: number[];
  header: string[];
  numericFrom: number;
  /** หัวกระดาษของแผ่นที่ part จาก parts */
  title: (part: number, parts: number) => TitleLine[];
  addLine: (ws: ExcelJS.Worksheet, line: L) => void;
  /** คอลัมน์เงินที่รวมหมวด/ยกยอด + ค่าของแต่ละบรรทัด (เป็นผลฝังของสูตร) */
  sums: { col: number; of: (line: L) => number }[];
  /** ยอดรวมหมวดตามระบบ — ผลฝังของแถว "รวมหมวด" (ไม่ส่ง = บวกจากบรรทัด) */
  finalTotals?: number[];
  /** คอลัมน์ท้ายที่ซ่อนไว้ (เช่น รหัสบรรทัดของระบบ) — ไม่พิมพ์ ไม่ให้เห็น แต่ตัวนำเข้าอ่านได้ */
  hiddenTrailing?: number;
}

/** ชีตลับบอกที่มาของไฟล์ (โครงการ/เวอร์ชัน) — ซ่อนแบบ veryHidden เปิดจากเมนู Excel ไม่ได้ */
export const SOURCE_SHEET = "_systemboq";

interface PlacedCategory {
  firstSheet: string;
  parts: number;
  /** แถว "รวมหมวด" อยู่ชีตสุดท้ายของหมวด */
  totalSheet: string;
  totalRow: number;
  totals: number[];
}

/**
 * เขียนหนึ่งหมวดเป็นชีต — ทุกชีตมีหัวตารางเต็ม (ตัวนำเข้าอ่านได้ทุกชีต) และลิงก์กลับหน้าสรุป
 * เกิน LINES_PER_SHEET บรรทัด: ท้ายแผ่น "ยอดยกไปแผ่นที่ n" → ต้นแผ่นถัดไป "ยอดยกมาจากแผ่นที่ n-1" (สูตรอ้างชีตก่อน)
 * แผ่นสุดท้าย "รวมหมวด" = ยอดยกมา + บรรทัดของแผ่นนี้ · แถวยอดทั้งหมดขึ้นต้นด้วย "ยอด"/"รวม" ไม่มีปริมาณ
 * ตัวนำเข้าจึงข้ามเองไม่นับเป็นงาน
 */
const subKey = (s: SubgroupRef | null | undefined) => (s ? `${s.code ?? ""}|${s.name}` : null);
const subLabel = (s: SubgroupRef) => (s.code ? `${s.code}  ${s.name}` : s.name);

/** แถวหัวหมวดย่อย — ข้อความอยู่คอลัมน์ A (ช่อง "รายการ" ว่าง ตัวนำเข้าจึงข้ามเอง ไม่นับเป็นงาน) */
function subgroupHeader(ws: ExcelJS.Worksheet, text: string, lastCol: number) {
  const row = ws.addRow([text]);
  for (let c = 1; c <= lastCol; c++) row.getCell(c).font = { name: FONT, size: 10, bold: true, color: { argb: NAVY } };
  gridCells(row, 1, lastCol);
}

/** ช่วงแถวที่ติดกันเป็นก้อน — [7,8,9,12,13] → "F7:F9,F12:F13" (prefix = ชื่อชีต ใส่ให้ทุกช่วง) */
function rowRanges(col: string, rows: number[], prefix = ""): string {
  const parts: string[] = [];
  let start = rows[0];
  for (let k = 1; k <= rows.length; k++) {
    if (k < rows.length && rows[k] === rows[k - 1] + 1) continue;
    const end = rows[k - 1];
    parts.push(start === end ? `${prefix}${col}${start}` : `${prefix}${col}${start}:${col}${end}`);
    start = rows[k];
  }
  return parts.join(",");
}

function writeCategorySheets<L extends { subgroup?: SubgroupRef | null }>(
  wb: ExcelJS.Workbook,
  meta: WorkbookMeta,
  used: Set<string>,
  group: { label: string; name: string; lines: L[] },
  spec: CategorySheetSpec<L>,
): PlacedCategory {
  const chunks: L[][] = [];
  for (let i = 0; i < group.lines.length; i += LINES_PER_SHEET) chunks.push(group.lines.slice(i, i + LINES_PER_SHEET));
  if (chunks.length === 0) chunks.push([]);
  const parts = chunks.length;
  const lastCol = spec.header.length;
  const running = spec.sums.map(() => 0);
  const names: string[] = [];
  let prev: { sheet: string; row: number } | null = null;

  // ก้อนบรรทัดที่ติดกันและอยู่หมวดย่อยเดียวกัน (แบบเดียวกับหน้าโครงการ — ไม่จัดเรียงบรรทัดใหม่)
  // รวมหมวดย่อยขึ้นเฉพาะหมวดที่มีมากกว่าหนึ่งก้อน — ก้อนเดียวยอดจะซ้ำกับรวมหมวดที่อยู่ใต้มันพอดี
  const runKeys = group.lines.map((l) => subKey(l.subgroup ?? null));
  const runCount = runKeys.filter((k, idx) => idx === 0 || k !== runKeys[idx - 1]).length;
  const showSubtotals = runCount > 1 && runKeys.some((k) => k != null);
  let open: { key: string | null; sub: SubgroupRef | null; parts: { sheet: string; rows: number[] }[]; totals: number[] } | null =
    null;

  function closeRun(ws: ExcelJS.Worksheet, sheetName: string) {
    const run = open;
    open = null;
    if (!run?.sub || !showSubtotals) return;
    const row = ws.addRow([]);
    row.getCell(2).value = `รวม ${subLabel(run.sub)}`;
    row.getCell(2).alignment = { horizontal: "right" };
    spec.sums.forEach((s, k) => {
      const L = colLetter(s.col);
      // หมวดย่อยที่ข้ามแผ่น: บวกช่วงของแต่ละแผ่น (อ้างชีตก่อนหน้าตรง ๆ)
      const terms = run.parts.map((part) => `SUM(${rowRanges(L, part.rows, part.sheet === sheetName ? "" : `${sheetRef(part.sheet)}!`)})`);
      row.getCell(s.col).value = f(terms.join("+"), run.totals[k]);
      money(row.getCell(s.col));
    });
    paintRow(row, 1, lastCol, null, { bold: true, color: { argb: NAVY } });
    gridCells(row, 1, lastCol);
    subtotalRule(row, 1, lastCol);
  }

  chunks.forEach((chunk, i) => {
    const name = safeSheetName(`${group.label} ${tabName(group.name)}`, used, parts > 1 ? ` (${i + 1})` : "");
    names.push(name);
    const ws = sheet(wb, name, spec.widths, meta);
    titleBlock(ws, spec.title(i + 1, parts));
    const lastVisible = lastCol - (spec.hiddenTrailing ?? 0);
    for (let c = lastVisible + 1; c <= lastCol; c++) ws.getColumn(c).hidden = true;
    const back = ws.getRow(1).getCell(lastVisible);
    back.value = { text: "กลับหน้าสรุป", hyperlink: `#${sheetRef(SUMMARY_SHEET)}!A1` };
    back.font = { name: FONT, size: 9, color: { argb: NAVY }, underline: true };
    back.alignment = { horizontal: "right" };
    gridCells(headerRow(ws, spec.header, spec.numericFrom), 1, lastCol);

    let carryRow: number | null = null;
    if (prev) {
      const from = prev;
      const row = ws.addRow([]);
      row.getCell(2).value = `ยอดยกมาจากแผ่นที่ ${i}`;
      spec.sums.forEach((s, k) => {
        const cell = row.getCell(s.col);
        cell.value = f(`${sheetRef(from.sheet)}!${colLetter(s.col)}${from.row}`, running[k]);
        money(cell);
      });
      paintRow(row, 1, lastCol, null, { italic: true, color: { argb: MUTED } });
      gridCells(row, 1, lastCol);
      carryRow = row.number;
    }

    // บรรทัดจริงของแผ่นนี้ (ไม่รวมแถวหัว/รวมหมวดย่อย) — ยอดรวมหมวดบวกเฉพาะแถวพวกนี้ ไม่งั้นนับซ้ำกับรวมหมวดย่อย
    const lineRows: number[] = [];
    chunk.forEach((line, j) => {
      const sub = line.subgroup ?? null;
      const key = subKey(sub);
      if (!open || open.key !== key) {
        closeRun(ws, name);
        open = { key, sub, parts: [], totals: spec.sums.map(() => 0) };
        if (sub) subgroupHeader(ws, subLabel(sub), lastCol);
      } else if (j === 0 && open.sub) {
        // หมวดย่อยยาวข้ามแผ่น — ต้นแผ่นใหม่บอกว่าต่อจากแผ่นก่อน
        subgroupHeader(ws, `${subLabel(open.sub)} (ต่อ)`, lastCol);
      }
      spec.addLine(ws, line);
      const rowNo = ws.lastRow!.number;
      gridCells(ws.lastRow!, 1, lastCol);
      lineRows.push(rowNo);
      const part = open.parts.at(-1);
      if (part?.sheet === name) part.rows.push(rowNo);
      else open.parts.push({ sheet: name, rows: [rowNo] });
      spec.sums.forEach((s, k) => {
        running[k] = r2(running[k] + s.of(line));
        open!.totals[k] = r2(open!.totals[k] + s.of(line));
      });
    });
    // หมวดย่อยจบที่ท้ายแผ่นพอดี → ปิดยอดในแผ่นนี้ (ไม่ไปโผล่ต้นแผ่นถัดไป)
    const nextLine = group.lines[(i + 1) * LINES_PER_SHEET];
    if (!nextLine || subKey(nextLine.subgroup ?? null) !== open?.key) closeRun(ws, name);

    const isLast = i === parts - 1;
    const end = ws.addRow([]);
    end.getCell(2).value = isLast ? `รวมหมวด ${group.label}` : `ยอดยกไปแผ่นที่ ${i + 2}`;
    end.getCell(2).alignment = { horizontal: "right" };
    spec.sums.forEach((s, k) => {
      const L = colLetter(s.col);
      const terms = [carryRow == null ? null : `${L}${carryRow}`, lineRows.length > 0 ? `SUM(${rowRanges(L, lineRows)})` : null].filter(
        (t): t is string => t != null,
      );
      const result = isLast && spec.finalTotals ? spec.finalTotals[k] : running[k];
      end.getCell(s.col).value = f(terms.join("+") || "0", result);
      money(end.getCell(s.col));
    });
    paintRow(end, 1, lastCol, null, { bold: true, color: { argb: INK } });
    totalRule(end, 1, lastCol);
    prev = { sheet: name, row: end.number };
  });

  return {
    firstSheet: names[0],
    parts,
    totalSheet: prev!.sheet,
    totalRow: prev!.row,
    totals: spec.finalTotals ?? running,
  };
}

/** แถวหมวดในชีตสรุป: ชื่อหมวดกดกระโดดไปชีตหมวด · ตัวเลขเป็นสูตรอ้างแถว "รวมหมวด" · สัดส่วนเทียบแถวรวม */
function summaryGroupRow(
  ws: ExcelJS.Worksheet,
  g: { label: string; name: string; lineCount: number },
  at: PlacedCategory,
  sourceCols: number[],
  totalRowNo: number,
  grandTotal: number,
  zebra = false,
) {
  const name = `${g.name}${at.parts > 1 ? ` (${at.parts} แผ่น)` : ""}`;
  const row = ws.addRow([g.label, { text: name, hyperlink: `#${sheetRef(at.firstSheet)}!A1` }, g.lineCount]);
  row.getCell(2).font = { name: FONT, size: 10, color: { argb: NAVY }, underline: true };
  sourceCols.forEach((src, k) => {
    const cell = row.getCell(4 + k);
    cell.value = f(`${sheetRef(at.totalSheet)}!${colLetter(src)}${at.totalRow}`, at.totals[k]);
    money(cell);
  });
  const own = colLetter(3 + sourceCols.length);
  const share = row.getCell(4 + sourceCols.length);
  share.value = f(
    `IF(${own}${totalRowNo}=0,0,${own}${row.number}/${own}${totalRowNo})`,
    grandTotal === 0 ? 0 : at.totals.at(-1)! / grandTotal,
  );
  share.numFmt = "0.0%";
  share.alignment = { horizontal: "right" };
  share.font = { name: FONT, size: 10, color: { argb: MUTED } };
  if (zebra) {
    for (let c = 1; c <= 4 + sourceCols.length; c++) {
      row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
    }
  }
  gridCells(row, 1, 4 + sourceCols.length);
}

/** แถวรวมท้ายตารางหมวดในชีตสรุป */
function summaryTotalRow(ws: ExcelJS.Worksheet, label: string, first: number, last: number, results: number[], lineCount: number) {
  const row = ws.addRow([]);
  row.getCell(2).value = label;
  row.getCell(2).alignment = { horizontal: "right" };
  row.getCell(3).value = f(`SUM(C${first}:C${last})`, lineCount);
  results.forEach((result, k) => {
    const L = colLetter(4 + k);
    row.getCell(4 + k).value = f(`SUM(${L}${first}:${L}${last})`, result);
    money(row.getCell(4 + k));
  });
  paintRow(row, 1, 4 + results.length, null, { bold: true, color: { argb: INK } });
  totalRule(row, 1, 4 + results.length);
  return row;
}

// ─────────────────────────── ภายใน ───────────────────────────

/** สูตรยอดท้ายใบตามลำดับของ lib/pricing.ts — คืนแถวยอดสุทธิ */
function internalSummary(ws: ExcelJS.Worksheet, directRef: string, p: VersionPricing, L: number) {
  // ป้ายอยู่คอลัมน์ L ตัวเลขอยู่คอลัมน์ถัดไป
  const V = colLetter(L + 1);
  const ref = (row: ExcelJS.Row) => `${V}${row.number}`;

  let baseRef = directRef;
  let baseResult = p.directCost;
  if (p.contingencyPct > 0) {
    const cont = summaryRow(ws, L, `ค่าเผื่อเหลือเผื่อขาด ${p.contingencyPct}%`, f(`ROUND(${directRef}*${p.contingencyPct}/100,2)`, p.contingencyAmt));
    baseResult = r2(p.directCost + p.contingencyAmt);
    const base = summaryRow(ws, L, "ค่างานต้นทุน", f(`${directRef}+${ref(cont)}`, baseResult), { bold: true });
    baseRef = ref(base);
  }

  const oh = summaryRow(ws, L, `ค่าดำเนินการและกำไร ${p.overheadProfitPct}%`, f(`ROUND(${baseRef}*${p.overheadProfitPct}/100,2)`, p.overheadProfitAmt));
  const priceResult = r2(baseResult + p.overheadProfitAmt);
  const before = summaryRow(ws, L, "รวมก่อนส่วนลด", f(`${baseRef}+${ref(oh)}`, priceResult), { bold: true });
  const priceRef = ref(before);

  let discRef = "0";
  if (p.discountAmt > 0 || p.discountPct != null) {
    const formula = p.discountPct != null ? `ROUND(${priceRef}*${p.discountPct}/100,2)` : `MIN(${p.discountAmt},${priceRef})`;
    discRef = ref(summaryRow(ws, L, discountLabel(p), f(formula, p.discountAmt)));
  }

  const vat = p.vatPct;
  const afterDiscount = r2(priceResult - p.discountAmt);

  // ปัดยอด — ทำซ้ำ applyNetRounding ด้วยสูตร: ยอดสุทธิก่อนปัด → ปัดลงตามหน่วย → VAT ถอดจากราคารวม
  let roundRef = "0";
  let targetRef: string | null = null;
  if (p.roundingUnit != null) {
    const unit = p.roundingUnit;
    const net0Result = r2(afterDiscount + r2((afterDiscount * vat) / 100));
    const net0 = summaryRow(ws, L, "ยอดสุทธิก่อนปัด", f(`ROUND((${priceRef}-${discRef})+ROUND((${priceRef}-${discRef})*${vat}/100,2),2)`, net0Result), { hidden: true });
    const targetResult = r2(Math.floor((net0Result + 1e-9) / unit) * unit);
    const target = summaryRow(ws, L, "ยอดสุทธิหลังปัด", f(`FLOOR(${ref(net0)}+0.000000001,${unit})`, targetResult), { hidden: true });
    targetRef = ref(target);
    const applies = `AND(${targetRef}>0,${targetRef}<>${ref(net0)})`;
    const formula =
      vat > 0
        ? `IF(${applies},ROUND((${priceRef}-${discRef})-(${targetRef}-ROUND(${targetRef}*${vat}/(100+${vat}),2)),2),0)`
        : `IF(${applies},ROUND(${ref(net0)}-${targetRef},2),0)`;
    roundRef = ref(summaryRow(ws, L, roundingLabel(unit), f(formula, p.roundingAmt)));
  }

  const subtotal = summaryRow(ws, L, "รวมมูลค่าก่อนภาษีมูลค่าเพิ่ม", f(`ROUND(${priceRef}-${discRef}-${roundRef},2)`, r2(p.netPrice - p.vatAmt)), { bold: true });
  // ปัดยอดแล้ว VAT ถอดจากราคารวม (สะท้อน applyNetRounding) · ไม่ปัด = ฐาน × อัตรา
  const vatFormula = targetRef
    ? `IF(${roundRef}>0,ROUND(${targetRef}*${vat}/(100+${vat}),2),ROUND(${ref(subtotal)}*${vat}/100,2))`
    : `ROUND(${ref(subtotal)}*${vat}/100,2)`;
  const vatRow = summaryRow(ws, L, `ภาษีมูลค่าเพิ่ม ${p.vatPct}%`, f(vatFormula, p.vatAmt));
  return summaryRow(ws, L, "รวมมูลค่าทั้งสิ้น", f(`${ref(subtotal)}+${ref(vatRow)}`, p.netPrice), { grand: true });
}

/**
 * ชีตใบถอดแบบ — หนึ่งก้อนต่อหนึ่งบรรทัด: แถวชิ้นส่วน (จำนวน × ยาว × กว้าง × สูง × กก./ม.) → รวม →
 * เผื่อเสีย → ปริมาณที่ใช้ ทุกยอดเป็นสูตร แก้ขนาดในไฟล์แล้วคิดใหม่ได้ (ปริมาณในชีต BOQ ไม่ผูกตาม
 * เพื่อให้ไฟล์ยังนำเข้ากลับได้ตรงตัว)
 */
function takeoffSheet(wb: ExcelJS.Workbook, meta: WorkbookMeta, versionNo: number, blocks: TakeoffSheetBlock[]) {
  if (blocks.length === 0) return;
  const ws = sheet(wb, "ใบถอดแบบ", [6, 34, 10, 11, 11, 11, 10, 10, 14], meta);
  titleBlock(ws, [
    { text: meta.companyName, bold: true, size: 13 },
    { text: "ใบถอดแบบ (ที่มาของปริมาณ)", bold: true, size: 12, color: NAVY },
    { text: `โครงการ: ${meta.projectName} (${meta.projectNo}) · เวอร์ชัน ${versionNo}` },
    { text: "มิติเป็นเมตร · ช่องว่าง = ไม่คูณ · แถวหักติดลบ · เหล็กคิดน้ำหนัก d²/162 กก./ม." },
  ]);
  headerRow(ws, ["#", "ชิ้นส่วน / ตำแหน่ง", "จำนวน", "ยาว", "กว้าง", "สูง/หนา", "เหล็ก", "กก./ม.", "ผล"], 3);

  for (const b of blocks) {
    groupHeader(ws, `${b.code ? `${b.code}  ` : ""}${b.name} (${b.unit})`, 9);
    const ton = b.unit.replace(/[\s.]/g, "") === "ตัน";
    const first = ws.rowCount + 1;
    b.rows.forEach((r, i) => {
      const code = r.barDia == null ? "" : r.barDia === 6 || r.barDia === 9 ? `RB${r.barDia}` : `DB${r.barDia}`;
      const row = ws.addRow([i + 1, r.deduct ? `(หัก) ${r.label}` : r.label, r.count, r.length, r.width, r.height, code, null, null]);
      const n = row.number;
      if (r.barDia != null) row.getCell(8).value = f(`${r.barDia}^2/162`, (r.barDia * r.barDia) / 162);
      const one = (col: string) => `IF(${col}${n}="",1,${col}${n})`;
      const sign = r.deduct ? "-" : "";
      const perTon = r.barDia != null && ton ? "/1000" : "";
      row.getCell(9).value = f(`${sign}C${n}*${one("D")}*${one("E")}*${one("F")}*${one("H")}${perTon}`, r.value);
      for (const c of [3, 4, 5, 6]) qty(row.getCell(c));
      row.getCell(8).numFmt = "0.0000";
      row.getCell(9).numFmt = "#,##0.000";
      if (r.deduct) row.getCell(9).font = { name: FONT, size: 10, color: { argb: "FFA32020" } };
    });
    const last = ws.rowCount;
    // ผลรวมดิบ (ไม่ปัด) ให้ตรงกับที่ SUM คิด — ปัดครั้งเดียวที่ "ปริมาณที่ใช้" เหมือนเซิร์ฟเวอร์
    const net = b.rows.reduce((s, r) => s + r.value, 0);
    const sum = summaryRow(ws, 8, "รวม", f(`SUM(I${first}:I${last})`, net));
    sum.getCell(9).numFmt = "#,##0.000";
    topBorder(sum, 8, 9);
    const waste = ws.addRow([]);
    waste.getCell(7).value = "เผื่อเสีย %";
    waste.getCell(7).alignment = { horizontal: "right" };
    waste.getCell(8).value = b.wasteFactorPct;
    const total = summaryRow(ws, 8, `ปริมาณที่ใช้ (${b.unit})`, f(`ROUND(I${sum.number}*(1+H${waste.number}/100),3)`, b.quantity), { bold: true });
    total.getCell(9).numFmt = "#,##0.000";
    total.getCell(9).font = { name: FONT, size: 10, bold: true, color: { argb: NAVY } };
    ws.addRow([]);
  }
}

export async function buildInternalBoqWorkbook(input: {
  meta: WorkbookMeta;
  pricing: VersionPricing;
  groups: InternalGroup[];
  takeoffSheets?: TakeoffSheetBlock[];
  /** ที่มาของไฟล์ — มี = เขียนชีตลับ + ตัวนำเข้าเทียบกับบรรทัดเดิมได้ (แก้/เพิ่ม/ลบ) */
  source?: { projectId: string; versionId: string; versionNo: number };
}): Promise<Buffer> {
  const { meta, pricing: p, groups } = input;
  const wb = newWorkbook(meta);
  const used = new Set(FIXED_SHEETS.map((n) => n.toLowerCase()));
  const sum = sheet(wb, SUMMARY_SHEET, [10, 40, 10, 16, 16, 18, 10], meta);
  const S = 5; // ยอดท้ายใบในชีตสรุป: ป้ายคอลัมน์ E ตัวเลขคอลัมน์ F (ใต้ช่อง "รวม")

  titleBlock(sum, [
    { text: meta.companyName, bold: true, size: 13 },
    { text: "บัญชีแสดงปริมาณวัสดุและราคา (BOQ) — ฉบับภายใน มีราคาทุน ห้ามส่งให้ลูกค้า", bold: true, size: 12, color: "FFA32020" },
    { text: `โครงการ: ${meta.projectName} (${meta.projectNo})` },
    { text: `ลูกค้า: ${meta.customerName ?? "—"}${meta.siteAddress ? ` · สถานที่ก่อสร้าง: ${meta.siteAddress}` : ""}` },
    {
      text: `เวอร์ชัน ${p.versionNo} · ต้นทุน + กำไร + VAT · ส่งออกเมื่อ ${thaiDateTime(meta.exportedAt)}`,
      color: "FF5A6078",
    },
  ]);

  if (p.isCustom || groups.length === 0) {
    // โครงการกำหนดเอง: ไม่มี BOQ ในระบบ ยอดก่อน VAT คือที่พนักงานกรอกมา
    sum.addRow([p.isCustom ? "โครงการกำหนดเอง — ไม่มีรายการ BOQ ในระบบ (รายละเอียดอยู่ในไฟล์แนบของใบเสนอราคา)" : "ยังไม่มีรายการ BOQ"]);
    sum.addRow([]);
    const direct = summaryRow(sum, S, p.isCustom ? "ยอดก่อน VAT (กรอกเอง)" : "รวมต้นทุนตรง", p.directCost, { bold: true });
    internalSummary(sum, `F${direct.number}`, p, S);
  } else {
    gridCells(headerRow(sum, ["หมวด", "ชื่อหมวดงาน", "บรรทัด", "ค่าวัสดุ", "ค่าแรง", "รวม", "สัดส่วน"], 3), 1, 7);
    const placed = groups.map((g) =>
      writeCategorySheets(wb, meta, used, g, {
        widths: [12, 44, 11, 9, 14, 15, 14, 15, 16, 26, 28],
        header: ["รหัส", "รายการ", "ปริมาณ", "หน่วย", "ค่าวัสดุ/หน่วย", "ค่าวัสดุ", "ค่าแรง/หน่วย", "ค่าแรง", "รวม", "หมายเหตุ", "รหัสบรรทัด"],
        numericFrom: 3,
        hiddenTrailing: 1,
        title: (part, parts) => [
          { text: meta.companyName, bold: true, size: 13 },
          { text: `หมวด ${g.label}  ${g.name}${parts > 1 ? ` · แผ่นที่ ${part} จาก ${parts}` : ""}`, bold: true, size: 12, color: NAVY },
          { text: `โครงการ: ${meta.projectName} (${meta.projectNo}) · เวอร์ชัน ${p.versionNo}` },
          { text: "ฉบับภายใน มีราคาทุน ห้ามส่งให้ลูกค้า", color: "FFA32020" },
        ],
        addLine: (ws, l: InternalLine) => {
          const row = ws.addRow([l.code ?? "", l.name, l.quantity, l.unit, l.materialUnitPrice, null, l.laborUnitPrice, null, null, l.note ?? "", l.id ?? ""]);
          const n = row.number;
          qty(row.getCell(3));
          row.getCell(6).value = f(`ROUND(C${n}*E${n},2)`, l.materialTotal);
          row.getCell(8).value = f(`ROUND(C${n}*G${n},2)`, l.laborTotal);
          row.getCell(9).value = f(`ROUND(F${n}+H${n},2)`, l.lineTotal);
          for (const c of [5, 6, 7, 8, 9]) money(row.getCell(c));
          row.getCell(2).alignment = { wrapText: true, vertical: "middle" };
        },
        sums: [
          { col: 6, of: (l) => l.materialTotal },
          { col: 8, of: (l) => l.laborTotal },
          { col: 9, of: (l) => l.lineTotal },
        ],
      }),
    );

    const first = sum.rowCount + 1;
    const totalRowNo = first + groups.length;
    const grand = r2(placed.reduce((s, at) => s + at.totals[2], 0));
    groups.forEach((g, i) =>
      summaryGroupRow(sum, { label: g.label, name: g.name, lineCount: g.lines.length }, placed[i], [6, 8, 9], totalRowNo, grand, i % 2 === 1),
    );
    const total = summaryTotalRow(
      sum,
      "รวมต้นทุนตรง (ทุกหมวด)",
      first,
      totalRowNo - 1,
      [r2(placed.reduce((s, at) => s + at.totals[0], 0)), r2(placed.reduce((s, at) => s + at.totals[1], 0)), p.directCost],
      groups.reduce((n, g) => n + g.lines.length, 0),
    );
    sum.addRow([]);
    internalSummary(sum, `F${total.number}`, p, S);
  }

  takeoffSheet(wb, meta, p.versionNo, input.takeoffSheets ?? []);
  if (input.source) {
    const src = wb.addWorksheet(SOURCE_SHEET, { state: "veryHidden" });
    src.addRow(["projectId", input.source.projectId]);
    src.addRow(["versionId", input.source.versionId]);
    src.addRow(["versionNo", input.source.versionNo]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─────────────────────────── ลูกค้า ───────────────────────────

export interface CustomerLine {
  subgroup?: SubgroupRef | null;
  code: string | null;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  note: string | null;
}

export interface CustomerGroup {
  label: string;
  name: string;
  lines: CustomerLine[];
  subtotal: number;
}

export interface CustomerTotals {
  beforeDiscount: number;
  discountPct: number | null;
  discountAmt: number;
  discountNote: string | null;
  roundingAmt: number;
  subtotalBeforeVat: number;
  vatPct: number;
  vatAmt: number;
  netPrice: number;
  withholding: { pct: number; tax: number; netTransfer: number } | null;
}

export async function buildCustomerBoqWorkbook(input: {
  meta: WorkbookMeta;
  quote: { quoteNo: string; revisionNo: number; date: Date; validUntil: Date | null };
  groups: CustomerGroup[];
  totals: CustomerTotals;
  isCustom: boolean;
}): Promise<Buffer> {
  const { meta, quote, groups, totals: t } = input;
  const wb = newWorkbook(meta);
  const used = new Set(FIXED_SHEETS.map((n) => n.toLowerCase()));
  const ws = sheet(wb, SUMMARY_SHEET, [10, 44, 10, 18, 10], meta);
  const quoteLine = `ใบเสนอราคาเลขที่ ${quote.quoteNo} (ฉบับที่ ${quote.revisionNo}) · วันที่ ${thaiDate(quote.date)}${quote.validUntil ? ` · ยืนราคาถึง ${thaiDate(quote.validUntil)}` : ""}`;

  titleBlock(ws, [
    { text: meta.companyName, bold: true, size: 12 },
    { text: "ใบเสนอราคา · บัญชีปริมาณงานและราคา", size: 16, color: NAVY },
    { text: quoteLine, color: MUTED },
    { text: `โครงการ: ${meta.projectName} (${meta.projectNo})`, color: MUTED },
    {
      text: `ผู้ว่าจ้าง: ${meta.customerName ?? "—"}${meta.siteAddress ? ` · สถานที่ก่อสร้าง: ${meta.siteAddress}` : ""}`,
      color: MUTED,
    },
  ]);

  // ยอดท้ายใบ: ป้ายคอลัมน์ C ตัวเลขคอลัมน์ D (ใต้ช่อง "ราคารวม")
  const L = 3;
  let groupsTotal: number | null = null;
  if (input.isCustom || groups.length === 0) {
    ws.addRow(["รายละเอียดงานอยู่ในเอกสารแนบของใบเสนอราคา"]);
    ws.addRow([]);
  } else {
    gridCells(headerRow(ws, ["หมวด", "ชื่อหมวดงาน", "บรรทัด", "ราคารวม", "สัดส่วน"], 3), 1, 5);
    const placed = groups.map((g) =>
      writeCategorySheets(wb, meta, used, g, {
        widths: [12, 50, 11, 9, 16, 17, 28],
        header: ["ลำดับ", "รายการ", "ปริมาณ", "หน่วย", "ราคาต่อหน่วย", "ราคารวม", "หมายเหตุ"],
        numericFrom: 3,
        title: (part, parts) => [
          { text: meta.companyName, bold: true, size: 12 },
          { text: `หมวด ${g.label} · ${g.name}${parts > 1 ? ` · แผ่นที่ ${part} จาก ${parts}` : ""}`, size: 14, color: NAVY },
          { text: quoteLine, color: MUTED },
          { text: `โครงการ: ${meta.projectName} (${meta.projectNo})`, color: MUTED },
        ],
        addLine: (sheetWs, l: CustomerLine) => {
          const row = sheetWs.addRow([l.code ?? "", l.name, l.quantity, l.unit, l.unitPrice, null, l.note ?? ""]);
          qty(row.getCell(3));
          row.getCell(6).value = f(`ROUND(C${row.number}*E${row.number},2)`, l.lineTotal);
          money(row.getCell(5));
          money(row.getCell(6));
          row.getCell(2).alignment = { wrapText: true, vertical: "middle" };
        },
        sums: [{ col: 6, of: (l) => l.lineTotal }],
        // ยอดรวมหมวดตามใบเสนอราคาที่ลูกค้าเห็น — ห้ามคลาดแม้สตางค์เดียว
        finalTotals: [g.subtotal],
      }),
    );
    const first = ws.rowCount + 1;
    const totalRowNo = first + groups.length;
    groupsTotal = r2(groups.reduce((s, g) => s + g.subtotal, 0));
    groups.forEach((g, i) =>
      summaryGroupRow(ws, { label: g.label, name: g.name, lineCount: g.lines.length }, placed[i], [6], totalRowNo, groupsTotal!, i % 2 === 1),
    );
    summaryTotalRow(ws, "รวมทุกหมวด", first, totalRowNo - 1, [groupsTotal], groups.reduce((n, g) => n + g.lines.length, 0));
    ws.addRow([]);
  }

  // ยอดท้ายใบ: ตัวเลขจากระบบชุดเดียวกับใบเสนอราคา PDF (ไม่ใช่สูตร) — ห้ามคลาดจากใบที่ส่งไปแม้สตางค์เดียว
  if (t.discountAmt > 0 || t.roundingAmt > 0) {
    // แถว "รวมทุกหมวด" ข้างบนเป็นยอดเดียวกันอยู่แล้ว ไม่พิมพ์ซ้ำ — คลาดกันเมื่อไรค่อยแสดงตัวเลขของระบบ
    if (groupsTotal == null || groupsTotal !== t.beforeDiscount) summaryRow(ws, L, "รวมมูลค่างาน", t.beforeDiscount);
    if (t.discountAmt > 0) {
      const pct = t.discountPct != null ? ` ${t.discountPct}%` : "";
      summaryRow(ws, L, `ส่วนลด${pct}${t.discountNote ? ` (${t.discountNote})` : ""}`, -t.discountAmt);
    }
    if (t.roundingAmt > 0) summaryRow(ws, L, "ส่วนลดปัดเศษ", -t.roundingAmt);
  }
  summaryRow(ws, L, "รวมมูลค่าก่อนภาษีมูลค่าเพิ่ม", t.subtotalBeforeVat);
  summaryRow(ws, L, `ภาษีมูลค่าเพิ่ม ${t.vatPct}%`, t.vatAmt);
  summaryRow(ws, L, "รวมมูลค่าทั้งสิ้น", t.netPrice, { grand: true });
  if (t.withholding) {
    summaryRow(ws, L, `หัก ภาษี ณ ที่จ่าย ${t.withholding.pct}% (ของยอดก่อน VAT)`, -t.withholding.tax);
    summaryRow(ws, L, "ยอดชำระหลังหัก ณ ที่จ่าย", t.withholding.netTransfer, { bold: true });
  }
  ws.addRow([]);
  const note = ws.addRow([`ราคาตามใบเสนอราคาเลขที่ ${quote.quoteNo} · ไฟล์นี้ส่งออกเมื่อ ${thaiDateTime(meta.exportedAt)}`]);
  note.getCell(1).font = { name: FONT, size: 9, color: { argb: "FF5A6078" } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
