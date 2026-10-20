import { roundTo } from "./rounding";
/**
 * ใบถอดแบบ (dimension sheet) — ที่มาของ "จำนวน" ในบรรทัด BOQ
 *
 * วิศวกรไม่ได้ได้ปริมาณมาเป็นก้อนเดียว แต่ถอดทีละชิ้นจากแบบ เช่น
 *   F1 × 8 ต้น × 1.20 × 1.20 × 0.30 = 3.456 ลบ.ม.
 * แล้วบวกชิ้นอื่นต่อ และหักช่องเปิด (ประตู/หน้าต่าง) ออกจากงานผนัง
 *
 * หนึ่งแถว = จำนวนชิ้น × ยาว × กว้าง × สูง/หนา (มิติที่เว้นว่าง = ไม่ใช้)
 * แถวเหล็กเส้น = จำนวนเส้น × ยาวต่อเส้น × d²/162 (กก.)
 * ปริมาณของบรรทัด = (ผลรวมแถวบวก − แถวหัก) × (1 + เผื่อเสีย%) ปัด 3 ตำแหน่ง
 *
 * ใช้ทั้งเซิร์ฟเวอร์ (คิดปริมาณที่บันทึกจริง) และหน้าจอ (พรีวิวสด) จึงต้องอยู่ที่นี่ที่เดียว
 */

/** รูปแบบของใบถอดแบบ — บอกว่าแต่ละแถวต้องกรอกมิติอะไรบ้าง (ตามหน่วยของบรรทัด) */
export type TakeoffShape = "COUNT" | "LENGTH" | "AREA" | "VOLUME" | "WEIGHT";

export type TakeoffDimension = "length" | "width" | "height" | "barDia";

export interface TakeoffRowInput {
  /** ชิ้นส่วน/ตำแหน่ง เช่น "F1", "ผนังห้องนอน 1", "ประตู D1" */
  label: string;
  /** จำนวนชิ้น (หรือจำนวนเส้นของแถวเหล็ก) */
  count: number;
  /** ยาว (ม.) */
  length?: number | null;
  /** กว้าง (ม.) */
  width?: number | null;
  /** สูง/หนา/ลึก (ม.) */
  height?: number | null;
  /** ขนาดเหล็กเส้น (มม.) — มีค่า = แถวนี้คิดเป็นน้ำหนัก × d²/162 กก./ม. */
  barDia?: number | null;
  /** true = แถวหัก (ช่องเปิด/ส่วนที่ซ้อน) ลบออกจากผลรวม */
  deduct?: boolean;
  /**
   * แถวที่ได้จากตัวคิดชิ้นส่วนโครงสร้าง — กุญแจของชิ้นส่วน (StructuralMember.key) ในเวอร์ชันเดียวกัน
   * คงเดิมตอนแตกเวอร์ชัน · null/ไม่ส่ง = แถวที่กรอกเอง (ไม่มีขนาดชิ้นส่วนให้คิดซ้ำด้วยชุดกฎอื่น)
   */
  memberKey?: string | null;
}

export const TAKEOFF_SHAPES: { value: TakeoffShape; label: string; dims: TakeoffDimension[] }[] = [
  { value: "COUNT", label: "นับจำนวน", dims: [] },
  { value: "LENGTH", label: "ความยาว", dims: ["length"] },
  { value: "AREA", label: "พื้นที่", dims: ["length", "width"] },
  { value: "VOLUME", label: "ปริมาตร", dims: ["length", "width", "height"] },
  { value: "WEIGHT", label: "น้ำหนักเหล็ก", dims: ["length", "barDia"] },
];

/** จำนวนแถวสูงสุดต่อหนึ่งบรรทัด — ใบถอดแบบของงานบ้านจริงไม่เกินหลักสิบ */
export const TAKEOFF_MAX_ROWS = 300;

// หน่วยเขียนได้หลายแบบ ("ลบ.ม." "ลบม" "คิว" "m3") — ตัดจุด/ช่องว่างแล้วเทียบ
function normalizeUnit(unit: string): string {
  return unit.toLowerCase().replace(/[\s.]/g, "");
}

const VOLUME_UNITS = new Set(["ลบม", "คิว", "m3", "ม3", "ลูกบาศก์เมตร"]);
const AREA_UNITS = new Set(["ตรม", "m2", "ม2", "ตารางเมตร"]);
const LENGTH_UNITS = new Set(["ม", "เมตร", "m", "มเส้น"]);
const KG_UNITS = new Set(["กก", "kg", "กิโลกรัม"]);
const TON_UNITS = new Set(["ตัน", "ton", "t"]);

/** หน่วยนี้เป็นน้ำหนัก (กก./ตัน) ไหม — แถวเหล็กเส้นใส่ได้เฉพาะบรรทัดหน่วยน้ำหนัก */
export function isWeightUnit(unit: string): boolean {
  const u = normalizeUnit(unit);
  return KG_UNITS.has(u) || TON_UNITS.has(u);
}

/** หน่วยนี้เป็นพื้นที่ (ตร.ม.) ไหม — ตัวคิดกระเบื้องใช้ได้เฉพาะบรรทัดหน่วยพื้นที่ */
export function isAreaUnit(unit: string): boolean {
  return AREA_UNITS.has(normalizeUnit(unit));
}

/** รูปแบบตั้งต้นจากหน่วยของบรรทัด */
export function takeoffShapeForUnit(unit: string): TakeoffShape {
  const u = normalizeUnit(unit);
  if (VOLUME_UNITS.has(u)) return "VOLUME";
  if (AREA_UNITS.has(u)) return "AREA";
  if (LENGTH_UNITS.has(u)) return "LENGTH";
  if (KG_UNITS.has(u) || TON_UNITS.has(u)) return "WEIGHT";
  return "COUNT";
}

/**
 * รูปแบบของใบที่มีแถวอยู่แล้ว — ต้องเห็นทุกมิติที่แถวกรอกไว้ ไม่งั้นจะมีตัวเลขที่ถูกคูณอยู่
 * แต่มองไม่เห็นในตาราง (หน่วยบอกว่าเป็น "ชุด" แต่แถวมีกว้าง×ยาว ก็ต้องโชว์เป็นพื้นที่)
 */
export function takeoffShapeOf(
  rows: { length?: unknown; width?: unknown; height?: unknown; barDia?: unknown }[],
  unit: string,
): TakeoffShape {
  if (rows.some((r) => r.barDia != null)) return "WEIGHT";
  const fromUnit = takeoffShapeForUnit(unit);
  if (rows.some((r) => r.height != null)) return "VOLUME";
  if (rows.some((r) => r.width != null)) return fromUnit === "VOLUME" ? "VOLUME" : "AREA";
  if (rows.some((r) => r.length != null)) {
    return fromUnit === "COUNT" || fromUnit === "WEIGHT" ? "LENGTH" : fromUnit;
  }
  return rows.length > 0 && fromUnit === "WEIGHT" ? "COUNT" : fromUnit;
}

function round3(value: number): number {
  return roundTo(value, 3);
}

/** น้ำหนักเหล็กต่อเมตร (กก./ม.) = d²/162 */
function kgPerMetre(diameterMm: number): number {
  return (diameterMm * diameterMm) / 162;
}

/**
 * ค่าของหนึ่งแถว (ไม่ติดเครื่องหมาย) — จำนวน × มิติที่กรอก × (กก./ม. ถ้าเป็นแถวเหล็ก)
 * บรรทัดหน่วย "ตัน" แปลงน้ำหนักจาก กก. ให้
 */
export function takeoffRowValue(row: TakeoffRowInput, unit: string): number {
  let value = row.count;
  for (const dim of [row.length, row.width, row.height]) {
    if (dim != null) value *= dim;
  }
  if (row.barDia != null) {
    value *= kgPerMetre(row.barDia);
    if (TON_UNITS.has(normalizeUnit(unit))) value /= 1000;
  }
  return value;
}

