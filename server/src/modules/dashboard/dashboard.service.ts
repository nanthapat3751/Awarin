import type { ProjectStatus } from "@prisma/client";
import { installmentProgress, type AwaitingPaymentDto } from "@systemboq/shared-types";

import { parseIsoDate, todayIso, toIsoDate } from "../../lib/business-date";
import { prisma } from "../../lib/prisma";

const ALL_STATUSES: ProjectStatus[] = [
  "DRAFT",
  "QUOTED",
  "REJECTED",
  "APPROVED",
  "COMPLETED",
  "CANCELLED",
];

// มูลค่าในไปป์ไลน์ + ที่ปิดได้ (ไม่รวม DRAFT ที่ยังไม่มีราคาที่มีความหมาย และ CANCELLED)
// REJECTED ก็ไม่นับ: ดีลที่ลูกค้าปฏิเสธไปแล้วไม่ใช่ยอดที่กำลังลุ้นอยู่ ถ้านับต่อไป ตัวเลข
// "มูลค่ารวมโครงการที่เสนอราคาแล้ว" จะพองขึ้นเรื่อย ๆ ทุกครั้งที่เสียดีล (ถ้าออกใบใหม่แล้วส่ง
// โปรเจกต์กลับไปเป็น QUOTED มูลค่าก็กลับเข้าไปนับเองตามเดิม)
const VALUED_STATUSES: ProjectStatus[] = ["QUOTED", "APPROVED", "COMPLETED"];

// โปรเจกต์ที่จบวงจรแล้ว (ยกเลิก/เสร็จสิ้น) ไม่ถือเป็น "งานที่รอดำเนินการ" อีก แม้ใบเสนอราคาฉบับ
// ล่าสุดจะค้างเป็น REVISED อยู่ -- การยกเลิกโปรเจกต์ไม่ได้แตะสถานะใบเสนอราคา (ดู transitionProject)
// ถ้าไม่กรองตรงนี้ งานที่ปิดไปแล้วจะค้างอยู่ในหน้า "งานที่รอดำเนินการ" ตลอดไปและเคลียร์ไม่ได้
// เพราะ CANCELLED/COMPLETED เป็นสถานะปลายทาง (ดู project-state-machine.ts)
const TERMINAL_PROJECT_STATUSES: ProjectStatus[] = ["COMPLETED", "CANCELLED"];

export async function getDashboardSummary() {
  // ถังขยะ: ทุกตัวเลข/รายการในแดชบอร์ดไม่รวมโครงการที่ถูกลบ (deletedAt: null)
  const [statusGroups, newLeadsCount, recentProjects, quotedProjects, quotedProjectCount, wonProjectCount] =
    await Promise.all([
    prisma.project.groupBy({ by: ["status"], _count: { _all: true }, where: { deletedAt: null } }),
    prisma.lead.count({ where: { status: "NEW", deletedAt: null } }),
    prisma.project.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 5 }),
    // "มูลค่าที่เสนอราคาแล้ว" ต้องเป็นราคาที่ลูกค้าเห็นจริง จึงอ่านจากเวอร์ชันที่ผูกกับใบเสนอราคา
    // ฉบับล่าสุดที่ส่งออกไปจริง (status != DRAFT) -- ไม่ใช่เวอร์ชันล่าสุดของโปรเจกต์ เพราะ BR-07
    // จะ clone เวอร์ชันใหม่ทุกครั้งที่พนักงานแก้ BOQ หลังส่งใบเสนอราคา ถ้าใช้เวอร์ชันล่าสุด ยอด
    // จะเพี้ยนไปตามงานที่ยังแก้ค้างอยู่และยังไม่ได้เสนอลูกค้า (เคยทำให้โปรเจกต์ที่เสนอไปแล้วนับเป็น 0)
    prisma.project.findMany({
      where: { deletedAt: null, status: { in: VALUED_STATUSES } },
      select: {
        quotes: {
          where: { status: { not: "DRAFT" } },
          orderBy: { revisionNo: "desc" },
          take: 1,
          select: { projectVersion: { select: { netPrice: true } } },
        },
      },
    }),
    // อัตราปิดงาน: นับเป็นโครงการ (ไม่ใช่จำนวนใบเสนอราคา — โครงการเดียวออกได้หลายฉบับ)
    // ตัวหาร = โครงการที่ส่งใบเสนอราคาให้ลูกค้าไปแล้วจริง (มีใบที่ไม่ใช่ DRAFT) รวมที่ยกเลิกไปแล้ว
    // ด้วย เพราะดีลที่เสียก็ต้องอยู่ในฐานคำนวณ ไม่งั้นอัตราจะสูงเกินจริง
    prisma.project.count({
      where: { deletedAt: null, quotes: { some: { status: { not: "DRAFT" } } } },
    }),
    prisma.project.count({
      where: {
        deletedAt: null,
        status: { in: ["APPROVED", "COMPLETED"] },
        quotes: { some: { status: { not: "DRAFT" } } },
      },
    }),
  ]);

  const projectCounts = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<
    ProjectStatus,
    number
  >;
  for (const group of statusGroups) {
    projectCounts[group.status] = group._count._all;
  }

  const totalQuotedValue = quotedProjects.reduce((sum, project) => {
    const sentQuote = project.quotes[0];
    return sum + (sentQuote ? Number(sentQuote.projectVersion.netPrice) : 0);
  }, 0);

  return {
    projectCounts,
    totalQuotedValue,
    newLeadsCount,
    wonProjectCount,
    quotedProjectCount,
    recentProjects,
  };
}

