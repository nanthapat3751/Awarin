import type { Prisma } from "@prisma/client";

import { writeAuditLog } from "../../lib/audit-log";
import {
  type ContractStructure,
  DEFAULT_CONTRACT_TEMPLATE,
  unknownVariables,
} from "../../lib/contract-template";
import { prisma } from "../../lib/prisma";
import type {
  CreateContractTemplateInput,
  UpdateContractTemplateInput,
} from "./contractTemplates.schemas";

export class ContractTemplateError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ContractTemplateError";
    this.status = status;
  }
}

/**
 * สร้างแม่แบบมาตรฐานให้อัตโนมัติเมื่อระบบยังไม่มีแม่แบบสักอัน
 *
 * ทำแบบ lazy แทนการใส่ใน seed เพราะฐานข้อมูลที่ใช้งานจริงอยู่แล้วจะไม่ถูก seed ซ้ำ —
 * ถ้าพึ่ง seed อย่างเดียว ระบบที่รันอยู่จะไม่มีแม่แบบเลยและออกสัญญาไม่ได้
 * ปลอดภัยเมื่อเรียกซ้ำ: เช็คก่อนว่ามีแม่แบบที่ยังไม่ถูกลบอยู่หรือยัง
 */
export async function ensureDefaultContractTemplate(actorId: string) {
  const existing = await prisma.contractTemplate.findFirst({ where: { deletedAt: null } });
  if (existing) return existing;

  return prisma.contractTemplate.create({
    data: {
      name: DEFAULT_CONTRACT_TEMPLATE.name,
      description: DEFAULT_CONTRACT_TEMPLATE.description,
      docTitle: DEFAULT_CONTRACT_TEMPLATE.docTitle,
      structure: DEFAULT_CONTRACT_TEMPLATE.structure as unknown as Prisma.InputJsonValue,
      isDefault: true,
      createdById: actorId,
    },
  });
}

export async function listContractTemplates(actorId: string) {
  await ensureDefaultContractTemplate(actorId);
  return prisma.contractTemplate.findMany({
    where: { deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export async function getContractTemplateOrThrow(id: string) {
  const template = await prisma.contractTemplate.findFirst({ where: { id, deletedAt: null } });
  if (!template) throw new ContractTemplateError("ไม่พบแม่แบบสัญญาที่ระบุ", 404);
  return template;
}

/** แม่แบบที่จะใช้เมื่อออกสัญญาโดยไม่ระบุ — ตัวที่ตั้งเป็นค่าเริ่มต้น ไม่มีก็หยิบตัวแรก */
export async function resolveTemplateForContract(templateId: string | undefined, actorId: string) {
  if (templateId) return getContractTemplateOrThrow(templateId);
  await ensureDefaultContractTemplate(actorId);
  const preferred = await prisma.contractTemplate.findFirst({
    where: { deletedAt: null, isDefault: true },
  });
  if (preferred) return preferred;
  const any = await prisma.contractTemplate.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (!any) throw new ContractTemplateError("ยังไม่มีแม่แบบสัญญาในระบบ", 409);
  return any;
}

export async function createContractTemplate(
  input: CreateContractTemplateInput,
  actorId: string,
) {
  const template = await prisma.contractTemplate.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      docTitle: input.docTitle,
      structure: input.structure as unknown as Prisma.InputJsonValue,
      createdById: actorId,
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: "CREATE_CONTRACT_TEMPLATE",
    entityType: "ContractTemplate",
    entityId: template.id,
    details: { name: template.name },
  });

  return template;
}

export async function updateContractTemplate(
  id: string,
  input: UpdateContractTemplateInput,
  actorId: string,
) {
  await getContractTemplateOrThrow(id);

  const data: Prisma.ContractTemplateUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.docTitle !== undefined) data.docTitle = input.docTitle;
  if (input.structure !== undefined) {
    data.structure = input.structure as unknown as Prisma.InputJsonValue;
  }

  const template = await prisma.contractTemplate.update({ where: { id }, data });

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_CONTRACT_TEMPLATE",
    entityType: "ContractTemplate",
    entityId: id,
    details: { name: template.name, clauseCount: input.structure?.clauses.length },
  });

  return template;
}

/**
 * ตั้งเป็นแม่แบบเริ่มต้น — ต้องปลดตัวเดิมก่อนใน transaction เดียวกัน
 * เพราะฐานข้อมูลมี partial unique index บังคับว่ามี isDefault = true ได้แค่แถวเดียว
 */
export async function setDefaultContractTemplate(id: string, actorId: string) {
  await getContractTemplateOrThrow(id);

  const template = await prisma.$transaction(async (tx) => {
    await tx.contractTemplate.updateMany({
      where: { isDefault: true, deletedAt: null, id: { not: id } },
      data: { isDefault: false },
    });
    return tx.contractTemplate.update({ where: { id }, data: { isDefault: true } });
  });

  await writeAuditLog({
    userId: actorId,
    action: "SET_DEFAULT_CONTRACT_TEMPLATE",
    entityType: "ContractTemplate",
    entityId: id,
    details: { name: template.name },
  });

  return template;
}

export async function deleteContractTemplate(id: string, actorId: string) {
  const template = await getContractTemplateOrThrow(id);

  // แม่แบบเริ่มต้นถูกใช้ทุกครั้งที่ออกสัญญา — ลบแล้วออกสัญญาไม่ได้ ต้องย้ายธงไปตัวอื่นก่อน
  if (template.isDefault) {
    const others = await prisma.contractTemplate.count({
      where: { deletedAt: null, id: { not: id } },
    });
    throw new ContractTemplateError(
      others > 0
        ? "แม่แบบนี้เป็นค่าเริ่มต้นอยู่ — ตั้งแม่แบบอื่นเป็นค่าเริ่มต้นก่อนจึงจะลบได้"
        : "ลบไม่ได้ เพราะเป็นแม่แบบสัญญาเพียงอันเดียวในระบบ",
      409,
    );
  }

  await prisma.contractTemplate.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: actorId },
  });

  await writeAuditLog({
    userId: actorId,
    action: "DELETE_CONTRACT_TEMPLATE",
    entityType: "ContractTemplate",
    entityId: id,
    details: { name: template.name, trashed: true },
  });
}

/** ตัวแปรที่พิมพ์ผิด — เตือนเฉย ๆ ไม่บล็อกการบันทึก (ดู fillVariables ว่าทำไมไม่ลบทิ้ง) */
export function warnUnknownVariables(structure: ContractStructure): string[] {
  return unknownVariables(structure);
}
