import type { Prisma } from "@prisma/client";

import { writeAuditLog } from "../../lib/audit-log";
import { prisma } from "../../lib/prisma";
import type {
  CreatePortfolioInput,
  ReorderFeaturedInput,
  UpdatePortfolioInput,
} from "./portfolio.schemas";

// จำนวนผลงานเด่นสูงสุดที่โชว์ในหน้าบริการ
export const FEATURED_LIMIT = 8;

export class PortfolioError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PortfolioError";
    this.status = status;
  }
}

export async function listPortfolio(publishedOnly: boolean, type?: "DESIGN" | "CONSTRUCTION") {
  return prisma.portfolio.findMany({
    where: {
      // ถังขยะ: ไม่แสดงผลงานที่ถูกลบ (ทั้งฝั่ง staff และ published ฝั่งลูกค้า)
      deletedAt: null,
      published: publishedOnly ? true : undefined,
      type,
    },
    orderBy: { createdAt: "desc" },
  });
}

// รายการผลงานสำหรับโซน "สำรวจผลงาน" ของหน้าบริการ:
// - โชว์เฉพาะที่ staff ตั้ง featured และยังเผยแพร่อยู่ (ยกเลิกเผยแพร่/ลบ = หลุดเอง = auto-drop)
// - เรียงตามลำดับที่จัดไว้ (featuredOrder) — ไม่มี fallback ดึงงานอื่นมาเติม
//   ถ้าไม่ได้เลือกเลย จะคืนลิสต์ว่าง ให้ฝั่งลูกค้าขึ้นข้อความ "เร็วๆ นี้" แทน
export async function listFeaturedPortfolio(limit = FEATURED_LIMIT) {
  return prisma.portfolio.findMany({
    where: { deletedAt: null, published: true, featured: true },
    orderBy: [{ featuredOrder: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
}

// จำนวนผลงานที่เผยแพร่แล้วทั้งหมด (ใช้โชว์ตัวเลขจริงในหน้าบริการ)
export async function countPublishedPortfolio(): Promise<number> {
  return prisma.portfolio.count({ where: { published: true, deletedAt: null } });
}

export async function getPortfolioItem(id: string, publishedOnly: boolean) {
  // ถังขยะ: ผลงานที่ถูกลบถือว่าไม่พบ (findFirst เพราะ where มี deletedAt ที่ไม่ unique)
  const item = await prisma.portfolio.findFirst({ where: { id, deletedAt: null } });
  if (!item || (publishedOnly && !item.published)) {
    throw new PortfolioError("ไม่พบผลงานที่ระบุ", 404);
  }
  return item;
}

export async function createPortfolioItem(input: CreatePortfolioInput, actorId: string) {
  const published = input.published ?? false;
  const item = await prisma.portfolio.create({
    data: {
      title: input.title,
      type: input.type,
      description: input.description,
      images: input.images as Prisma.InputJsonValue | undefined,
      published,
      publishedAt: published ? new Date() : null,
      createdById: actorId,
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: "CREATE_PORTFOLIO",
    entityType: "Portfolio",
    entityId: item.id,
    details: { title: item.title },
  });

  return item;
}

export async function updatePortfolioItem(
  id: string,
  input: UpdatePortfolioInput,
  actorId: string,
) {
  // ถังขยะ: ผลงานที่ถูกลบแก้ไขไม่ได้ (findFirst เพราะ where มี deletedAt ที่ไม่ unique)
  const existing = await prisma.portfolio.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    throw new PortfolioError("ไม่พบผลงานที่ระบุ", 404);
  }

  // undefined = ไม่แตะ · true = เผยแพร่ (คงวันที่เผยแพร่เดิมไว้ถ้ามี) · false = เลิกเผยแพร่
  let publishedAt: Date | null | undefined;
  if (input.published === true) publishedAt = existing.publishedAt ?? new Date();
  else if (input.published === false) publishedAt = null;

  // จัดการธง featured: ตอนเปิดใหม่ ต้องไม่เกินเพดาน 8 และต่อท้ายลำดับให้อัตโนมัติ
  let featuredOrder: number | undefined;
  if (input.featured === true && !existing.featured) {
    const count = await prisma.portfolio.count({ where: { featured: true, deletedAt: null } });
    if (count >= FEATURED_LIMIT) {
      throw new PortfolioError(
        `เลือกแสดงในหน้าบริการได้สูงสุด ${FEATURED_LIMIT} ผลงาน กรุณาเอาบางรายการออกก่อน`,
        400,
      );
    }
    const max = await prisma.portfolio.aggregate({
      where: { featured: true, deletedAt: null },
      _max: { featuredOrder: true },
    });
    featuredOrder = (max._max.featuredOrder ?? 0) + 1;
  }

  const item = await prisma.portfolio.update({
    where: { id },
    data: {
      title: input.title,
      type: input.type,
      description: input.description,
      images: input.images as Prisma.InputJsonValue | undefined,
      published: input.published,
      publishedAt,
      featured: input.featured,
      featuredOrder,
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_PORTFOLIO",
    entityType: "Portfolio",
    entityId: item.id,
    details: { published: item.published, featured: item.featured },
  });

  return item;
}

// จัดลำดับผลงานเด่นใหม่ตามที่ลากเรียง (ตั้ง featuredOrder = ตำแหน่งในลิสต์)
export async function reorderFeatured(input: ReorderFeaturedInput, actorId: string): Promise<void> {
  await prisma.$transaction(
    input.orderedIds.map((id, index) =>
      prisma.portfolio.update({
        where: { id },
        data: { featuredOrder: index + 1 },
      }),
    ),
  );

  await writeAuditLog({
    userId: actorId,
    action: "REORDER_FEATURED_PORTFOLIO",
    entityType: "Portfolio",
    entityId: input.orderedIds[0] ?? "",
    details: { count: input.orderedIds.length },
  });
}

export async function deletePortfolioItem(id: string, actorId: string): Promise<void> {
  const existing = await prisma.portfolio.findUnique({ where: { id } });
  if (!existing) {
    throw new PortfolioError("ไม่พบผลงานที่ระบุ", 404);
  }

  // ถังขยะ: ย้ายเข้าถังขยะแทนการลบจริง (กู้คืนได้; auto-purge เกิน 30 วัน)
  await prisma.portfolio.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actorId } });

  await writeAuditLog({
    userId: actorId,
    action: "DELETE_PORTFOLIO",
    entityType: "Portfolio",
    entityId: id,
    details: { title: existing.title, trashed: true },
  });
}
