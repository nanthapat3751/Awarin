import crypto from "node:crypto";

import { Prisma, type Role } from "@prisma/client";

import { BOQ_ITEM_ORDER } from "../../lib/boq-order";
import { issueAccessTokenFor } from "../../lib/access-token";
import { writeAuditLog } from "../../lib/audit-log";
import { createNotification } from "../../lib/notifications";
import { hashPassword } from "../../lib/password";
import {
  applyNetRounding,
  calculatePricing,
  type DiscountInput,
  discountOf,
  resolveDiscountAmount,
  round2,
} from "../../lib/pricing";
import {
  assertValidProjectTransition,
  InvalidTransitionError,
  type ProjectStatus,
} from "../../lib/project-state-machine";
import { generateProjectNo } from "../../lib/project-number";
import { toCustomerDto } from "../../lib/customer-dto";
import { prisma } from "../../lib/prisma";
import { clampPage, LIST_PAGE_SIZE } from "../../lib/list-query";
import { getDefaultRates } from "../../lib/settings";
import { ITEM_INCLUDE, getOrCreateEditableVersion, recalculateLatestVersionPricing } from "../boq/boq.service";
import { applyTemplateToProject, findStandardTemplateForDesign } from "../templates/templates.service";
import type { ProjectListPageDto } from "@systemboq/shared-types";
import type {
  CreateProjectInput,
  IssueAccessLinkInput,
  UpdateProjectInput,
  UpdateVersionRatesInput,
} from "./projects.schemas";

export class ProjectError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ProjectError";
    this.status = status;
  }
}

