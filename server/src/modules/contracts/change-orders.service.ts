import type { ChangeOrder, Prisma, ProjectVersion } from "@prisma/client";
import type {
  ChangeOrderDto,
  ChangeOrderInstallmentChangeDto,
  ChangeOrderLineDto,
  ChangeOrderPreviewDto,
  ContractChangeOrdersDto,
  CustomerChangeOrderDto,
} from "@systemboq/shared-types";

import { writeAuditLog } from "../../lib/audit-log";
import { billingPartyOf } from "../../lib/billing-party";
import {
  buildChangeOrderLines,
  changeOrderTotals,
  planInstallments,
  type ChangeOrderSourceLine,
} from "../../lib/change-order";
import { loadCompanyProfile } from "../../lib/company-profile";
import { nextDocumentSequence } from "../../lib/document-sequence";
import { createNotification, notifyStaff } from "../../lib/notifications";
import { renderChangeOrderPdf } from "../../lib/pdf/change-order-pdf";
import { customerLineMultiplier, round2 } from "../../lib/pricing";
import { prisma } from "../../lib/prisma";
import { compareVersions } from "../boq/boq-review.service";
import type { ChangeOrderInput, DecisionInput } from "./change-orders.schemas";

/**
 * ใบงานเพิ่ม-ลด (Variation Order) — ดูคอมเมนต์ที่ model ChangeOrder
 *
 * ขั้นตอน: พนักงานแก้ BOQ ตามปกติ (หลังสัญญาลงนาม ระบบแตกเวอร์ชันใหม่ให้เอง) → ออกใบ (ร่าง)
 * ระบบเทียบเวอร์ชันตั้งต้นกับเวอร์ชันล่าสุดให้ → ส่งให้ลูกค้า → ลูกค้ากดอนุมัติในพอร์ทัล หรือเซ็นกระดาษ
 * แล้วพนักงานบันทึกผล → อนุมัติแล้วมูลค่าสัญญาและงวดเงินขยับตาม
 */

export class ChangeOrderError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ChangeOrderError";
    this.status = status;
  }
}

const OPEN = ["DRAFT", "SENT"] as const;
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n: number) => n.toFixed(2);

type ContractRow = Prisma.ContractGetPayload<{
  include: { project: { include: { customer: { include: { customerProfile: true } } } } };
}>;

async function loadContract(projectId: string, contractId: string): Promise<ContractRow> {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, projectId, project: { deletedAt: null } },
    include: { project: { include: { customer: { include: { customerProfile: true } } } } },
  });
  if (!contract) throw new ChangeOrderError("ไม่พบสัญญาที่ระบุ", 404);
  return contract;
}

/** มูลค่าปัจจุบันของสัญญา = ที่ลงนาม + ใบงานเพิ่ม-ลดที่อนุมัติแล้ว (ยอดรวม VAT และส่วน VAT) */
export async function contractCurrentTotals(
  contract: { id: string; amount: unknown; vatAmount: unknown },
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ amount: number | null; vat: number | null }> {
  if (contract.amount == null) return { amount: null, vat: null };
  const sum = await db.changeOrder.aggregate({
    where: { contractId: contract.id, status: "APPROVED" },
    _sum: { totalAmount: true, vatAmount: true },
  });
  return {
    amount: round2(Number(contract.amount) + Number(sum._sum.totalAmount ?? 0)),
    vat: contract.vatAmount == null ? null : round2(Number(contract.vatAmount) + Number(sum._sum.vatAmount ?? 0)),
  };
}

/** มูลค่าปัจจุบันของหลายสัญญาในครั้งเดียว (แดชบอร์ด/รายการ) — ใบที่อนุมัติแล้วเท่านั้น */
export async function approvedChangeTotals(contractIds: string[]): Promise<Map<string, { amount: number; vat: number }>> {
  if (contractIds.length === 0) return new Map();
  const rows = await prisma.changeOrder.groupBy({
    by: ["contractId"],
    where: { contractId: { in: contractIds }, status: "APPROVED" },
    _sum: { totalAmount: true, vatAmount: true },
  });
  return new Map(
    rows.map((r) => [r.contractId, { amount: Number(r._sum.totalAmount ?? 0), vat: Number(r._sum.vatAmount ?? 0) }]),
  );
}

