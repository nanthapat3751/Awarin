import type { ProjectStatus } from "@prisma/client";
import {
  roundTo,
  installmentProgress,
  PIPELINE_STALE_DAYS,
  type AwaitingPaymentDto,
  type ContractCashRowDto,
  type DashboardCashDto,
  type AwaitingChangeOrderDto,
  type CashShortfallDto,
  type PendingPaymentNoticeDto,
  type PriceDriftSignedDto,
  type UnverifiedPaymentDto,
  type ContactedLeadDto,
  type DashboardPipelineDto,
  type MissingDueDateDto,
  type PipelineStageDto,
  type UnsignedContractGroupDto,
} from "@systemboq/shared-types";

import { parseIsoDate, todayIso, toIsoDate } from "../../lib/business-date";
import { toCustomerDto } from "../../lib/customer-dto";
import { prisma } from "../../lib/prisma";
import { approvedChangeTotals } from "../contracts/change-orders.service";
import { projectMoneySignals } from "../projectCosts/projectCosts.service";

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
        customer: toCustomerDto(row.contract.project.customer),
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

/** สัญญาที่ออกแล้วยังไม่ลงนาม ยุบเป็นโครงการละแถว — โครงการที่สัญญาเก่าสุดค้างนานสุดขึ้นก่อน */
async function getUnsignedContracts(): Promise<UnsignedContractGroupDto[]> {
  // โครงการที่ลงนามไปแล้วสักฉบับไม่นับ: สัญญาที่ออกค้างไว้หลายฉบับเป็นตัวเลือกของงานเดียวกัน (ยอดเท่ากัน)
  // พอเซ็นฉบับหนึ่งแล้ว ฉบับที่เหลือคือของที่ไม่ได้ใช้ ไม่ใช่งานที่ต้องตามให้เซ็น
  // (กระดานเงินบนแดชบอร์ดยังนับทุกฉบับที่ยังไม่ลงนาม — ตัวเลขสองที่จึงต่างกันได้โดยตั้งใจ)
  const rows = await prisma.contract.findMany({
    where: {
      signedAt: null,
      project: { deletedAt: null, status: { not: "CANCELLED" }, contracts: { none: { signedAt: { not: null } } } },
    },
    select: {
      id: true,
      contractNo: true,
      amount: true,
      createdAt: true,
      project: {
        select: { id: true, projectNo: true, name: true, customer: { select: { id: true, email: true, fullName: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const byProject = new Map<string, UnsignedContractGroupDto>();
  for (const c of rows) {
    const group = byProject.get(c.project.id) ?? {
      project: {
        id: c.project.id,
        projectNo: c.project.projectNo,
        name: c.project.name,
        customer: toCustomerDto(c.project.customer),
      },
      contracts: [],
    };
    group.contracts.push({
      id: c.id,
      contractNo: c.contractNo,
      amount: c.amount == null ? null : String(c.amount),
      createdAt: c.createdAt.toISOString(),
    });
    byProject.set(c.project.id, group);
  }
  return [...byProject.values()];
}

/** สัญญาที่ลงนามแล้วแต่มีงวดยังไม่ตั้งวันครบกำหนด (นับเฉพาะงวดที่ยังได้เงินไม่ครบ) */
async function getMissingDueDates(): Promise<MissingDueDateDto[]> {
  const today = todayIso();
  const contracts = await prisma.contract.findMany({
    where: {
      signedAt: { not: null },
      project: { deletedAt: null, status: { not: "CANCELLED" } },
      installments: { some: { dueOn: null } },
    },
    select: {
      id: true,
      contractNo: true,
      signedAt: true,
      project: {
        select: { id: true, projectNo: true, name: true, customer: { select: { id: true, email: true, fullName: true } } },
      },
      installments: {
        select: {
          amount: true,
          dueOn: true,
          payments: { select: { amount: true, withholdingAmount: true, retentionAmount: true } },
        },
      },
    },
    orderBy: { signedAt: "asc" },
  });
  const out: MissingDueDateDto[] = [];
  for (const c of contracts) {
    let missingCount = 0;
    let remaining = 0;
    for (const inst of c.installments) {
      if (inst.dueOn != null) continue;
      const progress = installmentProgress({
        amount: Number(inst.amount),
        dueOn: null,
        today,
        payments: inst.payments.map((p) => ({
          amount: Number(p.amount),
          withholdingAmount: Number(p.withholdingAmount),
          retentionAmount: Number(p.retentionAmount),
        })),
      });
      // งวดที่รับเงินครบแล้วไม่ต้องมีวันครบกำหนด ไม่ใช่งานค้าง
      if (progress.remaining <= 0) continue;
      missingCount += 1;
      remaining += progress.remaining;
    }
    if (missingCount === 0) continue;
    out.push({
      project: {
        id: c.project.id,
        projectNo: c.project.projectNo,
        name: c.project.name,
        customer: toCustomerDto(c.project.customer),
      },
      contract: { id: c.id, contractNo: c.contractNo },
      missingCount,
      installmentCount: c.installments.length,
      remaining: roundTo(remaining, 2),
    });
  }
  return out;
}

/** ใบงานเพิ่ม-ลดที่ส่งลูกค้าแล้วรออนุมัติ — ส่งนานสุดขึ้นก่อน */
async function getAwaitingChangeOrders(): Promise<AwaitingChangeOrderDto[]> {
  const rows = await prisma.changeOrder.findMany({
    where: { status: "SENT", project: { deletedAt: null, status: { not: "CANCELLED" } } },
    select: {
      id: true,
      docNo: true,
      title: true,
      totalAmount: true,
      sentAt: true,
      contract: { select: { id: true, contractNo: true } },
      project: {
        select: { id: true, projectNo: true, name: true, customer: { select: { id: true, email: true, fullName: true } } },
      },
    },
    orderBy: { sentAt: "asc" },
  });
  return rows.map((r) => ({
    project: { id: r.project.id, projectNo: r.project.projectNo, name: r.project.name, customer: toCustomerDto(r.project.customer) },
    contract: r.contract,
    changeOrder: {
      id: r.id,
      docNo: r.docNo,
      title: r.title,
      totalAmount: String(r.totalAmount),
      sentAt: r.sentAt?.toISOString() ?? null,
    },
  }));
}

/**
 * ลูกค้าแจ้งโอนมาแล้ว รอพนักงานตรวจกับบัญชี — เงินอาจเข้าแล้วแต่ระบบยังนับว่าค้าง
 * ทิ้งไว้นานลูกค้าจะเห็นงวดค้างทั้งที่โอนไปแล้ว · เก่าสุดขึ้นก่อน
 */
async function getPendingPaymentNotices(): Promise<PendingPaymentNoticeDto[]> {
  const rows = await prisma.paymentNotice.findMany({
    where: {
      status: "PENDING",
      installment: { contract: { project: { deletedAt: null } } },
    },
    select: {
      id: true,
      paidOn: true,
      amount: true,
      createdAt: true,
      slipStatus: true,
      installment: {
        select: {
          seq: true,
          milestone: true,
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
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => {
    const { contract } = r.installment;
    return {
      project: {
        id: contract.project.id,
        projectNo: contract.project.projectNo,
        name: contract.project.name,
        customer: toCustomerDto(contract.project.customer),
      },
      contract: { id: contract.id, contractNo: contract.contractNo },
      installment: { seq: r.installment.seq, milestone: r.installment.milestone },
      notice: {
        id: r.id,
        paidOn: toIsoDate(r.paidOn)!,
        amount: String(r.amount),
        createdAt: r.createdAt.toISOString(),
        slipStatus: r.slipStatus,
      },
    };
  });
}

/** คำขอที่ติดต่อแล้วแต่ยังไม่ได้เสนอราคา — เงียบนานสุดขึ้นก่อน */
async function getContactedLeads(): Promise<ContactedLeadDto[]> {
  const rows = await prisma.lead.findMany({
    where: { status: "CONTACTED", deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      serviceType: true,
      createdAt: true,
      updatedAt: true,
      project: { select: { id: true, projectNo: true, name: true, status: true, updatedAt: true, deletedAt: true } },
    },
  });
  return rows
    // โครงการจากคำขอที่เดินพ้นร่างไปแล้ว (เสนอราคา/อนุมัติ/ยกเลิก ฯลฯ) ไม่ใช่งานค้างของคำขอ — ข้อมูลรุ่นเก่า
    // บางแถวสถานะคำขอค้าง CONTACTED ทั้งที่โครงการไปไกลแล้ว (ตอนนั้นยังไม่ซิงก์สถานะคำขอ) จึงตัดสินจากโครงการ
    .filter((l) => !l.project || l.project.deletedAt != null || l.project.status === "DRAFT")
    .map((l) => {
      const project = l.project && l.project.deletedAt == null ? l.project : null;
      const last = project && project.updatedAt > l.updatedAt ? project.updatedAt : l.updatedAt;
      return {
        lead: { id: l.id, name: l.name, phone: l.phone, serviceType: l.serviceType, createdAt: l.createdAt.toISOString() },
        project: project ? { id: project.id, projectNo: project.projectNo, name: project.name } : null,
        lastActivityAt: last.toISOString(),
      };
    })
    .sort((a, b) => a.lastActivityAt.localeCompare(b.lastActivityAt));
}

/** ใบร่างที่มีผู้เสนอแต่ยังไม่มีผู้อนุมัติ — รอนานสุดขึ้นก่อน */
async function getPendingApprovals() {
  const rows = await prisma.quoteSigner.findMany({
    where: {
      role: "PROPOSER",
      quote: { status: "DRAFT", project: { deletedAt: null }, signers: { none: { role: "APPROVER" } } },
    },
    select: {
      name: true,
      signedAt: true,
      quote: { select: { id: true, quoteNo: true, project: { select: { id: true, projectNo: true, name: true } } } },
    },
    orderBy: { signedAt: "asc" },
  });
  return rows.map((r) => ({
    project: r.quote.project,
    quote: { id: r.quote.id, quoteNo: r.quote.quoteNo },
    proposerName: r.name,
    requestedAt: r.signedAt,
  }));
}

/**
 * โครงการที่เซ็นแล้วและยังทำอยู่: ราคาในคลังขึ้นหลังเซ็น (ยังไม่กดซื้อแล้ว) · จ่ายออกมากกว่าเงินที่ลูกค้าจ่ายเข้า
 * ใช้สูตรเดียวกับแท็บต้นทุนจริง (projectMoneySignals) ตัวเลขสองที่จึงตรงกัน
 */
async function getProjectMoneySignals() {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: "APPROVED", contracts: { some: { signedAt: { not: null } } } },
    select: { id: true, projectNo: true, name: true, customer: { select: { id: true, email: true, fullName: true } } },
  });
  const priceDriftSigned: PriceDriftSignedDto[] = [];
  const cashShortfall: CashShortfallDto[] = [];
  for (const row of projects) {
    const project = { id: row.id, projectNo: row.projectNo, name: row.name, customer: toCustomerDto(row.customer) };
    const { priceDrift, cash } = await projectMoneySignals(row.id);
    const rising = priceDrift?.lines.filter((l) => !l.acked && l.delta > 0) ?? [];
    if (priceDrift && rising.length > 0) {
      priceDriftSigned.push({
        project,
        contract: { contractNo: priceDrift.contractNo },
        lineCount: rising.length,
        increase: priceDrift.increase,
      });
    }
    if (cash.net < 0) cashShortfall.push({ project, net: cash.net, nextInstallment: cash.nextInstallment });
  }
  priceDriftSigned.sort((a, b) => b.increase - a.increase);
  cashShortfall.sort((a, b) => a.net - b.net);
  return { priceDriftSigned, cashShortfall };
}

/** รับเงินที่บันทึกแล้วแต่ยังไม่มีใครยืนยันกับบัญชีธนาคาร — เก่าสุดขึ้นก่อน */
async function getUnverifiedPayments(): Promise<UnverifiedPaymentDto[]> {
  const rows = await prisma.installmentPayment.findMany({
    where: {
      verifiedAt: null,
      installment: { contract: { project: { deletedAt: null } } },
    },
    orderBy: { createdAt: "asc" },
    include: {
      recordedBy: { select: { fullName: true } },
      installment: {
        select: {
          seq: true,
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
      },
    },
  });
  return rows.map((r) => {
    const { contract } = r.installment;
    return {
      project: {
        id: contract.project.id,
        projectNo: contract.project.projectNo,
        name: contract.project.name,
        customer: toCustomerDto(contract.project.customer),
      },
      contract: { id: contract.id, contractNo: contract.contractNo },
      installment: { seq: r.installment.seq },
      payment: {
        id: r.id,
        paidOn: toIsoDate(r.paidOn)!,
        amount: r.amount.toFixed(2),
        recordedByName: r.recordedBy?.fullName ?? null,
        createdAt: r.createdAt.toISOString(),
      },
    };
  });
}

export async function getPendingWork() {
  const [pendingApprovals, unsignedContracts, missingDueDates, awaitingChangeOrders, contactedLeads] = await Promise.all([
    getPendingApprovals(),
    getUnsignedContracts(),
    getMissingDueDates(),
    getAwaitingChangeOrders(),
    getContactedLeads(),
  ]);
  const pendingPaymentNotices = await getPendingPaymentNotices();
  const { priceDriftSigned, cashShortfall } = await getProjectMoneySignals();
  const unverifiedPayments = await getUnverifiedPayments();
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

  return {
    pendingPaymentNotices,
    pendingApprovals,
    unsignedContracts,
    missingDueDates,
    awaitingChangeOrders,
    contactedLeads,
    pendingRevisions,
    rejectedQuotes,
    awaitingResponse,
    awaitingPayment,
    newLeads,
    priceDriftSigned,
    cashShortfall,
    unverifiedPayments,
  };
}

// ── ขั้นตอนของงาน (pipeline): จำนวน + มูลค่าที่ค้างอยู่แต่ละขั้น ──
// ทุกขั้นนับ "โครงการ" ไม่ใช่ใบเอกสาร เพราะโครงการเดียวออกใบเสนอราคาได้หลายฉบับ (BR-07)
// ถ้านับใบ ท่อจะพองตามจำนวนครั้งที่แก้ราคา ไม่ใช่ตามงานจริง
export async function getPipeline(): Promise<DashboardPipelineDto> {
  const [openLeads, quotedProjects, acceptedProjects, completedProjects, staleQuoted, rejectedCount, cancelledCount] =
    await Promise.all([
      // คำขอที่ยังไม่จบ — ปิด/ปฏิเสธแล้วออกจากท่อ ส่วนที่เสนอราคาแล้วจะไปโผล่ขั้นถัดไปในฐานะโครงการ
      prisma.lead.count({ where: { deletedAt: null, status: { in: ["NEW", "CONTACTED"] } } }),
      valuedProjects(["QUOTED"]),
      // APPROVED = ลูกค้ายอมรับแล้ว ทั้งที่ยังไม่ลงนามและลงนามสัญญาแล้ว (ไม่มีสถานะลงนามแยก)
      valuedProjects(["APPROVED"]),
      valuedProjects(["COMPLETED"]),
      staleQuotedCount(),
      prisma.project.count({ where: { deletedAt: null, status: "REJECTED" } }),
      prisma.project.count({ where: { deletedAt: null, status: "CANCELLED" } }),
    ]);

  const stages: PipelineStageDto[] = [
    { key: "lead", label: "คำขอจากลูกค้า", count: openLeads, value: null, href: "/leads", staleCount: 0 },
    { key: "quoted", label: "เสนอราคาแล้ว", count: quotedProjects.count, value: quotedProjects.value, href: "/projects?status=QUOTED", staleCount: staleQuoted },
    { key: "accepted", label: "ลูกค้ายอมรับ", count: acceptedProjects.count, value: acceptedProjects.value, href: "/projects?status=APPROVED", staleCount: 0 },
    { key: "completed", label: "งานเสร็จสิ้น", count: completedProjects.count, value: completedProjects.value, href: "/projects?status=COMPLETED", staleCount: 0 },
  ];

  return { stages, lost: { rejectedCount, cancelledCount } };
}

/**
 * โครงการขั้นเสนอราคาที่ใบล่าสุดส่งไปเกิน PIPELINE_STALE_DAYS วันแล้วลูกค้ายังไม่ตอบ
 * ดูเฉพาะใบล่าสุดที่ไม่ใช่ร่าง (ใบรุ่นเก่าค้างสถานะ SENT ได้ เพราะออกใบใหม่ไม่ได้ปิดใบเก่า)
 */
async function staleQuotedCount(): Promise<number> {
  const cutoff = new Date(Date.now() - PIPELINE_STALE_DAYS * 24 * 60 * 60 * 1000);
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: "QUOTED" },
    select: {
      quotes: {
        where: { status: { not: "DRAFT" } },
        orderBy: { revisionNo: "desc" },
        take: 1,
        select: { status: true, sentAt: true },
      },
    },
  });
  return projects.filter((p) => {
    const latest = p.quotes[0];
    return latest?.status === "SENT" && latest.sentAt != null && latest.sentAt < cutoff;
  }).length;
}

/** จำนวน + มูลค่าของโครงการตามสถานะ — มูลค่าอ่านจากใบเสนอราคาฉบับล่าสุดที่ส่งออกไปจริง */
async function valuedProjects(statuses: ProjectStatus[]): Promise<{ count: number; value: number }> {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: { in: statuses } },
    select: {
      quotes: {
        where: { status: { not: "DRAFT" } },
        orderBy: { revisionNo: "desc" },
        take: 1,
        select: { projectVersion: { select: { netPrice: true } } },
      },
    },
  });
  const value = projects.reduce(
    (sum, p) => sum + (p.quotes[0] ? Number(p.quotes[0].projectVersion.netPrice) : 0),
    0,
  );
  return { count: projects.length, value };
}

// ── กระดานเงินตามสัญญา ──
// รับเงินได้เฉพาะสัญญาที่ลงนามแล้ว ส่วนสัญญาที่ออกแล้วยังไม่ลงนามแยกไปอีกก้อน
export async function getContractCash(): Promise<DashboardCashDto> {
  const today = todayIso();
  const [signed, unsigned] = await Promise.all([
    prisma.contract.findMany({
      where: { signedAt: { not: null }, project: { deletedAt: null, status: { not: "CANCELLED" } } },
      select: {
        id: true,
        contractNo: true,
        signedAt: true,
        amount: true,
        project: {
          select: {
            id: true,
            projectNo: true,
            name: true,
            customer: { select: { fullName: true, email: true } },
          },
        },
        installments: {
          select: {
            amount: true,
            dueOn: true,
            payments: { select: { amount: true, withholdingAmount: true, retentionAmount: true } },
          },
        },
        retentionReleases: { select: { amount: true, withholdingAmount: true } },
      },
      orderBy: { signedAt: "desc" },
    }),
    prisma.contract.findMany({
      where: { signedAt: null, project: { deletedAt: null, status: { not: "CANCELLED" } } },
      select: { id: true, contractNo: true, amount: true, project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // มูลค่าปัจจุบัน = ตามสัญญา + ใบงานเพิ่ม-ลดที่อนุมัติ (งวดของงานเพิ่มอยู่ในแผนแล้ว ยอดต้องไปด้วยกัน)
  const changes = await approvedChangeTotals(signed.map((c) => c.id));
  const allRows: ContractCashRowDto[] = signed.map((c) => {
    let paidAmount = 0;
    let receivedAmount = 0;
    let remaining = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let installmentsWithoutDueDate = 0;
    let retained = 0;

    for (const inst of c.installments) {
      const dueOn = toIsoDate(inst.dueOn);
      const progress = installmentProgress({
        amount: Number(inst.amount),
        dueOn,
        today,
        payments: inst.payments.map((p) => ({
          amount: Number(p.amount),
          withholdingAmount: Number(p.withholdingAmount),
          retentionAmount: Number(p.retentionAmount),
        })),
      });
      // งวดที่รับครบแล้วไม่ต้องมีวันครบกำหนด — นับแต่งวดที่ยังต้องตามเก็บ (ไม่งั้นป้ายเตือนค้างตลอดไป)
      if (!dueOn && progress.remaining > 0) installmentsWithoutDueDate += 1;
      retained += progress.retainedAmount;
      paidAmount += progress.paidAmount;
      receivedAmount += progress.receivedAmount;
      remaining += progress.remaining;
      if (progress.daysOverdue != null) {
        overdueCount += 1;
        overdueAmount += progress.remaining;
      }
    }

    return {
      contract: { id: c.id, contractNo: c.contractNo, signedAt: c.signedAt ? c.signedAt.toISOString() : null },
      project: { id: c.project.id, projectNo: c.project.projectNo, name: c.project.name },
      customerName: c.project.customer?.fullName ?? c.project.customer?.email ?? null,
      amount: c.amount == null ? 0 : Number(c.amount) + (changes.get(c.id)?.amount ?? 0),
      installmentCount: c.installments.length,
      installmentsWithoutDueDate,
      paidAmount: round2(paidAmount),
      // เงินประกันที่ได้คืนแล้วก็คือเงินเข้าบัญชีจริงด้วย
      receivedAmount: round2(
        receivedAmount +
          c.retentionReleases.reduce((sum, r) => sum + Number(r.amount) - Number(r.withholdingAmount), 0),
      ),
      remaining: round2(remaining),
      overdueCount,
      overdueAmount: round2(overdueAmount),
      // เงินประกันที่ลูกค้ายังถืออยู่ — ไม่ใช่ยอดค้างของงวด แต่ยังเป็นเงินที่เราต้องได้
      retentionOutstanding: Math.max(
        round2(retained - c.retentionReleases.reduce((sum, r) => sum + Number(r.amount), 0)),
        0,
      ),
    };
  });

  // สัญญาเก่าที่ไม่มีทั้งยอดและงวด = แถวศูนย์ล้วน ไม่ช่วยอะไรในตาราง แต่ต้องนับให้เห็น
  const rows = allRows.filter((r) => r.amount > 0 || r.installmentCount > 0);
  const legacyContractCount = allRows.length - rows.length;

  const totals = rows.reduce(
    (acc, r) => ({
      contractAmount: acc.contractAmount + r.amount,
      paidAmount: acc.paidAmount + r.paidAmount,
      receivedAmount: acc.receivedAmount + r.receivedAmount,
      remaining: acc.remaining + r.remaining,
      overdueAmount: acc.overdueAmount + r.overdueAmount,
      installmentsWithoutDueDate: acc.installmentsWithoutDueDate + r.installmentsWithoutDueDate,
      retentionOutstanding: acc.retentionOutstanding + r.retentionOutstanding,
    }),
    {
      contractAmount: 0,
      paidAmount: 0,
      receivedAmount: 0,
      remaining: 0,
      overdueAmount: 0,
      installmentsWithoutDueDate: 0,
      retentionOutstanding: 0,
    },
  );

  return {
    rows,
    legacyContractCount,
    totals: {
      contractAmount: round2(totals.contractAmount),
      paidAmount: round2(totals.paidAmount),
      receivedAmount: round2(totals.receivedAmount),
      remaining: round2(totals.remaining),
      overdueAmount: round2(totals.overdueAmount),
      installmentsWithoutDueDate: totals.installmentsWithoutDueDate,
      retentionOutstanding: round2(totals.retentionOutstanding),
    },
    unsignedContracts: unsigned.map((c) => ({
      id: c.id,
      contractNo: c.contractNo,
      projectId: c.project.id,
      projectName: c.project.name,
      amount: c.amount == null ? null : Number(c.amount),
    })),
  };
}

/** ปัดสองตำแหน่งแบบเดียวกับฝั่ง shared-types — กันเศษทศนิยมลอยจากการบวกทีละงวด */
function round2(value: number): number {
  return roundTo(value, 2);
}
