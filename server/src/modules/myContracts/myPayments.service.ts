import {
  installmentProgress,
  type CustomerBillingDocDto,
  type CustomerContractRetentionDto,
  type CustomerDueItemDto,
  type CustomerInstallmentOptionDto,
  type CustomerPaymentDetailDto,
  type CustomerPaymentHistoryDto,
  type CustomerPaymentNoticeDto,
  type CustomerPaymentScheduleDto,
  type CustomerPaymentsDto,
  type CustomerUpcomingDto,
} from "@systemboq/shared-types";

import { todayIso, toIsoDate } from "../../lib/business-date";
import { paymentAccountFrom } from "../../lib/company-fields";
import { round2 } from "../../lib/pricing";
import { prisma } from "../../lib/prisma";
import { isValidPromptPayId, promptPayQrDataUrl } from "../../lib/promptpay";
import { getSettingsMap } from "../../lib/settings";
import { installmentDueAmounts } from "../contracts/billing-docs.service";
import { canNotifyInstallment } from "../contracts/payment-notices.service";
import { getSignedContractOrThrow } from "../contracts/payments.service";
import { MyContractError, toCustomerRetention } from "./myContracts.service";
import { asCustomerSees, CUSTOMER_NOTICE_SELECT, toCustomerNotice } from "./notice-view";

/**
 * หน้าการชำระเงินของลูกค้า — รวมทุกสัญญาที่ลงนามแล้วไว้ที่เดียว
 *
 * ต้องชำระ = งวดที่บริษัทเรียกเก็บแล้ว (วางบิล หรือตั้งวันครบกำหนด) และยังค้าง
 * ยอดที่แสดงคือ "ยอดที่ต้องโอนจริง" สูตรเดียวกับใบแจ้งหนี้ (ดู installmentDueAmounts) ไม่ใช่ยอดงวดเต็ม
 * งวดที่ยังไม่เรียกเก็บแสดงเป็น "งวดถัดไป" เฉย ๆ ไม่มีปุ่มจ่าย — ไม่ชวนจ่ายก่อนเวลา
 */

const DOC_SELECT = { id: true, type: true, isTaxInvoice: true, docNo: true, issuedOn: true, paymentId: true } as const;

const INSTALLMENT_INCLUDE = {
  // ลูกค้าเห็นเฉพาะเงินที่บริษัทยืนยันกับบัญชีธนาคารแล้ว — รายการที่เพิ่งบันทึกอาจผิด (กดผิดงวด/พิมพ์ผิด)
  payments: {
    where: { verifiedAt: { not: null } },
    orderBy: [{ paidOn: "asc" as const }, { createdAt: "asc" as const }],
    select: { id: true, paidOn: true, amount: true, withholdingAmount: true, retentionAmount: true },
  },
  // ใบที่ถูกยกเลิกไม่ถึงมือลูกค้า
  billingDocuments: { where: { voidedAt: null }, orderBy: { createdAt: "asc" as const }, select: DOC_SELECT },
  paymentNotices: { orderBy: { createdAt: "desc" as const }, take: 1, select: CUSTOMER_NOTICE_SELECT },
};

type DocRow = { id: string; type: "INVOICE" | "RECEIPT"; isTaxInvoice: boolean; docNo: string; issuedOn: Date; paymentId: string | null };

function toDoc(d: DocRow): CustomerBillingDocDto {
  return { id: d.id, type: d.type, isTaxInvoice: d.isTaxInvoice, docNo: d.docNo, issuedOn: toIsoDate(d.issuedOn)! };
}

async function loadContracts(customerId: string, installmentId?: string) {
  const rows = await prisma.contract.findMany({
    where: {
      signedAt: { not: null },
      project: { customerId, deletedAt: null },
      ...(installmentId ? { installments: { some: { id: installmentId } } } : {}),
    },
    orderBy: { signedAt: "asc" },
    include: {
      project: { select: { name: true } },
      installments: { orderBy: { seq: "asc" }, include: INSTALLMENT_INCLUDE },
      // เงินประกันผลงาน — ส่วนเดียวกับหน้าสัญญาเดิม (ใบคืนเงินประกันไม่ผูกงวด ดึงจากระดับสัญญา)
      retentionReleases: { select: { amount: true, withholdingAmount: true } },
      billingDocuments: {
        where: { forRetention: true, voidedAt: null },
        orderBy: { createdAt: "asc" },
        select: DOC_SELECT,
      },
    },
  });
  for (const c of rows) for (const i of c.installments) i.paymentNotices = i.paymentNotices.map(asCustomerSees);
  return rows;
}


