import type { Prisma } from "@prisma/client";
import {
  contractPaymentSummary,
  installmentProgress,
  retentionBalance,
  retentionOf,
  withholdingAfterRetention,
  type BillingDocSummaryDto,
  type ContractPaymentsViewDto,
  type ContractRetentionDto,
  type InstallmentPaymentDto,
  type InstallmentWithPaymentsDto,
  type PaymentNoticeDto,
  type RetentionReleaseDto,
} from "@systemboq/shared-types";

import { writeAuditLog } from "../../lib/audit-log";
import { createNotification } from "../../lib/notifications";
import { billingPartyOf, splitWithholding, withholdingFor } from "../../lib/billing-party";
import { parseIsoDate, todayIso, toIsoDate } from "../../lib/business-date";
import { retentionSetAfterSigning } from "../../lib/contract-retention";
import { round2 } from "../../lib/pricing";
import { prisma } from "../../lib/prisma";
import { contractCurrentTotals } from "./change-orders.service";
import { removeEvidenceFiles } from "./payment-evidence.files";
import { ContractError } from "./contracts.service";
import type { RecordPaymentInput, UpdatePaymentInput } from "./payments.schemas";

/**
 * ติดตามการจ่ายเงินรายงวด
 *
 * **ทุกอย่างในไฟล์นี้ทำได้เฉพาะสัญญาที่ลงนามแล้ว** ด้วยเหตุผลที่เจอจากข้อมูลจริง: โครงการหนึ่ง
 * ออกสัญญาได้หลายฉบับ (PRJ-2026-0928 มีสี่ฉบับ ยอดเท่ากันหมด เซ็นจริงฉบับเดียว) ถ้ารับเงินลง
 * ฉบับไหนก็ได้ ยอดลูกหนี้จะกลายเป็นสี่เท่าทันที — ฉบับที่ลงนามคือฉบับเดียวที่มีผลผูกพันจริง
 *
 * ผลพลอยได้: `updateInstallments` ปฏิเสธการแก้แผนงวดหลังลงนามอยู่แล้ว สองกฎนี้ประกบกันทำให้
 * ไม่มีทางที่การเขียนทับแผนงวดจะลบรายการรับเงินทิ้งไปตาม FK แบบ CASCADE ได้เลย
 */

type PaymentRow = {
  id: string;
  installmentId: string;
  paidOn: Date;
  amount: unknown;
  withholdingAmount: unknown;
  retentionAmount: unknown;
  method: "TRANSFER" | "CASH" | "CHEQUE" | "OTHER";
  reference: string | null;
  note: string | null;
  recordedById: string | null;
  createdAt: Date;
  recordedBy: { fullName: string } | null;
};

type EvidenceRow = {
  id: string;
  fileName: string;
  sizeBytes: number;
  uploadedById: string | null;
  createdAt: Date;
  uploadedBy: { fullName: string } | null;
};

/** include ของรายการรับเงินที่หน้าจอใช้ — คนบันทึก + ไฟล์หลักฐาน (ไม่ดึง storedName ออกไปนอกเซิร์ฟเวอร์) */
const PAYMENT_INCLUDE = {
  recordedBy: { select: { fullName: true } },
  verifiedBy: { select: { fullName: true } },
  evidence: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fileName: true,
      sizeBytes: true,
      uploadedById: true,
      createdAt: true,
      uploadedBy: { select: { fullName: true } },
    },
  },
} as const;

function toEvidenceDto(e: EvidenceRow) {
  return {
    id: e.id,
    fileName: e.fileName,
    sizeBytes: e.sizeBytes,
    uploadedByName: e.uploadedBy?.fullName ?? null,
    uploadedById: e.uploadedById,
    createdAt: e.createdAt.toISOString(),
  };
}

function toPaymentDto(
  row: PaymentRow & {
    receivedBy: string | null;
    evidence: EvidenceRow[];
    verifiedAt: Date | null;
    verifiedById: string | null;
    verifiedBy: { fullName: string } | null;
  },
): InstallmentPaymentDto {
  return {
    id: row.id,
    installmentId: row.installmentId,
    paidOn: toIsoDate(row.paidOn)!,
    amount: String(row.amount),
    withholdingAmount: String(row.withholdingAmount),
    retentionAmount: String(row.retentionAmount),
    method: row.method,
    reference: row.reference,
    note: row.note,
    receivedBy: row.receivedBy,
    recordedByName: row.recordedBy?.fullName ?? null,
    recordedById: row.recordedById,
    createdAt: row.createdAt.toISOString(),
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verifiedById: row.verifiedById,
    verifiedByName: row.verifiedBy?.fullName ?? null,
    evidence: row.evidence.map(toEvidenceDto),
  };
}

