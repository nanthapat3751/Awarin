import type { Prisma } from "@prisma/client";
import { retentionOf, withholdingAfterRetention } from "@systemboq/shared-types";

import { writeAuditLog } from "../../lib/audit-log";
import {
  billingPartyOf,
  splitByShare,
  splitWithholding,
  withholdingFor,
  type BillingParty,
} from "../../lib/billing-party";
import { parseIsoDate, todayIso } from "../../lib/business-date";
import { loadCompanyProfile } from "../../lib/company-profile";
import { nextDocumentSequence } from "../../lib/document-sequence";
import { createNotification } from "../../lib/notifications";
import { renderBillingDocPdf, type BillingDocEdition } from "../../lib/pdf/billing-doc-pdf";
import { round2 } from "../../lib/pricing";
import { prisma } from "../../lib/prisma";
import { signatureDataUrl } from "../../lib/signature-image";
import { contractCurrentTotals } from "./change-orders.service";
import { ContractError } from "./contracts.service";
import { getContractPayments, getInstallmentOrThrow, getSignedContractOrThrow } from "./payments.service";

/**
 * ใบแจ้งหนี้ (ต่องวด) และใบเสร็จรับเงิน (ต่อรายการรับเงิน)
 *
 * ออกได้เฉพาะสัญญาที่ลงนามแล้ว (ใช้ getSignedContractOrThrow ตัวเดียวกับการรับเงิน) · ตรึงทุกอย่างที่
 * พิมพ์ลงเอกสารไว้ในแถวตอนออก · ออกผิดให้ยกเลิกแล้วออกใหม่ ห้ามลบ ห้ามใช้เลขซ้ำ
 *
 * ใบเสร็จจะเป็น "ใบเสร็จรับเงิน/ใบกำกับภาษี" ก็ต่อเมื่อบริษัทติ๊กว่าจดทะเบียน VAT ไว้ในหน้าตั้งค่าเท่านั้น
 * (มีเลขผู้เสียภาษีไม่ได้แปลว่าจด VAT — นิติบุคคลทุกรายมีเลข) การพิมพ์คำว่าใบกำกับภาษีทั้งที่ไม่ได้จด
 * เป็นความผิดตามประมวลรัษฎากร จึงต้องเป็นการยืนยันของผู้ใช้ ไม่ใช่การอนุมานของระบบ
 *
 * ใบแจ้งหนี้ไม่ใช่ใบกำกับภาษีเสมอ (ความรับผิดในการเสีย VAT ของงานบริการเกิดเมื่อได้รับชำระ ไม่ใช่ตอนวางบิล)
 */

