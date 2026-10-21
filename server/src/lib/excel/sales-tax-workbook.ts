import ExcelJS from "exceljs";
import type { SalesTaxReportDto } from "@systemboq/shared-types";

// สไตล์ชุดเดียวกับ Excel อื่นของระบบ (boq-workbook.ts) — หัวตารางตัวหนา + เส้นเข้ม ไม่มีพื้นสีทึบ
const FONT = "Tahoma";
const INK = "FF1F2937";
const MUTED = "FF6B7280";
const RULE = "FFC8CCD8";
const MONEY = "#,##0.00";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** "2026-10-16" → "16/10/2569" (วัน เดือน ปี พ.ศ. แบบที่ใช้ในรายงานภาษี) */
function thaiDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y + 543}`;
}

/** เลขประจำตัวผู้เสียภาษี 13 หลัก → 1-2345-67890-12-3 · รูปแบบอื่นคงเดิม */
function taxIdText(id: string | null): string {
  const digits = (id ?? "").replace(/\D/g, "");
  if (digits.length !== 13) return id?.trim() || "";
  return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
}

/** คอลัมน์เงิน (7–9) ชิดขวา · ลำดับ (1) กลาง · ที่เหลือชิดซ้าย */
function headerAlign(col: number): "right" | "center" | "left" {
  if (col >= 7 && col <= 9) return "right";
  return col === 1 ? "center" : "left";
}

/** หมายเหตุท้ายแถว: ใบที่ยกเลิกบอกยอดเดิม+เหตุผล · ใบปกติบอกเลขโครงการ */
function rowNote(r: SalesTaxReportDto["rows"][number], voided: boolean): string {
  if (voided) {
    const reason = r.voidReason ? ` — ${r.voidReason}` : "";
    return `ยกเลิก (ยอดเดิม ${r.total.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท)${reason}`;
  }
  return r.projectNo ? `โครงการ ${r.projectNo}` : "";
}

export interface SalesTaxCompany {
  companyName: string;
  companyAddress: string;
  companyTaxId: string | null;
  /** "สำนักงานใหญ่" หรือ "สาขาที่ 00001" · null = ยังไม่ได้ตั้ง */
  companyBranch: string | null;
}

/**
 * รายงานภาษีขาย (Excel) ตามแบบที่ประกาศอธิบดีกรมสรรพากรกำหนด — แบบ A ที่ผู้ใช้เลือก 17 ต.ค.
 *
 * หัวรายงาน: เดือน/ปีภาษี · ชื่อผู้ประกอบการ · ชื่อสถานประกอบการ · เลขประจำตัวผู้เสียภาษี · สำนักงานใหญ่/สาขา
 * ตาราง: ลำดับ · วัน เดือน ปี · เลขที่ใบกำกับภาษี · ชื่อผู้ซื้อ · เลขผู้เสียภาษีผู้ซื้อ · สถานประกอบการผู้ซื้อ · มูลค่า · VAT · รวม
 *
 * ใบที่ยกเลิกยังต้องอยู่ในรายงาน (เลขที่ต้องเรียงต่อกันไม่มีช่องโหว่) — ลงมูลค่า 0 พร้อมหมายเหตุ "ยกเลิก"
 * ตามแนวทางที่ใช้กันทั่วไป ยอดรวมท้ายตารางจึงเท่ากับผลบวกคอลัมน์พอดี (ยอดเดิมของใบที่ยกเลิกอยู่ในหมายเหตุ)
 */
export async function buildSalesTaxWorkbook(input: {
  report: SalesTaxReportDto;
  company: SalesTaxCompany;
  exportedAt: Date;
}): Promise<Buffer> {
  const { report, company, exportedAt } = input;
  const [year, month] = report.month.split("-").map(Number);

  const wb = new ExcelJS.Workbook();
  wb.creator = company.companyName;
  wb.created = exportedAt;
  const ws = wb.addWorksheet("รายงานภาษีขาย", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { defaultRowHeight: 18 },
    headerFooter: { oddFooter: `&L&8รายงานภาษีขาย ${THAI_MONTHS[month - 1]} ${year + 543}&R&8หน้า &P / &N` },
  });
  const widths = [8, 13, 18, 34, 24, 21, 17, 16, 17, 30];
  ws.columns = widths.map((width) => ({ width, style: { font: { name: FONT, size: 10 } } }));
  const lastCol = widths.length;
  const font = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: 10, color: { argb: INK }, ...extra });

  // ---------- หัวรายงาน ----------
  const titleRow = ws.addRow(["รายงานภาษีขาย"]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, lastCol);
  titleRow.getCell(1).font = font({ size: 14, bold: true });
  titleRow.getCell(1).alignment = { horizontal: "center" };
  titleRow.height = 24;

  const periodRow = ws.addRow([`เดือนภาษี ${THAI_MONTHS[month - 1]}  ปี ${year + 543}`]);
  ws.mergeCells(periodRow.number, 1, periodRow.number, lastCol);
  periodRow.getCell(1).font = font({ bold: true });
  periodRow.getCell(1).alignment = { horizontal: "center" };
  ws.addRow([]);

  // ซ้าย: ชื่อ · ขวา: เลขผู้เสียภาษี / สำนักงานใหญ่-สาขา (แบบฟอร์มวางสองฝั่งเหมือนกัน)
  const headOffice = company.companyBranch == null || /สำนักงานใหญ่/.test(company.companyBranch);
  const branchNo = headOffice ? "" : (company.companyBranch ?? "").replace(/[^\d]/g, "");
  const pair = (left: string, right: string) => {
    const row = ws.addRow([left]);
    ws.mergeCells(row.number, 1, row.number, 6);
    row.getCell(7).value = right;
    ws.mergeCells(row.number, 7, row.number, lastCol);
    row.getCell(1).font = font();
    row.getCell(7).font = font();
    return row;
  };
  pair(`ชื่อผู้ประกอบการ  ${company.companyName}`, `เลขประจำตัวผู้เสียภาษีอากร  ${taxIdText(company.companyTaxId) || "—"}`);
  pair(
    `ชื่อสถานประกอบการ  ${company.companyName}`,
    `${headOffice ? "☑" : "☐"} สำนักงานใหญ่    ${headOffice ? "☐" : "☑"} สาขาที่ ${branchNo || "........"}`,
  );
  const addressRow = ws.addRow([`ที่อยู่  ${company.companyAddress}`]);
  ws.mergeCells(addressRow.number, 1, addressRow.number, lastCol);
  addressRow.getCell(1).font = font({ color: { argb: MUTED } });
  ws.addRow([]);

  // ---------- ตาราง ----------
  const header = ws.addRow([
    "ลำดับที่",
    "วัน เดือน ปี",
    "เลขที่ใบกำกับภาษี",
    "ชื่อผู้ซื้อสินค้า/ผู้รับบริการ",
    "เลขประจำตัวผู้เสียภาษี\nของผู้ซื้อ",
    "สถานประกอบการผู้ซื้อ\n(สนญ./สาขาที่)",
    "มูลค่าสินค้า\nหรือบริการ",
    "จำนวนเงิน\nภาษีมูลค่าเพิ่ม",
    "รวม",
    "หมายเหตุ",
  ]);
  header.height = 40;
  header.eachCell((cell, col) => {
    cell.font = font({ bold: true });
    cell.alignment = { vertical: "middle", horizontal: headerAlign(col), wrapText: true };
    cell.border = { top: { style: "thin", color: { argb: INK } }, bottom: { style: "medium", color: { argb: INK } } };
  });
  ws.views = [{ state: "frozen", ySplit: header.number }];
  ws.pageSetup.printTitlesRow = `${header.number}:${header.number}`;

  let base = 0;
  let vat = 0;
  let total = 0;
  report.rows.forEach((r, i) => {
    const voided = r.voidedAt != null;
    const values = voided ? [0, 0, 0] : [r.base, r.vat, r.total];
    if (!voided) {
      base += r.base;
      vat += r.vat;
      total += r.total;
    }
    const row = ws.addRow([
      i + 1,
      thaiDate(r.issuedOn),
      r.docNo,
      r.customerName ?? "",
      taxIdText(r.customerTaxId),
      r.customerBranch ?? "",
      ...values,
      rowNote(r, voided),
    ]);
    row.getCell(1).alignment = { horizontal: "center" };
    for (const c of [7, 8, 9]) {
      row.getCell(c).numFmt = MONEY;
      row.getCell(c).alignment = { horizontal: "right" };
    }
    row.getCell(10).font = font({ size: 9, color: { argb: voided ? "FFA32020" : MUTED } });
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: RULE } } };
    });
  });
  if (report.rows.length === 0) {
    const row = ws.addRow(["", "", "ไม่มีใบกำกับภาษีที่ออกในเดือนนี้"]);
    row.getCell(3).font = font({ color: { argb: MUTED } });
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const voidedNote = report.totals.voidedCount > 0 ? ` · ยกเลิก ${report.totals.voidedCount} ใบ` : "";
  const sum = ws.addRow(["", "", "", "รวมทั้งสิ้น", "", "", round2(base), round2(vat), round2(total), `${report.totals.count} ใบ${voidedNote}`]);
  sum.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.font = font({ bold: col <= 9 });
    cell.border = { top: { style: "thin", color: { argb: INK } }, bottom: { style: "double", color: { argb: INK } } };
    if (col >= 7 && col <= 9) {
      cell.numFmt = MONEY;
      cell.alignment = { horizontal: "right" };
    }
  });

  ws.addRow([]);
  const note = ws.addRow([
    `ส่งออกจากระบบเมื่อ ${exportedAt.getDate()} ${THAI_MONTHS[exportedAt.getMonth()]} ${exportedAt.getFullYear() + 543} · ตัวเลขจากใบกำกับภาษีที่ออกจริง (ตรึงไว้ตอนออกใบ) · ใช้ประกอบการยื่นแบบ ภ.พ.30`,
  ]);
  ws.mergeCells(note.number, 1, note.number, lastCol);
  note.getCell(1).font = font({ size: 9, color: { argb: MUTED } });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