export async function listProjects(filter: { status?: string; customerId?: string; q?: string }) {
  const projects = await prisma.project.findMany({
    where: {
      // ถังขยะ: ไม่แสดงโครงการที่ถูกลบ
      deletedAt: null,
      status: filter.status ? (filter.status as ProjectStatus) : undefined,
      customerId: filter.customerId,
      OR: filter.q
        ? [
            { name: { contains: filter.q, mode: "insensitive" } },
            { projectNo: { contains: filter.q, mode: "insensitive" } },
            { customer: { fullName: { contains: filter.q, mode: "insensitive" } } },
          ]
        : undefined,
    },
    include: {
      customer: { select: { id: true, email: true, fullName: true } },
      _count: { select: { quotes: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return projects.map(({ _count, ...p }) => ({ ...p, quoteCount: _count.quotes }));
}

const PROJECT_STATUSES: ProjectStatus[] = ["DRAFT", "QUOTED", "REJECTED", "APPROVED", "COMPLETED", "CANCELLED"];
const LIST_INCLUDE = {
  customer: { select: { id: true, email: true, fullName: true } },
  _count: { select: { quotes: true } },
} as const;

/**
 * หน้ารายการโครงการแบบแบ่งหน้าที่เซิร์ฟเวอร์ (หน้าละ 15) — ค้นหา/สถานะ/ช่วงวันที่สร้าง
 * ไม่เลือกสถานะ = ซ่อนโครงการที่ยกเลิก (เหมือนหน้าเดิม) · counts นับใต้คำค้น+ช่วงเวลาเดียวกัน
 */
export async function listProjectsPage(query: {
  q?: string;
  status?: string;
  period: { gte: Date; lt: Date } | null;
  page: unknown;
}): Promise<ProjectListPageDto> {
  const status = PROJECT_STATUSES.includes(query.status as ProjectStatus) ? (query.status as ProjectStatus) : null;
  const base: Prisma.ProjectWhereInput = {
    deletedAt: null,
    ...(query.period ? { createdAt: query.period } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { projectNo: { contains: query.q, mode: "insensitive" } },
            { customer: { fullName: { contains: query.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const where: Prisma.ProjectWhereInput = { ...base, status: status ?? { not: "CANCELLED" } };

  const [total, grouped] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries([["ALL", 0], ...PROJECT_STATUSES.map((s) => [s, 0])]) as ProjectListPageDto["counts"];
  for (const g of grouped) {
    counts[g.status] = g._count._all;
    if (g.status !== "CANCELLED") counts.ALL += g._count._all;
  }

  const page = clampPage(query.page, total);
  const rows = await prisma.project.findMany({
    where,
    include: LIST_INCLUDE,
    // id ต่อท้าย — โครงการที่สร้างเวลาเดียวกันต้องไม่สลับที่ข้ามหน้า
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * LIST_PAGE_SIZE,
    take: LIST_PAGE_SIZE,
  });
  const projects = rows.map(({ _count, ...p }) => ({ ...p, quoteCount: _count.quotes }));
  return {
    projects: projects as unknown as ProjectListPageDto["projects"],
    page,
    pageSize: LIST_PAGE_SIZE,
    total,
    counts,
  };
}

export async function getProjectDetail(id: string) {
  // ถังขยะ: โครงการที่ถูกลบถือว่า "ไม่พบ" (findFirst เพราะ where มี deletedAt ที่ไม่ unique)
  const project = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    include: {
      customer: {
        select: { id: true, email: true, fullName: true, avatarUrl: true, customerProfile: { select: { phone: true } } },
      },
      lead: { include: { houseDesign: { select: { name: true } } } },
    },
  });
  if (!project) {
    throw new ProjectError("ไม่พบโครงการที่ระบุ", 404);
  }

  const versions = await prisma.projectVersion.findMany({
    where: { projectId: id },
    orderBy: { versionNo: "asc" },
  });
  const currentVersion = versions.at(-1)!;

  const items = await prisma.boqItem.findMany({
    where: { projectVersionId: currentVersion.id },
    orderBy: BOQ_ITEM_ORDER,
    include: ITEM_INCLUDE,
  });

  const sentQuote = await prisma.quote.findFirst({
    where: { projectVersionId: currentVersion.id, status: { not: "DRAFT" } },
  });

  const { lead, customer, ...rest } = project;
  // การ์ดลูกค้าในหัวโครงการ: เบอร์มาจากโปรไฟล์ลูกค้า (เดิมโชว์ได้แค่เบอร์จากคำขอ)
  const projectFields = {
    ...rest,
    customer: customer
      ? {
          id: customer.id,
          email: customer.email,
          fullName: customer.fullName,
          avatarUrl: customer.avatarUrl,
          phone: customer.customerProfile?.phone ?? null,
        }
      : null,
  };
  const leadInfo = lead
    ? {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        serviceType: lead.serviceType,
        houseDesignName: lead.houseDesign?.name ?? null,
        message: lead.message,
      }
    : null;

  return { project: projectFields, versions, currentVersion, items, editable: !sentQuote, lead: leadInfo };
}

// prefill ค่าวัดโครงการจากแบบบ้าน แล้วสเกลผนัง/รอบรูป/ปริมาตรตามสัดส่วนพื้นที่เป้าหมาย ÷ พื้นที่แบบ
// (เช่น ตั้งพื้นที่ 180 ต่อแบบ 150 → ×1.2) — ค่าที่พนักงานกรอกมาเองใน input ชนะเสมอ; พื้นที่ที่ไม่ได้
// ตั้งจะ default เป็นพื้นที่ของแบบ เพื่อให้บรรทัด take-off ทุกตัวขับคิดปริมาณได้ครบตั้งแต่สร้างโครงการ
function withDesignMeasurements(
  input: CreateProjectInput,
  design: {
    area: unknown;
    wallAreaSqm: unknown;
    perimeterM: unknown;
    concreteVolumeM3: unknown;
    footprintSqm: unknown;
    bathrooms: unknown;
    floors: unknown;
  },
): CreateProjectInput {
  const designArea = design.area != null ? Number(design.area) : null;
  const targetArea = input.areaSqm ?? designArea ?? undefined;
  const k = designArea && designArea > 0 && targetArea != null ? targetArea / designArea : 1;
  const scale = (v: unknown, dp: number): number | undefined => {
    if (v == null) return undefined;
    const f = Math.pow(10, dp);
    return Math.round(Number(v) * k * f) / f;
  };
  // จำนวนห้องน้ำ/ชั้น เป็นค่านับ — คัดลอกจากแบบตรง ๆ ไม่สเกลตามพื้นที่ (บ้านใหญ่ขึ้นไม่ได้เพิ่มชั้น)
  const count = (v: unknown): number | undefined => (v != null ? Number(v) : undefined);
  return {
    ...input,
    areaSqm: input.areaSqm ?? designArea ?? undefined,
    wallAreaSqm: input.wallAreaSqm ?? scale(design.wallAreaSqm, 2),
    perimeterM: input.perimeterM ?? scale(design.perimeterM, 2),
    concreteVolumeM3: input.concreteVolumeM3 ?? scale(design.concreteVolumeM3, 3),
    // พื้นที่ตั้งอาคารสเกลตามสัดส่วนพื้นที่เช่นกัน (บ้านเดียวกันขยายสัดส่วน → footprint โตตาม)
    footprintSqm: input.footprintSqm ?? scale(design.footprintSqm, 2),
    bathrooms: input.bathrooms ?? count(design.bathrooms),
    floors: input.floors ?? count(design.floors),
  };
}

async function createProjectWithUniqueNo(
  input: CreateProjectInput,
  actorId: string,
  overheadProfitPct: number,
  overheadPct: number | null,
  vatPct: number,
  pricing: ReturnType<typeof calculatePricing>,
) {
  const projectNo = await generateProjectNo(prisma);
  return prisma.project.create({
    data: {
      projectNo,
      name: input.name,
      description: input.description ?? null,
      siteAddress: input.siteAddress ?? null,
      areaSqm: input.areaSqm ?? null,
      wallAreaSqm: input.wallAreaSqm ?? null,
      perimeterM: input.perimeterM ?? null,
      concreteVolumeM3: input.concreteVolumeM3 ?? null,
      footprintSqm: input.footprintSqm ?? null,
      bathrooms: input.bathrooms ?? null,
      floors: input.floors ?? null,
      startDate: input.startDate ?? null,
      targetEndDate: input.targetEndDate ?? null,
      type: input.type ?? "ESTIMATE",
      customerId: input.customerId ?? null,
      houseDesignId: input.houseDesignId ?? null,
      leadId: input.leadId ?? null,
      status: "DRAFT",
      createdById: actorId,
      versions: {
        create: {
          versionNo: 1,
          directCost: pricing.directCost,
          overheadProfitPct,
          overheadPct,
          overheadProfitAmt: pricing.overheadProfitAmount,
          vatPct,
          vatAmt: pricing.vatAmount,
          netPrice: pricing.netPrice,
          pricePerSqm: pricing.pricePerSqm,
          createdById: actorId,
        },
      },
    },
  });
}

/** ข้อความเดียวกันทุกจุดที่กันอัตรากำไร — ดู OWNER_ONLY_SETTING_KEYS ในหน้าตั้งค่า */
const OWNER_ONLY_RATE_MESSAGE = "อัตราค่าดำเนินการและกำไรแก้ได้เฉพาะเจ้าของระบบ (OWNER)";

/**
 * @param actorRole ไม่ส่ง = ถือว่าไม่ใช่ OWNER (ทางสร้างจากคำขอไม่เคยส่งอัตรามาเอง จึงไม่กระทบ)
 */
/** ตรวจสิ่งที่โครงการใหม่อ้างถึง (ลูกค้า · แบบบ้าน · คำขอ) แล้วคืนแบบบ้าน/คำขอที่ใช้ต่อ */
async function loadCreateProjectRefs(input: CreateProjectInput) {
  if (input.customerId) {
    const customer = await prisma.user.findUnique({ where: { id: input.customerId } });
    if (customer?.role !== "CUSTOMER") {
      throw new ProjectError("ไม่พบลูกค้าที่ระบุ", 404);
    }
  }
  // ถังขยะ: สร้างโครงการจากแบบบ้านที่ถูกลบไม่ได้
  const design = input.houseDesignId
    ? await prisma.houseDesign.findFirst({ where: { id: input.houseDesignId, deletedAt: null } })
    : null;
  if (input.houseDesignId && !design) {
    throw new ProjectError("ไม่พบแบบบ้านที่ระบุ", 404);
  }

  const lead = input.leadId ? await prisma.lead.findUnique({ where: { id: input.leadId } }) : null;
  if (input.leadId) {
    if (!lead) throw new ProjectError("ไม่พบคำขอที่ระบุ", 404);
    const existingProject = await prisma.project.findUnique({ where: { leadId: input.leadId } });
    if (existingProject) throw new ProjectError("คำขอนี้มีโครงการเชื่อมอยู่แล้ว", 409);
  }
  return { design, lead };
}

/**
 * ถ้าแบบบ้านที่เลือกมี template BOQ มาตรฐาน ให้ตั้งต้นโปรเจกต์ใหม่ (ที่ยังว่าง) ด้วย template
 * นั้น เพื่อให้ราคาประเมินพร้อมทันที ทำแบบ best-effort: template ที่อ้างอิงข้อมูลที่ถูกลบไปแล้ว
 * ต้องไม่ขวางการสร้างโปรเจกต์ — พนักงานยังสร้างเองด้วยมือได้
 */
async function seedFromStandardTemplate(projectId: string, houseDesignId: string, actorId: string) {
  const template = await findStandardTemplateForDesign(houseDesignId);
  if (!template) return;
  try {
    await applyTemplateToProject(projectId, template.id, actorId);
  } catch {
    // ถ้าล้มเหลว ปล่อยให้โปรเจกต์ว่างไว้
  }
}

export async function createProject(input: CreateProjectInput, actorId: string, actorRole?: Role) {
  const { design, lead } = await loadCreateProjectRefs(input);

  const defaults = await getDefaultRates();
  // ตั้งอัตรากำไรต่างจากค่าบริษัทตอนสร้าง = แก้อัตรากำไร — เฉพาะ OWNER
  // (ส่งค่าเท่ากับค่าบริษัทมาก็ไม่ถือว่าแก้ ผลลัพธ์เหมือนไม่ได้ส่งทุกประการ)
  if (
    input.overheadProfitPercent != null &&
    input.overheadProfitPercent !== defaults.overheadProfitPct &&
    actorRole !== "OWNER"
  ) {
    throw new ProjectError(OWNER_ONLY_RATE_MESSAGE, 403);
  }
  const overheadProfitPct = input.overheadProfitPercent ?? defaults.overheadProfitPct;
  // การแบ่งค่าดำเนินการ/กำไรจากหน้าตั้งค่าติดมาเฉพาะเมื่อ "อัตรารวมก็มาจากค่าตั้งต้นเหมือนกัน" —
  // ถ้าคนสร้างโครงการกำหนดอัตรารวมเองเป็นค่าอื่น เราไม่รู้ว่าเขาตั้งใจให้ส่วนที่เพิ่ม/ลดไปอยู่ตรงไหน
  // เดาแทนเขาไม่ได้ ปล่อยเป็น "ยังไม่ได้แยก" แล้วให้ไปตั้งในแผงแก้อัตราเอง
  const overheadPct = input.overheadProfitPercent == null ? defaults.overheadPct : null;
  const vatPct = defaults.vatPct;
  const pricing = calculatePricing([], overheadProfitPct, vatPct, null);

  // สร้างจากแบบบ้าน: prefill ค่าวัดของโครงการจากแบบ โดยสเกลตามสัดส่วนพื้นที่ที่พนักงานตั้ง
  // (ถ้าตั้งพื้นที่ 180 ต่อแบบ 150 → ผนัง/รอบรูป/ปริมาตร ×1.2 ด้วย) เพื่อให้ตัวขับทุกตัวของ
  // แม่แบบมาตรฐานคิดปริมาณครบ ไม่ใช่แค่บรรทัดที่ผูกพื้นที่พื้น — ค่าที่พนักงานกรอกเองมาชนะเสมอ
  const effectiveInput = design ? withDesignMeasurements(input, design) : input;

  const project = await createProjectWithUniqueNo(
    effectiveInput,
    actorId,
    overheadProfitPct,
    overheadPct,
    vatPct,
    pricing,
  );

  // โครงการกำหนดเอง (CUSTOM) ไม่ตั้งต้นจากแม่แบบ: ไม่ใช้ BOQ อัตโนมัติ พนักงานกรอกราคาเอง
  if (input.houseDesignId && input.type !== "CUSTOM") {
    await seedFromStandardTemplate(project.id, input.houseDesignId, actorId);
  }

  // การเริ่มโปรเจกต์จาก lead แปลว่าพนักงานเริ่มลงมือทำแล้ว -- ดัน lead ให้พ้นสถานะ "NEW"
  // เพื่อให้มันหลุดออกจากรายการงานค้างโดยอัตโนมัติ
  if (lead?.status === "NEW") {
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "CONTACTED" } });
  }

  await writeAuditLog({
    userId: actorId,
    action: "CREATE_PROJECT",
    entityType: "Project",
    entityId: project.id,
    details: { projectNo: project.projectNo, name: project.name, leadId: input.leadId },
  });

  return project;
}

/** ค่าวัดของโครงการที่ถ้าเปลี่ยน ปริมาณ/ราคาใน BOQ ต้องคิดใหม่ */
const MEASUREMENT_FIELDS = [
  "areaSqm",
  "wallAreaSqm",
  "perimeterM",
  "concreteVolumeM3",
  "footprintSqm",
  "bathrooms",
  "floors",
  "openings",
] as const satisfies readonly (keyof UpdateProjectInput)[];

/**
 * รายการช่องเปิด → ค่าที่บันทึก (รายการ + ยอดรวม ตร.ม.) · undefined = ไม่แก้ · ว่าง = ไม่หัก
 * ยอดรวมต้องน้อยกว่าพื้นที่ผนังที่ใช้คิดจริง ไม่งั้นงานผนังทั้งหมดกลายเป็นศูนย์
 */
function openingsData(
  input: UpdateProjectInput,
  wallArea: number | null,
): { openings: Prisma.InputJsonValue | typeof Prisma.DbNull; openingAreaSqm: number | null } | null {
  if (input.openings === undefined) return null;
  if (!input.openings?.length) return { openings: Prisma.DbNull, openingAreaSqm: null };
  const total = round2(input.openings.reduce((sum, o) => sum + o.count * o.width * o.height, 0));
  if (wallArea != null && total >= wallArea) {
    throw new ProjectError(`ช่องเปิดรวม ${total} ตร.ม. ต้องน้อยกว่าพื้นที่ผนัง ${wallArea} ตร.ม.`);
  }
  return { openings: input.openings, openingAreaSqm: total };
}

/** โครงการ CUSTOM ราคากรอกเอง — พื้นที่เปลี่ยนจึงปรับแค่ราคาต่อ ตร.ม. ของเวอร์ชันล่าสุด */
async function updateCustomPricePerSqm(projectId: string, areaSqm: number | null): Promise<void> {
  const latest = await prisma.projectVersion.findFirst({
    where: { projectId },
    orderBy: { versionNo: "desc" },
  });
  if (!latest) return;
  const area = areaSqm && areaSqm > 0 ? areaSqm : null;
  const pricePerSqm = area ? round2(Number(latest.netPrice) / area) : null;
  await prisma.projectVersion.update({ where: { id: latest.id }, data: { pricePerSqm } });
}

export async function updateProject(id: string, input: UpdateProjectInput, actorId: string) {
  // ถังขยะ: โครงการที่ถูกลบแก้ไขไม่ได้ (findFirst เพราะ where มี deletedAt ที่ไม่ unique)
  const existing = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    include: { houseDesign: { select: { wallAreaSqm: true } } },
  });
  if (!existing) {
    throw new ProjectError("ไม่พบโครงการที่ระบุ", 404);
  }
  // พื้นที่ผนังที่ใช้คิดจริงหลังแก้ (ค่าของโครงการ ไม่งั้นของแบบบ้าน) — ใช้ตรวจช่องเปิด
  const nextWall = input.wallAreaSqm === undefined ? existing.wallAreaSqm : input.wallAreaSqm;
  const wallArea = nextWall ?? existing.houseDesign?.wallAreaSqm ?? null;
  const openings = openingsData(input, wallArea == null ? null : Number(wallArea));

  const project = await prisma.project.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      siteAddress: input.siteAddress,
      areaSqm: input.areaSqm,
      wallAreaSqm: input.wallAreaSqm,
      perimeterM: input.perimeterM,
      concreteVolumeM3: input.concreteVolumeM3,
      footprintSqm: input.footprintSqm,
      bathrooms: input.bathrooms,
      floors: input.floors,
      ...openings,
      startDate: input.startDate,
      targetEndDate: input.targetEndDate,
      customerId: input.customerId === undefined ? undefined : input.customerId,
      houseDesignId: input.houseDesignId === undefined ? undefined : input.houseDesignId,
    },
  });

  // ค่าวัดใด ๆ เปลี่ยน (พื้นที่/ผนัง/รอบรูป/ปริมาตร) → คิดใหม่ทั้งชุด: บรรทัด BOQ ที่ผูกกับค่าวัดนั้น
  // ถอดปริมาณใหม่ → ต้นทุน/ราคารวม/ราคาต่อ ตร.ม. ขยับตาม (ESTIMATE). โครงการ CUSTOM ราคากรอกเอง
  // จึงปรับแค่ราคา/ตร.ม. เมื่อพื้นที่เปลี่ยน (ค่าวัดอื่นไม่มีผลกับ CUSTOM ที่ไม่ใช้ BOQ)
  if (MEASUREMENT_FIELDS.some((field) => input[field] !== undefined)) {
    if (existing.type !== "CUSTOM") await recalculateLatestVersionPricing(id);
    else if (input.areaSqm !== undefined) await updateCustomPricePerSqm(id, input.areaSqm);
  }

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_PROJECT",
    entityType: "Project",
    entityId: project.id,
  });

  return project;
}