export interface TakeoffSheetTotal {
  /** ผลรวมแถวบวก */
  added: number;
  /** ผลรวมแถวหัก (ค่าบวก) */
  deducted: number;
  /** บวก − หัก (ยังไม่เผื่อเสีย) ปัด 3 ตำแหน่ง */
  net: number;
  /** ปริมาณที่บันทึกลงบรรทัด = สุทธิ × (1 + เผื่อเสีย%) ปัด 3 ตำแหน่ง */
  quantity: number;
}

export function sumTakeoffSheet(
  rows: TakeoffRowInput[],
  unit: string,
  wasteFactorPct: number | null | undefined,
): TakeoffSheetTotal {
  let added = 0;
  let deducted = 0;
  for (const row of rows) {
    const value = takeoffRowValue(row, unit);
    if (row.deduct) deducted += value;
    else added += value;
  }
  const net = added - deducted;
  const waste = 1 + (wasteFactorPct ?? 0) / 100;
  return {
    added: round3(added),
    deducted: round3(deducted),
    net: round3(net),
    quantity: round3(net * waste),
  };
}

// ---------- ตัวคิดชิ้นส่วนโครงสร้าง (ฐานราก / เสา / คาน / พื้น) ----------
//
// ใส่ขนาดหน้าตัด ความยาว และเหล็กครั้งเดียว ได้แถวใบถอดแบบของ 3 งานพร้อมกัน:
// คอนกรีต (ลบ.ม.) · ไม้แบบ (ตร.ม.) · เหล็กเสริมแยกตามขนาด (กก.)
// แถวที่ได้เป็นแถวธรรมดาของใบถอดแบบ — เปิดดู/แก้ทีหลังได้เหมือนแถวที่กรอกเอง

export type StructuralKind = "FOOTING" | "COLUMN" | "BEAM" | "SLAB" | "STAIR";

/**
 * ชนิดฐานราก — MESH = ฐานแผ่ ตะแกรงสองทาง (เดิม) · PILE_CAP = หัวเสาเข็ม: เหล็กยืนเรียงรอบฐาน
 * (งอบน-ล่างเข้าในฐาน) + ปลอกรัดรอบเป็นชั้น ๆ ตามความหนา เช่น F1 "16-DB16 + 2ป-RB6@0.10" (บ้านคุณก้อย แบบ S-06)
 */
export type FootingType = "MESH" | "PILE_CAP";

/** ปลายตะแกรงฐานราก/พื้น — ตรง · งอ bendFactor×d · งอขึ้นถึงผิวบน (ขาสูง = หนา − 2×ระยะหุ้ม เช่น F2 แบบ S-06) */
export type MeshEnd = "STRAIGHT" | "BEND" | "BEND_UP";

export interface BarSet {
  /** จำนวนเส้นต่อหนึ่งชิ้น */
  count: number;
  /** ขนาดเหล็ก (มม.) */
  dia: number;
}

export interface SpacedBars {
  /** ขนาดเหล็ก (มม.) */
  dia: number;
  /** ระยะห่าง (ม.) เช่น 0.15 */
  spacing: number;
}

export interface StructuralSettings {
  /** ระยะหุ้มคอนกรีต (ม.) */
  cover: number;
  /** ระยะทาบ = กี่เท่าของขนาดเหล็ก (40 = 40d) */
  lapFactor: number;
  /** ความยาวเหล็กที่ขายต่อเส้น (ม.) — ยาวกว่านี้ต้องต่อทาบ */
  stockLength: number;
  /** ความยาวขอปลอกต่อข้าง = กี่เท่าของขนาดเหล็ก (ปลอกหนึ่งวงมี 2 ขอ) */
  hookFactor: number;
  /** ส่วนงอปลายเหล็กเสริมหลัก (งอ 90°) ต่อปลาย = กี่เท่าของขนาดเหล็ก — ตะแกรงฐานราก/พื้น เหล็กคาน เหล็กเสา */
  bendFactor: number;
  /** กฎการคิดเหล็ก (ไม่ส่ง = ละเอียดทุกข้อแบบเดิม) — ดู RebarRuleFlags */
  rules?: Partial<RebarRuleFlags>;
}

/**
 * กฎการคิดเหล็กเสริม — มีผลกับเหล็กเท่านั้น คอนกรีต/ไม้แบบคิดเหมือนกันทุกชุด
 * ชุดเสนอราคา (Estimator/QS): ยาวตามแบบ ไม่แตกงอ/ทาบ แล้วเผื่อเสียรายขนาดแทน — แบบที่ BOQ ของบริษัททำอยู่
 * ชุดสั่งตัด (หน้างาน): หักระยะหุ้ม + งอ + ทาบ + ขอปลอก ใกล้ความยาวที่ตัดจริง
 */
export interface RebarRuleFlags {
  /** หักระยะหุ้มคอนกรีต — ปิด = เหล็กหลัก/ตะแกรง/ปลอกวัดตามขนาดชิ้นส่วนเต็ม */
  deductCover: boolean;
  /** บวกงอปลาย bendFactor×d · เสาฝังฐานราก/งอเข้าคาน (ตะแกรงรูปตัว U ที่แบบเขียนไว้ยังงอขึ้นเสมอ) */
  bends: boolean;
  /** บวกระยะทาบเมื่อยาวเกินเหล็กที่ขาย + เสาเผื่อทาบต่อชั้น */
  laps: boolean;
  /** บวกขอปลอก 2 ข้าง */
  hooks: boolean;
  /** นับชั้นปลอกหัวเสาเข็มเต็มความหนา (ไม่หักระยะหุ้มบน-ล่าง) */
  fullDepthLayers: boolean;
}

/** ชุดกฎหนึ่งชุด = กฎ + ค่ามาตรฐาน (ระยะหุ้มไม่อยู่ในนี้ — เป็นค่าตามแบบของแต่ละชิ้นส่วน) */
export interface TakeoffRuleSet extends RebarRuleFlags {
  lapFactor: number;
  bendFactor: number;
  stockLength: number;
  hookFactor: number;
}

/** ชุดกฎสองชุดของบริษัท (ตั้งค่า → ถอดปริมาณ) */
export interface TakeoffRulePresets {
  /** ใช้กับ BOQ/ใบเสนอราคา · wastePct = เผื่อเสียตั้งต้นของบรรทัดเหล็กใหม่ แยกตามขนาด (มม. → %) null = ไม่ใส่ให้ */
  tender: TakeoffRuleSet & { wastePct: Record<string, number | null> };
  /** ใช้กับรายการสั่งเหล็กหน้างาน */
  site: TakeoffRuleSet;
}

const DETAILED_FLAGS: RebarRuleFlags = { deductCover: true, bends: true, laps: true, hooks: true, fullDepthLayers: false };

/**
 * ค่าตั้งต้นของชุดกฎ — เผื่อเสียเอามาจากไฟล์ BOQ จริงของบริษัท (บ้านคุณก้อย Rev2: RB6 5% · RB9 7% · DB12 9% · DB16 11%)
 * ขนาดอื่นไม่มีตัวเลขจริง → null (ไม่เดาให้)
 */
export const DEFAULT_TAKEOFF_RULES: TakeoffRulePresets = {
  tender: {
    deductCover: false,
    bends: false,
    laps: false,
    hooks: false,
    fullDepthLayers: true,
    lapFactor: 40,
    bendFactor: 12,
    stockLength: 10,
    hookFactor: 10,
    wastePct: { "6": 5, "9": 7, "12": 9, "16": 11 },
  },
  site: { ...DETAILED_FLAGS, lapFactor: 40, bendFactor: 12, stockLength: 10, hookFactor: 10 },
};

