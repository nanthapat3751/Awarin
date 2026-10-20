import type { SalesTaxReportDto } from "@systemboq/shared-types";

import { apiFetch, downloadFile } from "./api";

export function getSalesTaxReport(month: string): Promise<SalesTaxReportDto> {
  return apiFetch(`/api/reports/sales-tax?month=${encodeURIComponent(month)}`);
}

/**
 * ดาวน์โหลดด้วย fetch พร้อมคุกกี้ ไม่ใช่ชี้ <a href> ไปที่ API ตรง ๆ — ปลายทางตรวจสิทธิ์ก่อน
 * ถ้าเปิดเป็นลิงก์แล้วไม่ผ่าน ผู้ใช้จะเห็น JSON ดิบในแท็บใหม่แทนข้อความที่อ่านรู้เรื่อง
 */
/** Excel ตามแบบฟอร์มรายงานภาษีขายของสรรพากร (แบบ A ที่ผู้ใช้เลือก 17 ต.ค.) */
export function downloadSalesTaxXlsx(month: string): Promise<void> {
  return downloadFile(
    `/api/reports/sales-tax.xlsx?month=${encodeURIComponent(month)}`,
    `รายงานภาษีขาย-${month}.xlsx`,
  );
}

export function downloadSalesTaxCsv(month: string): Promise<void> {
  return downloadFile(
    `/api/reports/sales-tax.csv?month=${encodeURIComponent(month)}`,
    `รายงานภาษีขาย-${month}.csv`,
  );
}