/**
 * ไอเดียที่ 2 (แบบลิงก์เข้าใช้ครั้งเดียว): ทำให้คำขอที่เข้ามาโดยผู้เข้าชมที่ไม่ได้ล็อกอิน จบลง
 * ด้วยบัญชีจริงที่ลูกค้าเข้าไปดูใบเสนอราคาได้ — โดยทีมงานสร้างบัญชีให้แล้ว "ออกลิงก์" ให้ลูกค้า
 * เปิดตั้งรหัสผ่านเอง (ปลอดภัยกว่าการตั้งรหัสให้แล้วบอกผ่านแชต เพราะรหัสไม่วิ่งผ่านช่องทางไหน)
 *
 * - โปรเจกต์ที่มีลูกค้าผูกอยู่แล้ว → แค่ออกลิงก์ใหม่ (เช่น ลูกค้ายังไม่เคยตั้งรหัส/ลืมรหัส)
 * - โปรเจกต์ที่มาจากคำขอแต่ยังไม่มีลูกค้า → สร้างบัญชีจากข้อมูลใน lead (หรือที่พนักงานกรอกทับ)
 *   แล้วผูกกับโปรเจกต์; ถ้าอีเมลเป็นของ CUSTOMER อยู่แล้วจะผูกบัญชีเดิมแทน (auto-match)
 * ระบบนี้ไม่มีการส่งอีเมล — endpoint คืน url ให้พนักงานคัดลอกไปส่งลูกค้าเอง (LINE/โทร)
 */
