import type { TileCalcConfig } from "@systemboq/shared-types";

import { BOQ_ITEM_ORDER } from "../../lib/boq-order";
import { writeAuditLog } from "../../lib/audit-log";
import { prisma } from "../../lib/prisma";
import { addBoqItem } from "../boq/boq.service";
import type { CreateBoqItemInput } from "../boq/boq.schemas";
import type { UpdateTemplateItemInput } from "./templates.schemas";

export class TemplateError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TemplateError";
    this.status = status;
  }
}

// ถ่ายสแนปช็อตไว้ตอนบันทึก materialId/categoryId เก็บเป็นการอ้างอิงแบบ live (แก้ค่าใหม่ตอน
// นำไปใช้ ราคาจึงเป็นปัจจุบันตามแคตตาล็อก) โดยมี name/unit/ราคา เป็น fallback สำหรับบรรทัด
// เฉพาะกิจที่ไม่เคยผูกกับแถวใน Material catalog
//
// สูตรถอดปริมาณ (qtyBasis/qtyCoefficient/wasteFactorPct) เก็บติดแม่แบบไปด้วย (Phase 3): บรรทัด
// ที่ผูกกับค่าวัด (PER_AREA ฯลฯ) จะ "คิดปริมาณใหม่" ตามพื้นที่/ค่าวัดของโครงการปลายทางตอนนำไปใช้
// แทนที่จะยึด quantity ที่แช่แข็งไว้ — ฟิลด์เหล่านี้เป็น optional เพื่อรองรับแม่แบบเก่าที่ไม่มีค่า
// (แม่แบบเก่า = ถือว่า MANUAL ใช้ quantity เดิม พฤติกรรมไม่เปลี่ยน)
export interface TemplateComponentSnapshot {
  componentMaterialId: string | null;
  name: string;
  unit: string;
  qtyPerUnit: number;
  wasteFactorPct: number | null;
  unitPrice: number;
  sortOrder: number;
}

export interface TemplateItemSnapshot {
  categoryId: string;
  materialId: string | null;
  name: string;
  unit: string;
  materialUnitPrice: number;
  laborUnitPrice: number;
  quantity: number;
  qtyBasis?: string;
  qtyCoefficient?: number | null;
  wasteFactorPct?: number | null;
  note: string | null;
  // สูตรวัสดุย่อยที่ติดมากับบรรทัด (ว่าง/ไม่มี = วัสดุก้อนเดียว หรือแม่แบบเก่าที่บันทึกก่อนมีฟีเจอร์นี้)
  components?: TemplateComponentSnapshot[];
  // ค่าตัวคิดกระเบื้อง — ไปถึงโครงการปลายทางแล้วคิดจากพื้นที่ของบรรทัดที่นั่น (ไม่มีขนาดห้องของแบบเดิม)
  tileCalc?: TileCalcConfig | null;
}

function isTemplateStructure(value: unknown): value is TemplateItemSnapshot[] {
  return Array.isArray(value);
}

/** แปลงคอลัมน์ JSON `structure` ของ Template เป็นสแนปช็อตของรายการ (คืน [] ถ้ารูปแบบผิด) */
export function getTemplateStructure(template: { structure: unknown }): TemplateItemSnapshot[] {
  return isTemplateStructure(template.structure) ? template.structure : [];
}

/**
 * template BOQ มาตรฐานของแบบบ้าน — อันที่บันทึกล่าสุดที่ผูกกับแบบนั้น หรือ null เมื่อแบบยัง
 * ไม่มีเลย ใช้ตั้งต้นโปรเจกต์ใหม่ และใช้คิดราคาให้แบบบ้าน
 */
