import {
  contractPaymentSummary,
  installmentProgress,
  type CustomerContractDto,
  type CustomerContractPaymentDto,
} from "@systemboq/shared-types";

import { todayIso, toIsoDate } from "../../lib/business-date";
import { prisma } from "../../lib/prisma";
import { generateContractPdf } from "../contracts/contracts.service";

export class MyContractError extends Error {
  status: number;

  constructor(message: string, status = 404) {
    super(message);
    this.name = "MyContractError";
    this.status = status;
  }
}

type InstallmentRow = {
  seq: number;
  milestone: string;
  amount: unknown;
  dueOn: Date | null;
  payments: { paidOn: Date; amount: unknown; withholdingAmount: unknown }[];
};

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
  today: string,
): CustomerContractPaymentDto | null {
  if (!signedAt || rows.length === 0) return null;

  const summary = contractPaymentSummary(
    rows.map((r) => ({
      amount: Number(r.amount),
      dueOn: toIsoDate(r.dueOn),
      payments: r.payments.map((p) => ({
        amount: Number(p.amount),
        withholdingAmount: Number(p.withholdingAmount),
      })),
    })),
    today,
  );

  return {
    planTotal: summary.planTotal,
    paidAmount: summary.paidAmount,
    remaining: summary.remaining,
    paidCount: summary.paidCount,
    totalCount: summary.totalCount,
    installments: rows.map((row) => {
      const progress = installmentProgress({
        amount: Number(row.amount),
        dueOn: toIsoDate(row.dueOn),
        today,
        payments: row.payments.map((p) => ({
          amount: Number(p.amount),
          withholdingAmount: Number(p.withholdingAmount),
        })),
      });
      // เรียงจากเซิร์ฟเวอร์มาตามวันที่รับอยู่แล้ว ตัวสุดท้ายจึงเป็นครั้งล่าสุด
      const last = row.payments.at(-1);
      return {
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
      };
    }),
  };
}

function toCustomerContractDto(
  contract: {
    id: string;
    contractNo: string;
    signedAt: Date | null;
    createdAt: Date;
    project: { projectNo: string; name: string };
    installments?: InstallmentRow[];
  },
  today: string,
): CustomerContractDto {
  return {
    id: contract.id,
    contractNo: contract.contractNo,
    signedAt: contract.signedAt ? contract.signedAt.toISOString() : null,
    createdAt: contract.createdAt.toISOString(),
    project: { projectNo: contract.project.projectNo, name: contract.project.name },
    payment: toCustomerPaymentDto(contract.signedAt, contract.installments ?? [], today),
  };
}

export async function listMyContracts(customerId: string) {
  const contracts = await prisma.contract.findMany({
    where: { project: { customerId } },
    include: {
      project: { select: { projectNo: true, name: true } },
      installments: {
        orderBy: { seq: "asc" },
        select: {
          seq: true,
          milestone: true,
          amount: true,
          dueOn: true,
          payments: {
            orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
            select: { paidOn: true, amount: true, withholdingAmount: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const today = todayIso();
  return contracts.map((c) => toCustomerContractDto(c, today));
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