/**
 * เวอร์ชัน BOQ ที่ใบถัดไปต้องเทียบ: เวอร์ชันปลายทางของใบล่าสุดที่อนุมัติ ไม่งั้นเวอร์ชันที่สัญญาใช้ตอนออก
 * (สัญญาตรึงยอดจากเวอร์ชันล่าสุด ณ ตอนนั้น — ตรวจยอดซ้ำให้แน่ใจ ไม่เดา)
 */
export async function findBaselineVersion(contract: {
  id: string;
  projectId: string;
  createdAt: Date;
  amount: unknown;
}): Promise<ProjectVersion | null> {
  const lastApproved = await prisma.changeOrder.findFirst({
    where: { contractId: contract.id, status: "APPROVED" },
    orderBy: { seq: "desc" },
    include: { toVersion: true },
  });
  if (lastApproved) return lastApproved.toVersion;
  const version = await prisma.projectVersion.findFirst({
    where: { projectId: contract.projectId, createdAt: { lte: contract.createdAt } },
    orderBy: { versionNo: "desc" },
  });
  if (!version || contract.amount == null || round2(Number(version.netPrice)) !== round2(Number(contract.amount))) {
    return null;
  }
  return version;
}

async function baselineVersion(contract: ContractRow): Promise<ProjectVersion> {
  const version = await findBaselineVersion(contract);
  if (!version) {
    throw new ChangeOrderError(
      "หาเวอร์ชัน BOQ ที่สัญญาฉบับนี้ใช้ไม่ได้ (สัญญาออกก่อนระบบตรึงยอด หรือยอดไม่ตรงกับเวอร์ชันใด) — ออกใบงานเพิ่ม-ลดจากระบบไม่ได้",
      409,
    );
  }
  return version;
}

/** ทำไมออกใบใหม่ไม่ได้ตอนนี้ (null = ได้) — บอกเป็นภาษาคนพร้อมทางไปต่อ */
async function blockerOf(contract: ContractRow): Promise<string | null> {
  if (contract.project.type === "CUSTOM") {
    return "โครงการกำหนดเองไม่มี BOQ ในระบบ — ออกใบงานเพิ่ม-ลดจากการเทียบ BOQ ไม่ได้";
  }
  if (!contract.signedAt) {
    return "สัญญายังไม่ลงนาม — แก้ BOQ แล้วออกสัญญาฉบับใหม่ได้เลย ไม่ต้องใช้ใบงานเพิ่ม-ลด";
  }
  if (contract.amount == null) {
    return "สัญญาฉบับนี้ออกก่อนระบบตรึงยอด — ออกใบงานเพิ่ม-ลดจากระบบไม่ได้";
  }
  const open = await prisma.changeOrder.findFirst({
    where: { contractId: contract.id, status: { in: [...OPEN] } },
    select: { docNo: true, status: true },
  });
  if (open) {
    return `ใบ ${open.docNo} ยัง${open.status === "DRAFT" ? "เป็นร่าง" : "รอลูกค้าตอบ"} — ปิดใบนั้นก่อน (อนุมัติ ไม่อนุมัติ หรือยกเลิก)`;
  }
  return null;
}

