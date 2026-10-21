import ExcelJS from "exceljs";

import { parseBoqImport, type ImportCategory } from "../../src/lib/excel/boq-import";
import {
  LINES_PER_SHEET,
  buildCustomerBoqWorkbook,
  buildInternalBoqWorkbook,
  safeSheetName,
  type InternalGroup,
  type SubgroupRef,
  type VersionPricing,
  type WorkbookMeta,
} from "../../src/lib/excel/boq-workbook";

/**
 * Excel BOQ แบ่งชีต: สรุปหน้าแรก → ชีตละหมวด → หมวดเกิน 100 บรรทัดต่อชีตใหม่พร้อมยอดยกมา/ยกไป
 *
 * จุดที่พังง่ายและเทสต์นี้กันไว้: ชื่อชีตผิดกฎ Excel (ไฟล์เปิดไม่ขึ้น) · ยอดยกข้ามชีตอ้างผิดแถว/ผิดชีต
 * (ยอดรวมหมวดผิดเงียบ ๆ) · ตัวนำเข้าอ่านแค่ชีตแรก (บรรทัดหายตอนนำกลับเข้า) · ราคาทุนหลุดไปฉบับลูกค้า
 */

const meta: WorkbookMeta = {
  companyName: "บริษัททดสอบ",
  projectNo: "PRJ-TEST-0001",
  projectName: "บ้าน A&B",
  customerName: "ลูกค้าทดสอบ",
  siteAddress: null,
  exportedAt: new Date("2026-10-09T07:00:00Z"),
};

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

function lines(code: string, count: number, base: number, subgroupAt: (i: number) => SubgroupRef | null = () => null) {
  return Array.from({ length: count }, (_, i) => {
    const quantity = 1 + (i % 7);
    const materialUnitPrice = base + i;
    const laborUnitPrice = 10 + (i % 3);
    const materialTotal = r2(quantity * materialUnitPrice);
    const laborTotal = r2(quantity * laborUnitPrice);
    return {
      subgroup: subgroupAt(i),
      code,
      name: `งานที่ ${i + 1}`,
      quantity,
      unit: "ชุด",
      materialUnitPrice,
      laborUnitPrice,
      materialTotal,
      laborTotal,
      lineTotal: r2(materialTotal + laborTotal),
      note: null,
    };
  });
}

const SUBS: SubgroupRef[] = [
  { code: "B-04", name: "งานฐานราก" },
  { code: "B-05", name: "งานโครงสร้าง" },
  { code: "B-06", name: "งานหลังคา" },
];

const GROUPS: InternalGroup[] = [
  { label: "A", name: "หมวดงานเตรียมการ", lines: lines("A-01-01", 3, 100) },
  // หมวดย่อย 3 ก้อน: B-04 (0–59) จบในแผ่น 1 · B-05 (60–149) ข้ามแผ่น 1→2 · B-06 (150–249) ข้ามแผ่น 2→3
  { label: "B", name: "หมวดงานโครงสร้าง", lines: lines("B-04-01", 250, 200, (i) => SUBS[i < 60 ? 0 : i < 150 ? 1 : 2]) },
  // ชื่อยาว + อักขระที่ชื่อชีตห้ามใช้ + ' ที่ต้องเขียนซ้อนในสูตร · หมวดย่อยเดียว (ไม่ต้องมีรวมหมวดย่อย)
  {
    label: "C",
    name: "งานระบบไฟฟ้า/ประปา [ชั้น 1-2] ของคุณ 'สมชาย' ยาวมาก ๆ",
    lines: lines("C-01-01", 2, 300, () => ({ code: "C-01", name: "งานเดินสายไฟ" })),
  },
];

const directCost = r2(GROUPS.flatMap((g) => g.lines).reduce((s, l) => s + l.lineTotal, 0));

