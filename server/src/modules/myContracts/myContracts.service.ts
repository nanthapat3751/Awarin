import {
  contractPaymentSummary,
  installmentProgress,
  retentionBalance,
  type CustomerBillingDocDto,
  type CustomerContractDto,
  type CustomerContractPaymentDto,
  type CustomerRetentionDto,
} from "@systemboq/shared-types";

import { todayIso, toIsoDate } from "../../lib/business-date";
import { paymentAccountFrom } from "../../lib/company-fields";
import { isValidPromptPayId, promptPayQrDataUrl } from "../../lib/promptpay";
import { getSettingsMap } from "../../lib/settings";
import { prisma } from "../../lib/prisma";
import { installmentDueAmounts, renderBillingDoc } from "../contracts/billing-docs.service";
import { getSignedContractOrThrow } from "../contracts/payments.service";
import { asCustomerSees, CUSTOMER_NOTICE_SELECT, toCustomerNotice } from "./notice-view";
import { contractCurrentTotals, customerChangeOrders } from "../contracts/change-orders.service";
import { canNotifyInstallment } from "../contracts/payment-notices.service";
import { generateContractPdf } from "../contracts/contracts.service";

export class MyContractError extends Error {
  status: number;

  constructor(message: string, status = 404) {
    super(message);
    this.name = "MyContractError";
    this.status = status;
  }
}

type NoticeRow = {
  id: string;
  paidOn: Date;
  amount: unknown;
  status: "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";
  rejectReason: string | null;
  slipStatus: string | null;
  createdAt: Date;
  evidence: { id: string; fileName: string }[];
  payment: { verifiedAt: Date | null } | null;
  slipChecks: { status: string; amount: unknown }[];
};

type InstallmentRow = {
  id: string;
  seq: number;
  milestone: string;
  amount: unknown;
  dueOn: Date | null;
  payments: { paidOn: Date; amount: unknown; withholdingAmount: unknown; retentionAmount: unknown }[];
  billingDocuments?: DocRow[];
  /** การแจ้งโอนล่าสุดของงวด (เอามาแค่ตัวเดียว) */
  paymentNotices?: NoticeRow[];
};

type DocRow = {
  id: string;
  type: "INVOICE" | "RECEIPT";
  isTaxInvoice: boolean;
  docNo: string;
  issuedOn: Date;
};

/** ส่วนเงินประกันผลงานของสัญญา — ข้อมูลดิบที่ toCustomerPaymentDto ต้องใช้ */
type RetentionRows = {
  pct: unknown;
  dueOn: Date | null;
  releases: { amount: unknown; withholdingAmount: unknown }[];
  documents: DocRow[];
};

function toDocDto(d: DocRow): CustomerBillingDocDto {
  return { id: d.id, type: d.type, isTaxInvoice: d.isTaxInvoice, docNo: d.docNo, issuedOn: toIsoDate(d.issuedOn)! };
}

const paymentsOf = (row: InstallmentRow) =>
  row.payments.map((p) => ({
    amount: Number(p.amount),
    withholdingAmount: Number(p.withholdingAmount),
    retentionAmount: Number(p.retentionAmount),
  }));

/**
 * เงินประกันผลงานในมุมลูกค้า — โชว์เมื่อสัญญามี % หรือเคยถูกกันจริงแล้วเท่านั้น
 * ไม่มีเลยคืน null (ไม่ต้องขึ้นบรรทัด "เงินประกัน 0 บาท" ในสัญญาที่ไม่มีข้อนี้)
 */
export function toCustomerRetention(rows: InstallmentRow[], retention: RetentionRows, today: string): CustomerRetentionDto | null {
  const held = rows.reduce((sum, r) => sum + r.payments.reduce((s, p) => s + Number(p.retentionAmount), 0), 0);
  const pct = retention.pct == null ? null : Number(retention.pct);
  if (pct == null && held <= 0) return null;
  const balance = retentionBalance({
    held,
    releases: retention.releases.map((r) => ({ amount: Number(r.amount), withholdingAmount: Number(r.withholdingAmount) })),
    dueOn: toIsoDate(retention.dueOn),
    today,
  });
  return {
    pct,
    held: balance.held,
    released: balance.released,
    outstanding: balance.outstanding,
    dueOn: toIsoDate(retention.dueOn),
    documents: retention.documents.map(toDocDto),
  };
}

