import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import {
  roundTo,
  settingsFromRuleSet,
  structuralTakeoff,
  takeoffShapeForUnit,
  isAreaUnit,
  isWeightUnit,
  sumTakeoffSheet,
  tileComponents,
  tileConfigErrors,
  tilePricingErrors,
  tileTakeoff,
  type StructuralInput,
  type StructuralKind,
  type StructuralMemberDto,
  type StructuralRecomputeDto,
  type TileCalcConfig,
  type TileTakeoffResult,
} from "@systemboq/shared-types";

import { BOQ_ITEM_ORDER } from "../../lib/boq-order";
import { writeAuditLog } from "../../lib/audit-log";
import {
  calculateLineAmounts,
  calculatePricing,
  deriveMaterialUnitPrice,
  discountOf,
  round2,
} from "../../lib/pricing";
import { prisma } from "../../lib/prisma";
import { getTakeoffRules } from "../../lib/takeoff-rules";
import { isCategoryChainActive } from "../categories/categories.service";
import type {
  ApplyTakeoffInput,
  CreateBoqItemInput,
  MaterialComponentInputDto,
  TakeoffRowInputDto,
  UpdateBoqItemInput,
} from "./boq.schemas";

// ทุกจุดที่อ่านบรรทัด BOQ ไปให้หน้าจอพนักงาน: วัสดุย่อย + ใบถอดแบบ เรียงตามลำดับที่บันทึก
export const ITEM_INCLUDE = {
  components: { orderBy: { sortOrder: "asc" as const } },
  takeoffRows: { orderBy: { sortOrder: "asc" as const } },
};

// ปริมาณเก็บเป็น Decimal(12,3) — ปัด 3 ตำแหน่งให้ตรงกับความละเอียดของคอลัมน์
function round3(value: number): number {
  return roundTo(value, 3);
}

// ตัวขับ (driver) ของการถอดปริมาณ — ค่าวัด/จำนวนระดับโครงการที่บรรทัด BOQ นำไปคูณกับสัมประสิทธิ์
export interface TakeoffDrivers {
  floorArea: number | null; // พื้นที่พื้น (ตร.ม.)
  wallArea: number | null; // พื้นที่ผนัง (ตร.ม.)
  perimeter: number | null; // ความยาวรอบรูป (ม.)
  volume: number | null; // ปริมาตร (ลบ.ม.)
  footprint: number | null; // พื้นที่ตั้งอาคาร/ปกคลุมดิน (ตร.ม.) — งานหลังคา/ฐานราก
  bathrooms: number | null; // จำนวนห้องน้ำ (นับ)
  floors: number | null; // จำนวนชั้น (นับ)
}

// จับคู่ฐานคำนวณ → ตัวขับที่ต้องใช้; MANUAL = ไม่มีตัวขับ (ใช้ปริมาณที่กรอกเอง)
const BASIS_DRIVER: Record<string, keyof TakeoffDrivers | undefined> = {
  MANUAL: undefined,
  PER_AREA: "floorArea",
  PER_WALL_AREA: "wallArea",
  PER_PERIMETER: "perimeter",
  PER_VOLUME: "volume",
  PER_FOOTPRINT: "footprint",
  PER_BATHROOM: "bathrooms",
  PER_FLOOR: "floors",
};

/**
 * ถอดปริมาณของหนึ่งบรรทัด BOQ ตาม "ฐานคำนวณ":
 * - ฐานที่ผูกตัวขับ (PER_AREA/PER_WALL_AREA/PER_PERIMETER/PER_VOLUME):
 *   quantity = ตัวขับ × สัมประสิทธิ์ต่อ 1 หน่วย × (1 + เผื่อเสีย%)
 * - MANUAL (หรือฐานที่ยังไม่มีค่าตัวขับ/สัมประสิทธิ์): ใช้ค่าที่กรอก/เก็บไว้ตามเดิม
 * แยกตรรกะไว้ที่เดียวเพื่อให้ตอนเพิ่ม/แก้บรรทัด และตอนค่าวัดเปลี่ยน คิดออกมาตรงกันเสมอ
 */
export function effectiveQuantity(input: {
  qtyBasis: string;
  qtyCoefficient: number | null;
  wasteFactorPct: number | null;
  manualQuantity: number;
  drivers: TakeoffDrivers;
}): number {
  const driverKey = BASIS_DRIVER[input.qtyBasis];
  if (driverKey && input.qtyCoefficient != null) {
    const driver = input.drivers[driverKey];
    if (driver != null && driver > 0) {
      const waste = 1 + (input.wasteFactorPct ?? 0) / 100;
      return round3(driver * input.qtyCoefficient * waste);
    }
  }
  return input.manualQuantity;
}

// ตัวขับทั้งหมดของโครงการ: ใช้ค่าวัดระดับโครงการก่อน (พนักงานกรอก) ไม่งั้นถอยไปใช้ของแบบบ้าน
// ทุกตัวขับ (กันกรณีโครงการเก่าที่ยังไม่มีค่าวัดของตัวเองแต่ผูกแบบบ้านไว้)
function resolveDrivers(project: {
  areaSqm: unknown;
  wallAreaSqm?: unknown;
  openingAreaSqm?: unknown;
  perimeterM?: unknown;
  concreteVolumeM3?: unknown;
  footprintSqm?: unknown;
  bathrooms?: unknown;
  floors?: unknown;
  houseDesign?: {
    area: unknown;
    wallAreaSqm?: unknown;
    perimeterM?: unknown;
    concreteVolumeM3?: unknown;
    footprintSqm?: unknown;
    bathrooms?: unknown;
    floors?: unknown;
  } | null;
}): TakeoffDrivers {
  const num = (v: unknown): number | null => (v != null ? Number(v) : null);
  const d = project.houseDesign;
  const grossWall = project.wallAreaSqm != null ? Number(project.wallAreaSqm) : num(d?.wallAreaSqm);
  // งานก่อ/ฉาบ/ทาสีไม่ทำตรงช่องประตูหน้าต่าง — หักช่องเปิดออกก่อนเป็นตัวขับของงานผนัง
  const openings = num(project.openingAreaSqm) ?? 0;
  return {
    floorArea: project.areaSqm != null ? Number(project.areaSqm) : num(d?.area),
    wallArea: grossWall == null ? null : Math.max(0, Math.round((grossWall - openings) * 100) / 100),
    perimeter: project.perimeterM != null ? Number(project.perimeterM) : num(d?.perimeterM),
    volume: project.concreteVolumeM3 != null ? Number(project.concreteVolumeM3) : num(d?.concreteVolumeM3),
    footprint: project.footprintSqm != null ? Number(project.footprintSqm) : num(d?.footprintSqm),
    bathrooms: project.bathrooms != null ? Number(project.bathrooms) : num(d?.bathrooms),
    floors: project.floors != null ? Number(project.floors) : num(d?.floors),
  };
}

// ---------- วัสดุย่อย (bill of materials) ----------

// รูปแบบวัสดุย่อยที่ถูก normalize แล้ว (ใช้ทั้งจาก input พนักงาน และจากสูตรในแคตตาล็อก Material)
type NormalizedComponent = {
  componentMaterialId: string | null;
  name: string;
  unit: string;
  qtyPerUnit: number;
  wasteFactorPct: number | null;
  unitPrice: number;
  sortOrder: number;
};

/** แถวสูตรวัสดุย่อยสำหรับ nested create ของ Prisma */
function componentCreateRows(components: NormalizedComponent[]) {
  return components.map((c) => ({
    componentMaterialId: c.componentMaterialId,
    name: c.name,
    unit: c.unit,
    qtyPerUnit: c.qtyPerUnit,
    wasteFactorPct: c.wasteFactorPct,
    unitPrice: c.unitPrice,
    sortOrder: c.sortOrder,
  }));
}

/** ค่า Decimal ที่เว้นว่างได้ → number | null */
function decimalOrNull(value: { toString(): string } | null): number | null {
  return value == null ? null : Number(value);
}

/** ค่า take-off ตอนแก้: undefined = ไม่แก้ (ใช้ของเดิม) · null = ล้างค่า · ตัวเลข = ค่าใหม่ */
function mergeTakeoff(next: number | null | undefined, existing: { toString(): string } | null): number | null {
  return next === undefined ? decimalOrNull(existing) : next;
}

function normalizeComponents(components: MaterialComponentInputDto[]): NormalizedComponent[] {
  return components.map((c, i) => ({
    componentMaterialId: c.componentMaterialId ?? null,
    name: c.name,
    unit: c.unit,
    qtyPerUnit: c.qtyPerUnit,
    wasteFactorPct: c.wasteFactorPct ?? null,
    unitPrice: c.unitPrice,
    sortOrder: c.sortOrder ?? i,
  }));
}

// สูตรที่ snapshot ไว้ในบรรทัด/แคตตาล็อก (Decimal) → รูปแบบ normalize (number)
function componentsFromRows(
  rows: {
    componentMaterialId: string | null;
    name: string;
    unit: string;
    qtyPerUnit: unknown;
    wasteFactorPct: unknown;
    unitPrice: unknown;
    sortOrder: number;
  }[],
): NormalizedComponent[] {
  return rows.map((c) => ({
    componentMaterialId: c.componentMaterialId,
    name: c.name,
    unit: c.unit,
    qtyPerUnit: Number(c.qtyPerUnit),
    wasteFactorPct: c.wasteFactorPct != null ? Number(c.wasteFactorPct) : null,
    unitPrice: Number(c.unitPrice),
    sortOrder: c.sortOrder,
  }));
}

