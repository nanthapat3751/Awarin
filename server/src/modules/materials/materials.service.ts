import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit-log";
import { deriveMaterialUnitPrice } from "../../lib/pricing";
import { nextMaterialCode } from "../../lib/work-code";
import type { MaterialComponentInputDto } from "../boq/boq.schemas";
import { isCategoryChainActive } from "../categories/categories.service";
import type { CreateMaterialInput, UpdateMaterialInput } from "./materials.schemas";
import { roundTo } from "@systemboq/shared-types";

export class MaterialError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MaterialError";
    this.status = status;
  }
}

// เรียงวัสดุย่อยตาม sortOrder เสมอ — ให้ทั้งแคตตาล็อกและ snapshot ในบรรทัดใช้ลำดับเดียวกัน
const componentsInclude = { components: { orderBy: { sortOrder: "asc" as const } } };

type TileFields = Pick<CreateMaterialInput, "tileWidthMm" | "tileLengthMm" | "tileThicknessMm" | "tilePiecesPerBox">;

/**
 * ขนาดกระเบื้องที่จะเขียน — undefined = ไม่แตะ (ตอนแก้)
 * กว้างกับยาวต้องมาคู่กัน: มีด้านเดียวตัวคิดเอาไปใช้ไม่ได้ และจะดูเหมือนตั้งไว้แล้วทั้งที่ยังไม่ครบ
 */
function tileData(input: TileFields, existing?: { tileWidthMm: number | null; tileLengthMm: number | null }) {
  const width = input.tileWidthMm === undefined ? (existing?.tileWidthMm ?? null) : input.tileWidthMm;
  const length = input.tileLengthMm === undefined ? (existing?.tileLengthMm ?? null) : input.tileLengthMm;
  if ((width == null) !== (length == null)) {
    throw new MaterialError("ขนาดกระเบื้องต้องกรอกทั้งกว้างและยาว (หรือเว้นว่างทั้งคู่)");
  }
  return {
    tileWidthMm: input.tileWidthMm,
    tileLengthMm: input.tileLengthMm,
    tileThicknessMm: input.tileThicknessMm,
    tilePiecesPerBox: input.tilePiecesPerBox,
  };
}

// ราคาวัสดุต่อหน่วยของแคตตาล็อกจากสูตร (ให้ตรงกับตอน snapshot ลงบรรทัด BOQ)
function derivedPrice(components: MaterialComponentInputDto[]): number {
  return deriveMaterialUnitPrice(
    components.map((c) => ({ qtyPerUnit: c.qtyPerUnit, wasteFactorPct: c.wasteFactorPct ?? null, unitPrice: c.unitPrice })),
  );
}

function componentCreateData(components: MaterialComponentInputDto[]) {
  return components.map((c, i) => ({
    componentMaterialId: c.componentMaterialId ?? null,
    name: c.name,
    unit: c.unit,
    qtyPerUnit: c.qtyPerUnit,
    wasteFactorPct: c.wasteFactorPct ?? null,
    unitPrice: c.unitPrice,
    sortOrder: c.sortOrder ?? i,
  }));
}

// วัสดุย่อยที่อ้างวัสดุดิบจากแคตตาล็อกต้องมีอยู่จริง และห้ามอ้างตัวเอง (กันสูตรวนซ้ำชั้นเดียว)
async function validateComponentRefs(components: MaterialComponentInputDto[], selfId?: string) {
  const refIds = [...new Set(components.map((c) => c.componentMaterialId).filter((x): x is string => Boolean(x)))];
  if (selfId && refIds.includes(selfId)) {
    throw new MaterialError("วัสดุย่อยอ้างอิงตัวเองไม่ได้");
  }
  if (refIds.length) {
    const found = await prisma.material.findMany({
      where: { id: { in: refIds }, deletedAt: null },
      select: { id: true },
    });
    if (found.length !== refIds.length) {
      throw new MaterialError("มีวัสดุย่อยอ้างอิงวัสดุที่ไม่พบในระบบ", 404);
    }
  }
}

