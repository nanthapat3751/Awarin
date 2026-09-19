import type { HouseDesign, Prisma } from "@prisma/client";

import { writeAuditLog } from "../../lib/audit-log";
import { calculatePricing } from "../../lib/pricing";
import { prisma } from "../../lib/prisma";
import { getDefaultRates } from "../../lib/settings";
import { effectiveQuantity } from "../boq/boq.service";
import { findStandardTemplateForDesign, getTemplateStructure } from "../templates/templates.service";
import type {
  CreateHouseDesignInput,
  ReorderFeaturedHouseDesignsInput,
  UpdateHouseDesignInput,
} from "./houseDesigns.schemas";

// จำนวนแบบบ้านแนะนำสูงสุดที่โชว์ในหน้าแรก
export const FEATURED_HOUSE_DESIGN_LIMIT = 6;

// ราคาคร่าว ๆ ของแบบบ้านทั้งหลัง คำนวณจาก template BOQ มาตรฐานของแบบ + อัตราเริ่มต้นของ
// บริษัท เป็นราคาเบื้องต้น/โดยประมาณ — ใบเสนอราคาจริงมาจากตัวโปรเจกต์
async function computeStandardEstimate(design: HouseDesign) {
  const template = await findStandardTemplateForDesign(design.id);
  if (!template) return null;
  const structure = getTemplateStructure(template);
  if (structure.length === 0) return null;

  const rates = await getDefaultRates();
  const area = design.area != null ? Number(design.area) : null;
  // Phase 3: คิดปริมาณของทุกบรรทัดตามค่าวัดของแบบบ้านนี้ (พื้น/ผนัง/รอบรูป/ปริมาตร) — ตัวขับ
  // ไหนที่แบบบ้านไม่มีค่า effectiveQuantity จะถอยไปใช้ quantity ที่แช่แข็งไว้ในแม่แบบให้เอง
  const num = (v: unknown) => (v != null ? Number(v) : null);
  const drivers = {
    floorArea: area,
    wallArea: num(design.wallAreaSqm),
    perimeter: num(design.perimeterM),
    volume: num(design.concreteVolumeM3),
    footprint: num(design.footprintSqm),
    bathrooms: num(design.bathrooms),
    floors: num(design.floors),
  };
  const pricing = calculatePricing(
    structure.map((s) => ({
      quantity: effectiveQuantity({
        qtyBasis: s.qtyBasis ?? "MANUAL",
        qtyCoefficient: s.qtyCoefficient ?? null,
        wasteFactorPct: s.wasteFactorPct ?? null,
        manualQuantity: s.quantity,
        drivers,
      }),
      materialUnitPrice: s.materialUnitPrice,
      laborUnitPrice: s.laborUnitPrice,
    })),
    rates.overheadProfitPct,
    rates.vatPct,
    area,
  );

  return {
    templateName: template.name,
    itemCount: structure.length,
    directCost: pricing.directCost,
    netPrice: pricing.netPrice,
    pricePerSqm: pricing.pricePerSqm,
  };
}

export class HouseDesignError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "HouseDesignError";
    this.status = status;
  }
}

