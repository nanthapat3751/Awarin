import { billingPartyOf, withholdingFor } from "../../lib/billing-party";
import { writeAuditLog } from "../../lib/audit-log";
import { groupBoqItemsByTopCategory } from "../../lib/boq-grouping";
import { notifyStaff } from "../../lib/notifications";
import type { CustomerQuotePdfCategoryGroup } from "../../lib/pdf/customer-quote-pdf";
import { renderCustomerQuotePdf } from "../../lib/pdf/customer-quote-pdf";
import { round2 } from "../../lib/pricing";
import { applyQuoteOutcomeToProject } from "../../lib/project-auto-status";
import { prisma } from "../../lib/prisma";
import {
  assertValidQuoteTransition,
  InvalidQuoteTransitionError,
  type QuoteStatus,
} from "../../lib/quote-state-machine";
import { loadCompanyProfile } from "../../lib/company-profile";
import { toIsoDate } from "../../lib/business-date";
import { isQuoteExpired, termLines } from "../../lib/quote-terms";
import { toCustomerAttachmentDto } from "../attachments/attachments.service";
import type { RespondToQuoteInput } from "./myQuotes.schemas";

export class MyQuoteError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MyQuoteError";
    this.status = status;
  }
}

const ACTION_LABEL: Record<RespondToQuoteInput["action"], string> = {
  ACCEPT: "ยอมรับใบเสนอราคา",
  REJECT: "ปฏิเสธใบเสนอราคา",
  REQUEST_REVISION: "ขอปรับแก้รายละเอียด",
};

const ACTION_TO_STATUS: Record<RespondToQuoteInput["action"], QuoteStatus> = {
  ACCEPT: "ACCEPTED",
  REJECT: "REJECTED",
  REQUEST_REVISION: "REVISED",
};

// BR-09: ลูกค้าเห็นแค่รายการงานและยอดรวมสุดท้ายเท่านั้น — ไม่เห็นราคาต่อบรรทัด รายละเอียด
// ต้นทุน หรือ margin (overheadProfitPct/Amt, directCost เก็บไว้ภายใน)
function toCustomerQuoteSummary(quote: {
  id: string;
  quoteNo: string;
  revisionNo: number;
  status: string;
  sentAt: Date | null;
  respondedAt: Date | null;
  createdAt: Date;
  customerNote: string | null;
  validUntil: Date | null;
  project: { projectNo: string; name: string };
}) {
  return {
    id: quote.id,
    quoteNo: quote.quoteNo,
    revisionNo: quote.revisionNo,
    status: quote.status,
    sentAt: quote.sentAt,
    respondedAt: quote.respondedAt,
    createdAt: quote.createdAt,
    customerNote: quote.customerNote,
    validUntil: toIsoDate(quote.validUntil),
    // ตัดสินที่เซิร์ฟเวอร์ ไม่ใช่นาฬิกาเครื่องลูกค้า — ตัวเดียวกับที่ใช้กันปุ่มยอมรับใน respondToQuote
    // มีความหมายเฉพาะใบที่ยังรอคำตอบ ใบที่ตอบไปแล้วไม่ถือว่า "หมดอายุ"
    expired: quote.status === "SENT" && isQuoteExpired(quote.validUntil),
  };
}