// ราคาวัสดุต่อ 1 หน่วยของบรรทัดจากสูตร (pricing เป็นเจ้าของสูตรการคำนวณ)
function materialUnitPriceOf(components: NormalizedComponent[]): number {
  return deriveMaterialUnitPrice(
    components.map((c) => ({ qtyPerUnit: c.qtyPerUnit, wasteFactorPct: c.wasteFactorPct, unitPrice: c.unitPrice })),
  );
}

// วัสดุย่อยที่อ้างวัสดุดิบจากแคตตาล็อกต้องมีอยู่จริง (คืน error 404 ที่ชัด แทนที่จะให้ DB fail 500)
async function assertComponentRefsExist(components: NormalizedComponent[]): Promise<void> {
  const refIds = [...new Set(components.map((c) => c.componentMaterialId).filter((x): x is string => Boolean(x)))];
  if (refIds.length === 0) return;
  // ถังขยะ: วัสดุที่อยู่ในถังขยะถือว่า "ไม่พบ" อ้างอิงเป็นวัสดุย่อยไม่ได้
  const found = await prisma.material.findMany({
    where: { id: { in: refIds }, deletedAt: null },
    select: { id: true },
  });
  if (found.length !== refIds.length) {
    throw new BoqError("มีวัสดุย่อยอ้างอิงวัสดุที่ไม่พบในระบบ", 404);
  }
}

export class BoqError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "BoqError";
    this.status = status;
  }
}

// ---------- ใบถอดแบบ (qtyBasis = "SHEET") ----------

type NormalizedTakeoffRow = {
  label: string;
  count: number;
  length: number | null;
  width: number | null;
  height: number | null;
  barDia: number | null;
  deduct: boolean;
  memberKey: string | null;
};

function normalizeTakeoffRows(rows: TakeoffRowInputDto[]): NormalizedTakeoffRow[] {
  return rows.map((r) => ({
    label: r.label.trim(),
    count: r.count,
    length: r.length ?? null,
    width: r.width ?? null,
    height: r.height ?? null,
    barDia: r.barDia ?? null,
    deduct: r.deduct ?? false,
    memberKey: r.memberKey ?? null,
  }));
}

function takeoffRowsFromDb(
  rows: {
    label: string;
    count: unknown;
    length: unknown;
    width: unknown;
    height: unknown;
    barDia: number | null;
    deduct: boolean;
    memberKey: string | null;
  }[],
): NormalizedTakeoffRow[] {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return rows.map((r) => ({
    label: r.label,
    count: Number(r.count),
    length: num(r.length),
    width: num(r.width),
    height: num(r.height),
    barDia: r.barDia,
    deduct: r.deduct,
    memberKey: r.memberKey,
  }));
}

function takeoffCreateRows(rows: NormalizedTakeoffRow[]) {
  return rows.map((r, i) => ({ ...r, sortOrder: i }));
}

/** ปริมาณของบรรทัดจากใบถอดแบบ — ข้อมูลที่ใช้ไม่ได้โยน BoqError ที่บอกวิธีแก้ */
function sheetQuantity(rows: NormalizedTakeoffRow[], unit: string, wasteFactorPct: number | null): number {
  if (rows.length === 0) {
    throw new BoqError("ใบถอดแบบต้องมีอย่างน้อย 1 แถว");
  }
  if (rows.some((r) => r.barDia != null) && !isWeightUnit(unit)) {
    throw new BoqError(`แถวเหล็กเส้นคิดเป็นน้ำหนัก ใช้ได้กับบรรทัดหน่วย กก. หรือ ตัน เท่านั้น (บรรทัดนี้หน่วย "${unit}")`);
  }
  const total = sumTakeoffSheet(rows, unit, wasteFactorPct);
  if (total.quantity <= 0) {
    throw new BoqError("ผลรวมใบถอดแบบต้องมากกว่า 0 — แถวหักมากกว่าแถวบวก");
  }
  // คอลัมน์ปริมาณเก็บได้ไม่ถึงพันล้าน — ถึงขนาดนี้คือกรอกมิติเป็นมิลลิเมตรแทนเมตร
  if (total.quantity >= 1e9) {
    throw new BoqError("ปริมาณจากใบถอดแบบมากผิดปกติ — ตรวจว่ามิติกรอกเป็นเมตร");
  }
  return total.quantity;
}

// ---------- ตัวคิดกระเบื้อง (tileCalc) ----------

/** ค่าในคอลัมน์ JSON → รูปที่ใช้คิด (null = บรรทัดไม่ได้ใช้ตัวคิด) */
function tileCalcOf(value: Prisma.JsonValue | null): TileCalcConfig | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as unknown as TileCalcConfig) : null;
}

/** เขียนลงคอลัมน์ JSON: null = ล้างค่า (DbNull) · undefined = ไม่แตะ */
function tileCalcData(value: TileCalcConfig | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? Prisma.DbNull : (value as unknown as Prisma.InputJsonValue);
}

/** ตัวคิดใช้กับบรรทัดนี้ได้ไหม — หน่วยต้องเป็นพื้นที่ ค่าต้องครบ และถ้าให้ตั้งราคาต้องมีราคาครบ */
function assertTileCalc(tileCalc: TileCalcConfig, unit: string): void {
  if (!isAreaUnit(unit)) {
    throw new BoqError(`ตัวคิดกระเบื้องใช้ได้กับบรรทัดหน่วย ตร.ม. เท่านั้น (บรรทัดนี้หน่วย "${unit}")`);
  }
  const errors = [...tileConfigErrors(tileCalc), ...(tileCalc.priced ? tilePricingErrors(tileCalc) : [])];
  if (errors.length > 0) throw new BoqError(errors[0]);
}

/**
 * ผลของตัวคิดบนปริมาณปัจจุบันของบรรทัด — ใบถอดแบบ (กว้าง × ยาว ทีละห้อง) นับตามแนวปูได้
 * ฐานอื่นใช้พื้นที่สุทธิ = ปริมาณ ÷ (1 + เผื่อเสียของบรรทัด) เพราะเผื่อของกระเบื้องคิดในตัวคิดเองแล้ว
 */
function tileResultOf(
  tileCalc: TileCalcConfig,
  line: { qtyBasis: string; quantity: number; wasteFactorPct: number | null; rows: NormalizedTakeoffRow[] },
): TileTakeoffResult {
  const area = line.quantity / (1 + (line.wasteFactorPct ?? 0) / 100);
  return tileTakeoff(tileCalc, { rows: line.qtyBasis === "SHEET" ? line.rows : null, area });
}

/** วัสดุย่อยจากตัวคิด (เมื่อให้ตัวคิดตั้งราคา) — คิดใหม่ทุกครั้งที่ปริมาณ/ใบถอดแบบขยับ */
function tileComponentRows(
  tileCalc: TileCalcConfig,
  line: { qtyBasis: string; quantity: number; wasteFactorPct: number | null; rows: NormalizedTakeoffRow[] },
): NormalizedComponent[] {
  const result = tileResultOf(tileCalc, line);
  if (result.errors.length > 0) throw new BoqError(result.errors[0]);
  return tileComponents(tileCalc, result, line.quantity).map((c, i) => ({
    componentMaterialId: null,
    ...c,
    sortOrder: i,
  }));
}

export async function loadProjectOrThrow(projectId: string) {
  // ถังขยะ: โครงการที่ถูกลบแก้ BOQ ไม่ได้ (findFirst เพราะ where มี deletedAt ที่ไม่ unique)
  const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!project) {
    throw new BoqError("ไม่พบโครงการที่ระบุ", 404);
  }
  return project;
}

// โครงการกำหนดเองไม่ใช้ตัวสร้าง BOQ (ราคากรอกเอง + แนบไฟล์จริงแทน) — กันการแก้ BOQ ทุกทาง
export function assertNotCustom(project: { type: string }) {
  if (project.type === "CUSTOM") {
    throw new BoqError("โครงการกำหนดเองไม่ใช้ตัวสร้าง BOQ — กำหนดราคาเองและแนบไฟล์จริงแทน", 409);
  }
}

export async function getLatestVersion(projectId: string) {
  const version = await prisma.projectVersion.findFirst({
    where: { projectId },
    orderBy: { versionNo: "desc" },
  });
  if (!version) {
    throw new BoqError("ไม่พบเวอร์ชันโครงการ", 404);
  }
  return version;
}