function toReleaseDto(row: Omit<PaymentRow, "installmentId" | "retentionAmount">): RetentionReleaseDto {
  return {
    id: row.id,
    paidOn: toIsoDate(row.paidOn)!,
    amount: String(row.amount),
    withholdingAmount: String(row.withholdingAmount),
    method: row.method,
    reference: row.reference,
    note: row.note,
    recordedByName: row.recordedBy?.fullName ?? null,
    recordedById: row.recordedById,
    createdAt: row.createdAt.toISOString(),
  };
}

type BillingDocRow = {
  id: string;
  type: "INVOICE" | "RECEIPT";
  isTaxInvoice: boolean;
  docNo: string;
  issuedOn: Date;
  dueOn: Date | null;
  amount: unknown;
  paymentId: string | null;
  forRetention: boolean;
  retentionReleaseId: string | null;
  issuedByName: string;
  createdAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
};

export function toBillingDocSummary(row: BillingDocRow): BillingDocSummaryDto {
  return {
    id: row.id,
    type: row.type,
    isTaxInvoice: row.isTaxInvoice,
    docNo: row.docNo,
    issuedOn: toIsoDate(row.issuedOn)!,
    dueOn: toIsoDate(row.dueOn),
    amount: String(row.amount),
    paymentId: row.paymentId,
    forRetention: row.forRetention,
    retentionReleaseId: row.retentionReleaseId,
    issuedByName: row.issuedByName,
    createdAt: row.createdAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
  };
}

/** คอลัมน์ที่หน้าจอใช้ — ไม่ดึง signaturePng (ไบต์รูป) มาทุกครั้งที่เปิดแผงรับเงิน */
export const BILLING_DOC_SUMMARY_SELECT = {
  id: true,
  type: true,
  isTaxInvoice: true,
  docNo: true,
  issuedOn: true,
  dueOn: true,
  amount: true,
  paymentId: true,
  forRetention: true,
  retentionReleaseId: true,
  issuedByName: true,
  createdAt: true,
  voidedAt: true,
  voidReason: true,
} as const;

export async function getSignedContractOrThrow(projectId: string, contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      project: {
        select: {
          id: true,
          projectNo: true,
          name: true,
          customerId: true,
          customer: { select: { fullName: true, customerProfile: true } },
        },
      },
    },
  });
  if (contract?.projectId !== projectId) {
    throw new ContractError("ไม่พบสัญญาที่ระบุ", 404);
  }
  if (!contract.signedAt) {
    throw new ContractError(
      "สัญญายังไม่ได้ลงนาม บันทึกการรับเงินไม่ได้ — โครงการหนึ่งออกสัญญาได้หลายฉบับ ฉบับที่ลงนามเท่านั้นที่มีผลผูกพัน",
      409,
    );
  }
  return contract;
}

type NoticeRow = Prisma.PaymentNoticeGetPayload<{
  include: {
    submittedBy: { select: { fullName: true } };
    evidence: typeof PAYMENT_INCLUDE.evidence;
    slipChecks: true;
  };
}>;

function toNoticeDto(n: NoticeRow): PaymentNoticeDto {
  return {
    id: n.id,
    installmentId: n.installmentId,
    paidOn: toIsoDate(n.paidOn)!,
    amount: String(n.amount),
    note: n.note,
    status: n.status,
    submittedByName: n.submittedBy?.fullName ?? null,
    createdAt: n.createdAt.toISOString(),
    evidence: n.evidence.map(toEvidenceDto),
    rejectReason: n.rejectReason,
    slipCheck: n.slipStatus
      ? {
          status: n.slipStatus,
          flags: n.slipFlags,
          files: n.slipChecks.map((c) => ({
            evidenceId: c.evidenceId,
            status: c.status,
            transRef: c.transRef,
            amount: c.amount == null ? null : String(c.amount),
            transferredAt: c.transferredAt?.toISOString() ?? null,
            senderName: c.senderName,
            senderBank: c.senderBank,
            receiverName: c.receiverName,
            receiverAccount: c.receiverAccount,
            message: c.message,
          })),
        }
      : null,
  };
}

