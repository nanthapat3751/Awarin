import type { QuoteApprovalDto, QuoteSignerSummaryDto } from "@systemboq/shared-types";

/**
 * ขั้นอนุมัติใบเสนอราคา — กติกาล้วน ๆ ไม่แตะฐานข้อมูล (ใช้ได้ทั้งฝั่ง service และ PDF)
 *
 * ใบที่รออนุมัติ/อนุมัติแล้วยังเป็น DRAFT เสมอจนกว่าจะกดส่ง สถานะการอนุมัติอ่านจากแถว QuoteSigner:
 *   ไม่มีแถว = ยังไม่ขอ · มีผู้เสนอ = รออนุมัติ · มีผู้อนุมัติ = ส่งให้ลูกค้าได้
 */
export interface SignerRow {
  role: "PROPOSER" | "APPROVER";
  userId: string | null;
  name: string;
  title: string | null;
  signaturePng: Uint8Array | null;
  signedAt: Date;
}

function summary(row: SignerRow | undefined): QuoteSignerSummaryDto | null {
  if (!row) return null;
  return {
    userId: row.userId,
    name: row.name,
    title: row.title,
    hasSignature: row.signaturePng != null,
    signedAt: row.signedAt.toISOString(),
  };
}

export function approvalOf(signers: SignerRow[]): QuoteApprovalDto {
  const proposer = signers.find((s) => s.role === "PROPOSER");
  const approver = signers.find((s) => s.role === "APPROVER");
  let state: QuoteApprovalDto["state"] = "NONE";
  if (approver) state = "APPROVED";
  else if (proposer) state = "PENDING";
  return { state, proposer: summary(proposer), approver: summary(approver) };
}

/**
 * เนื้อหาใบถูกล็อกหรือยัง — ขอ/ได้อนุมัติแล้วแต่ยังไม่ส่ง
 *
 * ของที่อนุมัติต้องเป็นของเดียวกับที่ส่งถึงลูกค้า: แก้ BOQ/ราคา ระบบแตกเวอร์ชันใหม่ให้เอง
 * (ใบนี้ยังชี้เวอร์ชันเดิม) ส่วนไฟล์แนบที่ลูกค้าเห็นถูกห้ามแก้จนกว่าจะถอนคำขอ
 */
export function isApprovalLocked(status: string, signerCount: number): boolean {
  return status === "DRAFT" && signerCount > 0;
}