/** ค่าที่เก็บไว้ (JSON) → ชุดกฎครบทุกช่อง · ช่องที่หาย/ผิดชนิดใช้ค่าตั้งต้น (ค่าเก่าในฐานข้อมูลไม่ทำให้พัง) */
export function normalizeTakeoffRules(raw: unknown): TakeoffRulePresets {
  const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const set = <T extends TakeoffRuleSet>(base: T, v: unknown): T => {
    const o = obj(v);
    const out = { ...base };
    for (const k of ["deductCover", "bends", "laps", "hooks", "fullDepthLayers"] as const) {
      if (typeof o[k] === "boolean") out[k] = o[k] as boolean;
    }
    for (const k of ["lapFactor", "bendFactor", "stockLength", "hookFactor"] as const) {
      const n = o[k];
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) out[k] = n;
    }
    return out;
  };
  const r = obj(raw);
  const tender = set(DEFAULT_TAKEOFF_RULES.tender, r.tender);
  const waste = obj(obj(r.tender).wastePct);
  const wastePct: Record<string, number | null> = { ...DEFAULT_TAKEOFF_RULES.tender.wastePct };
  for (const [dia, v] of Object.entries(waste)) {
    if (!/^\d+$/.test(dia)) continue;
    if (v === null) wastePct[dia] = null;
    else if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100) wastePct[dia] = v;
  }
  return { tender: { ...tender, wastePct }, site: set(DEFAULT_TAKEOFF_RULES.site, r.site) };
}

/** ค่ามาตรฐานของตัวคิดจากชุดกฎ + ระยะหุ้มของชิ้นส่วน */
export function settingsFromRuleSet(rule: TakeoffRuleSet, cover: number): StructuralSettings {
  return {
    cover,
    lapFactor: rule.lapFactor,
    bendFactor: rule.bendFactor,
    stockLength: rule.stockLength,
    hookFactor: rule.hookFactor,
    rules: {
      deductCover: rule.deductCover,
      bends: rule.bends,
      laps: rule.laps,
      hooks: rule.hooks,
      fullDepthLayers: rule.fullDepthLayers,
    },
  };
}

function flagsOf(s: StructuralSettings): RebarRuleFlags {
  return { ...DETAILED_FLAGS, ...s.rules };
}

/** ระยะหุ้มที่ใช้กับ "เหล็ก" — ปิดกฎหักระยะหุ้ม = 0 (คอนกรีต/ไม้แบบไม่เกี่ยว) */
function rebarCover(s: StructuralSettings): number {
  return flagsOf(s).deductCover ? s.cover : 0;
}

/** ปลอกถี่ช่วงปลาย — หัว/โคนเสา หรือปลายคานทั้งสองข้าง (ช่วงกลางใช้ระยะปกติ) */
export interface TieEndZone {
  /** ระยะห่างปลอกช่วงปลาย (ม.) — ถี่กว่าช่วงกลาง */
  spacing: number;
  /** ความยาวช่วงปลาย "ต่อข้าง" (ม.) วัดจากปลายชิ้นส่วน */
  length: number;
}

export interface StructuralInput {
  kind: StructuralKind;
  /** ชื่อชิ้นส่วนตามแบบ เช่น F1, C1, B1, S1 */
  label: string;
  /** จำนวนชิ้นที่เหมือนกัน */
  count: number;
  /** ฐานราก/พื้น: กว้าง · เสา/คาน: กว้างหน้าตัด b (ม.) */
  width: number;
  /** ฐานราก/พื้น: หนา · เสา/คาน: ลึกหน้าตัด h (ม.) */
  depth: number;
  /** ฐานราก/พื้น: ยาว · เสา: สูง · คาน: ยาวรวม (ม.) */
  length: number;
  /** เสา: เหล็กยืน */
  mainBars?: BarSet | null;
  /** คาน: เหล็กบน */
  topBars?: BarSet | null;
  /** คาน: เหล็กล่าง */
  bottomBars?: BarSet | null;
  /** เสา/คาน: ปลอก */
  ties?: SpacedBars | null;
  /** เสา/คาน: ปลอกถี่ช่วงปลาย (null = ระยะเดียวตลอดชิ้น) */
  tieEndZone?: TieEndZone | null;
  /** ฐานราก/พื้น: งอปลายตะแกรงทั้งสองปลาย · คาน: งอปลายเหล็กบน/ล่างเข้าเสาทั้งสองข้าง */
  endBends?: boolean;
  /**
   * ฐานราก: งอขึ้นถึงผิวบน แทนงอ bendFactor×d (ใช้คู่กับ endBends) — แบบที่เขียนเหล็กเป็นรูปตัว U
   * ขาแต่ละข้างสูง หนา − 2×ระยะหุ้ม
   */
  meshBendUp?: boolean;
  /**
   * ฐานราก: ตะแกรงล่างกำหนดเป็น "จำนวนเส้น" แทนระยะห่าง (แบบฐานรากมักเขียน "8-DB16")
   * long = เส้นที่วิ่งตามแนวยาว · short = เส้นที่วิ่งตามแนวกว้าง · ใช้ขนาดเหล็กของ mesh
   */
  meshCount?: { long: number; short: number } | null;
  /** ฐานราก: ชนิด (ไม่ส่ง = MESH) */
  footingType?: FootingType;
  /** หัวเสาเข็ม: ปลอกรัดสองชุดต่อชั้น — สี่เหลี่ยมรอบนอก + ข้าวหลามตัด (เขียนในแบบว่า "2ป") */
  diamondTies?: boolean;
  /** ฐานราก: เหล็กเดือย (dowel) ต่อฐาน — ความยาวต่อเส้นกรอกเองตามแบบ (แบบไม่ได้บอกระยะฝังเสมอไป) */
  dowels?: { count: number; dia: number; length: number } | null;
  /**
   * คาน: เหล็กเสริมพิเศษบนเหนือที่รองรับ (Ext.) — count เส้นต่อจุดรองรับ · ratio = ยาวจากหน้าเสาเข้าช่วง × ช่วงสุทธิ
   * (ตั้งต้น 1/4 = L/4) · จุดรองรับปลายยื่นเข้าช่วงเดียว จุดกลางยื่นสองข้าง · เหล็กตรง ไม่บวกงอ/ทาบ
   */
  extraTop?: { count: number; dia: number; ratio: number } | null;
  /** คาน: เหล็กเสริมพิเศษล่างกลางช่วง — ตัดห่างหน้าเสาข้างละ ratio × ช่วงสุทธิ (ตั้งต้น 1/5 = L/5) · ยาว L − 2×ratio×L */
  extraBottom?: { count: number; dia: number; ratio: number } | null;
  /**
   * บันได: width = กว้าง · depth = ความหนาท้องบันได (ตั้งฉากกับแนวเอียง) · length = ระยะราบ ·
   * rise = ความสูงรวม · steps = จำนวนลูกตั้ง · main = เหล็กหลักวิ่งตามแนวเอียง (เรียงตามความกว้าง) ·
   * distribution = เหล็กกันร้าววิ่งตามความกว้าง (เรียงตามแนวเอียง) — ชานพักใช้ชนิด "พื้น"
   */
  stair?: { rise: number; steps: number; main: SpacedBars | null; distribution: SpacedBars | null } | null;
  /** เสา: ต้นที่ตั้งบนฐานราก — ความหนาฐานราก (ม.) เหล็กยืนฝังลงถึงตะแกรงล่างแล้วงอ (null = ไม่ฝัง) */
  footingDepth?: number | null;
  /** เสา: ชั้นบนสุด — เหล็กยืนงอเข้าคานหลังคาแทนการเผื่อทาบต่อชั้นถัดไป */
  topFloor?: boolean;
  /** ฐานราก/พื้น: ตะแกรงเหล็กสองทาง (ชั้นล่าง หรือชั้นเดียว) */
  mesh?: SpacedBars | null;
  /** ฐานราก/พื้น: ตะแกรงบน — ขนาด/ระยะของตัวเอง (มักต่างจากชั้นล่าง) · null = ตะแกรงชั้นเดียว */
  meshTop?: SpacedBars | null;
  /**
   * คาน: เสาที่คานพาดผ่าน (นับรวมเสาสองปลาย) — คอนกรีต ไม้แบบ และปลอกคิดเฉพาะช่วงสุทธิระหว่างหน้าเสา
   * เพราะเนื้อคอนกรีตในเสาคิดไปกับเสาแล้ว (เสาคิดเต็มความสูง) · เหล็กบน/ล่างยังวิ่งเต็มยาวรวม
   * width = ด้านของเสาที่วัดตามแนวคาน · null = ไม่หัก
   */
  supports?: { count: number; width: number } | null;
  /**
   * คาน: พื้นที่วางบนคาน — คอนกรีตคิดเฉพาะใต้ท้องพื้น (ส่วนบนคิดไปกับพื้นที่คิดเต็มพื้นที่แล้ว)
   * ไม้แบบข้างที่มีพื้นสั้นลงเท่าความหนาพื้น · sides 1 = คานขอบ (พื้นข้างเดียว) · null = ไม่มีพื้นบนคาน
   */
  slabOnTop?: { thickness: number; sides: 1 | 2 } | null;
  /** พื้น: เทบนดิน (ไม่มีไม้แบบท้องพื้น) · คาน: คานคอดินเทบนดิน/คอนกรีตหยาบ (ไม่มีไม้แบบท้องคาน) */
  onGround?: boolean;
  /**
   * พื้น: ไม้แบบขอบพื้น สูงเท่าความหนา — length = ความยาวขอบที่ต้องตั้งแบบต่อหนึ่งแผ่น (ม.)
   * null = รอบรูปเต็ม 2×(กว้าง+ยาว) · ไม่ส่ง = ไม่มีแบบขอบ (ขอบวางบนคานซึ่งเป็นแบบให้อยู่แล้ว)
   */
  edgeForm?: { length: number | null } | null;
  settings: StructuralSettings;
}