export async function getContractPayments(
  projectId: string,
  contractId: string,
): Promise<ContractPaymentsViewDto> {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const [rows, releases, retentionDocs] = await Promise.all([
    prisma.contractInstallment.findMany({
      where: { contractId },
      orderBy: { seq: "asc" },
      include: {
        payments: {
          orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
          include: PAYMENT_INCLUDE,
        },
        paymentNotices: {
          // รอตรวจ + ที่ระบบตรวจสลิปปฏิเสธใน 90 วัน (แยกเป็นสองรายการตอนส่งออก)
          where: {
            OR: [
              { status: "PENDING" },
              {
                status: "REJECTED",
                slipStatus: { in: ["FAKE", "DUPLICATE", "WRONG_ACCOUNT"] },
                reviewedById: null,
                createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
              },
            ],
          },
          orderBy: { createdAt: "asc" },
          include: {
            submittedBy: { select: { fullName: true } },
            evidence: PAYMENT_INCLUDE.evidence,
            slipChecks: true,
          },
        },
        billingDocuments: {
          orderBy: { createdAt: "asc" },
          select: BILLING_DOC_SUMMARY_SELECT,
        },
      },
    }),
    prisma.retentionRelease.findMany({
      where: { contractId },
      orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
      include: { recordedBy: { select: { fullName: true } } },
    }),
    prisma.billingDocument.findMany({
      where: { contractId, forRetention: true },
      orderBy: { createdAt: "asc" },
      select: BILLING_DOC_SUMMARY_SELECT,
    }),
  ]);

  const today = todayIso();
  // มูลค่าปัจจุบัน = ตามสัญญา + ใบงานเพิ่ม-ลดที่อนุมัติ — ผลรวมงวดเท่ายอดนี้ ไม่ใช่ยอดตอนลงนาม
  const current = await contractCurrentTotals(contract);
  const contractAmount = current.amount;
  const retentionPct = contract.retentionPct == null ? null : Number(contract.retentionPct);

  // ภาษีหัก ณ ที่จ่ายรายงวด — คิดจากฐานที่ตรึงไว้กับสัญญาฉบับนี้ ไม่ใช่เวอร์ชันล่าสุดของโครงการ
  // ซึ่งขยับได้ถ้ามีการสร้างเวอร์ชันใหม่ทีหลัง (ดูคอมเมนต์ Contract.vatAmount)
  const party = billingPartyOf(contract.project.customer, contract.project.customer?.customerProfile);
  const withholding =
    contractAmount != null
      ? withholdingFor(party, contractAmount, current.vat)
      : null;
  const perInstallment =
    withholding != null && contractAmount != null
      ? splitWithholding(
          withholding,
          contractAmount,
          rows.map((r) => ({ amount: Number(r.amount) })),
        )
      : [];

  const paymentsOf = (row: (typeof rows)[number]) =>
    row.payments.map((p) => ({
      amount: Number(p.amount),
      withholdingAmount: Number(p.withholdingAmount),
      retentionAmount: Number(p.retentionAmount),
    }));

  const installments: InstallmentWithPaymentsDto[] = rows.map((row, index) => {
    const amount = Number(row.amount);
    const expectedRetention = retentionPct == null ? null : retentionOf(amount, retentionPct);
    const wh = perInstallment[index]?.tax;
    return {
      id: row.id,
      seq: row.seq,
      milestone: row.milestone,
      amount: String(row.amount),
      dueOn: toIsoDate(row.dueOn),
      progress: installmentProgress({
        amount,
        dueOn: toIsoDate(row.dueOn),
        today,
        payments: paymentsOf(row),
      }),
      // ผู้ว่าจ้างหักภาษีจากเงินที่จ่ายจริง ส่วนที่กันเป็นเงินประกันไว้ถูกหักตอนคืน
      expectedWithholding: wh == null ? null : withholdingAfterRetention(wh, amount, expectedRetention ?? 0),
      expectedRetention,
      payments: row.payments.map(toPaymentDto),
      pendingNotices: row.paymentNotices.filter((n) => n.status === "PENDING").map(toNoticeDto),
      slipRejectedNotices: row.paymentNotices.filter((n) => n.status === "REJECTED").map(toNoticeDto),
      documents: row.billingDocuments.map(toBillingDocSummary),
    };
  });

  const held = rows.reduce((sum, r) => sum + r.payments.reduce((s, p) => s + Number(p.retentionAmount), 0), 0);
  const balance = retentionBalance({
    held,
    releases: releases.map((r) => ({ amount: Number(r.amount), withholdingAmount: Number(r.withholdingAmount) })),
    dueOn: toIsoDate(contract.retentionDueOn),
    today,
  });
  const retention: ContractRetentionDto = {
    pct: retentionPct,
    setAfterSigning: retentionSetAfterSigning(contract),
    dueOn: toIsoDate(contract.retentionDueOn),
    plannedTotal: round2(rows.reduce((sum, r) => sum + retentionOf(Number(r.amount), retentionPct), 0)),
    balance,
    // ภาษีของเงินประกันที่ยังค้าง = สัดส่วนเดียวกับยอดหักทั้งสัญญา (ก้อนไหนก็หัก 3% ของส่วนก่อน VAT)
    expectedWithholding:
      withholding != null && contractAmount != null && contractAmount > 0
        ? round2((withholding.tax * balance.outstanding) / contractAmount)
        : null,
    releases: releases.map(toReleaseDto),
    documents: retentionDocs.map(toBillingDocSummary),
  };

  return {
    contractId: contract.id,
    contractNo: contract.contractNo,
    signedAt: contract.signedAt?.toISOString() ?? null,
    contractAmount,
    hasPlan: rows.length > 0,
    today,
    installments,
    summary: contractPaymentSummary(
      rows.map((r) => ({ amount: Number(r.amount), dueOn: toIsoDate(r.dueOn), payments: paymentsOf(r) })),
      today,
    ),
    retention,
  };
}

