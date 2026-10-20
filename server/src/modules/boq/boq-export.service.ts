import type { ProjectVersion } from "@prisma/client";
import { takeoffRowValue } from "@systemboq/shared-types";

import { billingPartyOf, withholdingFor } from "../../lib/billing-party";
import { groupBoqItemsByTopCategory } from "../../lib/boq-grouping";
import { loadCompanyProfile } from "../../lib/company-profile";
import {
  buildCustomerBoqWorkbook,
  buildInternalBoqWorkbook,
  type TakeoffSheetBlock,
  type VersionPricing,
  type WorkbookMeta,
} from "../../lib/excel/boq-workbook";
import { customerLineMultiplier, round2 } from "../../lib/pricing";
import { prisma } from "../../lib/prisma";
import { buildRebarBbsWorkbook } from "../../lib/excel/rebar-bbs";
import { rebarSchedule } from "../../lib/rebar-cutting";
import { getTakeoffRules } from "../../lib/takeoff-rules";
import { buildCustomerQuotePdfGroups, customerBeforeDiscount } from "../myQuotes/myQuotes.service";
import { getQuoteOrThrow } from "../quotes/quotes.service";
import { BoqError, getLatestVersion } from "./boq.service";

/**
 * ส่งออก BOQ เป็น Excel — ดูรายละเอียดของไฟล์ที่ lib/excel/boq-workbook.ts
 *
 * ภายใน = เวอร์ชันล่าสุดของโครงการ (ที่กำลังทำงานอยู่) · ลูกค้า = เวอร์ชันที่ผูกกับใบเสนอราคาใบนั้น
 * (ตัวเลขต้องตรงกับใบที่ส่งไปแล้ว แม้โครงการจะแก้ BOQ ต่อเป็นเวอร์ชันใหม่ไปแล้วก็ตาม)
 */

export interface ExportedFile {
  buffer: Buffer;
  fileName: string;
}

async function loadProject(projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { customer: { include: { customerProfile: true } } },
  });
  if (!project) throw new BoqError("ไม่พบโครงการที่ระบุ", 404);
  return project;
}

async function metaOf(project: Awaited<ReturnType<typeof loadProject>>): Promise<WorkbookMeta> {
  const company = await loadCompanyProfile();
  // ชื่อผู้ว่าจ้างตามเอกสาร (ลูกค้านิติบุคคลใช้ชื่อบริษัท) — ชุดเดียวกับที่พิมพ์ในใบเสนอราคา
  const party = billingPartyOf(project.customer, project.customer?.customerProfile);
  return {
    companyName: company.companyName,
    projectNo: project.projectNo,
    projectName: project.name,
    customerName: party.name,
    siteAddress: project.siteAddress,
    exportedAt: new Date(),
  };
}

function pricingOf(version: ProjectVersion, isCustom: boolean): VersionPricing {
  return {
    versionNo: version.versionNo,
    isCustom,
    directCost: Number(version.directCost),
    contingencyPct: Number(version.contingencyPct),
    contingencyAmt: Number(version.contingencyAmt),
    overheadProfitPct: Number(version.overheadProfitPct),
    overheadProfitAmt: Number(version.overheadProfitAmt),
    discountPct: version.discountPct != null ? Number(version.discountPct) : null,
    discountAmt: Number(version.discountAmt),
    discountNote: version.discountNote,
    roundingUnit: version.roundingUnit,
    roundingAmt: Number(version.roundingAmt),
    vatPct: Number(version.vatPct),
    vatAmt: Number(version.vatAmt),
    netPrice: Number(version.netPrice),
  };
}

export async function exportInternalBoq(projectId: string): Promise<ExportedFile> {
  const project = await loadProject(projectId);
  const version = await getLatestVersion(projectId);
  const groups = await groupBoqItemsByTopCategory(version.id);
  const takeoffSheets = await takeoffBlocksOf(version.id, groups);

  const buffer = await buildInternalBoqWorkbook({
    meta: await metaOf(project),
    pricing: pricingOf(version, project.type === "CUSTOM"),
    groups: groups.map((g) => ({
      label: g.categoryLabel,
      name: g.categoryName,
      lines: g.items.map((i) => ({
        id: i.id,
        subgroup: i.subgroup ? { code: i.subgroup.code, name: i.subgroup.name } : null,
        code: i.categoryCode,
        name: i.name,
        quantity: Number(i.quantity),
        unit: i.unit,
        materialUnitPrice: Number(i.materialUnitPrice),
        laborUnitPrice: Number(i.laborUnitPrice),
        materialTotal: Number(i.materialTotal),
        laborTotal: Number(i.laborTotal),
        lineTotal: Number(i.lineTotal),
        note: i.note,
      })),
    })),
    takeoffSheets,
    source: { projectId: project.id, versionId: version.id, versionNo: version.versionNo },
  });
  return { buffer, fileName: `BOQ-${project.projectNo}-v${version.versionNo}-ภายใน.xlsx` };
}