const pricing: VersionPricing = {
  versionNo: 2,
  isCustom: false,
  directCost,
  contingencyPct: 0,
  contingencyAmt: 0,
  overheadProfitPct: 10,
  overheadProfitAmt: r2(directCost * 0.1),
  discountPct: null,
  discountAmt: 0,
  discountNote: null,
  roundingUnit: null,
  roundingAmt: 0,
  vatPct: 7,
  vatAmt: r2(r2(directCost * 1.1) * 0.07),
  netPrice: r2(r2(directCost * 1.1) * 1.07),
};

async function load(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

/**
 * คิดสูตรที่ไฟล์ใช้ยกยอด/รวมหมวด/ดึงยอดเข้าหน้าสรุปจริง ๆ (ไม่เชื่อผลที่ฝังไว้) — รองรับ
 * `'ชีต'!F12` · `F12` · `SUM(F7:F106)` · `ROUND(C7*E7,2)` · `ROUND(F7+H7,2)` และบวกกันด้วย +
 */
function evaluate(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, address: string, depth = 0): number {
  if (depth > 50) throw new Error(`สูตรวนเกิน 50 ชั้นที่ ${ws.name}!${address}`);
  const value = ws.getCell(address).value as unknown;
  if (typeof value === "number") return value;
  if (value == null) return 0;
  const formula = (value as { formula?: string }).formula;
  if (!formula) throw new Error(`ช่อง ${ws.name}!${address} ไม่ใช่ตัวเลขหรือสูตร`);
  return evalExpr(wb, ws, formula, depth);
}

/** แยกด้วยตัวคั่น เฉพาะที่อยู่นอกวงเล็บและนอกชื่อชีตใน '...' */
function splitTopLevel(expr: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === "'") quoted = !quoted;
    else if (!quoted && ch === "(") depth++;
    else if (!quoted && ch === ")") depth--;
    else if (!quoted && depth === 0 && ch === sep) {
      out.push(expr.slice(start, i));
      start = i + 1;
    }
  }
  out.push(expr.slice(start));
  return out;
}

function evalExpr(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, expr: string, depth: number): number {
  const round = /^ROUND\((.+),2\)$/.exec(expr);
  if (round) return r2(evalExpr(wb, ws, round[1], depth));
  const terms = splitTopLevel(expr, "+");
  if (terms.length > 1) return r2(terms.reduce((s, t) => s + evalExpr(wb, ws, t, depth), 0));
  const mul = /^([A-Z]+\d+)\*([A-Z]+\d+)$/.exec(expr);
  if (mul) return evaluate(wb, ws, mul[1], depth + 1) * evaluate(wb, ws, mul[2], depth + 1);
  const sum = /^SUM\((.+)\)$/.exec(expr);
  if (sum) {
    let total = 0;
    for (const arg of splitTopLevel(sum[1], ",")) {
      const m = /^(?:'((?:[^']|'')+)'!)?([A-Z]+)(\d+)(?::\2(\d+))?$/.exec(arg);
      if (!m) throw new Error(`ตัวคิดในเทสต์ไม่รู้จักช่วง: ${arg}`);
      const target = m[1] ? wb.getWorksheet(m[1].replaceAll("''", "'")) : ws;
      if (!target) throw new Error(`สูตรอ้างชีตที่ไม่มีอยู่: ${m[1]}`);
      for (let r = Number(m[3]); r <= Number(m[4] ?? m[3]); r++) total += evaluate(wb, target, `${m[2]}${r}`, depth + 1);
    }
    return r2(total);
  }
  const cross = /^'((?:[^']|'')+)'!([A-Z]+\d+)$/.exec(expr);
  if (cross) {
    const target = wb.getWorksheet(cross[1].replaceAll("''", "'"));
    if (!target) throw new Error(`สูตรอ้างชีตที่ไม่มีอยู่: ${cross[1]}`);
    return evaluate(wb, target, cross[2], depth + 1);
  }
  if (/^[A-Z]+\d+$/.test(expr)) return evaluate(wb, ws, expr, depth + 1);
  if (/^\d+(\.\d+)?$/.test(expr)) return Number(expr);
  throw new Error(`ตัวคิดในเทสต์ไม่รู้จักสูตร: ${expr}`);
}