export async function issueCustomerAccessLink(
  projectId: string,
  input: IssueAccessLinkInput,
  actorId: string,
): Promise<{
  url: string;
  expiresAt: Date;
  customer: { id: string; email: string; fullName: string };
  created: boolean;
}> {
  // ถังขยะ: โครงการที่ถูกลบออกลิงก์ให้ลูกค้าไม่ได้
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { lead: true, customer: { select: { id: true, email: true, fullName: true } } },
  });
  if (!project) {
    throw new ProjectError("ไม่พบโครงการที่ระบุ", 404);
  }

  const { customer, created } =
    project.customerId && project.customer
      ? { customer: project.customer, created: false }
      : await attachCustomer(project, input, projectId, actorId);

  const { url, expiresAt } = await issueAccessTokenFor(customer.id, actorId);

  await writeAuditLog({
    userId: actorId,
    action: "ISSUE_ACCESS_LINK",
    entityType: "User",
    entityId: customer.id,
    details: { projectId, created },
  });

  return { url, expiresAt, customer: toCustomerDto(customer)!, created };
}

type ProjectWithLead = NonNullable<
  Awaited<ReturnType<typeof prisma.project.findFirst<{ include: { lead: true; customer: { select: { id: true; email: true; fullName: true } } } }>>>
>;

/**
 * โปรเจกต์ที่ยังไม่มีลูกค้า: สร้างบัญชีจากข้อมูลในคำขอ (หรือที่พนักงานกรอกทับ) แล้วผูกกับโปรเจกต์
 * อีเมลเป็นของ CUSTOMER อยู่แล้ว = ผูกบัญชีเดิม (auto-match)
 */
