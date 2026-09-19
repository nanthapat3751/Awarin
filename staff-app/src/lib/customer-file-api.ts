import type {
  CustomerAccessLinkDto,
  CustomerActivityFeedPageDto,
  CustomerActivityPageDto,
  CustomerDetailDto,
  CustomerDirectoryPageDto,
  CustomerSortField,
  CustomerType,
  ProjectCustomerActivityDto,
} from "@systemboq/shared-types";

import { apiFetch, downloadFile } from "./api";

export function getCustomerDetail(id: string): Promise<{ customer: CustomerDetailDto }> {
  return apiFetch(`/api/customers/${id}`);
}

/** `query` มาจาก filterToQuery() — ขึ้นต้นด้วย "?" หรือเป็นสตริงว่าง */
export function getCustomerActivity(
  id: string,
  query = "",
  page = 1,
): Promise<CustomerActivityPageDto> {
  return apiFetch(`/api/customers/${id}/activity${withPage(query, page)}`);
}

/** ฟีดกิจกรรมของลูกค้าทุกคนรวมกัน */
export function listCustomerActivityFeed(
  query = "",
  page = 1,
): Promise<CustomerActivityFeedPageDto> {
  return apiFetch(`/api/customers/activity${withPage(query, page)}`);
}

/** ต่อเลขหน้าเข้ากับ query ที่มีอยู่ — รับได้ทั้งที่ขึ้นต้นด้วย "?" และสตริงว่าง */
function withPage(query: string, page: number): string {
  if (page <= 1) return query;
  return query ? `${query}&page=${page}` : `?page=${page}`;
}

export interface DirectoryQuery {
  q?: string;
  page?: number;
  /** ระบุเองเฉพาะกรณีที่ไม่ใช่ตารางหลัก (เช่น ช่องเลือกลูกค้าในแท็บกิจกรรม) */
  pageSize?: number;
  sort?: CustomerSortField;
  dir?: "asc" | "desc";
}

function directoryQueryString(query: DirectoryQuery): string {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.sort) params.set("sort", query.sort);
  if (query.dir) params.set("dir", query.dir);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function listCustomerDirectory(query: DirectoryQuery = {}): Promise<CustomerDirectoryPageDto> {
  return apiFetch(`/api/customers/directory${directoryQueryString(query)}`);
}

// ---------- ส่งออกไฟล์ ----------
//
// ใช้ downloadFile (fetch พร้อมคุกกี้) ไม่ใช่ชี้ <a href> ไปที่ API ตรง ๆ เพราะปลายทางต้องตรวจ
// สิทธิ์ก่อน — ถ้าเปิดเป็นลิงก์แล้วไม่ผ่าน ผู้ใช้จะเห็น JSON ดิบในแท็บใหม่แทนข้อความที่อ่านรู้เรื่อง

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function downloadCustomerDirectoryCsv(query: DirectoryQuery = {}): Promise<void> {
  return downloadFile(
    `/api/customers/directory.csv${directoryQueryString(query)}`,
    `รายชื่อลูกค้า-${stamp()}.csv`,
  );
}

export function downloadCustomerActivityCsv(query = ""): Promise<void> {
  return downloadFile(`/api/customers/activity.csv${query}`, `กิจกรรมลูกค้า-${stamp()}.csv`);
}

/** สำเนาข้อมูลส่วนบุคคลของลูกค้ารายนี้ (PDPA) — OWNER เท่านั้น */
export function downloadCustomerDataPackage(
  id: string,
  name: string,
  options: { includeNotes: boolean },
): Promise<void> {
  const query = options.includeNotes ? "" : "?includeNotes=0";
  return downloadFile(
    `/api/customers/${id}/export${query}`,
    `ข้อมูลส่วนบุคคล-${name}-${stamp()}.json`,
  );
}

/** กิจกรรมของลูกค้าเจ้าของโครงการ บนหน้ารายละเอียดโครงการ */
export function getProjectCustomerActivity(
  projectId: string,
): Promise<ProjectCustomerActivityDto> {
  return apiFetch(`/api/projects/${projectId}/customer-activity`);
}

/** แก้ข้อมูลติดต่อ — ส่งเฉพาะช่องที่แก้ ("" = ล้างค่า) */
export interface UpdateCustomerInput {
  fullName?: string;
  phone?: string;
  address?: string;
  customerType?: CustomerType;
  companyName?: string;
  taxId?: string;
  branch?: string;
  contactPerson?: string;
}

export function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
): Promise<{ customer: CustomerDetailDto }> {
  return apiFetch(`/api/customers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** ออกลิงก์ตั้งรหัสผ่าน/เข้าใช้งานให้ลูกค้า (ไม่ต้องมีโครงการ) */
export function issueCustomerAccessLink(id: string): Promise<CustomerAccessLinkDto> {
  return apiFetch(`/api/customers/${id}/access-link`, { method: "POST" });
}

/** ระงับ / เปิดใช้งานบัญชีลูกค้า — OWNER เท่านั้น */
export function setCustomerActive(
  id: string,
  input: { active: boolean; reason?: string },
): Promise<{ customer: CustomerDetailDto }> {
  return apiFetch(`/api/customers/${id}/active`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ---------- บันทึกการติดต่อ ----------
// ทุกตัวคืน customer ทั้งก้อนกลับมา เพื่อให้หน้าอัปเดตรายการบันทึกได้โดยไม่ต้องยิงซ้ำ

export function addCustomerNote(
  id: string,
  body: string,
): Promise<{ customer: CustomerDetailDto }> {
  return apiFetch(`/api/customers/${id}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function updateCustomerNote(
  id: string,
  noteId: string,
  body: string,
): Promise<{ customer: CustomerDetailDto }> {
  return apiFetch(`/api/customers/${id}/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
}

export function deleteCustomerNote(
  id: string,
  noteId: string,
): Promise<{ customer: CustomerDetailDto }> {
  return apiFetch(`/api/customers/${id}/notes/${noteId}`, { method: "DELETE" });
}