export async function isVersionQuoted(versionId: string): Promise<boolean> {
  // ใบร่างที่ขอ/ได้อนุมัติแล้วนับด้วย: เนื้อหาที่ผู้อนุมัติเห็นต้องเป็นเนื้อหาที่ส่งจริง แก้ BOQ
  // ระหว่างนี้จึงต้องแตกเวอร์ชันใหม่ ไม่ใช่แก้ทับเวอร์ชันที่ใบนั้นชี้อยู่ (ดู lib/quote-approval.ts)
  const quote = await prisma.quote.findFirst({
    where: {
      projectVersionId: versionId,
      OR: [{ status: { not: "DRAFT" } }, { signers: { some: {} } }],
    },
  });
  if (quote) return true;
  // ใบงานเพิ่ม-ลดตรึงตัวเลขจากเวอร์ชันนี้ไว้แล้ว (แม้เป็นร่าง) — แก้ต่อต้องแตกเวอร์ชันใหม่ ไม่งั้น
  // ใบที่ลูกค้ากำลังพิจารณาจะไม่ตรงกับ BOQ ที่มันอ้าง · ร่างที่ล้าหลังกด "คิดใหม่" ได้
  const changeOrder = await prisma.changeOrder.findFirst({ where: { toVersionId: versionId }, select: { id: true } });
  return Boolean(changeOrder);
}

/** BR-07: เมื่อเวอร์ชันหนึ่งถูกส่งเป็นใบเสนอราคาไปแล้ว การแก้ BOQ ทุกครั้งต้อง clone เป็นเวอร์ชันใหม่ */
export async function getOrCreateEditableVersion(projectId: string, actorId: string) {
  const latest = await getLatestVersion(projectId);
  const quoted = await isVersionQuoted(latest.id);
  if (!quoted) {
    return latest;
  }

  const items = await prisma.boqItem.findMany({
    where: { projectVersionId: latest.id },
    // คัดลอกตามลำดับเดิม — บรรทัดที่ sortOrder เท่ากันได้ id ใหม่เรียงตามนี้ ลำดับจึงไม่สลับ
    orderBy: BOQ_ITEM_ORDER,
    include: ITEM_INCLUDE,
  });

  const members = await prisma.structuralMember.findMany({ where: { projectVersionId: latest.id } });

  const cloned = await prisma.projectVersion.create({
    data: {
      projectId,
      versionNo: latest.versionNo + 1,
      // ชิ้นส่วนโครงสร้างติดไปด้วย key เดิม — แถวใบถอดแบบที่คัดลอกไปอ้าง key เดียวกัน ไม่ต้องแปลง id
      structuralMembers: members.length
        ? {
            create: members.map((m) => ({
              key: m.key,
              kind: m.kind,
              label: m.label,
              count: m.count,
              input: m.input as Prisma.InputJsonValue,
              createdById: m.createdById,
              createdAt: m.createdAt,
            })),
          }
        : undefined,
      directCost: latest.directCost,
      overheadProfitPct: latest.overheadProfitPct,
      // การแบ่งค่าดำเนินการ/กำไรต้องติดไปกับเวอร์ชันใหม่ด้วย เหมือนส่วนลด ไม่งั้นแก้ BOQ ทีเดียว
      // การแบ่งที่ตั้งไว้หายเงียบ ๆ แล้วกำไรที่เคยเห็นก็หายตามไปด้วย
      overheadPct: latest.overheadPct,
      overheadProfitAmt: latest.overheadProfitAmt,
      // ส่วนลดที่ตกลงไว้ต้องติดไปกับเวอร์ชันใหม่ด้วย ไม่งั้นแก้ BOQ ทีเดียวส่วนลดหายเงียบ ๆ
      discountPct: latest.discountPct,
      discountAmt: latest.discountAmt,
      discountNote: latest.discountNote,
      // การปัดยอดที่ตั้งไว้ต้องติดไปด้วยเหมือนส่วนลด ไม่งั้นแก้ BOQ ทีเดียวยอดกลมกลับเป็นเศษ
      roundingUnit: latest.roundingUnit,
      roundingAmt: latest.roundingAmt,
      vatPct: latest.vatPct,
      vatAmt: latest.vatAmt,
      netPrice: latest.netPrice,
      pricePerSqm: latest.pricePerSqm,
      createdById: actorId,
      boqItems: {
        create: items.map((item) => ({
          categoryId: item.categoryId,
          materialId: item.materialId,
          name: item.name,
          quantity: item.quantity,
          qtyBasis: item.qtyBasis,
          qtyCoefficient: item.qtyCoefficient,
          wasteFactorPct: item.wasteFactorPct,
          unit: item.unit,
          materialUnitPrice: item.materialUnitPrice,
          materialTotal: item.materialTotal,
          laborUnitPrice: item.laborUnitPrice,
          laborTotal: item.laborTotal,
          lineTotal: item.lineTotal,
          sortOrder: item.sortOrder,
          note: item.note,
          // ราคาไม่ได้ถูกตั้งใหม่ตอนคัดลอก — คงเวลาเดิม ไม่งั้นการเตือนราคาในคลังเปลี่ยนจะหายทุกครั้งที่แตกเวอร์ชัน
          pricedAt: item.pricedAt,
          // ร่องรอยสายคัดลอก ใช้เทียบเวอร์ชัน + แปลง id ตอนอัปเดตราคาแล้วเกิดการแตกเวอร์ชัน
          sourceItemId: item.id,
          // ค่าตัวคิดกระเบื้องติดไปด้วยเหมือนใบถอดแบบ — ไม่งั้นแก้ต่อแล้ววัสดุย่อยไม่ถูกคิดใหม่
          tileCalc: tileCalcData(tileCalcOf(item.tileCalc) ?? undefined),
          // ใบถอดแบบติดไปด้วย ไม่งั้นแก้ BOQ หลังส่งใบเสนอราคาแล้วที่มาของปริมาณหายเงียบ ๆ
          takeoffRows: item.takeoffRows.length
            ? { create: takeoffCreateRows(takeoffRowsFromDb(item.takeoffRows)) }
            : undefined,
          // คัดลอกสแนปช็อตวัสดุย่อยไปเวอร์ชันใหม่ด้วย (freeze คู่กับบรรทัด)
          components: item.components.length
            ? {
                create: item.components.map((c) => ({
                  componentMaterialId: c.componentMaterialId,
                  name: c.name,
                  unit: c.unit,
                  qtyPerUnit: c.qtyPerUnit,
                  wasteFactorPct: c.wasteFactorPct,
                  unitPrice: c.unitPrice,
                  sortOrder: c.sortOrder,
                })),
              }
            : undefined,
        })),
      },
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: "CREATE_PROJECT_VERSION",
    entityType: "ProjectVersion",
    entityId: cloned.id,
    details: { projectId, versionNo: cloned.versionNo, reason: "edit after quote sent" },
  });

  return cloned;
}

export async function recalculateVersion(versionId: string) {
  const version = await prisma.projectVersion.findUniqueOrThrow({ where: { id: versionId } });
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: version.projectId },
    include: { houseDesign: true },
  });
  // โครงการกำหนดเอง (CUSTOM) ใช้ราคาที่พนักงานกรอกเอง ห้ามคำนวณจาก BOQ ทับ (ป้องกันราคาถูกรีเซ็ตเป็น 0)
  if (project.type === "CUSTOM") return version;
  const items = await prisma.boqItem.findMany({ where: { projectVersionId: versionId } });

  const drivers = resolveDrivers(project);

  // ถอดปริมาณของบรรทัดที่ผูกกับค่าวัดใหม่ตามค่าปัจจุบัน แล้วบันทึกกลับ (quantity + ยอดบรรทัด)
  // เพื่อให้ใบเสนอราคา/PDF ที่อ่าน quantity ตรงกับราคาที่คิด; บรรทัด MANUAL ไม่ถูกแตะ
  const lines = items.map((i) => {
    const materialUnitPrice = Number(i.materialUnitPrice);
    const laborUnitPrice = Number(i.laborUnitPrice);
    const quantity = effectiveQuantity({
      qtyBasis: i.qtyBasis,
      qtyCoefficient: i.qtyCoefficient != null ? Number(i.qtyCoefficient) : null,
      wasteFactorPct: i.wasteFactorPct != null ? Number(i.wasteFactorPct) : null,
      manualQuantity: Number(i.quantity),
      drivers,
    });
    return { item: i, quantity, materialUnitPrice, laborUnitPrice };
  });

  await Promise.all(
    lines
      .filter((l) => l.item.qtyBasis !== "MANUAL" && l.quantity !== Number(l.item.quantity))
      .map((l) => {
        const amounts = calculateLineAmounts({
          quantity: l.quantity,
          materialUnitPrice: l.materialUnitPrice,
          laborUnitPrice: l.laborUnitPrice,
        });
        return prisma.boqItem.update({
          where: { id: l.item.id },
          data: {
            quantity: l.quantity,
            materialTotal: amounts.materialTotal,
            laborTotal: amounts.laborTotal,
            lineTotal: amounts.lineTotal,
          },
        });
      }),
  );

  const boqLines = lines.map((l) => ({
    quantity: l.quantity,
    materialUnitPrice: l.materialUnitPrice,
    laborUnitPrice: l.laborUnitPrice,
  }));

  const pricing = calculatePricing(
    boqLines,
    Number(version.overheadProfitPct),
    Number(version.vatPct),
    drivers.floorArea,
    // ส่วนลดที่เป็น % ต้องคิดใหม่ทุกครั้งที่ยอดขยับ (เพิ่ม/ลบบรรทัด BOQ) ไม่งั้น "ลด 5%" จะค้าง
    // เป็นตัวเลขของยอดเก่า ส่วนส่วนลดที่กรอกเป็นบาทคงที่ไว้ตามที่ตกลงกับลูกค้า
    discountOf(version),
    {
      contingencyPercent: Number(version.contingencyPct),
      roundingUnit: version.roundingUnit,
    },
  );

  return prisma.projectVersion.update({
    where: { id: versionId },
    data: {
      directCost: pricing.directCost,
      contingencyAmt: pricing.contingencyAmount,
      overheadProfitAmt: pricing.overheadProfitAmount,
      discountAmt: pricing.discountAmount,
      roundingAmt: pricing.roundingAmount,
      vatAmt: pricing.vatAmount,
      netPrice: pricing.netPrice,
      pricePerSqm: pricing.pricePerSqm,
    },
  });
}