export function findStandardTemplateForDesign(houseDesignId: string) {
  return prisma.template.findFirst({
    // ถังขยะ: ไม่ใช้แม่แบบที่ถูกลบ
    where: { houseDesignId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function listTemplates() {
  // ถังขยะ: ไม่แสดงแม่แบบที่ถูกลบ
  const templates = await prisma.template.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    houseDesignId: t.houseDesignId,
    itemCount: isTemplateStructure(t.structure) ? t.structure.length : 0,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));
}

/**
 * รายละเอียดของแม่แบบหนึ่งอัน: meta + รายการ BOQ ใน structure snapshot โดย resolve หมวดของ
 * แต่ละบรรทัดให้เป็น รหัส/ชื่อ (ทั้งหมวดล่างสุดและหมวดใหญ่บนสุด) เพื่อให้ฝั่งหน้าเว็บจัดกลุ่ม
 * ตามหมวดงานแล้วแสดงเป็นตารางอ่านง่ายได้ ใช้ตอนกดดูรายละเอียดก่อนสร้างโครงการหรือลบ
 */
export async function getTemplateDetail(id: string) {
  // ถังขยะ: แม่แบบที่ถูกลบถือว่าไม่พบ (findFirst เพราะ where มี deletedAt ที่ไม่ unique)
  const template = await prisma.template.findFirst({ where: { id, deletedAt: null } });
  if (!template) {
    throw new TemplateError("ไม่พบแม่แบบที่ระบุ", 404);
  }

  const structure = getTemplateStructure(template);
  const categories = await prisma.workCategory.findMany();
  const byId = new Map(categories.map((c) => [c.id, c]));

  // ไล่หมวดจากบรรทัดขึ้นไปจนถึงราก แล้วคืนเป็นสายจากบนลงล่าง [หมวดใหญ่, หมวดย่อย, ..., งานย่อย]
  // ใช้ทั้งจัดกลุ่มตามหมวดใหญ่ และคั่นหมวดย่อย (ระดับ 2) ในตารางฝั่งหน้าเว็บ
  function ancestorChain(categoryId: string) {
    const chain: NonNullable<ReturnType<typeof byId.get>>[] = [];
    let current = byId.get(categoryId);
    while (current) {
      chain.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return chain;
  }

  const items = structure.map((s, index) => {
    const category = byId.get(s.categoryId);
    const chain = ancestorChain(s.categoryId);
    const top = chain[0];
    // หมวดย่อยระดับ 2 — ไม่มีเมื่อหมวดของบรรทัดลึกไม่ถึง 2 ชั้น
    const sub = chain.length >= 2 ? chain[1] : undefined;
    return {
      // ตำแหน่งใน structure array — ให้หน้าเว็บอ้างอิงตอนแก้สูตรของบรรทัดนั้นโดยตรง
      index,
      categoryId: s.categoryId,
      categoryCode: category?.code ?? null,
      categoryName: category?.name ?? "ไม่ระบุหมวด",
      topCategoryCode: top?.code ?? null,
      topCategoryName: top?.name ?? "ไม่ระบุหมวด",
      subCategoryCode: sub?.code ?? null,
      subCategoryName: sub?.name ?? null,
      name: s.name,
      unit: s.unit,
      quantity: String(s.quantity),
      // สูตรถอดปริมาณ (default MANUAL สำหรับแม่แบบเก่าที่ไม่มีค่า) ให้หน้าเว็บโชว์ว่า
      // บรรทัดนี้จะคิดปริมาณตามค่าวัดโครงการอัตโนมัติหรือไม่
      qtyBasis: s.qtyBasis ?? "MANUAL",
      qtyCoefficient: s.qtyCoefficient != null ? String(s.qtyCoefficient) : null,
      wasteFactorPct: s.wasteFactorPct != null ? String(s.wasteFactorPct) : null,
      materialUnitPrice: String(s.materialUnitPrice),
      laborUnitPrice: String(s.laborUnitPrice),
      note: s.note,
      // สูตรวัสดุย่อยที่ติดมากับบรรทัดของแม่แบบ (ว่าง = วัสดุก้อนเดียว/แม่แบบเก่า) — Decimal → string
      components: (s.components ?? []).map((c) => ({
        componentMaterialId: c.componentMaterialId,
        name: c.name,
        unit: c.unit,
        qtyPerUnit: String(c.qtyPerUnit),
        wasteFactorPct: c.wasteFactorPct != null ? String(c.wasteFactorPct) : null,
        unitPrice: String(c.unitPrice),
        sortOrder: c.sortOrder,
      })),
    };
  });

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    houseDesignId: template.houseDesignId,
    itemCount: items.length,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    items,
  };
}

export async function updateTemplate(
  id: string,
  input: { name?: string; description?: string | null },
  actorId: string,
) {
  const existing = await prisma.template.findUnique({ where: { id } });
  if (!existing) {
    throw new TemplateError("ไม่พบแม่แบบที่ระบุ", 404);
  }

  const template = await prisma.template.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_TEMPLATE",
    entityType: "Template",
    entityId: id,
  });

  return template;
}

