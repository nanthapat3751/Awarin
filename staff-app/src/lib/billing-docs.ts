import type { BillingDocSummaryDto } from "@systemboq/shared-types";

/** มีใบเสร็จที่ยังใช้ได้อยู่ไหม — ใช้ซ่อนปุ่มแก้/ลบของรายการรับเงิน (เซิร์ฟเวอร์ก็ปฏิเสธอยู่แล้ว) */
export function hasActiveReceipt(docs: BillingDocSummaryDto[], paymentId: string): boolean {
  return docs.some((d) => d.type === "RECEIPT" && d.paymentId === paymentId && !d.voidedAt);
}
