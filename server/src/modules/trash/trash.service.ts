import { writeAuditLog } from "../../lib/audit-log";
import { prisma } from "../../lib/prisma";
import { collectUploadFilenames, deleteUploadedFiles } from "../../lib/uploaded-files";

// โมดูลถังขยะ (Recycle Bin): รวมของที่ถูก soft-delete (deletedAt != null) จาก 6 โมเดล
// (โครงการ/แบบบ้าน/แม่แบบ/ผลงาน/วัสดุ/คำขอลูกค้า) ให้ดู กู้คืน และลบถาวรได้ที่เดียว + auto-purge เกิน 30 วัน

export class TrashError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TrashError";
    this.status = status;
  }
}

export type TrashType =
  | "project"
  | "houseDesign"
  | "template"
  | "contractTemplate"
  | "portfolio"
  | "material"
  | "lead";

export const TRASH_TYPES: TrashType[] = [
  "project",
  "houseDesign",
  "template",
  "contractTemplate",
  "portfolio",
  "material",
  "lead",
];

export function isTrashType(v: string): v is TrashType {
  return (TRASH_TYPES as string[]).includes(v);
}

const TYPE_LABEL: Record<TrashType, string> = {
  project: "โครงการ",
  houseDesign: "แบบบ้าน",
  template: "แม่แบบ",
  contractTemplate: "แม่แบบสัญญา",
  portfolio: "ผลงาน",
  material: "วัสดุ/ค่าแรง",
  lead: "คำขอลูกค้า",
};

// entityType ใน AuditLog ให้ตรงกับที่โมดูลอื่นใช้อยู่
const ENTITY_TYPE: Record<TrashType, string> = {
  project: "Project",
  houseDesign: "HouseDesign",
  template: "Template",
  contractTemplate: "ContractTemplate",
  portfolio: "Portfolio",
  material: "Material",
  lead: "Lead",
};

// จำนวนวันที่เก็บของในถังขยะก่อนถูกลบถาวรอัตโนมัติ (ตรงกับ sweepTrash)
export const TRASH_RETENTION_DAYS = 30;

// เหตุผลที่ "ลบถาวร" ไม่ได้ (ยังมีของอ้างอิงอยู่) — null = ลบถาวรได้; guard ชุดเดียวกับตอนลบเดิม
async function purgeBlockReason(type: TrashType, id: string): Promise<string | null> {
  switch (type) {
    case "material": {
      const c = await prisma.boqItem.count({ where: { materialId: id } });
      return c > 0 ? "ยังถูกใช้ใน BOQ อยู่ ลบถาวรไม่ได้" : null;
    }
    case "project": {
      const [q, c] = await Promise.all([
        prisma.quote.count({ where: { projectId: id } }),
        prisma.contract.count({ where: { projectId: id } }),
      ]);
      return q > 0 || c > 0 ? "มีใบเสนอราคา/สัญญาผูกอยู่ ลบถาวรไม่ได้" : null;
    }
    case "houseDesign": {
      const [p, t] = await Promise.all([
        prisma.project.count({ where: { houseDesignId: id, deletedAt: null } }),
        prisma.template.count({ where: { houseDesignId: id, deletedAt: null } }),
      ]);
      return p > 0 || t > 0 ? "ยังถูกใช้ในโครงการ/แม่แบบอยู่ ลบถาวรไม่ได้" : null;
    }
    case "lead": {
      // ปกติกันไว้แล้วตั้งแต่ตอนลบ (ลบคำขอที่เป็นโครงการแล้วไม่ได้) แต่กันเหนียวอีกชั้นตอนลบถาวร
      const p = await prisma.project.count({ where: { leadId: id } });
      return p > 0 ? "คำขอนี้ถูกสร้างเป็นโครงการแล้ว ลบถาวรไม่ได้" : null;
    }
    case "contractTemplate": {
      // สัญญาเก็บถ้อยคำของตัวเองไว้แล้ว (bodyJson) ลบแม่แบบทิ้งจึงไม่ทำให้สัญญาเก่าเสียหาย
      // แต่ห้ามลบตัวสุดท้าย ไม่งั้นออกสัญญาใบใหม่ไม่ได้
      const left = await prisma.contractTemplate.count({ where: { deletedAt: null } });
      return left === 0 ? "เป็นแม่แบบสัญญาอันสุดท้าย ลบถาวรไม่ได้" : null;
    }
    case "portfolio":
    case "template":
      return null;
  }
}

