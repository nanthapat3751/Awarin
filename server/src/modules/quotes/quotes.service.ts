import { billingPartyOf, withholdingFor } from "../../lib/billing-party";
import { writeAuditLog } from "../../lib/audit-log";
import { groupBoqItemsByTopCategory } from "../../lib/boq-grouping";
import { nextDocumentSequence } from "../../lib/document-sequence";
import { createNotification } from "../../lib/notifications";
import type { QuotePdfCategoryGroup } from "../../lib/pdf/quote-pdf";
import { renderQuotePdf } from "../../lib/pdf/quote-pdf";
import {
  assertValidProjectTransition,
  InvalidTransitionError,
} from "../../lib/project-state-machine";
import { applyQuoteOutcomeToProject } from "../../lib/project-auto-status";
import { prisma } from "../../lib/prisma";
import { loadQuotePdfSigners } from "../../lib/quote-signers";
import { approvalOf } from "../../lib/quote-approval";
import {
  assertValidQuoteTransition,
  InvalidQuoteTransitionError,
  type QuoteStatus,
} from "../../lib/quote-state-machine";
import { generateQuoteNo } from "../../lib/quote-number";
import { loadCompanyProfile } from "../../lib/company-profile";
import { parseIsoDate, todayIso, toIsoDate } from "../../lib/business-date";
import {
  MAX_QUOTE_VALIDITY_DAYS,
  addDaysIso,
  quoteTermsFrom,
  quoteValidityDaysFrom,
  termLines,
  validUntilFrom,
} from "../../lib/quote-terms";
import { getSettingsMap } from "../../lib/settings";
import {
  deleteAttachmentFilesForQuote,
  listAttachmentsForQuotes,
  toAttachmentDto,
} from "../attachments/attachments.service";
import { syncLeadStatusForProject } from "../leads/leads.service";

export class QuoteError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "QuoteError";
    this.status = status;
  }
}

export async function listQuotes(projectId: string) {
  const quotes = await prisma.quote.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: { signers: true },
  });
  const byQuote = await listAttachmentsForQuotes(quotes.map((q) => q.id));
  return quotes.map(({ signers, ...q }) => ({
    ...q,
    // คอลัมน์ DATE — ส่งเป็น YYYY-MM-DD ไม่ใช่ ISO เต็ม ไม่งั้นหน้าจอแปลงตามเขตเวลาแล้ววันเลื่อน
    validUntil: toIsoDate(q.validUntil),
    attachments: (byQuote.get(q.id) ?? []).map(toAttachmentDto),
    // ส่งแค่สรุป (ใคร/เมื่อไร/มีลายเซ็นไหม) — รูปลายเซ็นจริงอยู่ใน PDF เท่านั้น
    approval: approvalOf(signers),
  }));
}

export async function getQuoteOrThrow(projectId: string, quoteId: string) {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (quote?.projectId !== projectId) {
    throw new QuoteError("ไม่พบใบเสนอราคาที่ระบุ", 404);
  }
  return quote;
}

export async function getQuote(projectId: string, quoteId: string) {
  return getQuoteOrThrow(projectId, quoteId);
}

async function createQuoteWithUniqueNo(projectId: string, projectVersionId: string) {
  const quoteNo = await generateQuoteNo(prisma);
  // เรียงลำดับต่อโปรเจกต์ (1, 2, 3, ...) — แยกจาก sequence รายปีระดับ global ของ quoteNo —
  // เพื่อให้พนักงาน/ลูกค้าแยกออกได้ทันทีว่า "นี่คือฉบับที่เท่าไหร่"
  const revisionNo = await nextDocumentSequence(prisma, `quote-rev:${projectId}`);
  return prisma.quote.create({
    data: { projectId, projectVersionId, quoteNo, revisionNo, status: "DRAFT" },
  });
}

