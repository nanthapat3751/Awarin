import { billingPartyOf, withholdingFor } from "../../lib/billing-party";
import type { Prisma } from "@prisma/client";

import { writeAuditLog } from "../../lib/audit-log";
import { toIsoDate } from "../../lib/business-date";
import { generateContractNo } from "../../lib/contract-number";
import {
  DEFAULT_INSTALLMENT_PLAN,
  installmentMismatch,
  splitByPercent,
} from "../../lib/contract-installments";
import {
  bodyPrintsInstallments,
  buildContractVariables,
  type ContractStructure,
  renderStructure,
} from "../../lib/contract-template";
import { paymentAccountLine } from "../../lib/company-fields";
import { loadCompanyProfile } from "../../lib/company-profile";
import { renderContractPdf } from "../../lib/pdf/contract-pdf";
import { createNotification } from "../../lib/notifications";
import { prisma } from "../../lib/prisma";
import { getDefaultRetentionPct } from "../../lib/settings";
import { retentionSetAfterSigning } from "../../lib/contract-retention";
import { resolveTemplateForContract } from "../contractTemplates/contractTemplates.service";
import type {
  UpdateContractBodyInput,
  UpdateInstallmentsInput,
} from "../contractTemplates/contractTemplates.schemas";

export class ContractError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ContractError";
    this.status = status;
  }
}

// สัญญาจะมีความหมายก็ต่อเมื่อราคาของโปรเจกต์ได้รับการอนุมัติจากลูกค้าแล้วเท่านั้น
const ELIGIBLE_STATUSES = new Set(["APPROVED", "COMPLETED"]);

export async function listContracts(projectId: string) {
  return prisma.contract.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
}

async function getContractOrThrow(projectId: string, contractId: string) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (contract?.projectId !== projectId) {
    throw new ContractError("ไม่พบสัญญาที่ระบุ", 404);
  }
  return contract;
}

export async function getContract(projectId: string, contractId: string) {
  return getContractOrThrow(projectId, contractId);
}

/** มูลค่าสัญญา = ราคาสุทธิของเวอร์ชันล่าสุด (ยอดที่ลูกค้าตกลงในใบเสนอราคา) */
/**
 * ยอดของเวอร์ชันล่าสุด แยกส่วนที่เป็น VAT ออกมาด้วย
 *
 * ทั้งสองค่าต้องมาจากเวอร์ชัน**เดียวกัน** — ถ้าแยกไปอ่านคนละจังหวะ ฐานภาษีหัก ณ ที่จ่าย
 * (ยอดรวม − VAT) จะคำนวณข้ามเวอร์ชันแล้วได้ตัวเลขที่ไม่มีอยู่จริง
 */
async function latestVersionTotals(
  projectId: string,
): Promise<{ amount: number; vatAmount: number | null }> {
  const version = await prisma.projectVersion.findFirst({
    where: { projectId },
    orderBy: { versionNo: "desc" },
  });
  if (!version) return { amount: 0, vatAmount: null };
  return { amount: Number(version.netPrice), vatAmount: Number(version.vatAmt) };
}

async function contractAmountOf(projectId: string): Promise<number> {
  return (await latestVersionTotals(projectId)).amount;
}

/** เนื้อสัญญาที่แช่แข็งไว้ — สัญญาเก่าที่ออกก่อนมีระบบแม่แบบจะเป็น null */
function frozenBody(contract: { bodyJson: Prisma.JsonValue | null }): ContractStructure | null {
  return (contract.bodyJson as unknown as ContractStructure | null) ?? null;
}