/** เทียบเวอร์ชันตั้งต้นกับเวอร์ชันล่าสุด → แถวและยอด (ราคาขาย) */
async function computeAgainstLatest(contract: ContractRow) {
  const from = await baselineVersion(contract);
  const to = await prisma.projectVersion.findFirstOrThrow({
    where: { projectId: contract.projectId },
    orderBy: { versionNo: "desc" },
  });
  if (to.id === from.id) {
    throw new ChangeOrderError(
      "ยังไม่มีการแก้ BOQ หลังลงนาม — ไปแก้ BOQ ที่แท็บ BOQ ก่อน (ระบบแตกเวอร์ชันใหม่ให้เอง สัญญาเดิมไม่ขยับ) แล้วค่อยกลับมาออกใบ",
      409,
    );
  }
  const diff = await compareVersions(contract.projectId, from.versionNo, to.versionNo);
  const side = (v: (typeof diff.lines)[number]["before"]) =>
    v && {
      name: v.name,
      unit: v.unit,
      quantity: Number(v.quantity),
      costUnitPrice: Number(v.materialUnitPrice) + Number(v.laborUnitPrice),
    };
  const source: ChangeOrderSourceLine[] = diff.lines.map((l) => ({
    kind: l.kind,
    categoryCode: l.categoryCode,
    before: side(l.before),
    after: side(l.after),
  }));
  const lines = buildChangeOrderLines(source, customerLineMultiplier(from), customerLineMultiplier(to));
  const totals = changeOrderTotals(
    lines,
    { netPrice: Number(from.netPrice), vatAmt: Number(from.vatAmt) },
    { netPrice: Number(to.netPrice), vatAmt: Number(to.vatAmt) },
  );
  if (lines.length === 0 && Number(totals.totalAmount) === 0) {
    throw new ChangeOrderError("BOQ ล่าสุดไม่ต่างจากที่ตกลงไว้ — ไม่มีรายการให้ออกใบ", 409);
  }
  return { from, to, lines, totals };
}

function toDto(
  co: ChangeOrder & { fromVersion: { versionNo: number }; toVersion: { versionNo: number }; createdBy: { fullName: string | null } | null },
  ctx: { latestVersionNo: number; amountBefore: number | null },
): ChangeOrderDto {
  const total = Number(co.totalAmount);
  return {
    id: co.id,
    contractId: co.contractId,
    seq: co.seq,
    docNo: co.docNo,
    status: co.status,
    title: co.title,
    note: co.note,
    extensionDays: co.extensionDays,
    fromVersionNo: co.fromVersion.versionNo,
    toVersionNo: co.toVersion.versionNo,
    lines: co.lines as unknown as ChangeOrderLineDto[],
    addAmount: fmt(Number(co.addAmount)),
    deductAmount: fmt(Number(co.deductAmount)),
    adjustAmount: fmt(Number(co.adjustAmount)),
    netBeforeVat: fmt(Number(co.netBeforeVat)),
    vatAmount: fmt(Number(co.vatAmount)),
    totalAmount: fmt(total),
    sentAt: co.sentAt?.toISOString() ?? null,
    respondedAt: co.respondedAt?.toISOString() ?? null,
    respondedVia: (co.respondedVia as "PORTAL" | "PAPER" | null) ?? null,
    responseNote: co.responseNote,
    installmentChanges: (co.installmentChanges as unknown as ChangeOrderInstallmentChangeDto[] | null) ?? null,
    createdAt: co.createdAt.toISOString(),
    createdByName: co.createdBy?.fullName ?? null,
    outdated: co.status === "DRAFT" && ctx.latestVersionNo > co.toVersion.versionNo,
    amountBefore: ctx.amountBefore == null ? null : fmt(ctx.amountBefore),
    amountAfter: ctx.amountBefore == null ? null : fmt(round2(ctx.amountBefore + total)),
  };
}

const CO_INCLUDE = {
  fromVersion: { select: { versionNo: true } },
  toVersion: { select: { versionNo: true } },
  createdBy: { select: { fullName: true } },
} as const;

/**
 * ใบทั้งหมดของสัญญา + มูลค่าก่อน/หลังของแต่ละใบ — มูลค่า "ก่อน" ของใบหนึ่ง = ตามสัญญา + ใบที่อนุมัติ
 * ก่อนหน้ามัน (ใบที่ยังไม่อนุมัติ = ถ้าอนุมัติตอนนี้)
 */
async function changeOrderDtos(contract: ContractRow): Promise<ChangeOrderDto[]> {
  const [rows, latest] = await Promise.all([
    prisma.changeOrder.findMany({ where: { contractId: contract.id }, orderBy: { seq: "asc" }, include: CO_INCLUDE }),
    prisma.projectVersion.findFirst({ where: { projectId: contract.projectId }, orderBy: { versionNo: "desc" }, select: { versionNo: true } }),
  ]);
  let running = contract.amount == null ? null : Number(contract.amount);
  const latestApprovedSeq = Math.max(0, ...rows.filter((r) => r.status === "APPROVED").map((r) => r.seq));
  return rows.map((r) => {
    // ใบที่ยังไม่ปิดเริ่มจากมูลค่าหลังใบอนุมัติล่าสุด · ใบที่ไม่อนุมัติ/ยกเลิกก็เช่นกัน (ไม่ไปบวกต่อ)
    const before = running;
    if (r.status === "APPROVED" && running != null) running = round2(running + Number(r.totalAmount));
    const dto = toDto(r, { latestVersionNo: latest?.versionNo ?? 0, amountBefore: before });
    if (r.status !== "APPROVED" && r.seq < latestApprovedSeq) dto.amountAfter = null;
    return dto;
  });
}

