import {
  budgetForKey,
  commitmentPaid,
  commitmentRemaining,
  costValue,
  overrunAmount,
  type CostOverrunDto,
  type CostOverrunReason,
  type ExposureChange,
  type ExposureCommitment,
  type ExposureCost,
  type LinkedChangeOrderDto,
  type ProjectCashDto,
  type ProjectCommitmentDto,
  type ProjectCostDto,
  type ProjectCostReportDto,
  type SignedPriceDriftDto,
} from "@systemboq/shared-types";
import type { ChangeOrderStatus, ProjectVersion } from "@prisma/client";

import { writeAuditLog } from "../../lib/audit-log";
import { parseIsoDate, todayIso, toIsoDate } from "../../lib/business-date";
import { loadCompanyProfile } from "../../lib/company-profile";
import { round2 } from "../../lib/pricing";
import { prisma } from "../../lib/prisma";
import { buildCostReport } from "../../lib/project-costs";
import { signedPriceDriftLines } from "../boq/boq-review.service";
import { contractCurrentTotals, findBaselineVersion } from "../contracts/change-orders.service";
import type {
  ProjectCommitmentInputParsed,
  ProjectCostInputParsed,
  VoResolutionParsed,
} from "./projectCosts.schemas";

/**
 * ต้นทุนที่จ่ายจริงของโครงการ + ยอดผูกพัน (สั่งแล้วยังไม่จ่าย) + งบเทียบใช้จริง
 *
 * ตัวเลขกำไรเห็นเฉพาะ OWNER (อัตรากำไรเป็นเรื่องของเจ้าของ แบบเดียวกับ % กำไรในหน้าตั้งค่า)
 * ADMIN บันทึกบิลและเห็นงบรายหมวดได้ เพราะต้องใช้คุมงาน
 *
 * ค่าใช้จ่ายที่ดันหมวดเกินงบ (นับรวมยอดผูกพัน) ต้องระบุสาเหตุ — ตรวจที่เซิร์ฟเวอร์ทุกครั้ง
 * สาเหตุ "ลูกค้าขอเปลี่ยน" ค้างป้ายรอออก VO จนกว่าจะผูกใบงานเพิ่ม-ลด หรือเจ้าของตัดสินใจไม่เก็บเงิน
 */

export class ProjectCostError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "ProjectCostError";
    this.status = status;
    this.code = code;
  }
}

type Actor = { id: string; role: string };

const OVERHEAD_LABEL = "ค่าดำเนินการ/ทั่วไป";
/** ใบงานเพิ่ม-ลดสถานะนี้เก็บเงินลูกค้าไม่ได้แล้ว — ผูกไว้ก็ยังถือว่ารอออก VO */
const DEAD_CHANGE_ORDER: readonly ChangeOrderStatus[] = ["REJECTED", "CANCELLED"];

const baht = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function getProjectOrThrow(projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!project) throw new ProjectCostError("ไม่พบโครงการที่ระบุ", 404);
  return project;
}

/**
 * งบมาจากเวอร์ชันไหน + รายรับก่อน VAT
 *
 * มีสัญญาที่ลงนาม → เวอร์ชันตามสัญญา (หรือตามใบงานเพิ่ม-ลดล่าสุดที่อนุมัติ) และรายรับตามมูลค่าปัจจุบันของสัญญา
 * ยังไม่มี → เวอร์ชันล่าสุด (บอกหน้าจอว่าเป็นงบชั่วคราว) · หาเวอร์ชันตามสัญญาไม่เจอก็ถอยไปใช้ล่าสุดพร้อมบอก
 */
export async function budgetBasis(projectId: string): Promise<{
  version: ProjectVersion | null;
  kind: "contract" | "latest";
  contractNo: string | null;
  contract: { id: string; contractNo: string; signedAt: Date | null; amount: unknown; vatAmount: unknown } | null;
  revenue: number | null;
}> {
  const latest = await prisma.projectVersion.findFirst({ where: { projectId }, orderBy: { versionNo: "desc" } });
  const contract = await prisma.contract.findFirst({
    where: { projectId, signedAt: { not: null } },
    orderBy: { signedAt: "desc" },
  });
  if (contract) {
    const current = await contractCurrentTotals(contract);
    const revenue = current.amount != null && current.vat != null ? round2(current.amount - current.vat) : null;
    const version = await findBaselineVersion(contract);
    if (version) return { version, kind: "contract", contractNo: contract.contractNo, contract, revenue };
    return { version: latest, kind: "latest", contractNo: contract.contractNo, contract, revenue };
  }
  return {
    version: latest,
    kind: "latest",
    contractNo: null,
    contract: null,
    revenue: latest ? round2(Number(latest.netPrice) - Number(latest.vatAmt)) : null,
  };
}

/** หมวดบนสุดของทุกหมวด — เดินขึ้นตามพ่อแม่ (ต้นไม้ลึกไม่เกินสามชั้น) */
export function rootResolver(categories: { id: string; parentId: string | null }[]) {
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  return (id: string): string => {
    let current = id;
    for (let guard = 0; guard < 10; guard += 1) {
      const parent = parentOf.get(current);
      if (!parent) return current;
      current = parent;
    }
    return current;
  };
}

