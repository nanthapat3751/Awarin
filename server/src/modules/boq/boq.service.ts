import { BOQ_ITEM_ORDER } from "../../lib/boq-order";
import { writeAuditLog } from "../../lib/audit-log";
import {
  calculateLineAmounts,
  calculatePricing,
  componentQtyPerUnit,
  deriveMaterialUnitPrice,
  discountOf,
  round2,
} from "../../lib/pricing";
import { prisma } from "../../lib/prisma";
import { isCategoryChainActive } from "../categories/categories.service";
import type { CreateBoqItemInput, MaterialComponentInputDto, UpdateBoqItemInput } from "./boq.schemas";

// ปริมาณเก็บเป็น Decimal(12,3) — ปัด 3 ตำแหน่งให้ตรงกับความละเอียดของคอลัมน์
function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
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
  return {
    floorArea: project.areaSqm != null ? Number(project.areaSqm) : num(d?.area),
    wallArea: project.wallAreaSqm != null ? Number(project.wallAreaSqm) : num(d?.wallAreaSqm),
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
  const quote = await prisma.quote.findFirst({
    where: { projectVersionId: versionId, status: { not: "DRAFT" } },
  });
  return Boolean(quote);
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
    include: { components: { orderBy: { sortOrder: "asc" } } },
  });

  const cloned = await prisma.projectVersion.create({
    data: {
      projectId,
      versionNo: latest.versionNo + 1,
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

  const pricing = calculatePricing(
    lines.map((l) => ({
      quantity: l.quantity,
      materialUnitPrice: l.materialUnitPrice,
      laborUnitPrice: l.laborUnitPrice,
    })),
    Number(version.overheadProfitPct),
    Number(version.vatPct),
    drivers.floorArea,
    // ส่วนลดที่เป็น % ต้องคิดใหม่ทุกครั้งที่ยอดขยับ (เพิ่ม/ลบบรรทัด BOQ) ไม่งั้น "ลด 5%" จะค้าง
    // เป็นตัวเลขของยอดเก่า ส่วนส่วนลดที่กรอกเป็นบาทคงที่ไว้ตามที่ตกลงกับลูกค้า
    discountOf(version),
  );

  return prisma.projectVersion.update({
    where: { id: versionId },
    data: {
      directCost: pricing.directCost,
      overheadProfitAmt: pricing.overheadProfitAmount,
      discountAmt: pricing.discountAmount,
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
    include: { components: { orderBy: { sortOrder: "asc" } } },
  });
  return { version, items, editable: !quoted };
}

/**
 * สรุปปริมาณวัสดุรวมทั้งโครงการ (bill of materials / ลิสต์สั่งซื้อ) ของเวอร์ชันล่าสุด —
 * รวมวัสดุย่อยข้ามทุกบรรทัด จัดกลุ่มวัสดุเดียวกัน (componentMaterialId ถ้ามี ไม่งั้น ชื่อ+หน่วย)
 * และแยกแถวเมื่อราคาต่อหน่วยที่ freeze ไว้ต่างกัน. ต้นทุนซ่อนจากลูกค้า — ใช้ฝั่ง staff เท่านั้น.
 */
export async function getMaterialSummary(projectId: string) {
  await loadProjectOrThrow(projectId);
  const version = await getLatestVersion(projectId);
  const items = await prisma.boqItem.findMany({
    where: { projectVersionId: version.id },
    include: { components: true },
  });

  const groups = new Map<
    string,
    { componentMaterialId: string | null; name: string; unit: string; unitPrice: number; totalQty: number }
  >();
  let linesWithComponents = 0;

  for (const item of items) {
    if (item.components.length > 0) linesWithComponents += 1;
    const lineQuantity = Number(item.quantity);
    for (const c of item.components) {
      const unitPrice = Number(c.unitPrice);
      // ปริมาณวัสดุย่อยที่ต้องใช้จากบรรทัดนี้ = ปริมาณบรรทัด × ปริมาณต่อหน่วยรวมเผื่อเสีย
      const qty =
        lineQuantity *
        componentQtyPerUnit({
          qtyPerUnit: Number(c.qtyPerUnit),
          wasteFactorPct: c.wasteFactorPct != null ? Number(c.wasteFactorPct) : null,
        });
      const materialKey = c.componentMaterialId ?? `free:${c.name}|${c.unit}`;
      const key = `${materialKey}|${unitPrice}`;
      const g = groups.get(key);
      if (g) {
        g.totalQty += qty;
      } else {
        groups.set(key, {
          componentMaterialId: c.componentMaterialId,
          name: c.name,
          unit: c.unit,
          unitPrice,
          totalQty: qty,
        });
      }
    }
  }

  const rows = [...groups.values()]
    .map((g) => {
      const totalQty = round3(g.totalQty);
      const totalCost = round2(totalQty * g.unitPrice);
      return {
        componentMaterialId: g.componentMaterialId,
        name: g.name,
        unit: g.unit,
        totalQty: totalQty.toString(),
        unitPrice: g.unitPrice.toFixed(2),
        totalCost: totalCost.toFixed(2),
      };
    })
    // เรียงตามมูลค่ารวมมาก→น้อย (ช่วยงานจัดซื้อเห็นวัสดุหลักก่อน)
    .sort((a, b) => Number(b.totalCost) - Number(a.totalCost));

  const grandTotal = round2(rows.reduce((sum, r) => sum + Number(r.totalCost), 0));

  return {
    rows,
    grandTotal: grandTotal.toFixed(2),
    linesWithComponents,
    totalLines: items.length,
  };
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

  // สูตรวัสดุย่อยของบรรทัด: พนักงานส่งมาเอง > สูตรจากแคตตาล็อก (เมื่อไม่ได้ส่ง) > ไม่มี (วัสดุก้อนเดียว).
  // [] ที่ส่งมาชัดเจน = ตั้งใจไม่แตกวัสดุ จึงไม่ดึงสูตรแคตตาล็อกมาแทน
  const components: NormalizedComponent[] =
    input.components !== undefined ? normalizeComponents(input.components) : catalogComponents;
  // มีวัสดุย่อย → ราคาวัสดุต่อหน่วยคิดจากผลรวมของสูตร (แทนค่าที่พิมพ์/มาจากวัสดุ)
  if (components.length > 0) {
    await assertComponentRefsExist(components);
    materialUnitPrice = materialUnitPriceOf(components);
  }

  const laborUnitPrice = defaults.laborUnitPrice ?? 0;

  if (!name || !unit || materialUnitPrice === undefined) {
    throw new BoqError("ต้องระบุ materialId หรือกรอกชื่อ/หน่วย/ราคาวัสดุเอง");
  }

  const qtyBasis = input.qtyBasis ?? "MANUAL";
  const usesDriver = qtyBasis !== "MANUAL";
  // ไม่กรอกเผื่อเสียมา: ฐานอ้างอิงค่าวัดใช้ค่าตั้งต้นของวัสดุ · ฐานกรอกเองไม่มีเผื่อเสีย
  const defaultWaste = usesDriver ? materialWaste : null;
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
  const quantity = effectiveQuantity({
    qtyBasis,
    qtyCoefficient: input.qtyCoefficient ?? null,
    wasteFactorPct,
    manualQuantity: input.quantity ?? 0,
    drivers: resolveDrivers(projectForArea),
  });

  const version = await getOrCreateEditableVersion(projectId, actorId);
  const amounts = calculateLineAmounts({ quantity, materialUnitPrice, laborUnitPrice });
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
      qtyCoefficient: input.qtyCoefficient ?? null,
      wasteFactorPct,
      unit,
      materialUnitPrice,
      materialTotal: amounts.materialTotal,
      laborUnitPrice,
      laborTotal: amounts.laborTotal,
      lineTotal: amounts.lineTotal,
      sortOrder,
      note: input.note ?? null,
      pricedAt: new Date(),
      components: components.length
        ? {
            create: componentCreateRows(components),
          }
        : undefined,
    },
    include: { components: { orderBy: { sortOrder: "asc" } } },
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
    include: { components: { orderBy: { sortOrder: "asc" } } },
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
  const willTouchComponents = input.components !== undefined;
  const nextComponents: NormalizedComponent[] = willTouchComponents
    ? normalizeComponents(input.components ?? [])
    : componentsFromRows(existing.components);
  const hasComponents = nextComponents.length > 0;
  // ตรวจ ref วัสดุดิบเฉพาะเมื่อพนักงานส่งสูตรใหม่มา (ของเดิมผ่านการตรวจตอนสร้างแล้ว)
  if (willTouchComponents && hasComponents) await assertComponentRefsExist(nextComponents);

  const laborUnitPrice = input.laborUnitPrice ?? Number(existing.laborUnitPrice);
  const materialUnitPrice = hasComponents
    ? materialUnitPriceOf(nextComponents)
    : input.materialUnitPrice ?? Number(existing.materialUnitPrice);

  // รวมค่า take-off ใหม่กับของเดิม (undefined = ไม่แก้) แล้วถอดปริมาณใหม่ตามฐานคำนวณ + พื้นที่
  const qtyBasis = input.qtyBasis ?? existing.qtyBasis;
  const qtyCoefficient = mergeTakeoff(input.qtyCoefficient, existing.qtyCoefficient);
  const wasteFactorPct = mergeTakeoff(input.wasteFactorPct, existing.wasteFactorPct);

  const projectForArea = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { houseDesign: true },
  });
  // บรรทัด MANUAL: ใช้ปริมาณที่กรอกมา (หรือค่าเดิม); ฐานอื่น: คิดจากค่าวัด × สัมประสิทธิ์ × เผื่อเสีย
  const quantity = effectiveQuantity({
    qtyBasis,
    qtyCoefficient,
    wasteFactorPct,
    manualQuantity: input.quantity ?? Number(existing.quantity),
    drivers: resolveDrivers(projectForArea),
  });
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
      qtyCoefficient,
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
    },
    include: { components: { orderBy: { sortOrder: "asc" } } },
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