export async function listChangeOrders(projectId: string, contractId: string): Promise<ContractChangeOrdersDto> {
  const contract = await loadContract(projectId, contractId);
  const current = await contractCurrentTotals(contract);
  return {
    contractAmount: contract.amount == null ? null : fmt(Number(contract.amount)),
    currentAmount: current.amount == null ? null : fmt(current.amount),
    changeOrders: await changeOrderDtos(contract),
    blocker: await blockerOf(contract),
  };
}

export async function previewChangeOrder(projectId: string, contractId: string): Promise<ChangeOrderPreviewDto> {
  const contract = await loadContract(projectId, contractId);
  const blocker = await blockerOf(contract);
  if (blocker) throw new ChangeOrderError(blocker, 409);
  const { from, to, lines, totals } = await computeAgainstLatest(contract);
  const current = (await contractCurrentTotals(contract)).amount ?? 0;
  return {
    fromVersionNo: from.versionNo,
    toVersionNo: to.versionNo,
    lines,
    ...totals,
    currentAmount: fmt(current),
    newAmount: fmt(round2(current + Number(totals.totalAmount))),
  };
}

function snapshotData(c: Awaited<ReturnType<typeof computeAgainstLatest>>) {
  return {
    fromVersionId: c.from.id,
    toVersionId: c.to.id,
    lines: c.lines as unknown as Prisma.InputJsonValue,
    addAmount: c.totals.addAmount,
    deductAmount: c.totals.deductAmount,
    adjustAmount: c.totals.adjustAmount,
    netBeforeVat: c.totals.netBeforeVat,
    vatAmount: c.totals.vatAmount,
    totalAmount: c.totals.totalAmount,
  };
}

export async function createChangeOrder(projectId: string, contractId: string, input: ChangeOrderInput, actorId: string) {
  const contract = await loadContract(projectId, contractId);
  const blocker = await blockerOf(contract);
  if (blocker) throw new ChangeOrderError(blocker, 409);
  const computed = await computeAgainstLatest(contract);

  const created = await prisma.$transaction(async (tx) => {
    const last = await tx.changeOrder.aggregate({ where: { contractId }, _max: { seq: true } });
    const year = new Date().getFullYear();
    const n = await nextDocumentSequence(tx, `VO-${year}`);
    return tx.changeOrder.create({
      data: {
        contractId,
        projectId,
        seq: (last._max.seq ?? 0) + 1,
        docNo: `VO-${year}-${String(n).padStart(4, "0")}`,
        title: input.title,
        note: input.note ?? null,
        extensionDays: input.extensionDays ?? null,
        createdById: actorId,
        ...snapshotData(computed),
      },
    });
  });

  await writeAuditLog({
    userId: actorId,
    action: "CREATE_CHANGE_ORDER",
    entityType: "ChangeOrder",
    entityId: created.id,
    details: { projectId, contractNo: contract.contractNo, docNo: created.docNo, totalAmount: created.totalAmount.toString() },
  });
  return listChangeOrders(projectId, contractId);
}

async function loadChangeOrder(contract: ContractRow, changeOrderId: string) {
  const co = await prisma.changeOrder.findFirst({ where: { id: changeOrderId, contractId: contract.id } });
  if (!co) throw new ChangeOrderError("ไม่พบใบงานเพิ่ม-ลดที่ระบุ", 404);
  return co;
}

