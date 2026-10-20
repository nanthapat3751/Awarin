/**
 * ที่อยู่และชื่อของเอกสาร PDF ฝั่งลูกค้า — รวมไว้ที่เดียวเพื่อให้ชื่อบนแท็บ ชื่อบนแถบเครื่องมือ
 * และชื่อไฟล์ตอนกดบันทึก ตรงกันเสมอ (โครงเดียวกับ staff-app/src/lib/document-pdf.ts)
 */

export type PdfDocKind = "quote" | "contract";

/**
 * ป้ายที่ตัวเอกสารเรียกตัวเองในหัวกระดาษ
 *
 * ฝั่งลูกค้าใช้คำว่า "ใบเสนอราคา" ไม่ใช่ "BOQ" เหมือนฝั่งพนักงาน เพราะคนละไฟล์กันจริง ๆ —
 * `/api/my/quotes/:id/pdf` เรนเดอร์ด้วย customer-quote-pdf.ts ซึ่งไม่แจกแจงต้นทุนรายบรรทัด
 * ให้ลูกค้าเห็น ส่วนฝั่งพนักงานคือ quote-pdf.ts ที่เป็น BOQ เต็ม
 */
const KIND_LABEL: Record<PdfDocKind, string> = {
  quote: "ใบเสนอราคา",
  contract: "สัญญา",
};

/** endpoint ที่สร้างไฟล์จริง */
export function pdfApiPath(kind: PdfDocKind, docId: string): string {
  const segment = kind === "quote" ? "quotes" : "contracts";
  return `/api/my/${segment}/${docId}/pdf`;
}

/**
 * หน้าดูเอกสารในแอปเรา (ไม่ใช่ URL ของไฟล์)
 *
 * เดิมเปิดด้วย window.open ไปที่ blob URL ซึ่งไม่มีชื่อติดมาด้วย แท็บจึงขึ้นว่า "about:blank"
 * — เปิดหน้าของเราเองแล้วตั้ง document.title เองจึงคุมได้แน่นอน
 */
export function pdfViewerPath(kind: PdfDocKind, docId: string): string {
  const segment = kind === "quote" ? "quotes" : "contracts";
  return `/my/${segment}/${docId}/pdf`;
}

/** ใบแจ้งหนี้/ใบเสร็จของงวดเงิน — อยู่ใต้สัญญา */
export function billingDocApiPath(contractId: string, docId: string): string {
  return `/api/my/contracts/${contractId}/documents/${docId}/pdf`;
}

export function billingDocViewerPath(contractId: string, docId: string): string {
  return `/my/contracts/${contractId}/documents/${docId}/pdf`;
}

/** ชื่อที่ใช้บนแท็บ เช่น "ใบเสนอราคา QT-2026-0342" */
export function pdfDocTitle(kind: PdfDocKind, docNo: string): string {
  return `${KIND_LABEL[kind]} ${docNo}`;
}

/** ใบงานเพิ่ม-ลด — อยู่ใต้สัญญาเหมือนใบแจ้งหนี้ */
export function changeOrderApiPath(contractId: string, id: string): string {
  return `/api/my/contracts/${contractId}/change-orders/${id}/pdf`;
}

export function changeOrderViewerPath(contractId: string, id: string): string {
  return `/my/contracts/${contractId}/change-orders/${id}/pdf`;
}