/** 2026-09-30 → 30/9/2569 สำหรับข้อความแจ้งเตือนลูกค้า */
function thaiShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}/${m}/${y + 543}`;
}

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type SignedContract = Awaited<ReturnType<typeof getSignedContractOrThrow>>;

/**
 * ยอด VAT และภาษีหัก ณ ที่จ่ายที่ตกอยู่กับงวดหนึ่ง — แบ่งจากยอดที่ตรึงไว้กับสัญญาฉบับนี้
 * ภาษีหัก ณ ที่จ่ายคิดหลังกันเงินประกันผลงานแล้ว (ส่วนของเงินประกันถูกหักตอนคืน)
 */
async function installmentShares(contract: SignedContract, party: BillingParty, installmentId: string) {
  const installments = await prisma.contractInstallment.findMany({
    where: { contractId: contract.id },
    orderBy: { seq: "asc" },
    select: { id: true, amount: true },
  });
  const index = installments.findIndex((i) => i.id === installmentId);
  // งวดของงานเพิ่ม-ลดรวมอยู่ในผลรวมงวดแล้ว — ฐานที่แบ่งต้องเป็นมูลค่าปัจจุบันด้วย ไม่งั้นสัดส่วนเพี้ยน
  const current = await contractCurrentTotals(contract);
  const contractAmount = current.amount;
  const vat = current.vat;
  if (index < 0 || contractAmount == null) return { vat: null, withholding: null, retentionPct: null };

  const amounts = installments.map((i) => ({ amount: Number(i.amount) }));
  const withholding = withholdingFor(party, contractAmount, vat);
  const installmentAmount = amounts[index].amount;
  const pct = contract.retentionPct == null ? null : Number(contract.retentionPct);
  return {
    vat: vat == null ? null : splitByShare(vat, contractAmount, amounts)[index],
    withholding: withholding
      ? withholdingAfterRetention(
          splitWithholding(withholding, contractAmount, amounts)[index].tax,
          installmentAmount,
          retentionOf(installmentAmount, pct),
        )
      : null,
    retentionPct: pct,
  };
}

/**
 * ยอดของงวดที่ยังต้องเก็บ ณ ตอนนี้ — สูตรเดียวที่ใช้ทั้งพิมพ์ใบแจ้งหนี้และทำ QR พร้อมเพย์ในพอร์ทัล
 * (ถ้าสองที่คิดคนละสูตร ลูกค้าจะเห็นยอดใน QR ไม่ตรงกับ "ยอดโอนสุทธิ" บนใบแจ้งหนี้)
 *
 * due = ยอดงวด − ที่รับแล้ว · หัก ณ ที่จ่ายตามสัดส่วนของส่วนที่ยังต้องจ่าย · เงินประกันกันจากส่วนนั้น
 * net = ที่ลูกค้าต้องโอนจริง = due − เงินประกัน − หัก ณ ที่จ่าย
 */
export async function installmentDueAmounts(
  contract: SignedContract,
  installment: { id: string; amount: unknown },
  paidBefore: number,
) {
  const { party } = customerSnapshot(contract);
  const shares = await installmentShares(contract, party, installment.id);
  const amount = Number(installment.amount);
  const due = round2(amount - paidBefore);
  // รับมาแล้วบางส่วน → หัก ณ ที่จ่ายเฉพาะส่วนที่ยังต้องจ่าย ตามสัดส่วน
  const withholding = shares.withholding == null ? null : round2((shares.withholding * due) / amount);
  // เงินประกันผลงานที่ลูกค้าจะกันไว้จากยอดที่ยังต้องจ่าย — พิมพ์ให้เห็นว่าโอนจริงเท่าไร
  const retention = shares.retentionPct == null ? null : retentionOf(due, shares.retentionPct);
  return { shares, due, withholding, retention, net: round2(due - (retention ?? 0) - (withholding ?? 0)) };
}

/** ผู้ออกเอกสาร ณ ตอนนี้ — ชื่อ ตำแหน่ง และลายเซ็นที่ตั้งไว้ในหน้า "บัญชีของฉัน" */
async function issuerSnapshot(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { fullName: true, jobTitle: true, signature: { select: { png: true } } },
  });
  return {
    issuedById: userId,
    issuedByName: user.fullName,
    issuedByTitle: user.jobTitle,
    signaturePng: user.signature?.png ?? null,
  };
}

/**
 * ผู้ขายที่ตรึงลงใบ — ใบกำกับภาษีต้องมีชื่อ/ที่อยู่/เลขภาษี/สาขาของผู้ประกอบการจดทะเบียน และต้องเป็น
 * ค่า ณ วันออกใบ ไม่ใช่ค่าที่หน้าตั้งค่าเป็นอยู่ตอนกดพิมพ์
 */
function sellerSnapshot(company: Awaited<ReturnType<typeof loadCompanyProfile>>) {
  return {
    sellerName: company.companyName,
    sellerAddress: company.companyAddress,
    sellerTaxId: company.companyTaxId,
    sellerBranch: company.companyBranch,
  };
}

/**
 * ใบเสร็จใบนี้เป็นใบกำกับภาษีด้วยไหม — ต้องจด VAT + รู้ยอด VAT ของก้อนนี้จริง ๆ + มีที่อยู่ผู้ซื้อ
 *
 * ไม่ลดระดับเป็นใบเสร็จธรรมดาเงียบ ๆ เมื่อข้อมูลผู้ซื้อไม่ครบ — ลูกค้าจะได้ใบที่ใช้เครดิตภาษีซื้อไม่ได้
 * โดยไม่มีใครรู้ตัว จึงปฏิเสธพร้อมบอกว่าต้องไปเติมอะไร
 */
function resolveTaxInvoice(
  company: { vatRegistered: boolean },
  vat: number | null,
  party: BillingParty,
): boolean {
  // ยังไม่จด VAT หรือก้อนนี้ไม่มี VAT (สัญญาเก่าที่ไม่รู้ยอด / งานที่ไม่มี VAT) = ใบเสร็จธรรมดา
  if (!company.vatRegistered || vat == null || vat <= 0) return false;
  if (!party.name || !party.address) {
    throw new ContractError(
      "ออกใบกำกับภาษีไม่ได้เพราะยังไม่มีที่อยู่ของผู้ซื้อ — เพิ่มที่อยู่ในแฟ้มลูกค้าก่อน แล้วค่อยออกใบเสร็จ",
      409,
    );
  }
  return true;
}

/**
 * ตรวจล่วงหน้าว่างวดนี้ออกใบเสร็จได้ไหม (กติกาเดียวกับ issueReceipt) — ใช้ก่อน "ยืนยัน & ออกใบเสร็จ" คลิกเดียว
 * จะได้ไม่บันทึกรับเงินไปครึ่งทางแล้วค่อยรู้ว่าออกใบไม่ได้ (เช่น จด VAT แต่ลูกค้ายังไม่มีที่อยู่)
 */
export async function assertReceiptIssuable(contract: SignedContract, installmentId: string): Promise<void> {
  const { party } = customerSnapshot(contract);
  const shares = await installmentShares(contract, party, installmentId);
  resolveTaxInvoice(await loadCompanyProfile(), shares.vat, party);
}

/** เลขใบเดิมที่ถูกยกเลิกและใบใหม่ออกแทน — พิมพ์อ้างอิงบนเอกสารให้ตรวจคู่กันได้ */
async function replacedDocNo(
  where:
    | { installmentId: string; type: "INVOICE" }
    | { paymentId: string; type: "RECEIPT" }
    | { contractId: string; forRetention: true; type: "INVOICE" }
    | { retentionReleaseId: string; type: "RECEIPT" },
) {
  const doc = await prisma.billingDocument.findFirst({
    where: { ...where, voidedAt: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { docNo: true },
  });
  return doc?.docNo ?? null;
}

function customerSnapshot(contract: SignedContract) {
  const party = billingPartyOf(contract.project.customer, contract.project.customer?.customerProfile);
  return {
    party,
    fields: {
      contractNo: contract.contractNo,
      projectNo: contract.project.projectNo,
      projectName: contract.project.name,
      customerName: party.name,
      customerAddress: party.address,
      customerIsCompany: party.isCompany,
      customerTaxId: party.taxId,
      customerBranch: party.branch,
      // ช่อง Contact person / Tel No. ตามแบบฟอร์มของบริษัท — ตรึงตอนออกเหมือนช่องอื่น
      customerContactPerson: party.contactPerson,
      customerPhone: contract.project.customer?.customerProfile?.phone?.trim() || null,
    },
  };
}

async function nextDocNo(tx: Prisma.TransactionClient, prefix: "INV" | "RC", year: number) {
  const seq = await nextDocumentSequence(tx, `${prefix}-${year}`);
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

async function notifyCustomer(contract: SignedContract, message: string, link = "/my/contracts") {
  if (!contract.project.customerId) return;
  // ผลข้างเคียงแบบ best-effort — แจ้งไม่สำเร็จต้องไม่ทำให้เอกสารที่ออกไปแล้วกลายเป็น error
  await createNotification({ userId: contract.project.customerId, message, link }).catch(
    () => undefined,
  );
}

/**
 * วางบิลงวดหนึ่ง — ตั้งวันครบกำหนดของงวดตามกำหนดชำระในใบด้วย (วันครบกำหนดของงวดมีไว้เพื่อ
 * "วางบิลแล้ว" อยู่แล้ว ดูคอมเมนต์ ContractInstallment.dueOn) งวดหนึ่งมีใบแจ้งหนี้ที่ใช้ได้ได้ใบเดียว
 */
export async function issueInvoice(
  projectId: string,
  contractId: string,
  installmentId: string,
  input: { dueOn: string },
  actorId: string,
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const installment = await getInstallmentOrThrow(contractId, installmentId);
  const dueOn = parseIsoDate(input.dueOn);
  if (!dueOn) throw new ContractError("รูปแบบวันที่ไม่ถูกต้อง", 400);
  const today = todayIso();
  if (input.dueOn < today) throw new ContractError("กำหนดชำระต้องไม่ก่อนวันนี้", 400);

  const payments = await prisma.installmentPayment.findMany({
    where: { installmentId },
    select: { amount: true },
  });
  const amount = Number(installment.amount);
  const paidBefore = round2(payments.reduce((sum, p) => sum + Number(p.amount), 0));
  if (paidBefore >= amount) {
    throw new ContractError("งวดนี้รับเงินครบแล้ว ไม่ต้องวางบิล", 409);
  }

  const { fields } = customerSnapshot(contract);
  const { shares, due, withholding, retention } = await installmentDueAmounts(contract, installment, paidBefore);
  const company = await loadCompanyProfile();
  const replacesDocNo = await replacedDocNo({ installmentId, type: "INVOICE" });
  const issuer = await issuerSnapshot(actorId);

  const doc = await prisma.$transaction(async (tx) => {
    // ล็อกแถวงวด — กดออกซ้อนสองครั้งพร้อมกันต้องได้ใบเดียว ไม่ใช่สองใบคนละเลข
    await tx.$queryRaw`SELECT id FROM "ContractInstallment" WHERE id = ${installmentId} FOR UPDATE`;
    const active = await tx.billingDocument.findFirst({
      where: { installmentId, type: "INVOICE", voidedAt: null },
      select: { docNo: true },
    });
    if (active) {
      throw new ContractError(
        `งวดนี้วางบิลไปแล้ว (${active.docNo}) — ยกเลิกใบเดิมก่อนถ้าต้องการออกใหม่`,
        409,
      );
    }
    const docNo = await nextDocNo(tx, "INV", Number(today.slice(0, 4)));
    await tx.contractInstallment.update({ where: { id: installmentId }, data: { dueOn } });
    return tx.billingDocument.create({
      data: {
        type: "INVOICE",
        docNo,
        contractId,
        installmentId,
        issuedOn: parseIsoDate(today)!,
        dueOn,
        seq: installment.seq,
        milestone: installment.milestone,
        ...fields,
        amount,
        vatAmount: shares.vat,
        paidBefore,
        withholdingAmount: withholding,
        retentionAmount: retention,
        // ใบแจ้งหนี้ไม่ใช่ใบกำกับภาษีเสมอ — VAT ของงานบริการถึงกำหนดตอนได้รับชำระ
        isTaxInvoice: false,
        ...sellerSnapshot(company),
        replacesDocNo,
        ...issuer,
      },
    });
  });

  await writeAuditLog({
    userId: actorId,
    action: "ISSUE_INVOICE",
    entityType: "Contract",
    entityId: contractId,
    details: { projectId, contractNo: contract.contractNo, seq: installment.seq, docNo: doc.docNo, amount: due, dueOn: input.dueOn },
  });
  await notifyCustomer(
    contract,
    `ใบแจ้งหนี้ ${doc.docNo} งวดที่ ${installment.seq} ตามสัญญาเลขที่ ${contract.contractNo} ยอด ${money(due)} บาท กำหนดชำระ ${thaiShortDate(input.dueOn)}`,
    // กดแจ้งเตือนแล้วไปหน้าจ่ายของงวดนี้เลย (มี QR + แจ้งโอน)
    `/my/payments/${installmentId}`,
  );

  return getContractPayments(projectId, contractId);
}

/** ออกใบเสร็จให้รายการรับเงินหนึ่งรายการ — วันที่บนใบคือวันที่ได้รับเงินจริง */
export async function issueReceipt(projectId: string, contractId: string, paymentId: string, actorId: string) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const payment = await prisma.installmentPayment.findUnique({
    where: { id: paymentId },
    include: { installment: true },
  });
  if (payment?.installment.contractId !== contractId) {
    throw new ContractError("ไม่พบรายการรับเงินที่ระบุ", 404);
  }
  // ใบเสร็จคือการบอกลูกค้าว่า "ได้รับเงินแล้ว" — ต้องมีคนตรวจกับบัญชีก่อน ออกแล้วแก้ไม่ได้
  if (!payment.verifiedAt) {
    throw new ContractError("ยังไม่ได้ยืนยันว่าเงินเข้าบัญชีจริง — ยืนยันกับบัญชีธนาคารก่อนออกใบเสร็จ", 409);
  }

  const { party, fields } = customerSnapshot(contract);
  const shares = await installmentShares(contract, party, payment.installmentId);
  const amount = Number(payment.amount);
  const retention = Number(payment.retentionAmount);
  const installmentAmount = Number(payment.installment.amount);
  // VAT ของงวดตามสัดส่วนเงินที่ "ได้รับจริง" ครั้งนี้ — เงินประกันที่ลูกค้ากันไว้ยังไม่ใช่การรับชำระ
  // ภาษีขายของส่วนนั้นถึงกำหนดตอนได้รับคืน (ออกใบกำกับภาษีอีกใบตอนคืน)
  const vat =
    shares.vat == null || installmentAmount <= 0
      ? null
      : round2((shares.vat * (amount - retention)) / installmentAmount);
  const company = await loadCompanyProfile();
  const isTaxInvoice = resolveTaxInvoice(company, vat, party);
  const replacesDocNo = await replacedDocNo({ paymentId, type: "RECEIPT" });
  const issuer = await issuerSnapshot(actorId);

  const doc = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InstallmentPayment" WHERE id = ${paymentId} FOR UPDATE`;
    const active = await tx.billingDocument.findFirst({
      where: { paymentId, type: "RECEIPT", voidedAt: null },
      select: { docNo: true },
    });
    if (active) throw new ContractError(`รายการนี้ออกใบเสร็จไปแล้ว (${active.docNo})`, 409);
    const docNo = await nextDocNo(tx, "RC", payment.paidOn.getUTCFullYear());
    return tx.billingDocument.create({
      data: {
        type: "RECEIPT",
        docNo,
        contractId,
        installmentId: payment.installmentId,
        paymentId,
        issuedOn: payment.paidOn,
        seq: payment.installment.seq,
        milestone: payment.installment.milestone,
        ...fields,
        amount,
        vatAmount: vat,
        withholdingAmount: Number(payment.withholdingAmount),
        retentionAmount: retention > 0 ? retention : null,
        method: payment.method,
        reference: payment.reference,
        isTaxInvoice,
        ...sellerSnapshot(company),
        replacesDocNo,
        ...issuer,
      },
    });
  });

  await writeAuditLog({
    userId: actorId,
    action: "ISSUE_RECEIPT",
    entityType: "Contract",
    entityId: contractId,
    details: { projectId, contractNo: contract.contractNo, seq: payment.installment.seq, docNo: doc.docNo, paymentId, amount, isTaxInvoice },
  });
  await notifyCustomer(
    contract,
    `ได้รับชำระเงินงวดที่ ${payment.installment.seq} ตามสัญญาเลขที่ ${contract.contractNo} แล้ว ${money(round2(amount - retention))} บาท — ${
      isTaxInvoice ? "ใบเสร็จรับเงิน/ใบกำกับภาษี" : "ใบเสร็จรับเงิน"
    } ${doc.docNo}`,
    "/my/payments",
  );

  return getContractPayments(projectId, contractId);
}