// มุมมองหน้าเดียวของทุกอย่างที่พนักงานยังต้องจัดการ -- โปรเจกต์ที่ใบเสนอราคาล่าสุดกลับมาเป็น
// REVISED (ลูกค้าขอให้แก้ ยังไม่ได้ส่งใบเสนอราคาใหม่ตาม) และ lead ที่ยังไม่ได้ติดต่อเลย --
// เพื่อไม่ให้ตกหล่นเมื่อมีงานหลายงานเดินพร้อมกัน แทนที่จะต้องเปิดทีละโปรเจกต์เอง
/**
 * งวดที่ถึงกำหนดแล้วแต่เงินยังไม่เข้าครบ
 *
 * เงื่อนไขที่ต้องอ่านให้ตรง:
 * - **สัญญาต้องลงนามแล้ว** — โครงการหนึ่งออกสัญญาได้หลายฉบับ ถ้านับฉบับร่างด้วย ยอดค้างรับ
 *   จะพองเป็นหลายเท่าทันที (PRJ-2026-0928 มีสี่ฉบับ ยอดเท่ากันหมด เซ็นจริงฉบับเดียว)
 * - **ต้องมีวันครบกำหนดที่คนกรอกไว้เอง** — งวดที่ยังไม่ตั้งวันไม่ใช่งานค้าง เพราะระบบไม่รู้ว่า
 *   งานถึงงวดนั้นหรือยัง การเดาให้แล้วขึ้นว่าค้างคือการสร้างงานปลอมให้คนไล่ตาม
 * - **โครงการที่เสร็จแล้วยังอยู่ในรายการ** — งานส่งมอบครบแต่ค้างงวดสุดท้ายคือกรณีที่ต้องตามที่สุด
 *   ตัดออกเฉพาะโครงการที่ยกเลิก (ไม่มีหนี้ให้เก็บแล้ว)
 */
async function getAwaitingPayment(): Promise<AwaitingPaymentDto[]> {
  const today = todayIso();
  const rows = await prisma.contractInstallment.findMany({
    where: {
      dueOn: { not: null, lte: parseIsoDate(today)! },
      contract: {
        signedAt: { not: null },
        project: { deletedAt: null, status: { not: "CANCELLED" } },
      },
    },
    include: {
      payments: { select: { amount: true, withholdingAmount: true } },
      contract: {
        select: {
          id: true,
          contractNo: true,
          project: {
            select: {
              id: true,
              projectNo: true,
              name: true,
              customer: { select: { id: true, email: true, fullName: true } },
            },
          },
        },
      },
    },
  });

  return rows
    .map((row) => {
      const dueOn = toIsoDate(row.dueOn)!;
      const progress = installmentProgress({
        amount: Number(row.amount),
        dueOn,
        today,
        payments: row.payments.map((p) => ({
          amount: Number(p.amount),
          withholdingAmount: Number(p.withholdingAmount),
        })),
      });
      return { row, dueOn, progress };
    })
    .filter(({ progress }) => progress.remaining > 0)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .map(({ row, dueOn, progress }) => ({
      project: {
        id: row.contract.project.id,
        projectNo: row.contract.project.projectNo,
        name: row.contract.project.name,
        customer: row.contract.project.customer,
      },
      contract: { id: row.contract.id, contractNo: row.contract.contractNo },
      installment: {
        id: row.id,
        seq: row.seq,
        milestone: row.milestone,
        amount: String(row.amount),
        dueOn,
      },
      remaining: progress.remaining,
      // 0 = ครบกำหนดวันนี้พอดี ยังไม่ถือว่าเลย
      daysOverdue: progress.daysOverdue ?? 0,
    }));
}