export async function createContract(projectId: string, actorId: string, templateId?: string) {
  // ถังขยะ: ออกสัญญาให้โครงการที่ถูกลบไม่ได้
  const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!project) {
    throw new ContractError("ไม่พบโครงการที่ระบุ", 404);
  }
  if (!ELIGIBLE_STATUSES.has(project.status)) {
    throw new ContractError("โครงการต้องได้รับการอนุมัติ (APPROVED) ก่อนจึงจะออกสัญญาได้", 409);
  }

  // แทนค่าตัวแปรจากแม่แบบ "ตอนนี้ครั้งเดียว" แล้วเก็บผลลัพธ์ไว้กับสัญญาฉบับนี้
  // ถ้าไปอ่านแม่แบบตอนพิมพ์ PDF สัญญาที่เซ็นไปแล้วจะเปลี่ยนตามการแก้แม่แบบ/แก้ข้อมูลโครงการย้อนหลัง
  const template = await resolveTemplateForContract(templateId, actorId);
  const company = await loadCompanyProfile();
  const customer = project.customerId
    ? await prisma.user.findUnique({
        where: { id: project.customerId },
        include: { customerProfile: true },
      })
    : null;
  const contractNoPreview = await generateContractNo(prisma);
  // ตรึงมูลค่าสัญญาไว้กับฉบับนี้ตั้งแต่ตอนออก — ทั้งข้อความในสัญญาและยอดที่งวดเงินต้องรวมให้ได้
  // ต้องเป็นค่าเดียวกัน ไม่ใช่ต่างคนต่างไปอ่าน "เวอร์ชันล่าสุด" คนละจังหวะ
  const { amount, vatAmount } = await latestVersionTotals(projectId);

  const party = billingPartyOf(customer, customer?.customerProfile);
  // เงินประกันผลงานตั้งต้นจากหน้าตั้งค่า (ว่าง = ไม่มี) — แก้ได้จนกว่าจะลงนาม
  const retentionPct = await getDefaultRetentionPct();

  const body = renderStructure(
    template.structure as unknown as ContractStructure,
    buildContractVariables({
      customerName: party.name,
      customerAddress: party.address,
      customerTaxId: party.taxId,
      customerBranch: party.branch,
      customerContactPerson: party.contactPerson,
      companyName: company.companyName,
      companyAddress: company.companyAddress,
      companyPhone: company.companyPhone,
      companyTaxId: company.companyTaxId,
      companyEmail: company.companyEmail,
      signatoryName: company.signatory?.name ?? null,
      signatoryTitle: company.signatory?.title ?? null,
      paymentAccount: company.paymentAccount ? paymentAccountLine(company.paymentAccount) : null,
      projectName: project.name,
      projectNo: project.projectNo,
      siteAddress: project.siteAddress,
      contractNo: contractNoPreview,
      contractDate: new Date(),
      contractAmount: amount,
      startDate: project.startDate,
      targetEndDate: project.targetEndDate,
    }),
  );

  // แบ่งงวดตั้งต้นให้เลย พนักงานปรับทีหลังได้ — ยอดรวมเท่ามูลค่าสัญญาพอดีเสมอ
  // (งวดสุดท้ายรับเศษการปัด ดู splitByPercent)
  const contract = await prisma.contract.create({
    data: {
      projectId,
      contractNo: contractNoPreview,
      templateId: template.id,
      templateName: template.name,
      docTitle: template.docTitle,
      bodyJson: body as unknown as Prisma.InputJsonValue,
      amount,
      // ตรึงส่วนที่เป็น VAT ไว้พร้อมยอดรวม เพื่อให้คำนวณฐานภาษีหัก ณ ที่จ่ายของสัญญาฉบับนี้ได้
      // โดยไม่ต้องย้อนไปอ่านเวอร์ชันที่อาจถูกสร้างใหม่ทับหลังเซ็นสัญญาไปแล้ว
      vatAmount,
      // ตรึงผู้ลงนามฝั่งบริษัทพร้อมเนื้อสัญญา — ถ้าอ่านจากหน้าตั้งค่าตอนพิมพ์ วันที่เปลี่ยนกรรมการ
      // สัญญาที่เซ็นไปแล้วจะพิมพ์ชื่อคนใหม่ใต้ลายเซ็นคนเก่า และขัดกับอารัมภบทที่แช่แข็งชื่อคนเดิมไว้
      signatoryName: company.signatory?.name ?? null,
      signatoryTitle: company.signatory?.title ?? null,
      retentionPct,
      retentionSetAt: retentionPct == null ? null : new Date(),
      installments: {
        create: splitByPercent(amount, DEFAULT_INSTALLMENT_PLAN).map((i, index) => ({
          seq: index + 1,
          milestone: i.milestone,
          amount: i.amount,
        })),
      },
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: "CREATE_CONTRACT",
    entityType: "Contract",
    entityId: contract.id,
    details: {
      projectId,
      contractNo: contract.contractNo,
      templateId: template.id,
      templateName: template.name,
    },
  });

  // เดิมสัญญาโผล่ในพอร์ทัลเงียบ ๆ ลูกค้าไม่มีทางรู้จนกว่าจะเข้าไปดูเอง
  if (project.customerId) {
    await createNotification({
      userId: project.customerId,
      message: `สัญญาเลขที่ ${contract.contractNo} ของโครงการ "${project.name}" พร้อมให้ตรวจสอบแล้ว`,
      link: "/my/contracts",
    });
  }

  return contract;
}