async function attachCustomer(
  project: ProjectWithLead,
  input: IssueAccessLinkInput,
  projectId: string,
  actorId: string,
): Promise<{ customer: { id: string; email: string | null; fullName: string }; created: boolean }> {
  let customer: { id: string; email: string | null; fullName: string };
  let created = false;
  // ไม่มีคำขอ = ลูกค้าที่โทรมา/เดินเข้ามาเอง — พนักงานต้องกรอกชื่อกับอีเมลเองทั้งหมด
  // (เดิมโครงการแบบนี้สร้างบัญชีจากหน้าโครงการไม่ได้เลย ต้องรอให้ลูกค้าไปสมัครเอง)
  const lead = project.lead;
  const email = (input.email ?? lead?.email ?? "").trim().toLowerCase();
  if (!email) {
    throw new ProjectError("ต้องมีอีเมลของลูกค้าเพื่อสร้างบัญชีและออกลิงก์เข้าใช้", 409);
  }
  const fullName = (input.fullName ?? lead?.name ?? "").trim();
  if (!fullName) {
    throw new ProjectError("กรุณากรอกชื่อ-นามสกุลของลูกค้า", 400);
  }
  const phone = input.phone ?? lead?.phone ?? null;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== "CUSTOMER") {
      throw new ProjectError("อีเมลนี้ถูกใช้โดยบัญชีพนักงานอยู่แล้ว", 409);
    }
    customer = { id: existing.id, email, fullName: existing.fullName };
  } else {
    // รหัสผ่านสุ่มที่ล็อกอินไม่ได้ — ทางเข้าเดียวคือลิงก์ตั้งรหัส จนกว่าลูกค้าจะตั้งเอง
    const passwordHash = await hashPassword(crypto.randomBytes(32).toString("hex"));
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role: "CUSTOMER",
        // ถือว่ายืนยันอีเมลแล้ว — พนักงานคุยกับลูกค้าจริงก่อนพิมพ์อีเมลนี้ และลิงก์เข้าใช้
        // ถูกส่งทาง LINE/โทรศัพท์ ไม่ได้ส่งทางเมล ถ้าบังคับยืนยันจะกลายเป็นลูกค้าตั้งรหัสเสร็จ
        // แล้วโดนถามหารหัสจากเมลที่ไม่เคยเปิด (ดู email-verification.service.ts)
        emailVerifiedAt: new Date(),
        customerProfile: { create: { phone, address: null } },
      },
    });
    customer = { id: user.id, email, fullName: user.fullName };
    created = true;
    await writeAuditLog({
      userId: actorId,
      action: lead ? "CREATE_CUSTOMER_FROM_LEAD" : "CREATE_CUSTOMER_FOR_PROJECT",
      entityType: "User",
      entityId: user.id,
      details: { email, leadId: project.leadId, projectId },
    });
  }

  await prisma.project.update({ where: { id: projectId }, data: { customerId: customer.id } });
  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_PROJECT",
    entityType: "Project",
    entityId: projectId,
    details: { linkedCustomerId: customer.id, fromLead: true },
  });
  return { customer, created };
}

/**
 * ผูก lead ที่มีอยู่เข้ากับโปรเจกต์ที่เริ่มจากศูนย์ (ไม่ได้มาจากขั้นตอน lead) ย้อนหลัง ดึงลูกค้า/
 * แบบบ้านของ lead มาใส่โปรเจกต์เมื่อสองอย่างนั้นยังว่างอยู่ เพื่อให้หน้ารายละเอียดโปรเจกต์แสดง
 * บริบท "สร้างจากคำขอ" เหมือนกัน และสถานะ lead วิ่งตามวงจรใบเสนอราคาอัตโนมัติจากนี้ไป
 */
export async function linkLeadToProject(projectId: string, leadId: string, actorId: string) {
  // ถังขยะ: โครงการที่ถูกลบผูก lead ไม่ได้
  const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!project) {
    throw new ProjectError("ไม่พบโครงการที่ระบุ", 404);
  }
  if (project.leadId) {
    throw new ProjectError("โครงการนี้เชื่อมกับคำขออยู่แล้ว", 409);
  }

  // ถังขยะ: คำขอที่ถูกลบผูกกับโครงการไม่ได้
  const lead = await prisma.lead.findFirst({ where: { id: leadId, deletedAt: null } });
  if (!lead) {
    throw new ProjectError("ไม่พบคำขอที่ระบุ", 404);
  }

  const alreadyLinked = await prisma.project.findUnique({ where: { leadId } });
  if (alreadyLinked) {
    throw new ProjectError("คำขอนี้มีโครงการเชื่อมอยู่แล้ว", 409);
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      leadId,
      // เติมค่าพวกนี้เฉพาะเมื่อโปรเจกต์ยังไม่มีของตัวเอง -- ห้ามเขียนทับลูกค้า/แบบบ้าน/ข้อมูล
      // โครงการที่พนักงานอาจตั้งไว้โดยตั้งใจ
      customerId: project.customerId ?? lead.customerId ?? undefined,
      houseDesignId: project.houseDesignId ?? lead.houseDesignId ?? undefined,
      siteAddress: project.siteAddress ?? lead.siteAddress ?? undefined,
      areaSqm: project.areaSqm ?? lead.areaSqm ?? undefined,
      startDate: project.startDate ?? lead.desiredStartDate ?? undefined,
    },
  });

  if (lead.status === "NEW") {
    await prisma.lead.update({ where: { id: leadId }, data: { status: "CONTACTED" } });
  }

  await writeAuditLog({
    userId: actorId,
    action: "LINK_LEAD_TO_PROJECT",
    entityType: "Project",
    entityId: projectId,
    details: { leadId, linkedCustomer: !project.customerId && Boolean(lead.customerId) },
  });

  return updated;
}

/**
 * ลบถาวร ต่างจากอย่างอื่นทั้งหมดในระบบนี้ (บัญชีลูกค้าถูก anonymize ส่วนใบเสนอราคา/โปรเจกต์
 * นอกนั้นทำได้แค่เปลี่ยนสถานะ) -- จำกัดไว้โดยตั้งใจเฉพาะโปรเจกต์ที่ไม่เคยออกใบเสนอราคา จึงไม่มี
 * ประวัติทางบัญชี/audit ให้เสียไป เมื่อมีใบเสนอราคา (หรือโดยอ้อมคือสัญญา) แล้ว โปรเจกต์ทำได้แค่
 * ยกเลิกเท่านั้น
 */