/** เปลี่ยนสถานะแบบกันชนกัน: เขียนได้เฉพาะเมื่อสถานะยังเป็นค่าที่คาดไว้ (สองคนกดพร้อมกันได้ผลเดียว) */
async function guardedUpdate(
  tx: Prisma.TransactionClient,
  id: string,
  allowed: readonly ChangeOrder["status"][],
  data: Prisma.ChangeOrderUpdateManyMutationInput,
) {
  const res = await tx.changeOrder.updateMany({ where: { id, status: { in: [...allowed] } }, data });
  if (res.count !== 1) throw new ChangeOrderError("ใบนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณาโหลดหน้าใหม่", 409);
}

export async function updateChangeOrder(
  projectId: string,
  contractId: string,
  changeOrderId: string,
  input: ChangeOrderInput,
  actorId: string,
) {
  const contract = await loadContract(projectId, contractId);
  const co = await loadChangeOrder(contract, changeOrderId);
  if (co.status !== "DRAFT") throw new ChangeOrderError("แก้ได้เฉพาะใบที่ยังเป็นร่าง", 409);
  await prisma.$transaction((tx) =>
    guardedUpdate(tx, co.id, ["DRAFT"], {
      title: input.title,
      note: input.note ?? null,
      extensionDays: input.extensionDays ?? null,
    }),
  );
  await writeAuditLog({ userId: actorId, action: "UPDATE_CHANGE_ORDER", entityType: "ChangeOrder", entityId: co.id, details: { projectId, docNo: co.docNo } });
  return listChangeOrders(projectId, contractId);
}

/** ร่างที่ BOQ ถูกแก้ต่อ → คิดใหม่จากเวอร์ชันล่าสุด (เลขที่ใบคงเดิม) */
export async function refreshChangeOrder(projectId: string, contractId: string, changeOrderId: string, actorId: string) {
  const contract = await loadContract(projectId, contractId);
  const co = await loadChangeOrder(contract, changeOrderId);
  if (co.status !== "DRAFT") throw new ChangeOrderError("คิดใหม่ได้เฉพาะใบที่ยังเป็นร่าง", 409);
  const computed = await computeAgainstLatest(contract);
  await prisma.$transaction((tx) => guardedUpdate(tx, co.id, ["DRAFT"], snapshotData(computed)));
  await writeAuditLog({
    userId: actorId,
    action: "REFRESH_CHANGE_ORDER",
    entityType: "ChangeOrder",
    entityId: co.id,
    details: { projectId, docNo: co.docNo, totalAmount: computed.totals.totalAmount },
  });
  return listChangeOrders(projectId, contractId);
}

async function notifyCustomer(contract: ContractRow, message: string) {
  if (!contract.project.customerId) return;
  // best-effort — แจ้งไม่สำเร็จต้องไม่ทำให้การเปลี่ยนสถานะกลายเป็น error
  await createNotification({ userId: contract.project.customerId, message, link: "/my/contracts" }).catch(() => undefined);
}

function deltaText(total: number): string {
  if (total > 0) return `มูลค่างานเพิ่มขึ้น ${money(total)} บาท`;
  if (total < 0) return `มูลค่างานลดลง ${money(-total)} บาท`;
  return "มูลค่างานไม่เปลี่ยน";
}

export async function sendChangeOrder(projectId: string, contractId: string, changeOrderId: string, actorId: string) {
  const contract = await loadContract(projectId, contractId);
  const co = await loadChangeOrder(contract, changeOrderId);
  if (co.status !== "DRAFT") throw new ChangeOrderError("ส่งได้เฉพาะใบที่ยังเป็นร่าง", 409);
  const latest = await prisma.projectVersion.findFirstOrThrow({ where: { projectId }, orderBy: { versionNo: "desc" } });
  if (latest.id !== co.toVersionId) {
    throw new ChangeOrderError("BOQ ถูกแก้หลังออกร่างนี้ — กด \"คิดใหม่\" ให้ตัวเลขตรงกับ BOQ ล่าสุดก่อนส่ง", 409);
  }
  await prisma.$transaction((tx) => guardedUpdate(tx, co.id, ["DRAFT"], { status: "SENT", sentAt: new Date() }));
  await writeAuditLog({ userId: actorId, action: "SEND_CHANGE_ORDER", entityType: "ChangeOrder", entityId: co.id, details: { projectId, docNo: co.docNo } });
  await notifyCustomer(
    contract,
    `ใบงานเพิ่ม-ลด ${co.docNo} ตามสัญญาเลขที่ ${contract.contractNo} รอคุณอนุมัติ — ${deltaText(Number(co.totalAmount))}`,
  );
  return listChangeOrders(projectId, contractId);
}

