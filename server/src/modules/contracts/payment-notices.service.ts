import fs from "node:fs";
import path from "node:path";

import { Prisma } from "@prisma/client";
import { PAYMENT_NOTICE_MAX_FILES } from "@systemboq/shared-types";

import { writeAuditLog } from "../../lib/audit-log";
import { parseIsoDate, todayIso, toIsoDate } from "../../lib/business-date";
import { paymentAccountFrom } from "../../lib/company-fields";
import { createNotification, notifyStaff } from "../../lib/notifications";
import { round2 } from "../../lib/pricing";
import { prisma } from "../../lib/prisma";
import { getSettingsMap } from "../../lib/settings";
import { checkNoticeSlips, REJECTING_SLIP_STATUSES, SLIP_REJECT_MESSAGE, type SlipCheckResult } from "../../lib/slip/slip-check";
import { assertReceiptIssuable, installmentDueAmounts, issueReceipt } from "./billing-docs.service";
import { ContractError } from "./contracts.service";
import { evidencePath, originalFileName } from "./payment-evidence.files";
import { getContractPayments, getSignedContractOrThrow, recordPayment, verifyPayment } from "./payments.service";

/**
 * ลูกค้าแจ้งโอนเงินพร้อมสลิปทางพอร์ทัล
 *
 * **การแจ้งไม่ใช่เงินเข้า** — ระบบไม่ปิดงวดให้จนกว่าพนักงานเปิดบัญชีธนาคารดูแล้วกดยืนยัน
 * (ยืนยัน = บันทึกรับเงินตามปกติ แล้วสลิปย้ายไปติดรายการนั้น ดู recordPayment)
 * ถ้านับเป็นการชำระทันที สลิปปลอมหรือโอนไม่สำเร็จจะปิดงวดและออกใบเสร็จได้ทั้งที่เงินไม่เคยเข้า
 */

/**
 * ระบบตรวจสลิปปฏิเสธการแจ้ง (ปลอม/ซ้ำ/ผิดบัญชี) — การแจ้งถูกบันทึกไว้แล้วพร้อมสลิป (ให้พนักงานเห็นความพยายามนั้น)
 * route ต้อง **ไม่ลบไฟล์ที่อัปโหลด** เมื่อเจอข้อผิดพลาดชนิดนี้ ต่างจาก ContractError ทั่วไป
 */
export class SlipRejectedError extends ContractError {
  constructor(message: string) {
    super(message, 422);
  }
}

/** กันกดส่งรัว ๆ / สลิปถมดิสก์ — ลูกค้าปกติแจ้งไม่กี่ครั้งต่อเดือน */
const MAX_NOTICES_PER_CONTRACT_PER_DAY = 10;

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * แจ้งโอนงวดนี้ได้ไหม — กติกาเดียวที่ทั้งหน้าจอลูกค้า (ปุ่ม) และเซิร์ฟเวอร์ (ปฏิเสธ) ใช้
 * ต้องมียอดค้าง และบริษัทเรียกเก็บแล้ว (วางบิล/ตั้งวันครบกำหนด) — งวดที่ยังไม่ถึงคิวไม่มีอะไรให้โอน
 * และต้องไม่มีการแจ้งที่รอตรวจอยู่ (ซ้ำงวดเดียวกันทำให้พนักงานยืนยันสองรอบ = รับเงินซ้ำ)
 */
export function canNotifyInstallment(input: {
  remaining: number;
  dueOn: Date | string | null;
  hasInvoice: boolean;
  hasPendingNotice: boolean;
}): boolean {
  return input.remaining > 0 && (input.dueOn != null || input.hasInvoice) && !input.hasPendingNotice;
}

async function getOwnedSignedContract(customerId: string, contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { project: { select: { id: true, customerId: true, name: true, projectNo: true, deletedAt: true } } },
  });
  // ของคนอื่น / โครงการในถังขยะ = ไม่พบ (ไม่บอกว่ามีอยู่จริง)
  if (contract?.project.customerId !== customerId || contract.project.deletedAt) {
    throw new ContractError("ไม่พบสัญญาที่ระบุ", 404);
  }
  if (!contract.signedAt) throw new ContractError("สัญญายังไม่ได้ลงนาม", 409);
  return contract;
}

