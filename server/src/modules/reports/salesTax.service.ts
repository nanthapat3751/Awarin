import type { SalesTaxReportDto, SalesTaxRowDto } from "@systemboq/shared-types";

import { loadCompanyProfile } from "../../lib/company-profile";
import { csvDate, toCsv } from "../../lib/csv";
import { buildSalesTaxWorkbook } from "../../lib/excel/sales-tax-workbook";
import { round2 } from "../../lib/pricing";
import { prisma } from "../../lib/prisma";
import { toIsoDate } from "../../lib/business-date";

/**
 * รายงานภาษีขายรายเดือน — ใบกำกับภาษีที่ออกในเดือนนั้น เรียงตามเลขที่
 *
 * อ่านจากแถว BillingDocument ที่ตรึงไว้ตอนออกใบเท่านั้น ไม่คำนวณ VAT ใหม่ ตัวเลขในรายงานจึงตรง
 * กับกระดาษที่อยู่ในมือลูกค้าเสมอ แม้ค่าตั้งหรือยอดในสัญญาจะเปลี่ยนไปแล้ว
 *
 * ใบที่ยกเลิกยังอยู่ในรายงานพร้อมป้ายว่ายกเลิก (เลขที่ต้องเรียงต่อกันไม่มีช่องโหว่เวลาถูกตรวจ)
 * แต่ **ไม่ถูกรวมในยอดรวม** เพราะไม่ใช่ยอดขายที่ต้องนำส่งภาษี
 */

export class SalesTaxReportError extends Error {
  status = 400;
}

/** "2026-09" → ช่วงวันที่ของเดือนนั้น (คอลัมน์ issuedOn เป็น DATE จึงเทียบแบบ UTC ล้วน) */
function monthRange(month: string): { from: Date; to: Date } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new SalesTaxReportError("รูปแบบเดือนต้องเป็น ปปปป-ดด");
  }
  const [year, mon] = month.split("-").map(Number);
  return {
    from: new Date(Date.UTC(year, mon - 1, 1)),
    // วันแรกของเดือนถัดไป — ใช้เป็นขอบบนแบบไม่รวม จึงไม่ต้องรู้ว่าเดือนนี้มีกี่วัน
    to: new Date(Date.UTC(mon === 12 ? year + 1 : year, mon === 12 ? 0 : mon, 1)),
  };
}

export async function getSalesTaxReport(month: string): Promise<SalesTaxReportDto> {
  const { from, to } = monthRange(month);
  const docs = await prisma.billingDocument.findMany({
    where: { isTaxInvoice: true, issuedOn: { gte: from, lt: to } },
    orderBy: [{ issuedOn: "asc" }, { docNo: "asc" }],
    select: {
      id: true,
      docNo: true,
      issuedOn: true,
      customerName: true,
      customerTaxId: true,
      customerBranch: true,
      projectNo: true,
      amount: true,
      vatAmount: true,
      retentionAmount: true,
      voidedAt: true,
      voidReason: true,
    },
  });

  const rows: SalesTaxRowDto[] = docs.map((doc) => {
    // เงินประกันที่ลูกค้ากันไว้ไม่ใช่การรับชำระ — มูลค่าตามใบกำกับภาษีคือส่วนที่รับจริง
    const total = round2(Number(doc.amount) - Number(doc.retentionAmount ?? 0));
    const vat = Number(doc.vatAmount ?? 0);
    return {
      id: doc.id,
      docNo: doc.docNo,
      issuedOn: toIsoDate(doc.issuedOn)!,
      customerName: doc.customerName,
      customerTaxId: doc.customerTaxId,
      customerBranch: doc.customerBranch,
      projectNo: doc.projectNo,
      base: round2(total - vat),
      vat,
      total,
      voidedAt: doc.voidedAt?.toISOString() ?? null,
      voidReason: doc.voidReason,
    };
  });

  const active = rows.filter((r) => r.voidedAt == null);
  return {
    month,
    rows,
    totals: {
      count: active.length,
      voidedCount: rows.length - active.length,
      base: round2(active.reduce((sum, r) => sum + r.base, 0)),
      vat: round2(active.reduce((sum, r) => sum + r.vat, 0)),
      total: round2(active.reduce((sum, r) => sum + r.total, 0)),
    },
  };
}

/** รายงานภาษีขายเป็น Excel ตามแบบฟอร์มสรรพากร (ปุ่มดาวน์โหลดในหน้ารายงาน) — CSV ยังมีไว้นำเข้าโปรแกรมบัญชี */
export async function buildSalesTaxXlsx(month: string): Promise<Buffer> {
  const [report, company] = await Promise.all([getSalesTaxReport(month), loadCompanyProfile()]);
  return buildSalesTaxWorkbook({ report, company, exportedAt: new Date() });
}

/** หมายเหตุของใบที่ยกเลิก — ใบปกติว่าง */
function voidNote(voidedAt: unknown, reason: string | null | undefined): string {
  if (!voidedAt) return "";
  return reason ? `ยกเลิก — ${reason}` : "ยกเลิก";
}

export async function buildSalesTaxCsv(month: string): Promise<string> {
  const report = await getSalesTaxReport(month);
  const rows = report.rows.map((r) => [
    r.docNo,
    csvDate(new Date(`${r.issuedOn}T00:00:00Z`)),
    r.customerName ?? "",
    r.customerTaxId ?? "",
    r.customerBranch ?? "",
    r.projectNo,
    r.base,
    r.vat,
    r.total,
    voidNote(r.voidedAt, r.voidReason),
  ]);
  // แถวรวมอยู่ท้ายไฟล์เหมือนรายงานภาษีขายที่ยื่นจริง — นับเฉพาะใบที่ไม่ถูกยกเลิก
  rows.push(["รวม", "", "", "", "", "", report.totals.base, report.totals.vat, report.totals.total, ""]);
  return toCsv(
    [
      "เลขที่ใบกำกับภาษี",
      "วันที่",
      "ชื่อผู้ซื้อ",
      "เลขประจำตัวผู้เสียภาษีผู้ซื้อ",
      "สาขา",
      "โครงการ",
      "มูลค่าสินค้า/บริการ",
      "ภาษีมูลค่าเพิ่ม",
      "รวมเป็นเงิน",
      "หมายเหตุ",
    ],
    rows,
  );
}