export type StructuralOutputGroup = "CONCRETE" | "FORMWORK" | "REBAR";

export interface StructuralOutputRow {
  group: StructuralOutputGroup;
  /** แถวที่จะลงใบถอดแบบของบรรทัดปลายทาง */
  row: TakeoffRowInput;
  /** ค่าของแถว (ลบ.ม. / ตร.ม. / กก.) */
  value: number;
  /** วิธีคิดแบบอ่านออก — โชว์ให้ผู้ใช้ตรวจได้ว่าตัวเลขมาจากไหน */
  explain: string;
}

export interface StructuralTakeoff {
  rows: StructuralOutputRow[];
  /** ข้อมูลที่กรอกไม่ครบ/ผิด — มีค่า = ยังไม่มีแถวให้ */
  errors: string[];
}

export const STRUCTURAL_KINDS: { value: StructuralKind; label: string; prefix: string }[] = [
  { value: "FOOTING", label: "ฐานราก", prefix: "F" },
  { value: "COLUMN", label: "เสา", prefix: "C" },
  { value: "BEAM", label: "คาน", prefix: "B" },
  { value: "SLAB", label: "พื้น", prefix: "S" },
  { value: "STAIR", label: "บันได", prefix: "ST" },
];

/** ระยะหุ้มตั้งต้นตามชนิดชิ้นส่วน (ม.) — แก้ได้ในหน้าจอ */
export const DEFAULT_COVER: Record<StructuralKind, number> = {
  FOOTING: 0.075,
  COLUMN: 0.035,
  BEAM: 0.03,
  SLAB: 0.02,
  STAIR: 0.02,
};

export const DEFAULT_STRUCTURAL_SETTINGS: Omit<StructuralSettings, "cover"> = {
  lapFactor: 40,
  stockLength: 10,
  hookFactor: 10,
  bendFactor: 12,
};

// เลขในคำอธิบาย: ตัดศูนย์ท้าย อ่านง่ายกว่า 0.200
function fmt(value: number, digits = 3): string {
  return String(Number(value.toFixed(digits)));
}

function barCode(dia: number): string {
  // RB = เหล็กกลม (6, 9 มม.) ที่เหลือเป็นข้ออ้อย — ตรงกับ STANDARD_REBARS
  return dia === 6 || dia === 9 ? `RB${dia}` : `DB${dia}`;
}

/** ชื่อเหล็กตามขนาด เช่น 12 → DB12 · 6 → RB6 */
export const rebarCode = barCode;

// ceil ที่ทนเศษทศนิยม: 1.05 / 0.15 ได้ 7.0000000001 ต้องนับเป็น 7 ไม่ใช่ 8
function ceilSafe(value: number): number {
  return Math.ceil(value - 1e-9);
}

/**
 * จำนวนเหล็กที่วางเรียงตามระยะห่างบนความยาว `span` (รวมเส้นที่ปลายทั้งสอง)
 * ระยะห่างในแบบคือ "ไม่เกิน" — ช่วงที่หารไม่ลงตัวต้องเพิ่มอีกเส้น ไม่ใช่ปล่อยช่องสุดท้ายกว้างเกินแบบ
 */
function barsAlong(span: number, spacing: number): number {
  return ceilSafe(span / spacing) + 1;
}

/** ความยาวเหล็กหนึ่งเส้นเมื่อต้องต่อทาบเพราะยาวเกินเหล็กที่ขาย + จำนวนจุดต่อ */
/**
 * ความยาวเหล็กหนึ่งเส้นเมื่อต้องต่อทาบเพราะยาวเกินเหล็กที่ขาย + จำนวนจุดต่อ
 *
 * เส้นที่ต่อเพิ่มแต่ละเส้นได้ความยาวใช้จริงแค่ (ยาวต่อเส้น − ระยะทาบ) เพราะส่วนที่ทาบซ้อนกัน
 * → จุดต่อ = ⌈(ยาวที่ต้องการ − ยาวต่อเส้น) ÷ (ยาวต่อเส้น − ระยะทาบ)⌉
 * เดิมนับ ⌈ยาว ÷ ยาวต่อเส้น⌉ − 1 ซึ่งลืมว่าทาบกินความยาว: คาน 19.8 ม. DB12 นับ 1 จุด
 * แต่เหล็ก 10 ม. สองเส้นทาบกันได้แค่ 19.52 ม. ไม่ถึง — ต้อง 3 เส้น 2 จุด
 */
function withStockLaps(length: number, dia: number, s: StructuralSettings): { length: number; laps: number } {
  if (!flagsOf(s).laps) return { length, laps: 0 };
  const lap = (s.lapFactor * dia) / 1000;
  const laps = length > s.stockLength + 1e-9 ? ceilSafe((length - s.stockLength) / (s.stockLength - lap)) : 0;
  return { length: length + laps * lap, laps };
}

function rebarRow(label: string, totalBars: number, barLength: number, dia: number, explain: string): StructuralOutputRow {
  const row: TakeoffRowInput = { label, count: totalBars, length: round3(barLength), barDia: dia };
  return { group: "REBAR", row, value: totalBars * round3(barLength) * kgPerMetre(dia), explain };
}