export async function submitPaymentNotice(
  customerId: string,
  contractId: string,
  input: { installmentId: string; paidOn: string; amount: number; note?: string | null },
  files: { filename: string; originalname: string; mimetype: string; size: number }[],
) {
  const contract = await getOwnedSignedContract(customerId, contractId);
  if (files.length === 0) throw new ContractError("แนบสลิปการโอนอย่างน้อย 1 ไฟล์", 400);
  if (files.length > PAYMENT_NOTICE_MAX_FILES) {
    throw new ContractError(`แนบได้ไม่เกิน ${PAYMENT_NOTICE_MAX_FILES} ไฟล์`, 400);
  }
  const paidOn = parseIsoDate(input.paidOn);
  if (!paidOn) throw new ContractError("รูปแบบวันที่ไม่ถูกต้อง", 400);
  if (input.paidOn > todayIso()) throw new ContractError("วันที่โอนเป็นวันในอนาคตไม่ได้", 400);

  const installment = await prisma.contractInstallment.findUnique({
    where: { id: input.installmentId },
    include: {
      payments: { select: { amount: true } },
      billingDocuments: { where: { type: "INVOICE", voidedAt: null }, select: { id: true } },
      paymentNotices: { where: { status: "PENDING" }, select: { id: true } },
    },
  });
  if (installment?.contractId !== contractId) throw new ContractError("ไม่พบงวดที่ระบุ", 404);
  const paid = installment.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const ok = canNotifyInstallment({
    remaining: round2(Number(installment.amount) - paid),
    dueOn: installment.dueOn,
    hasInvoice: installment.billingDocuments.length > 0,
    hasPendingNotice: installment.paymentNotices.length > 0,
  });
  if (!ok) {
    throw new ContractError(
      installment.paymentNotices.length > 0
        ? "งวดนี้แจ้งโอนไว้แล้ว รอบริษัทตรวจสอบ"
        : "งวดนี้ยังไม่ถึงกำหนดชำระ หรือชำระครบแล้ว",
      409,
    );
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.paymentNotice.count({
    where: { installment: { contractId }, createdAt: { gte: since } },
  });
  if (recent >= MAX_NOTICES_PER_CONTRACT_PER_DAY) {
    throw new ContractError("แจ้งโอนบ่อยเกินไป กรุณาลองใหม่พรุ่งนี้ หรือติดต่อบริษัทโดยตรง", 429);
  }

  // ตรวจสลิปกับธนาคาร (ถ้าตั้งผู้ให้บริการไว้) — เทียบกับ "ยอดที่ต้องโอนจริง" สูตรเดียวกับใบแจ้งหนี้
  const signed = await getSignedContractOrThrow(contract.projectId, contractId);
  const due = await installmentDueAmounts(signed, installment, Math.min(paid, Number(installment.amount)));
  const check = await checkNoticeSlips(
    files.map((f) => ({ path: evidencePath(f.filename), mimetype: f.mimetype, originalname: originalFileName(f), filename: f.filename })),
    {
      customerAmount: round2(input.amount),
      customerPaidOn: input.paidOn,
      expectedNet: Math.max(0, due.net),
      account: paymentAccountFrom(await getSettingsMap()),
    },
  );
  const rejected = check != null && REJECTING_SLIP_STATUSES.has(check.status);

  const notice = await createNotice(check, rejected, {
    installmentId: installment.id,
    paidOn,
    amount: round2(input.amount),
    note: input.note?.trim() || null,
    submittedById: customerId,
    files,
  });

  if (rejected) {
    await writeAuditLog({
      userId: customerId,
      action: "SLIP_CHECK_REJECTED_NOTICE",
      entityType: "Contract",
      entityId: contractId,
      details: {
        projectId: contract.projectId,
        contractNo: contract.contractNo,
        seq: installment.seq,
        noticeId: notice.id,
        slipStatus: check.status,
        amount: round2(input.amount),
      },
    });
    // ความพยายามใช้สลิปปลอม/ซ้ำ/ผิดบัญชี — พนักงานต้องรู้ (ผู้ใช้เลือก "ปฏิเสธ + เก็บให้พนักงานเห็น")
    await notifyStaff(
      `ระบบตรวจสลิปปฏิเสธการแจ้งโอนงวดที่ ${installment.seq} สัญญา ${contract.contractNo} (${contract.project.name}) — ${SLIP_STATUS_LABEL[check.status]}`,
      `/projects/${contract.projectId}?tab=contract&view=payments&contract=${contractId}`,
    ).catch(() => undefined);
    throw new SlipRejectedError(check.customerMessage ?? "ตรวจสลิปไม่ผ่าน กรุณาติดต่อบริษัท");
  }

  await writeAuditLog({
    userId: customerId,
    action: "SUBMIT_PAYMENT_NOTICE",
    entityType: "Contract",
    entityId: contractId,
    details: {
      projectId: contract.projectId,
      contractNo: contract.contractNo,
      seq: installment.seq,
      noticeId: notice.id,
      paidOn: input.paidOn,
      amount: round2(input.amount),
      files: files.length,
      slipStatus: check?.status ?? undefined,
    },
  });
  await notifyStaff(
    `ลูกค้าแจ้งโอนเงิน ${money(round2(input.amount))} บาท งวดที่ ${installment.seq} สัญญา ${contract.contractNo} (${contract.project.name}) — ${staffNextStep(check)}`,
    `/projects/${contract.projectId}?tab=contract&view=payments&contract=${contractId}`,
  ).catch(() => undefined);

  return notice;
}

/** ป้ายสั้นของผลตรวจ — ใช้ในข้อความแจ้งเตือนพนักงาน */
const SLIP_STATUS_LABEL: Record<SlipCheckResult["status"], string> = {
  PASSED: "ตรวจสลิปกับธนาคารแล้ว",
  MISMATCH: "สลิปจริงแต่มีจุดไม่ตรง",
  UNCHECKED: "ตรวจสลิปอัตโนมัติไม่ได้",
  FAKE: "ธนาคารไม่พบรายการโอนนี้",
  DUPLICATE: "สลิปนี้เคยใช้แจ้งโอนแล้ว",
  WRONG_ACCOUNT: "โอนเข้าบัญชีที่ไม่ใช่ของบริษัท",
};

function staffNextStep(check: SlipCheckResult | null): string {
  if (!check || check.status === "UNCHECKED") return "รอตรวจกับบัญชี";
  if (check.status === "PASSED") return "ระบบตรวจสลิปกับธนาคารแล้ว รอกดยืนยัน";
  return "สลิปมีจุดไม่ตรง ตรวจก่อนยืนยัน";
}

/**
 * แถวผลตรวจรายไฟล์ — activeRef (unique) จองเลขอ้างอิงเฉพาะสลิปที่ผ่านและการแจ้งไม่ถูกปฏิเสธ
 */
function slipRows(
  noticeId: string,
  evidence: { id: string; storedName: string }[],
  check: SlipCheckResult,
  rejected: boolean,
) {
  return check.files.map((f) => ({
    noticeId,
    evidenceId: evidence.find((e) => e.storedName === f.storedName)!.id,
    status: f.status,
    transRef: f.slip?.transRef ?? null,
    activeRef: !rejected && f.status === "PASSED" ? f.slip!.transRef : null,
    amount: f.slip?.amount ?? null,
    transferredAt: f.slip?.transferredAt ?? null,
    senderName: f.slip?.senderName ?? null,
    senderBank: f.slip?.senderBank ?? null,
    receiverName: f.slip?.receiverName ?? null,
    receiverAccount: f.slip?.receiverAccount ?? f.slip?.receiverProxy ?? null,
    message: f.message,
    provider: check.provider,
  }));
}

/**
 * "ตรวจสลิปอีกครั้ง" — สำหรับการแจ้งที่รอตรวจและยังตรวจไม่ได้ (เช่น สลิปไทยพาณิชย์/กรุงเทพที่ธนาคารให้ตรวจ
 * หลังโอนราว 8 นาที รหัส 1010 · ระบบธนาคารขัดข้องชั่วคราว 1009 · เพิ่งเปิดระบบตรวจสลิปทีหลัง)
 *
 * ผลที่ได้มาแทนผลเดิมทั้งหมด · ตรวจซ้ำแล้วเจอว่าสลิปซ้ำ/ผิดบัญชี **ไม่ปฏิเสธลูกค้าเอง** — การแจ้งนี้ระบบรับไว้แล้ว
 * จึงขึ้นป้ายแดงให้พนักงานตัดสิน (กด "ไม่ตรง" พร้อมเหตุผล) แทน
 */
export async function recheckNoticeSlips(projectId: string, contractId: string, noticeId: string, actorId: string) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const notice = await prisma.paymentNotice.findUnique({
    where: { id: noticeId },
    include: {
      installment: { include: { payments: { select: { amount: true } } } },
      evidence: { select: { id: true, storedName: true, fileName: true, mimeType: true } },
    },
  });
  if (notice?.installment.contractId !== contractId) throw new ContractError("ไม่พบการแจ้งโอนที่ระบุ", 404);
  if (notice.status !== "PENDING") throw new ContractError("การแจ้งโอนนี้ถูกตรวจไปแล้ว", 409);
  if (notice.slipStatus != null && notice.slipStatus !== "UNCHECKED") {
    throw new ContractError("ตรวจสลิปซ้ำได้เฉพาะการแจ้งที่ยังตรวจไม่ได้", 409);
  }

  const installment = notice.installment;
  const paid = installment.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const due = await installmentDueAmounts(contract, installment, Math.min(paid, Number(installment.amount)));
  const check = await checkNoticeSlips(
    notice.evidence.map((e) => ({ path: evidencePath(e.storedName), mimetype: e.mimeType, originalname: e.fileName, filename: e.storedName })),
    {
      customerAmount: Number(notice.amount),
      customerPaidOn: toIsoDate(notice.paidOn)!,
      expectedNet: Math.max(0, due.net),
      account: paymentAccountFrom(await getSettingsMap()),
    },
  );
  if (!check) throw new ContractError("ยังไม่ได้เปิดระบบตรวจสลิปอัตโนมัติ", 409);

  try {
    await prisma.$transaction([
      prisma.slipVerification.deleteMany({ where: { noticeId } }),
      prisma.slipVerification.createMany({ data: slipRows(noticeId, notice.evidence, check, REJECTING_SLIP_STATUSES.has(check.status)) }),
      prisma.paymentNotice.update({ where: { id: noticeId }, data: { slipStatus: check.status, slipFlags: check.flags } }),
    ]);
  } catch (err) {
    // สลิปเดียวกันเพิ่งถูกใช้กับการแจ้งอื่นระหว่างนี้ (activeRef ชน) — ให้พนักงานรู้ ไม่บันทึกผลครึ่ง ๆ
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ContractError("สลิปนี้เพิ่งถูกใช้แจ้งโอนรายการอื่น — ตรวจกับบัญชีเอง", 409);
    }
    throw err;
  }
  await writeAuditLog({
    userId: actorId,
    action: "RECHECK_PAYMENT_NOTICE_SLIP",
    entityType: "Contract",
    entityId: contractId,
    details: { projectId, contractNo: contract.contractNo, seq: installment.seq, noticeId, slipStatus: check.status },
  });
  return getContractPayments(projectId, contractId);
}

