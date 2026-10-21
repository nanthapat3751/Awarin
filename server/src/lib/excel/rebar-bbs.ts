import ExcelJS from "exceljs";
import { OFFCUT_KEEP_MIN, rebarCode } from "@systemboq/shared-types";

import type { RebarSchedule } from "../rebar-cutting";
import type { WorkbookMeta } from "./boq-workbook";

// สไตล์ชุดเดียวกับ Excel BOQ (boq-workbook.ts) — หัวตารางมินิมอล ตัวหนา + เส้นเข้มใต้หัว
const FONT = "Tahoma";
const NAVY = "FF000099";
const INK = "FF1F2937";
const MUTED = "FF6B7280";
const RULE = "FFC8CCD8";
const LEN = "#,##0.000";
const KG = "#,##0.00";
const INT = "#,##0";

function sheet(wb: ExcelJS.Workbook, name: string, widths: number[], meta: WorkbookMeta) {
  const project = `${meta.projectNo} ${meta.projectName}`.replaceAll("&", "&&");
  const ws = wb.addWorksheet(name, {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { defaultRowHeight: 18 },
    headerFooter: { oddFooter: `&L&8${project}&R&8หน้า &P / &N` },
  });
  ws.columns = widths.map((width) => ({ width, style: { font: { name: FONT, size: 10 } } }));
  return ws;
}

function title(ws: ExcelJS.Worksheet, meta: WorkbookMeta, versionNo: number, heading: string) {
  const lines: [string, Partial<ExcelJS.Font>][] = [
    [meta.companyName, { bold: true, size: 12, color: { argb: NAVY } }],
    [heading, { bold: true, size: 11 }],
    [`โครงการ ${meta.projectNo} ${meta.projectName} · BOQ เวอร์ชัน ${versionNo}`, {}],
    [
      `ส่งออกเมื่อ ${meta.exportedAt.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })} · คิดด้วย “ชุดสั่งตัด” (ตั้งค่า → ถอดปริมาณ) · ไม่ใช่ราคาที่เสนอลูกค้า`,
      { size: 9, color: { argb: MUTED } },
    ],
  ];
  for (const [text, font] of lines) ws.addRow([text]).getCell(1).font = { name: FONT, size: 10, ...font };
  ws.addRow([]);
}

function header(ws: ExcelJS.Worksheet, labels: string[], numericFrom: number) {
  const row = ws.addRow(labels);
  row.height = 22;
  row.eachCell((cell, col) => {
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: INK } };
    cell.alignment = { vertical: "middle", horizontal: col >= numericFrom ? "right" : "left", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: INK } } };
  });
  ws.views = [{ state: "frozen", ySplit: row.number }];
  ws.pageSetup.printTitlesRow = `${row.number}:${row.number}`;
}

function fmt(row: ExcelJS.Row, formats: Record<number, string>) {
  for (const [col, numFmt] of Object.entries(formats)) {
    const cell = row.getCell(Number(col));
    cell.numFmt = numFmt;
    cell.alignment = { horizontal: "right" };
  }
}

function totalRow(ws: ExcelJS.Worksheet, values: (string | number | null)[], formats: Record<number, string>) {
  const row = ws.addRow(values);
  row.eachCell((cell) => {
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: NAVY } };
    cell.border = { top: { style: "thin", color: { argb: RULE } } };
  });
  fmt(row, formats);
}

const groupRow = (ws: ExcelJS.Worksheet, text: string) => {
  const row = ws.addRow([text]);
  row.getCell(1).font = { name: FONT, size: 10, bold: true, color: { argb: NAVY } };
  return row;
};

/**
 * รายการสั่งเหล็กหน้างาน (Bar Bending Schedule) — Phase 3 ข้อ 3d
 * ชีต 1 สรุปตามขนาด (ซื้อเส้นยาวไหน กี่เส้น เศษเท่าไร) · ชีต 2 รายชิ้นส่วน · ชีต 3 แผนตัดให้ช่าง
 * ไฟล์ภายใน: ไม่มีราคา แต่เป็นตัวเลขหน้างาน ห้ามส่งลูกค้าแทน BOQ
 */