/**
 * คิดราคา/ปริมาณ take-off ของเวอร์ชันล่าสุดใหม่ — ให้ projects.service เรียกเมื่อ "พื้นที่โครงการ"
 * เปลี่ยน เพื่อให้บรรทัด PER_AREA และราคารวมขยับตาม (ไม่ใช่แค่ราคา/ตร.ม.) ข้ามโครงการ CUSTOM
 */
export async function recalculateLatestVersionPricing(projectId: string) {
  const latest = await prisma.projectVersion.findFirst({
    where: { projectId },
    orderBy: { versionNo: "desc" },
  });
  if (!latest) return;
  await recalculateVersion(latest.id);
}

export async function getBoqState(projectId: string) {
  await loadProjectOrThrow(projectId);
  const version = await getLatestVersion(projectId);
  const quoted = await isVersionQuoted(version.id);
  const items = await prisma.boqItem.findMany({
    where: { projectVersionId: version.id },
    orderBy: BOQ_ITEM_ORDER,
    include: ITEM_INCLUDE,
  });
  return { version, items, editable: !quoted };
}

/** หมวดที่จะผูกบรรทัด BOQ ต้องมีอยู่ · เป็นระดับ ITEM · และทั้งสายยังเปิดใช้งาน */
async function assertBoqItemCategory(categoryId: string): Promise<void> {
  const category = await prisma.workCategory.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw new BoqError("ไม่พบหมวดงานที่ระบุ", 404);
  }
  if (category.level !== "ITEM") {
    throw new BoqError("รายการ BOQ ต้องผูกกับหมวดงานระดับ ITEM เท่านั้น");
  }
  if (!(await isCategoryChainActive(categoryId))) {
    throw new BoqError("หมวดงานนี้ถูกปิดใช้งานแล้ว ไม่สามารถเพิ่มลง BOQ ได้", 409);
  }
}

/**
 * ค่าตั้งต้นจากวัสดุในคลัง (ถ้าเลือกวัสดุ) — ช่องที่พนักงานกรอกมาเองชนะเสมอ
 * ไม่ได้เลือกวัสดุ = คืนค่าที่กรอกมาตามเดิม
 */
async function lineDefaultsFrom(input: CreateBoqItemInput) {
  const defaults = {
    name: input.name,
    unit: input.unit,
    materialUnitPrice: input.materialUnitPrice,
    laborUnitPrice: input.laborUnitPrice,
    // เผื่อเสียของบรรทัดตั้งต้นจากค่าเริ่มต้นของวัสดุ — พนักงานกรอกทับได้ผ่าน input
    materialWaste: null as number | null,
    // สูตรวัสดุย่อยที่ติดมากับวัสดุแคตตาล็อก (ใช้ก็ต่อเมื่อพนักงานไม่ได้ส่งสูตรมาเอง)
    catalogComponents: [] as NormalizedComponent[],
  };
  if (!input.materialId) return defaults;

  // ถังขยะ: วัสดุที่อยู่ในถังขยะเลือกเข้า BOQ ไม่ได้ (findFirst เพราะ where มี deletedAt ที่ไม่ unique)
  const material = await prisma.material.findFirst({
    where: { id: input.materialId, deletedAt: null },
    include: { components: { orderBy: { sortOrder: "asc" } } },
  });
  if (!material) {
    throw new BoqError("ไม่พบรายการวัสดุ/ค่าแรงที่ระบุ", 404);
  }
  return {
    name: defaults.name ?? material.name,
    unit: defaults.unit ?? material.unit,
    materialUnitPrice: defaults.materialUnitPrice ?? Number(material.materialUnitPrice),
    laborUnitPrice: defaults.laborUnitPrice ?? Number(material.laborUnitPrice),
    materialWaste: decimalOrNull(material.wasteFactorPct),
    catalogComponents: componentsFromRows(material.components),
  };
}

export async function addBoqItem(projectId: string, input: CreateBoqItemInput, actorId: string) {
  assertNotCustom(await loadProjectOrThrow(projectId));
  await assertBoqItemCategory(input.categoryId);

  const defaults = await lineDefaultsFrom(input);
  const { name, unit, materialWaste, catalogComponents } = defaults;
  let { materialUnitPrice } = defaults;
  const tileCalc = input.tileCalc ?? null;

  // สูตรวัสดุย่อยของบรรทัด: พนักงานส่งมาเอง > สูตรจากแคตตาล็อก (เมื่อไม่ได้ส่ง) > ไม่มี (วัสดุก้อนเดียว).
  // [] ที่ส่งมาชัดเจน = ตั้งใจไม่แตกวัสดุ จึงไม่ดึงสูตรแคตตาล็อกมาแทน
  // (ตัวคิดกระเบื้องที่ตั้งราคาเองจะแทนชุดนี้หลังรู้ปริมาณ — ดูด้านล่าง)
  let components: NormalizedComponent[] =
    input.components !== undefined ? normalizeComponents(input.components) : catalogComponents;
  // มีวัสดุย่อย → ราคาวัสดุต่อหน่วยคิดจากผลรวมของสูตร (แทนค่าที่พิมพ์/มาจากวัสดุ)
  if (components.length > 0) {
    await assertComponentRefsExist(components);
    materialUnitPrice = materialUnitPriceOf(components);
  }

  const laborUnitPrice = defaults.laborUnitPrice ?? 0;

  if (!name || !unit || (materialUnitPrice === undefined && !tileCalc?.priced)) {
    throw new BoqError("ต้องระบุ materialId หรือกรอกชื่อ/หน่วย/ราคาวัสดุเอง");
  }
  if (tileCalc) assertTileCalc(tileCalc, unit);

  const qtyBasis = input.qtyBasis ?? "MANUAL";
  const usesSheet = qtyBasis === "SHEET";
  const usesDriver = qtyBasis !== "MANUAL" && !usesSheet;
  // ไม่กรอกเผื่อเสียมา: ฐานอ้างอิงค่าวัด/ใบถอดแบบใช้ค่าตั้งต้นของวัสดุ · ฐานกรอกเองไม่มีเผื่อเสีย
  const defaultWaste = usesDriver || usesSheet ? materialWaste : null;
  const wasteFactorPct = input.wasteFactorPct === undefined ? defaultWaste : input.wasteFactorPct;
  if (usesDriver && input.qtyCoefficient == null) {
    throw new BoqError("ฐานคำนวณแบบอ้างอิงค่าวัดต้องระบุปริมาณต่อ 1 หน่วย");
  }
  if (qtyBasis === "MANUAL" && input.quantity == null) {
    throw new BoqError("กรุณาระบุปริมาณ");
  }

  const projectForArea = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { houseDesign: true },
  });
  const sheetRows = usesSheet ? normalizeTakeoffRows(input.takeoffRows ?? []) : [];
  const quantity = usesSheet
    ? sheetQuantity(sheetRows, unit, wasteFactorPct)
    : effectiveQuantity({
        qtyBasis,
        qtyCoefficient: input.qtyCoefficient ?? null,
        wasteFactorPct,
        manualQuantity: input.quantity ?? 0,
        drivers: resolveDrivers(projectForArea),
      });
  if (tileCalc?.priced) {
    components = tileComponentRows(tileCalc, { qtyBasis, quantity, wasteFactorPct, rows: sheetRows });
    materialUnitPrice = materialUnitPriceOf(components);
  }
  const unitPrice = materialUnitPrice ?? 0;

  const version = await getOrCreateEditableVersion(projectId, actorId);
  const amounts = calculateLineAmounts({ quantity, materialUnitPrice: unitPrice, laborUnitPrice });
  // บรรทัดใหม่ต่อท้าย — เดิมเป็น 0 ทุกบรรทัด ลำดับจึงไม่มีความหมายและเลื่อนขึ้นลงไม่ได้
  const last = await prisma.boqItem.aggregate({
    where: { projectVersionId: version.id },
    _max: { sortOrder: true },
  });
  const sortOrder = input.sortOrder ?? (last._max.sortOrder ?? -1) + 1;

  const item = await prisma.boqItem.create({
    data: {
      projectVersionId: version.id,
      categoryId: input.categoryId,
      materialId: input.materialId ?? null,
      name,
      quantity,
      qtyBasis,
      qtyCoefficient: usesSheet ? null : input.qtyCoefficient ?? null,
      wasteFactorPct,
      unit,
      materialUnitPrice: unitPrice,
      materialTotal: amounts.materialTotal,
      laborUnitPrice,
      laborTotal: amounts.laborTotal,
      lineTotal: amounts.lineTotal,
      sortOrder,
      note: input.note ?? null,
      pricedAt: new Date(),
      tileCalc: tileCalcData(tileCalc ?? undefined),
      components: components.length
        ? {
            create: componentCreateRows(components),
          }
        : undefined,
      takeoffRows: sheetRows.length ? { create: takeoffCreateRows(sheetRows) } : undefined,
    },
    include: ITEM_INCLUDE,
  });

  const updatedVersion = await recalculateVersion(version.id);

  await writeAuditLog({
    userId: actorId,
    action: "ADD_BOQ_ITEM",
    entityType: "BoqItem",
    entityId: item.id,
    details: { projectId, name: item.name, lineTotal: item.lineTotal.toString() },
  });

  return { item, version: updatedVersion };
}