export async function createQuote(projectId: string, actorId: string) {
  // ถังขยะ: ออกใบเสนอราคาให้โครงการที่ถูกลบไม่ได้
  const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!project) {
    throw new QuoteError("ไม่พบโครงการที่ระบุ", 404);
  }

  const version = await prisma.projectVersion.findFirst({
    where: { projectId },
    orderBy: { versionNo: "desc" },
  });
  if (!version) {
    throw new QuoteError("ไม่พบเวอร์ชันโครงการ", 404);
  }

  if (project.type === "CUSTOM") {
    // โครงการกำหนดเองไม่มี BOQ ในระบบ — ต้องตั้งราคาสุทธิเองก่อน (netPrice > 0) จึงจะออกใบเสนอราคาได้
    if (Number(version.netPrice) <= 0) {
      throw new QuoteError("กรุณากรอกราคาของโครงการกำหนดเองก่อนออกใบเสนอราคา", 409);
    }
  } else {
    const itemCount = await prisma.boqItem.count({ where: { projectVersionId: version.id } });
    if (itemCount === 0) {
      throw new QuoteError("ต้องมีรายการ BOQ อย่างน้อย 1 รายการก่อนออกใบเสนอราคา", 409);
    }
  }

  const quote = await createQuoteWithUniqueNo(projectId, version.id);

  await writeAuditLog({
    userId: actorId,
    action: "CREATE_QUOTE",
    entityType: "Quote",
    entityId: quote.id,
    details: { projectId, quoteNo: quote.quoteNo },
  });

  return quote;
}

/**
 * ลบใบเสนอราคา "ฉบับร่าง" ทิ้ง — สำหรับกรณีเผลอกดสร้าง จำกัดเฉพาะสถานะ DRAFT (ยังไม่ส่ง) เพื่อ
 * รักษาประวัติ: ใบเสนอราคาที่เคยส่งถึงลูกค้าแล้วห้ามลบถาวร (เหมือนหลักการที่โปรเจกต์/เอกสารอื่น
 * ในระบบทำได้แค่เปลี่ยนสถานะ ไม่ลบ) ไฟล์แนบของฉบับร่างจะถูกลบตามไปด้วย
 */
export async function deleteQuote(projectId: string, quoteId: string, actorId: string) {
  const quote = await getQuoteOrThrow(projectId, quoteId);
  if (quote.status !== "DRAFT") {
    throw new QuoteError("ลบได้เฉพาะใบเสนอราคาที่ยังเป็นฉบับร่าง (ยังไม่ส่ง)", 409);
  }

  await deleteAttachmentFilesForQuote(quoteId);
  await prisma.quote.delete({ where: { id: quoteId } });

  await writeAuditLog({
    userId: actorId,
    action: "DELETE_QUOTE",
    entityType: "Quote",
    entityId: quoteId,
    details: { projectId, quoteNo: quote.quoteNo },
  });
}

function assertQuoteTransitionAllowed(from: QuoteStatus, to: QuoteStatus): void {
  try {
    assertValidQuoteTransition(from, to);
  } catch (err) {
    if (err instanceof InvalidQuoteTransitionError) {
      throw new QuoteError(err.message, 409);
    }
    throw err;
  }
}

/**
 * โครงการกำหนดเอง (CUSTOM) ไม่มี PDF ที่ระบบสร้างให้ ต้องแนบไฟล์ที่ "ให้ลูกค้าเห็น" อย่างน้อย
 * 1 ไฟล์ก่อนส่ง ไม่งั้นลูกค้าจะเปิดใบเสนอราคาแล้วเจอหน้าเปล่า
 */
export async function assertCustomQuoteHasCustomerFile(projectId: string, quoteId: string): Promise<void> {
  const proj = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (proj.type !== "CUSTOM") return;
  const customerFileCount = await prisma.quoteAttachment.count({
    where: { quoteId, visibility: "CUSTOMER" },
  });
  if (customerFileCount === 0) {
    throw new QuoteError(
      "โครงการกำหนดเองต้องแนบไฟล์ใบเสนอราคาที่ตั้งเป็น “ให้ลูกค้าเห็น” อย่างน้อย 1 ไฟล์ก่อนส่ง",
      409,
    );
  }
}