export async function buildRebarBbsWorkbook(input: {
  meta: WorkbookMeta;
  versionNo: number;
  schedule: RebarSchedule;
}): Promise<Buffer> {
  const { meta, versionNo, schedule } = input;
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.companyName;
  wb.created = meta.exportedAt;

  // ---------- 1. สรุปขนาด ----------
  const s1 = sheet(wb, "สรุปขนาด", [10, 12, 14, 14, 12, 12, 14, 12, 12, 11, 10, 26], meta);
  title(s1, meta, versionNo, "รายการสั่งเหล็กหน้างาน — สรุปตามขนาด");
  header(
    s1,
    ["ขนาด", "ชิ้นที่ตัด", "ยาวใช้จริง (ม.)", "น้ำหนักใช้จริง (กก.)", "ซื้อเส้นยาว (ม.)", "จำนวนเส้น", "น้ำหนักที่ซื้อ (กก.)", "เศษทิ้ง (ม.)", "เศษเก็บไว้ (ม.)", "เหลือรวม %", "เศษทิ้ง %", "ถ้าซื้ออีกความยาว"],
    2,
  );
  let sumNet = 0;
  let sumBuy = 0;
  for (const d of schedule.cutting.byDia) {
    const rec = d.plans.find((p) => p.stock === d.recommended) ?? d.plans[0];
    const alt = d.plans.find((p) => p.stock !== rec.stock);
    sumNet += rec.netKg;
    sumBuy += rec.purchaseKg;
    const row = s1.addRow([
      d.code,
      d.pieces,
      rec.netLength,
      rec.netKg,
      rec.stock,
      rec.bars,
      rec.purchaseKg,
      rec.scrap,
      rec.offcut,
      rec.leftoverPct / 100,
      rec.scrapPct / 100,
      alt ? `${alt.stock} ม. ${alt.bars} เส้น · ${alt.purchaseKg.toLocaleString("th-TH")} กก.` : "",
    ]);
    fmt(row, { 2: INT, 3: LEN, 4: KG, 5: INT, 6: INT, 7: KG, 8: LEN, 9: LEN, 10: "0.0%", 11: "0.0%" });
    row.getCell(1).font = { name: FONT, size: 10, bold: true };
  }
  totalRow(s1, ["รวม", null, null, Math.round(sumNet * 100) / 100, null, null, Math.round(sumBuy * 100) / 100], { 4: KG, 7: KG });
  s1.addRow([]);
  s1.addRow([
    `เศษตั้งแต่ ${OFFCUT_KEEP_MIN} ม. นับเป็น “เศษเก็บไว้” ใช้งานอื่นได้ · จัดตัดด้วยวิธีเรียงชิ้นยาวไปสั้นลงเส้นแรกที่ยังว่างพอ (FFD) · ไม่หักรอยตัด`,
  ]).getCell(1).font = { name: FONT, size: 9, color: { argb: MUTED } };

  // ---------- 2. รายชิ้นส่วน ----------
  const s2 = sheet(wb, "รายชิ้นส่วน", [14, 10, 10, 46, 9, 13, 11, 13, 13], meta);
  title(s2, meta, versionNo, "รายการสั่งเหล็กหน้างาน — รายชิ้นส่วน");
  header(s2, ["ชิ้นส่วน", "ชนิด", "จำนวนชิ้น", "รายการเหล็ก", "ขนาด", "ยาวต่อเส้น (ม.)", "จำนวนเส้น", "ยาวรวม (ม.)", "น้ำหนัก (กก.)"], 6);
  let grand = 0;
  for (const m of schedule.members) {
    groupRow(s2, `${m.label} · ${m.kindLabel} × ${m.count}`);
    let sub = 0;
    for (const r of m.rows) {
      sub += r.kg;
      const row = s2.addRow(["", "", "", r.label, rebarCode(r.dia), r.length, r.count, r.totalLength, r.kg]);
      fmt(row, { 6: LEN, 7: INT, 8: LEN, 9: KG });
    }
    grand += sub;
    totalRow(s2, ["", "", "", `รวม ${m.label}`, null, null, null, null, Math.round(sub * 100) / 100], { 9: KG });
  }
  s2.addRow([]);
  totalRow(s2, ["รวมทั้งโครงการ", null, null, null, null, null, null, null, Math.round(grand * 100) / 100], { 9: KG });

  cuttingPlanSheet(wb, meta, versionNo, schedule);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** เศษต่อเส้น: ไม่มี / ยาวพอเก็บไว้ใช้ / ทิ้ง */
function leftoverLabel(leftover: number): string {
  if (leftover === 0) return "—";
  return leftover >= OFFCUT_KEEP_MIN ? "เก็บไว้ใช้" : "ทิ้ง";
}

/** ชีต 3 แผนตัดให้ช่าง — ตัดตามแบบนี้แล้วเศษน้อยที่สุด */
function cuttingPlanSheet(wb: ExcelJS.Workbook, meta: WorkbookMeta, versionNo: number, schedule: RebarSchedule): void {
  const s3 = sheet(wb, "แผนตัด", [12, 60, 14, 16], meta);
  title(s3, meta, versionNo, "แผนตัดเหล็ก — ตัดตามแบบนี้แล้วเศษน้อยที่สุด");
  header(s3, ["จำนวนเส้น", "ตัดเป็น (ความยาว × จำนวนชิ้นต่อเส้น)", "เศษต่อเส้น (ม.)", "เศษ"], 3);
  for (const d of schedule.cutting.byDia) {
    const rec = d.plans.find((p) => p.stock === d.recommended) ?? d.plans[0];
    s3.addRow([]);
    groupRow(s3, `${d.code} · เส้นยาว ${rec.stock} ม. · ${rec.bars} เส้น · เหลือรวม ${rec.leftoverPct}% (ทิ้ง ${rec.scrapPct}%)`);
    for (const p of rec.patterns) {
      const cuts = p.cuts.map((c) => `${c.length.toFixed(3)} × ${c.count}`).join(" + ");
      const row = s3.addRow([p.bars, cuts, p.leftover, leftoverLabel(p.leftover)]);
      fmt(row, { 1: INT, 3: LEN });
    }
  }
}