/**
 * บันทึกการแจ้ง + สลิป + ผลตรวจรายไฟล์ในก้อนเดียว
 * activeRef = เลขอ้างอิงของสลิปที่ "ถูกใช้อยู่" (unique) — การแจ้งที่ถูกปฏิเสธไม่จองเลขไว้
 * สองคนแนบสลิปเดียวกันพร้อมกัน: คนที่สองชน unique → ตอบว่าสลิปซ้ำ (ไม่บันทึกอะไร)
 */
async function createNotice(
  check: SlipCheckResult | null,
  rejected: boolean,
  input: {
    installmentId: string;
    paidOn: Date;
    amount: number;
    note: string | null;
    submittedById: string;
    files: { filename: string; originalname: string; mimetype: string; size: number }[];
  },
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.paymentNotice.create({
        data: {
          installmentId: input.installmentId,
          paidOn: input.paidOn,
          amount: input.amount,
          note: input.note,
          submittedById: input.submittedById,
          ...(rejected ? { status: "REJECTED" as const, rejectReason: check?.customerMessage, reviewedAt: new Date() } : {}),
          slipStatus: check?.status ?? null,
          slipFlags: check?.flags ?? [],
          evidence: {
            create: input.files.map((f) => ({
              fileName: originalFileName(f),
              storedName: f.filename,
              mimeType: f.mimetype,
              sizeBytes: f.size,
              uploadedById: input.submittedById,
            })),
          },
        },
        include: { evidence: { select: { id: true, storedName: true } } },
      });
      if (check) {
        await tx.slipVerification.createMany({ data: slipRows(created.id, created.evidence, check, rejected) });
      }
      return created;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ContractError(SLIP_REJECT_MESSAGE.DUPLICATE!, 409);
    }
    throw err;
  }
}