async function getDocOrThrow(projectId: string, contractId: string, docId: string) {
  const doc = await prisma.billingDocument.findUnique({
    where: { id: docId },
    include: { contract: { select: { projectId: true } } },
  });
  if (doc?.contractId !== contractId || doc.contract.projectId !== projectId) {
    throw new ContractError("ไม่พบเอกสารที่ระบุ", 404);
  }
  return doc;
}

/**
 * ยกเลิกเอกสาร — ใบแจ้งหนี้ใครก็ยกเลิกได้ (ออกใหม่ได้ทันที) · ใบเสร็จเฉพาะเจ้าของกิจการ เพราะเป็น
 * หลักฐานว่าได้รับเงินแล้ว ยกเลิกแล้วเปิดทางให้แก้หรือลบรายการรับเงินได้
 */
export async function voidBillingDoc(
  projectId: string,
  contractId: string,
  docId: string,
  reason: string,
  actor: { id: string; role: string },
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const doc = await getDocOrThrow(projectId, contractId, docId);
  if (doc.voidedAt) throw new ContractError("เอกสารนี้ถูกยกเลิกไปแล้ว", 409);
  if (doc.type === "RECEIPT" && actor.role !== "OWNER") {
    throw new ContractError("ยกเลิกใบเสร็จรับเงินได้เฉพาะเจ้าของกิจการ", 403);
  }

  await prisma.billingDocument.update({
    where: { id: docId },
    data: { voidedAt: new Date(), voidReason: reason, voidedById: actor.id },
  });
  await writeAuditLog({
    userId: actor.id,
    action: doc.type === "INVOICE" ? "VOID_INVOICE" : "VOID_RECEIPT",
    entityType: "Contract",
    entityId: contractId,
    details: { projectId, contractNo: contract.contractNo, seq: doc.seq, docNo: doc.docNo, reason },
  });
  const label = doc.type === "INVOICE" ? "ใบแจ้งหนี้" : "ใบเสร็จรับเงิน";
  const of = doc.forRetention ? "คืนเงินประกันผลงาน" : `งวดที่ ${doc.seq}`;
  await notifyCustomer(contract, `${label} ${doc.docNo} ${of} ถูกยกเลิก — ${reason}`);

  return getContractPayments(projectId, contractId);
}