export async function getPendingWork() {
  const [projectsWithRevision, projectsRejected, projectsAwaitingResponse, awaitingPayment, newLeads] = await Promise.all([
    prisma.project.findMany({
      where: {
        deletedAt: null,
        status: { notIn: TERMINAL_PROJECT_STATUSES },
        quotes: { some: { status: "REVISED" } },
      },
      include: {
        customer: { select: { id: true, email: true, fullName: true } },
        quotes: { orderBy: { revisionNo: "desc" }, take: 1 },
      },
    }),
    // ดีลที่ลูกค้าปฏิเสธและยังไม่ได้ตัดสินใจว่าจะทำอะไรต่อ -- เดิมไม่มีหมวดนี้เลย งานที่เสียดีล
    // จึงหายออกจากหน้านี้เงียบ ๆ เหลือร่องรอยแค่การแจ้งเตือนที่ไถผ่านไปแล้วก็หาย
    // ใช้สถานะโปรเจกต์ = REJECTED เป็นตัวกรอง: พอออกใบใหม่แล้วส่ง โปรเจกต์กลับไปเป็น QUOTED เอง
    // แถวนี้จึงหลุดออกจากรายการทันทีโดยไม่ต้องมีปุ่ม "ทำเสร็จแล้ว" ให้กด
    prisma.project.findMany({
      where: { deletedAt: null, status: "REJECTED" },
      include: {
        customer: { select: { id: true, email: true, fullName: true } },
        quotes: { where: { status: { not: "DRAFT" } }, orderBy: { revisionNo: "desc" }, take: 1 },
      },
    }),
    // ใบเสนอราคาที่ส่งไปแล้วแต่ลูกค้ายังเงียบ -- เดิมมองไม่เห็นเลย ต้องเปิดทีละโปรเจกต์ถึงจะรู้
    // จำกัดที่ status = QUOTED เท่านั้น (เสนอราคาแล้วยังไม่ได้ข้อสรุป): โปรเจกต์ที่อนุมัติ/เสร็จ/
    // ยกเลิกไปแล้วถือว่าจบ ไม่ต้องตามงาน แม้ใบฉบับหลังจะยังค้างสถานะ SENT อยู่ก็ตาม
    prisma.project.findMany({
      where: { deletedAt: null, status: "QUOTED", quotes: { some: { status: "SENT" } } },
      include: {
        customer: { select: { id: true, email: true, fullName: true } },
        quotes: { where: { status: { not: "DRAFT" } }, orderBy: { revisionNo: "desc" }, take: 1 },
      },
    }),
    getAwaitingPayment(),
    prisma.lead.findMany({
      where: { status: "NEW", deletedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // นับเฉพาะใบเสนอราคาล่าสุดของแต่ละโปรเจกต์ -- ถ้ามีใบเสนอราคาที่ใหม่กว่าอยู่แล้ว
  // แปลว่าพนักงานจัดการคำขอแก้ไขไปแล้ว
  const pendingRevisions = projectsWithRevision
    .filter((p) => p.quotes[0]?.status === "REVISED")
    .map((p) => ({
      project: { id: p.id, projectNo: p.projectNo, name: p.name, customer: p.customer },
      quote: p.quotes[0],
    }));

  const rejectedQuotes = projectsRejected
    .filter((p) => p.quotes[0])
    .map((p) => ({
      project: { id: p.id, projectNo: p.projectNo, name: p.name, customer: p.customer },
      quote: p.quotes[0],
    }))
    .sort((a, b) => (b.quote.respondedAt?.getTime() ?? 0) - (a.quote.respondedAt?.getTime() ?? 0));

  // นับเฉพาะใบล่าสุด: ถ้ามีฉบับใหม่กว่าออกไปแล้ว ฉบับเก่าที่ค้างสถานะ SENT ถือว่าถูกแทนที่ไปแล้ว
  // (state machine ไม่ปิดใบเก่าให้ ดู quote-state-machine.ts) เรียงใบที่รอนานสุดขึ้นก่อน = เร่งสุด
  const awaitingResponse = projectsAwaitingResponse
    .filter((p) => p.quotes[0]?.status === "SENT")
    .map((p) => ({
      project: { id: p.id, projectNo: p.projectNo, name: p.name, customer: p.customer },
      quote: p.quotes[0],
    }))
    .sort((a, b) => (a.quote.sentAt?.getTime() ?? 0) - (b.quote.sentAt?.getTime() ?? 0));

  return { pendingRevisions, rejectedQuotes, awaitingResponse, awaitingPayment, newLeads };
}