/**
 * "ยืนยัน & ออกใบเสร็จ" คลิกเดียว (ผู้ใช้เลือก 18 ต.ค.) — ใช้ได้เฉพาะการแจ้งที่ระบบตรวจสลิปผ่าน
 *
 * ผ่าน = ธนาคารยืนยันรายการ · เข้าบัญชีบริษัท · ยอดเท่ายอดที่ต้องโอนจริง · วันที่ตรง — จึงนับผลตรวจสลิป
 * แทนการเปิดแอปธนาคาร (ขั้น "ยืนยันกับบัญชี") ได้ แต่ **คนยังเป็นผู้กด** ระบบไม่ยืนยันเองเด็ดขาด
 * บันทึกรับเงินด้วยตัวเลขชุดเดียวกับใบแจ้งหนี้ (ยอดงวดที่เหลือ หัก ณ ที่จ่าย เงินประกัน) แล้วยืนยัน
 * แล้วออกใบเสร็จ — ออกใบเสร็จไม่ได้ (เช่น ข้อมูลใบกำกับภาษีไม่ครบ) รายการรับเงินยังอยู่ บอกเหตุให้ออกเองทีหลัง
 */
export async function confirmNoticeBySlip(
  projectId: string,
  contractId: string,
  noticeId: string,
  actor: { id: string; role: string },
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const notice = await prisma.paymentNotice.findUnique({
    where: { id: noticeId },
    include: {
      installment: { include: { payments: { select: { amount: true } } } },
      slipChecks: { select: { status: true, amount: true, transRef: true, transferredAt: true } },
    },
  });
  if (notice?.installment.contractId !== contractId) throw new ContractError("ไม่พบการแจ้งโอนที่ระบุ", 404);
  if (notice.status !== "PENDING") throw new ContractError("การแจ้งโอนนี้ถูกตรวจไปแล้ว", 409);
  if (notice.slipStatus !== "PASSED") {
    throw new ContractError("ยืนยันคลิกเดียวได้เฉพาะสลิปที่ระบบตรวจผ่าน — ใช้ฟอร์มรับเงินแทน", 409);
  }

  const installment = notice.installment;
  const paid = installment.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const due = await installmentDueAmounts(contract, installment, Math.min(paid, Number(installment.amount)));
  const slipTotal = round2(notice.slipChecks.reduce((sum, c) => sum + Number(c.amount ?? 0), 0));
  // ระหว่างที่รอ มีคนบันทึกรับเงินงวดนี้ไปแล้ว — ตัวเลขที่ตรวจไว้ไม่ใช่ของงวดตอนนี้อีกต่อไป
  if (due.due <= 0 || Math.abs(slipTotal - due.net) > 0.009) {
    throw new ContractError("ยอดของงวดเปลี่ยนไปหลังลูกค้าแจ้งโอน — ตรวจแล้วบันทึกด้วยฟอร์มรับเงินแทน", 409);
  }
  // ออกใบเสร็จไม่ได้ = ไม่เริ่มเลย (ไม่บันทึกรับเงินค้างครึ่งทาง) — บอกให้แก้ก่อนแล้วกดใหม่
  try {
    await assertReceiptIssuable(contract, installment.id);
  } catch (err) {
    if (err instanceof ContractError) throw new ContractError(`ยังไม่ได้บันทึกอะไร — ${err.message}`, err.status);
    throw err;
  }
  const dates = notice.slipChecks.map((c) => toIsoDate(c.transferredAt)).filter((d): d is string => d != null);
  const paidOn = dates.sort().at(-1) ?? toIsoDate(notice.paidOn)!;

  await recordPayment(
    projectId,
    contractId,
    installment.id,
    {
      paidOn,
      amount: due.due,
      withholdingAmount: due.withholding ?? 0,
      retentionAmount: due.retention ?? 0,
      method: "TRANSFER",
      reference: notice.slipChecks.map((c) => c.transRef).filter(Boolean).join(", ") || null,
      note: null,
      receivedBy: null,
      noticeId,
    },
    actor.id,
  );
  const { paymentId } = await prisma.paymentNotice.findUniqueOrThrow({ where: { id: noticeId }, select: { paymentId: true } });
  await verifyPayment(projectId, contractId, paymentId!, actor, { bySlip: true });

  let receiptError: string | null = null;
  try {
    await issueReceipt(projectId, contractId, paymentId!, actor.id);
  } catch (err) {
    if (!(err instanceof ContractError)) throw err;
    receiptError = err.message;
  }
  return { ...(await getContractPayments(projectId, contractId)), receiptError };
}