type BillingDocRow = Prisma.BillingDocumentGetPayload<object>;

/**
 * แถวที่ตรึงไว้ → PDF (ใช้ร่วมกันทั้งฝั่งพนักงานและฝั่งลูกค้า)
 * edition: ฝั่งบริษัท = ต้นฉบับ+สำเนา · ลูกค้า = ต้นฉบับอย่างเดียว — ผู้เรียกต้องระบุเอง ไม่มีค่าเริ่มต้น
 * กันเผลอส่งสำเนาให้ลูกค้า/ลืมสำเนาฝั่งบริษัท
 */
export async function renderBillingDoc(doc: BillingDocRow, edition: BillingDocEdition): Promise<Uint8Array> {
  const company = await loadCompanyProfile();
  const num = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));
  // ใบเสร็จ: ช่อง Invoice No. = ใบแจ้งหนี้ของงวดเดียวกันที่ยังใช้ได้ (เลขเอกสารไม่เปลี่ยน อ่านตอนพิมพ์ได้)
  const invoice =
    doc.type === "RECEIPT"
      ? await prisma.billingDocument.findFirst({
          where: {
            contractId: doc.contractId,
            type: "INVOICE",
            voidedAt: null,
            ...(doc.installmentId ? { installmentId: doc.installmentId } : { forRetention: true }),
          },
          orderBy: { createdAt: "desc" },
          select: { docNo: true },
        })
      : null;
  return renderBillingDocPdf({
    edition,
    // ชื่อ/ที่อยู่/เลขภาษีที่ตรึงไว้ตอนออกมาก่อนค่าปัจจุบันเสมอ — ใบเก่าต้องพิมพ์ซ้ำได้เหมือนเดิม
    companyName: doc.sellerName ?? company.companyName,
    companyNameEn: company.companyNameEn,
    companyAddressEn: company.companyAddressEn,
    invoiceNo: invoice?.docNo ?? null,
    companyAddress: doc.sellerAddress ?? company.companyAddress,
    companyPhone: company.companyPhone,
    companyTaxId: doc.sellerName ? doc.sellerTaxId : company.companyTaxId,
    companyBranch: doc.sellerName ? doc.sellerBranch : company.companyBranch,
    companyEmail: company.companyEmail,
    logo: company.logo,
    logoSmall: company.logoSmall,
    type: doc.type,
    isTaxInvoice: doc.isTaxInvoice,
    replacesDocNo: doc.replacesDocNo,
    docNo: doc.docNo,
    issuedOn: doc.issuedOn,
    dueOn: doc.dueOn,
    contractNo: doc.contractNo,
    projectNo: doc.projectNo,
    projectName: doc.projectName,
    seq: doc.seq,
    milestone: doc.milestone,
    customerName: doc.customerName,
    customerAddress: doc.customerAddress,
    customerIsCompany: doc.customerIsCompany,
    customerTaxId: doc.customerTaxId,
    customerBranch: doc.customerBranch,
    customerContactPerson: doc.customerContactPerson,
    customerPhone: doc.customerPhone,
    amount: Number(doc.amount),
    vatAmount: num(doc.vatAmount),
    paidBefore: num(doc.paidBefore),
    withholdingAmount: num(doc.withholdingAmount),
    retentionAmount: num(doc.retentionAmount),
    forRetention: doc.forRetention,
    method: doc.method,
    reference: doc.reference,
    issuedByName: doc.issuedByName,
    issuedByTitle: doc.issuedByTitle,
    signatureDataUrl: signatureDataUrl(doc.signaturePng),
    voidedAt: doc.voidedAt,
    voidReason: doc.voidReason,
  });
}

