import type {
  ProjectOpeningDto,
  CustomerAccessLinkResult,
  ProjectActivityDto,
  ProjectDetailDto,
  ProjectDto,
  ProjectListPageDto,
  ProjectStatus,
  ProjectType,
  ProjectVersionDto,
} from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function listProjects(filter?: {
  status?: string;
  q?: string;
}): Promise<{ projects: ProjectDto[] }> {
  const params = new URLSearchParams();
  if (filter?.status) params.set("status", filter.status);
  if (filter?.q) params.set("q", filter.q);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch(`/api/projects${query}`);
}

/** ตัวกรองของหน้ารายการ (ตรงกับ query string ของหน้า) */
export interface ListQuery {
  q?: string;
  status?: string;
  year?: number;
  month?: number | null;
  page: number;
}

export function listQueryString(query: ListQuery): string {
  const params = new URLSearchParams({ page: String(query.page) });
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.year) params.set("year", String(query.year));
  if (query.year && query.month) params.set("month", String(query.month));
  return params.toString();
}

/** หน้ารายการโครงการ หน้าละ 15 — ค้นหา/กรองที่เซิร์ฟเวอร์ */
export function listProjectsPage(query: ListQuery): Promise<ProjectListPageDto> {
  return apiFetch(`/api/projects?${listQueryString(query)}`);
}

export function createProject(input: {
  name: string;
  type?: ProjectType;
  customerId?: string | null;
  houseDesignId?: string | null;
  overheadProfitPercent?: number;
}): Promise<{ project: ProjectDto }> {
  return apiFetch("/api/projects", { method: "POST", body: JSON.stringify(input) });
}

// ตั้งราคาโครงการกำหนดเอง (CUSTOM) — กรอกยอดก่อน VAT ระบบบวก VAT ให้
export function setCustomPrice(
  projectId: string,
  subtotalBeforeVat: number,
): Promise<{ version: ProjectVersionDto }> {
  return apiFetch(`/api/projects/${projectId}/custom-price`, {
    method: "POST",
    body: JSON.stringify({ subtotalBeforeVat }),
  });
}

/**
 * แก้อัตราค่าดำเนินการ+กำไร / VAT ของโครงการที่สร้างไปแล้ว — ส่งเฉพาะค่าที่เปลี่ยนก็ได้
 * ถ้าเวอร์ชันล่าสุดส่งใบเสนอราคาไปแล้ว เซิร์ฟเวอร์จะสร้างเวอร์ชันใหม่ให้เอง (BR-07)
 */
/** โหมดส่วนลด: ยกเลิก / ลดเป็น % ของราคาก่อนส่วนลด / ลดเป็นจำนวนเงินคงที่ */
export type DiscountPatch =
  | { mode: "NONE" }
  | { mode: "PERCENT"; value: number; note?: string }
  | { mode: "AMOUNT"; value: number; note?: string };

export function updateProjectRates(
  projectId: string,
  input: {
    overheadProfitPercent?: number;
    /** ส่วนที่เป็นค่าดำเนินการในอัตรารวม — null = ล้างการแบ่ง กลับไปเป็นก้อนรวม */
    overheadPercent?: number | null;
    vatPercent?: number;
    discount?: DiscountPatch;
    /** ค่าเผื่อเหลือเผื่อขาด % ของต้นทุนตรง */
    contingencyPercent?: number;
    /** ปัดยอดสุทธิ (รวม VAT) ลงเป็นทวีคูณของหน่วยนี้ (บาท) — null = เลิกปัด */
    roundingUnit?: number | null;
  },
): Promise<{ version: ProjectVersionDto }> {
  return apiFetch(`/api/projects/${projectId}/rates`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** ไทม์ไลน์กิจกรรมของโครงการ — โหลดแยกจากรายละเอียดหลัก จึงไม่ถ่วงการแสดงผลหน้าแรก */
export function getProjectActivity(
  id: string,
  page = 1,
): Promise<{ activity: ProjectActivityDto[]; page: number; pageSize: number; total: number }> {
  return apiFetch(`/api/projects/${id}/activity?page=${page}`);
}

export function getProject(id: string): Promise<ProjectDetailDto> {
  return apiFetch(`/api/projects/${id}`);
}

export function updateProject(
  id: string,
  input: {
    name?: string;
    customerId?: string | null;
    description?: string | null;
    siteAddress?: string | null;
    areaSqm?: number | null;
    wallAreaSqm?: number | null;
    perimeterM?: number | null;
    concreteVolumeM3?: number | null;
    footprintSqm?: number | null;
    bathrooms?: number | null;
    floors?: number | null;
    // ช่องเปิดประตู/หน้าต่าง — แทนทั้งชุด · [] = ไม่หัก
    openings?: ProjectOpeningDto[];
    startDate?: string | null;
    targetEndDate?: string | null;
  },
): Promise<{ project: ProjectDto }> {
  return apiFetch(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteProject(id: string): Promise<void> {
  return apiFetch(`/api/projects/${id}`, { method: "DELETE" });
}

export function transitionProject(
  id: string,
  toStatus: ProjectStatus,
): Promise<{ project: ProjectDto }> {
  return apiFetch(`/api/projects/${id}/transition`, {
    method: "POST",
    body: JSON.stringify({ toStatus }),
  });
}

// สร้างบัญชีลูกค้าจากคำขอ (ถ้ายังไม่มี) แล้วออกลิงก์เข้าใช้ครั้งเดียวให้คัดลอกไปส่งลูกค้า
// ฟิลด์ทั้งหมด optional — ถ้าเว้นไว้ backend จะใช้ข้อมูลจากคำขอ (lead) ต้นทาง
export function issueCustomerAccessLink(
  projectId: string,
  input?: { email?: string; fullName?: string; phone?: string },
): Promise<CustomerAccessLinkResult> {
  return apiFetch(`/api/projects/${projectId}/customer-access-link`, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export function linkLeadToProject(
  projectId: string,
  leadId: string,
): Promise<{ project: ProjectDto }> {
  return apiFetch(`/api/projects/${projectId}/link-lead`, {
    method: "POST",
    body: JSON.stringify({ leadId }),
  });
}