/**
 * เพิ่มหลายบรรทัดพร้อมกัน — ตรวจครบทุกบรรทัดก่อนเขียนอะไรลงไป (หมวด/วัสดุ/ชื่อ/หน่วย/ราคา)
 * เพื่อไม่ให้พังกลางทางแล้วเหลือครึ่งก้อน · เวอร์ชันแตกใหม่ (ถ้าส่งใบเสนอราคาแล้ว) แค่ครั้งแรก
 * เพราะ getOrCreateEditableVersion คืนเวอร์ชันที่ยังไม่ส่งตัวเดิมให้บรรทัดถัดไป
 */
export async function addBoqItems(projectId: string, inputs: CreateBoqItemInput[], actorId: string) {
  assertNotCustom(await loadProjectOrThrow(projectId));
  for (const [i, input] of inputs.entries()) {
    try {
      await assertBoqItemCategory(input.categoryId);
      const d = await lineDefaultsFrom(input);
      if (!d.name || !d.unit || (d.materialUnitPrice === undefined && d.catalogComponents.length === 0)) {
        throw new BoqError("ต้องเลือกวัสดุจากคลัง หรือกรอกชื่อ/หน่วย/ราคาวัสดุเอง");
      }
    } catch (err) {
      if (err instanceof BoqError) throw new BoqError(`รายการที่ ${i + 1}: ${err.message}`, err.status);
      throw err;
    }
  }

  let last: Awaited<ReturnType<typeof addBoqItem>> | null = null;
  for (const input of inputs) last = await addBoqItem(projectId, input, actorId);
  return { version: last!.version, created: inputs.length };
}

export async function updateBoqItem(
  projectId: string,
  itemId: string,
  input: UpdateBoqItemInput,
  actorId: string,
) {
  assertNotCustom(await loadProjectOrThrow(projectId));
  const version = await getOrCreateEditableVersion(projectId, actorId);

  const existing = await prisma.boqItem.findUnique({
    where: { id: itemId },
    include: ITEM_INCLUDE,
  });
  if (existing?.projectVersionId !== version.id) {
    throw new BoqError(
      "ไม่พบรายการนี้ในเวอร์ชันปัจจุบัน (ระบบอาจสร้างเวอร์ชันใหม่หลังส่งใบเสนอราคาแล้ว) กรุณาโหลดข้อมูลใหม่",
      404,
    );
  }

  // สลับวัสดุ: ถ้าส่ง materialId มา (ไม่ใช่ undefined) อัปเดตการอ้างอิง — ถ้าเป็นวัสดุจริงต้องมีอยู่
  // ในระบบ; ชื่อ/หน่วย/ราคาที่ผูกมากับวัสดุใหม่ ฝั่งเว็บส่งมาให้ครบใน input อยู่แล้ว (override ได้)
  const materialId = input.materialId === undefined ? existing.materialId : input.materialId;
  // ถังขยะ: สลับไปวัสดุที่อยู่ในถังขยะไม่ได้
  if (input.materialId && !(await prisma.material.findFirst({ where: { id: input.materialId, deletedAt: null } }))) {
    throw new BoqError("ไม่พบรายการวัสดุ/ค่าแรงที่ระบุ", 404);
  }

  // สูตรวัสดุย่อย: ไม่ส่ง (undefined) = คงของเดิม; null/[] = ล้างสูตร (กลับไปวัสดุก้อนเดียว);
  // มีรายการ = แทนทั้งชุด. เมื่อมีสูตร ราคาวัสดุต่อหน่วยคิดจากผลรวมเสมอ (ทับค่าที่พิมพ์มา)
  let willTouchComponents = input.components !== undefined;
  let nextComponents: NormalizedComponent[] = willTouchComponents
    ? normalizeComponents(input.components ?? [])
    : componentsFromRows(existing.components);
  // ตรวจ ref วัสดุดิบเฉพาะเมื่อพนักงานส่งสูตรใหม่มา (ของเดิมผ่านการตรวจตอนสร้างแล้ว)
  if (willTouchComponents && nextComponents.length > 0) await assertComponentRefsExist(nextComponents);

  // ตัวคิดกระเบื้อง: ไม่ส่ง = ใช้ค่าเดิม · null = เลิกใช้ · ตรวจทุกครั้งที่ค่าหรือหน่วยอาจเปลี่ยน
  const existingTile = tileCalcOf(existing.tileCalc);
  const tileCalc = input.tileCalc === undefined ? existingTile : input.tileCalc;
  if (tileCalc && (input.tileCalc !== undefined || input.unit !== undefined)) {
    assertTileCalc(tileCalc, input.unit ?? existing.unit);
  }

  const laborUnitPrice = input.laborUnitPrice ?? Number(existing.laborUnitPrice);

  // รวมค่า take-off ใหม่กับของเดิม (undefined = ไม่แก้) แล้วถอดปริมาณใหม่ตามฐานคำนวณ + พื้นที่
  const qtyBasis = input.qtyBasis ?? existing.qtyBasis;
  const qtyCoefficient = mergeTakeoff(input.qtyCoefficient, existing.qtyCoefficient);
  const wasteFactorPct = mergeTakeoff(input.wasteFactorPct, existing.wasteFactorPct);

  const projectForArea = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { houseDesign: true },
  });
  // ใบถอดแบบ: ส่งแถวมา = แทนทั้งชุด · ไม่ส่ง = ใช้แถวเดิม (เช่น แก้แค่ราคาหรือเผื่อเสีย)
  // เปลี่ยนไปฐานอื่น = ลบแถวทิ้ง เพราะปริมาณไม่ได้มาจากแถวพวกนั้นแล้ว
  const usesSheet = qtyBasis === "SHEET";
  let sheetRows: NormalizedTakeoffRow[] = [];
  if (usesSheet) {
    sheetRows =
      input.takeoffRows === undefined
        ? takeoffRowsFromDb(existing.takeoffRows)
        : normalizeTakeoffRows(input.takeoffRows);
  }
  const touchSheet = input.takeoffRows !== undefined || (!usesSheet && existing.takeoffRows.length > 0);
  // MANUAL: ปริมาณที่กรอกมา (หรือค่าเดิม) · ใบถอดแบบ: ผลรวมแถว · ฐานอื่น: ค่าวัด × สัมประสิทธิ์ × เผื่อเสีย
  const quantity = usesSheet
    ? sheetQuantity(sheetRows, input.unit ?? existing.unit, wasteFactorPct)
    : effectiveQuantity({
        qtyBasis,
        qtyCoefficient,
        wasteFactorPct,
        manualQuantity: input.quantity ?? Number(existing.quantity),
        drivers: resolveDrivers(projectForArea),
      });
  if (tileCalc?.priced) {
    // วัสดุย่อยเป็นผลของตัวคิด — คิดใหม่จากปริมาณล่าสุดเสมอ (สูตรที่ส่งมาพร้อมกันไม่ใช้)
    nextComponents = tileComponentRows(tileCalc, { qtyBasis, quantity, wasteFactorPct, rows: sheetRows });
    willTouchComponents = true;
  } else if (existingTile?.priced && input.tileCalc !== undefined) {
    // เลิกให้ตัวคิดตั้งราคา → วัสดุย่อยที่ตัวคิดสร้างไว้ต้องออกไปด้วย ราคากลับเป็นค่าที่กรอก
    nextComponents = [];
    willTouchComponents = true;
  }
  const materialUnitPrice =
    nextComponents.length > 0
      ? materialUnitPriceOf(nextComponents)
      : input.materialUnitPrice ?? Number(existing.materialUnitPrice);
  const amounts = calculateLineAmounts({ quantity, materialUnitPrice, laborUnitPrice });
  // หน้าแก้ไขส่งราคามาทุกครั้งแม้ไม่ได้แตะ — นับว่า "ตั้งราคาใหม่" เฉพาะเมื่อราคาหรือวัสดุเปลี่ยนจริง
  // ไม่งั้นแก้แค่ปริมาณก็ลบคำเตือนราคาในคลังเปลี่ยนทิ้งไปเงียบ ๆ
  const repriced =
    round2(materialUnitPrice) !== round2(Number(existing.materialUnitPrice)) ||
    round2(laborUnitPrice) !== round2(Number(existing.laborUnitPrice)) ||
    materialId !== existing.materialId;

  const item = await prisma.boqItem.update({
    where: { id: itemId },
    data: {
      categoryId: input.categoryId,
      materialId,
      name: input.name,
      unit: input.unit,
      quantity,
      qtyBasis,
      qtyCoefficient: usesSheet ? null : qtyCoefficient,
      wasteFactorPct,
      materialUnitPrice,
      materialTotal: amounts.materialTotal,
      laborUnitPrice,
      laborTotal: amounts.laborTotal,
      lineTotal: amounts.lineTotal,
      sortOrder: input.sortOrder,
      note: input.note,
      pricedAt: repriced ? new Date() : undefined,
      // แตะสูตรเฉพาะเมื่อส่ง components มา: ลบชุดเดิมทิ้งแล้วสร้างใหม่ (snapshot ใหม่ทั้งชุด)
      components: willTouchComponents
        ? { deleteMany: {}, create: componentCreateRows(nextComponents) }
        : undefined,
      takeoffRows: touchSheet ? { deleteMany: {}, create: takeoffCreateRows(sheetRows) } : undefined,
      tileCalc: tileCalcData(input.tileCalc),
    },
    include: ITEM_INCLUDE,
  });

  const updatedVersion = await recalculateVersion(version.id);

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_BOQ_ITEM",
    entityType: "BoqItem",
    entityId: item.id,
    details: { projectId, lineTotal: item.lineTotal.toString() },
  });

  return { item, version: updatedVersion };
}

