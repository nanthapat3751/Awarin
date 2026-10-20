import fs from "node:fs";
import path from "node:path";

import { inlineViewableType, type AttachmentKind, type AttachmentVisibility } from "@systemboq/shared-types";

import { writeAuditLog } from "../../lib/audit-log";
import { createNotification } from "../../lib/notifications";
import { prisma } from "../../lib/prisma";
import { isApprovalLocked } from "../../lib/quote-approval";

// ไฟล์แนบเก็บใน dir แยกที่ "ไม่" ถูกเสิร์ฟแบบ static สาธารณะ (ต่างจาก uploads/ ของรูปภาพ) —
// ทางเดียวที่จะได้ไฟล์คือผ่าน route ที่ตรวจสิทธิ์ ป้องกันไฟล์ราคา/สัญญาหลุดผ่านลิงก์ตรง
// ตั้งที่อื่นได้ด้วย PRIVATE_UPLOADS_DIR — เทสต์ใช้โฟลเดอร์ชั่วคราว (เคยทิ้ง PDF ทดสอบไว้ในโฟลเดอร์จริง 388 ไฟล์)
export const ATTACHMENTS_DIR = path.resolve(process.cwd(), process.env.PRIVATE_UPLOADS_DIR || "private-uploads");
fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

export class AttachmentError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AttachmentError";
    this.status = status;
  }
}

// อนุญาต PDF, Excel และรูปภาพ (แบบก่อสร้างบางทีส่งมาเป็นรูป) — Excel MIME เจ้าปัญหา บางเครื่อง
// ส่งมาเป็น octet-stream จึงเช็คนามสกุลไฟล์เป็น fallback ด้วย
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_EXT = new Set([".pdf", ".xlsx", ".xls", ".jpg", ".jpeg", ".png", ".webp"]);

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB ต่อไฟล์ (BOQ/แบบจริงมักใหญ่กว่ารูป)
// เพดานต่อใบเสนอราคา — กันบัญชีพนักงาน (หรือบัญชีที่ถูกยึด) อัปไฟล์ถมดิสก์
export const MAX_ATTACHMENTS_PER_QUOTE = 20;
export const MAX_TOTAL_BYTES_PER_QUOTE = 100 * 1024 * 1024; // 100 MB รวมทุกไฟล์ต่อใบเสนอราคา
const MAX_FILENAME_LEN = 255; // กันชื่อไฟล์ยาวผิดปกติทำให้แถวใน DB บวม

export function isAllowedAttachment(mimeType: string, originalName: string): boolean {
  const ext = path.extname(originalName).toLowerCase();
  return ALLOWED_MIME.has(mimeType) || ALLOWED_EXT.has(ext);
}

const KINDS = new Set<string>(["DESIGN", "QUOTE", "OTHER"] satisfies AttachmentKind[]);
const VISIBILITIES = new Set<string>(["INTERNAL", "CUSTOMER"] satisfies AttachmentVisibility[]);

export function parseKind(value: unknown): AttachmentKind {
  return KINDS.has(value as string) ? (value as AttachmentKind) : "OTHER";
}

export function parseVisibility(value: unknown): AttachmentVisibility {
  // ปลอดภัยไว้ก่อน: ถ้าค่าไม่ถูกต้อง ให้เป็น INTERNAL (ไม่หลุดถึงลูกค้าโดยไม่ตั้งใจ)
  return VISIBILITIES.has(value as string)
    ? (value as AttachmentVisibility)
    : "INTERNAL";
}

/**
 * อ่านค่าสำหรับ PATCH — **ไม่ส่งมา = ไม่แตะช่องนั้น**
 *
 * ต่างจาก parseKind/parseVisibility ที่เติมค่าปริยายให้เสมอ (ใช้กับฟอร์มอัปโหลดที่ส่งมาครบทุกช่อง) —
 * เอาตัวนั้นมาใช้กับ PATCH ทำให้หน้าเว็บที่ส่งมาแต่ visibility ไปรีเซ็ตชนิดไฟล์เป็น OTHER ทุกครั้ง
 * ค่าที่ส่งมาแต่ผิดรูปแบบจะตอบ 400 ไม่เดาให้ — การเดาเงียบ ๆ ทำให้ไฟล์เปลี่ยนสถานะโดยไม่มีใครสั่ง
 */