export async function deleteProject(id: string, actorId: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    throw new ProjectError("ไม่พบโครงการที่ระบุ", 404);
  }

  const [quoteCount, contractCount] = await Promise.all([
    prisma.quote.count({ where: { projectId: id } }),
    prisma.contract.count({ where: { projectId: id } }),
  ]);
  if (quoteCount > 0 || contractCount > 0) {
    throw new ProjectError("ไม่สามารถลบโครงการที่เคยส่งใบเสนอราคาหรือมีสัญญาแล้วได้ ใช้การยกเลิกแทน", 409);
  }

  // ถังขยะ: ย้ายเข้าถังขยะแทนการลบจริง (กู้คืนได้; auto-purge เกิน 30 วัน) — เงื่อนไข guard ด้านบนคงเดิม
  await prisma.project.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actorId } });

  await writeAuditLog({
    userId: actorId,
    action: "DELETE_PROJECT",
    entityType: "Project",
    entityId: id,
    details: { projectNo: project.projectNo, name: project.name, trashed: true },
  });
}

/** พื้นที่โครงการที่ใช้คิดราคา/ตร.ม. ได้จริง (ไม่กรอก/เป็นศูนย์ = คิดไม่ได้) */
function projectArea(project: { areaSqm: unknown }): number | null {
  const area = project.areaSqm != null ? Number(project.areaSqm) : null;
  return area != null && area > 0 ? area : null;
}

/**
 * ยอดของโครงการกำหนดเอง (CUSTOM): พนักงานกรอกยอดก่อน VAT มาเลย กำไรพับรวมอยู่ในนั้นแล้ว
 * จึงไม่คิดค่าดำเนินการ+กำไรซ้ำ (pct = 0) เหลือแค่ ยอดก่อน VAT → +VAT → สุทธิ
 *
 * แยกออกมาเพราะมีสองทางที่ต้องคิดยอดนี้ — ตอนกรอกราคา (setCustomProjectPrice) และตอนแก้
 * อัตรา VAT ทีหลัง (updateVersionRates) — ถ้าเขียนสูตรซ้ำสองที่ วันหนึ่งมันจะเพี้ยนจากกัน
 */
/**
 * แปลง "คำสั่งแก้ส่วนลด" ที่ส่งมาจากหน้าจอ ให้เป็นค่าที่จะเขียนลงเวอร์ชัน
 *
 * คืนค่าครบทั้งสามช่องเสมอ (แม้ไม่ได้สั่งแก้ ก็คืนของเดิม) เพราะฝั่ง CUSTOM ต้องเอา "ส่วนลดที่มีผล
 * จริง" ไปคิดยอดต่อทันที ถ้าคืนเป็น partial แล้วผู้ใช้แก้แค่ VAT ส่วนลดเดิมจะหายไปจากยอดเงียบ ๆ
 *
 * โหมด PERCENT ไม่เขียน discountAmt เพราะยอดบาทต้องมาจากการคิดใหม่ตามฐานราคาปัจจุบัน
 * (recalculateLatestVersionPricing / customPriceAmounts เป็นคนเขียนทับให้)
 */
function resolveDiscountFields(
  discount: UpdateVersionRatesInput["discount"],
  version: { discountPct: unknown; discountAmt: unknown; discountNote: string | null },
) {
  if (!discount) {
    return {
      discountPct: version.discountPct as number | null,
      discountAmt: version.discountAmt as number,
      discountNote: version.discountNote,
    };
  }
  if (discount.mode === "NONE") {
    return { discountPct: null, discountAmt: 0, discountNote: null };
  }
  const note = discount.note && discount.note.length > 0 ? discount.note : null;
  if (discount.mode === "PERCENT") {
    return {
      discountPct: discount.value,
      discountAmt: version.discountAmt as number,
      discountNote: note,
    };
  }
  return { discountPct: null, discountAmt: discount.value, discountNote: note };
}

function customPriceAmounts(
  enteredBeforeVat: number,
  vatPct: number,
  areaSqm: number | null,
  discount?: DiscountInput,
  roundingUnit?: number | null,
) {
  const directCost = round2(enteredBeforeVat);
  // ลำดับเดียวกับ calculatePricing เป๊ะ ๆ: ยอดที่กรอก → หักส่วนลด → ปัดยอด → +VAT
  // (CUSTOM ไม่มีค่าดำเนินการ+กำไรแยก ฐานส่วนลดจึงเป็นยอดที่กรอกมาตรง ๆ)
  const resolved = resolveDiscountAmount(directCost, discount);
  const rounded = applyNetRounding(round2(directCost - resolved.amount), vatPct, roundingUnit);
  const vatAmt = rounded.vatAmount;
  const netPrice = rounded.netPrice;
  return {
    directCost,
    overheadProfitPct: 0,
    // ไม่มีก้อนค่าดำเนินการ+กำไรให้แบ่ง (กำไรพับอยู่ในยอดที่พนักงานกรอกมาแล้ว)
    overheadPct: null,
    overheadProfitAmt: 0,
    discountAmt: resolved.amount,
    roundingAmt: rounded.roundingAmount,
    vatAmt,
    netPrice,
    // โครงการกำหนดเองไม่มี BOQ/แบบบ้าน — ถ้าพนักงานกรอกพื้นที่โครงการไว้ ก็คิดราคา/ตร.ม. ให้ได้
    pricePerSqm: areaSqm ? round2(netPrice / areaSqm) : null,
  };
}

/**
 * ตั้งราคาของโครงการกำหนดเอง (CUSTOM) — พนักงานกรอก "ยอดก่อน VAT" (กำไรรวมอยู่แล้ว) ระบบบวก
 * VAT ตามอัตราของเวอร์ชันปัจจุบันแล้วเก็บลง directCost/vatAmt/netPrice เพื่อให้สัญญา แดชบอร์ด
 * และสรุปฝั่งลูกค้าอ่านค่าเดียวกันได้ทั้งหมด ถ้าเวอร์ชันล่าสุดออกใบเสนอราคาไปแล้วจะ clone เป็น
 * เวอร์ชันใหม่ก่อน (BR-07) เหมือนการแก้ BOQ
 */
