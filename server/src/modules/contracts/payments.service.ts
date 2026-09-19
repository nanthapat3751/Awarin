import {
  contractPaymentSummary,
  installmentProgress,
  type ContractPaymentsViewDto,
  type InstallmentPaymentDto,
  type InstallmentWithPaymentsDto,
} from "@systemboq/shared-types";

import { writeAuditLog } from "../../lib/audit-log";
import { billingPartyOf, splitWithholding, withholdingFor } from "../../lib/billing-party";
import { parseIsoDate, todayIso, toIsoDate } from "../../lib/business-date";
import { prisma } from "../../lib/prisma";
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
  method: "TRANSFER" | "CASH" | "CHEQUE" | "OTHER";
  reference: string | null;
  note: string | null;
  recordedById: string | null;
  createdAt: Date;
  recordedBy: { fullName: string } | null;
};

function toPaymentDto(row: PaymentRow): InstallmentPaymentDto {
  return {
    id: row.id,
    installmentId: row.installmentId,
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

async function getSignedContractOrThrow(projectId: string, contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      project: {
        select: {
          id: true,
          projectNo: true,
          name: true,
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

export async function getContractPayments(
  projectId: string,
  contractId: string,
): Promise<ContractPaymentsViewDto> {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const rows = await prisma.contractInstallment.findMany({
    where: { contractId },
    orderBy: { seq: "asc" },
    include: {
      payments: {
        orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
        include: { recordedBy: { select: { fullName: true } } },
      },
    },
  });

  const today = todayIso();
  const contractAmount = contract.amount != null ? Number(contract.amount) : null;

  // ภาษีหัก ณ ที่จ่ายรายงวด — คิดจากฐานที่ตรึงไว้กับสัญญาฉบับนี้ ไม่ใช่เวอร์ชันล่าสุดของโครงการ
  // ซึ่งขยับได้ถ้ามีการสร้างเวอร์ชันใหม่ทีหลัง (ดูคอมเมนต์ Contract.vatAmount)
  const party = billingPartyOf(contract.project.customer, contract.project.customer?.customerProfile);
  const withholding =
    contractAmount != null
      ? withholdingFor(party, contractAmount, contract.vatAmount == null ? null : Number(contract.vatAmount))
      : null;
  const perInstallment =
    withholding != null && contractAmount != null
      ? splitWithholding(
          withholding,
          contractAmount,
          rows.map((r) => ({ amount: Number(r.amount) })),
        )
      : [];

  const installments: InstallmentWithPaymentsDto[] = rows.map((row, index) => {
    const payments = row.payments.map(toPaymentDto);
    return {
      id: row.id,
      seq: row.seq,
      milestone: row.milestone,
      amount: String(row.amount),
      dueOn: toIsoDate(row.dueOn),
      progress: installmentProgress({
        amount: Number(row.amount),
        dueOn: toIsoDate(row.dueOn),
        today,
        payments: row.payments.map((p) => ({
          amount: Number(p.amount),
          withholdingAmount: Number(p.withholdingAmount),
        })),
      }),
      expectedWithholding: perInstallment[index]?.tax ?? null,
      payments,
    };
  });

  return {
    contractId: contract.id,
    contractNo: contract.contractNo,
    signedAt: contract.signedAt?.toISOString() ?? null,
    contractAmount,
    hasPlan: rows.length > 0,
    today,
    installments,
    summary: contractPaymentSummary(
      rows.map((r) => ({
        amount: Number(r.amount),
        dueOn: toIsoDate(r.dueOn),
        payments: r.payments.map((p) => ({
          amount: Number(p.amount),
          withholdingAmount: Number(p.withholdingAmount),
        })),
      })),
      today,
    ),
  };
}

async function getInstallmentOrThrow(contractId: string, installmentId: string) {
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
function validatePayment(input: { paidOn: string; amount: number; withholdingAmount: number }) {
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
  return paidOn;
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

  const created = await prisma.installmentPayment.create({
    data: {
      installmentId,
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
      method: input.method,
    },
  });

  return getContractPayments(projectId, contractId);
}

async function getPaymentOrThrow(contractId: string, paymentId: string) {
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
 * แก้/ลบได้เฉพาะคนที่บันทึกเอง หรือเจ้าของกิจการ — แพตเทิร์นเดียวกับบันทึกการติดต่อลูกค้า
 * ของเดิมไม่หายไปไหนเพราะทุกการแก้และลบเขียนยอดเก่าลง AuditLog ซึ่งแก้ย้อนหลังไม่ได้
 */
function assertCanModify(payment: { recordedById: string | null }, actorId: string, actorRole: string) {
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
  const paidOn = validatePayment(input);

  await prisma.installmentPayment.update({
    where: { id: paymentId },
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
    action: "UPDATE_INSTALLMENT_PAYMENT",
    entityType: "Contract",
    entityId: contractId,
    details: {
      projectId,
      contractNo: contract.contractNo,
      seq: payment.installment.seq,
      paymentId,
      // ยอดเดิมต้องอยู่ในบันทึกด้วย ไม่งั้นการแก้ตัวเลขเงินย้อนหลังจะไม่เหลือร่องรอยว่าแก้จากเท่าไร
      from: { paidOn: toIsoDate(payment.paidOn), amount: Number(payment.amount) },
      to: { paidOn: input.paidOn, amount: input.amount },
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

  await prisma.installmentPayment.delete({ where: { id: paymentId } });
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
    },
  });

  return getContractPayments(projectId, contractId);
}