export function parseKindPatch(value: unknown): AttachmentKind | undefined {
  if (value === undefined) return undefined;
  if (!KINDS.has(value as string)) throw new AttachmentError("ชนิดไฟล์แนบไม่ถูกต้อง", 400);
  return value as AttachmentKind;
}

export function parseVisibilityPatch(value: unknown): AttachmentVisibility | undefined {
  if (value === undefined) return undefined;
  if (!VISIBILITIES.has(value as string)) throw new AttachmentError("สิทธิ์การมองเห็นไม่ถูกต้อง", 400);
  return value as AttachmentVisibility;
}

type AttachmentRow = {
  id: string;
  quoteId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  visibility: AttachmentVisibility;
  createdAt: Date;
};

export function toAttachmentDto(a: AttachmentRow) {
  return {
    id: a.id,
    quoteId: a.quoteId,
    fileName: a.fileName,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    kind: a.kind,
    visibility: a.visibility,
    createdAt: a.createdAt.toISOString(),
  };
}

export function toCustomerAttachmentDto(a: AttachmentRow) {
  return {
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    kind: a.kind,
    createdAt: a.createdAt.toISOString(),
  };
}

async function loadQuoteOrThrow(projectId: string, quoteId: string) {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (quote?.projectId !== projectId) {
    throw new AttachmentError("ไม่พบใบเสนอราคาที่ระบุ", 404);
  }
  return quote;
}

/**
 * ใบที่ขอ/ได้อนุมัติแล้ว (ยังไม่ส่ง) ห้ามแก้ไฟล์ที่ลูกค้าจะเห็น — ของที่ผู้อนุมัติเซ็นรับรองต้องเป็นของที่
 * ถึงมือลูกค้าจริง · ไฟล์ภายใน (INTERNAL) แก้ได้ตามปกติ ลูกค้าไม่เห็นอยู่แล้ว
 */
async function assertCustomerFilesEditable(quoteId: string, touchesCustomer: boolean): Promise<void> {
  if (!touchesCustomer) return;
  const quote = await prisma.quote.findUniqueOrThrow({
    where: { id: quoteId },
    select: { status: true, _count: { select: { signers: true } } },
  });
  if (isApprovalLocked(quote.status, quote._count.signers)) {
    throw new AttachmentError(
      "ใบนี้ขออนุมัติแล้ว แก้ไฟล์ที่ลูกค้าเห็นไม่ได้ — ถอนคำขออนุมัติก่อน แล้วค่อยแก้",
      409,
    );
  }
}

async function loadAttachmentOrThrow(projectId: string, quoteId: string, attachmentId: string) {
  const quote = await loadQuoteOrThrow(projectId, quoteId);
  const attachment = await prisma.quoteAttachment.findUnique({ where: { id: attachmentId } });
  if (attachment?.quoteId !== quoteId) {
    throw new AttachmentError("ไม่พบไฟล์แนบที่ระบุ", 404);
  }
  return { attachment, quote };
}

export async function listAttachmentsForQuotes(quoteIds: string[]) {
  if (quoteIds.length === 0) return new Map<string, AttachmentRow[]>();
  const rows = await prisma.quoteAttachment.findMany({
    where: { quoteId: { in: quoteIds } },
    orderBy: { createdAt: "asc" },
  });
  const byQuote = new Map<string, AttachmentRow[]>();
  for (const row of rows) {
    const list = byQuote.get(row.quoteId) ?? [];
    list.push(row);
    byQuote.set(row.quoteId, list);
  }
  return byQuote;
}

