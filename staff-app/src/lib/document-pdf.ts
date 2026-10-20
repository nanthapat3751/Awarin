/**
 * ที่อยู่และชื่อของเอกสาร PDF — รวมไว้ที่เดียวเพื่อให้ชื่อบนแท็บ ชื่อบนแถบเครื่องมือ และชื่อไฟล์
 * ตอนกดดาวน์โหลด ตรงกันเสมอ (ถ้าแยกไปเขียนตามที่ใช้ เดี๋ยวก็เพี้ยนกันเอง)
 */

export type PdfDocKind = "quote" | "contract";

/** ป้ายที่ตัวเอกสารเรียกตัวเองในหัวกระดาษ — ให้ชื่อแท็บตรงกับสิ่งที่เห็นในไฟล์ */
const KIND_LABEL: Record<PdfDocKind, string> = {
  quote: "BOQ",
  contract: "สัญญา",
};

/** endpoint ที่สร้างไฟล์จริง */
export function pdfApiPath(kind: PdfDocKind, projectId: string, docId: string): string {
  const segment = kind === "quote" ? "quotes" : "contracts";
  return `/api/projects/${projectId}/${segment}/${docId}/pdf`;
}

/**
 * หน้าดูเอกสารในแอปเรา (ไม่ใช่ URL ของไฟล์)
 *
 * เดิมเปิดไฟล์ด้วย window.open ไปที่ blob URL ซึ่งไม่มีชื่อติดมาด้วย แท็บจึงขึ้นว่า "about:blank"
 * ทุกใบ พอเปิดหลายใบพร้อมกันก็แยกไม่ออกว่าอันไหนของโครงการไหน — เปิดหน้าของเราเองแทนแล้ว
 * ตั้ง document.title เองจึงคุมได้แน่นอน ไม่ต้องพึ่งว่าเบราว์เซอร์ไหนอ่าน metadata ของ PDF ยังไง
 * (Chrome ที่สร้าง PDF ให้ ไม่ได้เขียน /Title ลงไฟล์มาให้อยู่แล้ว — ตรวจแล้ว)
 */
export function pdfViewerPath(kind: PdfDocKind, projectId: string, docId: string): string {
  const segment = kind === "quote" ? "quotes" : "contracts";
  return `/projects/${projectId}/${segment}/${docId}/pdf`;
}

/** ชื่อที่ใช้บนแท็บ เช่น "BOQ QT-2026-0342" */
export function pdfDocTitle(kind: PdfDocKind, docNo: string): string {
  return `${KIND_LABEL[kind]} ${docNo}`;
}

/** ใบแจ้งหนี้/ใบเสร็จของงวดเงิน — อยู่ใต้สัญญา จึงต้องมีทั้งเลขสัญญาและเลขเอกสาร */
export function billingDocApiPath(projectId: string, contractId: string, docId: string): string {
  return `/api/projects/${projectId}/contracts/${contractId}/documents/${docId}/pdf`;
}

export function billingDocViewerPath(projectId: string, contractId: string, docId: string): string {
  return `/projects/${projectId}/contracts/${contractId}/documents/${docId}/pdf`;
}

/** ใบงานเพิ่ม-ลด — อยู่ใต้สัญญาเหมือนใบแจ้งหนี้ */
export function changeOrderApiPath(projectId: string, contractId: string, id: string): string {
  return `/api/projects/${projectId}/contracts/${contractId}/change-orders/${id}/pdf`;
}

export function changeOrderViewerPath(projectId: string, contractId: string, id: string): string {
  return `/projects/${projectId}/contracts/${contractId}/change-orders/${id}/pdf`;
}
