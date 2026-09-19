import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit-log";
import { generateCategoryCode } from "../../lib/work-code";
import type { CreateCategoryInput, UpdateCategoryInput } from "./categories.schemas";

export class CategoryError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CategoryError";
    this.status = status;
  }
}

const REQUIRED_PARENT_LEVEL: Record<"CATEGORY" | "SUBGROUP" | "ITEM", "CATEGORY" | "SUBGROUP" | null> =
  {
    CATEGORY: null,
    SUBGROUP: "CATEGORY",
    ITEM: "SUBGROUP",
  };

export async function listCategories() {
  return prisma.workCategory.findMany({
    orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
  });
}

/**
 * หมวดงาน (และบรรพบุรุษทุกระดับ) ยัง "ใช้งานอยู่" หรือไม่ — ปิดหมวดใหญ่ = ปิดทั้งกิ่ง จึงต้อง
 * ไล่ขึ้นไปถึงราก ใช้กันไม่ให้ผูกหมวดที่เก็บเข้ากรุแล้วกับ BOQ/วัสดุใหม่
 */
export async function isCategoryChainActive(categoryId: string): Promise<boolean> {
  let current = await prisma.workCategory.findUnique({
    where: { id: categoryId },
    select: { active: true, parentId: true },
  });
  while (current) {
    if (!current.active) return false;
    if (!current.parentId) break;
    current = await prisma.workCategory.findUnique({
      where: { id: current.parentId },
      select: { active: true, parentId: true },
    });
  }
  return true;
}

async function assertValidParent(
  level: "CATEGORY" | "SUBGROUP" | "ITEM",
  parentId: string | null | undefined,
): Promise<void> {
  const requiredParentLevel = REQUIRED_PARENT_LEVEL[level];

  if (requiredParentLevel === null) {
    if (parentId) {
      throw new CategoryError("หมวดงานระดับ CATEGORY ต้องไม่มี parent");
    }
    return;
  }

  if (!parentId) {
    throw new CategoryError(`หมวดงานระดับ ${level} ต้องระบุ parent ที่เป็นระดับ ${requiredParentLevel}`);
  }

  const parent = await prisma.workCategory.findUnique({ where: { id: parentId } });
  if (!parent) {
    throw new CategoryError("ไม่พบหมวดงานแม่ที่ระบุ", 404);
  }
  if (parent.level !== requiredParentLevel) {
    throw new CategoryError(`parent ของระดับ ${level} ต้องเป็นระดับ ${requiredParentLevel}`);
  }
}

/**
 * วางโหนดใหม่ไว้ท้ายสุดในกลุ่มพี่น้องของมัน ถ้าไม่มีตรงนี้ค่าจะเป็น 0 เป็นค่าเริ่มต้นแล้วกระโดด
 * ไปนำหน้าทุกอันที่ให้เลขไว้แล้ว — หมวดงานที่เพิ่มหลัง A–F จะไปแสดงเป็นอันแรก
 */
async function nextSortOrder(parentId: string | null): Promise<number> {
  const last = await prisma.workCategory.findFirst({
    where: { parentId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return last ? last.sortOrder + 1 : 1;
}

async function assertCodeAvailable(code: string, ignoreId?: string): Promise<void> {
  const existing = await prisma.workCategory.findUnique({ where: { code } });
  if (existing && existing.id !== ignoreId) {
    throw new CategoryError(`รหัส ${code} ถูกใช้กับ "${existing.name}" อยู่แล้ว`, 409);
  }
}

export async function createCategory(input: CreateCategoryInput, actorId: string) {
  await assertValidParent(input.level, input.parentId ?? null);

  // พนักงานพิมพ์รหัสเองได้ ถ้าไม่พิมพ์จะให้ระบบต่อเลขลำดับภายใต้ parent ให้
  if (input.code) {
    await assertCodeAvailable(input.code);
  }
  const code = input.code ?? (await generateCategoryCode(input.level, input.parentId ?? null));

  const category = await prisma.workCategory.create({
    data: {
      parentId: input.parentId ?? null,
      level: input.level,
      code,
      name: input.name,
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? (await nextSortOrder(input.parentId ?? null)),
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: "CREATE_CATEGORY",
    entityType: "WorkCategory",
    entityId: category.id,
    details: { name: category.name, level: category.level },
  });

  return category;
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
  actorId: string,
) {
  const existing = await prisma.workCategory.findUnique({ where: { id } });
  if (!existing) {
    throw new CategoryError("ไม่พบหมวดงานที่ระบุ", 404);
  }

  if (input.parentId !== undefined) {
    if (input.parentId === id) {
      throw new CategoryError("หมวดงานไม่สามารถเป็น parent ของตัวเองได้");
    }
    await assertValidParent(existing.level, input.parentId);
  }

  if (input.code) {
    await assertCodeAvailable(input.code, id);
  }

  const category = await prisma.workCategory.update({
    where: { id },
    data: {
      parentId: input.parentId === undefined ? undefined : input.parentId,
      code: input.code === undefined ? undefined : input.code,
      name: input.name,
      description: input.description,
      sortOrder: input.sortOrder,
      active: input.active,
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_CATEGORY",
    entityType: "WorkCategory",
    entityId: category.id,
    details: { name: category.name },
  });

  return category;
}

export async function deleteCategory(id: string, actorId: string): Promise<void> {
  const existing = await prisma.workCategory.findUnique({ where: { id } });
  if (!existing) {
    throw new CategoryError("ไม่พบหมวดงานที่ระบุ", 404);
  }

  const [childCount, materialCount, boqItemCount] = await Promise.all([
    prisma.workCategory.count({ where: { parentId: id } }),
    prisma.material.count({ where: { categoryId: id, deletedAt: null } }),
    prisma.boqItem.count({ where: { categoryId: id } }),
  ]);

  if (childCount > 0) {
    throw new CategoryError("ไม่สามารถลบหมวดงานที่มีหมวดงานย่อยอยู่ได้", 409);
  }
  if (materialCount > 0) {
    throw new CategoryError("ไม่สามารถลบหมวดงานที่มีรายการวัสดุ/ค่าแรงผูกอยู่ได้", 409);
  }
  if (boqItemCount > 0) {
    throw new CategoryError("ไม่สามารถลบหมวดงานที่ถูกใช้ใน BOQ อยู่ได้", 409);
  }

  await prisma.workCategory.delete({ where: { id } });

  await writeAuditLog({
    userId: actorId,
    action: "DELETE_CATEGORY",
    entityType: "WorkCategory",
    entityId: id,
    details: { name: existing.name },
  });
}