function validate(input: StructuralInput): string[] {
  const errors: string[] = [];
  const positive = (v: number | undefined | null) => v != null && Number.isFinite(v) && v > 0;
  if (!positive(input.count) || !Number.isInteger(input.count)) errors.push("จำนวนชิ้นต้องเป็นจำนวนเต็มมากกว่า 0");
  if (!positive(input.width) || !positive(input.depth) || !positive(input.length)) {
    errors.push("กรอกขนาดให้ครบ (มากกว่า 0)");
  }
  const s = input.settings;
  if (!(s.cover >= 0) || !positive(s.lapFactor) || !positive(s.stockLength) || !(s.hookFactor >= 0)) {
    errors.push("ค่ามาตรฐานไม่ถูกต้อง");
  }
  for (const bars of [input.mainBars, input.topBars, input.bottomBars]) {
    if (bars && (!positive(bars.count) || !Number.isInteger(bars.count) || !positive(bars.dia))) {
      errors.push("จำนวนเส้นเหล็กต้องเป็นจำนวนเต็มมากกว่า 0");
    }
  }
  for (const spaced of [input.ties, input.mesh, input.meshTop]) {
    if (spaced && (!positive(spaced.spacing) || !positive(spaced.dia))) {
      errors.push("ระยะห่างเหล็กต้องมากกว่า 0");
    }
  }
  if (!(s.bendFactor >= 0)) errors.push("ค่ามาตรฐานไม่ถูกต้อง");
  // ระยะทาบยาวเท่าเหล็กทั้งเส้น = ต่อกี่เส้นก็ไม่ยาวขึ้น (สูตรจุดต่อหารด้วยศูนย์/ติดลบ)
  const dias = [input.mainBars, input.topBars, input.bottomBars, input.mesh, input.meshTop]
    .map((b) => b?.dia)
    .filter((d): d is number => d != null && Number.isFinite(d));
  if (positive(s.lapFactor) && positive(s.stockLength) && dias.some((d) => (s.lapFactor * d) / 1000 >= s.stockLength)) {
    errors.push("ระยะทาบยาวเท่ากับหรือเกินความยาวเหล็กต่อเส้น — ตรวจค่าระยะทาบหรือเหล็กยาวต่อเส้น");
  }
  const posInt = (v: number | undefined | null) => positive(v) && Number.isInteger(v);
  if (input.dowels && (!posInt(input.dowels.count) || !positive(input.dowels.dia) || !positive(input.dowels.length))) {
    errors.push("เหล็กเดือย: กรอกจำนวน (จำนวนเต็ม) ขนาด และความยาวต่อเส้นให้ครบ");
  }
  for (const [extra, name] of [[input.extraTop, "บน"], [input.extraBottom, "ล่าง"]] as const) {
    if (extra && (!posInt(extra.count) || !positive(extra.dia) || !positive(extra.ratio) || extra.ratio >= 0.5)) {
      errors.push(`เหล็กพิเศษ${name}: กรอกจำนวน (จำนวนเต็ม) ขนาด และสัดส่วนความยาว (น้อยกว่าครึ่งช่วง) ให้ครบ`);
    }
  }
  if (input.kind === "STAIR") {
    const st = input.stair;
    if (!st || !positive(st.rise) || !posInt(st.steps)) errors.push("บันได: กรอกความสูงรวมและจำนวนลูกตั้ง (จำนวนเต็ม) ให้ครบ");
    for (const bars of [st?.main, st?.distribution]) {
      if (bars && (!positive(bars.spacing) || !positive(bars.dia))) errors.push("ระยะห่างเหล็กต้องมากกว่า 0");
    }
  }
  const mc = input.meshCount;
  if (mc && (!positive(mc.long) || !positive(mc.short) || !Number.isInteger(mc.long) || !Number.isInteger(mc.short))) {
    errors.push("จำนวนเส้นตะแกรงต้องเป็นจำนวนเต็มมากกว่า 0 ทั้งสองแนว");
  }
  if (input.edgeForm?.length != null && !positive(input.edgeForm.length)) {
    errors.push("ความยาวขอบพื้นที่ตั้งแบบต้องมากกว่า 0");
  }
  const zone = input.tieEndZone;
  if (zone && (!positive(zone.spacing) || !positive(zone.length))) {
    errors.push("ปลอกช่วงปลาย: กรอกระยะห่างและความยาวช่วงให้ครบ (มากกว่า 0)");
  }
  if (input.footingDepth != null && !positive(input.footingDepth)) {
    errors.push("ความหนาฐานรากต้องมากกว่า 0");
  } else if (input.footingDepth != null && input.footingDepth <= DEFAULT_COVER.FOOTING) {
    errors.push(`ความหนาฐานรากต้องมากกว่าระยะหุ้มฐานราก ${DEFAULT_COVER.FOOTING * 100} ซม.`);
  }
  // ระยะหุ้มกินหน้าตัดจนไม่เหลือที่วางเหล็ก
  if (errors.length === 0 && (input.ties || input.mesh || input.mainBars)) {
    const clearW = input.width - 2 * s.cover;
    const clearD = input.kind === "FOOTING" || input.kind === "SLAB" ? input.length - 2 * s.cover : input.depth - 2 * s.cover;
    // หัวเสาเข็ม: เหล็กยืน/ปลอกอยู่ในความหนาที่หักระยะหุ้มบน-ล่างแล้ว
    const clearH = input.kind === "FOOTING" ? input.depth - 2 * s.cover : 1;
    if (clearW <= 0 || clearD <= 0 || clearH <= 0) errors.push("ระยะหุ้มมากกว่าขนาดชิ้นส่วน");
  }
  const sup = input.supports;
  if (sup && (!positive(sup.count) || !Number.isInteger(sup.count) || !positive(sup.width))) {
    errors.push("เสาที่คานพาดผ่าน: กรอกจำนวนต้น (จำนวนเต็ม) และความกว้างเสาให้ครบ");
  } else if (sup && errors.length === 0 && sup.count * sup.width >= input.length - 1e-9) {
    errors.push("ความกว้างเสารวมกันเท่ากับหรือยาวกว่าคาน — ตรวจยาวรวมหรือจำนวนเสา");
  }
  const slab = input.slabOnTop;
  if (slab && (!positive(slab.thickness) || (slab.sides !== 1 && slab.sides !== 2))) {
    errors.push("พื้นบนคาน: กรอกความหนาพื้นให้ครบ (มากกว่า 0)");
  } else if (slab && errors.length === 0 && slab.thickness >= input.depth - 1e-9) {
    errors.push("พื้นบนคานหนาเท่ากับหรือมากกว่าความลึกคาน");
  }
  // คาน: เหล็กบน/ล่างหักระยะหุ้มปลายสองข้างจากยาวรวม — สั้นกว่านั้นไม่เหลือเหล็ก
  if (errors.length === 0 && input.kind === "BEAM" && (input.topBars || input.bottomBars) && input.length <= 2 * s.cover) {
    errors.push("ยาวรวมของคานต้องมากกว่าระยะหุ้มปลายสองข้าง");
  }
  return errors;
}

/** คอนกรีตหนึ่งแถว — คานส่งช่วงสุทธิ/ความลึกใต้ท้องพื้นมาแทนขนาดเต็ม (note บอกว่าหักอะไรไป) */
function concreteRow(
  input: StructuralInput,
  name: string,
  length = input.length,
  depth = input.depth,
  note = "",
): StructuralOutputRow {
  const { count, width } = input;
  const value = count * width * depth * length;
  return {
    group: "CONCRETE",
    row: { label: `${input.label} ${name}`, count, length: round3(length), width, height: round3(depth) },
    value,
    explain: `${count} × ${fmt(width)} × ${fmt(depth)} × ${fmt(length)} = ${fmt(value)} ลบ.ม.${note}`,
  };
}

/**
 * จำนวนปลอกต่อชิ้น — ระยะเดียวตลอด หรือถี่ที่ปลายทั้งสองข้างแล้วห่างช่วงกลาง
 * ปลอกที่รอยต่อช่วงนับในช่วงปลาย ช่วงกลางนับเฉพาะวงที่อยู่ระหว่างรอยต่อ (ไม่นับซ้ำ)
 */
function tieCount(along: number, spacing: number, zone: TieEndZone | null | undefined): { count: number; explain: string } {
  if (!zone) {
    const count = barsAlong(along, spacing);
    return { count, explain: `${fmt(along)} ÷ ${fmt(spacing)} ปัดขึ้น + 1 = ${count} วง` };
  }
  // ช่วงปลายสองข้างยาวรวมเกินชิ้น = ถี่ตลอดทั้งชิ้น
  if (2 * zone.length >= along - 1e-9) {
    const count = barsAlong(along, zone.spacing);
    return { count, explain: `ช่วงปลายคลุมทั้งชิ้น ${fmt(along)} ÷ ${fmt(zone.spacing)} ปัดขึ้น + 1 = ${count} วง` };
  }
  const perEnd = barsAlong(zone.length, zone.spacing);
  const middleSpan = along - 2 * zone.length;
  const middle = Math.max(0, ceilSafe(middleSpan / spacing) - 1);
  const count = 2 * perEnd + middle;
  return {
    count,
    explain:
      `ปลาย 2 × (${fmt(zone.length)} ÷ ${fmt(zone.spacing)} ปัดขึ้น + 1 = ${perEnd}) + ` +
      `กลาง ${fmt(middleSpan)} ÷ ${fmt(spacing)} ปัดขึ้น − 1 = ${middle} → ${count} วง`,
  };
}