type ContractRow = Awaited<ReturnType<typeof loadContracts>>[number];
type InstallmentRow = ContractRow["installments"][number];

function progressOf(row: InstallmentRow, today: string) {
  return installmentProgress({
    amount: Number(row.amount),
    dueOn: toIsoDate(row.dueOn),
    today,
    payments: row.payments.map((p) => ({
      amount: Number(p.amount),
      withholdingAmount: Number(p.withholdingAmount),
      retentionAmount: Number(p.retentionAmount),
    })),
  });
}

function noticeOf(row: InstallmentRow): CustomerPaymentNoticeDto | null {
  return toCustomerNotice(row.paymentNotices[0]);
}

/** เรียกเก็บแล้วหรือยัง — วางบิลแล้ว หรือบริษัทตั้งวันครบกำหนดให้แล้ว */
function isBilled(row: InstallmentRow): boolean {
  return row.dueOn != null || row.billingDocuments.some((d) => d.type === "INVOICE");
}

async function dueItemOf(
  contract: ContractRow,
  row: InstallmentRow,
  today: string,
  signed: Awaited<ReturnType<typeof getSignedContractOrThrow>>,
) {
  const progress = progressOf(row, today);
  const paidBefore = progress.paidAmount;
  const amounts = await installmentDueAmounts(signed, { id: row.id, amount: row.amount }, Math.min(paidBefore, Number(row.amount)));
  const invoice = row.billingDocuments.find((d) => d.type === "INVOICE");
  const notice = noticeOf(row);
  const item: CustomerDueItemDto = {
    installmentId: row.id,
    contractId: contract.id,
    contractNo: contract.contractNo,
    projectName: contract.project.name,
    seq: row.seq,
    milestone: row.milestone,
    installmentAmount: Number(row.amount),
    remaining: progress.remaining,
    amountToPay: Math.max(0, amounts.net),
    dueOn: toIsoDate(row.dueOn),
    daysOverdue: progress.daysOverdue,
    invoice: invoice ? toDoc(invoice) : null,
    notice,
    canNotify: canNotifyInstallment({
      remaining: progress.remaining,
      dueOn: row.dueOn,
      hasInvoice: Boolean(invoice),
      hasPendingNotice: notice?.status === "PENDING",
    }),
  };
  return { item, amounts, progress };
}

type MyContract = Awaited<ReturnType<typeof loadContracts>>[number];

/** เงินประกันผลงานของสัญญาหนึ่งฉบับ (null = สัญญานี้ไม่มีเงินประกัน) */
function contractRetentionOf(contract: MyContract, today: string): CustomerContractRetentionDto | null {
  const retention = toCustomerRetention(
    contract.installments,
    {
      pct: contract.retentionPct,
      dueOn: contract.retentionDueOn,
      releases: contract.retentionReleases,
      documents: contract.billingDocuments,
    },
    today,
  );
  return retention ? { contractId: contract.id, contractNo: contract.contractNo, projectName: contract.project.name, retention } : null;
}

/** ประวัติการชำระของงวดหนึ่ง — แต่ละรายการพร้อมใบเสร็จของมันและใบแจ้งหนี้ของงวด */
function paymentHistoryOf(contract: MyContract, row: MyContract["installments"][number]): CustomerPaymentHistoryDto[] {
  const receipts = row.billingDocuments.filter((d) => d.type === "RECEIPT");
  const invoice = row.billingDocuments.find((d) => d.type === "INVOICE");
  return row.payments.map((pay) => {
    const receipt = receipts.find((d) => d.paymentId === pay.id);
    return {
      id: pay.id,
      installmentId: row.id,
      contractId: contract.id,
      contractNo: contract.contractNo,
      projectName: contract.project.name,
      seq: row.seq,
      milestone: row.milestone,
      paidOn: toIsoDate(pay.paidOn)!,
      amount: Number(pay.amount),
      receipt: receipt ? toDoc(receipt) : null,
      invoice: invoice ? toDoc(invoice) : null,
    };
  });
}