const changeOrderSelect = { select: { id: true, docNo: true, title: true, status: true } } as const;

function loadCosts(projectId: string) {
  return prisma.projectCost.findMany({
    where: { projectId },
    orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
    include: {
      category: { select: { code: true, name: true } },
      recordedBy: { select: { fullName: true } },
      commitment: { select: { description: true, vendor: true } },
      changeOrder: changeOrderSelect,
    },
  });
}

function loadCommitments(projectId: string) {
  return prisma.projectCommitment.findMany({
    where: { projectId },
    orderBy: [{ committedOn: "desc" }, { createdAt: "desc" }],
    include: {
      category: { select: { code: true, name: true } },
      recordedBy: { select: { fullName: true } },
      changeOrder: changeOrderSelect,
    },
  });
}

type CostRow = Awaited<ReturnType<typeof loadCosts>>[number];
type CommitmentRow = Awaited<ReturnType<typeof loadCommitments>>[number];

interface OverrunFields {
  overrunReason: CostOverrunReason | null;
  overrunNote: string | null;
  voWaived: boolean;
  changeOrder: LinkedChangeOrderDto | null;
}

function voPendingOf(row: OverrunFields): boolean {
  if (row.overrunReason !== "CUSTOMER_CHANGE" || row.voWaived) return false;
  return row.changeOrder == null || DEAD_CHANGE_ORDER.includes(row.changeOrder.status);
}

function toOverrunDto(row: OverrunFields): CostOverrunDto | null {
  if (!row.overrunReason) return null;
  return {
    reason: row.overrunReason,
    note: row.overrunNote,
    changeOrder: row.changeOrder,
    voWaived: row.voWaived,
    voPending: voPendingOf(row),
  };
}

const toExposureCost = (c: CostRow): ExposureCost => ({
  id: c.id,
  categoryId: c.categoryId,
  amount: Number(c.amount),
  vatAmount: Number(c.vatAmount),
  commitmentId: c.commitmentId,
});

const toExposureCommitment = (c: CommitmentRow): ExposureCommitment => ({
  id: c.id,
  categoryId: c.categoryId,
  amount: Number(c.amount),
  vatAmount: Number(c.vatAmount),
  status: c.status,
});

