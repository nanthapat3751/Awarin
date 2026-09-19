import type { LeadStatus, Prisma } from "@prisma/client";

import { writeAuditLog } from "../../lib/audit-log";
import { createNotification, notifyStaff } from "../../lib/notifications";
import { prisma } from "../../lib/prisma";
import { createProject } from "../projects/projects.service";
import type { CreateLeadInput } from "./leads.schemas";

// Lead ที่ถึงผลลัพธ์สุดท้ายแล้ว (ปิดดีลได้หรือเสียดีล) ไม่ควรถูกเปิดใหม่เงียบ ๆ จากเหตุการณ์
// ใบเสนอราคาที่เกิดทีหลังบนใบเสนอราคาฉบับอื่นที่ไม่เกี่ยวกัน
const TERMINAL_LEAD_STATUSES: ReadonlySet<LeadStatus> = new Set<LeadStatus>(["CLOSED", "REJECTED"]);

export class LeadError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "LeadError";
    this.status = status;
  }
}

export async function createLead(input: CreateLeadInput, customerId: string | null) {
  // houseDesignId มาจาก query string ของฟอร์มสาธารณะ — คนแก้ URL ให้เป็นค่ามั่วได้ ถ้าปล่อยลงตรง ๆ
  // FK จะ throw (P2003) แล้วกลายเป็น 500 ที่ไม่ได้จัดการ อีกทั้งไม่ควรผูกคำขอกับแบบบ้านที่ถูกลบ
  // (ถังขยะ) — ถ้าอ้างถึงแบบบ้านที่ไม่มี/ถูกลบ ให้ตัดทิ้งเป็น null แทนที่จะทำให้คำขอทั้งใบล้มเหลว
  let houseDesignId: string | null = null;
  if (input.houseDesignId) {
    const design = await prisma.houseDesign.findFirst({
      where: { id: input.houseDesignId, deletedAt: null },
      select: { id: true },
    });
    houseDesignId = design?.id ?? null;
  }

  const lead = await prisma.lead.create({
    data: {
      customerId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      serviceType: input.serviceType,
      houseDesignId,
      message: input.message,
      siteAddress: input.siteAddress ?? null,
      areaSqm: input.areaSqm ?? null,
      desiredStartDate: input.desiredStartDate ?? null,
      attachments: input.attachments as Prisma.InputJsonValue | undefined,
      status: "NEW",
    },
  });

  await writeAuditLog({
    userId: customerId,
    action: "CREATE_LEAD",
    entityType: "Lead",
    entityId: lead.id,
    details: { serviceType: lead.serviceType },
  });

  await notifyStaff(`คำขอใหม่จาก ${lead.name} (${lead.serviceType})`, "/leads");

  return lead;
}

export async function listLeads(status?: LeadStatus) {
  const leads = await prisma.lead.findMany({
    // ถังขยะ: ไม่แสดงคำขอที่ถูกลบ (ย้ายเข้าถังขยะ)
    where: { deletedAt: null, ...(status ? { status } : {}) },
    include: { project: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });
  return leads.map(({ project, ...lead }) => ({ ...lead, projectId: project?.id ?? null }));
}

export async function listMyLeads(customerId: string) {
  return prisma.lead.findMany({
    where: { customerId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateLeadStatus(id: string, status: LeadStatus, actorId: string) {
  const existing = await prisma.lead.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    throw new LeadError("ไม่พบคำขอที่ระบุ", 404);
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: { status },
  });

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_LEAD_STATUS",
    entityType: "Lead",
    entityId: id,
    details: { from: existing.status, to: status },
  });

  return lead;
}

// บันทึกข้อความตอบกลับของพนักงานต่อ lead ลูกค้าจะเห็นใน "คำขอของฉัน" ถ้าลูกค้ามีบัญชี เราจะ
// ส่งการแจ้งเตือนในแอปให้ด้วย ส่วนคำถามแบบไม่ระบุตัวตน (ไม่มี customerId) ยังเก็บคำตอบไว้
// แต่พนักงานต้องติดต่อกลับผ่านเบอร์/อีเมลที่แสดงบนหน้า leads
export async function replyToLead(id: string, reply: string, actorId: string) {
  const existing = await prisma.lead.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    throw new LeadError("ไม่พบคำขอที่ระบุ", 404);
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: { reply, repliedAt: new Date() },
  });

  await writeAuditLog({
    userId: actorId,
    action: "REPLY_LEAD",
    entityType: "Lead",
    entityId: id,
  });

  if (lead.customerId) {
    await createNotification({
      userId: lead.customerId,
      message: `ทีมงานตอบกลับคำขอของคุณ (${lead.serviceType}) แล้ว`,
      link: "/my/requests",
    });
  }

  return lead;
}