export async function signContract(projectId: string, contractId: string, actorId: string) {
  const contract = await getContractOrThrow(projectId, contractId);
  if (contract.signedAt) {
    throw new ContractError("สัญญานี้ลงนามแล้ว", 409);
  }

  const updated = await prisma.contract.update({
    where: { id: contractId },
    data: { signedAt: new Date() },
  });

  await writeAuditLog({
    userId: actorId,
    action: "SIGN_CONTRACT",
    entityType: "Contract",
    entityId: contractId,
  });

  return updated;
}

/**
 * แก้ถ้อยคำของสัญญาฉบับนี้ (ไม่ใช่แม่แบบ) — จุดที่พนักงานเติมยอดงวดเงินของโครงการนั้นจริง ๆ
 *
 * ล็อกทันทีที่ลงนามแล้ว: เอกสารที่คู่สัญญาเซ็นไปแล้วแก้ข้อความย้อนหลังไม่ได้
 * ต้องทำเป็นบันทึกแนบท้ายสัญญาแทน (ตามข้อ 5 ของแม่แบบมาตรฐานเอง)
 */
export async function updateContractBody(
  projectId: string,
  contractId: string,
  input: UpdateContractBodyInput,
  actorId: string,
) {
  const contract = await getContractOrThrow(projectId, contractId);
  if (contract.signedAt) {
    throw new ContractError("สัญญาลงนามแล้ว แก้ข้อความไม่ได้ — ต้องทำบันทึกแนบท้ายสัญญาแทน", 409);
  }

  const updated = await prisma.contract.update({
    where: { id: contractId },
    data: {
      bodyJson: input.body as unknown as Prisma.InputJsonValue,
      ...(input.docTitle ? { docTitle: input.docTitle } : {}),
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_CONTRACT_BODY",
    entityType: "Contract",
    entityId: contractId,
    details: { projectId, contractNo: contract.contractNo, clauseCount: input.body.clauses.length },
  });

  return updated;
}

/**
 * งวดเงินของสัญญา + สองอย่างที่หน้าจอเดาเองไม่ได้
 *
 * `contractAmount` — ยอดที่งวดต้องรวมให้ได้ ต้องมาจากที่นี่ที่เดียว ไม่ใช่ให้หน้าจออ่าน
 * `contract.amount` เอง เพราะสัญญาเก่า (ออกก่อนมีฟีเจอร์นี้) ยังเป็น null แล้วหน้าจอจะนึกว่า
 * มูลค่าคือ 0 ทั้งที่เซิร์ฟเวอร์เทียบกับราคาสุทธิเวอร์ชันล่าสุด — บันทึกไม่ผ่านสักครั้งโดยไม่รู้สาเหตุ
 *
 * `printsTable` — เนื้อสัญญาฉบับนี้มีโทเคน {{ตารางงวดงาน}} หรือไม่ ถ้าไม่มี งวดที่กรอกจะถูกบันทึก
 * แต่ไม่ถูกพิมพ์ลงกระดาษเลย เงียบ ๆ (สัญญาเก่าที่ bodyJson เป็น null ก็เข้าข่ายนี้)
 */
export async function listInstallments(projectId: string, contractId: string) {
  const contract = await getContractOrThrow(projectId, contractId);
  const installments = await prisma.contractInstallment.findMany({
    where: { contractId },
    orderBy: { seq: "asc" },
  });
  const body = frozenBody(contract);
  return {
    // dueOn เป็นคอลัมน์ DATE — ส่งเป็น YYYY-MM-DD ไม่ใช่ ISO datetime เต็ม ๆ ที่พ่วงเวลาเที่ยงคืน
    // UTC มาด้วย ซึ่งหน้าจอจะเอาไปแสดงผิดวันบนเครื่องที่เขตเวลาติดลบ
    installments: installments.map((i) => ({ ...i, dueOn: toIsoDate(i.dueOn) })),
    contractAmount:
      contract.amount != null ? Number(contract.amount) : await contractAmountOf(projectId),
    printsTable: body ? bodyPrintsInstallments(body) : false,
  };
}

/**
 * เขียนงวดเงินทับทั้งชุด — ระบบบังคับให้ยอดรวมเท่ามูลค่าสัญญาพอดี
 *
 * นี่คือเหตุผลทั้งหมดที่งวดเงินต้องเป็นข้อมูล ไม่ใช่ข้อความ: ตอนเป็นข้อความ ไม่มีอะไรดักได้เลย
 * ว่าเจ็ดงวดรวมกันแล้วขาดไปแสนนึง แล้วเอกสารนั้นก็ออกไปถึงลูกค้า
 */
export async function updateInstallments(
  projectId: string,
  contractId: string,
  input: UpdateInstallmentsInput,
  actorId: string,
) {
  const contract = await getContractOrThrow(projectId, contractId);
  if (contract.signedAt) {
    throw new ContractError("สัญญาลงนามแล้ว แก้งวดเงินไม่ได้ — ต้องทำบันทึกแนบท้ายสัญญาแทน", 409);
  }

  const target = contract.amount != null ? Number(contract.amount) : await contractAmountOf(projectId);
  const mismatch = installmentMismatch(input.installments, target);
  if (mismatch) throw new ContractError(mismatch, 400);

  await prisma.$transaction(async (tx) => {
    await tx.contractInstallment.deleteMany({ where: { contractId } });
    await tx.contractInstallment.createMany({
      data: input.installments.map((i, index) => ({
        contractId,
        seq: index + 1,
        milestone: i.milestone,
        amount: i.amount,
      })),
    });
  });

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_CONTRACT_INSTALLMENTS",
    entityType: "Contract",
    entityId: contractId,
    details: { projectId, contractNo: contract.contractNo, count: input.installments.length },
  });

  return prisma.contractInstallment.findMany({ where: { contractId }, orderBy: { seq: "asc" } });
}

