import type { Role } from "@systemboq/shared-types";

import { writeAuditLog } from "../../lib/audit-log";
import { createNotification } from "../../lib/notifications";
import { prisma } from "../../lib/prisma";
import { getLatestVersion } from "../boq/boq.service";
import { assertCustomQuoteHasCustomerFile, getQuoteOrThrow, QuoteError } from "./quotes.service";

/**
 * ขั้นอนุมัติก่อนส่งใบเสนอราคา (ผู้เสนอราคา + ผู้อนุมัติ)
 *
 *   ร่าง ──ขออนุมัติ──▶ รออนุมัติ ──OWNER อนุมัติ──▶ อนุมัติแล้ว ──ส่ง──▶ SENT
 *                          │  ▲                          │
 *            ถอนคำขอ/ส่งกลับ └──┴──────── ถอน/ยกเลิกอนุมัติ ─┘   (กลับเป็นร่าง ใช้เวอร์ชันล่าสุด)
 *
 * - อนุมัติได้เฉพาะ OWNER · OWNER ทำใบเองกด "อนุมัติ" ทีเดียวได้ทั้งสองช่อง (ADMIN อนุมัติตัวเองไม่ได้)
 * - ชื่อ/ตำแหน่ง/เบอร์/ลายเซ็น "ตรึง" ลงใบ ณ วินาทีที่เซ็น (QuoteSigner) — แก้โปรไฟล์ทีหลังไม่ย้อนมาเปลี่ยน
 * - ลายเซ็นมาจากบัญชีของคนที่กดเท่านั้น ไม่มีทางวางลายเซ็นของคนอื่น
 */

interface Actor {
  id: string;
  role: Role;
}

const quoteLink = (projectId: string) => `/projects/${projectId}?tab=quotes`;

async function loadDraftForApproval(projectId: string, quoteId: string) {
  const quote = await getQuoteOrThrow(projectId, quoteId);
  if (quote.status !== "DRAFT") {
    throw new QuoteError("ใบเสนอราคานี้ส่งให้ลูกค้าไปแล้ว", 409);
  }
  const signers = await prisma.quoteSigner.findMany({ where: { quoteId } });
  return {
    quote,
    proposer: signers.find((s) => s.role === "PROPOSER") ?? null,
    approver: signers.find((s) => s.role === "APPROVER") ?? null,
  };
}

/** สำเนาตัวตนของคนเซ็น ณ ตอนนี้ — ลายเซ็นว่างได้ (PDF จะเว้นเส้นไว้ให้เซ็นมือ) */
async function signerSnapshot(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { signature: true },
  });
  return {
    userId,
    name: user.fullName,
    title: user.jobTitle,
    phone: user.workPhone,
    signaturePng: user.signature?.png ?? null,
  };
}

async function notifyOwners(exceptUserId: string, message: string, link: string): Promise<void> {
  const owners = await prisma.user.findMany({
    where: { role: "OWNER", active: true, id: { not: exceptUserId } },
    select: { id: true },
  });
  for (const owner of owners) await createNotification({ userId: owner.id, message, link });
}

/** กลับเป็นร่างธรรมดา: ลบคนเซ็นทั้งคู่ แล้วชี้ใบนี้ไปเวอร์ชันล่าสุด (อาจมีการแก้ BOQ ระหว่างรอ) */
async function releaseToDraft(projectId: string, quoteId: string, extra: { returnNote?: string } = {}) {
  const latest = await getLatestVersion(projectId);
  await prisma.$transaction([
    prisma.quoteSigner.deleteMany({ where: { quoteId } }),
    prisma.quote.update({
      where: { id: quoteId },
      data: {
        projectVersionId: latest.id,
        approvalReturnNote: extra.returnNote ?? null,
        approvalReturnedAt: extra.returnNote ? new Date() : null,
      },
    }),
  ]);
}

export async function submitQuoteForApproval(projectId: string, quoteId: string, actor: Actor) {
  const { quote, proposer } = await loadDraftForApproval(projectId, quoteId);
  if (proposer) throw new QuoteError("ใบนี้ขออนุมัติไปแล้ว", 409);
  // เช็คเงื่อนไขการส่งตั้งแต่ตอนขอ — ไม่งั้นอนุมัติเสร็จแล้วค่อยมาเจอว่าส่งไม่ได้
  await assertCustomQuoteHasCustomerFile(projectId, quoteId);

  await prisma.$transaction([
    prisma.quoteSigner.create({ data: { quoteId, role: "PROPOSER", ...(await signerSnapshot(actor.id)) } }),
    prisma.quote.update({ where: { id: quoteId }, data: { approvalReturnNote: null, approvalReturnedAt: null } }),
  ]);
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true } });
  const me = await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { fullName: true } });
  await notifyOwners(
    actor.id,
    `${me.fullName} ขออนุมัติใบเสนอราคา ${quote.quoteNo} โครงการ "${project.name}"`,
    quoteLink(projectId),
  );
  await writeAuditLog({
    userId: actor.id,
    action: "QUOTE_APPROVAL_REQUESTED",
    entityType: "Quote",
    entityId: quoteId,
    details: { projectId, quoteNo: quote.quoteNo },
  });
}