// ลบไฟล์บนดิสก์ของไฟล์แนบทั้งหมดในใบเสนอราคา (ใช้ตอนลบใบเสนอราคาฉบับร่างทิ้ง) — แถวใน DB
// ถูกลบเองผ่าน cascade ของ Quote อยู่แล้ว ที่นี่จัดการเฉพาะไฟล์จริง
export async function deleteAttachmentFilesForQuote(quoteId: string) {
  const rows = await prisma.quoteAttachment.findMany({
    where: { quoteId },
    select: { storedName: true },
  });
  for (const row of rows) {
    try {
      fs.unlinkSync(path.join(ATTACHMENTS_DIR, row.storedName));
    } catch {
      /* ไฟล์อาจถูกลบไปแล้ว */
    }
  }
}

/**
 * แจ้งลูกค้าว่ามีเอกสารใหม่ให้เปิดดู — ใช้ร่วมกันทั้งตอนแนบไฟล์ใหม่และตอนพลิกไฟล์เดิมเป็น "ให้ลูกค้าเห็น"
 * (ฝั่งลูกค้ามันคือเอกสารที่เพิ่งโผล่มาเหมือนกัน จึงใช้ข้อความเดียวกัน ความต่างของสองทางเป็นเรื่องภายในของเรา)
 *
 * เงียบเมื่อลูกค้าเปิดลิงก์ไม่ได้ — ใบที่ยังเป็นร่าง และโครงการที่อยู่ในถังขยะ ทั้งสองกรณี
 * /api/my/quotes/:id ตอบ 404 การแจ้งจึงพาไปหน้าที่เปิดไม่ได้ (ไฟล์ที่แนบไว้ตอนร่างจะถึงมือลูกค้าตอนกดส่งใบเสนอราคาอยู่ดี)
 */
async function notifyCustomerOfVisibleFile(
  quote: { id: string; projectId: string; status: string },
  fileName: string,
): Promise<void> {
  if (quote.status === "DRAFT") return;
  const project = await prisma.project.findUnique({
    where: { id: quote.projectId },
    select: { customerId: true, name: true, deletedAt: true },
  });
  if (!project?.customerId || project.deletedAt !== null) return;
  await createNotification({
    userId: project.customerId,
    message: `ทีมงานแนบเอกสาร "${fileName}" ในใบเสนอราคาของโครงการ "${project.name}"`,
    link: `/my/quotes/${quote.id}`,
  });
}

export async function createAttachment(input: {
  projectId: string;
  quoteId: string;
  file: { originalname: string; filename: string; mimetype: string; size: number };
  kind: AttachmentKind;
  visibility: AttachmentVisibility;
  uploadedById: string;
}) {
  const quote = await loadQuoteOrThrow(input.projectId, input.quoteId);
  await assertCustomerFilesEditable(input.quoteId, input.visibility === "CUSTOMER");

  // เพดานต่อใบเสนอราคา (ตรวจ ณ ตอนแนบ — ไฟล์ที่เขียนลงดิสก์ไปแล้วจะถูก route ลบทิ้งถ้า throw ที่นี่)
  const existing = await prisma.quoteAttachment.findMany({
    where: { quoteId: input.quoteId },
    select: { sizeBytes: true },
  });
  if (existing.length >= MAX_ATTACHMENTS_PER_QUOTE) {
    throw new AttachmentError(
      `แนบไฟล์ได้ไม่เกิน ${MAX_ATTACHMENTS_PER_QUOTE} ไฟล์ต่อใบเสนอราคา`,
      409,
    );
  }
  const totalBytes = existing.reduce((sum, a) => sum + a.sizeBytes, 0) + input.file.size;
  if (totalBytes > MAX_TOTAL_BYTES_PER_QUOTE) {
    throw new AttachmentError("ไฟล์แนบรวมของใบเสนอราคานี้เกินขนาดที่กำหนด (100 MB)", 409);
  }

  const attachment = await prisma.quoteAttachment.create({
    data: {
      quoteId: input.quoteId,
      // multer ตั้งชื่อไฟล์ต้นฉบับมาเป็น latin1 -- แปลงกลับเป็น utf8 เพื่อให้ชื่อภาษาไทยไม่เพี้ยน
      // แล้วตัดความยาวกันชื่อยาวผิดปกติ
      fileName: Buffer.from(input.file.originalname, "latin1").toString("utf8").slice(0, MAX_FILENAME_LEN),
      storedName: input.file.filename,
      mimeType: input.file.mimetype,
      sizeBytes: input.file.size,
      kind: input.kind,
      visibility: input.visibility,
      uploadedById: input.uploadedById,
    },
  });

  await writeAuditLog({
    userId: input.uploadedById,
    action: "ADD_QUOTE_ATTACHMENT",
    entityType: "QuoteAttachment",
    entityId: attachment.id,
    details: {
      quoteId: input.quoteId,
      fileName: attachment.fileName,
      kind: attachment.kind,
      visibility: attachment.visibility,
    },
  });

  // แนบไฟล์ที่ลูกค้าเห็นได้ = มีของใหม่ให้เขาเปิดดู ต้องบอก (ไฟล์ INTERNAL ไม่ต้อง ลูกค้าไม่มีสิทธิ์เห็น)
  if (attachment.visibility === "CUSTOMER") {
    await notifyCustomerOfVisibleFile(quote, attachment.fileName);
  }

  return toAttachmentDto(attachment);
}

