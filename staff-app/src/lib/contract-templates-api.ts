import type {
  ContractStructureDto,
  ContractTemplateDto,
  ContractVariableInfo,
} from "@systemboq/shared-types";

import { apiFetch } from "./api";

interface TemplateListResult {
  templates: ContractTemplateDto[];
  /** ชื่อตัวแปรที่ใช้ได้ — เซิร์ฟเวอร์เป็นเจ้าของรายการนี้ หน้าจอไม่ควรฮาร์ดโค้ดเอง */
  variables: string[];
  /** โทเคนบล็อก เช่น ตารางงวดงาน — ไม่ใช่ข้อความ แต่เป็นตารางที่วาดตอนออก PDF */
  blockTokens: string[];
  /** กลุ่ม + "จะพิมพ์ออกมาเป็นอะไร" ของตัวแปรแต่ละตัว (ฝั่งบริษัทเป็นค่าจริงจากหน้าตั้งค่า) */
  variableInfo: ContractVariableInfo[];
}

interface TemplateSaveResult {
  template: ContractTemplateDto;
  /** ตัวแปรที่พิมพ์ผิด — เตือนเฉย ๆ ไม่ได้บล็อกการบันทึก */
  unknownVariables: string[];
}

export function listContractTemplates(): Promise<TemplateListResult> {
  return apiFetch("/api/contract-templates");
}

export function getContractTemplate(
  id: string,
): Promise<{ template: ContractTemplateDto; variables: string[]; blockTokens: string[] }> {
  return apiFetch(`/api/contract-templates/${id}`);
}

export function createContractTemplate(input: {
  name: string;
  description?: string | null;
  docTitle: string;
  structure: ContractStructureDto;
}): Promise<TemplateSaveResult> {
  return apiFetch("/api/contract-templates", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateContractTemplate(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    docTitle?: string;
    structure?: ContractStructureDto;
  },
): Promise<TemplateSaveResult> {
  return apiFetch(`/api/contract-templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function setDefaultContractTemplate(
  id: string,
): Promise<{ template: ContractTemplateDto }> {
  return apiFetch(`/api/contract-templates/${id}/default`, { method: "POST" });
}

export function deleteContractTemplate(id: string): Promise<void> {
  return apiFetch(`/api/contract-templates/${id}`, { method: "DELETE" });
}