export async function setCustomProjectPrice(
  projectId: string,
  subtotalBeforeVat: number,
  actorId: string,
) {
  // ถังขยะ: โครงการที่ถูกลบตั้งราคาไม่ได้
  const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!project) {
    throw new ProjectError("ไม่พบโครงการที่ระบุ", 404);
  }
  if (project.type !== "CUSTOM") {
    throw new ProjectError("กำหนดราคาเองได้เฉพาะโครงการแบบกำหนดเองเท่านั้น", 409);
  }

  const version = await getOrCreateEditableVersion(projectId, actorId);

  const updated = await prisma.projectVersion.update({
    where: { id: version.id },
    data: customPriceAmounts(
      subtotalBeforeVat,
      Number(version.vatPct),
      projectArea(project),
      discountOf(version),
      version.roundingUnit,
    ),
  });

  await writeAuditLog({
    userId: actorId,
    action: "SET_CUSTOM_PRICE",
    entityType: "ProjectVersion",
    entityId: updated.id,
    details: {
      projectId,
      subtotalBeforeVat: Number(updated.directCost),
      netPrice: Number(updated.netPrice),
    },
  });

  return updated;
}

/**
 * แก้อัตราค่าดำเนินการ+กำไร / VAT ของโครงการที่สร้างไปแล้ว แล้วคิดยอดใหม่ทั้งชุด
 *
 * ก่อนหน้านี้ทั้งสองค่าตั้งได้ครั้งเดียวตอนสร้างโครงการเท่านั้น (VAT ตั้งไม่ได้ด้วยซ้ำ — บังคับ
 * ใช้ค่าจากหน้าตั้งค่า) พอลูกค้าต่อรองขอลดกำไรจึงต้องสร้างโครงการใหม่ทั้งใบ
 *
 * ยึดกฎเดียวกับการแก้ BOQ (BR-07): ถ้าเวอร์ชันล่าสุดออกใบเสนอราคาไปแล้ว ต้อง clone เป็นเวอร์ชัน
 * ใหม่ก่อน — ห้ามแก้อัตราทับใบที่ส่งให้ลูกค้าไปแล้วเด็ดขาด ไม่งั้นราคาในมือลูกค้ากับในระบบจะ
 * ไม่ตรงกันโดยไม่มีร่องรอย
 */
/** ค่า Decimal ที่เว้นว่างได้ → number | null */
function decimalOrNull(value: { toString(): string } | null): number | null {
  return value == null ? null : Number(value);
}

/**
 * โครงการกำหนดเองพับกำไรไว้ในยอดที่พนักงานกรอกแล้ว (pct ถูกตั้งเป็น 0 เสมอ) แก้จึงไม่มีความหมาย
 * — แต่ VAT ยังคิดจริงจากอัตราของเวอร์ชัน จึงยอมให้แก้เฉพาะ VAT
 */
function assertCustomRatesEditable(input: UpdateVersionRatesInput): void {
  if (input.overheadProfitPercent != null) {
    throw new ProjectError(
      "โครงการกำหนดเองไม่มีค่าดำเนินการ+กำไรแยก — กำไรรวมอยู่ในยอดที่กรอกแล้ว",
      409,
    );
  }
  if (input.overheadPercent != null) {
    throw new ProjectError(
      "โครงการกำหนดเองไม่มีค่าดำเนินการ+กำไรแยก จึงแบ่งเป็นค่าดำเนินการกับกำไรไม่ได้",
      409,
    );
  }
  // ค่าเผื่อเหลือเผื่อขาดคิดจาก "ค่างานต้นทุน" ที่ถอดจาก BOQ ซึ่งโครงการกำหนดเองไม่มี
  // ยอดที่พนักงานกรอกเป็นราคาขายอยู่แล้ว เผื่อทับอีกชั้นคือบวกซ้ำ
  if (input.contingencyPercent != null) {
    throw new ProjectError("โครงการกำหนดเองกรอกราคาเองอยู่แล้ว จึงใช้ค่าเผื่อเหลือเผื่อขาดไม่ได้", 409);
  }
}

/** อัตรากำไร/การแบ่งค่าดำเนินการ แก้ได้เฉพาะ OWNER — VAT และส่วนลด ADMIN ยังแก้ได้ตามเดิม */
async function assertNoOwnerOnlyRateChange(projectId: string, input: UpdateVersionRatesInput): Promise<void> {
  const latest = await prisma.projectVersion.findFirst({
    where: { projectId },
    orderBy: { versionNo: "desc" },
    select: {
      overheadProfitPct: true,
      overheadPct: true,
      contingencyPct: true,
    },
  });
  const currentOverhead = decimalOrNull(latest?.overheadPct ?? null);
  const changesTotal =
    input.overheadProfitPercent != null &&
    input.overheadProfitPercent !== Number(latest?.overheadProfitPct);
  const changesSplit = input.overheadPercent !== undefined && input.overheadPercent !== currentOverhead;
  // ค่าเผื่อเหลือเผื่อขาดคุมราคาที่ยื่นจริงพอ ๆ กับอัตรากำไร จึงอยู่ชั้นเดียวกัน
  // — ADMIN แก้ VAT/ส่วนลดได้ แต่ไม่ได้เปลี่ยนวิธีตั้งราคาของบริษัท
  const changesContingency =
    input.contingencyPercent != null && input.contingencyPercent !== Number(latest?.contingencyPct);
  if (changesTotal || changesSplit || changesContingency) {
    throw new ProjectError(OWNER_ONLY_RATE_MESSAGE, 403);
  }
}