// นับว่ารายการนี้ยังอยู่ในถังขยะจริงไหม (deletedAt != null)
async function assertTrashed(type: TrashType, id: string): Promise<void> {
  const where = { id, deletedAt: { not: null } } as const;
  const countTrashed: Record<TrashType, () => Promise<number>> = {
    project: () => prisma.project.count({ where }),
    houseDesign: () => prisma.houseDesign.count({ where }),
    template: () => prisma.template.count({ where }),
    contractTemplate: () => prisma.contractTemplate.count({ where }),
    portfolio: () => prisma.portfolio.count({ where }),
    lead: () => prisma.lead.count({ where }),
    material: () => prisma.material.count({ where }),
  };
  const exists = await countTrashed[type]();
  if (exists === 0) throw new TrashError("ไม่พบรายการในถังขยะ", 404);
}

// ลบจริง (hard delete) — cascade ตาม schema เหมือนพฤติกรรมลบเดิมก่อนมีถังขยะ; สำหรับ portfolio/
// houseDesign ลบไฟล์รูปที่อัปโหลดออกจากดิสก์ด้วย (กันไฟล์กำพร้าค้าง)
async function hardDelete(type: TrashType, id: string): Promise<void> {
  switch (type) {
    case "project":
      await prisma.project.delete({ where: { id } });
      break;
    case "houseDesign": {
      const d = await prisma.houseDesign.findUnique({
        where: { id },
        select: { exteriorImages: true, interiorImages: true, plans: true },
      });
      await prisma.houseDesign.delete({ where: { id } });
      if (d) {
        deleteUploadedFiles([
          ...collectUploadFilenames(d.exteriorImages),
          ...collectUploadFilenames(d.interiorImages),
          ...collectUploadFilenames(d.plans),
        ]);
      }
      break;
    }
    case "template":
      await prisma.template.delete({ where: { id } });
      break;
    case "contractTemplate":
      await prisma.contractTemplate.delete({ where: { id } });
      break;
    case "portfolio": {
      const p = await prisma.portfolio.findUnique({ where: { id }, select: { images: true } });
      await prisma.portfolio.delete({ where: { id } });
      if (p) deleteUploadedFiles(collectUploadFilenames(p.images));
      break;
    }
    case "material":
      await prisma.material.delete({ where: { id } });
      break;
    case "lead":
      await prisma.lead.delete({ where: { id } });
      break;
  }
}

export interface TrashItem {
  type: TrashType;
  typeLabel: string;
  id: string;
  label: string;
  deletedAt: Date;
  deletedByName: string | null;
  // null = ลบถาวรได้; ข้อความ = เหตุผลที่ลบถาวรไม่ได้ (โชว์ tooltip + disable ปุ่ม)
  blockReason: string | null;
}

export async function listTrash(): Promise<TrashItem[]> {
  const [projects, houseDesigns, templates, contractTemplates, portfolios, materials, leads] =
    await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, name: true, projectNo: true, deletedAt: true, deletedById: true },
    }),
    prisma.houseDesign.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, name: true, deletedAt: true, deletedById: true },
    }),
    prisma.template.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, name: true, deletedAt: true, deletedById: true },
    }),
    prisma.contractTemplate.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, name: true, deletedAt: true, deletedById: true },
    }),
    prisma.portfolio.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, title: true, deletedAt: true, deletedById: true },
    }),
    prisma.material.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, name: true, code: true, deletedAt: true, deletedById: true },
    }),
    prisma.lead.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, name: true, serviceType: true, deletedAt: true, deletedById: true },
    }),
  ]);

  const raw = [
    ...projects.map((p) => ({
      type: "project" as const,
      id: p.id,
      label: `${p.projectNo} · ${p.name}`,
      deletedAt: p.deletedAt!,
      deletedById: p.deletedById,
    })),
    ...houseDesigns.map((d) => ({
      type: "houseDesign" as const,
      id: d.id,
      label: d.name,
      deletedAt: d.deletedAt!,
      deletedById: d.deletedById,
    })),
    ...templates.map((t) => ({
      type: "template" as const,
      id: t.id,
      label: t.name,
      deletedAt: t.deletedAt!,
      deletedById: t.deletedById,
    })),
    ...contractTemplates.map((t) => ({
      type: "contractTemplate" as const,
      id: t.id,
      label: t.name,
      deletedAt: t.deletedAt!,
      deletedById: t.deletedById,
    })),
    ...portfolios.map((p) => ({
      type: "portfolio" as const,
      id: p.id,
      label: p.title,
      deletedAt: p.deletedAt!,
      deletedById: p.deletedById,
    })),
    ...materials.map((m) => ({
      type: "material" as const,
      id: m.id,
      label: `${m.code ? m.code + " · " : ""}${m.name}`,
      deletedAt: m.deletedAt!,
      deletedById: m.deletedById,
    })),
    ...leads.map((l) => ({
      type: "lead" as const,
      id: l.id,
      label: `${l.name} · ${l.serviceType}`,
      deletedAt: l.deletedAt!,
      deletedById: l.deletedById,
    })),
  ];

  // resolve ชื่อผู้ลบแบบ batch
  const userIds = [...new Set(raw.map((r) => r.deletedById).filter((x): x is string => Boolean(x)))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.fullName]));

  const items = await Promise.all(
    raw.map(async (r) => ({
      type: r.type,
      typeLabel: TYPE_LABEL[r.type],
      id: r.id,
      label: r.label,
      deletedAt: r.deletedAt,
      deletedByName: r.deletedById ? (nameById.get(r.deletedById) ?? null) : null,
      blockReason: await purgeBlockReason(r.type, r.id),
    })),
  );

  // ใหม่สุดก่อน
  items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
  return items;
}