/**
 * แก้สูตรถอดปริมาณของบรรทัดหนึ่งในแม่แบบโดยตรง (basis/สัมประสิทธิ์/เผื่อเสีย หรือปริมาณของ MANUAL)
 * โดยเขียนทับ structure[index] — ให้ปรับแม่แบบได้โดยไม่ต้อง save-as โปรเจกต์ใหม่ทั้งชุด
 * MANUAL: เก็บ quantity ที่กรอก + ล้าง coefficient/waste; ฐานอื่น: เก็บ coefficient/waste + คง
 * quantity เดิมไว้เป็น fallback (ใช้เมื่อโครงการปลายทางไม่มีค่าวัดของฐานนั้น)
 */
export async function updateTemplateItemRecipe(
  id: string,
  index: number,
  input: UpdateTemplateItemInput,
  actorId: string,
) {
  // ถังขยะ: แม่แบบที่ถูกลบแก้สูตรไม่ได้
  const template = await prisma.template.findFirst({ where: { id, deletedAt: null } });
  if (!template) {
    throw new TemplateError("ไม่พบแม่แบบที่ระบุ", 404);
  }
  const structure = getTemplateStructure(template);
  if (!Number.isInteger(index) || index < 0 || index >= structure.length) {
    throw new TemplateError("ไม่พบรายการที่ระบุในแม่แบบ", 404);
  }

  const current = structure[index];
  const updated: TemplateItemSnapshot =
    input.qtyBasis === "MANUAL"
      ? {
          ...current,
          quantity: input.quantity ?? current.quantity,
          qtyBasis: "MANUAL",
          qtyCoefficient: null,
          wasteFactorPct: null,
        }
      : {
          ...current,
          qtyBasis: input.qtyBasis,
          qtyCoefficient: input.qtyCoefficient ?? null,
          wasteFactorPct: input.wasteFactorPct ?? null,
        };

  const nextStructure = structure.map((s, i) => (i === index ? updated : s));
  await prisma.template.update({
    where: { id },
    data: { structure: nextStructure as unknown as object },
  });

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_TEMPLATE_ITEM",
    entityType: "Template",
    entityId: id,
    details: { index, qtyBasis: updated.qtyBasis },
  });

  return getTemplateDetail(id);
}

export async function deleteTemplate(id: string, actorId: string) {
  const existing = await prisma.template.findUnique({ where: { id } });
  if (!existing) {
    throw new TemplateError("ไม่พบแม่แบบที่ระบุ", 404);
  }
  // ถังขยะ: ย้ายเข้าถังขยะแทนการลบจริง (กู้คืนได้; auto-purge เกิน 30 วัน)
  await prisma.template.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actorId } });
  await writeAuditLog({
    userId: actorId,
    action: "DELETE_TEMPLATE",
    entityType: "Template",
    entityId: id,
    details: { name: existing.name, trashed: true },
  });
}