export async function getInstallmentOrThrow(contractId: string, installmentId: string) {
  const installment = await prisma.contractInstallment.findUnique({ where: { id: installmentId } });
  if (installment?.contractId !== contractId) {
    throw new ContractError("ไม่พบงวดที่ระบุ", 404);
  }
  return installment;
}

/**
 * วันครบกำหนดของงวด — พนักงานกดเองเมื่องานถึงงวดแล้ว/วางบิลแล้ว
 *
 * ระบบไม่คำนวณให้จากวันเซ็นสัญญา + ระยะเวลาก่อสร้าง เพราะงานก่อสร้างไม่ได้เดินตามปฏิทิน
 * การเดาวันที่ให้แล้วประกาศว่า "เกินกำหนด 40 วัน" จากวันที่ที่ไม่เคยตกลงกันจริงคือการโกหก
 */
export async function setInstallmentDue(
  projectId: string,
  contractId: string,
  installmentId: string,
  dueOn: string | null,
  actorId: string,
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const installment = await getInstallmentOrThrow(contractId, installmentId);

  let parsed: Date | null = null;
  if (dueOn != null) {
    parsed = parseIsoDate(dueOn);
    if (!parsed) throw new ContractError("รูปแบบวันที่ไม่ถูกต้อง", 400);
  }

  await prisma.contractInstallment.update({ where: { id: installmentId }, data: { dueOn: parsed } });
  await writeAuditLog({
    userId: actorId,
    action: "SET_INSTALLMENT_DUE",
    entityType: "Contract",
    entityId: contractId,
    details: {
      projectId,
      contractNo: contract.contractNo,
      seq: installment.seq,
      from: toIsoDate(installment.dueOn),
      to: dueOn,
    },
  });

  return getContractPayments(projectId, contractId);
}

/** ตรวจตัวเลขของรายการรับเงินหนึ่งรายการ — ใช้ทั้งตอนเพิ่มและตอนแก้ */
function validatePayment(input: {
  paidOn: string;
  amount: number;
  withholdingAmount: number;
  retentionAmount?: number;
}) {
  const paidOn = parseIsoDate(input.paidOn);
  if (!paidOn) throw new ContractError("รูปแบบวันที่ไม่ถูกต้อง", 400);
  // กันพิมพ์ปีผิด (2027 แทน 2026) ซึ่งจะทำให้งวดดูเหมือนรับเงินแล้วทั้งที่ยังไม่ได้รับ
  if (input.paidOn > todayIso()) {
    throw new ContractError("วันที่รับเงินเป็นวันในอนาคตไม่ได้", 400);
  }
  if (input.amount <= 0) throw new ContractError("ยอดที่รับต้องมากกว่า 0", 400);
  if (input.withholdingAmount < 0) {
    throw new ContractError("ภาษีหัก ณ ที่จ่ายติดลบไม่ได้", 400);
  }
  if (input.withholdingAmount >= input.amount) {
    throw new ContractError("ภาษีหัก ณ ที่จ่ายต้องน้อยกว่ายอดที่รับ", 400);
  }
  const retention = input.retentionAmount ?? 0;
  if (retention < 0) throw new ContractError("เงินประกันผลงานติดลบไม่ได้", 400);
  // ต้องมีเงินเข้าจริงบ้าง — กันทั้งก้อนเป็นเงินประกันไม่ใช่การรับชำระ
  if (round2(input.withholdingAmount + retention) >= input.amount) {
    throw new ContractError("ภาษีหัก ณ ที่จ่ายรวมกับเงินประกันผลงานต้องน้อยกว่ายอดที่ชำระ", 400);
  }
  return paidOn;
}

/**
 * คนรับเงินมีความหมายเฉพาะเงินที่ส่งมือต่อมือ (เงินสด/เช็ค) — เงินโอนเข้าบัญชีบริษัทตรง
 * สลับช่องทางจากเงินสดเป็นโอนแล้วชื่อเดิมค้างไว้จะอ่านผิดว่ามีคนถือเงินอยู่
 */
function receivedByFor(input: { method: string; receivedBy?: string | null }): string | null {
  if (input.method !== "CASH" && input.method !== "CHEQUE") return null;
  return input.receivedBy?.trim() || null;
}

/**
 * บันทึกการรับเงินหนึ่งครั้ง
 *
 * **รับเกินยอดงวดได้โดยไม่ถูกปฏิเสธ** — ถ้าธนาคารเข้ามา 1,000,005 แล้วระบบบังคับให้กรอกได้
 * ไม่เกิน 1,000,000 พนักงานก็จะกรอก 1,000,000 แล้วห้าบาทนั้นหายไปจากระบบเงียบ ๆ
 * ระบบที่ปฏิเสธความจริงคือระบบที่สอนให้คนโกหกมัน — จึงรับไว้แล้วแสดงว่า "รับเกิน" ให้เห็นแทน
 */
