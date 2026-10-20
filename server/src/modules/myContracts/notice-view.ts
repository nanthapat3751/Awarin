import type { CustomerPaymentNoticeDto } from "@systemboq/shared-types";

import { toIsoDate } from "../../lib/business-date";

type NoticeStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";

/**
 * การแจ้งโอนที่พนักงานยืนยันแล้วแต่ยังไม่ได้ตรวจกับบัญชี — ฝั่งลูกค้ายังเป็น "รอตรวจ"
 * (รายการรับเงินยังไม่ขึ้นให้ลูกค้าเห็น ถ้าปล่อยเป็นยืนยันแล้ว การแจ้งจะหายไปเฉย ๆ เหมือนไม่มีใครรับรู้)
 */
export function asCustomerSees<T extends { status: NoticeStatus; payment: { verifiedAt: Date | null } | null }>(
  notice: T,
): T {
  if (notice.status === "CONFIRMED" && !notice.payment?.verifiedAt) return { ...notice, status: "PENDING" };
  return notice;
}

/** ฟิลด์ที่ต้อง select มาเพื่อสร้างการแจ้งในมุมลูกค้า */
export const CUSTOMER_NOTICE_SELECT = {
  id: true,
  paidOn: true,
  amount: true,
  status: true,
  rejectReason: true,
  slipStatus: true,
  createdAt: true,
  evidence: { orderBy: { createdAt: "asc" as const }, select: { id: true, fileName: true } },
  payment: { select: { verifiedAt: true } },
  slipChecks: { select: { status: true, amount: true } },
};

type NoticeRow = {
  id: string;
  paidOn: Date;
  amount: unknown;
  status: NoticeStatus;
  rejectReason: string | null;
  slipStatus: string | null;
  createdAt: Date;
  evidence: { id: string; fileName: string }[];
  payment: { verifiedAt: Date | null } | null;
  slipChecks: { status: string; amount: unknown }[];
};

/**
 * การแจ้งล่าสุดของงวดในมุมลูกค้า — ยืนยันแล้ว/ลูกค้ายกเลิกเอง ไม่ต้องบอก (null)
 * ยอดในสลิปไม่ตรงกับที่ลูกค้ากรอก = บอกทันที (ผู้ใช้เลือกข้อ A 19 ต.ค.) · เทียบเฉพาะกับยอดที่ลูกค้ากรอก
 * ไม่บอก "ยอดที่ต้องโอน" ซ้ำ เพราะลูกค้าตั้งใจจ่ายบางส่วนได้ (บริษัทตัดสินเอง)
 */
export function toCustomerNotice(latest: NoticeRow | undefined): CustomerPaymentNoticeDto | null {
  if (!latest || latest.status === "CONFIRMED" || latest.status === "CANCELLED") return null;
  const verified = latest.slipChecks.filter((c) => c.status === "PASSED" && c.amount != null);
  const slipTotal = Math.round(verified.reduce((sum, c) => sum + Number(c.amount), 0) * 100) / 100;
  return {
    id: latest.id,
    paidOn: toIsoDate(latest.paidOn)!,
    amount: String(latest.amount),
    status: latest.status,
    rejectReason: latest.rejectReason,
    slipVerified: latest.slipStatus === "PASSED",
    slipAmountMismatch:
      latest.status === "PENDING" && verified.length > 0 && Math.abs(slipTotal - Number(latest.amount)) > 0.009
        ? { slipAmount: slipTotal.toFixed(2) }
        : null,
    // ยืนยันแล้วแต่ยังไม่ตรวจกับบัญชี ถูกแสดงเป็น "รอตรวจ" (asCustomerSees) แต่มีรายการรับเงินแล้ว — ยกเลิกไม่ได้
    canCancel: latest.status === "PENDING" && latest.payment == null,
    createdAt: latest.createdAt.toISOString(),
    evidence: latest.evidence,
  };
}