/** ปลอกหนึ่งวง = เส้นรอบในระยะหุ้ม + ขอ 2 ข้าง */
function tieRows(input: StructuralInput, along: number, alongLabel: string): StructuralOutputRow[] {
  if (!input.ties) return [];
  const s = input.settings;
  const { dia, spacing } = input.ties;
  const zone = input.tieEndZone ?? null;
  const { count: perPiece, explain: countExplain } = tieCount(along, spacing, zone);
  const c = rebarCover(s);
  const inner = 2 * (input.width - 2 * c + (input.depth - 2 * c));
  const hooks = flagsOf(s).hooks ? (2 * s.hookFactor * dia) / 1000 : 0;
  const loop = inner + hooks;
  const total = perPiece * input.count;
  const spacingLabel = zone ? `${fmt(zone.spacing, 3)}/${fmt(spacing, 3)}` : fmt(spacing, 3);
  return [
    rebarRow(
      `${input.label} ปลอก ${barCode(dia)}@${spacingLabel}`,
      total,
      loop,
      dia,
      `${alongLabel} ${countExplain}/ชิ้น × ${input.count} ชิ้น = ${total} วง · ` +
        `ยาววงละ ${c > 0 ? "" : "รอบนอก "}2×(${fmt(input.width - 2 * c)}+${fmt(input.depth - 2 * c)})` +
        `${hooks > 0 ? ` + ขอ 2×${s.hookFactor}d` : ""} = ${fmt(loop)} ม.`,
    ),
  ];
}

/**
 * ตะแกรงสองทาง (ฐานราก/พื้น) — แยกแถวตามแนว เพราะความยาวเส้นต่างกัน
 * มีตะแกรงบนด้วย = แยกชื่อชั้นล่าง/บน (ชั้นเดียวคงชื่อเดิม "ตะแกรงแนว…")
 */
function meshRows(input: StructuralInput): StructuralOutputRow[] {
  const layers: [SpacedBars, string][] = [];
  if (input.mesh) layers.push([input.mesh, input.meshTop ? "ล่าง" : ""]);
  if (input.meshTop) layers.push([input.meshTop, "บน"]);
  return layers.flatMap(([mesh, layer]) => meshLayerRows(input, mesh, layer));
}

function meshLayerRows(input: StructuralInput, mesh: SpacedBars, layer: string): StructuralOutputRow[] {
  const s = input.settings;
  const { dia, spacing } = mesh;
  const c = rebarCover(s);
  const clearWidth = input.width - 2 * c;
  const clearLength = input.length - 2 * c;
  // จำนวนเส้นตามแบบ — ใช้กับตะแกรงล่างของฐานรากเท่านั้น (ชั้นบนยังกำหนดด้วยระยะ)
  const counts = layer !== "บน" && input.kind === "FOOTING" ? input.meshCount ?? null : null;
  const dirs = [
    { name: "แนวยาว", across: clearWidth, barLen: clearLength, fixed: counts?.long ?? null },
    { name: "แนวกว้าง", across: clearLength, barLen: clearWidth, fixed: counts?.short ?? null },
  ];
  // งอขึ้นถึงผิวบน = ขาสูงเท่าความหนาในระยะหุ้ม (ฐานรากเท่านั้น) · ไม่งั้นงอ bendFactor×d
  // ขาตัว U เป็นรูปทรงที่แบบเขียนไว้ — งอเสมอ · งอ 12d เป็นกฎการคิด (ปิดได้ในชุดเสนอราคา)
  const bendUp = input.endBends && input.meshBendUp && input.kind === "FOOTING";
  const leg = bendUp ? input.depth - 2 * c : (s.bendFactor * dia) / 1000;
  const bends = input.endBends && (bendUp || flagsOf(s).bends) ? 2 * leg : 0;
  const bendNote = bendUp ? `งอขึ้นถึงผิวบน 2×${fmt(leg)}` : `งอปลาย 2×${s.bendFactor}d`;
  return dirs.map((d) => {
    const perPiece = d.fixed ?? barsAlong(d.across, spacing);
    const total = perPiece * input.count;
    const lapped = withStockLaps(d.barLen + bends, dia, s);
    const notes = [bends > 0 ? bendNote : null, lapped.laps > 0 ? `ทาบ ${lapped.laps}×${s.lapFactor}d` : null].filter(Boolean);
    const countExplain =
      d.fixed != null
        ? `${d.fixed} เส้นตามแบบ/ชิ้น × ${input.count} = ${total} เส้น`
        : `${fmt(d.across)} ÷ ${fmt(spacing)} ปัดขึ้น + 1 = ${perPiece} เส้น/ชิ้น × ${input.count} = ${total} เส้น`;
    return rebarRow(
      `${input.label} ตะแกรง${layer}${d.name} ${d.fixed != null ? `${d.fixed}-${barCode(dia)}` : `${barCode(dia)}@${fmt(spacing, 3)}`}`,
      total,
      lapped.length,
      dia,
      `${countExplain} · ยาวเส้นละ ${fmt(d.barLen)}${notes.length ? ` + ${notes.join(" + ")}` : ""} = ${fmt(lapped.length)} ม.`,
    );
  });
}

/**
 * หัวเสาเข็ม — เหล็กยืนเรียงรอบฐาน (สูงในระยะหุ้มบน-ล่าง + งอเข้าในฐานทั้งบนและล่าง bendFactor×d)
 * และปลอกรัดรอบเป็นชั้นตามความหนา (ชุดสี่เหลี่ยม + ข้าวหลามตัดถ้าแบบเขียน "2ป")
 */
function pileCapRows(input: StructuralInput): StructuralOutputRow[] {
  const s = input.settings;
  const rows: StructuralOutputRow[] = [];
  const f = flagsOf(s);
  const c = rebarCover(s);
  const clearW = input.width - 2 * c;
  const clearL = input.length - 2 * c;
  const clearH = input.depth - 2 * c;
  if (input.mainBars) {
    const { count, dia } = input.mainBars;
    const bend = f.bends ? (s.bendFactor * dia) / 1000 : 0;
    const barLen = clearH + 2 * bend;
    const total = count * input.count;
    rows.push(
      rebarRow(
        `${input.label} เหล็กยืนรอบฐาน ${count}-${barCode(dia)}`,
        total,
        barLen,
        dia,
        `${count} เส้น × ${input.count} ชิ้น = ${total} เส้น · ยาวเส้นละ หนา ${fmt(input.depth)}` +
          `${c > 0 ? ` − หุ้มบนล่าง 2×${fmt(c)}` : ""}${bend > 0 ? ` + งอบนล่าง 2×${s.bendFactor}d` : ""} = ${fmt(barLen)} ม.`,
      ),
    );
  }
  if (input.ties) {
    const { dia, spacing } = input.ties;
    const hooks = f.hooks ? (2 * s.hookFactor * dia) / 1000 : 0;
    // ชั้นปลอกนับในความหนาที่หักระยะหุ้ม หรือเต็มความหนา (ตามชุดกฎ)
    const layerSpan = f.fullDepthLayers ? input.depth : input.depth - 2 * s.cover;
    const layers = barsAlong(layerSpan, spacing);
    const total = layers * input.count;
    const loops: [string, number, string][] = [
      ["ปลอกรัดรอบ", 2 * (clearW + clearL) + hooks, `2×(${fmt(clearW)}+${fmt(clearL)})`],
    ];
    if (input.diamondTies) {
      // ข้าวหลามตัดเชื่อมกึ่งกลางด้านของปลอกสี่เหลี่ยม — ด้านละ √((กว้าง/2)² + (ยาว/2)²)
      const side = Math.hypot(clearW / 2, clearL / 2);
      loops.push(["ปลอกข้าวหลามตัด", 4 * side + hooks, `4×${fmt(side)}`]);
    }
    for (const [name, loop, shape] of loops) {
      rows.push(
        rebarRow(
          `${input.label} ${name} ${barCode(dia)}@${fmt(spacing, 3)}`,
          total,
          loop,
          dia,
          `${f.fullDepthLayers ? "หนาเต็ม" : "สูงในหุ้ม"} ${fmt(layerSpan)} ÷ ${fmt(spacing)} ปัดขึ้น + 1 = ${layers} ชั้น/ชิ้น × ${input.count} = ${total} วง · ` +
            `ยาววงละ ${shape}${hooks > 0 ? ` + ขอ 2×${s.hookFactor}d` : ""} = ${fmt(loop)} ม.`,
        ),
      );
    }
  }
  return rows;
}