/**
 * สถานะการชำระเงินในมุมลูกค้า — **เฉพาะสัญญาที่ลงนามแล้ว**
 *
 * ฉบับที่ยังไม่ลงนามคืนค่า null เสมอ เพราะยังไม่มีข้อผูกพันให้ชำระ และโครงการหนึ่งออกฉบับร่าง
 * ค้างไว้ได้หลายฉบับพร้อมกัน (ตอนนี้มีโครงการหนึ่งที่ค้างอยู่สี่ฉบับ ยอดเท่ากันหมด)
 * ถ้าโชว์ยอดค้างของทุกฉบับ ลูกค้าจะเห็นหนี้ซ้ำสี่รอบ
 */
function toCustomerPaymentDto(
  signedAt: Date | null,
  rows: InstallmentRow[],
  retention: RetentionRows,
  today: string,
): CustomerContractPaymentDto | null {
  if (!signedAt || rows.length === 0) return null;

  const summary = contractPaymentSummary(
    rows.map((r) => ({ amount: Number(r.amount), dueOn: toIsoDate(r.dueOn), payments: paymentsOf(r) })),
    today,
  );

  return {
    planTotal: summary.planTotal,
    paidAmount: summary.paidAmount,
    remaining: summary.remaining,
    paidCount: summary.paidCount,
    totalCount: summary.totalCount,
    retention: toCustomerRetention(rows, retention, today),
    installments: rows.map((row) => {
      const progress = installmentProgress({
        amount: Number(row.amount),
        dueOn: toIsoDate(row.dueOn),
        today,
        payments: paymentsOf(row),
      });
      // เรียงจากเซิร์ฟเวอร์มาตามวันที่รับอยู่แล้ว ตัวสุดท้ายจึงเป็นครั้งล่าสุด
      const last = row.payments.at(-1);
      const docs = row.billingDocuments ?? [];
      const latest = row.paymentNotices?.[0];
      return {
        id: row.id,
        seq: row.seq,
        milestone: row.milestone,
        amount: String(row.amount),
        dueOn: toIsoDate(row.dueOn),
        status: progress.status,
        statusLabel: progress.statusLabel,
        paidAmount: progress.paidAmount,
        remaining: progress.remaining,
        lastPaidOn: last ? toIsoDate(last.paidOn) : null,
        daysOverdue: progress.daysOverdue,
        documents: docs.map(toDocDto),
        notice: toCustomerNotice(latest),
        payQr: null,
        canNotify: canNotifyInstallment({
          remaining: progress.remaining,
          dueOn: row.dueOn,
          hasInvoice: docs.some((d) => d.type === "INVOICE"),
          hasPendingNotice: latest?.status === "PENDING",
        }),
      };
    }),
  };
}

/**
 * QR พร้อมเพย์ของงวดที่ลูกค้าต้องโอนตอนนี้ — ยอดในสูตรเดียวกับ "ยอดโอนสุทธิ" ของใบแจ้งหนี้
 * (หักเงินประกันและภาษี ณ ที่จ่ายแล้ว) ทำเฉพาะงวดที่แจ้งโอนได้ ไม่งั้น QR ของงวดที่ยังไม่เรียกเก็บ
 * จะชวนให้จ่ายก่อนเวลา
 */
async function attachPayQr(
  payment: CustomerContractPaymentDto,
  contract: { id: string; projectId: string; installments?: InstallmentRow[] },
  promptPay: string,
): Promise<void> {
  const payable = payment.installments.filter((i) => i.canNotify);
  if (payable.length === 0) return;
  const signed = await getSignedContractOrThrow(contract.projectId, contract.id);
  for (const item of payable) {
    const row = contract.installments?.find((r) => r.id === item.id);
    if (!row) continue;
    const paid = row.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const { net } = await installmentDueAmounts(signed, { id: row.id, amount: row.amount }, paid);
    if (net > 0) item.payQr = { amount: net, dataUrl: await promptPayQrDataUrl(promptPay, net) };
  }
}

async function toCustomerContractDto(
  contract: {
    id: string;
    projectId: string;
    contractNo: string;
    signedAt: Date | null;
    createdAt: Date;
    amount: unknown;
    vatAmount: unknown;
    retentionPct: unknown;
    retentionDueOn: Date | null;
    project: { projectNo: string; name: string };
    installments?: InstallmentRow[];
    retentionReleases?: { amount: unknown; withholdingAmount: unknown }[];
    billingDocuments?: DocRow[];
  },
  today: string,
  promptPay: string | null = null,
): Promise<CustomerContractDto> {
  // ใบงานเพิ่ม-ลดมีได้เฉพาะสัญญาที่ลงนามแล้ว · ฉบับร่างไม่มีมูลค่า "ปัจจุบัน" ให้โชว์
  const current = contract.signedAt ? await contractCurrentTotals(contract) : { amount: null };
  return {
    currentAmount: current.amount == null ? null : current.amount.toFixed(2),
    contractAmount: contract.amount == null ? null : Number(contract.amount).toFixed(2),
    changeOrders: contract.signedAt ? await customerChangeOrders(contract.id, contract.amount) : [],
    id: contract.id,
    contractNo: contract.contractNo,
    signedAt: contract.signedAt ? contract.signedAt.toISOString() : null,
    createdAt: contract.createdAt.toISOString(),
    project: { projectNo: contract.project.projectNo, name: contract.project.name },
    payment: await withPayQr(
      toCustomerPaymentDto(
      contract.signedAt,
      contract.installments ?? [],
      {
        pct: contract.retentionPct,
        dueOn: contract.retentionDueOn,
        releases: contract.retentionReleases ?? [],
        documents: contract.billingDocuments ?? [],
      },
      today,
      ),
    ),
  };

  async function withPayQr(payment: CustomerContractPaymentDto | null) {
    if (payment && promptPay) await attachPayQr(payment, contract, promptPay);
    return payment;
  }
}