export async function saveProjectAsTemplate(
  projectId: string,
  name: string,
  description: string | null,
  actorId: string,
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new TemplateError("ไม่พบโครงการที่ระบุ", 404);
  }

  const version = await prisma.projectVersion.findFirst({
    where: { projectId },
    orderBy: { versionNo: "desc" },
  });
  if (!version) {
    throw new TemplateError("ไม่พบเวอร์ชันโครงการ", 404);
  }

  const items = await prisma.boqItem.findMany({
    where: { projectVersionId: version.id },
    orderBy: BOQ_ITEM_ORDER,
    include: { components: { orderBy: { sortOrder: "asc" } } },
  });
  if (items.length === 0) {
    throw new TemplateError("โครงการนี้ยังไม่มีรายการ BOQ ให้บันทึกเป็นแม่แบบ", 409);
  }

  const structure: TemplateItemSnapshot[] = items.map((item) => ({
    categoryId: item.categoryId,
    materialId: item.materialId,
    name: item.name,
    unit: item.unit,
    materialUnitPrice: Number(item.materialUnitPrice),
    laborUnitPrice: Number(item.laborUnitPrice),
    quantity: Number(item.quantity),
    // เก็บสูตรถอดปริมาณติดไปด้วย เพื่อให้แม่แบบ "คิดปริมาณตามพื้นที่" ได้เองตอนนำไปใช้ (Phase 3)
    // ใบถอดแบบเป็นของแบบหลังนี้เท่านั้น (ขนาดชิ้นส่วนจริงของโครงการ) — แม่แบบเก็บเป็นปริมาณคงที่
    qtyBasis: item.qtyBasis === "SHEET" ? "MANUAL" : item.qtyBasis,
    qtyCoefficient: item.qtyCoefficient != null ? Number(item.qtyCoefficient) : null,
    wasteFactorPct: item.qtyBasis !== "SHEET" && item.wasteFactorPct != null ? Number(item.wasteFactorPct) : null,
    note: item.note,
    // เก็บสูตรวัสดุย่อยติดไปด้วย (ถอดปริมาณวัสดุ) — ว่าง = วัสดุก้อนเดียว
    components: item.components.length
      ? item.components.map((c) => ({
          componentMaterialId: c.componentMaterialId,
          name: c.name,
          unit: c.unit,
          qtyPerUnit: Number(c.qtyPerUnit),
          wasteFactorPct: c.wasteFactorPct != null ? Number(c.wasteFactorPct) : null,
          unitPrice: Number(c.unitPrice),
          sortOrder: c.sortOrder,
        }))
      : undefined,
    tileCalc: item.tileCalc ? (item.tileCalc as unknown as TileCalcConfig) : undefined,
  }));

  const template = await prisma.template.create({
    data: {
      name,
      description,
      houseDesignId: project.houseDesignId,
      structure: structure as unknown as object,
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: "CREATE_TEMPLATE",
    entityType: "Template",
    entityId: template.id,
    details: { projectId, name, itemCount: structure.length },
  });

  return template;
}

/**
 * ฐานคำนวณจากแม่แบบ: ถ้าเป็นฐานที่ผูกค่าวัดและมีสัมประสิทธิ์ครบ addBoqItem จะคิดปริมาณใหม่
 * จากค่าวัดของโครงการ "ปลายทาง" (พื้นที่/ผนัง/รอบรูป/ปริมาตร) เอง — นี่คือหัวใจของ Phase 3
 * แม่แบบเก่า/บรรทัดที่ขาดสัมประสิทธิ์ = ถอยเป็น MANUAL ใช้ quantity ที่บันทึกไว้ (พฤติกรรมเดิม)
 */