export async function cancelChangeOrder(projectId: string, contractId: string, changeOrderId: string, actorId: string) {
  const contract = await loadContract(projectId, contractId);
  const co = await loadChangeOrder(contract, changeOrderId);
  if (co.status !== "DRAFT" && co.status !== "SENT") {
    throw new ChangeOrderError("ยกเลิกได้เฉพาะใบที่ยังไม่ปิด (ร่าง หรือรอลูกค้าตอบ)", 409);
  }
  await prisma.$transaction((tx) => guardedUpdate(tx, co.id, ["DRAFT", "SENT"], { status: "CANCELLED", respondedAt: new Date() }));
  await writeAuditLog({ userId: actorId, action: "CANCEL_CHANGE_ORDER", entityType: "ChangeOrder", entityId: co.id, details: { projectId, docNo: co.docNo } });
  if (co.status === "SENT") {
    await notifyCustomer(contract, `ใบงานเพิ่ม-ลด ${co.docNo} ถูกยกเลิกแล้ว ไม่ต้องดำเนินการใด ๆ`);
  }
  return listChangeOrders(projectId, contractId);
}

/**
 * อนุมัติ: ย้ายเงินเข้างวด (งานเพิ่ม = งวดใหม่ · งานลด = หักงวดท้าย) แล้วปิดใบ — ทั้งหมดใน transaction
 * เดียว เงินไม่มีทางไปอยู่งวดโดยที่ใบยังไม่อนุมัติ หรือกลับกัน
 */
async function approve(
  contract: ContractRow,
  co: ChangeOrder,
  allowed: readonly ChangeOrder["status"][],
  via: "PORTAL" | "PAPER",
  note: string | null,
) {
  await prisma.$transaction(async (tx) => {
    const installments = await tx.contractInstallment.findMany({
      where: { contractId: contract.id },
      include: {
        payments: { select: { amount: true } },
        billingDocuments: { where: { type: "INVOICE", voidedAt: null }, select: { id: true } },
      },
    });
    const total = Number(co.totalAmount);
    // สัญญาเก่าที่ไม่มีแผนงวด — ไม่มีที่ให้ย้ายเงินไป มูลค่าสัญญาขยับอย่างเดียว
    const plan =
      installments.length === 0
        ? ({ kind: "none" } as const)
        : planInstallments(
            total,
            `งานเพิ่ม-ลด ครั้งที่ ${co.seq} (${co.docNo})`,
            installments.map((i) => ({
              id: i.id,
              seq: i.seq,
              milestone: i.milestone,
              amount: Number(i.amount),
              paid: round2(i.payments.reduce((s, p) => s + Number(p.amount), 0)),
              invoiced: i.billingDocuments.length > 0,
            })),
          );
    if (plan.kind === "blocked") throw new ChangeOrderError(plan.reason, 409);

    let changes: ChangeOrderInstallmentChangeDto[] = [];
    if (plan.kind === "create") {
      await tx.contractInstallment.create({
        data: { contractId: contract.id, seq: plan.seq, milestone: plan.milestone, amount: plan.amount, changeOrderId: co.id },
      });
      changes = [{ seq: plan.seq, milestone: plan.milestone, from: null, to: fmt(plan.amount) }];
    } else if (plan.kind === "reduce") {
      for (const c of plan.changes) {
        const row = installments.find((i) => i.id === c.id)!;
        await tx.contractInstallment.update({
          where: { id: c.id },
          // ยอดตามสัญญาที่ลงนามเก็บไว้ครั้งแรกที่ถูกปรับ — สัญญา PDF พิมพ์ยอดนี้ ไม่ใช่ยอดหลังหัก
          data: { amount: c.to, originalAmount: row.originalAmount ?? row.amount },
        });
      }
      changes = plan.changes.map((c) => ({ seq: c.seq, milestone: c.milestone, from: fmt(c.from), to: fmt(c.to) }));
    }

    await guardedUpdate(tx, co.id, allowed, {
      status: "APPROVED",
      respondedAt: new Date(),
      respondedVia: via,
      responseNote: note,
      installmentChanges: changes as unknown as Prisma.InputJsonValue,
    });
  });
}