/**
 * ตรึงยืนราคา + เงื่อนไขจากหน้าตั้งค่าลงใบ ณ วันที่ส่ง — แก้หน้าตั้งค่าทีหลังต้องไม่ย้อนมาเปลี่ยน
 * เงื่อนไขของใบที่อยู่ในมือลูกค้าแล้ว (ใบเสนอราคาส่งได้ครั้งเดียว: DRAFT → SENT)
 */
async function frozenQuoteTerms(): Promise<{ validUntil: Date | null; terms: string | null }> {
  const settings = await getSettingsMap();
  return {
    validUntil: validUntilFrom(quoteValidityDaysFrom(settings)),
    terms: quoteTermsFrom(settings),
  };
}

// การส่งใบเสนอราคาจะดันโปรเจกต์ให้ไปเป็น QUOTED ด้วย -- ทั้งใบแรกของโปรเจกต์ที่ยังเป็นร่าง
// และใบฉบับใหม่ที่ออกให้หลังลูกค้าปฏิเสธฉบับก่อน (ดีลกลับมาเดินต่อ ไม่ควรค้างที่ "ลูกค้าปฏิเสธ")
async function afterQuoteSent(
  projectId: string,
  quoteId: string,
  updated: { revisionNo: number; quoteNo: string },
  actorId: string,
): Promise<void> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.status === "DRAFT" || project.status === "REJECTED") {
    const from = project.status;
    try {
      assertValidProjectTransition(from, "QUOTED");
      await prisma.project.update({ where: { id: projectId }, data: { status: "QUOTED" } });
      await writeAuditLog({
        userId: actorId,
        action: "TRANSITION_PROJECT",
        entityType: "Project",
        entityId: projectId,
        details: { from, to: "QUOTED", reason: "quote sent" },
      });
    } catch (err) {
      if (!(err instanceof InvalidTransitionError)) {
        throw err;
      }
    }
  }

  await syncLeadStatusForProject(projectId, "QUOTED");

  if (project.customerId) {
    // ฉบับแก้ไขต้องบอกให้ชัด — เดิมใช้ข้อความเดียวกับฉบับแรก ลูกค้าที่เคยขอปรับแก้จึงแยกไม่ออก
    // ว่าอันนี้คือของใหม่ที่แก้ให้แล้ว หรือใบเดิมถูกส่งซ้ำ
    const isRevision = updated.revisionNo > 1;
    await createNotification({
      userId: project.customerId,
      message: isRevision
        ? `ใบเสนอราคาฉบับแก้ไข (ฉบับที่ ${updated.revisionNo}) สำหรับโครงการ "${project.name}" พร้อมให้ตรวจสอบแล้ว (${updated.quoteNo})`
        : `มีใบเสนอราคาใหม่สำหรับโครงการ "${project.name}" (${updated.quoteNo})`,
      link: `/my/quotes/${quoteId}`,
    });
  }
}

/** ส่งถึงลูกค้าได้ต่อเมื่อ OWNER อนุมัติแล้ว — ของที่ลูกค้าเห็นต้องผ่านตาผู้อนุมัติก่อนเสมอ */
async function assertQuoteApproved(quoteId: string): Promise<void> {
  const approver = await prisma.quoteSigner.findUnique({
    where: { quoteId_role: { quoteId, role: "APPROVER" } },
    select: { id: true },
  });
  if (!approver) {
    throw new QuoteError("ใบเสนอราคานี้ยังไม่ได้รับอนุมัติ — ขออนุมัติจากเจ้าของก่อนส่งให้ลูกค้า", 409);
  }
}