export async function approveQuote(projectId: string, quoteId: string, actor: Actor) {
  if (actor.role !== "OWNER") throw new QuoteError("อนุมัติใบเสนอราคาได้เฉพาะเจ้าของระบบ", 403);
  const { quote, proposer, approver } = await loadDraftForApproval(projectId, quoteId);
  if (approver) throw new QuoteError("ใบนี้อนุมัติไปแล้ว", 409);
  if (!proposer) await assertCustomQuoteHasCustomerFile(projectId, quoteId);

  const snapshot = await signerSnapshot(actor.id);
  await prisma.$transaction([
    // เจ้าของทำใบเองแล้วกดอนุมัติเลย = เป็นทั้งผู้เสนอและผู้อนุมัติ
    ...(proposer ? [] : [prisma.quoteSigner.create({ data: { quoteId, role: "PROPOSER", ...snapshot } })]),
    prisma.quoteSigner.create({ data: { quoteId, role: "APPROVER", ...snapshot } }),
    prisma.quote.update({ where: { id: quoteId }, data: { approvalReturnNote: null, approvalReturnedAt: null } }),
  ]);

  if (proposer?.userId && proposer.userId !== actor.id) {
    await createNotification({
      userId: proposer.userId,
      message: `ใบเสนอราคา ${quote.quoteNo} ได้รับอนุมัติแล้ว — ส่งให้ลูกค้าได้เลย`,
      link: quoteLink(projectId),
    });
  }
  await writeAuditLog({
    userId: actor.id,
    action: "QUOTE_APPROVED",
    entityType: "Quote",
    entityId: quoteId,
    details: { projectId, quoteNo: quote.quoteNo, selfProposed: !proposer },
  });
}

/** เจ้าของส่งกลับให้แก้ (ทั้งตอนรออนุมัติ และยกเลิกการอนุมัติก่อนส่ง) — ต้องบอกเหตุผลเสมอ */
export async function returnQuoteForChanges(projectId: string, quoteId: string, actor: Actor, note: string) {
  if (actor.role !== "OWNER") throw new QuoteError("ส่งกลับได้เฉพาะเจ้าของระบบ", 403);
  const { quote, proposer } = await loadDraftForApproval(projectId, quoteId);
  if (!proposer) throw new QuoteError("ใบนี้ยังไม่ได้ขออนุมัติ", 409);

  await releaseToDraft(projectId, quoteId, { returnNote: note });
  if (proposer.userId && proposer.userId !== actor.id) {
    await createNotification({
      userId: proposer.userId,
      message: `ใบเสนอราคา ${quote.quoteNo} ถูกส่งกลับให้แก้: ${note}`,
      link: quoteLink(projectId),
    });
  }
  await writeAuditLog({
    userId: actor.id,
    action: "QUOTE_APPROVAL_RETURNED",
    entityType: "Quote",
    entityId: quoteId,
    details: { projectId, quoteNo: quote.quoteNo, note },
  });
}

/** ผู้ขอถอนคำขอเอง (หรือเจ้าของ) — เช่น เจอที่ต้องแก้ก่อนผู้อนุมัติจะเปิดดู */
export async function withdrawQuoteApproval(projectId: string, quoteId: string, actor: Actor) {
  const { quote, proposer } = await loadDraftForApproval(projectId, quoteId);
  if (!proposer) throw new QuoteError("ใบนี้ยังไม่ได้ขออนุมัติ", 409);
  if (proposer.userId !== actor.id && actor.role !== "OWNER") {
    throw new QuoteError("ถอนคำขอได้เฉพาะคนที่ขออนุมัติ", 403);
  }

  await releaseToDraft(projectId, quoteId);
  await writeAuditLog({
    userId: actor.id,
    action: "QUOTE_APPROVAL_WITHDRAWN",
    entityType: "Quote",
    entityId: quoteId,
    details: { projectId, quoteNo: quote.quoteNo },
  });
}