/** พนักงานบันทึกผลจากใบที่ลูกค้าเซ็นกระดาษ (อนุมัติ/ไม่อนุมัติ) — จากร่างหรือที่ส่งแล้วก็ได้ */
export async function recordDecision(
  projectId: string,
  contractId: string,
  changeOrderId: string,
  input: DecisionInput,
  actorId: string,
) {
  const contract = await loadContract(projectId, contractId);
  const co = await loadChangeOrder(contract, changeOrderId);
  if (co.status !== "DRAFT" && co.status !== "SENT") throw new ChangeOrderError("ใบนี้ปิดไปแล้ว", 409);
  if (input.decision === "APPROVE") {
    const latest = await prisma.projectVersion.findFirstOrThrow({ where: { projectId }, orderBy: { versionNo: "desc" } });
    if (co.status === "DRAFT" && latest.id !== co.toVersionId) {
      throw new ChangeOrderError("BOQ ถูกแก้หลังออกร่างนี้ — กด \"คิดใหม่\" ก่อน ใบที่ลูกค้าเซ็นต้องเป็นตัวเลขล่าสุด", 409);
    }
    await approve(contract, co, ["DRAFT", "SENT"], "PAPER", input.note ?? null);
  } else {
    await prisma.$transaction((tx) =>
      guardedUpdate(tx, co.id, ["DRAFT", "SENT"], {
        status: "REJECTED",
        respondedAt: new Date(),
        respondedVia: "PAPER",
        responseNote: input.note ?? null,
      }),
    );
  }
  await writeAuditLog({
    userId: actorId,
    action: input.decision === "APPROVE" ? "APPROVE_CHANGE_ORDER" : "REJECT_CHANGE_ORDER",
    entityType: "ChangeOrder",
    entityId: co.id,
    details: { projectId, docNo: co.docNo, via: "PAPER", totalAmount: co.totalAmount.toString() },
  });
  if (input.decision === "APPROVE") {
    await notifyCustomer(contract, `บันทึกการอนุมัติใบงานเพิ่ม-ลด ${co.docNo} แล้ว — ${deltaText(Number(co.totalAmount))}`);
  }
  return listChangeOrders(projectId, contractId);
}

// ---------- ฝั่งลูกค้า ----------

/** ใบที่ลูกค้าเห็น: ส่งถึงแล้ว (ไม่มีร่างและใบที่ยกเลิก) */
export async function customerChangeOrders(contractId: string, contractAmount: unknown): Promise<CustomerChangeOrderDto[]> {
  const rows = await prisma.changeOrder.findMany({
    where: { contractId, status: { in: ["SENT", "APPROVED", "REJECTED"] } },
    orderBy: { seq: "asc" },
    include: CO_INCLUDE,
  });
  let running = contractAmount == null ? null : Number(contractAmount);
  return rows.map((r) => {
    const before = running;
    if (r.status === "APPROVED" && running != null) running = round2(running + Number(r.totalAmount));
    const { contractId: _c, fromVersionNo: _f, toVersionNo: _t, createdByName: _b, outdated: _o, ...rest } = toDto(r, {
      latestVersionNo: 0,
      amountBefore: before,
    });
    return rest;
  });
}

async function loadOwned(customerId: string, contractId: string, changeOrderId: string) {
  const co = await prisma.changeOrder.findFirst({
    where: { id: changeOrderId, contractId, project: { customerId, deletedAt: null } },
  });
  if (!co || co.status === "DRAFT" || co.status === "CANCELLED") throw new ChangeOrderError("ไม่พบใบงานเพิ่ม-ลดที่ระบุ", 404);
  return co;
}