export async function updateAttachment(
  projectId: string,
  quoteId: string,
  attachmentId: string,
  patch: { kind?: AttachmentKind; visibility?: AttachmentVisibility },
  actorId: string,
) {
  const { attachment: current, quote } = await loadAttachmentOrThrow(projectId, quoteId, attachmentId);
  await assertCustomerFilesEditable(
    quoteId,
    current.visibility === "CUSTOMER" || patch.visibility === "CUSTOMER",
  );
  // undefined = ไม่แตะช่องนั้น (prisma ข้ามค่า undefined ให้เอง) — route จึงต้องไม่เติมค่าปริยายมาให้
  const updated = await prisma.quoteAttachment.update({
    where: { id: attachmentId },
    data: { kind: patch.kind, visibility: patch.visibility },
  });

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_QUOTE_ATTACHMENT",
    entityType: "QuoteAttachment",
    entityId: attachmentId,
    details: { quoteId, kind: updated.kind, visibility: updated.visibility },
  });

  // เปิดไฟล์เดิมให้ลูกค้าเห็น = ลูกค้าได้เอกสารเพิ่มจริง ต้องบอกเหมือนตอนแนบไฟล์ใหม่
  // เทียบค่าก่อน/หลังจริง ไม่ใช่ดูแค่ค่าที่ส่งมา — กดแก้อย่างอื่นบนไฟล์ที่เป็น CUSTOMER อยู่แล้วต้องไม่แจ้งซ้ำ
  // พลิกกลับเป็น INTERNAL ไม่แจ้ง — ไฟล์แค่หายไปจากหน้าลูกค้า การประกาศว่าเอาเอกสารคืนสร้างคำถามมากกว่าคำตอบ (AuditLog บันทึกไว้แล้ว)
  if (current.visibility !== "CUSTOMER" && updated.visibility === "CUSTOMER") {
    await notifyCustomerOfVisibleFile(quote, updated.fileName);
  }

  return toAttachmentDto(updated);
}

export async function deleteAttachment(
  projectId: string,
  quoteId: string,
  attachmentId: string,
  actorId: string,
) {
  const { attachment } = await loadAttachmentOrThrow(projectId, quoteId, attachmentId);
  await assertCustomerFilesEditable(quoteId, attachment.visibility === "CUSTOMER");
  await prisma.quoteAttachment.delete({ where: { id: attachmentId } });

  // ลบไฟล์จริงบนดิสก์ด้วย (best-effort — ถ้าไฟล์หายไปแล้วก็ไม่ต้องขวางการลบ record)
  try {
    fs.unlinkSync(path.join(ATTACHMENTS_DIR, attachment.storedName));
  } catch {
    /* ไฟล์อาจถูกลบไปแล้ว */
  }

  await writeAuditLog({
    userId: actorId,
    action: "DELETE_QUOTE_ATTACHMENT",
    entityType: "QuoteAttachment",
    entityId: attachmentId,
    details: { quoteId, fileName: attachment.fileName },
  });
}