export async function listMaterials(categoryId?: string) {
  return prisma.material.findMany({
    // ถังขยะ: ไม่แสดงวัสดุที่ถูกลบ (อยู่ในถังขยะ)
    where: { deletedAt: null, ...(categoryId ? { categoryId } : {}) },
    // ลำดับในแคตตาล็อกเรียงตามรหัส; อันที่ยังไม่มีรหัสจะตกไปอยู่ล่างสุด
    orderBy: [{ code: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    include: componentsInclude,
  });
}

async function assertCategoryExists(categoryId: string | null | undefined): Promise<void> {
  if (!categoryId) return;
  const category = await prisma.workCategory.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw new MaterialError("ไม่พบหมวดงานที่ระบุ", 404);
  }
  if (category.level !== "ITEM") {
    throw new MaterialError("รายการวัสดุ/ค่าแรงต้องผูกกับหมวดงานระดับ ITEM เท่านั้น");
  }
}

export async function createMaterial(input: CreateMaterialInput, actorId: string) {
  await assertCategoryExists(input.categoryId ?? null);
  if (input.categoryId && !(await isCategoryChainActive(input.categoryId))) {
    throw new MaterialError("หมวดงานนี้ถูกปิดใช้งานแล้ว ไม่สามารถเพิ่มวัสดุใหม่ได้", 409);
  }

  const components = input.components ?? [];
  if (components.length) await validateComponentRefs(components);

  const material = await prisma.material.create({
    data: {
      categoryId: input.categoryId ?? null,
      code: await nextMaterialCode(),
      name: input.name,
      spec: input.spec ?? null,
      unit: input.unit,
      supplier: input.supplier ?? null,
      // มีสูตร → ราคาวัสดุต่อหน่วยคิดจากผลรวมของสูตร (ให้ตรงกับตอน snapshot ลง BOQ)
      materialUnitPrice: components.length ? derivedPrice(components) : input.materialUnitPrice,
      laborUnitPrice: input.laborUnitPrice,
      wasteFactorPct: input.wasteFactorPct ?? null,
      ...tileData(input),
      components: components.length ? { create: componentCreateData(components) } : undefined,
    },
    include: componentsInclude,
  });

  await writeAuditLog({
    userId: actorId,
    action: "CREATE_MATERIAL",
    entityType: "Material",
    entityId: material.id,
    details: { name: material.name },
  });

  return material;
}

export async function updateMaterial(
  id: string,
  input: UpdateMaterialInput,
  actorId: string,
) {
  // ถังขยะ: วัสดุที่ถูกลบแก้ไขไม่ได้ (findFirst เพราะ where มี deletedAt ที่ไม่ unique)
  const existing = await prisma.material.findFirst({
    where: { id, deletedAt: null },
    include: componentsInclude,
  });
  if (!existing) {
    throw new MaterialError("ไม่พบรายการที่ระบุ", 404);
  }

  if (input.categoryId !== undefined) {
    await assertCategoryExists(input.categoryId);
  }

  // สูตร: ไม่ส่ง = ไม่แก้ (แต่ถ้ามีสูตรอยู่ คงราคาให้ = ผลรวมของสูตรเดิม กันพนักงานแก้ราคาก้อนแล้วเพี้ยน);
  // null/[] = ล้างสูตรกลับเป็นวัสดุก้อนเดียว; มีรายการ = แทนทั้งชุด แล้วคิดราคาต่อหน่วยใหม่จากผลรวม
  const willTouchComponents = input.components !== undefined;
  const nextComponents = willTouchComponents ? input.components ?? [] : null;
  if (nextComponents?.length) await validateComponentRefs(nextComponents, id);

  let materialUnitPrice = input.materialUnitPrice;
  if (nextComponents?.length) {
    materialUnitPrice = derivedPrice(nextComponents);
  } else if (!willTouchComponents && existing.components.length) {
    materialUnitPrice = derivedPrice(
      existing.components.map((c) => ({
        componentMaterialId: c.componentMaterialId,
        name: c.name,
        unit: c.unit,
        qtyPerUnit: Number(c.qtyPerUnit),
        wasteFactorPct: c.wasteFactorPct != null ? Number(c.wasteFactorPct) : null,
        unitPrice: Number(c.unitPrice),
      })),
    );
  }

  const nextMaterialPrice = materialUnitPrice ?? Number(existing.materialUnitPrice);
  const nextLaborPrice = input.laborUnitPrice ?? Number(existing.laborUnitPrice);
  const priceChanged =
    roundTo(nextMaterialPrice, 2) !== roundTo(Number(existing.materialUnitPrice), 2) ||
    roundTo(nextLaborPrice, 2) !== roundTo(Number(existing.laborUnitPrice), 2);

  const material = await prisma.material.update({
    where: { id },
    data: {
      // เฉพาะเมื่อราคาขยับจริง — ใช้เตือนโครงการที่ยังใช้ราคาเก่า (แก้ชื่อ/สเปกไม่นับ)
      priceChangedAt: priceChanged ? new Date() : undefined,
      categoryId: input.categoryId === undefined ? undefined : input.categoryId,
      name: input.name,
      spec: input.spec,
      unit: input.unit,
      supplier: input.supplier,
      materialUnitPrice,
      laborUnitPrice: input.laborUnitPrice,
      wasteFactorPct: input.wasteFactorPct,
      ...tileData(input, existing),
      active: input.active,
      components: willTouchComponents
        ? {
            deleteMany: {},
            ...(nextComponents?.length
              ? { create: componentCreateData(nextComponents) }
              : {}),
          }
        : undefined,
    },
    include: componentsInclude,
  });

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_MATERIAL",
    entityType: "Material",
    entityId: material.id,
    details: {
      name: material.name,
      materialUnitPrice: material.materialUnitPrice.toString(),
      laborUnitPrice: material.laborUnitPrice.toString(),
    },
  });

  return material;
}

export async function deleteMaterial(id: string, actorId: string): Promise<void> {
  const existing = await prisma.material.findUnique({ where: { id } });
  if (!existing) {
    throw new MaterialError("ไม่พบรายการที่ระบุ", 404);
  }

  const boqItemCount = await prisma.boqItem.count({ where: { materialId: id } });
  if (boqItemCount > 0) {
    throw new MaterialError("ไม่สามารถลบรายการที่ถูกใช้ใน BOQ อยู่ได้ ปิดใช้งาน (active=false) แทน", 409);
  }

  // ถังขยะ: ย้ายเข้าถังขยะแทนการลบจริง (กู้คืนได้; auto-purge เกิน 30 วัน) — เงื่อนไข guard ด้านบนคงเดิม
  await prisma.material.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actorId } });

  await writeAuditLog({
    userId: actorId,
    action: "DELETE_MATERIAL",
    entityType: "Material",
    entityId: id,
    details: { name: existing.name, trashed: true },
  });
}