export async function restoreTrashItem(type: TrashType, id: string, actorId: string): Promise<void> {
  await assertTrashed(type, id);
  const data = { deletedAt: null, deletedById: null };
  switch (type) {
    case "project":
      await prisma.project.update({ where: { id }, data });
      break;
    case "houseDesign":
      await prisma.houseDesign.update({ where: { id }, data });
      break;
    case "template":
      await prisma.template.update({ where: { id }, data });
      break;
    case "contractTemplate":
      await prisma.contractTemplate.update({ where: { id }, data });
      break;
    case "portfolio":
      await prisma.portfolio.update({ where: { id }, data });
      break;
    case "material":
      await prisma.material.update({ where: { id }, data });
      break;
    case "lead":
      await prisma.lead.update({ where: { id }, data });
      break;
  }
  await writeAuditLog({
    userId: actorId,
    action: `RESTORE_${ENTITY_TYPE[type].toUpperCase()}`,
    entityType: ENTITY_TYPE[type],
    entityId: id,
  });
}

export async function purgeTrashItem(type: TrashType, id: string, actorId: string): Promise<void> {
  await assertTrashed(type, id);
  const reason = await purgeBlockReason(type, id);
  if (reason) throw new TrashError(reason, 409);
  await hardDelete(type, id);
  await writeAuditLog({
    userId: actorId,
    action: `PURGE_${ENTITY_TYPE[type].toUpperCase()}`,
    entityType: ENTITY_TYPE[type],
    entityId: id,
  });
}

// ล้างอัตโนมัติ: ลบถาวรของที่อยู่ในถังขยะเกิน TRASH_RETENTION_DAYS วัน (best-effort — ติด guard = ข้าม)
// คืนจำนวนที่ลบสำเร็จ. รับ now ได้เพื่อทดสอบ. ไม่ใช้ actor (ระบบ) → userId ใน audit = null
export async function sweepTrash(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const where = { deletedAt: { not: null, lt: cutoff } } as const;

  const [projects, houseDesigns, templates, contractTemplates, portfolios, materials, leads] =
    await Promise.all([
      prisma.project.findMany({ where, select: { id: true } }),
      prisma.houseDesign.findMany({ where, select: { id: true } }),
      prisma.template.findMany({ where, select: { id: true } }),
      prisma.contractTemplate.findMany({ where, select: { id: true } }),
    prisma.portfolio.findMany({ where, select: { id: true } }),
    prisma.material.findMany({ where, select: { id: true } }),
    prisma.lead.findMany({ where, select: { id: true } }),
  ]);

  const targets: { type: TrashType; id: string }[] = [
    ...projects.map((p) => ({ type: "project" as const, id: p.id })),
    ...houseDesigns.map((d) => ({ type: "houseDesign" as const, id: d.id })),
    ...templates.map((t) => ({ type: "template" as const, id: t.id })),
    ...contractTemplates.map((t) => ({ type: "contractTemplate" as const, id: t.id })),
    ...portfolios.map((p) => ({ type: "portfolio" as const, id: p.id })),
    ...materials.map((m) => ({ type: "material" as const, id: m.id })),
    ...leads.map((l) => ({ type: "lead" as const, id: l.id })),
  ];

  let purged = 0;
  for (const t of targets) {
    try {
      const reason = await purgeBlockReason(t.type, t.id);
      if (reason) continue; // ยังมีของอ้างอิง → ปล่อยไว้ในถังขยะ
      await hardDelete(t.type, t.id);
      await writeAuditLog({
        userId: null,
        action: `AUTO_PURGE_${ENTITY_TYPE[t.type].toUpperCase()}`,
        entityType: ENTITY_TYPE[t.type],
        entityId: t.id,
        details: { retentionDays: TRASH_RETENTION_DAYS },
      });
      purged += 1;
    } catch {
      // best-effort: ตัวใดตัวหนึ่งพลาดไม่ควรล้มทั้ง sweep
    }
  }
  return purged;
}