function boqInputFromTemplateLine(line: TemplateItemSnapshot): CreateBoqItemInput {
  const usesDriver = Boolean(line.qtyBasis) && line.qtyBasis !== "MANUAL" && line.qtyCoefficient != null;
  return {
    categoryId: line.categoryId,
    materialId: line.materialId ?? undefined,
    name: line.materialId ? undefined : line.name,
    unit: line.materialId ? undefined : line.unit,
    materialUnitPrice: line.materialId ? undefined : line.materialUnitPrice,
    laborUnitPrice: line.materialId ? undefined : line.laborUnitPrice,
    // quantity คงส่งเป็น fallback เสมอ (ใช้เมื่อโครงการปลายทางไม่มีค่าวัดของฐานนั้น)
    quantity: line.quantity,
    qtyBasis: usesDriver ? (line.qtyBasis as CreateBoqItemInput["qtyBasis"]) : "MANUAL",
    qtyCoefficient: usesDriver ? line.qtyCoefficient : null,
    wasteFactorPct: usesDriver ? (line.wasteFactorPct ?? null) : null,
    note: line.note ?? undefined,
    // ส่งสูตรวัสดุย่อยที่ freeze ไว้ในแม่แบบต่อไปยังบรรทัดใหม่ (undefined สำหรับแม่แบบเก่า →
    // ถ้าบรรทัดผูก materialId ที่มีสูตรในแคตตาล็อก addBoqItem จะดึงสูตรมาให้เอง)
    components: line.components
      ? line.components.map((c) => ({
          componentMaterialId: c.componentMaterialId,
          name: c.name,
          unit: c.unit,
          qtyPerUnit: c.qtyPerUnit,
          wasteFactorPct: c.wasteFactorPct,
          unitPrice: c.unitPrice,
          sortOrder: c.sortOrder,
        }))
      : undefined,
    tileCalc: line.tileCalc ?? undefined,
  };
}

export async function applyTemplateToProject(projectId: string, templateId: string, actorId: string) {
  // ถังขยะ: ทั้งโครงการและแม่แบบต้องไม่อยู่ในถังขยะ
  const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!project) {
    throw new TemplateError("ไม่พบโครงการที่ระบุ", 404);
  }

  const template = await prisma.template.findFirst({ where: { id: templateId, deletedAt: null } });
  if (!template) {
    throw new TemplateError("ไม่พบแม่แบบที่ระบุ", 404);
  }

  // ตั้งใจให้ใช้ตั้งต้นโปรเจกต์ใหม่ที่ยังว่างอยู่เท่านั้น — การนำไปใช้กับโปรเจกต์ที่มีรายการ BOQ
  // อยู่แล้วจะทำให้บรรทัดจาก template ปนกับงานจริงที่กรอกด้วยมือเงียบ ๆ ซึ่งสับสนมากกว่ามีประโยชน์
  const existingItemCount = await prisma.boqItem.count({
    where: { projectVersion: { projectId } },
  });
  if (existingItemCount > 0) {
    throw new TemplateError(
      "ใช้แม่แบบได้เฉพาะโครงการที่ยังไม่มีรายการ BOQ เท่านั้น (ป้องกันข้อมูลปนกัน)",
      409,
    );
  }

  const structure = isTemplateStructure(template.structure) ? template.structure : [];

  let appliedCount = 0;
  let skippedCount = 0;
  for (const line of structure) {
    const category = await prisma.workCategory.findUnique({ where: { id: line.categoryId } });
    if (!category) {
      skippedCount += 1;
      continue;
    }
    try {
      await addBoqItem(projectId, boqInputFromTemplateLine(line), actorId);
      appliedCount += 1;
    } catch {
      // วัสดุที่อ้างอิงถูกลบ/ปิดใช้งานไปหลังจากบันทึก template — ข้ามบรรทัดนั้นบรรทัดเดียว
      // แทนที่จะทำให้การนำ template ไปใช้ล้มเหลวทั้งหมด
      skippedCount += 1;
    }
  }

  if (appliedCount === 0) {
    throw new TemplateError(
      "ไม่สามารถใช้แม่แบบนี้ได้ (ข้อมูลอ้างอิงในแม่แบบไม่พบในระบบแล้วทั้งหมด)",
      409,
    );
  }

  await writeAuditLog({
    userId: actorId,
    action: "APPLY_TEMPLATE",
    entityType: "Project",
    entityId: projectId,
    details: { templateId, appliedCount, skippedCount },
  });

  return { appliedCount, skippedCount };
}