export async function deleteBoqItem(projectId: string, itemId: string, actorId: string) {
  assertNotCustom(await loadProjectOrThrow(projectId));
  const version = await getOrCreateEditableVersion(projectId, actorId);

  const existing = await prisma.boqItem.findUnique({ where: { id: itemId } });
  if (existing?.projectVersionId !== version.id) {
    throw new BoqError(
      "ไม่พบรายการนี้ในเวอร์ชันปัจจุบัน (ระบบอาจสร้างเวอร์ชันใหม่หลังส่งใบเสนอราคาแล้ว) กรุณาโหลดข้อมูลใหม่",
      404,
    );
  }

  await prisma.boqItem.delete({ where: { id: itemId } });
  const updatedVersion = await recalculateVersion(version.id);

  await writeAuditLog({
    userId: actorId,
    action: "DELETE_BOQ_ITEM",
    entityType: "BoqItem",
    entityId: itemId,
    details: { projectId },
  });

  return { version: updatedVersion };
}

/**
 * เรียงบรรทัดใหม่ทั้งเวอร์ชัน — หน้าจอส่ง id ของเวอร์ชันล่าสุด "ครบทุกบรรทัด" ตามลำดับที่ต้องการ
 * (ส่งทั้งชุดแทนการส่ง "เลื่อนขึ้น 1" เพื่อไม่ต้องเดาว่าบรรทัดข้างเคียงคือบรรทัดไหน)
 *
 * ลำดับพิมพ์อยู่ในใบเสนอราคา จึงผ่านกฎ BR-07 เหมือนการแก้ BOQ ทุกทาง: เวอร์ชันที่ส่งแล้วแตกเป็น
 * เวอร์ชันใหม่ ใบที่ส่งไปไม่เปลี่ยน (id ที่ส่งมาเป็นของเวอร์ชันเดิม → แปลงผ่าน sourceItemId)
 */
export async function reorderBoqItems(projectId: string, itemIds: string[], actorId: string) {
  assertNotCustom(await loadProjectOrThrow(projectId));
  const latest = await getLatestVersion(projectId);
  const current = await prisma.boqItem.findMany({
    where: { projectVersionId: latest.id },
    orderBy: BOQ_ITEM_ORDER,
    select: { id: true },
  });
  const sameSet =
    itemIds.length === current.length &&
    new Set(itemIds).size === itemIds.length &&
    current.every((i) => itemIds.includes(i.id));
  if (!sameSet) {
    throw new BoqError("รายการ BOQ เปลี่ยนไปแล้ว กรุณาโหลดหน้านี้ใหม่", 409);
  }
  // ลำดับเดิมอยู่แล้ว — ไม่ต้องแตกเวอร์ชันใหม่เพราะการกดที่ไม่ได้เปลี่ยนอะไร
  if (current.every((i, idx) => i.id === itemIds[idx])) {
    return { version: latest, newVersion: false };
  }

  const version = await getOrCreateEditableVersion(projectId, actorId);
  let targetIds = itemIds;
  if (version.id !== latest.id) {
    const cloned = await prisma.boqItem.findMany({
      where: { projectVersionId: version.id },
      select: { id: true, sourceItemId: true },
    });
    const bySource = new Map(cloned.map((c) => [c.sourceItemId, c.id]));
    targetIds = itemIds.map((id) => bySource.get(id)!);
  }

  await prisma.$transaction(
    targetIds.map((id, index) => prisma.boqItem.update({ where: { id }, data: { sortOrder: index } })),
  );

  await writeAuditLog({
    userId: actorId,
    action: "REORDER_BOQ_ITEMS",
    entityType: "ProjectVersion",
    entityId: version.id,
    details: { projectId, versionNo: version.versionNo, count: targetIds.length },
  });

  return { version, newVersion: version.id !== latest.id };
}

type NewSheetLine = NonNullable<ApplyTakeoffInput["targets"][number]["newItem"]>;

/**
 * ตัวคิดชิ้นส่วนโครงสร้าง: เติมแถวใบถอดแบบลงหลายบรรทัดพร้อมกัน (คอนกรีต / ไม้แบบ / เหล็กแต่ละขนาด)
 *
 * - บรรทัดเดิมที่เป็นใบถอดแบบอยู่แล้ว → ต่อท้ายแถว
 * - บรรทัดเดิมที่กรอกปริมาณเอง → ปริมาณเดิมกลายเป็นแถวแรก "ปริมาณเดิม" แล้วต่อท้าย (ไม่มีตัวเลขหาย)
 * - บรรทัดที่คิดจากค่าวัดของโครงการ → ไม่รับ (ปริมาณมาจากสูตรค่าวัด ปนกับแถวไม่ได้)
 * - สร้างบรรทัดใหม่ → เป็นใบถอดแบบตั้งแต่แรก
 *
 * ตรวจทุกปลายทางก่อนเขียน เพื่อไม่ให้ลงได้ครึ่งเดียวแล้วพัง
 */
export async function applyTakeoffRows(projectId: string, input: ApplyTakeoffInput, actorId: string) {
  return writeTakeoffRows(projectId, input, actorId, null);
}

/**
 * แก้ชิ้นส่วนที่ลงไปแล้ว (ลงทับ) — แถวเดิมของชิ้นส่วนถูกถอดออกจากทุกบรรทัด แล้วลงแถวใหม่ตามปลายทางที่ส่งมา
 * ด้วย key เดิม (ป้ายเทียบ/การ์ดสั่งเหล็กยังผูกกันอยู่) · บรรทัดที่เหลือ 0 แถวและไม่ได้เป็นปลายทางใหม่ถูกลบ
 */
export async function replaceStructuralMember(
  projectId: string,
  key: string,
  input: ApplyTakeoffInput,
  actorId: string,
) {
  if (!input.member) throw new BoqError("ต้องส่งขนาดชิ้นส่วนใหม่");
  return writeTakeoffRows(projectId, input, actorId, key);
}

/**
 * ลบชิ้นส่วน — ถอดแถวของชิ้นส่วนออกจากทุกบรรทัด · บรรทัดที่ไม่เหลือแถวเลย (สร้างมาเพื่อชิ้นส่วนนี้) ถูกลบ
 * บรรทัดที่ยังมีแถวอื่น (ชิ้นส่วนอื่น/ปริมาณเดิมที่กรอกเอง) คงอยู่ ปริมาณลดลงตามแถวที่หายไป
 */
export async function deleteStructuralMember(projectId: string, key: string, actorId: string) {
  return writeTakeoffRows(projectId, { targets: [] }, actorId, key);
}

/** ชิ้นส่วนที่ลงไว้ในเวอร์ชันล่าสุด พร้อมบรรทัดที่มีแถวของแต่ละชิ้น — เรียงตามลำดับที่ลง */
export async function listStructuralMembers(projectId: string): Promise<StructuralMemberDto[]> {
  const latest = await getLatestVersion(projectId);
  const [members, rows] = await Promise.all([
    prisma.structuralMember.findMany({ where: { projectVersionId: latest.id }, orderBy: { createdAt: "asc" } }),
    prisma.boqTakeoffRow.findMany({
      where: { memberKey: { not: null }, boqItem: { projectVersionId: latest.id } },
      select: { memberKey: true, barDia: true, boqItem: { select: { id: true, name: true, unit: true, sortOrder: true } } },
    }),
  ]);
  return members.map((m) => {
    const lines = new Map<string, StructuralMemberDto["lines"][number] & { order: number }>();
    for (const r of rows) {
      if (r.memberKey !== m.key) continue;
      const item = r.boqItem;
      const line = lines.get(item.id) ?? { itemId: item.id, name: item.name, unit: item.unit, rows: 0, barDias: [], order: item.sortOrder };
      line.rows += 1;
      if (r.barDia != null && !line.barDias.includes(r.barDia)) line.barDias.push(r.barDia);
      lines.set(item.id, line);
    }
    return {
      key: m.key,
      kind: m.kind as StructuralKind,
      label: m.label,
      count: m.count,
      input: m.input as unknown as StructuralInput,
      createdAt: m.createdAt.toISOString(),
      lines: [...lines.values()].sort((a, b) => a.order - b.order).map(({ order: _order, ...l }) => l),
    };
  });
}