export async function generateBillingDocPdf(projectId: string, contractId: string, docId: string) {
  const doc = await getDocOrThrow(projectId, contractId, docId);
  return { docNo: doc.docNo, bytes: await renderBillingDoc(doc, "ORIGINAL_AND_COPY") };
}


// ---------- เอกสารคืนเงินประกันผลงาน ----------
// เงินประกันเป็นของทั้งสัญญา ไม่ใช่ของงวดใด — ใบจึงไม่ผูกงวด (installmentId = null, seq = 0)

const RETENTION_MILESTONE = "คืนเงินประกันผลงาน";

/** VAT ของเงินก้อนหนึ่งของสัญญา ตามสัดส่วน VAT ทั้งสัญญา — ไม่รู้ VAT ของสัญญา = null (ไม่เดา) */
async function vatShareOf(contract: SignedContract, amount: number): Promise<number | null> {
  const current = await contractCurrentTotals(contract);
  if (current.vat == null || current.amount == null || current.amount <= 0) return null;
  return round2((current.vat * amount) / current.amount);
}

/** วางบิลคืนเงินประกันผลงานยอดที่ยังค้าง — กำหนดชำระในใบ = วันครบกำหนดคืนของสัญญา */
export async function issueRetentionInvoice(
  projectId: string,
  contractId: string,
  input: { dueOn: string },
  actorId: string,
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const dueOn = parseIsoDate(input.dueOn);
  if (!dueOn) throw new ContractError("รูปแบบวันที่ไม่ถูกต้อง", 400);
  const today = todayIso();
  if (input.dueOn < today) throw new ContractError("กำหนดชำระต้องไม่ก่อนวันนี้", 400);

  const view = await getContractPayments(projectId, contractId);
  const amount = view.retention.balance.outstanding;
  if (amount <= 0) throw new ContractError("ไม่มีเงินประกันผลงานค้างคืน — ไม่ต้องวางบิล", 409);

  const { fields } = customerSnapshot(contract);
  const vat = await vatShareOf(contract, amount);
  const company = await loadCompanyProfile();
  const replacesDocNo = await replacedDocNo({ contractId, forRetention: true, type: "INVOICE" });
  const issuer = await issuerSnapshot(actorId);

  const doc = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${contractId} FOR UPDATE`;
    const active = await tx.billingDocument.findFirst({
      where: { contractId, forRetention: true, type: "INVOICE", voidedAt: null },
      select: { docNo: true },
    });
    if (active) {
      throw new ContractError(
        `วางบิลคืนเงินประกันไปแล้ว (${active.docNo}) — ยกเลิกใบเดิมก่อนถ้าต้องการออกใหม่`,
        409,
      );
    }
    const docNo = await nextDocNo(tx, "INV", Number(today.slice(0, 4)));
    await tx.contract.update({ where: { id: contractId }, data: { retentionDueOn: dueOn } });
    return tx.billingDocument.create({
      data: {
        type: "INVOICE",
        docNo,
        contractId,
        installmentId: null,
        forRetention: true,
        issuedOn: parseIsoDate(today)!,
        dueOn,
        seq: 0,
        milestone: RETENTION_MILESTONE,
        ...fields,
        amount,
        vatAmount: vat,
        paidBefore: 0,
        withholdingAmount: view.retention.expectedWithholding,
        isTaxInvoice: false,
        ...sellerSnapshot(company),
        replacesDocNo,
        ...issuer,
      },
    });
  });

  await writeAuditLog({
    userId: actorId,
    action: "ISSUE_INVOICE",
    entityType: "Contract",
    entityId: contractId,
    details: { projectId, contractNo: contract.contractNo, retention: true, docNo: doc.docNo, amount, dueOn: input.dueOn },
  });
  await notifyCustomer(
    contract,
    `ใบแจ้งหนี้ ${doc.docNo} คืนเงินประกันผลงานตามสัญญาเลขที่ ${contract.contractNo} ยอด ${money(amount)} บาท กำหนดชำระ ${thaiShortDate(input.dueOn)}`,
  );
  return getContractPayments(projectId, contractId);
}

/** ใบเสร็จของการรับคืนเงินประกันหนึ่งครั้ง — เป็นใบกำกับภาษีของเงินส่วนนี้ (VAT ถึงกำหนดตอนได้รับ) */
export async function issueRetentionReceipt(
  projectId: string,
  contractId: string,
  releaseId: string,
  actorId: string,
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const release = await prisma.retentionRelease.findUnique({ where: { id: releaseId } });
  if (release?.contractId !== contractId) throw new ContractError("ไม่พบรายการรับคืนเงินประกันที่ระบุ", 404);

  const { party, fields } = customerSnapshot(contract);
  const amount = Number(release.amount);
  const vat = await vatShareOf(contract, amount);
  const company = await loadCompanyProfile();
  const isTaxInvoice = resolveTaxInvoice(company, vat, party);
  const replacesDocNo = await replacedDocNo({ retentionReleaseId: releaseId, type: "RECEIPT" });
  const issuer = await issuerSnapshot(actorId);

  const doc = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "RetentionRelease" WHERE id = ${releaseId} FOR UPDATE`;
    const active = await tx.billingDocument.findFirst({
      where: { retentionReleaseId: releaseId, type: "RECEIPT", voidedAt: null },
      select: { docNo: true },
    });
    if (active) throw new ContractError(`รายการนี้ออกใบเสร็จไปแล้ว (${active.docNo})`, 409);
    const docNo = await nextDocNo(tx, "RC", release.paidOn.getUTCFullYear());
    return tx.billingDocument.create({
      data: {
        type: "RECEIPT",
        docNo,
        contractId,
        installmentId: null,
        forRetention: true,
        retentionReleaseId: releaseId,
        issuedOn: release.paidOn,
        seq: 0,
        milestone: RETENTION_MILESTONE,
        ...fields,
        amount,
        vatAmount: vat,
        withholdingAmount: Number(release.withholdingAmount),
        method: release.method,
        reference: release.reference,
        isTaxInvoice,
        ...sellerSnapshot(company),
        replacesDocNo,
        ...issuer,
      },
    });
  });

  await writeAuditLog({
    userId: actorId,
    action: "ISSUE_RECEIPT",
    entityType: "Contract",
    entityId: contractId,
    details: { projectId, contractNo: contract.contractNo, retention: true, docNo: doc.docNo, releaseId, amount, isTaxInvoice },
  });
  await notifyCustomer(
    contract,
    `ได้รับคืนเงินประกันผลงานตามสัญญาเลขที่ ${contract.contractNo} แล้ว ${money(amount)} บาท — ${
      isTaxInvoice ? "ใบเสร็จรับเงิน/ใบกำกับภาษี" : "ใบเสร็จรับเงิน"
    } ${doc.docNo}`,
  );
  return getContractPayments(projectId, contractId);
}