export async function listMyQuotes(customerId: string) {
  const quotes = await prisma.quote.findMany({
    // ถังขยะ: ไม่แสดงใบเสนอราคาของโครงการที่ถูกลบ (deletedAt: null)
    where: { project: { customerId, deletedAt: null }, status: { not: "DRAFT" } },
    include: { project: { select: { projectNo: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return quotes.map(toCustomerQuoteSummary);
}

async function getOwnedQuoteOrThrow(customerId: string, quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      project: { select: { customerId: true, projectNo: true, name: true, type: true, deletedAt: true } },
    },
  });
  // ถังขยะ: โครงการที่ถูกลบ → ถือว่าไม่พบใบเสนอราคา
  if (
    quote?.project.customerId !== customerId ||
    quote.project.deletedAt !== null ||
    quote.status === "DRAFT"
  ) {
    throw new MyQuoteError("ไม่พบใบเสนอราคาที่ระบุ", 404);
  }
  return quote;
}

/**
 * ช่วงเวลาที่ถือว่าเป็น "การเปิดครั้งเดียวกัน" -- กดรีเฟรช เปิด PDF ต่อจากหน้ารายละเอียด หรือ
 * React StrictMode ที่ยิงซ้ำตอน dev ต้องนับเป็นครั้งเดียว ไม่งั้นเลข "เปิดกี่ครั้ง" จะเฟ้อจนไร้ความหมาย
 */
const VIEW_SESSION_GAP_MS = 30 * 60_000;

/** เงียบไปกี่วันแล้วกลับมาเปิดใหม่ ถึงจะน่าบอกพนักงาน — ต่ำกว่านี้คือการอ่านต่อเนื่องปกติ */
const RETURN_AFTER_QUIET_DAYS = 5;
/** เปิดครบกี่ครั้งถึงจะถือว่ากำลังตัดสินใจจริง (แจ้งครั้งเดียวตอนแตะพอดี) */
const ACTIVE_INTEREST_VIEWS = 3;

/** การกระทำของลูกค้าที่บันทึกแยกชนิด -- ทำให้ไทม์ไลน์เล่าได้ว่า "เปิดหน้า → เปิด PDF → ตอบรับ" */
export type QuoteEventAction =
  | "CUSTOMER_OPEN_QUOTE"
  | "CUSTOMER_OPEN_QUOTE_PDF"
  | "CUSTOMER_DOWNLOAD_ATTACHMENT";

/**
 * บันทึกว่าลูกค้าแตะใบเสนอราคา -- เรียกจากช่องทางของลูกค้าเท่านั้น พนักงานเปิดดูไม่นับ
 * เพราะคำถามที่ต้องตอบคือ "ลูกค้าเปิดหรือยัง" ไม่ใช่ "ใบนี้ถูกเปิดกี่ครั้ง"
 *
 * เก็บสองชั้นโดยตั้งใจ:
 *   1. **คอลัมน์บน Quote** (firstViewedAt/lastViewedAt/viewCount) = คำตอบสั้น ๆ ที่ตารางต้องใช้
 *      พร้อมกันทั้งหน้า และอยู่ถาวรไม่ถูกล้างตามอายุ AuditLog
 *   2. **แถวใน AuditLog แยกชนิดการกระทำ** = เรื่องราวระดับนาทีสำหรับไทม์ไลน์ในแฟ้มลูกค้า
 *
 * ไทม์ไลน์ของ *โครงการ* ยังเห็นแค่ครั้งแรก (กรองด้วย details.firstView ใน activity.service)
 * เพราะการเปิดอ่านซ้ำ ๆ จะกลบหมุดหมายของดีล -- เก็บละเอียดแต่แสดงหยาบตามบริบท
 *
 * เป็นผลข้างเคียงแบบ best-effort: ถ้าเขียนไม่สำเร็จต้องไม่ทำให้ลูกค้าเปิดใบเสนอราคาไม่ได้
 * (ตัวเรียกครอบ try/catch ไว้) การนับใช้ updateMany แบบมีเงื่อนไขแทนอ่านมาแล้วค่อยเขียน เพื่อให้
 * คำขอสองอันที่มาพร้อมกันไม่แจ้งเตือนซ้ำและไม่นับซ้ำ -- Postgres จะประเมินเงื่อนไขใหม่หลังปลดล็อกแถว
 */
async function recordQuoteView(
  customerId: string,
  quote: { id: string; quoteNo: string; projectId: string; project: { name: string } },
  event?: { action: QuoteEventAction; details?: Record<string, unknown> },
): Promise<void> {
  // ไม่ระบุชนิดมา = เปิดหน้าใบเสนอราคา
  const action: QuoteEventAction = event?.action ?? "CUSTOMER_OPEN_QUOTE";
  const eventDetails = event?.details;
  const now = new Date();
  const sessionCutoff = new Date(now.getTime() - VIEW_SESSION_GAP_MS);

  // อ่านค่าก่อนหน้าไว้ตัดสินใจว่าจะแจ้งเตือนแบบไหน (ต้องอ่านก่อนอัปเดต ไม่งั้นได้ค่าใหม่)
  const previous = await prisma.quote.findUnique({
    where: { id: quote.id },
    select: { lastViewedAt: true, viewCount: true },
  });

  // จองสิทธิ์ "ผู้เปิดคนแรก" -- มีคำขอเดียวเท่านั้นที่ได้ count = 1 จึงแจ้งเตือนได้ครั้งเดียว
  const claimedFirst = await prisma.quote.updateMany({
    where: { id: quote.id, firstViewedAt: null },
    data: { firstViewedAt: now },
  });
  const isFirstView = claimedFirst.count === 1;

  // นับเป็นครั้งใหม่เมื่อเว้นช่วงจากครั้งก่อนพอสมควร -- ต้องเซ็ต lastViewedAt ในคำสั่งเดียวกัน
  // ไม่งั้นคำขอที่มาพร้อมกันจะผ่านเงื่อนไขทั้งคู่แล้วนับซ้ำ
  const counted = await prisma.quote.updateMany({
    where: {
      id: quote.id,
      OR: [{ lastViewedAt: null }, { lastViewedAt: { lt: sessionCutoff } }],
    },
    data: { viewCount: { increment: 1 }, lastViewedAt: now },
  });
  const isNewSession = counted.count === 1;
  if (!isNewSession) {
    await prisma.quote.update({ where: { id: quote.id }, data: { lastViewedAt: now } });
  }

  // ยุบการกระทำ "ชนิดเดียวกันกับสิ่งเดียวกันในรอบเดียวกัน" ให้เหลือแถวเดียว -- กดรีเฟรช เปิดสองแท็บ
  // หรือ React StrictMode ที่ยิงซ้ำตอน dev ต้องไม่กลายเป็นสิบบรรทัด แต่คนละชนิด (เปิดหน้า vs
  // เปิด PDF) หรือคนละไฟล์แนบ ต้องขึ้นแยกกัน เพราะนั่นคือเรื่องราวที่ต้องเล่า
  //
  // ผูกกับ "รอบการเข้าชม" (isNewSession) ไม่ใช่เวลาของแถวบันทึกเอง เพราะรอบใหม่ต้องได้บรรทัดใหม่
  // เสมอ และเพราะแถวใน AuditLog แก้ไม่ได้ (role ของแอปไม่มีสิทธิ์ UPDATE -- append-only)
  const attachmentId = eventDetails?.attachmentId;
  const recent = isNewSession
    ? null
    : await prisma.auditLog.findFirst({
        where: {
          userId: customerId,
          action,
          entityType: "Quote",
          entityId: quote.id,
          createdAt: { gte: sessionCutoff },
          ...(typeof attachmentId === "string"
            ? { details: { path: ["attachmentId"], equals: attachmentId } }
            : {}),
        },
        select: { id: true },
      });

  if (!recent) {
    await writeAuditLog({
      userId: customerId,
      action,
      entityType: "Quote",
      entityId: quote.id,
      details: {
        quoteNo: quote.quoteNo,
        ...eventDetails,
        // ไทม์ไลน์ของโครงการหยิบเฉพาะแถวที่มีธงนี้ ที่เหลืออยู่ในแฟ้มลูกค้าอย่างเดียว
        ...(isFirstView ? { firstView: true } : {}),
      },
    });
  }

  // แจ้งเตือนเฉพาะจังหวะที่มีความหมายทางการขาย ไม่ใช่ทุกครั้งที่ลูกค้าเปิด
  //
  // ผูกกับ counted.count === 1 (การจองสิทธิ์ "ครั้งใหม่" ที่เป็น atomic) จึงแจ้งซ้ำไม่ได้แม้คำขอ
  // จะมาพร้อมกันหลายอัน และแจ้งเฉพาะตอนแตะเกณฑ์พอดี ไม่ใช่ทุกครั้งหลังจากนั้น
  const link = `/projects/${quote.projectId}`;
  const label = `ใบเสนอราคา ${quote.quoteNo} ของโครงการ "${quote.project.name}"`;

  if (isFirstView) {
    await notifyStaff(`ลูกค้าเปิดดู${label} แล้ว`, link);
    return;
  }
  if (!isNewSession) return;

  const quietDays = previous?.lastViewedAt
    ? Math.floor((now.getTime() - previous.lastViewedAt.getTime()) / 86_400_000)
    : 0;

  if (quietDays >= RETURN_AFTER_QUIET_DAYS) {
    await notifyStaff(
      `ลูกค้ากลับมาเปิดดู${label} อีกครั้ง หลังเงียบไป ${quietDays} วัน`,
      link,
    );
    return;
  }

  if ((previous?.viewCount ?? 0) + 1 === ACTIVE_INTEREST_VIEWS) {
    await notifyStaff(
      `ลูกค้าเปิดดู${label} ครบ ${ACTIVE_INTEREST_VIEWS} ครั้งแล้ว — น่าจะกำลังตัดสินใจ`,
      link,
    );
  }
}

export async function getMyQuote(customerId: string, quoteId: string) {
  const quote = await getOwnedQuoteOrThrow(customerId, quoteId);
  await recordQuoteView(customerId, quote).catch(() => undefined);

  const version = await prisma.projectVersion.findUniqueOrThrow({
    where: { id: quote.projectVersionId },
  });
  // จัดกลุ่มตามหมวดงานแบบเดียวกับใน PDF เพื่อให้ใบเสนอราคาที่ยาว ๆ อ่านเป็นไม่กี่ส่วนแทนที่จะ
  // เป็นรายการแบนยาวรายการเดียว รหัสงานเป็นเลขอ้างอิงเอกสาร ไม่ใช่ข้อมูลต้นทุน — แสดงได้ตาม
  // BR-09 และช่วยให้บรรทัดตรงกับ PDF ที่ลูกค้าได้รับ
  const grouped = await groupBoqItemsByTopCategory(quote.projectVersionId);
  const markup = 1 + Number(version.overheadProfitPct) / 100;

  const groups = grouped.map((group) => {
    // ราคาต่อบรรทัดคำนวณแบบเดียวกับ buildCustomerQuotePdfGroups เป๊ะ ๆ เพื่อให้ตัวเลขบนหน้าเว็บ
    // กับใน PDF ที่ลูกค้าโหลดไปตรงกันทุกบรรทัด (ต้นทุน+ค่าแรง คูณ markup แล้วปัดทีเดียว)
    const items = group.items.map((item) => {
      const unitPrice = round2(
        (Number(item.materialUnitPrice) + Number(item.laborUnitPrice)) * markup,
      );
      const lineTotal = round2(Number(item.quantity) * unitPrice);
      return {
        id: item.id,
        code: item.categoryCode,
        name: item.name,
        quantity: item.quantity.toString(),
        unit: item.unit,
        unitPrice: unitPrice.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
        note: item.note,
      };
    });

    return {
      code: group.categoryLabel,
      name: group.categoryName,
      subtotal: round2(items.reduce((sum, item) => sum + Number(item.lineTotal), 0)).toFixed(2),
      items,
    };
  });

  // ไฟล์ที่พนักงานเปิดให้ลูกค้าเห็นเท่านั้น (ป้าย CUSTOMER) — ไฟล์ INTERNAL ไม่ถูกดึงมา
  const attachments = await prisma.quoteAttachment.findMany({
    where: { quoteId, visibility: "CUSTOMER" },
    orderBy: { createdAt: "asc" },
  });

  return {
    ...toCustomerQuoteSummary(quote),
    netPrice: version.netPrice,
    vatPct: version.vatPct,
    vatAmt: version.vatAmt,
    discountPct: version.discountPct != null ? version.discountPct.toString() : null,
    discountAmt: version.discountAmt.toString(),
    discountNote: version.discountNote,
    groups,
    isCustom: quote.project.type === "CUSTOM",
    attachments: attachments.map(toCustomerAttachmentDto),
    terms: termLines(quote.terms),
  };
}

/**
 * ลูกค้าเปิด/โหลดไฟล์แนบของใบเสนอราคา (BOQ จริง แบบก่อสร้าง ฯลฯ) ก็นับว่าเปิดดูใบนั้น
 *
 * ไม่งั้น "เปิดล่าสุด" จะค้างอยู่ที่วันที่เปิดหน้ารายละเอียด ทั้งที่ลูกค้าเพิ่งกลับมาเปิดไฟล์ BOQ
 * วันนี้ — ซึ่งเป็นสัญญาณว่ากำลังพิจารณาอยู่ ชัดกว่าการเปิดหน้าเว็บเสียอีก
 *
 * สิทธิ์ถูกตรวจใน getCustomerAttachmentFile อยู่แล้ว ที่นี่จึงตรวจแค่ว่าใบนี้เป็นของลูกค้าคนนี้จริง
 * (คนอื่นยิงเข้ามาจะ throw ตั้งแต่ getOwnedQuoteOrThrow และไม่มีอะไรถูกนับ)
 */
export async function recordQuoteAttachmentView(
  customerId: string,
  quoteId: string,
  file: { attachmentId: string; fileName: string },
): Promise<void> {
  const quote = await getOwnedQuoteOrThrow(customerId, quoteId);
  await recordQuoteView(customerId, quote, {
    action: "CUSTOMER_DOWNLOAD_ATTACHMENT",
    details: { attachmentId: file.attachmentId, fileName: file.fileName },
  });
}

export async function respondToQuote(
  customerId: string,
  quoteId: string,
  input: RespondToQuoteInput,
) {
  const quote = await getOwnedQuoteOrThrow(customerId, quoteId);
  const toStatus = ACTION_TO_STATUS[input.action];

  // พ้นกำหนดยืนราคาแล้ว ราคาในใบอาจไม่ใช่ราคาที่บริษัทยังรับได้ (วัสดุขึ้นราคา) — กดยอมรับเองไม่ได้
  // ต้องให้พนักงานยืนยัน (ขยายวัน หรือออกฉบับใหม่) · ขอปรับแก้/ปฏิเสธยังทำได้ตามปกติ
  if (input.action === "ACCEPT" && quote.status === "SENT" && isQuoteExpired(quote.validUntil)) {
    throw new MyQuoteError(
      "ใบเสนอราคานี้พ้นกำหนดยืนราคาแล้ว — กด “ขอปรับแก้รายละเอียด” เพื่อให้ทีมงานยืนยันราคาอีกครั้ง",
      409,
    );
  }

  try {
    assertValidQuoteTransition(quote.status as QuoteStatus, toStatus);
  } catch (err) {
    if (err instanceof InvalidQuoteTransitionError) {
      throw new MyQuoteError("ไม่สามารถตอบรับใบเสนอราคานี้ได้ในสถานะปัจจุบัน", 409);
    }
    throw err;
  }

  const updated = await prisma.quote.update({
    where: { id: quoteId },
    data: { status: toStatus, respondedAt: new Date(), customerNote: input.note ?? null },
  });

  await writeAuditLog({
    userId: customerId,
    action: "CUSTOMER_RESPOND_QUOTE",
    entityType: "Quote",
    entityId: quoteId,
    details: { from: quote.status, to: toStatus, note: input.note },
  });

  // คำตอบของลูกค้าดันสถานะโปรเจกต์ตามไปด้วย -- ยอมรับ → อนุมัติแล้ว, ปฏิเสธ → ลูกค้าปฏิเสธ
  // พนักงานจึงไม่ต้องคอยจำว่าต้องไปกดเปลี่ยนสถานะเองอีกที (ดู project-auto-status.ts)
  if (toStatus === "ACCEPTED" || toStatus === "REJECTED") {
    await applyQuoteOutcomeToProject(quote.projectId, toStatus, customerId);
  }

  const noteSuffix = input.note ? `: "${input.note}"` : "";
  await notifyStaff(
    `ลูกค้า${ACTION_LABEL[input.action]}สำหรับโครงการ "${quote.project.name}"${noteSuffix}`,
    `/projects/${quote.projectId}`,
  );

  return toCustomerQuoteSummary({ ...updated, project: quote.project });
}

// BR-09: สร้างแถวรายการฝั่งลูกค้าโดยพับอัตราค่าดำเนินการ/กำไรเข้าไปในราคาต่อหน่วยแต่ละบรรทัด
// เรียบร้อยแล้ว เพื่อให้เอกสารไม่ต้องเปิดเผยต้นทุนหรือ margin เป็นตัวเลขแยก — ดู customer-quote-pdf.ts
async function buildCustomerQuotePdfGroups(
  projectVersionId: string,
  overheadProfitPct: number,
): Promise<CustomerQuotePdfCategoryGroup[]> {
  const groups = await groupBoqItemsByTopCategory(projectVersionId);
  const markup = 1 + overheadProfitPct / 100;

  return groups.map((group) => {
    const items = group.items.map((item) => {
      const costUnitPrice = Number(item.materialUnitPrice) + Number(item.laborUnitPrice);
      const unitPrice = round2(costUnitPrice * markup);
      const lineTotal = round2(Number(item.quantity) * unitPrice);
      return {
        code: item.categoryCode,
        name: item.name,
        quantity: item.quantity.toString(),
        unit: item.unit,
        unitPrice: unitPrice.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
        note: item.note,
      };
    });

    return {
      categoryLabel: group.categoryLabel,
      categoryName: group.categoryName,
      items,
      subtotal: round2(items.reduce((sum, item) => sum + Number(item.lineTotal), 0)),
    };
  });
}

export async function generateMyQuotePdf(customerId: string, quoteId: string): Promise<Uint8Array> {
  const quote = await getOwnedQuoteOrThrow(customerId, quoteId);
  // เปิด PDF ก็คือเปิดดูใบเสนอราคา -- ลูกค้าบางคนกดจากอีเมล/ลิงก์ตรงโดยไม่ผ่านหน้ารายละเอียด
  await recordQuoteView(customerId, quote, { action: "CUSTOMER_OPEN_QUOTE_PDF" }).catch(
    () => undefined,
  );
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: quote.projectId },
    include: { customer: { include: { customerProfile: true } } },
  });
  const version = await prisma.projectVersion.findUniqueOrThrow({
    where: { id: quote.projectVersionId },
  });
  const groups = await buildCustomerQuotePdfGroups(version.id, Number(version.overheadProfitPct));
  const company = await loadCompanyProfile();
  const party = billingPartyOf(project.customer, project.customer?.customerProfile);

  return renderCustomerQuotePdf({
    companyName: company.companyName,
    companyAddress: company.companyAddress,
    companyTaxId: company.companyTaxId,
    companyPhone: company.companyPhone,
    companyEmail: company.companyEmail,
    logo: company.logo,
    logoSmall: company.logoSmall,
    signatory: company.signatory,
    // ใบนี้คือใบที่ลูกค้าได้รับจริง — ตกลงราคาแล้วต้องรู้ว่าจะโอนไปที่ไหน
    paymentAccount: company.paymentAccount,
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
    // ยอดก่อนลด = ต้นทุน+กำไร ซึ่งเท่ากับผลบวกราคาทุกบรรทัดที่ลูกค้าเห็น (BR-09 พับ markup ไว้ในบรรทัดแล้ว)
    // ยอดหลังลดคือฐาน VAT จริงที่เก็บไว้ในเวอร์ชัน — ไม่คิดซ้ำที่นี่เพื่อไม่ให้เพี้ยนจากยอดในระบบ
    beforeDiscount: round2(Number(version.directCost) + Number(version.overheadProfitAmt)),
    discountPct: version.discountPct != null ? Number(version.discountPct) : null,
    discountAmt: Number(version.discountAmt),
    discountNote: version.discountNote,
    subtotalBeforeVat: round2(
      Number(version.directCost) + Number(version.overheadProfitAmt) - Number(version.discountAmt),
    ),
    vatPct: Number(version.vatPct),
    vatAmt: Number(version.vatAmt),
    netPrice: Number(version.netPrice),
    withholding: withholdingFor(party, Number(version.netPrice), Number(version.vatAmt)),
  });
}