export async function recordPayment(
  projectId: string,
  contractId: string,
  installmentId: string,
  input: RecordPaymentInput,
  actorId: string,
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const installment = await getInstallmentOrThrow(contractId, installmentId);
  const paidOn = validatePayment(input);

  // ยืนยันการแจ้งโอน: ต้องเป็นของงวดนี้และยังรอตรวจ — ยืนยันซ้ำ = รับเงินซ้ำสองรายการ
  const noticeId = input.noticeId ?? null;
  if (noticeId) {
    const notice = await prisma.paymentNotice.findUnique({ where: { id: noticeId } });
    if (notice?.installmentId !== installmentId) throw new ContractError("ไม่พบการแจ้งโอนของงวดนี้", 404);
    if (notice.status !== "PENDING") throw new ContractError("การแจ้งโอนนี้ถูกตรวจไปแล้ว", 409);
  }

  const created = await prisma.$transaction(async (tx) => {
    const payment = await tx.installmentPayment.create({
    data: {
      installmentId,
      paidOn,
      amount: input.amount,
      withholdingAmount: input.withholdingAmount,
      retentionAmount: input.retentionAmount,
      method: input.method,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      receivedBy: receivedByFor(input),
      recordedById: actorId,
    },
    });
    if (noticeId) {
      // updateMany + เงื่อนไข PENDING = กันสองคนกดยืนยันพร้อมกัน (คนที่สองได้ 0 แถว → ยกเลิกทั้งก้อน)
      const claimed = await tx.paymentNotice.updateMany({
        where: { id: noticeId, status: "PENDING" },
        data: { status: "CONFIRMED", paymentId: payment.id, reviewedById: actorId, reviewedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ContractError("การแจ้งโอนนี้ถูกตรวจไปแล้ว", 409);
      // สลิปของลูกค้าย้ายมาเป็นหลักฐานของรายการนี้ (ยังชี้การแจ้งเดิมไว้ด้วย — รู้ว่าลูกค้าแนบ)
      await tx.paymentEvidence.updateMany({ where: { noticeId }, data: { paymentId: payment.id } });
    }
    return payment;
  });

  await writeAuditLog({
    userId: actorId,
    action: "RECORD_INSTALLMENT_PAYMENT",
    entityType: "Contract",
    entityId: contractId,
    details: {
      projectId,
      contractNo: contract.contractNo,
      seq: installment.seq,
      paymentId: created.id,
      paidOn: input.paidOn,
      amount: input.amount,
      withholdingAmount: input.withholdingAmount,
      retentionAmount: input.retentionAmount,
      method: input.method,
      noticeId: noticeId ?? undefined,
    },
  });

  return getContractPayments(projectId, contractId);
}

export async function getPaymentOrThrow(contractId: string, paymentId: string) {
  const payment = await prisma.installmentPayment.findUnique({
    where: { id: paymentId },
    include: { installment: { select: { contractId: true, seq: true } } },
  });
  if (payment?.installment.contractId !== contractId) {
    throw new ContractError("ไม่พบรายการรับเงินที่ระบุ", 404);
  }
  return payment;
}

/**
 * รายการที่ออกใบเสร็จไปแล้วแก้/ลบไม่ได้ — ใบเสร็จอยู่ในมือลูกค้าแล้ว ถ้าตัวเลขในระบบขยับได้เงียบ ๆ
 * ใบในมือลูกค้ากับบัญชีของเราจะไม่ตรงกัน ต้องยกเลิกใบเสร็จก่อน (เหลือร่องรอยพร้อมเหตุผล) แล้วค่อยแก้
 */
async function assertNoActiveReceipt(paymentId: string) {
  const receipt = await prisma.billingDocument.findFirst({
    where: { paymentId, type: "RECEIPT", voidedAt: null },
    select: { docNo: true },
  });
  if (receipt) {
    throw new ContractError(
      `รายการนี้ออกใบเสร็จ ${receipt.docNo} ไปแล้ว — ยกเลิกใบเสร็จก่อนจึงจะแก้หรือลบได้`,
      409,
    );
  }
}

/**
 * แก้/ลบได้เฉพาะคนที่บันทึกเอง หรือเจ้าของกิจการ — แพตเทิร์นเดียวกับบันทึกการติดต่อลูกค้า
 * ของเดิมไม่หายไปไหนเพราะทุกการแก้และลบเขียนยอดเก่าลง AuditLog ซึ่งแก้ย้อนหลังไม่ได้
 */
export function assertCanModify(payment: { recordedById: string | null }, actorId: string, actorRole: string) {
  if (actorRole !== "OWNER" && payment.recordedById !== actorId) {
    throw new ContractError("แก้ไขได้เฉพาะรายการที่ตัวเองบันทึกไว้ (หรือให้เจ้าของกิจการแก้ให้)", 403);
  }
}

export async function updatePayment(
  projectId: string,
  contractId: string,
  paymentId: string,
  input: UpdatePaymentInput,
  actor: { id: string; role: string },
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const payment = await getPaymentOrThrow(contractId, paymentId);
  assertCanModify(payment, actor.id, actor.role);
  await assertNoActiveReceipt(paymentId);
  const paidOn = validatePayment(input);

  // ตัวเลขที่คนยืนยันตรวจกับบัญชีไปแล้ว ไม่ใช่ตัวเลขใหม่นี้ → ต้องยืนยันใหม่ (เลขอ้างอิง/หมายเหตุแก้ได้ไม่ต้องยืนยันใหม่)
  const moneyChanged =
    toIsoDate(payment.paidOn) !== input.paidOn ||
    Number(payment.amount) !== input.amount ||
    Number(payment.withholdingAmount) !== input.withholdingAmount ||
    Number(payment.retentionAmount) !== (input.retentionAmount ?? 0) ||
    payment.method !== input.method;
  const resetVerification = moneyChanged && payment.verifiedAt != null;

  await prisma.installmentPayment.update({
    where: { id: paymentId },
    data: {
      paidOn,
      amount: input.amount,
      withholdingAmount: input.withholdingAmount,
      retentionAmount: input.retentionAmount,
      method: input.method,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      receivedBy: receivedByFor(input),
      ...(resetVerification ? { verifiedAt: null, verifiedById: null } : {}),
    },
  });

  await writeAuditLog({
    userId: actor.id,
    action: "UPDATE_INSTALLMENT_PAYMENT",
    entityType: "Contract",
    entityId: contractId,
    details: {
      projectId,
      contractNo: contract.contractNo,
      seq: payment.installment.seq,
      paymentId,
      // ยอดเดิมต้องอยู่ในบันทึกด้วย ไม่งั้นการแก้ตัวเลขเงินย้อนหลังจะไม่เหลือร่องรอยว่าแก้จากเท่าไร
      from: {
        paidOn: toIsoDate(payment.paidOn),
        amount: Number(payment.amount),
        retentionAmount: Number(payment.retentionAmount),
      },
      to: { paidOn: input.paidOn, amount: input.amount, retentionAmount: input.retentionAmount },
      verificationReset: resetVerification,
    },
  });

  return getContractPayments(projectId, contractId);
}

/**
 * ยืนยันว่าเงินเข้าบัญชีบริษัทจริง (คนที่สองตรวจกับแอปธนาคาร/สเตทเมนต์) — กันบันทึกรับเงินที่ยังไม่เข้า
 *
 * คนบันทึกยืนยันรายการของตัวเองไม่ได้ (ADMIN) · เจ้าของกิจการยืนยันได้ทุกรายการ รวมของตัวเอง
 * (บริษัทคนเดียวต้องทำได้ — แต่ต้องกดแยกอีกขั้น ไม่ใช่ติดมากับการบันทึก)
 * ยืนยันแล้วแจ้งลูกค้าทางพอร์ทัล: ลูกค้าเป็นคนตรวจคนที่สาม ถ้ายอดผิดลูกค้าจะทักมาเอง
 */
export async function verifyPayment(
  projectId: string,
  contractId: string,
  paymentId: string,
  actor: { id: string; role: string },
  /** bySlip = ระบบตรวจสลิปกับธนาคารผ่านแล้ว (การตรวจคนที่สอง) — คนที่กดยืนยันคลิกเดียวไม่ถูกห้ามว่าเป็นคนบันทึก */
  opts: { bySlip?: boolean } = {},
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const payment = await getPaymentOrThrow(contractId, paymentId);
  if (payment.verifiedAt) throw new ContractError("รายการนี้ยืนยันกับบัญชีไปแล้ว", 409);
  if (!opts.bySlip && actor.role !== "OWNER" && payment.recordedById === actor.id) {
    throw new ContractError("ยืนยันรายการที่ตัวเองบันทึกไม่ได้ — ให้คนอื่น (หรือเจ้าของกิจการ) ตรวจกับบัญชีธนาคาร", 403);
  }
  // updateMany + เงื่อนไขยังไม่ยืนยัน = กันสองคนกดพร้อมกัน (แจ้งลูกค้าซ้ำ)
  const claimed = await prisma.installmentPayment.updateMany({
    where: { id: paymentId, verifiedAt: null },
    data: { verifiedAt: new Date(), verifiedById: actor.id },
  });
  if (claimed.count !== 1) throw new ContractError("รายการนี้ยืนยันกับบัญชีไปแล้ว", 409);

  const amount = Number(payment.amount);
  const received = amount - Number(payment.withholdingAmount) - Number(payment.retentionAmount);
  if (contract.project.customerId) {
    await createNotification({
      userId: contract.project.customerId,
      message: `บริษัทได้รับเงินงวดที่ ${payment.installment.seq} สัญญาเลขที่ ${contract.contractNo} จำนวน ${received.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาทแล้ว`,
      link: `/my/payments/${payment.installmentId}`,
    }).catch(() => undefined);
  }
  await writeAuditLog({
    userId: actor.id,
    action: "VERIFY_INSTALLMENT_PAYMENT",
    entityType: "Contract",
    entityId: contractId,
    details: {
      projectId,
      contractNo: contract.contractNo,
      seq: payment.installment.seq,
      paymentId,
      paidOn: toIsoDate(payment.paidOn),
      amount,
      recordedById: payment.recordedById,
      bySlip: opts.bySlip || undefined,
    },
  });
  return getContractPayments(projectId, contractId);
}

export async function deletePayment(
  projectId: string,
  contractId: string,
  paymentId: string,
  actor: { id: string; role: string },
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const payment = await getPaymentOrThrow(contractId, paymentId);
  assertCanModify(payment, actor.id, actor.role);
  await assertNoActiveReceipt(paymentId);

  // แถวหลักฐานหายตาม CASCADE แต่ไฟล์บนดิสก์ไม่ — จำชื่อไว้ก่อนลบแล้วตามลบทีหลัง
  // ยกเว้นสลิปที่ลูกค้าแนบมากับการแจ้งโอน: เป็นของการแจ้ง ไม่ใช่ของรายการนี้ จึงแค่ปลดออก
  // แล้วการแจ้งกลับเป็น "รอตรวจ" — ลบเพราะบันทึกผิด ไม่ได้แปลว่าลูกค้าไม่ได้โอน
  const evidence = await prisma.paymentEvidence.findMany({
    where: { paymentId, noticeId: null },
    select: { storedName: true },
  });
  await prisma.$transaction([
    prisma.paymentEvidence.updateMany({ where: { paymentId, noticeId: { not: null } }, data: { paymentId: null } }),
    prisma.paymentNotice.updateMany({
      where: { paymentId },
      data: { status: "PENDING", paymentId: null, reviewedById: null, reviewedAt: null },
    }),
    prisma.installmentPayment.delete({ where: { id: paymentId } }),
  ]);
  removeEvidenceFiles(evidence.map((e) => e.storedName));
  await writeAuditLog({
    userId: actor.id,
    action: "DELETE_INSTALLMENT_PAYMENT",
    entityType: "Contract",
    entityId: contractId,
    details: {
      projectId,
      contractNo: contract.contractNo,
      seq: payment.installment.seq,
      paymentId,
      paidOn: toIsoDate(payment.paidOn),
      amount: Number(payment.amount),
      withholdingAmount: Number(payment.withholdingAmount),
      retentionAmount: Number(payment.retentionAmount),
    },
  });

  return getContractPayments(projectId, contractId);
}

// ---------- เงินประกันผลงาน ----------

/**
 * ตั้ง % เงินประกันผลงาน / วันครบกำหนดคืน
 *
 * % ก่อนลงนามใครก็ตั้งได้ (เป็นส่วนหนึ่งของการร่างสัญญา) · หลังลงนามเฉพาะ OWNER — กรณีสัญญากระดาษ
 * มีข้อนี้อยู่จริงแต่ในระบบยังไม่ได้ตั้ง · มีผลกับเงินที่รับหลังจากนี้เท่านั้น ยอดที่บันทึกไปแล้วไม่ถูกแก้ย้อนหลัง
 * วันครบกำหนดคืนเป็นงานติดตามเงิน ตั้งได้หลังลงนามเท่านั้น (ก่อนนั้นยังไม่มีอะไรให้คืน)
 */
export async function setRetention(
  projectId: string,
  contractId: string,
  input: { pct?: number | null; dueOn?: string | null },
  actor: { id: string; role: string },
) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (contract?.projectId !== projectId) throw new ContractError("ไม่พบสัญญาที่ระบุ", 404);

  const data: { retentionPct?: number | null; retentionSetAt?: Date; retentionDueOn?: Date | null } = {};
  const before = {
    pct: contract.retentionPct == null ? null : Number(contract.retentionPct),
    dueOn: toIsoDate(contract.retentionDueOn),
  };

  if (input.pct !== undefined) {
    const pct = input.pct === 0 ? null : input.pct;
    if (pct !== before.pct) {
      if (contract.signedAt && actor.role !== "OWNER") {
        throw new ContractError(
          "สัญญาลงนามแล้ว — เฉพาะเจ้าของกิจการที่ตั้งเงินประกันผลงานได้ (เมื่อสัญญาที่เซ็นมีข้อนี้จริง)",
          403,
        );
      }
      data.retentionPct = pct;
      data.retentionSetAt = new Date();
    }
  }
  if (input.dueOn !== undefined) {
    if (!contract.signedAt) {
      throw new ContractError("ตั้งวันคืนเงินประกันได้หลังลงนามสัญญาแล้ว", 409);
    }
    let parsed: Date | null = null;
    if (input.dueOn != null) {
      parsed = parseIsoDate(input.dueOn);
      if (!parsed) throw new ContractError("รูปแบบวันที่ไม่ถูกต้อง", 400);
    }
    data.retentionDueOn = parsed;
  }

  let updated = contract;
  if (Object.keys(data).length > 0) {
    updated = await prisma.contract.update({ where: { id: contractId }, data });
    await writeAuditLog({
      userId: actor.id,
      action: "SET_CONTRACT_RETENTION",
      entityType: "Contract",
      entityId: contractId,
      details: {
        projectId,
        contractNo: contract.contractNo,
        from: before,
        to: {
          pct: updated.retentionPct == null ? null : Number(updated.retentionPct),
          dueOn: toIsoDate(updated.retentionDueOn),
        },
        afterSigning: Boolean(contract.signedAt),
      },
    });
  }

  return {
    contract: updated,
    payments: updated.signedAt ? await getContractPayments(projectId, contractId) : null,
  };
}

function validateRelease(input: { paidOn: string; amount: number; withholdingAmount: number }) {
  return validatePayment({ ...input, retentionAmount: 0 });
}

/**
 * บันทึกการรับคืนเงินประกันผลงาน — รับเกินยอดที่กันไว้ได้ (ขึ้นว่า "คืนเกิน") เหตุผลเดียวกับการรับเงินงวด
 * แต่ต้องมีเงินประกันถูกกันไว้จริงก่อน ไม่งั้นคือการบันทึกเงินผิดที่
 */
export async function recordRetentionRelease(
  projectId: string,
  contractId: string,
  input: RecordPaymentInput,
  actorId: string,
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const paidOn = validateRelease(input);
  const held = await prisma.installmentPayment.aggregate({
    where: { installment: { contractId } },
    _sum: { retentionAmount: true },
  });
  if (Number(held._sum.retentionAmount ?? 0) <= 0) {
    throw new ContractError("ยังไม่มีเงินประกันผลงานถูกกันไว้ในสัญญานี้ จึงไม่มีอะไรให้รับคืน", 409);
  }

  const created = await prisma.retentionRelease.create({
    data: {
      contractId,
      paidOn,
      amount: input.amount,
      withholdingAmount: input.withholdingAmount,
      method: input.method,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      recordedById: actorId,
    },
  });
  await writeAuditLog({
    userId: actorId,
    action: "RECORD_RETENTION_RELEASE",
    entityType: "Contract",
    entityId: contractId,
    details: {
      projectId,
      contractNo: contract.contractNo,
      releaseId: created.id,
      paidOn: input.paidOn,
      amount: input.amount,
      withholdingAmount: input.withholdingAmount,
      method: input.method,
    },
  });
  return getContractPayments(projectId, contractId);
}

async function getReleaseOrThrow(contractId: string, releaseId: string) {
  const release = await prisma.retentionRelease.findUnique({ where: { id: releaseId } });
  if (release?.contractId !== contractId) throw new ContractError("ไม่พบรายการรับคืนเงินประกันที่ระบุ", 404);
  return release;
}

async function assertNoActiveReleaseReceipt(releaseId: string) {
  const receipt = await prisma.billingDocument.findFirst({
    where: { retentionReleaseId: releaseId, type: "RECEIPT", voidedAt: null },
    select: { docNo: true },
  });
  if (receipt) {
    throw new ContractError(
      `รายการนี้ออกใบเสร็จ ${receipt.docNo} ไปแล้ว — ยกเลิกใบเสร็จก่อนจึงจะแก้หรือลบได้`,
      409,
    );
  }
}

export async function updateRetentionRelease(
  projectId: string,
  contractId: string,
  releaseId: string,
  input: UpdatePaymentInput,
  actor: { id: string; role: string },
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const release = await getReleaseOrThrow(contractId, releaseId);
  assertCanModify(release, actor.id, actor.role);
  await assertNoActiveReleaseReceipt(releaseId);
  const paidOn = validateRelease(input);

  await prisma.retentionRelease.update({
    where: { id: releaseId },
    data: {
      paidOn,
      amount: input.amount,
      withholdingAmount: input.withholdingAmount,
      method: input.method,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
    },
  });
  await writeAuditLog({
    userId: actor.id,
    action: "UPDATE_RETENTION_RELEASE",
    entityType: "Contract",
    entityId: contractId,
    details: {
      projectId,
      contractNo: contract.contractNo,
      releaseId,
      from: { paidOn: toIsoDate(release.paidOn), amount: Number(release.amount) },
      to: { paidOn: input.paidOn, amount: input.amount },
    },
  });
  return getContractPayments(projectId, contractId);
}

export async function deleteRetentionRelease(
  projectId: string,
  contractId: string,
  releaseId: string,
  actor: { id: string; role: string },
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const release = await getReleaseOrThrow(contractId, releaseId);
  assertCanModify(release, actor.id, actor.role);
  await assertNoActiveReleaseReceipt(releaseId);

  await prisma.retentionRelease.delete({ where: { id: releaseId } });
  await writeAuditLog({
    userId: actor.id,
    action: "DELETE_RETENTION_RELEASE",
    entityType: "Contract",
    entityId: contractId,
    details: {
      projectId,
      contractNo: contract.contractNo,
      releaseId,
      paidOn: toIsoDate(release.paidOn),
      amount: Number(release.amount),
      withholdingAmount: Number(release.withholdingAmount),
    },
  });
  return getContractPayments(projectId, contractId);
}