function toCostDto(row: CostRow): ProjectCostDto {
  return {
    id: row.id,
    spentOn: toIsoDate(row.spentOn)!,
    categoryId: row.categoryId,
    categoryCode: row.category?.code ?? null,
    categoryName: row.category?.name ?? null,
    costType: row.costType,
    description: row.description,
    vendor: row.vendor,
    reference: row.reference,
    amount: String(row.amount),
    vatAmount: String(row.vatAmount),
    note: row.note,
    commitmentId: row.commitmentId,
    commitmentLabel: row.commitment
      ? [row.commitment.description, row.commitment.vendor].filter(Boolean).join(" · ")
      : null,
    overrun: toOverrunDto(row),
    recordedById: row.recordedById,
    recordedByName: row.recordedBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toCommitmentDto(row: CommitmentRow, costs: ExposureCost[], vatClaimable: boolean): ProjectCommitmentDto {
  const exposure = toExposureCommitment(row);
  return {
    id: row.id,
    committedOn: toIsoDate(row.committedOn)!,
    categoryId: row.categoryId,
    categoryCode: row.category?.code ?? null,
    categoryName: row.category?.name ?? null,
    costType: row.costType,
    description: row.description,
    vendor: row.vendor,
    reference: row.reference,
    amount: String(row.amount),
    vatAmount: String(row.vatAmount),
    status: row.status,
    closedAt: row.closedAt?.toISOString() ?? null,
    paid: commitmentPaid(exposure, costs, vatClaimable),
    remaining: commitmentRemaining(exposure, costs, vatClaimable),
    billCount: costs.filter((c) => c.commitmentId === row.id).length,
    overrun: toOverrunDto(row),
    note: row.note,
    recordedById: row.recordedById,
    recordedByName: row.recordedBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** โหลดทุกอย่างที่รายงานใช้ — ทั้งหน้าจอและการตรวจเกินงบตอนบันทึกใช้ชุดเดียวกัน ตัวเลขจึงตรงกัน */
async function loadContext(projectId: string) {
  const project = await getProjectOrThrow(projectId);
  const [basis, categories, costs, commitments, changeOrders, company] = await Promise.all([
    budgetBasis(projectId),
    prisma.workCategory.findMany({ select: { id: true, parentId: true, code: true, name: true, sortOrder: true, active: true } }),
    loadCosts(projectId),
    loadCommitments(projectId),
    prisma.changeOrder.findMany({
      where: { projectId, status: { notIn: [...DEAD_CHANGE_ORDER] } },
      orderBy: [{ contractId: "asc" }, { seq: "asc" }],
      select: { id: true, docNo: true, title: true, status: true },
    }),
    loadCompanyProfile(),
  ]);
  const rootOf = rootResolver(categories);
  const roots = categories.filter((c) => c.parentId == null);
  const vatClaimable = company.vatRegistered;

  const items = basis.version
    ? await prisma.boqItem.findMany({
        where: { projectVersionId: basis.version.id },
        select: { categoryId: true, materialTotal: true, laborTotal: true },
      })
    : [];

  const version = basis.version;
  // ค่าดำเนินการ = ส่วนของก้อน "ค่าดำเนินการ+กำไร" ตามสัดส่วนที่แยกไว้ · ยังไม่แยก = ไม่มีงบให้เทียบ (ไม่เดา)
  const overheadBudget =
    version?.overheadPct != null && Number(version.overheadProfitPct) > 0
      ? round2((Number(version.overheadProfitAmt) * Number(version.overheadPct)) / Number(version.overheadProfitPct))
      : null;

  const exposureCosts = costs.map(toExposureCost);
  const exposureCommitments = commitments.map(toExposureCommitment);

  const report = buildCostReport({
    lines: items.map((i) => ({
      rootCategoryId: rootOf(i.categoryId),
      materialTotal: Number(i.materialTotal),
      laborTotal: Number(i.laborTotal),
    })),
    roots: roots.map((r) => ({ id: r.id, code: r.code, name: r.name, sortOrder: r.sortOrder })),
    overheadBudget,
    contingency: version ? Number(version.contingencyAmt) : 0,
    costs: costs.map((c) => ({
      categoryId: c.categoryId,
      costType: c.costType,
      amount: Number(c.amount),
      vatAmount: Number(c.vatAmount),
    })),
    commitments: exposureCommitments.map((c) => ({
      categoryId: c.categoryId,
      remaining: commitmentRemaining(c, exposureCosts, vatClaimable),
    })),
    vatClaimable,
    revenue: basis.revenue,
    completed: project.status === "COMPLETED",
  });

  return {
    project,
    basis,
    version,
    rootOf,
    overheadBudget,
    roots,
    costs,
    commitments,
    changeOrders,
    vatClaimable,
    exposureCosts,
    exposureCommitments,
    report,
  };
}

type Context = Awaited<ReturnType<typeof loadContext>>;

export async function getCostReport(projectId: string, actor: Actor): Promise<ProjectCostReportDto> {
  const ctx = await loadContext(projectId);
  const { version, basis, report, vatClaimable } = ctx;

  const costDtos = ctx.costs.map(toCostDto);
  const commitmentDtos = ctx.commitments
    .map((c) => toCommitmentDto(c, ctx.exposureCosts, vatClaimable))
    // ที่ยังเปิดอยู่ (ยังต้องจ่าย) ขึ้นก่อน
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "OPEN" ? -1 : 1));

  let pendingCount = 0;
  let pendingAmount = 0;
  for (const c of costDtos) {
    if (!c.overrun?.voPending) continue;
    pendingCount += 1;
    pendingAmount += costValue({ amount: Number(c.amount), vatAmount: Number(c.vatAmount) }, vatClaimable);
  }
  for (const c of commitmentDtos) {
    if (!c.overrun?.voPending) continue;
    pendingCount += 1;
    pendingAmount += costValue({ amount: Number(c.amount), vatAmount: Number(c.vatAmount) }, vatClaimable);
  }

  return {
    budgetSource: version ? { versionNo: version.versionNo, kind: basis.kind, contractNo: basis.contractNo } : null,
    rows: report.rows,
    totals: report.totals,
    overheadBudgetKnown: ctx.overheadBudget != null,
    unbudgetedActual: report.unbudgetedActual,
    // กำไรเป็นเรื่องของเจ้าของ — ADMIN ได้ null ตั้งแต่เซิร์ฟเวอร์ ไม่ใช่แค่ซ่อนบนหน้าจอ
    profit: actor.role === "OWNER" ? report.profit : null,
    vatClaimable,
    costs: costDtos,
    commitments: commitmentDtos,
    voPending: { count: pendingCount, amount: round2(pendingAmount) },
    changeOrders: ctx.changeOrders,
    categories: ctx.roots
      .filter((r) => r.active)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({ id: r.id, code: r.code, name: r.name })),
    priceDrift: await computePriceDrift(ctx),
    cash: await computeCash(ctx),
  };
}

// ---------- ราคาในคลังเปลี่ยนหลังเซ็นสัญญา ----------

/**
 * บรรทัดของ BOQ ตามสัญญาที่ราคาในคลังเปลี่ยนหลังเซ็น — ส่วนต่าง = จำนวนทั้งบรรทัด × ส่วนต่างต่อหน่วย
 * ระบบไม่รู้ว่าของในบรรทัดนั้นซื้อไปแล้วเท่าไร (บิลลงระดับหมวด) จึงให้คนกด "ซื้อแล้ว/ล็อกราคาแล้ว" เอง
 * ไม่เดาหักให้ · หน้าจอบอกว่าหมวดนั้นจ่ายไปแล้วกี่ % ช่วยตัดสินใจ
 */
async function computePriceDrift(ctx: Context): Promise<SignedPriceDriftDto | null> {
  const contract = ctx.basis.contract;
  if (ctx.basis.kind !== "contract" || !ctx.version || !contract?.signedAt) return null;
  const raw = await signedPriceDriftLines(ctx.version.id, contract.signedAt);
  const acks = raw.length
    ? await prisma.priceDriftAck.findMany({
        where: { projectId: ctx.project.id, boqItemId: { in: raw.map((r) => r.item.id) } },
      })
    : [];
  const ackOf = new Map(acks.map((a) => [a.boqItemId, a]));

  let increase = 0;
  let decrease = 0;
  const lines = raw.map(({ item, price }) => {
    const quantity = Number(item.quantity);
    const delta = round2(
      quantity * (price.materialUnitPrice - Number(item.materialUnitPrice)) +
        quantity * (price.laborUnitPrice - Number(item.laborUnitPrice)),
    );
    const ack = ackOf.get(item.id);
    // กดไว้ที่ราคาคลังเท่านี้พอดี — ราคาคลังขยับอีกรอบ = เตือนใหม่
    const acked =
      ack != null &&
      round2(Number(ack.materialUnitPrice)) === round2(price.materialUnitPrice) &&
      round2(Number(ack.laborUnitPrice)) === round2(price.laborUnitPrice);
    if (!acked) {
      if (delta > 0) increase += delta;
      else decrease -= delta;
    }
    const rootId = ctx.rootOf(item.categoryId);
    const root = ctx.roots.find((r) => r.id === rootId);
    return {
      itemId: item.id,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity.toString(),
      categoryId: rootId,
      categoryCode: root?.code ?? null,
      categoryName: root?.name ?? "",
      from: { materialUnitPrice: Number(item.materialUnitPrice), laborUnitPrice: Number(item.laborUnitPrice) },
      to: { materialUnitPrice: round2(price.materialUnitPrice), laborUnitPrice: round2(price.laborUnitPrice) },
      delta,
      components: price.componentChanges,
      changedAt: price.changedAt!.toISOString(),
      acked,
    };
  });
  // แพงขึ้นมากสุดขึ้นก่อน — เรื่องที่ควรรีบซื้อ/ล็อกราคา · ที่กดไว้แล้วไปท้าย
  lines.sort((a, b) => Number(a.acked) - Number(b.acked) || b.delta - a.delta);
  return {
    contractNo: contract.contractNo,
    signedAt: contract.signedAt.toISOString(),
    lines,
    increase: round2(increase),
    decrease: round2(decrease),
  };
}

/** กด "ซื้อแล้ว/ล็อกราคาแล้ว" — เก็บราคาคลัง ณ ตอนนี้ (ราคาคลังเปลี่ยนอีกรอบ = เตือนใหม่) */
export async function ackPriceDrift(projectId: string, itemId: string, actor: Actor) {
  const ctx = await loadContext(projectId);
  const line = (await computePriceDrift(ctx))?.lines.find((l) => l.itemId === itemId);
  if (!line) throw new ProjectCostError("บรรทัดนี้ไม่มีราคาเปลี่ยนแล้ว — โหลดหน้าใหม่", 404);
  const data = {
    materialUnitPrice: line.to.materialUnitPrice,
    laborUnitPrice: line.to.laborUnitPrice,
    ackedById: actor.id,
  };
  await prisma.priceDriftAck.upsert({
    where: { projectId_boqItemId: { projectId, boqItemId: itemId } },
    create: { projectId, boqItemId: itemId, ...data },
    update: { ...data, createdAt: new Date() },
  });
  await writeAuditLog({
    userId: actor.id,
    action: "ACK_PRICE_DRIFT",
    entityType: "Project",
    entityId: projectId,
    details: { boqItemId: itemId, name: line.name, from: line.from, to: line.to, delta: line.delta },
  });
  return getCostReport(projectId, actor);
}

export async function unackPriceDrift(projectId: string, itemId: string, actor: Actor) {
  await getProjectOrThrow(projectId);
  const removed = await prisma.priceDriftAck.deleteMany({ where: { projectId, boqItemId: itemId } });
  if (removed.count > 0) {
    await writeAuditLog({
      userId: actor.id,
      action: "UNACK_PRICE_DRIFT",
      entityType: "Project",
      entityId: projectId,
      details: { boqItemId: itemId },
    });
  }
  return getCostReport(projectId, actor);
}

// ---------- เงินสดของโครงการ ----------

/**
 * เงินจริงที่เข้า-ออก (รวม VAT) — ไม่ใช่กำไร: ติดลบ = บริษัทออกเงินแทนลูกค้าอยู่ ควรเร่งเก็บงวดถัดไป
 * เงินเข้า = ยอดงวด − ภาษีหัก ณ ที่จ่าย − เงินประกันที่ถูกกัน (ตามที่เข้าบัญชีจริง) + เงินประกันที่ได้คืน
 */
async function computeCash(ctx: Context): Promise<ProjectCashDto> {
  const projectId = ctx.project.id;
  const contract = ctx.basis.contract;
  const [payments, releases, installments] = await Promise.all([
    prisma.installmentPayment.findMany({
      where: { installment: { contract: { projectId } } },
      select: { amount: true, withholdingAmount: true, retentionAmount: true },
    }),
    prisma.retentionRelease.findMany({
      where: { contract: { projectId } },
      select: { amount: true, withholdingAmount: true },
    }),
    contract?.signedAt
      ? prisma.contractInstallment.findMany({
          where: { contractId: contract.id },
          orderBy: { seq: "asc" },
          include: { payments: { select: { amount: true } } },
        })
      : Promise.resolve([]),
  ]);
  const sum = <T>(rows: T[], pick: (row: T) => number) => round2(rows.reduce((s, row) => s + pick(row), 0));
  const receivedDetail = {
    installments: sum(payments, (p) => Number(p.amount)),
    withholding: sum(payments, (p) => Number(p.withholdingAmount)),
    retention: sum(payments, (p) => Number(p.retentionAmount)),
    retentionReturned: sum(releases, (r) => Number(r.amount) - Number(r.withholdingAmount)),
  };
  const received = round2(
    receivedDetail.installments - receivedDetail.withholding - receivedDetail.retention + receivedDetail.retentionReturned,
  );
  const paidOutDetail = {
    beforeVat: sum(ctx.costs, (c) => Number(c.amount)),
    vat: sum(ctx.costs, (c) => Number(c.vatAmount)),
  };
  const paidOut = round2(paidOutDetail.beforeVat + paidOutDetail.vat);
  // ยอดที่สั่งไว้ตามเงินที่จะจ่ายจริง (รวม VAT) ไม่ใช่ตามต้นทุน
  const committedOut = round2(
    ctx.exposureCommitments.reduce((s, c) => s + commitmentRemaining(c, ctx.exposureCosts, false), 0),
  );
  const net = round2(received - paidOut);

  let nextInstallment: ProjectCashDto["nextInstallment"] = null;
  for (const inst of installments) {
    const outstanding = round2(Number(inst.amount) - inst.payments.reduce((s, p) => s + Number(p.amount), 0));
    if (outstanding > 0) {
      nextInstallment = { seq: inst.seq, milestone: inst.milestone, dueOn: toIsoDate(inst.dueOn), outstanding };
      break;
    }
  }
  return {
    received,
    receivedDetail,
    paidOut,
    paidOutDetail,
    net,
    committedOut,
    projected: round2(net - committedOut),
    nextInstallment,
    contractSigned: Boolean(contract?.signedAt),
  };
}

/** สัญญาณเรื่องเงินของโครงการหนึ่ง (หน้างานที่รอดำเนินการ) — ใช้สูตรชุดเดียวกับแท็บต้นทุนจริง */
export async function projectMoneySignals(projectId: string) {
  const ctx = await loadContext(projectId);
  const [priceDrift, cash] = await Promise.all([computePriceDrift(ctx), computeCash(ctx)]);
  return { priceDrift, cash };
}

function categoryLabel(ctx: Context, categoryId: string | null): string {
  if (categoryId == null) return OVERHEAD_LABEL;
  const root = ctx.roots.find((r) => r.id === categoryId);
  return root ? `${root.code ? `${root.code} ` : ""}${root.name}` : "หมวดนี้";
}

/**
 * ตรวจว่ารายการนี้ดันหมวดเกินงบหรือไม่ → ต้องมีสาเหตุ · ไม่เกิน = ล้างสาเหตุทิ้ง (ไม่เก็บป้ายที่ไม่จริง)
 *
 * changeOrderId ผูกได้เฉพาะสาเหตุลูกค้าขอเปลี่ยน และต้องเป็นใบของโครงการนี้ที่ยังเก็บเงินได้
 * voWaived (เจ้าของไม่เก็บเงิน) คงของเดิมไว้ถ้าสาเหตุยังเป็นลูกค้าขอเปลี่ยน — เปลี่ยนผ่านปุ่มของมันเท่านั้น
 */
async function resolveOverrun(
  ctx: Context,
  change: ExposureChange,
  input: { overrunReason?: CostOverrunReason | null; overrunNote?: string | null; changeOrderId?: string | null },
  existing: { voWaived: boolean; changeOrderId: string | null } | null,
  noun: string,
) {
  const budget = budgetForKey(ctx.report.rows, change.value.categoryId);
  const over = overrunAmount({
    budget,
    costs: ctx.exposureCosts,
    commitments: ctx.exposureCommitments,
    vatClaimable: ctx.vatClaimable,
    change,
  });
  if (over <= 0) return { overrunReason: null, overrunNote: null, changeOrderId: null, voWaived: false };

  const reason = input.overrunReason ?? null;
  if (!reason) {
    throw new ProjectCostError(
      `${noun}นี้ทำให้${categoryLabel(ctx, change.value.categoryId)}เกินงบ ${baht(over)} บาท — เลือกสาเหตุก่อนบันทึก`,
      400,
      "OVERRUN_REASON_REQUIRED",
    );
  }
  const note = input.overrunNote?.trim() || null;
  if (reason === "OTHER" && !note) throw new ProjectCostError("สาเหตุ \"อื่น ๆ\" ต้องพิมพ์รายละเอียดด้วย");

  let changeOrderId: string | null = null;
  if (reason === "CUSTOMER_CHANGE" && input.changeOrderId) {
    // ใบที่ผูกไว้เดิมแล้วภายหลังถูกปฏิเสธ/ยกเลิก: คงไว้ได้ (หน้าจอขึ้นรอออก VO ให้อยู่แล้ว) — ห้ามผูกใบตายใหม่
    const live = ctx.changeOrders.some((c) => c.id === input.changeOrderId);
    if (!live && input.changeOrderId !== existing?.changeOrderId) {
      throw new ProjectCostError("ไม่พบใบงานเพิ่ม-ลดที่เลือก (หรือใบนั้นถูกปฏิเสธ/ยกเลิกแล้ว)", 404);
    }
    changeOrderId = input.changeOrderId;
  }
  return {
    overrunReason: reason,
    overrunNote: note,
    changeOrderId,
    voWaived: reason === "CUSTOMER_CHANGE" ? (existing?.voWaived ?? false) : false,
  };
}

async function validateMoney(input: {
  date: string;
  categoryId: string | null;
  amount: number;
  vatAmount: number;
}) {
  const date = parseIsoDate(input.date);
  if (!date) throw new ProjectCostError("รูปแบบวันที่ไม่ถูกต้อง");
  // กันพิมพ์ปีผิด — บิล/ยอดที่สั่งลงวันในอนาคตไม่ได้
  if (input.date > todayIso()) throw new ProjectCostError("วันที่เป็นวันในอนาคตไม่ได้");
  if (input.vatAmount > input.amount) throw new ProjectCostError("ภาษีซื้อมากกว่ายอดก่อน VAT ไม่ได้ — ตรวจว่ากรอกสลับช่องหรือไม่");
  if (input.categoryId) {
    const category = await prisma.workCategory.findUnique({ where: { id: input.categoryId }, select: { parentId: true } });
    if (!category) throw new ProjectCostError("ไม่พบหมวดงานที่เลือก", 404);
    // เทียบงบได้ระดับหมวดบนสุดเท่านั้น — รับหมวดย่อยแล้วหน้าจอรวมผิดแถว
    if (category.parentId != null) throw new ProjectCostError("เลือกได้เฉพาะหมวดงานหลัก (A, B, C …)");
  }
  return date;
}

/** บิลที่จ่ายตามยอดผูกพัน: ต้องเป็นของโครงการนี้ หมวดเดียวกัน และยังเปิดอยู่ (ยกเว้นบิลเดิมที่ผูกไว้ก่อนปิดยอด) */
function checkCommitmentLink(ctx: Context, input: ProjectCostInputParsed, currentLink: string | null) {
  const id = input.commitmentId ?? null;
  if (!id) return null;
  const commitment = ctx.commitments.find((c) => c.id === id);
  if (!commitment) throw new ProjectCostError("ไม่พบยอดผูกพันที่เลือก", 404);
  if (commitment.categoryId !== input.categoryId) {
    throw new ProjectCostError("บิลที่จ่ายตามยอดผูกพันต้องอยู่หมวดเดียวกับยอดผูกพัน");
  }
  if (commitment.status === "CLOSED" && currentLink !== id) {
    throw new ProjectCostError("ยอดผูกพันนี้ปิดยอดแล้ว — เปิดยอดใหม่ก่อน หรือบันทึกเป็นบิลที่ไม่ได้สั่งไว้");
  }
  return id;
}

type ExistingRow = { id: string; voWaived: boolean; changeOrderId: string | null };

async function buildCostData(
  ctx: Context,
  input: ProjectCostInputParsed,
  existing: (ExistingRow & { commitmentId: string | null }) | null,
) {
  const spentOn = await validateMoney({
    date: input.spentOn,
    categoryId: input.categoryId,
    amount: input.amount,
    vatAmount: input.vatAmount,
  });
  const commitmentId = checkCommitmentLink(ctx, input, existing?.commitmentId ?? null);
  const overrun = await resolveOverrun(
    ctx,
    {
      kind: "cost",
      value: {
        id: existing?.id ?? "__new__",
        categoryId: input.categoryId,
        amount: input.amount,
        vatAmount: input.vatAmount,
        commitmentId,
      },
    },
    input,
    existing,
    "บิล",
  );
  return {
    spentOn,
    categoryId: input.categoryId,
    costType: input.costType,
    description: input.description.trim(),
    vendor: input.vendor?.trim() || null,
    reference: input.reference?.trim() || null,
    amount: input.amount,
    vatAmount: input.vatAmount,
    note: input.note?.trim() || null,
    commitmentId,
    ...overrun,
  };
}

export async function createCost(projectId: string, input: ProjectCostInputParsed, actor: Actor) {
  const ctx = await loadContext(projectId);
  const data = await buildCostData(ctx, input, null);
  const created = await prisma.projectCost.create({ data: { ...data, projectId, recordedById: actor.id } });
  await writeAuditLog({
    userId: actor.id,
    action: "RECORD_PROJECT_COST",
    entityType: "Project",
    entityId: projectId,
    details: {
      costId: created.id,
      spentOn: input.spentOn,
      amount: input.amount,
      vatAmount: input.vatAmount,
      costType: input.costType,
      commitmentId: data.commitmentId,
      overrunReason: data.overrunReason,
    },
  });
  return getCostReport(projectId, actor);
}

/** แก้/ลบได้เฉพาะคนที่บันทึกเอง หรือเจ้าของกิจการ — แพตเทิร์นเดียวกับรายการรับเงิน */
function assertCanModify(recordedById: string | null, actor: Actor) {
  if (actor.role !== "OWNER" && recordedById !== actor.id) {
    throw new ProjectCostError("แก้ไขได้เฉพาะรายการที่ตัวเองบันทึกไว้ (หรือให้เจ้าของกิจการแก้ให้)", 403);
  }
}

async function getCostOrThrow(projectId: string, costId: string) {
  const cost = await prisma.projectCost.findUnique({ where: { id: costId } });
  if (cost?.projectId !== projectId) throw new ProjectCostError("ไม่พบรายการต้นทุนที่ระบุ", 404);
  return cost;
}

export async function updateCost(projectId: string, costId: string, input: ProjectCostInputParsed, actor: Actor) {
  const cost = await getCostOrThrow(projectId, costId);
  assertCanModify(cost.recordedById, actor);
  const ctx = await loadContext(projectId);
  const data = await buildCostData(ctx, input, cost);
  await prisma.projectCost.update({ where: { id: costId }, data });
  await writeAuditLog({
    userId: actor.id,
    action: "UPDATE_PROJECT_COST",
    entityType: "Project",
    entityId: projectId,
    details: {
      costId,
      // ยอดเดิมต้องอยู่ในบันทึก ไม่งั้นแก้ตัวเลขเงินย้อนหลังแล้วไม่เหลือร่องรอย
      from: { spentOn: toIsoDate(cost.spentOn), amount: Number(cost.amount), vatAmount: Number(cost.vatAmount) },
      to: { spentOn: input.spentOn, amount: input.amount, vatAmount: input.vatAmount },
      overrunReason: data.overrunReason,
    },
  });
  return getCostReport(projectId, actor);
}

export async function deleteCost(projectId: string, costId: string, actor: Actor) {
  const cost = await getCostOrThrow(projectId, costId);
  assertCanModify(cost.recordedById, actor);
  await prisma.projectCost.delete({ where: { id: costId } });
  await writeAuditLog({
    userId: actor.id,
    action: "DELETE_PROJECT_COST",
    entityType: "Project",
    entityId: projectId,
    details: {
      costId,
      spentOn: toIsoDate(cost.spentOn),
      description: cost.description,
      amount: Number(cost.amount),
      vatAmount: Number(cost.vatAmount),
    },
  });
  return getCostReport(projectId, actor);
}

// ---------- ยอดผูกพัน ----------

async function getCommitmentOrThrow(projectId: string, commitmentId: string) {
  const commitment = await prisma.projectCommitment.findUnique({
    where: { id: commitmentId },
    include: { _count: { select: { costs: true } } },
  });
  if (commitment?.projectId !== projectId) throw new ProjectCostError("ไม่พบยอดผูกพันที่ระบุ", 404);
  return commitment;
}

async function buildCommitmentData(
  ctx: Context,
  input: ProjectCommitmentInputParsed,
  existing: (ExistingRow & { status: "OPEN" | "CLOSED" }) | null,
) {
  const committedOn = await validateMoney({
    date: input.committedOn,
    categoryId: input.categoryId,
    amount: input.amount,
    vatAmount: input.vatAmount,
  });
  const overrun = await resolveOverrun(
    ctx,
    {
      kind: "commitment",
      value: {
        id: existing?.id ?? "__new__",
        categoryId: input.categoryId,
        amount: input.amount,
        vatAmount: input.vatAmount,
        status: existing?.status ?? "OPEN",
      },
    },
    input,
    existing,
    "ยอดที่สั่ง",
  );
  return {
    committedOn,
    categoryId: input.categoryId,
    costType: input.costType,
    description: input.description.trim(),
    vendor: input.vendor?.trim() || null,
    reference: input.reference?.trim() || null,
    amount: input.amount,
    vatAmount: input.vatAmount,
    note: input.note?.trim() || null,
    ...overrun,
  };
}

export async function createCommitment(projectId: string, input: ProjectCommitmentInputParsed, actor: Actor) {
  const ctx = await loadContext(projectId);
  const data = await buildCommitmentData(ctx, input, null);
  const created = await prisma.projectCommitment.create({ data: { ...data, projectId, recordedById: actor.id } });
  await writeAuditLog({
    userId: actor.id,
    action: "RECORD_PROJECT_COMMITMENT",
    entityType: "Project",
    entityId: projectId,
    details: {
      commitmentId: created.id,
      committedOn: input.committedOn,
      amount: input.amount,
      vatAmount: input.vatAmount,
      overrunReason: data.overrunReason,
    },
  });
  return getCostReport(projectId, actor);
}

export async function updateCommitment(
  projectId: string,
  commitmentId: string,
  input: ProjectCommitmentInputParsed,
  actor: Actor,
) {
  const commitment = await getCommitmentOrThrow(projectId, commitmentId);
  assertCanModify(commitment.recordedById, actor);
  // บิลที่ผูกอยู่ลงหมวดเดิม — ย้ายหมวดยอดผูกพันแล้วบิลกับยอดจะอยู่คนละแถว ตัวเลขคงค้างผิด
  if (commitment._count.costs > 0 && commitment.categoryId !== input.categoryId) {
    throw new ProjectCostError(`มีบิลจ่ายตามยอดนี้แล้ว ${commitment._count.costs} ใบ — เปลี่ยนหมวดไม่ได้`, 409);
  }
  const ctx = await loadContext(projectId);
  const data = await buildCommitmentData(ctx, input, commitment);
  await prisma.projectCommitment.update({ where: { id: commitmentId }, data });
  await writeAuditLog({
    userId: actor.id,
    action: "UPDATE_PROJECT_COMMITMENT",
    entityType: "Project",
    entityId: projectId,
    details: {
      commitmentId,
      from: { committedOn: toIsoDate(commitment.committedOn), amount: Number(commitment.amount), vatAmount: Number(commitment.vatAmount) },
      to: { committedOn: input.committedOn, amount: input.amount, vatAmount: input.vatAmount },
      overrunReason: data.overrunReason,
    },
  });
  return getCostReport(projectId, actor);
}

/** ปิดยอด = ไม่มีบิลตามมาอีกแล้ว (เช่น ร้านส่งของไม่ครบ ตกลงจบแค่นี้) ส่วนที่ยังไม่จ่ายเลิกนับ · เปิดใหม่ได้ */
export async function setCommitmentStatus(
  projectId: string,
  commitmentId: string,
  status: "OPEN" | "CLOSED",
  actor: Actor,
) {
  const commitment = await getCommitmentOrThrow(projectId, commitmentId);
  assertCanModify(commitment.recordedById, actor);
  if (commitment.status !== status) {
    await prisma.projectCommitment.update({
      where: { id: commitmentId },
      data: { status, closedAt: status === "CLOSED" ? new Date() : null },
    });
    await writeAuditLog({
      userId: actor.id,
      action: status === "CLOSED" ? "CLOSE_PROJECT_COMMITMENT" : "REOPEN_PROJECT_COMMITMENT",
      entityType: "Project",
      entityId: projectId,
      details: { commitmentId, amount: Number(commitment.amount) },
    });
  }
  return getCostReport(projectId, actor);
}

export async function deleteCommitment(projectId: string, commitmentId: string, actor: Actor) {
  const commitment = await getCommitmentOrThrow(projectId, commitmentId);
  assertCanModify(commitment.recordedById, actor);
  // ลบแล้วบิลที่จ่ายตามยอดนี้จะลอยไม่มีที่มา — ให้ปิดยอดแทน
  if (commitment._count.costs > 0) {
    throw new ProjectCostError(
      `มีบิลจ่ายตามยอดนี้แล้ว ${commitment._count.costs} ใบ — ลบไม่ได้ ใช้ "ปิดยอด" แทน`,
      409,
    );
  }
  await prisma.projectCommitment.delete({ where: { id: commitmentId } });
  await writeAuditLog({
    userId: actor.id,
    action: "DELETE_PROJECT_COMMITMENT",
    entityType: "Project",
    entityId: projectId,
    details: {
      commitmentId,
      committedOn: toIsoDate(commitment.committedOn),
      description: commitment.description,
      amount: Number(commitment.amount),
    },
  });
  return getCostReport(projectId, actor);
}

// ---------- รอออก VO ----------

/**
 * ปิดป้าย "รอออก VO": ผูกใบงานเพิ่ม-ลด (พนักงานทำได้) หรือไม่เก็บเงินลูกค้า (เจ้าของเท่านั้น — เป็นการยอมเสียกำไร)
 * ใช้ได้เฉพาะรายการที่สาเหตุเป็นลูกค้าขอเปลี่ยน
 */
export async function resolveVo(
  projectId: string,
  target: { kind: "cost" | "commitment"; id: string },
  input: VoResolutionParsed,
  actor: Actor,
) {
  await getProjectOrThrow(projectId);
  const row =
    target.kind === "cost"
      ? await getCostOrThrow(projectId, target.id)
      : await getCommitmentOrThrow(projectId, target.id);
  if (row.overrunReason !== "CUSTOMER_CHANGE") {
    throw new ProjectCostError("รายการนี้ไม่ได้เกินงบเพราะลูกค้าขอเปลี่ยน");
  }
  if (input.waived !== undefined && actor.role !== "OWNER") {
    throw new ProjectCostError("การไม่เก็บเงินลูกค้า (บริษัทรับเอง) ต้องให้เจ้าของกิจการตัดสินใจ", 403);
  }
  const data: { changeOrderId?: string | null; voWaived?: boolean } = {};
  if (input.changeOrderId !== undefined) {
    if (input.changeOrderId) {
      const co = await prisma.changeOrder.findFirst({
        where: { id: input.changeOrderId, projectId, status: { notIn: [...DEAD_CHANGE_ORDER] } },
        select: { id: true },
      });
      if (!co) throw new ProjectCostError("ไม่พบใบงานเพิ่ม-ลดที่เลือก (หรือใบนั้นถูกปฏิเสธ/ยกเลิกแล้ว)", 404);
    }
    data.changeOrderId = input.changeOrderId;
  }
  if (input.waived !== undefined) data.voWaived = input.waived;

  if (target.kind === "cost") await prisma.projectCost.update({ where: { id: target.id }, data });
  else await prisma.projectCommitment.update({ where: { id: target.id }, data });
  await writeAuditLog({
    userId: actor.id,
    action: "RESOLVE_COST_VO",
    entityType: "Project",
    entityId: projectId,
    details: { [target.kind === "cost" ? "costId" : "commitmentId"]: target.id, ...data },
  });
  return getCostReport(projectId, actor);
}