export async function updateVersionRates(
  projectId: string,
  input: UpdateVersionRatesInput,
  actor: { id: string; role: Role },
) {
  const actorId = actor.id;
  // ถังขยะ: โครงการที่ถูกลบแก้อัตราไม่ได้
  const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!project) {
    throw new ProjectError("ไม่พบโครงการที่ระบุ", 404);
  }
  if (project.type === "CUSTOM") assertCustomRatesEditable(input);
  // ตรวจก่อน getOrCreateEditableVersion เพราะตัวนั้นอาจโคลนเวอร์ชันใหม่ทิ้งไว้ ทั้งที่คำขอถูกปฏิเสธ
  if (actor.role !== "OWNER") await assertNoOwnerOnlyRateChange(projectId, input);

  const version = await getOrCreateEditableVersion(projectId, actorId);
  const before = {
    overheadProfitPct: Number(version.overheadProfitPct),
    overheadPct: decimalOrNull(version.overheadPct),
    vatPct: Number(version.vatPct),
    discountPct: decimalOrNull(version.discountPct),
    discountAmt: Number(version.discountAmt),
    contingencyPct: Number(version.contingencyPct),
    roundingUnit: version.roundingUnit,
  };
  const discountFields = resolveDiscountFields(input.discount, version);
  const after = {
    overheadProfitPct: input.overheadProfitPercent ?? before.overheadProfitPct,
    overheadPct: input.overheadPercent === undefined ? before.overheadPct : input.overheadPercent,
    vatPct: input.vatPercent ?? before.vatPct,
    ...discountFields,
    contingencyPct: input.contingencyPercent ?? before.contingencyPct,
    roundingUnit: input.roundingUnit === undefined ? before.roundingUnit : input.roundingUnit,
  };

  // ตรวจสถานะปลายทาง ไม่ใช่เฉพาะช่องที่ส่งมา — ลดอัตรารวมลงโดยไม่แตะค่าดำเนินการ ก็ทำให้
  // กำไรติดลบได้เหมือนกัน ซึ่งแปลว่าตัวเลขที่กรอกผิด ไม่ใช่การตัดสินใจทางธุรกิจ
  if (after.overheadPct != null && after.overheadPct > after.overheadProfitPct) {
    throw new ProjectError(
      `ค่าดำเนินการ (${after.overheadPct}%) มากกว่าอัตรารวมค่าดำเนินการ+กำไร (${after.overheadProfitPct}%) ไม่ได้`,
      400,
    );
  }

  // เขียนอัตราลงเวอร์ชันก่อน แล้วค่อยให้ตัวคำนวณกลางอ่านอัตราจากเวอร์ชันไปคิดยอดใหม่
  // (ไม่คิดเองที่นี่ เพื่อไม่ให้มีสูตรราคาเวอร์ชันที่สองในระบบ)
  await prisma.projectVersion.update({ where: { id: version.id }, data: after });

  if (project.type === "CUSTOM") {
    // CUSTOM ไม่ผ่านตัวคิดราคาของ BOQ (ไม่มีบรรทัดให้รวม) — คิดจากยอดก่อน VAT ที่เก็บไว้เดิม
    await prisma.projectVersion.update({
      where: { id: version.id },
      data: customPriceAmounts(
        Number(version.directCost),
        after.vatPct,
        projectArea(project),
        discountOf(after),
        after.roundingUnit,
      ),
    });
  } else {
    // ตัวนี้คืน void และทำงานกับ "เวอร์ชันล่าสุด" ซึ่งคือ version ตัวเดียวกับที่เพิ่งเขียนอัตราลงไป
    await recalculateLatestVersionPricing(projectId);
  }
  const updated = await prisma.projectVersion.findUniqueOrThrow({ where: { id: version.id } });

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_VERSION_RATES",
    entityType: "ProjectVersion",
    entityId: version.id,
    details: {
      projectId,
      versionNo: version.versionNo,
      before,
      after: {
        overheadProfitPct: after.overheadProfitPct,
        overheadPct: after.overheadPct,
        vatPct: after.vatPct,
        discountPct: decimalOrNull(updated.discountPct),
        discountAmt: Number(updated.discountAmt),
        contingencyPct: Number(updated.contingencyPct),
        roundingUnit: updated.roundingUnit,
        roundingAmt: Number(updated.roundingAmt),
      },
      netPrice: Number(updated.netPrice),
    },
  });

  return updated;
}

/**
 * ข้อความแจ้งลูกค้าเมื่อโครงการเปลี่ยนสถานะ — ใส่เฉพาะสถานะที่ลูกค้าต้องรู้
 * ไม่มีลิงก์เพราะพอร์ทัลลูกค้าไม่มีหน้า "โครงการ" ให้กดเข้าไปดู (มีแค่คำขอ/ใบเสนอราคา/สัญญา)
 */
const CUSTOMER_STATUS_MESSAGE: Partial<Record<ProjectStatus, (projectName: string) => string>> = {
  APPROVED: (name) => `โครงการ "${name}" ได้รับการอนุมัติแล้ว ทีมงานจะจัดเตรียมสัญญาให้ในขั้นตอนถัดไป`,
  COMPLETED: (name) => `โครงการ "${name}" ส่งมอบงานเรียบร้อยแล้ว ขอบคุณที่ใช้บริการ`,
  CANCELLED: (name) => `โครงการ "${name}" ถูกยกเลิกแล้ว หากมีข้อสงสัยติดต่อทีมงานได้`,
};

export async function transitionProject(id: string, toStatus: ProjectStatus, actorId: string) {
  // ถังขยะ: โครงการที่ถูกลบเปลี่ยนสถานะไม่ได้
  const project = await prisma.project.findFirst({ where: { id, deletedAt: null } });
  if (!project) {
    throw new ProjectError("ไม่พบโครงการที่ระบุ", 404);
  }

  let hasAcceptedQuote = false;
  if (project.status === "QUOTED" && toStatus === "APPROVED") {
    const accepted = await prisma.quote.findFirst({ where: { projectId: id, status: "ACCEPTED" } });
    hasAcceptedQuote = Boolean(accepted);
  }

  try {
    assertValidProjectTransition(project.status as ProjectStatus, toStatus, { hasAcceptedQuote });
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      throw new ProjectError(err.message, 409);
    }
    throw err;
  }

  const updated = await prisma.project.update({
    where: { id },
    // COMPLETED เป็นสถานะปลายทาง (ออกไม่ได้) จึงตั้งครั้งเดียวไม่ต้องล้าง
    data: { status: toStatus, ...(toStatus === "COMPLETED" ? { completedAt: new Date() } : {}) },
  });

  await writeAuditLog({
    userId: actorId,
    action: "TRANSITION_PROJECT",
    entityType: "Project",
    entityId: id,
    details: { from: project.status, to: toStatus },
  });

  // แจ้งลูกค้าเฉพาะสถานะที่ "มีความหมายกับเขา" — DRAFT/QUOTED เกิดจากงานหลังบ้านหรือจากตัวลูกค้าเอง
  // จึงไม่ต้องเด้ง ส่วน REJECTED ลูกค้าเป็นคนกดเอง (ดู myQuotes.service)
  const customerMessage = CUSTOMER_STATUS_MESSAGE[toStatus];
  if (project.customerId && customerMessage) {
    await createNotification({
      userId: project.customerId,
      message: customerMessage(project.name),
    });
  }

  return updated;
}