export async function listHouseDesigns(publishedOnly: boolean) {
  return prisma.houseDesign.findMany({
    // ถังขยะ: ไม่แสดงแบบบ้านที่ถูกลบ (ทั้งฝั่ง staff และ published ฝั่งลูกค้า)
    where: { deletedAt: null, ...(publishedOnly ? { published: true } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

// แบบบ้านสำหรับโซน "แบบบ้านแนะนำ" ของหน้าแรก:
// - โชว์เฉพาะที่ staff ตั้ง featured และยังเผยแพร่อยู่ (ยกเลิกเผยแพร่/ลบ = หลุดเอง)
// - เรียงตามลำดับที่จัดไว้ (featuredOrder) — ไม่มี fallback ดึงแบบอื่นมาเติม
//   ถ้าไม่ได้เลือกเลย คืนลิสต์ว่าง แล้วฝั่งลูกค้าจะซ่อนโซนนี้
export async function listFeaturedHouseDesigns(limit = FEATURED_HOUSE_DESIGN_LIMIT) {
  return prisma.houseDesign.findMany({
    where: { deletedAt: null, published: true, featured: true },
    orderBy: [{ featuredOrder: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
}

export async function getHouseDesign(id: string, publishedOnly: boolean) {
  // ถังขยะ: แบบบ้านที่ถูกลบถือว่าไม่พบ (findFirst เพราะ where มี deletedAt ที่ไม่ unique)
  const design = await prisma.houseDesign.findFirst({ where: { id, deletedAt: null } });
  if (!design || (publishedOnly && !design.published)) {
    throw new HouseDesignError("ไม่พบแบบบ้านที่ระบุ", 404);
  }
  const standard = await computeStandardEstimate(design);
  return { ...design, standard };
}

export async function createHouseDesign(input: CreateHouseDesignInput, actorId: string) {
  const design = await prisma.houseDesign.create({
    data: {
      name: input.name,
      description: input.description,
      area: input.area,
      wallAreaSqm: input.wallAreaSqm,
      perimeterM: input.perimeterM,
      concreteVolumeM3: input.concreteVolumeM3,
      footprintSqm: input.footprintSqm,
      floors: input.floors,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      exteriorImages: input.exteriorImages as Prisma.InputJsonValue | undefined,
      interiorImages: input.interiorImages as Prisma.InputJsonValue | undefined,
      plans: input.plans as Prisma.InputJsonValue | undefined,
      published: input.published ?? false,
      createdById: actorId,
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: "CREATE_HOUSE_DESIGN",
    entityType: "HouseDesign",
    entityId: design.id,
    details: { name: design.name },
  });

  return design;
}

export async function updateHouseDesign(
  id: string,
  input: UpdateHouseDesignInput,
  actorId: string,
) {
  // ถังขยะ: แบบบ้านที่ถูกลบแก้ไขไม่ได้ (findFirst เพราะ where มี deletedAt ที่ไม่ unique)
  const existing = await prisma.houseDesign.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    throw new HouseDesignError("ไม่พบแบบบ้านที่ระบุ", 404);
  }

  // จัดการธง featured: ตอนเปิดใหม่ ต้องไม่เกินเพดาน และต่อท้ายลำดับให้อัตโนมัติ
  let featuredOrder: number | undefined;
  if (input.featured === true && !existing.featured) {
    const count = await prisma.houseDesign.count({ where: { featured: true, deletedAt: null } });
    if (count >= FEATURED_HOUSE_DESIGN_LIMIT) {
      throw new HouseDesignError(
        `เลือกแสดงในหน้าแรกได้สูงสุด ${FEATURED_HOUSE_DESIGN_LIMIT} แบบ กรุณาเอาบางแบบออกก่อน`,
        400,
      );
    }
    const max = await prisma.houseDesign.aggregate({
      where: { featured: true, deletedAt: null },
      _max: { featuredOrder: true },
    });
    featuredOrder = (max._max.featuredOrder ?? 0) + 1;
  }

  const design = await prisma.houseDesign.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      area: input.area,
      wallAreaSqm: input.wallAreaSqm,
      perimeterM: input.perimeterM,
      concreteVolumeM3: input.concreteVolumeM3,
      footprintSqm: input.footprintSqm,
      floors: input.floors,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      exteriorImages: input.exteriorImages as Prisma.InputJsonValue | undefined,
      interiorImages: input.interiorImages as Prisma.InputJsonValue | undefined,
      plans: input.plans as Prisma.InputJsonValue | undefined,
      published: input.published,
      featured: input.featured,
      featuredOrder,
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_HOUSE_DESIGN",
    entityType: "HouseDesign",
    entityId: design.id,
    details: { published: design.published, featured: design.featured },
  });

  return design;
}

// จัดลำดับแบบบ้านแนะนำใหม่ตามที่ลากเรียง (ตั้ง featuredOrder = ตำแหน่งในลิสต์)
export async function reorderFeaturedHouseDesigns(
  input: ReorderFeaturedHouseDesignsInput,
  actorId: string,
): Promise<void> {
  await prisma.$transaction(
    input.orderedIds.map((id, index) =>
      prisma.houseDesign.update({
        where: { id },
        data: { featuredOrder: index + 1 },
      }),
    ),
  );

  await writeAuditLog({
    userId: actorId,
    action: "REORDER_FEATURED_HOUSE_DESIGN",
    entityType: "HouseDesign",
    entityId: input.orderedIds[0] ?? "",
    details: { count: input.orderedIds.length },
  });
}

export async function deleteHouseDesign(id: string, actorId: string): Promise<void> {
  const existing = await prisma.houseDesign.findUnique({ where: { id } });
  if (!existing) {
    throw new HouseDesignError("ไม่พบแบบบ้านที่ระบุ", 404);
  }

  // ถังขยะ: นับเฉพาะโครงการ/แม่แบบที่ยังไม่ถูกลบ (ของในถังขยะไม่บล็อกการย้ายแบบบ้านเข้าถังขยะ)
  const [projectCount, templateCount] = await Promise.all([
    prisma.project.count({ where: { houseDesignId: id, deletedAt: null } }),
    prisma.template.count({ where: { houseDesignId: id, deletedAt: null } }),
  ]);
  if (projectCount > 0 || templateCount > 0) {
    throw new HouseDesignError("ไม่สามารถลบแบบบ้านที่ถูกใช้งานในโครงการหรือแม่แบบอยู่ได้", 409);
  }

  // ถังขยะ: ย้ายเข้าถังขยะแทนการลบจริง (กู้คืนได้; auto-purge เกิน 30 วัน) — เงื่อนไข guard ด้านบนคงเดิม
  await prisma.houseDesign.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actorId } });

  await writeAuditLog({
    userId: actorId,
    action: "DELETE_HOUSE_DESIGN",
    entityType: "HouseDesign",
    entityId: id,
    details: { name: existing.name, trashed: true },
  });
}