/**
 * ลูกค้ายกเลิกการแจ้งของตัวเอง (ข้อ B ผู้ใช้เลือก 19 ต.ค.) — แนบสลิปผิด/พิมพ์ยอดผิด แก้เองได้ไม่ต้องรอพนักงานกด "ไม่ตรง"
 *
 * ได้เฉพาะตอนยังรอตรวจ และบริษัทยังไม่ได้บันทึกรับเงินจากการแจ้งนี้ (updateMany + PENDING กันชนกับพนักงานที่
 * กำลังกดยืนยันพร้อมกัน) · ปล่อยเลขอ้างอิงสลิป แนบสลิปเดิมแจ้งใหม่ได้ · สลิปเก็บไว้ (เป็นหลักฐานว่าเคยแจ้ง)
 */
export async function cancelMyPaymentNotice(customerId: string, contractId: string, noticeId: string) {
  const contract = await getOwnedSignedContract(customerId, contractId);
  const notice = await getNoticeOrThrow(contractId, noticeId);
  if (notice.status !== "PENDING") throw new ContractError("บริษัทตรวจการแจ้งนี้ไปแล้ว ยกเลิกไม่ได้", 409);

  const [claimed] = await prisma.$transaction([
    prisma.paymentNotice.updateMany({
      where: { id: noticeId, status: "PENDING", paymentId: null },
      data: { status: "CANCELLED", reviewedAt: new Date() },
    }),
    prisma.slipVerification.updateMany({ where: { noticeId }, data: { activeRef: null } }),
  ]);
  if (claimed.count !== 1) throw new ContractError("บริษัทตรวจการแจ้งนี้ไปแล้ว ยกเลิกไม่ได้", 409);

  await writeAuditLog({
    userId: customerId,
    action: "CANCEL_PAYMENT_NOTICE",
    entityType: "Contract",
    entityId: contractId,
    details: { projectId: contract.projectId, contractNo: contract.contractNo, seq: notice.installment.seq, noticeId },
  });
  await notifyStaff(
    `ลูกค้ายกเลิกการแจ้งโอนงวดที่ ${notice.installment.seq} สัญญา ${contract.contractNo} (${contract.project.name}) เอง — ไม่ต้องตรวจการแจ้งนี้`,
    `/projects/${contract.projectId}?tab=contract&view=payments&contract=${contractId}`,
  ).catch(() => undefined);
}

