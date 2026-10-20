import fs from "node:fs";
import path from "node:path";

import { PAYMENT_EVIDENCE_MAX_FILES } from "@systemboq/shared-types";

import { writeAuditLog } from "../../lib/audit-log";
import { prisma } from "../../lib/prisma";
import { ContractError } from "./contracts.service";
import { evidencePath, originalFileName, removeEvidenceFiles } from "./payment-evidence.files";
import { getContractPayments, getPaymentOrThrow, getSignedContractOrThrow } from "./payments.service";

/**
 * แนบหลักฐานการรับเงิน (สลิป/รูปเช็ค/สำเนาใบเสร็จเงินสด)
 *
 * **แนบเพิ่มได้แม้ออกใบเสร็จไปแล้ว** — หลักฐานไม่ได้เปลี่ยนตัวเลขใด ๆ บนใบเสร็จ
 * และสลิปมักมาถึงทีหลัง (ลูกค้าส่งตามมาทางไลน์) ถ้าล็อกตามใบเสร็จ คนก็จะเลิกแนบ
 * ใครแนบก็ได้ (พนักงานทุกคนที่เข้าหน้านี้ได้) — การแนบไม่ทำให้อะไรหายหรือเปลี่ยน
 */
export async function addPaymentEvidence(
  projectId: string,
  contractId: string,
  paymentId: string,
  file: { filename: string; originalname: string; mimetype: string; size: number },
  actorId: string,
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const payment = await getPaymentOrThrow(contractId, paymentId);
  const count = await prisma.paymentEvidence.count({ where: { paymentId } });
  if (count >= PAYMENT_EVIDENCE_MAX_FILES) {
    throw new ContractError(`แนบหลักฐานได้ไม่เกิน ${PAYMENT_EVIDENCE_MAX_FILES} ไฟล์ต่อรายการ`, 400);
  }
  const fileName = originalFileName(file);

  const created = await prisma.paymentEvidence.create({
    data: {
      paymentId,
      fileName,
      storedName: file.filename,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedById: actorId,
    },
  });
  await writeAuditLog({
    userId: actorId,
    action: "ATTACH_PAYMENT_EVIDENCE",
    entityType: "Contract",
    entityId: contractId,
    details: {
      projectId,
      contractNo: contract.contractNo,
      seq: payment.installment.seq,
      paymentId,
      evidenceId: created.id,
      fileName,
    },
  });
  return getContractPayments(projectId, contractId);
}

async function getEvidenceOrThrow(contractId: string, paymentId: string, evidenceId: string) {
  await getPaymentOrThrow(contractId, paymentId);
  const evidence = await prisma.paymentEvidence.findUnique({ where: { id: evidenceId } });
  if (evidence?.paymentId !== paymentId) throw new ContractError("ไม่พบไฟล์หลักฐานที่ระบุ", 404);
  return evidence;
}

/** ลบได้เฉพาะคนที่แนบเอง คนที่บันทึกรายการรับเงิน หรือเจ้าของกิจการ — ร่องรอยอยู่ใน AuditLog */
export async function deletePaymentEvidence(
  projectId: string,
  contractId: string,
  paymentId: string,
  evidenceId: string,
  actor: { id: string; role: string },
) {
  const contract = await getSignedContractOrThrow(projectId, contractId);
  const payment = await getPaymentOrThrow(contractId, paymentId);
  const evidence = await getEvidenceOrThrow(contractId, paymentId, evidenceId);
  if (actor.role !== "OWNER" && evidence.uploadedById !== actor.id && payment.recordedById !== actor.id) {
    throw new ContractError("ลบได้เฉพาะไฟล์ที่ตัวเองแนบ (หรือให้เจ้าของกิจการลบให้)", 403);
  }
  await prisma.paymentEvidence.delete({ where: { id: evidenceId } });
  removeEvidenceFiles([evidence.storedName]);
  await writeAuditLog({
    userId: actor.id,
    action: "DELETE_PAYMENT_EVIDENCE",
    entityType: "Contract",
    entityId: contractId,
    details: {
      projectId,
      contractNo: contract.contractNo,
      seq: payment.installment.seq,
      paymentId,
      evidenceId,
      fileName: evidence.fileName,
    },
  });
  return getContractPayments(projectId, contractId);
}

/** ไฟล์สำหรับเปิดดู — ใช้ได้กับสัญญาที่ลงนามแล้วเท่านั้นเหมือนทุกอย่างของการรับเงิน */
export async function getPaymentEvidenceFile(
  projectId: string,
  contractId: string,
  paymentId: string,
  evidenceId: string,
) {
  await getSignedContractOrThrow(projectId, contractId);
  const evidence = await getEvidenceOrThrow(contractId, paymentId, evidenceId);
  const absPath = evidencePath(evidence.storedName);
  // storedName มาจากเราเองเสมอ แต่กันไว้อีกชั้นว่าไม่หลุดออกนอกโฟลเดอร์
  if (path.basename(evidence.storedName) !== evidence.storedName || !fs.existsSync(absPath)) {
    throw new ContractError("ไฟล์หลักฐานหายไปจากระบบ", 404);
  }
  return { absPath, fileName: evidence.fileName, mimeType: evidence.mimeType };
}