export async function listMyPayments(customerId: string): Promise<CustomerPaymentsDto> {
  const today = todayIso();
  const contracts = await loadContracts(customerId);
  const due: CustomerDueItemDto[] = [];
  const upcoming: CustomerUpcomingDto[] = [];
  const history: CustomerPaymentHistoryDto[] = [];
  const schedules: CustomerPaymentScheduleDto[] = [];
  const retentions: CustomerContractRetentionDto[] = [];

  for (const contract of contracts) {
    const retention = contractRetentionOf(contract, today);
    if (retention) retentions.push(retention);
    schedules.push({
      contractId: contract.id,
      contractNo: contract.contractNo,
      projectName: contract.project.name,
      installments: contract.installments.map((i) => installmentOptionOf(i, today)),
    });
    const signed = await getSignedContractOrThrow(contract.projectId, contract.id);
    const notBilled: InstallmentRow[] = [];
    for (const row of contract.installments) {
      history.push(...paymentHistoryOf(contract, row));
      if (progressOf(row, today).remaining <= 0) continue;
      if (isBilled(row)) due.push((await dueItemOf(contract, row, today, signed)).item);
      else notBilled.push(row);
    }
    const next = notBilled[0];
    if (next) {
      upcoming.push({
        contractId: contract.id,
        contractNo: contract.contractNo,
        projectName: contract.project.name,
        seq: next.seq,
        milestone: next.milestone,
        amount: Number(next.amount),
        remainingCount: notBilled.length,
      });
    }
  }

  // เกินกำหนดนานสุดก่อน แล้วตามวันครบกำหนด (ไม่มีวัน = ท้าย)
  due.sort(
    (a, b) =>
      (b.daysOverdue ?? -1) - (a.daysOverdue ?? -1) ||
      (a.dueOn ?? "9999-12-31").localeCompare(b.dueOn ?? "9999-12-31"),
  );
  history.sort((a, b) => b.paidOn.localeCompare(a.paidOn));

  return {
    totalToPay: round2(due.reduce((sum, d) => sum + d.amountToPay, 0)),
    overdueCount: due.filter((d) => d.daysOverdue != null).length,
    due,
    upcoming,
    history,
    schedules,
    retentions,
  };
}

/** สถานะของงวดในรายการ "เลือกงวดที่จะชำระ" — ใช้นิยามเดียวกับหน้ารวม (ค้าง/เรียกเก็บแล้ว/แจ้งโอนรอตรวจ) */
function installmentOptionOf(row: InstallmentRow, today: string): CustomerInstallmentOptionDto {
  const progress = progressOf(row, today);
  let state: CustomerInstallmentOptionDto["state"] = "UPCOMING";
  if (progress.remaining <= 0) state = "PAID";
  else if (row.paymentNotices[0]?.status === "PENDING") state = "NOTIFIED";
  else if (isBilled(row)) state = "DUE";
  return {
    installmentId: row.id,
    seq: row.seq,
    milestone: row.milestone,
    amount: Number(row.amount),
    state,
    dueOn: toIsoDate(row.dueOn),
    daysOverdue: state === "DUE" || state === "NOTIFIED" ? progress.daysOverdue : null,
  };
}

/** หน้าจ่ายทีละงวด — ของคนอื่น/ไม่มีอยู่จริง = 404 เหมือนกัน (ไม่บอกว่ามีอยู่) */
export async function getMyPaymentDetail(customerId: string, installmentId: string): Promise<CustomerPaymentDetailDto> {
  const today = todayIso();
  const [contract] = await loadContracts(customerId, installmentId);
  const row = contract?.installments.find((i) => i.id === installmentId);
  if (!contract || !row) throw new MyContractError("ไม่พบงวดที่ระบุ");

  const signed = await getSignedContractOrThrow(contract.projectId, contract.id);
  const { item, amounts, progress } = await dueItemOf(contract, row, today, signed);
  const paid = progress.remaining <= 0;
  const billed = isBilled(row);

  const payTo = paymentAccountFrom(await getSettingsMap());
  const promptPay = payTo?.promptPay;
  const payQr =
    !paid && item.canNotify && isValidPromptPayId(promptPay) && item.amountToPay > 0
      ? { amount: item.amountToPay, dataUrl: await promptPayQrDataUrl(promptPay!, item.amountToPay) }
      : null;

  return {
    ...item,
    paid,
    notBilledYet: !paid && !billed,
    breakdown: { paidBefore: progress.paidAmount, withholding: amounts.withholding, retention: amounts.retention },
    payQr,
    payTo,
    receipts: row.billingDocuments.filter((d) => d.type === "RECEIPT").map(toDoc),
    payments: row.payments.map((p) => ({ id: p.id, paidOn: toIsoDate(p.paidOn)!, amount: Number(p.amount) })),
    installments: contract.installments.map((i) => installmentOptionOf(i, today)),
  };
}