/** ก้อนผลลัพธ์ของตัวคิด (คอนกรีต · ไม้แบบ · เหล็กรายขนาด) ที่บรรทัดหนึ่งรับ — ตัดสินจากหน่วย + ขนาดเหล็กของแถวเดิม */
function memberGroupsOfLine(line: StructuralMemberDto["lines"][number]): string[] {
  if (line.barDias.length > 0 && isWeightUnit(line.unit)) return line.barDias.map((d) => `REBAR-${d}`);
  const shape = takeoffShapeForUnit(line.unit);
  if (shape === "VOLUME") return ["CONCRETE"];
  if (shape === "AREA") return ["FORMWORK"];
  return [];
}

type RecomputePlan = {
  member: StructuralMemberDto;
  input: StructuralInput;
  /** แถวใหม่ต่อบรรทัด (itemId ของเวอร์ชันล่าสุด) · บรรทัดที่ไม่มีในนี้ = ถอดแถวของชิ้นนี้ออก */
  rowsByItem: Map<string, TakeoffRowInputDto[]>;
};

const rowSignature = (r: { label: string; count: unknown; length: unknown; width: unknown; height: unknown; barDia: number | null }) =>
  [r.label, Number(r.count), r.length == null ? "" : Number(r.length), r.width == null ? "" : Number(r.width), r.height == null ? "" : Number(r.height), r.barDia ?? ""].join("|");

/**
 * คิดชิ้นส่วนทุกชิ้นใหม่ด้วยชุดเสนอราคาปัจจุบัน (Phase 2 ข้อ 3b — ใช้หลังแก้ ตั้งค่า → ถอดปริมาณ)
 *
 * แต่ละชิ้น: ขนาดเดิม + ค่ามาตรฐาน/กฎของชุดเสนอราคาปัจจุบัน (ระยะหุ้มคงของชิ้นเอง) → แถวใหม่ลงบรรทัดเดิม
 * ก้อนที่ตอนลงไม่ได้ลง (เช่น ลงแต่เหล็ก) ยังไม่ลงเหมือนเดิม · ชิ้นที่แถวแยกหลายบรรทัดในก้อนเดียวกันไม่แตะ (เดาไม่ได้ว่าแบ่งยังไง)
 * apply=false คืนพรีวิวก่อน-หลังโดยไม่เขียนอะไร · apply=true เขียนทีละชิ้นด้วยตัวเขียนเดียวกับ "แก้ชิ้นส่วน"
 * ไม่แตะเผื่อเสียของบรรทัด (ตั้งไว้ตอนสร้างบรรทัด/แก้เองได้ในแผงแก้ไข)
 */
export async function recomputeStructuralMembers(
  projectId: string,
  apply: boolean,
  actorId: string,
): Promise<StructuralRecomputeDto> {
  assertNotCustom(await loadProjectOrThrow(projectId));
  const latest = await getLatestVersion(projectId);
  const rules = await getTakeoffRules();
  const members = await listStructuralMembers(projectId);

  const skipped: StructuralRecomputeDto["skipped"] = [];
  const plans: RecomputePlan[] = [];
  for (const member of members) {
    const input: StructuralInput = {
      ...member.input,
      settings: settingsFromRuleSet(rules.tender, member.input.settings.cover),
    };
    const result = structuralTakeoff(input);
    if (result.errors.length > 0) {
      skipped.push({ label: member.label, reason: result.errors[0] });
      continue;
    }
    const lineOfGroup = new Map<string, string>();
    let split = false;
    for (const line of member.lines) {
      for (const g of memberGroupsOfLine(line)) {
        if (lineOfGroup.has(g)) split = true;
        lineOfGroup.set(g, line.itemId);
      }
    }
    if (split) {
      skipped.push({ label: member.label, reason: "แถวของก้อนเดียวกันแยกอยู่หลายบรรทัด — แก้ทีละชิ้นจากรายการชิ้นส่วน" });
      continue;
    }
    const rowsByItem = new Map<string, TakeoffRowInputDto[]>();
    for (const out of result.rows) {
      const g = out.group === "REBAR" ? `REBAR-${out.row.barDia}` : out.group;
      const itemId = lineOfGroup.get(g);
      if (!itemId) continue; // ก้อนที่ตอนลงไม่ได้ลง
      rowsByItem.set(itemId, [...(rowsByItem.get(itemId) ?? []), { ...out.row, memberKey: member.key }]);
    }
    plans.push({ member, input, rowsByItem });
  }

  // จำลองบรรทัดหลังคิดใหม่: แถวของชิ้นที่คิดใหม่ถูกแทน แถวอื่น (ชิ้นที่ข้าม/ปริมาณเดิม/แถวกรอกเอง) คงเดิม
  const planKeys = new Set(plans.map((p) => p.member.key));
  const touchedIds = [...new Set(plans.flatMap((p) => p.member.lines.map((l) => l.itemId)))];
  const items = await prisma.boqItem.findMany({
    where: { id: { in: touchedIds }, projectVersionId: latest.id },
    include: ITEM_INCLUDE,
  });
  const changedKeys = new Set<string>();
  const lines: StructuralRecomputeDto["lines"] = [];
  for (const item of items) {
    const oldRows = takeoffRowsFromDb(item.takeoffRows);
    const kept = oldRows.filter((r) => !r.memberKey || !planKeys.has(r.memberKey));
    const fresh = plans.flatMap((p) => normalizeTakeoffRows(p.rowsByItem.get(item.id) ?? []));
    for (const p of plans) {
      const before = oldRows.filter((r) => r.memberKey === p.member.key).map(rowSignature).join("\n");
      const after = (p.rowsByItem.get(item.id) ?? []).map((r) => rowSignature({ ...r, barDia: r.barDia ?? null, length: r.length ?? null, width: r.width ?? null, height: r.height ?? null })).join("\n");
      if (before !== after) changedKeys.add(p.member.key);
    }
    const nextRows = [...kept, ...fresh];
    const qtyBefore = Number(item.quantity);
    const qtyAfter = nextRows.length === 0 ? 0 : sheetQuantity(nextRows, item.unit, decimalOrNull(item.wasteFactorPct));
    if (Math.abs(qtyAfter - qtyBefore) < 0.0005) continue;
    const unitCost = Number(item.materialUnitPrice) + Number(item.laborUnitPrice);
    lines.push({
      itemId: item.id,
      name: item.name,
      unit: item.unit,
      qtyBefore,
      qtyAfter,
      costBefore: round2(qtyBefore * unitCost),
      costAfter: round2(qtyAfter * unitCost),
    });
  }
  lines.sort((a, b) => a.name.localeCompare(b.name, "th"));
  const costDelta = round2(lines.reduce((sum, l) => sum + l.costAfter - l.costBefore, 0));
  const willBranch = await isVersionQuoted(latest.id);

  const preview: StructuralRecomputeDto = {
    members: members.length,
    changedMembers: changedKeys.size,
    skipped,
    lines,
    costDelta,
    willBranch,
    applied: false,
    versionNo: latest.versionNo,
  };
  if (!apply || changedKeys.size === 0) return preview;

  // เขียนทีละชิ้น — ชิ้นแรกอาจแตกเวอร์ชัน (id บรรทัดเปลี่ยน) จึงแปลง id เดิม → บรรทัดในเวอร์ชันล่าสุดทุกรอบ
  // (บรรทัดที่คัดลอกมาจำ id ต้นทางไว้ใน sourceItemId)
  let versionNo = latest.versionNo;
  for (const plan of plans) {
    if (!changedKeys.has(plan.member.key)) continue;
    const now = await getLatestVersion(projectId);
    const rows = await prisma.boqItem.findMany({ where: { projectVersionId: now.id }, select: { id: true, sourceItemId: true } });
    const idNow = (oldId: string) =>
      rows.some((r) => r.id === oldId) ? oldId : rows.find((r) => r.sourceItemId === oldId)?.id;
    const targets = [...plan.rowsByItem.entries()].flatMap(([oldId, rs]) => {
      const itemId = idNow(oldId);
      return itemId && rs.length > 0 ? [{ itemId, rows: rs }] : [];
    });
    const res = await writeTakeoffRows(
      projectId,
      targets.length > 0
        ? { member: plan.input as unknown as ApplyTakeoffInput["member"], targets }
        : { targets: [] },
      actorId,
      plan.member.key,
    );
    versionNo = res.version.versionNo;
  }

  await writeAuditLog({
    userId: actorId,
    action: "RECOMPUTE_STRUCTURAL_MEMBERS",
    entityType: "Project",
    entityId: projectId,
    details: { members: changedKeys.size, lines: lines.length, costDelta, branched: willBranch },
  });
  return { ...preview, applied: true, versionNo };
}

/**
 * ตัวเขียนแถวของตัวคิดโครงสร้าง ใช้ร่วมกันสามทาง: ลงใหม่ (replaceKey = null) · ลงทับ · ลบ (member ไม่ส่ง + ไม่มีปลายทาง)
 * ลงทับ/ลบ: แถวที่ผูก replaceKey ถูกถอดออกจากทุกบรรทัดก่อน แล้วค่อยเติมแถวใหม่
 */