async function getNoticeOrThrow(contractId: string, noticeId: string) {
  const notice = await prisma.paymentNotice.findUnique({
    where: { id: noticeId },
    include: { installment: { select: { contractId: true, seq: true } } },
  });
  if (notice?.installment.contractId !== contractId) throw new ContractError("ไม่พบการแจ้งโอนที่ระบุ", 404);
  return notice;
}

/**
 * ไม่ตรงกับเงินเข้า — ต้องมีเหตุผลเสมอ เพราะลูกค้าเห็นข้อความนี้และต้องรู้ว่าจะทำอะไรต่อ
 * (โอนไม่สำเร็จ / ยอดไม่ตรง / สลิปไม่ชัด) · ลูกค้าแจ้งใหม่ได้ทันทีหลังถูกปฏิเสธ
 */
export async function rejectPaymentNotice(
  projectId: string,
  contractId: string,
  noticeId: string,
  reason: string,
  actorId: string,
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const notice = await getNoticeOrThrow(contractId, noticeId);
  if (notice.status !== "PENDING") throw new ContractError("การแจ้งโอนนี้ถูกตรวจไปแล้ว", 409);

  await prisma.$transaction([
    prisma.paymentNotice.update({
      where: { id: noticeId },
      data: { status: "REJECTED", rejectReason: reason, reviewedById: actorId, reviewedAt: new Date() },
    }),
    // ปล่อยเลขอ้างอิงสลิป — ลูกค้าแนบสลิปเดิมแจ้งใหม่ได้ (เช่น เลือกงวดผิด) ไม่โดนตีกลับว่าซ้ำ
    prisma.slipVerification.updateMany({ where: { noticeId }, data: { activeRef: null } }),
  ]);
  await writeAuditLog({
    userId: actorId,
    action: "REJECT_PAYMENT_NOTICE",
    entityType: "Contract",
    entityId: contractId,
    details: { projectId, contractNo: contract.contractNo, seq: notice.installment.seq, noticeId, reason },
  });
  if (contract.project.customerId) {
    await createNotification({
      userId: contract.project.customerId,
      message: `การแจ้งโอนงวดที่ ${notice.installment.seq} สัญญาเลขที่ ${contract.contractNo} ยังตรวจไม่พบเงินเข้า — ${reason}`,
      link: `/my/payments/${notice.installmentId}`,
    }).catch(() => undefined);
  }
  return getContractPayments(projectId, contractId);
}