export async function generateContractPdf(projectId: string, contractId: string): Promise<Uint8Array> {
  const contract = await getContractOrThrow(projectId, contractId);
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { customer: { include: { customerProfile: true } } },
  });
  const company = await loadCompanyProfile();
  const party = billingPartyOf(project.customer, project.customer?.customerProfile);

  const contractAmount =
    contract.amount != null ? Number(contract.amount) : await contractAmountOf(projectId);

  return renderContractPdf({
    companyName: company.companyName,
    companyAddress: company.companyAddress,
    companyTaxId: company.companyTaxId,
    companyPhone: company.companyPhone,
    companyEmail: company.companyEmail,
    logo: company.logo,
    logoSmall: company.logoSmall,
    // ผู้ลงนามของฉบับนี้ ไม่ใช่ของหน้าตั้งค่าตอนนี้ — ฉบับเก่าที่ออกก่อนมีช่องนี้ (null) พิมพ์ชื่อบริษัทเหมือนเดิม
    signatory: contract.signatoryName
      ? { name: contract.signatoryName, title: contract.signatoryTitle }
      : null,
    contractNo: contract.contractNo,
    projectNo: project.projectNo,
    projectName: project.name,
    customerName: party.name,
    customerAddress: party.address,
    customerIsCompany: party.isCompany,
    customerTaxId: party.taxId,
    customerBranch: party.branch,
    customerContactPerson: party.contactPerson,
    siteAddress: project.siteAddress,
    startDate: project.startDate,
    targetEndDate: project.targetEndDate,
    date: contract.createdAt,
    contractAmount,
    // ฐานภาษีมาจากยอด VAT ที่ตรึงไว้กับสัญญาฉบับนี้ ไม่ใช่เวอร์ชันล่าสุดของโครงการ —
    // สัญญาเก่าที่ไม่มีค่านี้จะได้ null แล้วเอกสารจะไม่พิมพ์ตัวเลขหัก ณ ที่จ่าย (ห้ามเดา)
    withholding: withholdingFor(
      party,
      contractAmount,
      contract.vatAmount != null ? Number(contract.vatAmount) : null,
    ),
    signedAt: contract.signedAt,
    // % ที่ OWNER เติมหลังวันลงนามไม่ได้อยู่ในฉบับที่เซ็น — ห้ามพิมพ์ย้อนเข้าไปในสัญญา
    retentionPct:
      contract.retentionPct != null && !retentionSetAfterSigning(contract) ? Number(contract.retentionPct) : null,
    docTitle: contract.docTitle ?? "สัญญาก่อสร้าง",
    body: frozenBody(contract),
    // สัญญาที่ลงนามแล้วต้องพิมพ์ออกมาเหมือนวันเซ็น — งวดที่ใบงานเพิ่ม-ลดสร้างไม่อยู่ในสัญญา
    // และงวดที่ถูกหักพิมพ์ยอดตามสัญญา (originalAmount) การเปลี่ยนแปลงอยู่ในใบงานเพิ่ม-ลดแต่ละใบ
    installments: (
      await prisma.contractInstallment.findMany({
        where: { contractId, changeOrderId: null },
        orderBy: { seq: "asc" },
      })
    ).map((i) => ({ seq: i.seq, milestone: i.milestone, amount: Number(i.originalAmount ?? i.amount) })),
  });
}