export async function transitionQuote(
  projectId: string,
  quoteId: string,
  toStatus: QuoteStatus,
  actorId: string,
) {
  const quote = await getQuoteOrThrow(projectId, quoteId);
  assertQuoteTransitionAllowed(quote.status as QuoteStatus, toStatus);
  if (toStatus === "SENT") {
    await assertCustomQuoteHasCustomerFile(projectId, quoteId);
    await assertQuoteApproved(quoteId);
  }

  const now = new Date();
  const respondedStatuses: QuoteStatus[] = ["ACCEPTED", "REJECTED", "REVISED"];
  const frozenTerms = toStatus === "SENT" ? await frozenQuoteTerms() : undefined;

  const updated = await prisma.quote.update({
    where: { id: quoteId },
    data: {
      status: toStatus,
      sentAt: toStatus === "SENT" ? now : undefined,
      respondedAt: respondedStatuses.includes(toStatus) ? now : undefined,
      ...frozenTerms,
    },
  });

  if (toStatus === "SENT") await afterQuoteSent(projectId, quoteId, updated, actorId);

  // พนักงานบันทึกคำตอบของลูกค้าเอง (โทรคุยกันแล้วมากรอกทีหลัง) ต้องดันสถานะโปรเจกต์เหมือนกับ
  // ตอนลูกค้ากดเองในพอร์ทัล -- เดิมทางนี้ไม่ขยับสถานะเลย ทั้งที่การ์ด "ขั้นตอนถัดไป" เขียนไว้ว่า
  // บันทึกการตอบกลับเองได้
  if (toStatus === "ACCEPTED" || toStatus === "REJECTED") {
    await applyQuoteOutcomeToProject(projectId, toStatus, actorId);
  }

  await writeAuditLog({
    userId: actorId,
    action: "TRANSITION_QUOTE",
    entityType: "Quote",
    entityId: quoteId,
    details: { from: quote.status, to: toStatus },
  });

  return updated;
}

/**
 * ขยาย (หรือยกเลิก) กำหนดยืนราคาของใบที่ส่งไปแล้ว
 *
 * ใบที่พ้นกำหนดแล้วลูกค้ากดยอมรับเองไม่ได้ — ถ้าบริษัทยังยืนราคาเดิมได้ พนักงานขยายวันให้
 * ลูกค้ากดยอมรับต่อได้เลย ไม่ต้องออกฉบับใหม่ทั้งใบ · null = ไม่กำหนดวันหมดอายุ
 */
export async function setQuoteValidity(
  projectId: string,
  quoteId: string,
  validUntil: string | null,
  actorId: string,
) {
  const quote = await getQuoteOrThrow(projectId, quoteId);
  // ใบที่ลูกค้าตอบไปแล้ว วันยืนราคาไม่มีผลอะไรอีก — แก้ไปก็เป็นแค่ตัวเลขหลอกในประวัติ
  if (quote.status !== "SENT") {
    throw new QuoteError("แก้กำหนดยืนราคาได้เฉพาะใบที่ส่งแล้วและลูกค้ายังไม่ตอบ", 409);
  }

  let date: Date | null = null;
  if (validUntil != null) {
    date = parseIsoDate(validUntil);
    if (!date) {
      throw new QuoteError("วันที่ไม่ถูกต้อง", 400);
    }
    // ขยายให้เป็นวันที่ผ่านมาแล้ว = ใบหมดอายุทันที ไม่ใช่สิ่งที่ใครตั้งใจทำ
    if (validUntil < todayIso()) {
      throw new QuoteError("วันยืนราคาต้องไม่ก่อนวันนี้", 400);
    }
    if (validUntil > addDaysIso(todayIso(), MAX_QUOTE_VALIDITY_DAYS)) {
      throw new QuoteError(`ยืนราคาได้ไม่เกิน ${MAX_QUOTE_VALIDITY_DAYS} วันนับจากวันนี้`, 400);
    }
  }

  const updated = await prisma.quote.update({
    where: { id: quoteId },
    data: { validUntil: date },
  });

  await writeAuditLog({
    userId: actorId,
    action: "SET_QUOTE_VALIDITY",
    entityType: "Quote",
    entityId: quoteId,
    details: {
      projectId,
      quoteNo: quote.quoteNo,
      from: toIsoDate(quote.validUntil),
      to: validUntil,
    },
  });

  // ลูกค้าที่เคยเห็นว่า "พ้นกำหนด" ต้องรู้ว่ากลับมากดยอมรับได้แล้ว
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.customerId) {
    await createNotification({
      userId: project.customerId,
      message: validUntil
        ? `ใบเสนอราคา ${quote.quoteNo} ของโครงการ "${project.name}" ยืนราคาถึงวันที่ ${formatThaiDate(validUntil)}`
        : `ใบเสนอราคา ${quote.quoteNo} ของโครงการ "${project.name}" ไม่มีกำหนดหมดอายุแล้ว`,
      link: `/my/quotes/${quoteId}`,
    });
  }

  return { ...updated, validUntil: toIsoDate(updated.validUntil) };
}