export async function listMyContracts(customerId: string) {
  const contracts = await prisma.contract.findMany({
    where: { project: { customerId } },
    include: {
      project: { select: { projectNo: true, name: true } },
      installments: {
        orderBy: { seq: "asc" },
        select: {
          id: true,
          seq: true,
          milestone: true,
          amount: true,
          dueOn: true,
          // ลูกค้าเห็นเฉพาะเงินที่บริษัทยืนยันกับบัญชีธนาคารแล้ว
          payments: {
            where: { verifiedAt: { not: null } },
            orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
            select: { paidOn: true, amount: true, withholdingAmount: true, retentionAmount: true },
          },
          // ใบที่ถูกยกเลิกไม่ถึงมือลูกค้า — ลูกค้าได้รับแจ้งการยกเลิกทางกระดิ่งแล้ว
          billingDocuments: {
            where: { voidedAt: null },
            orderBy: { createdAt: "asc" },
            select: { id: true, type: true, isTaxInvoice: true, docNo: true, issuedOn: true },
          },
          paymentNotices: { orderBy: { createdAt: "desc" }, take: 1, select: CUSTOMER_NOTICE_SELECT },
        },
      },
      retentionReleases: { select: { amount: true, withholdingAmount: true } },
      // ใบคืนเงินประกันผลงานไม่ผูกงวด — ดึงแยกจากระดับสัญญา
      billingDocuments: {
        where: { forRetention: true, voidedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, isTaxInvoice: true, docNo: true, issuedOn: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  for (const c of contracts) for (const i of c.installments) i.paymentNotices = i.paymentNotices.map(asCustomerSees);
  const today = todayIso();
  // QR ขึ้นเมื่อบริษัทตั้งบัญชีรับเงินครบ + เลขพร้อมเพย์ถูกรูปแบบ (ที่เดียวกับที่พิมพ์ลงใบแจ้งหนี้)
  const promptPay = paymentAccountFrom(await getSettingsMap())?.promptPay ?? null;
  const usable = isValidPromptPayId(promptPay) ? promptPay : null;
  return Promise.all(contracts.map((c) => toCustomerContractDto(c, today, usable)));
}

async function getOwnedContractOrThrow(customerId: string, contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { project: { select: { customerId: true } } },
  });
  if (contract?.project.customerId !== customerId) {
    throw new MyContractError("ไม่พบสัญญาที่ระบุ");
  }
  return contract;
}

export async function generateMyContractPdf(
  customerId: string,
  contractId: string,
): Promise<Uint8Array> {
  const contract = await getOwnedContractOrThrow(customerId, contractId);
  // ผ่านการตรวจเจ้าของแล้ว จึงใช้ตัวสร้าง PDF เดียวกับฝั่งพนักงานได้ (เอกสารเดียวกัน)
  return generateContractPdf(contract.projectId, contractId);
}

/** ใบแจ้งหนี้/ใบเสร็จของสัญญาลูกค้าเอง — เฉพาะใบที่ยังไม่ถูกยกเลิก */
export async function generateMyBillingDocPdf(
  customerId: string,
  contractId: string,
  docId: string,
): Promise<{ docNo: string; bytes: Uint8Array }> {
  await getOwnedContractOrThrow(customerId, contractId);
  const doc = await prisma.billingDocument.findUnique({ where: { id: docId } });
  if (doc?.contractId !== contractId || doc.voidedAt) {
    throw new MyContractError("ไม่พบเอกสารที่ระบุ");
  }
  // ลูกค้าได้ต้นฉบับอย่างเดียว — สำเนาเป็นของบริษัท
  return { docNo: doc.docNo, bytes: await renderBillingDoc(doc, "ORIGINAL") };
}