/** ลูกค้ากดอนุมัติ/ไม่อนุมัติในพอร์ทัล — ได้เฉพาะใบที่ส่งมาแล้วและยังรอตอบ */
export async function respondAsCustomer(customerId: string, contractId: string, changeOrderId: string, input: DecisionInput) {
  const co = await loadOwned(customerId, contractId, changeOrderId);
  if (co.status !== "SENT") throw new ChangeOrderError("ใบนี้ตอบไปแล้ว", 409);
  const contract = await loadContract(co.projectId, contractId);
  if (input.decision === "APPROVE") {
    await approve(contract, co, ["SENT"], "PORTAL", input.note ?? null);
  } else {
    await prisma.$transaction((tx) =>
      guardedUpdate(tx, co.id, ["SENT"], {
        status: "REJECTED",
        respondedAt: new Date(),
        respondedVia: "PORTAL",
        responseNote: input.note ?? null,
      }),
    );
  }
  await writeAuditLog({
    userId: customerId,
    action: input.decision === "APPROVE" ? "CUSTOMER_APPROVE_CHANGE_ORDER" : "CUSTOMER_REJECT_CHANGE_ORDER",
    entityType: "ChangeOrder",
    entityId: co.id,
    details: { projectId: co.projectId, docNo: co.docNo, totalAmount: co.totalAmount.toString() },
  });
  const reason = input.note ? `: ${input.note}` : "";
  await notifyStaff(
    input.decision === "APPROVE"
      ? `ลูกค้าอนุมัติใบงานเพิ่ม-ลด ${co.docNo} (${contract.project.name}) — ${deltaText(Number(co.totalAmount))}`
      : `ลูกค้าไม่อนุมัติใบงานเพิ่ม-ลด ${co.docNo} (${contract.project.name})${reason}`,
    `/projects/${co.projectId}?tab=contract&view=changes&contract=${co.contractId}`,
  ).catch(() => undefined);
}

// ---------- PDF ----------

async function pdfOf(contract: ContractRow, co: ChangeOrder): Promise<Uint8Array> {
  const company = await loadCompanyProfile();
  const party = billingPartyOf(contract.project.customer, contract.project.customer?.customerProfile);
  const dtos = await changeOrderDtos(contract);
  const dto = dtos.find((d) => d.id === co.id)!;
  return renderChangeOrderPdf({
    companyName: company.companyName,
    companyAddress: company.companyAddress,
    companyPhone: company.companyPhone,
    companyTaxId: company.companyTaxId,
    companyBranch: company.companyBranch,
    companyEmail: company.companyEmail,
    logo: company.logo,
    logoSmall: company.logoSmall,
    customerName: party.name,
    customerAddress: party.address,
    customerIsCompany: party.isCompany,
    customerTaxId: party.taxId,
    customerBranch: party.branch,
    customerContactPerson: party.contactPerson,
    docNo: co.docNo,
    seq: co.seq,
    status: co.status,
    date: co.sentAt ?? co.createdAt,
    contractNo: contract.contractNo,
    contractSignedAt: contract.signedAt,
    projectNo: contract.project.projectNo,
    projectName: contract.project.name,
    title: co.title,
    note: co.note,
    extensionDays: co.extensionDays,
    lines: dto.lines,
    addAmount: Number(co.addAmount),
    deductAmount: Number(co.deductAmount),
    adjustAmount: Number(co.adjustAmount),
    netBeforeVat: Number(co.netBeforeVat),
    vatAmount: Number(co.vatAmount),
    totalAmount: Number(co.totalAmount),
    amountBefore: dto.amountBefore == null ? null : Number(dto.amountBefore),
    amountAfter: dto.amountAfter == null ? null : Number(dto.amountAfter),
    respondedAt: co.respondedAt,
    respondedVia: dto.respondedVia,
    contractorName: contract.signatoryName,
    contractorTitle: contract.signatoryTitle,
    installmentChanges: dto.installmentChanges,
  });
}

export async function generateChangeOrderPdf(projectId: string, contractId: string, changeOrderId: string) {
  const contract = await loadContract(projectId, contractId);
  const co = await loadChangeOrder(contract, changeOrderId);
  return { docNo: co.docNo, bytes: await pdfOf(contract, co) };
}

export async function generateMyChangeOrderPdf(customerId: string, contractId: string, changeOrderId: string) {
  const co = await loadOwned(customerId, contractId, changeOrderId);
  const contract = await loadContract(co.projectId, contractId);
  return { docNo: co.docNo, bytes: await pdfOf(contract, co) };
}
