import type {
  CustomerAccessLinkResult,
  ProjectActivityDto,
  ProjectDetailDto,
  ProjectDto,
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
  },
): Promise<{ version: ProjectVersionDto }> {
  return apiFetch(`/api/projects/${projectId}/rates`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** ไทม์ไลน์กิจกรรมของโครงการ — โหลดแยกจากรายละเอียดหลัก จึงไม่ถ่วงการแสดงผลหน้าแรก */
export function getProjectActivity(id: string): Promise<{ activity: ProjectActivityDto[] }> {
  return apiFetch(`/api/projects/${id}/activity`);
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