type ResolvedFile = { absPath: string; fileName: string; mimeType: string };

/**
 * header สำหรับส่งไฟล์แนบออกไป — `attachment` = บันทึกลงเครื่อง, `inline` = เปิดดูในเบราว์เซอร์
 *
 * ตอนเปิดดู **ไม่ใช้ mimeType ที่เก็บใน DB** แต่หาใหม่จากนามสกุลไฟล์ผ่านรายการที่อนุญาต เพราะ
 * mimeType มาจากเครื่องคนอัปโหลด และ isAllowedAttachment ปล่อยผ่านด้วยนามสกุลอย่างเดียวได้ —
 * ถ้าเชื่อค่านั้นแล้วเสิร์ฟ inline ตามที่บอกมา คนที่อัปไฟล์ .png พร้อมประกาศตัวว่าเป็น text/html
 * จะได้สคริปต์ทำงานบนโดเมนของ API ไปเลย รายการที่อนุญาตมีแค่ PDF กับรูป จึงไม่มีทางกลายเป็น
 * เอกสาร HTML (helmet ใส่ X-Content-Type-Options: nosniff ให้อยู่แล้ว เบราว์เซอร์จึงไม่เดาชนิดเอง)
 */
export function attachmentHeaders(
  file: ResolvedFile,
  disposition: "attachment" | "inline",
): Record<string, string> {
  const encoded = encodeURIComponent(file.fileName);
  if (disposition === "inline") {
    const viewableType = inlineViewableType(file.fileName);
    if (!viewableType) {
      throw new AttachmentError("ไฟล์ชนิดนี้เปิดดูในเบราว์เซอร์ไม่ได้ กรุณาดาวน์โหลดแทน", 415);
    }
    return {
      "Content-Type": viewableType,
      "Content-Disposition": `inline; filename*=UTF-8''${encoded}`,
    };
  }
  return {
    "Content-Type": file.mimeType,
    "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
  };
}

function resolveFile(storedName: string, fileName: string, mimeType: string): ResolvedFile {
  const absPath = path.join(ATTACHMENTS_DIR, storedName);
  if (!fs.existsSync(absPath)) {
    throw new AttachmentError("ไฟล์แนบหายไปจากระบบ", 404);
  }
  return { absPath, fileName, mimeType };
}

/** พนักงาน (OWNER/ADMIN) โหลดไฟล์แนบใดก็ได้ของโปรเจกต์ */
export async function getStaffAttachmentFile(
  projectId: string,
  quoteId: string,
  attachmentId: string,
): Promise<ResolvedFile> {
  const { attachment: a } = await loadAttachmentOrThrow(projectId, quoteId, attachmentId);
  return resolveFile(a.storedName, a.fileName, a.mimeType);
}

/**
 * ลูกค้าโหลดได้เฉพาะไฟล์ของใบเสนอราคาในโปรเจกต์ของตัวเอง และเฉพาะไฟล์ป้าย CUSTOMER เท่านั้น —
 * ด่านสุดท้ายที่กันไฟล์ INTERNAL (ที่โชว์กำไร) ไม่ให้หลุดถึงลูกค้าเด็ดขาด
 */
export async function getCustomerAttachmentFile(
  customerId: string,
  quoteId: string,
  attachmentId: string,
): Promise<ResolvedFile> {
  const attachment = await prisma.quoteAttachment.findUnique({
    where: { id: attachmentId },
    include: { quote: { include: { project: { select: { customerId: true } } } } },
  });
  if (
    attachment?.quoteId !== quoteId ||
    attachment.quote.status === "DRAFT" ||
    attachment.quote.project.customerId !== customerId ||
    attachment.visibility !== "CUSTOMER"
  ) {
    throw new AttachmentError("ไม่พบไฟล์แนบที่ระบุ", 404);
  }
  return resolveFile(attachment.storedName, attachment.fileName, attachment.mimeType);
}