/** แถวที่คอลัมน์ 2 ขึ้นต้นด้วยข้อความนี้ */
function rowStarting(ws: ExcelJS.Worksheet, prefix: string): ExcelJS.Row | undefined {
  let found: ExcelJS.Row | undefined;
  ws.eachRow((row) => {
    if (!found && String(row.getCell(2).value ?? "").startsWith(prefix)) found = row;
  });
  return found;
}

/** แถวที่คอลัมน์ A เป็นข้อความนี้พอดี (หัวหมวดย่อย) */
function rowWithA(ws: ExcelJS.Worksheet, text: string): ExcelJS.Row | undefined {
  let found: ExcelJS.Row | undefined;
  ws.eachRow((row) => {
    if (!found && row.getCell(1).value === text) found = row;
  });
  return found;
}

/** จำนวนบรรทัดงาน (แถวที่มีปริมาณเป็นตัวเลข) */
function lineCount(ws: ExcelJS.Worksheet): number {
  let n = 0;
  ws.eachRow((row) => {
    if (typeof row.getCell(3).value === "number" && row.getCell(4).value) n++;
  });
  return n;
}

describe("ชื่อชีตที่ Excel รับได้", () => {
  it("ตัดอักขระต้องห้าม · ไม่เกิน 31 ตัว · ไม่ขึ้นต้น/ลงท้ายด้วย ' · ว่างแล้วมีชื่อแทน", () => {
    const used = new Set<string>();
    expect(safeSheetName("A งาน/ไฟฟ้า:ประปา [1]*?\\", used)).toBe("A งาน-ไฟฟ้า-ประปา -1----");
    const long = safeSheetName("B หมวดงานโครงสร้างและงานฐานรากทั้งหมดของบ้าน", used, " (12)");
    expect(long.length).toBeLessThanOrEqual(31);
    expect(long.endsWith(" (12)")).toBe(true);
    expect(safeSheetName("'ชื่อในเครื่องหมาย'", used)).toBe("ชื่อในเครื่องหมาย");
    // ไทยไม่มีเว้นวรรค: ย่อตรงรอยต่อคำ + "…" ไม่ตัดกลางคำ
    expect(safeSheetName("E ระบบสุขาภิบาลและป้องกันอัคคีภัยทั้งอาคาร", used)).toBe("E ระบบสุขาภิบาลและป้องกันอัคคี…");
    expect(safeSheetName("   ", used)).toBe("หมวด");
    expect(safeSheetName("''", used)).toBe("หมวด 2");
  });

  it("ชื่อซ้ำ (ไม่สนตัวพิมพ์) / ชนชื่อชีตของระบบ / History → เติมเลขต่อท้าย", () => {
    const used = new Set(["สรุป"]);
    expect(safeSheetName("สรุป", used)).toBe("สรุป 2");
    expect(safeSheetName("X Roof", used)).toBe("X Roof");
    expect(safeSheetName("x roof", used)).toBe("x roof 2");
    expect(safeSheetName("History", used)).toBe("History 2");
    // ชื่อยาวชนกัน: ตัดชื่อให้สั้นลงเพื่อเก็บเลขท้ายไว้ ไม่ใช่ตัดเลขทิ้ง
    const base = "ก".repeat(40);
    const a = safeSheetName(base, used);
    const b = safeSheetName(base, used);
    expect(a).toHaveLength(31);
    expect(a.endsWith("…")).toBe(true);
    expect(b).toHaveLength(31);
    expect(b.endsWith(" 2")).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe("Excel ฉบับภายใน — แบ่งชีตตามหมวด + ต่อชีตทุก 100 บรรทัด", () => {
  let wb: ExcelJS.Workbook;
  let buffer: Buffer;

  beforeAll(async () => {
    buffer = await buildInternalBoqWorkbook({ meta, pricing, groups: GROUPS });
    wb = await load(buffer);
  });

  it("ลำดับชีต: สรุป → A → B (1)(2)(3) → C · ชื่อถูกกฎและไม่ซ้ำ", () => {
    const names = wb.worksheets.map((w) => w.name);
    expect(names[0]).toBe("สรุป");
    expect(names[1]).toBe("A เตรียมการ");
    expect(names.slice(2, 5)).toEqual(["B โครงสร้าง (1)", "B โครงสร้าง (2)", "B โครงสร้าง (3)"]);
    expect(names[5].startsWith("C งานระบบไฟฟ้า-ประปา -ชั้น")).toBe(true);
    expect(names.at(-1)).toMatch(/^C /);
    for (const n of names) {
      expect(n.length).toBeLessThanOrEqual(31);
      expect(n).not.toMatch(/[:\\/?*[\]]/);
      expect(n).not.toMatch(/^'|'$/);
    }
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
  });

  it(`แต่ละชีตมีบรรทัดไม่เกิน ${LINES_PER_SHEET} และครบทุกบรรทัด ไม่ซ้ำ ไม่หาย`, () => {
    const counts = wb.worksheets.slice(1, 6).map(lineCount);
    expect(counts).toEqual([3, 100, 100, 50, 2]);
    const names: string[] = [];
    for (const ws of wb.worksheets.slice(2, 5)) ws.eachRow((row) => typeof row.getCell(3).value === "number" && names.push(String(row.getCell(2).value)));
    expect(names).toEqual(GROUPS[1].lines.map((l) => l.name));
  });

  it("ยอดยกไป → ยอดยกมา อ้างชีตก่อนหน้าแถวที่ถูก และรวมหมวดคิดได้ตรงกับผลรวมบรรทัดจริง", () => {
    const [b1, b2, b3] = wb.worksheets.slice(2, 5);
    const out1 = rowStarting(b1, "ยอดยกไปแผ่นที่ 2")!;
    const in2 = rowStarting(b2, "ยอดยกมาจากแผ่นที่ 1")!;
    const out2 = rowStarting(b2, "ยอดยกไปแผ่นที่ 3")!;
    const in3 = rowStarting(b3, "ยอดยกมาจากแผ่นที่ 2")!;
    const total = rowStarting(b3, "รวมหมวด B")!;
    expect(rowStarting(b1, "รวมหมวด")).toBeUndefined();
    expect(rowStarting(b1, "ยอดยกมา")).toBeUndefined();
    expect((in2.getCell(9).value as { formula: string }).formula).toBe(`'${b1.name}'!I${out1.number}`);
    expect((in3.getCell(9).value as { formula: string }).formula).toBe(`'${b2.name}'!I${out2.number}`);

    const expected = (n: number, key: "materialTotal" | "laborTotal" | "lineTotal") =>
      r2(GROUPS[1].lines.slice(0, n).reduce((s, l) => s + l[key], 0));
    for (const [col, key] of [[6, "materialTotal"], [8, "laborTotal"], [9, "lineTotal"]] as const) {
      const L = String.fromCodePoint(64 + col);
      expect(evaluate(wb, b1, `${L}${out1.number}`)).toBeCloseTo(expected(100, key), 2);
      expect(evaluate(wb, b2, `${L}${out2.number}`)).toBeCloseTo(expected(200, key), 2);
      expect(evaluate(wb, b3, `${L}${total.number}`)).toBeCloseTo(expected(250, key), 2);
      // ผลที่ฝังไว้ (โปรแกรมที่ไม่คิดสูตรเห็นค่านี้) ต้องตรงกับที่สูตรคิด
      expect((total.getCell(col).value as { result: number }).result).toBeCloseTo(expected(250, key), 2);
    }
  });

  it("หมวดย่อย: มีแถบหัว · ข้ามแผ่นมี (ต่อ) · รวมหมวดย่อยบวกข้ามแผ่นถูก · รวมหมวดไม่นับซ้ำ", () => {
    const [b1, b2, b3] = wb.worksheets.slice(2, 5);
    const sumOf = (from: number, to: number) => r2(GROUPS[1].lines.slice(from, to).reduce((s, l) => s + l.lineTotal, 0));

    // แผ่น 1: B-04 จบในแผ่น → มีรวม · B-05 เริ่มแต่ยังไม่จบ → ไม่มีรวมในแผ่นนี้
    expect(rowWithA(b1, "B-04  งานฐานราก")).toBeDefined();
    expect(rowWithA(b1, "B-05  งานโครงสร้าง")).toBeDefined();
    const sub04 = rowStarting(b1, "รวม B-04  งานฐานราก")!;
    expect(evaluate(wb, b1, `I${sub04.number}`)).toBeCloseTo(sumOf(0, 60), 2);
    expect(rowStarting(b1, "รวม B-05")).toBeUndefined();

    // แผ่น 2: ต่อ B-05 → รวม B-05 บวกช่วงแผ่น 1 + แผ่น 2 · เริ่ม B-06
    expect(rowWithA(b2, "B-05  งานโครงสร้าง (ต่อ)")).toBeDefined();
    const sub05 = rowStarting(b2, "รวม B-05  งานโครงสร้าง")!;
    expect((sub05.getCell(9).value as { formula: string }).formula).toContain(`'${b1.name}'!I`);
    expect(evaluate(wb, b2, `I${sub05.number}`)).toBeCloseTo(sumOf(60, 150), 2);
    expect((sub05.getCell(9).value as { result: number }).result).toBeCloseTo(sumOf(60, 150), 2);
    expect(rowWithA(b2, "B-06  งานหลังคา")).toBeDefined();

    // แผ่น 3: ต่อ B-06 จนจบ → รวม B-06 แล้วค่อยรวมหมวด
    expect(rowWithA(b3, "B-06  งานหลังคา (ต่อ)")).toBeDefined();
    const sub06 = rowStarting(b3, "รวม B-06  งานหลังคา")!;
    expect(evaluate(wb, b3, `I${sub06.number}`)).toBeCloseTo(sumOf(150, 250), 2);
    const total = rowStarting(b3, "รวมหมวด B")!;
    expect(total.number).toBeGreaterThan(sub06.number);
    // รวมหมวดต้องเท่าผลรวมบรรทัด ไม่ใช่บรรทัด + แถวรวมหมวดย่อย (นับซ้ำ)
    expect(evaluate(wb, b3, `I${total.number}`)).toBeCloseTo(sumOf(0, 250), 2);

    // หมวดที่มีหมวดย่อยก้อนเดียว: มีแถบหัวแต่ไม่มีรวมหมวดย่อย (ซ้ำกับรวมหมวด) · หมวดไม่มีหมวดย่อย: ไม่มีแถบ
    const c = wb.worksheets[5];
    expect(rowWithA(c, "C-01  งานเดินสายไฟ")).toBeDefined();
    expect(rowStarting(c, "รวม C-01")).toBeUndefined();
    const a = wb.worksheets[1];
    let aHeaders = 0;
    a.eachRow((row) => typeof row.getCell(1).value === "string" && row.getCell(2).value == null && row.number > 6 && aHeaders++);
    expect(aHeaders).toBe(0);
  });

  it("หน้าสรุป: ทุกหมวดดึงยอดจากแถวรวมหมวดถูกชีต · รวมทุกหมวด = ต้นทุนตรง · ยอดสุทธิคิดได้ตรงกับระบบ", () => {
    const sum = wb.getWorksheet("สรุป")!;
    const text: string[] = [];
    sum.eachRow((row) => row.eachCell((c) => text.push(String(c.text))));
    expect(text.join(" | ")).toContain("ห้ามส่งให้ลูกค้า");

    const groupRows: ExcelJS.Row[] = [];
    sum.eachRow((row) => ["A", "B", "C"].includes(String(row.getCell(1).value)) && groupRows.push(row));
    expect(groupRows).toHaveLength(3);
    GROUPS.forEach((g, i) => {
      const row = groupRows[i];
      const own = r2(g.lines.reduce((s, l) => s + l.lineTotal, 0));
      expect(evaluate(wb, sum, `F${row.number}`)).toBeCloseTo(own, 2);
      expect(row.getCell(3).value).toBe(g.lines.length);
    });
    // ชื่อหมวดเป็นลิงก์ไปชีตแรกของหมวด (หมวดที่แบ่งไปแผ่นที่ 1)
    expect((groupRows[1].getCell(2).value as { hyperlink: string }).hyperlink).toBe("#'B โครงสร้าง (1)'!A1");
    expect(String((groupRows[1].getCell(2).value as { text: string }).text)).toContain("(3 แผ่น)");

    const direct = rowStarting(sum, "รวมต้นทุนตรง (ทุกหมวด)")!;
    expect(evaluate(wb, sum, `F${direct.number}`)).toBeCloseTo(directCost, 2);

    let netRow: ExcelJS.Row | undefined;
    sum.eachRow((row) => row.getCell(5).value === "รวมมูลค่าทั้งสิ้น" && (netRow = row));
    expect((netRow!.getCell(6).value as { result: number }).result).toBe(pricing.netPrice);
  });

  it("พิมพ์: ทุกชีตมีเลขหน้าท้ายกระดาษ · ชีตหมวดพิมพ์หัวตารางซ้ำทุกหน้า + ลิงก์กลับหน้าสรุป", () => {
    for (const ws of wb.worksheets) {
      expect(ws.headerFooter.oddFooter).toContain("หน้า &P / &N");
      // & ในชื่อโครงการต้องเขียนซ้อน ไม่งั้น Excel อ่านเป็นรหัสคำสั่ง
      expect(ws.headerFooter.oddFooter).toContain("บ้าน A&&B");
    }
    // เส้นตาราง Excel ต้องเปิดอยู่ (ผู้ใช้สั่งเปิดกลับ — ช่วยกะช่องตอนแก้ตัวเลข ไม่มีผลตอนพิมพ์) · หัวตารางตรึงไว้
    for (const ws of wb.worksheets.slice(0, 6)) {
      expect(ws.views[0]).toMatchObject({ state: "frozen" });
      expect(ws.views[0].showGridLines).not.toBe(false);
    }
    // ตารางตีเส้นครบทุกช่อง (All Borders): หัวตาราง · บรรทัด · หัว/รวมหมวดย่อย · รวมหมวด (เส้นตั้งด้วย)
    const sides = (cell: ExcelJS.Cell) => ["top", "left", "bottom", "right"].filter((k) => cell.border?.[k as "top"]);
    const b1 = wb.worksheets[2];
    for (const row of [rowStarting(b1, "รายการ")!, rowWithA(b1, "B-04  งานฐานราก")!, rowStarting(b1, "รวม B-04")!]) {
      for (const col of [1, 5, 10]) expect(sides(row.getCell(col))).toEqual(["top", "left", "bottom", "right"]);
    }
    let firstLine: ExcelJS.Row | undefined;
    b1.eachRow((row) => !firstLine && typeof row.getCell(3).value === "number" && (firstLine = row));
    expect(sides(firstLine!.getCell(10))).toEqual(["top", "left", "bottom", "right"]);
    // แบบ B มินิมอล (ผู้ใช้เลือก 14 ต.ค. 2026): ไม่มีพื้นสีทึบเลย — หัวตาราง/แถวรวมแยกด้วยตัวหนา + เส้น
    const fillOf = (cell: ExcelJS.Cell) => (cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
    const header = rowStarting(b1, "รายการ")!;
    expect(fillOf(header.getCell(2))).toBeUndefined();
    expect(header.getCell(2).border?.bottom?.style).toBe("medium");
    // หัวคอลัมน์ข้อความชิดซ้าย แม้อยู่หลังคอลัมน์ตัวเลข
    header.eachCell((cell) => {
      if (cell.value === "หน่วย" || cell.value === "หมายเหตุ") expect(cell.alignment?.horizontal).toBe("left");
    });
    // รวมหมวดย่อย/ยอดยกมา = ไม่มีพื้น · รวมหมวดย่อยตัวน้ำเงินหนา + เส้นเข้มด้านบน
    const sub04 = rowStarting(b1, "รวม B-04")!;
    for (const col of [1, 2, 9, 10]) expect(fillOf(sub04.getCell(col))).toBeUndefined();
    expect(sub04.getCell(9).font?.color?.argb).toBe("FF000099");
    expect(sub04.getCell(9).border?.top?.color?.argb).toBe("FF1F2937");
    expect(fillOf(rowStarting(wb.worksheets[3], "ยอดยกมาจากแผ่นที่ 1")!.getCell(9))).toBeUndefined();
    // รวมหมวด/ยอดยกไป/รวมหน้าสรุป = ไม่มีพื้น ตัวหนาสีเข้ม + เส้นคู่ใต้
    const totalB = rowStarting(wb.worksheets[4], "รวมหมวด B")!;
    for (const col of [1, 2, 9, 10]) expect(fillOf(totalB.getCell(col))).toBeUndefined();
    expect(totalB.getCell(9).font?.bold).toBe(true);
    expect(totalB.getCell(9).border?.bottom?.style).toBe("double");
    expect(fillOf(rowStarting(b1, "ยอดยกไปแผ่นที่ 2")!.getCell(9))).toBeUndefined();
    expect(fillOf(rowStarting(wb.getWorksheet("สรุป")!, "รวมต้นทุนตรง")!.getCell(6))).toBeUndefined();
    // ปริมาณจำนวนเต็มไม่มีจุดค้าง ("16." → "16") · ทศนิยมยังโชว์ได้ 3 ตำแหน่ง
    b1.eachRow((row) => {
      const q = row.getCell(3).value;
      if (typeof q === "number") expect(row.getCell(3).numFmt).toBe(Number.isInteger(q) ? "#,##0" : "#,##0.###");
    });
    // เว้นระยะบน-ล่าง: แถวในตารางสูง 24pt จัดกึ่งกลางแนวตั้ง (ค่าเริ่มต้น 18 ชิดเส้นเกินไป)
    expect(firstLine!.height).toBe(24);
    expect(firstLine!.getCell(5).alignment?.vertical).toBe("middle");
    expect(rowStarting(wb.worksheets[4], "รวมหมวด B")!.height).toBe(24);
    expect(sides(rowStarting(wb.worksheets[4], "รวมหมวด B")!.getCell(9))).toEqual(["top", "left", "bottom", "right"]);
    for (const ws of wb.worksheets.slice(1, 6)) {
      const header = rowStarting(ws, "รายการ")!;
      expect(ws.pageSetup.printTitlesRow).toBe(`${header.number}:${header.number}`);
      expect(ws.views[0]).toMatchObject({ ySplit: header.number });
      const back = ws.getRow(1).getCell(10).value as { hyperlink: string };
      expect(back.hyperlink).toBe("#'สรุป'!A1");
    }
  });

  it("นำกลับเข้า: อ่านครบทุกชีตหมวด ได้บรรทัดครบ ต้นทุนตรงเท่าเดิม ไม่เอาแถวยกยอดมาเป็นงาน", async () => {
    const categories: ImportCategory[] = ["A-01-01", "B-04-01", "C-01-01"].map((code) => ({ id: code, code, name: code, usable: true }));
    const preview = await parseBoqImport(buffer, categories, null);
    expect(preview.sheetNames).toEqual(wb.worksheets.slice(1, 6).map((w) => w.name));
    expect(preview.skippedSheets).toEqual([]);
    expect(preview.rows).toHaveLength(255);
    expect(preview.rows.every((r) => r.errors.length === 0)).toBe(true);
    expect(preview.rows.some((r) => /^(ยอด|รวม)/.test(r.name))).toBe(false);
    expect(r2(preview.rows.reduce((s, r) => s + r.lineTotal, 0))).toBe(directCost);
    // แถวเดียวกันระบุได้จากชีต + เลขแถว (เลขแถวซ้ำข้ามชีต)
    expect(new Set(preview.rows.map((r) => `${r.sheet}:${r.rowNumber}`)).size).toBe(255);
  });

  it("ขอบ 100 พอดี = ชีตเดียวไม่มีเลขแผ่น · 101 = สองชีต (100 + 1)", async () => {
    const make = (n: number) =>
      buildInternalBoqWorkbook({ meta, pricing, groups: [{ label: "D", name: "งานพื้น", lines: lines("D-01-01", n, 50) }] }).then(load);
    const exact = await make(100);
    expect(exact.worksheets.map((w) => w.name)).toEqual(["สรุป", "D งานพื้น"]);
    expect(rowStarting(exact.worksheets[1], "ยอดยกไป")).toBeUndefined();
    const over = await make(101);
    expect(over.worksheets.map((w) => w.name)).toEqual(["สรุป", "D งานพื้น (1)", "D งานพื้น (2)"]);
    expect(over.worksheets.slice(1, 3).map(lineCount)).toEqual([100, 1]);
  });
});

describe("Excel ฉบับลูกค้า — แบ่งชีตแบบเดียวกัน ไม่มีราคาทุนในชีตไหนเลย", () => {
  it("รวมหมวดในไฟล์ = ยอดหมวดของใบเสนอราคา · ไม่มีคำของราคาทุนทุกชีต · ตัวนำเข้าไม่รับ", async () => {
    const groups = GROUPS.map((g) => {
      const items = g.lines.map((l) => ({
        code: l.code,
        name: l.name,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: r2((l.materialUnitPrice + l.laborUnitPrice) * 1.1),
        lineTotal: r2(l.quantity * r2((l.materialUnitPrice + l.laborUnitPrice) * 1.1)),
        note: null,
      }));
      return { label: g.label, name: g.name, lines: items, subtotal: r2(items.reduce((s, l) => s + l.lineTotal, 0)) };
    });
    const before = r2(groups.reduce((s, g) => s + g.subtotal, 0));
    const buffer = await buildCustomerBoqWorkbook({
      meta,
      quote: { quoteNo: "QT-TEST-1", revisionNo: 1, date: new Date("2026-10-09"), validUntil: null },
      isCustom: false,
      groups,
      totals: {
        beforeDiscount: before,
        discountPct: 5,
        discountAmt: r2(before * 0.05),
        discountNote: null,
        roundingAmt: 0,
        subtotalBeforeVat: r2(before * 0.95),
        vatPct: 7,
        vatAmt: r2(r2(before * 0.95) * 0.07),
        netPrice: r2(r2(before * 0.95) * 1.07),
        withholding: null,
      },
    });
    const wb = await load(buffer);
    expect(wb.worksheets.map((w) => w.name).slice(0, 5)).toEqual([
      "สรุป",
      "A เตรียมการ",
      "B โครงสร้าง (1)",
      "B โครงสร้าง (2)",
      "B โครงสร้าง (3)",
    ]);

    for (const ws of wb.worksheets) {
      const text: string[] = [];
      ws.eachRow((row) => row.eachCell((c) => text.push(String(c.text))));
      for (const secret of ["ค่าวัสดุ", "ค่าแรง", "ต้นทุน", "ค่าดำเนินการ", "กำไร", "ห้ามส่ง"]) {
        expect(text.join(" | ")).not.toContain(secret);
      }
    }

    const b3 = wb.getWorksheet("B โครงสร้าง (3)")!;
    const total = rowStarting(b3, "รวมหมวด B")!;
    expect((total.getCell(6).value as { result: number }).result).toBe(groups[1].subtotal);
    expect(evaluate(wb, b3, `F${total.number}`)).toBeCloseTo(groups[1].subtotal, 2);

    // หน้าสรุป: "รวมทุกหมวด" เท่ากับ "รวมมูลค่างาน" อยู่แล้ว จึงไม่พิมพ์ซ้ำ
    const sum = wb.getWorksheet("สรุป")!;
    const labels: string[] = [];
    sum.eachRow((row) => row.eachCell((c) => labels.push(String(c.text))));
    expect(labels).toContain("รวมทุกหมวด");
    expect(labels).not.toContain("รวมมูลค่างาน");
    expect(labels).toContain("ส่วนลด 5%");

    await expect(parseBoqImport(buffer, [], null)).rejects.toThrow("ราคาขาย");
  });
});