/** "2026-10-18" → "18/10/2026" — รูปแบบเดียวกับวันที่บนใบเสนอราคา PDF */
function formatThaiDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
}

async function buildQuotePdfGroups(projectVersionId: string): Promise<QuotePdfCategoryGroup[]> {
  const groups = await groupBoqItemsByTopCategory(projectVersionId);

  return groups.map((group) => ({
    categoryLabel: group.categoryLabel,
    categoryName: group.categoryName,
    items: group.items.map((item) => ({
      code: item.categoryCode,
      name: item.name,
      quantity: item.quantity.toString(),
      unit: item.unit,
      materialUnitPrice: item.materialUnitPrice.toString(),
      materialTotal: item.materialTotal.toString(),
      laborUnitPrice: item.laborUnitPrice.toString(),
      laborTotal: item.laborTotal.toString(),
      lineTotal: item.lineTotal.toString(),
      note: item.note,
    })),
    subtotal: group.items.reduce((sum, item) => sum + Number(item.lineTotal), 0),
  }));
}

export async function generateQuotePdf(projectId: string, quoteId: string): Promise<Uint8Array> {
  const quote = await getQuoteOrThrow(projectId, quoteId);
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { customer: { include: { customerProfile: true } } },
  });
  const version = await prisma.projectVersion.findUniqueOrThrow({
    where: { id: quote.projectVersionId },
  });
  const groups = await buildQuotePdfGroups(version.id);
  const company = await loadCompanyProfile();

  // ชื่อ/เลขภาษีของ "คู่สัญญา" ไม่ใช่ของคนที่สมัครเว็บ — ลูกค้านิติบุคคลต้องออกเอกสารในนามบริษัท
  const party = billingPartyOf(project.customer, project.customer?.customerProfile);

  return renderQuotePdf({
    companyName: company.companyName,
    companyAddress: company.companyAddress,
    companyTaxId: company.companyTaxId,
    companyPhone: company.companyPhone,
    companyEmail: company.companyEmail,
    logo: company.logo,
    logoSmall: company.logoSmall,
    signatory: company.signatory,
    signers: await loadQuotePdfSigners(quote.id),
    quoteNo: quote.quoteNo,
    revisionNo: quote.revisionNo,
    projectNo: project.projectNo,
    projectName: project.name,
    customerName: party.name,
    customerAddress: party.address,
    customerIsCompany: party.isCompany,
    customerTaxId: party.taxId,
    customerBranch: party.branch,
    customerContactPerson: party.contactPerson,
    siteAddress: project.siteAddress,
    date: quote.createdAt,
    validUntil: quote.validUntil,
    terms: termLines(quote.terms),
    groups,
    directCost: Number(version.directCost),
    contingencyPct: Number(version.contingencyPct),
    contingencyAmt: Number(version.contingencyAmt),
    overheadProfitPct: Number(version.overheadProfitPct),
    overheadProfitAmt: Number(version.overheadProfitAmt),
    discountPct: version.discountPct != null ? Number(version.discountPct) : null,
    discountAmt: Number(version.discountAmt),
    discountNote: version.discountNote,
    roundingAmt: Number(version.roundingAmt),
    vatPct: Number(version.vatPct),
    vatAmt: Number(version.vatAmt),
    netPrice: Number(version.netPrice),
    withholding: withholdingFor(party, Number(version.netPrice), Number(version.vatAmt)),
  });
}