// ลบคำขอ (สแปม/ขยะ) → ย้ายเข้าถังขยะ (soft-delete) กู้คืนได้ที่เมนูถังขยะ ลบถาวรอัตโนมัติหลัง 30 วัน
// กันไม่ให้ลบคำขอที่ถูกสร้างเป็นโครงการไปแล้ว — งานจริงต้องจัดการผ่านวงจรของโครงการ (ยกเลิกโครงการ)
export async function deleteLead(id: string, actorId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id, deletedAt: null },
    include: { project: { select: { id: true } } },
  });
  if (!lead) {
    throw new LeadError("ไม่พบคำขอที่ระบุ", 404);
  }
  if (lead.project) {
    throw new LeadError("คำขอนี้ถูกสร้างเป็นโครงการแล้ว หากต้องการยกเลิกให้จัดการที่โครงการ", 409);
  }

  await prisma.lead.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: actorId },
  });

  await writeAuditLog({
    userId: actorId,
    action: "DELETE_LEAD",
    entityType: "Lead",
    entityId: id,
    details: { trashed: true },
  });
}

// แปลง Lead เป็น Project โดยตรง (ยกลูกค้า/แบบบ้านมาด้วย) และผูกกันไว้ เพื่อให้สถานะของ Lead
// วิ่งตามวงจรชีวิตของโปรเจกต์/ใบเสนอราคาอัตโนมัติจากนี้ไป -- เลี่ยงไม่ให้พนักงานต้องพิมพ์
// รายละเอียดเดิมซ้ำ และไม่ต้องคอยจำว่าต้องอัปเดตสถานะ Lead เองด้วยมือ
export async function createProjectFromLead(leadId: string, actorId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, deletedAt: null } });
  if (!lead) {
    throw new LeadError("ไม่พบคำขอที่ระบุ", 404);
  }

  return createProject(
    {
      name: `${lead.name} - ${lead.serviceType}`,
      customerId: lead.customerId ?? undefined,
      houseDesignId: lead.houseDesignId ?? undefined,
      // เติมข้อมูลโครงการเบื้องต้นที่ลูกค้าให้มาในคำขอ เพื่อไม่ให้พนักงานพิมพ์ซ้ำ -- เป็นค่าตั้งต้น
      // ที่พนักงานยืนยัน/แก้ไขได้ในการ์ด "รายละเอียดโครงการ" ก่อนออกใบเสนอราคา/สัญญา
      siteAddress: lead.siteAddress ?? undefined,
      areaSqm: lead.areaSqm ? Number(lead.areaSqm) : undefined,
      startDate: lead.desiredStartDate ?? undefined,
      leadId: lead.id,
    },
    actorId,
  );
}

// ถูกเรียกจากวงจรใบเสนอราคา (quotes.service.ts / myQuotes.service.ts) ทุกครั้งที่สถานะของ
// โปรเจกต์เปลี่ยนด้วยเหตุที่ควรทำให้ Lead ต้นทางขยับตามด้วย -- ไม่ทำอะไรถ้าโปรเจกต์ไม่ได้ถูก
// สร้างจาก Lead จริง และไม่เปิด Lead ที่ถึงผลลัพธ์สุดท้ายไปแล้วขึ้นมาใหม่
export async function syncLeadStatusForProject(projectId: string, status: LeadStatus): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { leadId: true } });
  if (!project?.leadId) return;

  const lead = await prisma.lead.findUnique({ where: { id: project.leadId } });
  if (!lead || TERMINAL_LEAD_STATUSES.has(lead.status) || lead.status === status) return;

  await prisma.lead.update({ where: { id: project.leadId }, data: { status } });
}