/**
 * Excel รายการสั่งเหล็กหน้างาน (Phase 3 ข้อ 3d) — สรุปขนาด · รายชิ้นส่วน · แผนตัด ของเวอร์ชันล่าสุด
 * ไม่มีชิ้นส่วนจากตัวคิดเลย = ไม่มีอะไรให้ส่งออก (404 พร้อมบอกเหตุ)
 */
export async function exportRebarBbs(projectId: string): Promise<ExportedFile> {
  const project = await loadProject(projectId);
  const version = await getLatestVersion(projectId);
  const schedule = await rebarSchedule(version.id, await getTakeoffRules());
  if (schedule.cutting.byDia.length === 0) {
    throw new BoqError("ยังไม่มีชิ้นส่วนโครงสร้างจากตัวคิด — ไม่มีรายการเหล็กให้ส่งออก", 404);
  }
  const buffer = await buildRebarBbsWorkbook({ meta: await metaOf(project), versionNo: version.versionNo, schedule });
  return { buffer, fileName: `เหล็ก-${project.projectNo}-v${version.versionNo}.xlsx` };
}

/** ใบถอดแบบของบรรทัดที่ถอดจากแบบ เรียงตามลำดับเดียวกับชีต BOQ */
async function takeoffBlocksOf(
  versionId: string,
  groups: Awaited<ReturnType<typeof groupBoqItemsByTopCategory>>,
): Promise<TakeoffSheetBlock[]> {
  const sheetLines = groups.flatMap((g) => g.items).filter((i) => i.qtyBasis === "SHEET");
  if (sheetLines.length === 0) return [];
  const rows = await prisma.boqTakeoffRow.findMany({
    where: { boqItem: { projectVersionId: versionId }, boqItemId: { in: sheetLines.map((i) => i.id) } },
    orderBy: { sortOrder: "asc" },
  });
  const num = (v: unknown) => (v == null ? null : Number(v));
  return sheetLines.map((item) => ({
    code: item.categoryCode,
    name: item.name,
    unit: item.unit,
    wasteFactorPct: Number(item.wasteFactorPct ?? 0),
    quantity: Number(item.quantity),
    rows: rows
      .filter((r) => r.boqItemId === item.id)
      .map((r) => {
        const row = {
          label: r.label,
          count: Number(r.count),
          length: num(r.length),
          width: num(r.width),
          height: num(r.height),
          barDia: r.barDia,
          deduct: r.deduct,
        };
        const value = takeoffRowValue(row, item.unit);
        return { ...row, value: r.deduct ? -value : value };
      }),
  }));
}

export async function exportCustomerBoq(projectId: string, quoteId: string): Promise<ExportedFile> {
  const project = await loadProject(projectId);
  const quote = await getQuoteOrThrow(projectId, quoteId);
  const version = await prisma.projectVersion.findUniqueOrThrow({ where: { id: quote.projectVersionId } });
  // ราคาต่อบรรทัดจากตัวสร้างเดียวกับใบเสนอราคา PDF ของลูกค้า — ตัวเลขจึงตรงกันทุกบรรทัด
  const groups = await buildCustomerQuotePdfGroups(version.id, customerLineMultiplier(version));
  const party = billingPartyOf(project.customer, project.customer?.customerProfile);
  const beforeDiscount = customerBeforeDiscount(version);
  // เรียกแบบเดียวกับใบเสนอราคา PDF ของลูกค้าเป๊ะ ๆ — บรรทัดหัก ณ ที่จ่ายต้องตรงกันด้วย
  const withholding = withholdingFor(party, Number(version.netPrice), Number(version.vatAmt));

  const buffer = await buildCustomerBoqWorkbook({
    meta: await metaOf(project),
    quote: { quoteNo: quote.quoteNo, revisionNo: quote.revisionNo, date: quote.createdAt, validUntil: quote.validUntil },
    isCustom: project.type === "CUSTOM",
    groups: groups.map((g) => ({
      label: g.categoryLabel,
      name: g.categoryName,
      subtotal: g.subtotal,
      lines: g.items.map((i) => ({
        subgroup: i.subgroup ?? null,
        code: i.code,
        name: i.name,
        quantity: Number(i.quantity),
        unit: i.unit,
        unitPrice: Number(i.unitPrice),
        lineTotal: Number(i.lineTotal),
        note: i.note ?? null,
      })),
    })),
    totals: {
      beforeDiscount,
      discountPct: version.discountPct != null ? Number(version.discountPct) : null,
      discountAmt: Number(version.discountAmt),
      discountNote: version.discountNote,
      roundingAmt: Number(version.roundingAmt),
      subtotalBeforeVat: round2(beforeDiscount - Number(version.discountAmt) - Number(version.roundingAmt)),
      vatPct: Number(version.vatPct),
      vatAmt: Number(version.vatAmt),
      netPrice: Number(version.netPrice),
      withholding: withholding ? { pct: withholding.pct, tax: withholding.tax, netTransfer: withholding.netTransfer } : null,
    },
  });
  return { buffer, fileName: `${quote.quoteNo}-BOQ.xlsx` };
}