function resolveEvidence(evidence: { storedName: string; fileName: string; mimeType: string } | null) {
  if (!evidence) throw new ContractError("ไม่พบไฟล์ที่ระบุ", 404);
  const absPath = evidencePath(evidence.storedName);
  if (path.basename(evidence.storedName) !== evidence.storedName || !fs.existsSync(absPath)) {
    throw new ContractError("ไฟล์หลักฐานหายไปจากระบบ", 404);
  }
  return { absPath, fileName: evidence.fileName, mimeType: evidence.mimeType };
}

/** สลิปของการแจ้งโอน (พนักงาน) — ใช้ได้ทั้งตอนรอตรวจและหลังยืนยัน/ปฏิเสธ */
export async function getStaffNoticeEvidenceFile(
  projectId: string,
  contractId: string,
  noticeId: string,
  evidenceId: string,
) {
  await getSignedContractOrThrow(projectId, contractId);
  await getNoticeOrThrow(contractId, noticeId);
  const evidence = await prisma.paymentEvidence.findFirst({ where: { id: evidenceId, noticeId } });
  return resolveEvidence(evidence);
}

/** ลูกค้าเปิดดูสลิปที่ตัวเองแนบ — เฉพาะที่มากับการแจ้งของตัวเอง (หลักฐานที่พนักงานแนบไม่ถึงมือลูกค้า) */
export async function getMyNoticeEvidenceFile(
  customerId: string,
  contractId: string,
  noticeId: string,
  evidenceId: string,
) {
  await getOwnedSignedContract(customerId, contractId);
  await getNoticeOrThrow(contractId, noticeId);
  const evidence = await prisma.paymentEvidence.findFirst({ where: { id: evidenceId, noticeId } });
  return resolveEvidence(evidence);
}