/** เหล็กยาวตามชิ้นส่วน (เหล็กยืนเสา / เหล็กบน-ล่างคาน) */
function longBarRows(input: StructuralInput, bars: BarSet | null | undefined, name: string): StructuralOutputRow[] {
  if (!bars) return [];
  const s = input.settings;
  const f = flagsOf(s);
  const bend = (s.bendFactor * bars.dia) / 1000;
  const lap = (s.lapFactor * bars.dia) / 1000;
  // คาน: "ยาวรวม" วัดถึงผิวนอกเสาทั้งสองข้าง (คอนกรีตยาวเท่านั้น) — เหล็กสุดได้แค่ใต้ผิวคอนกรีต
  // จึงหักระยะหุ้มปลายทั้งสองข้างก่อนบวกส่วนงอ เดิมไม่หัก เหล็กยาวเกินคอนกรีตเส้นละ 2 × ระยะหุ้ม
  const coverCut = input.kind === "BEAM" ? 2 * rebarCover(s) : 0;
  // ส่วนที่ต่อจากความยาวชิ้นส่วน — แต่ละรายการคือ [ความยาว (ม.), คำอธิบาย]
  const extras: [number, string][] = [];
  if (input.kind === "COLUMN") {
    if (input.footingDepth != null && f.bends) {
      // ฝังลงฐานรากถึงตะแกรงล่าง (หักระยะหุ้มฐานราก) แล้วงอวางบนตะแกรง
      const embed = input.footingDepth - DEFAULT_COVER.FOOTING;
      extras.push([embed, `ฝังฐานราก ${fmt(embed)}`], [bend, `งอในฐานราก ${s.bendFactor}d`]);
    }
    // ชั้นบนสุดงอเข้าคานหลังคา · ชั้นอื่นเผื่อระยะทาบกับเสาชั้นถัดไป (ชุดเสนอราคาไม่บวกทั้งคู่)
    if (input.topFloor) {
      if (f.bends) extras.push([bend, `งอเข้าคาน ${s.bendFactor}d`]);
    } else if (f.laps) {
      extras.push([lap, `ทาบต่อชั้น ${s.lapFactor}d`]);
    }
  } else if (input.endBends && f.bends) {
    extras.push([2 * bend, `งอปลาย 2×${s.bendFactor}d`]);
  }
  const lapped = withStockLaps(input.length - coverCut + extras.reduce((n, [len]) => n + len, 0), bars.dia, s);
  if (lapped.laps > 0) extras.push([0, `ทาบ ${lapped.laps}×${s.lapFactor}d`]);
  const barLen = lapped.length;
  const total = bars.count * input.count;
  const notes = extras.map(([, note]) => note);
  return [
    rebarRow(
      `${input.label} ${name} ${bars.count}-${barCode(bars.dia)}`,
      total,
      barLen,
      bars.dia,
      `${bars.count} เส้น × ${input.count} ชิ้น = ${total} เส้น · ยาวเส้นละ ${fmt(input.length)}` +
        `${coverCut > 0 ? ` − หุ้มปลาย 2×${fmt(s.cover)}` : ""}` +
        `${extras.length === 0 && coverCut === 0 ? " (ยาวตามแบบ)" : ""}` +
        `${notes.length ? ` + ${notes.join(" + ")}` : ""} = ${fmt(barLen)} ม.`,
    ),
  ];
}

function formworkRow(label: string, count: number, length: number, width: number, explainWidth: string): StructuralOutputRow {
  const value = count * length * width;
  return {
    group: "FORMWORK",
    row: { label, count, length: round3(length), width: round3(width) },
    value,
    explain: `${count} × ยาว ${fmt(length)} × ${explainWidth} = ${fmt(value)} ตร.ม.`,
  };
}

/** เหล็กเดือยฐานราก — ความยาวตามที่กรอก (ไม่ขึ้นกับชุดกฎ เพราะเป็นค่าตามแบบโดยตรง) */
function dowelRows(input: StructuralInput): StructuralOutputRow[] {
  const dw = input.dowels;
  if (!dw) return [];
  const total = dw.count * input.count;
  return [
    rebarRow(
      `${input.label} เหล็กเดือย ${dw.count}-${barCode(dw.dia)}`,
      total,
      dw.length,
      dw.dia,
      `${dw.count} เส้น × ${input.count} ฐาน = ${total} เส้น · ยาวเส้นละ ${fmt(dw.length)} ม. ตามแบบ`,
    ),
  ];
}

/**
 * เหล็กเสริมพิเศษคาน (Ext.) — คิดต่อช่วง: จุดรองรับ = จำนวนเสาที่พาดผ่าน (ไม่กรอก = 2 ปลาย) ช่วง = จุดรองรับ − 1
 * บน: ปลายยื่นเข้าช่วง ratio×ช่วง · จุดกลางยื่นสองข้าง 2×ratio×ช่วง · ล่าง: กลางช่วง ยาวช่วง × (1 − 2×ratio)
 * เหล็กตรง — ระยะฝังเกินหน้าเสาให้เผื่อด้วย % เผื่อเสียของบรรทัด
 */
function beamExtraRows(input: StructuralInput, clear: number): StructuralOutputRow[] {
  const rows: StructuralOutputRow[] = [];
  const supports = Math.max(input.supports?.count ?? 2, 2);
  const spans = supports - 1;
  const span = clear / spans;
  const frac = (r: number) => {
    const inv = 1 / r;
    return Number.isInteger(Math.round(inv * 1000) / 1000) ? `L/${Math.round(inv)}` : `${fmt(r)}L`;
  };
  const top = input.extraTop;
  if (top) {
    const endLen = top.ratio * span;
    const endTotal = top.count * 2 * input.count;
    rows.push(
      rebarRow(
        `${input.label} เหล็กพิเศษบน ${top.count}-${barCode(top.dia)} ปลาย`,
        endTotal,
        endLen,
        top.dia,
        `${top.count} เส้น × ปลาย 2 จุด × ${input.count} ชิ้น = ${endTotal} เส้น · ยาว ${frac(top.ratio)} = ${fmt(top.ratio)} × ช่วง ${fmt(span)} = ${fmt(endLen)} ม.`,
      ),
    );
    if (supports > 2) {
      const midTotal = top.count * (supports - 2) * input.count;
      rows.push(
        rebarRow(
          `${input.label} เหล็กพิเศษบน ${top.count}-${barCode(top.dia)} กลาง`,
          midTotal,
          2 * endLen,
          top.dia,
          `${top.count} เส้น × จุดรองรับกลาง ${supports - 2} จุด × ${input.count} ชิ้น = ${midTotal} เส้น · ยื่นสองข้าง 2 × ${fmt(endLen)} = ${fmt(2 * endLen)} ม.`,
        ),
      );
    }
  }
  const bottom = input.extraBottom;
  if (bottom) {
    const len = span * (1 - 2 * bottom.ratio);
    const total = bottom.count * spans * input.count;
    rows.push(
      rebarRow(
        `${input.label} เหล็กพิเศษล่าง ${bottom.count}-${barCode(bottom.dia)}`,
        total,
        len,
        bottom.dia,
        `${bottom.count} เส้น × ${spans} ช่วง × ${input.count} ชิ้น = ${total} เส้น · กลางช่วง ${fmt(span)} − 2×${frac(bottom.ratio)} = ${fmt(len)} ม.`,
      ),
    );
  }
  return rows;
}