async function writeTakeoffRows(projectId: string, input: ApplyTakeoffInput, actorId: string, replaceKey: string | null) {
  assertNotCustom(await loadProjectOrThrow(projectId));
  const latest = await getLatestVersion(projectId);
  if (replaceKey) {
    const found = await prisma.structuralMember.findUnique({
      where: { projectVersionId_key: { projectVersionId: latest.id, key: replaceKey } },
    });
    if (!found) throw new BoqError("ไม่พบชิ้นส่วนนี้ในเวอร์ชันล่าสุด กรุณาโหลดหน้านี้ใหม่", 404);
  }

  // ชิ้นส่วนที่เป็นที่มาของแถว: ตัวคิดต้องรับข้อมูลนี้ได้จริง (กันเก็บขนาดที่คิดซ้ำไม่ได้) · แถวทุกแถวผูก key นี้
  const member = input.member as unknown as StructuralInput | undefined;
  const memberKey = replaceKey ?? (member ? randomUUID() : null);
  if (member) {
    const check = structuralTakeoff(member);
    if (check.errors.length > 0) throw new BoqError(`ข้อมูลชิ้นส่วนไม่ครบ: ${check.errors[0]}`);
    if (JSON.stringify(member).length > 8000) throw new BoqError("ข้อมูลชิ้นส่วนยาวเกินไป");
    for (const t of input.targets) t.rows = t.rows.map((r) => ({ ...r, memberKey }));
  }

  // ปลายทางเดียวกันถูกส่งมาหลายก้อน (เช่น เหล็กสองแถวลงบรรทัดเดียว) → รวมเป็นก้อนเดียว
  const byItem = new Map<string, TakeoffRowInputDto[]>();
  const newTargets: { newItem: NewSheetLine; rows: TakeoffRowInputDto[] }[] = [];
  for (const t of input.targets) {
    if (t.itemId) byItem.set(t.itemId, [...(byItem.get(t.itemId) ?? []), ...t.rows]);
    else if (t.newItem) newTargets.push({ newItem: t.newItem, rows: t.rows });
  }

  const existing = await prisma.boqItem.findMany({
    where: { id: { in: [...byItem.keys()] }, projectVersionId: latest.id },
    include: ITEM_INCLUDE,
  });
  if (existing.length !== byItem.size) {
    throw new BoqError("บรรทัดปลายทางเปลี่ยนไปแล้ว กรุณาโหลดหน้านี้ใหม่", 409);
  }
  // ลงทับ/ลบ: บรรทัดที่มีแถวของชิ้นส่วนเดิม (ไม่ได้เป็นปลายทางใหม่ก็ต้องถอดแถวออก)
  const affected = replaceKey
    ? await prisma.boqItem.findMany({
        where: {
          projectVersionId: latest.id,
          id: { notIn: [...byItem.keys()] },
          takeoffRows: { some: { memberKey: replaceKey } },
        },
        include: ITEM_INCLUDE,
      })
    : [];

  const toDelete: string[] = [];
  const merged = [...existing, ...affected].flatMap((item) => {
    const targeted = byItem.has(item.id);
    if (targeted && item.qtyBasis !== "MANUAL" && item.qtyBasis !== "SHEET") {
      throw new BoqError(`บรรทัด "${item.name}" คิดปริมาณจากค่าวัดของโครงการ — เลือกบรรทัดอื่นหรือสร้างบรรทัดใหม่`, 409);
    }
    const carried: NormalizedTakeoffRow[] =
      item.qtyBasis === "SHEET"
        ? takeoffRowsFromDb(item.takeoffRows).filter((r) => !replaceKey || r.memberKey !== replaceKey)
        : [
            {
              label: "ปริมาณเดิม (กรอกเอง)",
              count: Number(item.quantity),
              length: null,
              width: null,
              height: null,
              barDia: null,
              deduct: false,
              memberKey: null,
            },
          ];
    const rows = [...carried, ...normalizeTakeoffRows(byItem.get(item.id) ?? [])];
    // ไม่เหลือแถวเลย = บรรทัดนี้มีไว้เพื่อชิ้นส่วนที่ถอดออก — ลบทั้งบรรทัด (ปริมาณ 0 ค้างไว้ไม่มีประโยชน์)
    if (rows.length === 0) {
      toDelete.push(item.id);
      return [];
    }
    // บรรทัดที่เคยกรอกเองไม่มีเผื่อเสียที่มีความหมาย — เริ่มที่ 0 ไม่งั้นปริมาณเดิมโดนเผื่อซ้ำ
    const waste = item.qtyBasis === "SHEET" ? decimalOrNull(item.wasteFactorPct) : null;
    sheetQuantity(rows, item.unit, waste);
    return [{ item, rows, waste }];
  });

  // บรรทัดใหม่: ตรวจหมวด/วัสดุ/หน่วยก่อนเขียนอะไร
  for (const t of newTargets) {
    await assertBoqItemCategory(t.newItem.categoryId);
    const defaults = await lineDefaultsFrom({ ...t.newItem, qtyBasis: "SHEET", takeoffRows: t.rows });
    if (!defaults.name || !defaults.unit) {
      throw new BoqError("บรรทัดใหม่ต้องเลือกวัสดุจากคลัง หรือกรอกชื่อและหน่วย");
    }
    sheetQuantity(normalizeTakeoffRows(t.rows), defaults.unit, defaults.materialWaste);
  }

  // แตกเวอร์ชันใหม่ (ถ้าเวอร์ชันนี้ส่งใบเสนอราคาแล้ว) ครั้งเดียว แล้วแปลง id ไปบรรทัดในเวอร์ชันใหม่
  const version = await getOrCreateEditableVersion(projectId, actorId);
  // แตกเวอร์ชันแล้วชิ้นส่วนถูกคัดลอกมาด้วย key เดิม — แก้/ลบที่เวอร์ชันที่แก้ได้
  const memberWhere = replaceKey ? { projectVersionId_key: { projectVersionId: version.id, key: replaceKey } } : null;
  if (memberWhere && member) {
    await prisma.structuralMember.update({
      where: memberWhere,
      data: {
        kind: member.kind,
        label: member.label,
        count: member.count,
        input: member as unknown as Prisma.InputJsonValue,
      },
    });
  } else if (memberWhere) {
    await prisma.structuralMember.delete({ where: memberWhere });
  } else if (member && memberKey) {
    await prisma.structuralMember.create({
      data: {
        projectVersionId: version.id,
        key: memberKey,
        kind: member.kind,
        label: member.label,
        count: member.count,
        input: member as unknown as Prisma.InputJsonValue,
        createdById: actorId,
      },
    });
  }
  // เผื่อเสียตั้งต้นของบรรทัดเหล็กใหม่ตามขนาด (ชุดเสนอราคา) — เฉพาะเมื่อวัสดุไม่ได้กำหนดไว้เอง
  const rules = await getTakeoffRules();
  let idOf = (id: string) => id;
  if (version.id !== latest.id) {
    const cloned = await prisma.boqItem.findMany({
      where: { projectVersionId: version.id },
      select: { id: true, sourceItemId: true },
    });
    const bySource = new Map(cloned.map((c) => [c.sourceItemId, c.id]));
    idOf = (id) => bySource.get(id)!;
  }

  let finalVersion = version;
  for (const m of merged) {
    const r = await updateBoqItem(
      projectId,
      idOf(m.item.id),
      { qtyBasis: "SHEET", wasteFactorPct: m.waste, takeoffRows: m.rows },
      actorId,
    );
    finalVersion = r.version;
  }
  for (const id of toDelete) {
    finalVersion = (await deleteBoqItem(projectId, idOf(id), actorId)).version;
  }
  for (const t of newTargets) {
    const dias = new Set(t.rows.map((r) => r.barDia ?? null));
    const dia = dias.size === 1 ? [...dias][0] : null;
    const presetWaste = dia != null ? rules.tender.wastePct[String(dia)] ?? null : null;
    const materialWaste = t.newItem.materialId
      ? (await lineDefaultsFrom({ ...t.newItem, qtyBasis: "SHEET", takeoffRows: t.rows })).materialWaste
      : null;
    const r = await addBoqItem(
      projectId,
      {
        ...t.newItem,
        qtyBasis: "SHEET",
        takeoffRows: t.rows,
        ...(presetWaste != null && materialWaste == null ? { wasteFactorPct: presetWaste } : {}),
      },
      actorId,
    );
    finalVersion = r.version;
  }

  const rowCount = input.targets.reduce((n, t) => n + t.rows.length, 0);
  let action = "APPLY_TAKEOFF_ROWS";
  if (replaceKey) action = member ? "UPDATE_STRUCTURAL_MEMBER" : "DELETE_STRUCTURAL_MEMBER";
  await writeAuditLog({
    userId: actorId,
    action,
    entityType: "ProjectVersion",
    entityId: version.id,
    details: {
      projectId,
      lines: merged.length + newTargets.length,
      created: newTargets.length,
      removed: toDelete.length,
      rows: rowCount,
      ...(replaceKey ? { memberKey: replaceKey } : {}),
    },
  });

  return {
    version: finalVersion,
    lines: merged.length + newTargets.length,
    created: newTargets.length,
    removed: toDelete.length,
    newVersion: version.id !== latest.id,
  };
}