/** บันไดท้องเรียบ + ขั้น — ดูความหมายช่องที่ StructuralInput.stair */
function stairRows(input: StructuralInput): StructuralOutputRow[] {
  const st = input.stair!;
  const s = input.settings;
  const { count, width: w, depth: t, length: run, label } = input;
  const slope = Math.hypot(run, st.rise);
  const tread = run / st.steps;
  const riser = st.rise / st.steps;
  const rows: StructuralOutputRow[] = [];
  const waist = count * w * t * slope;
  const stepsVol = count * st.steps * 0.5 * tread * riser * w;
  rows.push({
    group: "CONCRETE",
    row: { label: `${label} ท้องบันได`, count, length: round3(slope), width: w, height: t },
    value: waist,
    explain: `${count} × กว้าง ${fmt(w)} × หนา ${fmt(t)} × ยาวเอียง √(${fmt(run)}²+${fmt(st.rise)}²) = ${fmt(slope)} → ${fmt(waist)} ลบ.ม.`,
  });
  rows.push({
    // ขั้นสามเหลี่ยม: ½ × ลูกนอน × ลูกตั้ง × กว้าง (เก็บเป็นแถวปริมาตรที่ height = ครึ่งลูกตั้ง)
    group: "CONCRETE",
    row: { label: `${label} ขั้นบันได`, count: count * st.steps, length: round3(tread), width: w, height: round3(riser / 2) },
    value: stepsVol,
    explain: `${st.steps} ขั้น × ${count} × ½ × ลูกนอน ${fmt(tread)} × ลูกตั้ง ${fmt(riser)} × กว้าง ${fmt(w)} = ${fmt(stepsVol)} ลบ.ม.`,
  });
  rows.push(formworkRow(`${label} แบบท้องบันได`, count, slope, w, `กว้าง ${fmt(w)} (ยาวเอียง ${fmt(slope)})`));
  rows.push(formworkRow(`${label} แบบลูกตั้ง`, count * st.steps, w, riser, `สูงลูกตั้ง ${fmt(riser)} (${st.steps} ขั้น)`));
  const sideArea = t * slope + st.steps * 0.5 * tread * riser;
  rows.push(formworkRow(`${label} แบบข้างบันได 2 ข้าง`, count * 2, 1, sideArea, `พื้นที่ข้าง ${fmt(t)}×${fmt(slope)} + ขั้น ${st.steps}×½×${fmt(tread)}×${fmt(riser)} = ${fmt(sideArea)}`));
  const c = rebarCover(s);
  const f = flagsOf(s);
  if (st.main) {
    const { dia, spacing } = st.main;
    const per = barsAlong(w - 2 * c, spacing);
    const total = per * count;
    const bends = f.bends ? (2 * s.bendFactor * dia) / 1000 : 0;
    const lapped = withStockLaps(slope - 2 * c + bends, dia, s);
    const notes = [c > 0 ? `− หุ้ม 2×${fmt(c)}` : null, bends > 0 ? `+ งอปลาย 2×${s.bendFactor}d` : null, lapped.laps > 0 ? `+ ทาบ ${lapped.laps}×${s.lapFactor}d` : null].filter(Boolean);
    rows.push(
      rebarRow(
        `${label} เหล็กหลัก ${barCode(dia)}@${fmt(spacing, 3)}`,
        total,
        lapped.length,
        dia,
        `${fmt(w - 2 * c)} ÷ ${fmt(spacing)} ปัดขึ้น + 1 = ${per} เส้น × ${count} = ${total} เส้น · ยาวเอียง ${fmt(slope)}${notes.length ? ` ${notes.join(" ")}` : ""} = ${fmt(lapped.length)} ม.`,
      ),
    );
  }
  if (st.distribution) {
    const { dia, spacing } = st.distribution;
    const per = barsAlong(slope - 2 * c, spacing);
    const total = per * count;
    rows.push(
      rebarRow(
        `${label} เหล็กกันร้าว ${barCode(dia)}@${fmt(spacing, 3)}`,
        total,
        w - 2 * c,
        dia,
        `${fmt(slope - 2 * c)} ÷ ${fmt(spacing)} ปัดขึ้น + 1 = ${per} เส้น × ${count} = ${total} เส้น · ยาวเส้นละ ${fmt(w - 2 * c)} ม.`,
      ),
    );
  }
  return rows;
}

/** ถอดปริมาณคอนกรีต/ไม้แบบ/เหล็ก ของชิ้นส่วนโครงสร้างหนึ่งแบบ */
export function structuralTakeoff(input: StructuralInput): StructuralTakeoff {
  const errors = validate(input);
  if (errors.length > 0) return { rows: [], errors };

  const { kind, count, width: w, depth: d, length: l, label } = input;
  const rows: StructuralOutputRow[] = [];

  if (kind === "FOOTING") {
    rows.push(concreteRow(input, "ฐานราก"));
    rows.push(formworkRow(`${label} แบบข้างฐานราก`, count, 2 * (w + l), d, `สูง ${fmt(d)} (รอบรูป 2×(${fmt(w)}+${fmt(l)}))`));
    rows.push(...(input.footingType === "PILE_CAP" ? pileCapRows(input) : meshRows(input)));
    rows.push(...dowelRows(input));
  } else if (kind === "COLUMN") {
    rows.push(concreteRow(input, "เสา"));
    rows.push(formworkRow(`${label} แบบเสา 4 ด้าน`, count, l, 2 * (w + d), `รอบเสา 2×(${fmt(w)}+${fmt(d)})`));
    rows.push(...longBarRows(input, input.mainBars, "เหล็กยืน"));
    rows.push(...tieRows(input, l, "สูง"));
  } else if (kind === "BEAM") {
    // ช่วงสุทธิระหว่างหน้าเสา + ความลึกใต้ท้องพื้น — ส่วนที่ซ้อนคิดไปกับเสา/พื้นแล้ว ไม่นับซ้ำ
    const sup = input.supports;
    const slab = input.slabOnTop;
    const clear = sup ? l - sup.count * sup.width : l;
    const below = slab ? d - slab.thickness : d;
    const notes = [
      sup ? `ช่วงสุทธิ ${fmt(l)} − เสา ${sup.count}×${fmt(sup.width)} = ${fmt(clear)}` : null,
      slab ? `ใต้ท้องพื้น ${fmt(d)} − พื้น ${fmt(slab.thickness)} = ${fmt(below)}` : null,
    ].filter(Boolean);
    rows.push(concreteRow(input, "คาน", clear, below, notes.length ? ` (${notes.join(" · ")})` : ""));
    // ข้างที่มีพื้นวาง ไม้แบบสูงแค่ใต้ท้องพื้น · ข้างที่ไม่มี (ขอบนอกของคานขอบ) สูงเต็มความลึก
    const slabSides = slab?.sides ?? 0;
    const sideHeight = slabSides * below + (2 - slabSides) * d;
    const sideExplain =
      slabSides === 2 ? `ข้าง 2×${fmt(below)}` : slabSides === 1 ? `ข้าง ${fmt(below)} + ${fmt(d)}` : `ข้าง 2×${fmt(d)}`;
    // คานคอดินเทบนดิน/คอนกรีตหยาบ — ไม่ตั้งแบบท้องคาน
    if (input.onGround) {
      rows.push(formworkRow(`${label} แบบข้างคาน`, count, clear, sideHeight, `(${sideExplain} · เทบนดิน ไม่มีท้อง)`));
    } else {
      rows.push(formworkRow(`${label} แบบข้าง+ท้องคาน`, count, clear, sideHeight + w, `(${sideExplain} + ท้อง ${fmt(w)})`));
    }
    rows.push(...longBarRows(input, input.topBars, "เหล็กบน"));
    rows.push(...longBarRows(input, input.bottomBars, "เหล็กล่าง"));
    rows.push(...beamExtraRows(input, clear));
    // ปลอกในช่วงที่อยู่ในเสาเป็นปลอกของเสา — คานนับเฉพาะช่วงสุทธิ (ช่วงปลายถี่วัดจากหน้าเสา)
    rows.push(...tieRows(input, clear, sup ? "ช่วงสุทธิ" : "ยาว"));
  } else if (kind === "STAIR") {
    rows.push(...stairRows(input));
  } else {
    rows.push(concreteRow(input, "พื้น"));
    if (!input.onGround) {
      rows.push(formworkRow(`${label} แบบท้องพื้น`, count, l, w, `กว้าง ${fmt(w)}`));
    }
    if (input.edgeForm) {
      const edge = input.edgeForm.length ?? 2 * (w + l);
      const edgeExplain = input.edgeForm.length == null ? ` (รอบรูป 2×(${fmt(w)}+${fmt(l)}))` : "";
      rows.push(formworkRow(`${label} แบบขอบพื้น`, count, edge, d, `สูง ${fmt(d)}${edgeExplain}`));
    }
    rows.push(...meshRows(input));
  }
  return { rows, errors: [] };
}
