/**
 * ตัวคิดกระเบื้อง — จากขนาดห้องและขนาดแผ่น ได้จำนวนแผ่น/กล่อง ปูนกาว ยาแนว คิ้ว
 *
 * ทำไมไม่ใช้ "พื้นที่ ÷ พื้นที่แผ่น": ทุกแถวที่ชนผนังต้องตัดแผ่น และเศษที่ตัดเหลือใช้ได้เฉพาะเมื่อ
 * ยาวพอสำหรับชิ้นถัดไป ห้องเล็กจึงใช้แผ่นมากกว่าที่หารพื้นที่ได้ชัดเจน (ห้องน้ำ 1.5 × 2 ม. ปู 60×60
 * หารพื้นที่ได้ 8.3 แผ่น แต่ปูจริงต้องใช้ 10) — ตัวคิดนี้จึงนับเป็นแถวตามแนวปูจริงทีละห้อง
 *
 * วิธีนับ (ปูตรง เริ่มจากมุมห้อง):
 *   แต่ละแนว: แผ่นเต็ม = ⌊(ยาว + ร่อง) ÷ (แผ่น + ร่อง)⌋ · เศษ = ยาว − แผ่นเต็ม × (แผ่น + ร่อง)
 *   แผ่นเต็ม × แผ่นเต็ม + แถบตัดขอบสองด้าน + ชิ้นมุม
 *   แถบตัด: หนึ่งแผ่นตัดได้ ⌊(แผ่น + 3 มม.) ÷ (เศษ + 3 มม.)⌋ ชิ้น (3 มม. = เนื้อที่ใบตัดกิน)
 *   ห้องที่เหมือนกันหลายห้องใช้เศษร่วมกันได้
 *   ช่องหัก (เคาน์เตอร์/ฐานที่ไม่ปู): คืนเฉพาะแผ่นเต็มที่อยู่ในช่องแน่ ๆ ไม่ว่าแนวปูจะตกตรงไหน
 *
 * ลายทแยง/ก้างปลา หรือไม่มีขนาดห้อง: คิดจากพื้นที่ ÷ (แผ่น + ร่อง)² แล้วบวกเผื่อเศษตัดตามรูปแบบ
 *
 * เผื่อสองชั้น: "เผื่อเศษตัด" ระบบใส่ให้เองเฉพาะตอนนับตามแนวปูไม่ได้ (นับแล้วเศษตัดอยู่ในจำนวนแล้ว)
 * ส่วน "เผื่อแตกหัก" ผู้ใช้ตั้งเอง — แยกกันเพื่อให้บรรทัดเดียวกันย้ายไปคิดจากพื้นที่ (เช่น บันทึกเป็นแม่แบบ)
 * แล้วไม่เผื่อขาด
 *
 * ใช้ทั้งเซิร์ฟเวอร์ (คิดวัสดุย่อยที่บันทึกจริง) และหน้าจอ (พรีวิวสด) จึงต้องอยู่ที่นี่ที่เดียว
 */

import type { TakeoffRowInput } from "./takeoff";
import { roundTo } from "./rounding";

export type TilePattern = "STRAIGHT" | "DIAGONAL" | "HERRINGBONE";
/** ราคากระเบื้องที่กรอก — ต่อ ตร.ม. / ต่อกล่อง / ต่อแผ่น (ร้านบอกราคาได้ทั้งสามแบบ) */
export type TilePriceUnit = "SQM" | "BOX" | "PIECE";

export interface TileAdhesive {
  /** ปูนกาวที่ใช้ต่อ ตร.ม. (กก.) — ตามขนาดเกรียงที่ฉลากถุงบอก */
  kgPerSqm: number;
  /** กก. ต่อถุง */
  bagKg: number;
  /** เผื่อ (%) */
  wastePct: number;
  /** บาทต่อถุง — null = ยังไม่รู้ราคา */
  pricePerBag: number | null;
}

export interface TileGrout {
  /** กก. ต่อถุง */
  packKg: number;
  wastePct: number;
  pricePerPack: number | null;
}

export interface TileTrim {
  /** ความยาวขอบที่ต้องจบด้วยคิ้วรวม (ม.) */
  lengthM: number;
  /** ความยาวต่อเส้น (ม.) */
  pieceLengthM: number;
  pricePerPiece: number | null;
}

/** ค่าที่กรอกในตัวคิด — เก็บติดบรรทัด BOQ (ตรึงไปกับเวอร์ชัน) เพื่อเปิดแก้และคิดใหม่ได้ */
export interface TileCalcConfig {
  /** วัสดุในคลังที่หยิบขนาดแผ่นมา (ไว้บอกที่มา) */
  sourceMaterialId: string | null;
  /** ชื่อกระเบื้องที่จะขึ้นในวัสดุย่อย/รายการสั่งซื้อ — ว่าง = ใช้ "กระเบื้อง กว้าง×ยาว มม." */
  tileName: string;
  widthMm: number;
  lengthMm: number;
  /** ความหนาแผ่น = ความลึกร่องยาแนว */
  thicknessMm: number;
  /** ความกว้างร่องยาแนว */
  jointMm: number;
  /** แผ่นต่อกล่อง — null = ไม่ทราบ (สั่งเป็นแผ่น) */
  piecesPerBox: number | null;
  /** วางด้านยาวของแผ่นตามแนว "กว้าง" ของห้อง (ตั้งต้น: ด้านยาวของแผ่นตามด้านยาวของห้อง) */
  rotate: boolean;
  pattern: TilePattern;
  /** เผื่อแตกหัก/สำรองไว้ซ่อม (%) — เผื่อเศษตัดระบบคิดให้แยก ดู tileCutAllowancePct */
  wastePct: number;
  adhesive: TileAdhesive | null;
  grout: TileGrout | null;
  trim: TileTrim | null;
  tilePrice: number | null;
  tilePriceUnit: TilePriceUnit;
  /** true = ราคาวัสดุของบรรทัดคิดจากรายการนี้ · false = คงราคาเดิม คิดเฉพาะปริมาณสั่งซื้อ */
  priced: boolean;
}

export const TILE_PATTERNS: { value: TilePattern; label: string }[] = [
  { value: "STRAIGHT", label: "ปูตรง" },
  { value: "DIAGONAL", label: "ปูทแยง 45°" },
  { value: "HERRINGBONE", label: "ก้างปลา" },
];

/** เนื้อที่ใบตัดกินต่อรอยตัด (ม.) */
const KERF = 0.003;
/** เศษสั้นกว่านี้ (ม.) ร่องยาแนว/บัวกลบได้ ไม่ต้องตัดแผ่นเพิ่ม */
const MIN_CUT = 0.005;

/** เผื่อแตกหัก/สำรองซ่อมตั้งต้น (%) */
export const TILE_BREAKAGE_DEFAULT_PCT = 3;

/**
 * เผื่อเศษตัด (%) ที่บวกให้เองเมื่อคิดจากพื้นที่ — นับตามแนวปูได้ = 0 เพราะแผ่นตัดถูกนับแล้ว ·
 * ทแยง/ก้างปลาตัดทุกแผ่นที่ชนขอบ เศษจึงมากกว่าปูตรง
 */
export function tileCutAllowancePct(pattern: TilePattern, layout: boolean): number {
  if (layout) return 0;
  if (pattern === "DIAGONAL") return 10;
  if (pattern === "HERRINGBONE") return 12;
  return 5;
}

/** ปูนกาวตั้งต้นตามขนาดแผ่น — แผ่นใหญ่ต้องใช้เกรียงร่องลึกกว่า (แก้ตามฉลากปูนกาวที่ใช้จริงได้) */
export function defaultAdhesive(widthMm: number, lengthMm: number): { kgPerSqm: number; trowelMm: number } {
  const side = Math.max(widthMm, lengthMm);
  if (side <= 300) return { kgPerSqm: 4, trowelMm: 6 };
  if (side <= 450) return { kgPerSqm: 5, trowelMm: 8 };
  if (side <= 600) return { kgPerSqm: 6, trowelMm: 10 };
  return { kgPerSqm: 8, trowelMm: 12 };
}

/** ร่องและความหนาตั้งต้นตามขนาดแผ่น */
export function defaultTileJointMm(widthMm: number, lengthMm: number): number {
  return Math.max(widthMm, lengthMm) >= 600 ? 2 : 3;
}

export function defaultTileThicknessMm(widthMm: number, lengthMm: number): number {
  const side = Math.max(widthMm, lengthMm);
  if (side <= 300) return 8;
  if (side <= 600) return 9;
  return 10;
}

/**
 * ยาแนวต่อ ตร.ม. (กก.) — สูตรที่ผู้ผลิตยาแนวใช้: (ก + ย) ÷ (ก × ย) × กว้างร่อง × ลึกร่อง × 1.6
 * (มิติเป็นมม. · 1.6 = ความหนาแน่นของยาแนวที่ผสมแล้ว กก./ลิตร)
 */
export function groutKgPerSqm(widthMm: number, lengthMm: number, jointMm: number, depthMm: number): number {
  if (!(widthMm > 0 && lengthMm > 0 && jointMm > 0 && depthMm > 0)) return 0;
  return ((widthMm + lengthMm) / (widthMm * lengthMm)) * jointMm * depthMm * 1.6;
}

/**
 * ขนาดแผ่นจากชื่อวัสดุ เช่น "ขนาด 300x600" "60×60 ซม." — ใช้เติมค่าตั้งต้นในตัวคิดเท่านั้น
 * ไม่บอกหน่วย: เลขไม่เกิน 150 ถือเป็นเซนติเมตร (กระเบื้อง 150 มม. มีน้อย ส่วน 60×60 ซม. มีทั่วไป)
 */
export function parseTileSize(text: string): { widthMm: number; lengthMm: number } | null {
  const m = findSizePair(text);
  if (!m) return null;
  const { a, b, unit } = m;
  if (!(a > 0 && b > 0)) return null;
  const toMm = unit === "ซม" || unit === "cm" || (!unit && Math.max(a, b) <= 150) ? 10 : 1;
  const w = Math.round(Math.min(a, b) * toMm);
  const l = Math.round(Math.max(a, b) * toMm);
  if (w < 20 || l > 3000) return null;
  return { widthMm: w, lengthMm: l };
}

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
const isSpace = (c: string | undefined) => c?.trim() === "";
const SIZE_SEPARATORS = new Set(["x", "×", "X", "*"]);
const SIZE_UNITS = ["ซม", "cm", "มม", "mm"];

function skipSpaces(text: string, i: number): number {
  let j = i;
  while (isSpace(text[j])) j++;
  return j;
}

/** เลขทศนิยมที่เริ่มตรงตำแหน่ง i (หลักติดกัน + ".หลัก" ถ้ามี) */
function readNumber(text: string, i: number): { value: number; end: number } {
  let j = i;
  while (isDigit(text[j])) j++;
  if (text[j] === "." && isDigit(text[j + 1])) {
    j++;
    while (isDigit(text[j])) j++;
  }
  return { value: Number(text.slice(i, j)), end: j };
}

/**
 * คู่ "ก × ข หน่วย" แรกในข้อความ — อ่านทีละตัวอักษรแทน regex เดิมที่ต้องย้อนลองหลายทาง
 * (ข้อความยาวที่มีตัวเลขเยอะทำให้ช้าแบบทวีคูณได้) ผลเหมือน regex เดิมทุกกรณี
 */
function findSizePair(text: string): { a: number; b: number; unit: string | undefined } | null {
  for (let i = 0; i < text.length; i++) {
    if (!isDigit(text[i]) || isDigit(text[i - 1])) continue;
    const first = readNumber(text, i);
    const sep = skipSpaces(text, first.end);
    if (!SIZE_SEPARATORS.has(text[sep])) continue;
    const start = skipSpaces(text, sep + 1);
    if (!isDigit(text[start])) continue;
    const second = readNumber(text, start);
    const at = skipSpaces(text, second.end);
    return { a: first.value, b: second.value, unit: SIZE_UNITS.find((u) => text.startsWith(u, at)) };
  }
  return null;
}

export interface TileRoomCount {
  label: string;
  deduct: boolean;
  /** จำนวนแผ่น (แถวหัก = แผ่นที่คืน) */
  pieces: number;
  explain: string;
}

export interface TileTakeoffResult {
  /** LAYOUT = นับตามแนวปูทีละห้อง · AREA = คิดจากพื้นที่ + เผื่อ */
  mode: "LAYOUT" | "AREA";
  /** พื้นที่ปูสุทธิ (ตร.ม.) */
  area: number;
  /** แผ่นก่อนเผื่อ — นับตามแนวปูเป็นจำนวนเต็ม · คิดจากพื้นที่เป็นเศษได้ */
  basePieces: number;
  /** เผื่อเศษตัดที่ระบบบวกให้ (%) — 0 เมื่อนับตามแนวปู */
  cutPct: number;
  /** แผ่นที่ต้องใช้รวมเผื่อแล้ว (ปัดขึ้น) */
  pieces: number;
  /** กล่องที่ต้องสั่ง (ปัดขึ้น) — null = ไม่รู้แผ่นต่อกล่อง */
  boxes: number | null;
  rooms: TileRoomCount[];
  /** บอกเหตุที่ไม่ได้นับตามแนวปู (โหมด AREA) */
  areaReason: string | null;
  adhesive: { kgPerSqm: number; kg: number; bags: number } | null;
  grout: { kgPerSqm: number; kg: number; packs: number } | null;
  trim: { pieces: number } | null;
  /** ค่าที่กรอกใช้ไม่ได้ — มีค่า = ตัวเลขด้านบนเป็น 0 ทั้งหมด */
  errors: string[];
}

const round3 = (v: number) => roundTo(v, 3);
const ceilSafe = (v: number) => Math.ceil(v - 1e-9);
const floorSafe = (v: number) => Math.floor(v + 1e-9);
const fmt = (v: number, digits = 2) => String(Number(v.toFixed(digits)));

function positive(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v) && v > 0;
}
/** ≥ 0 / > 0 — NaN ไม่ผ่าน เหมือนการเขียน !(v >= 0) แบบเดิม */
const atLeastZero = (v: number) => v >= 0;
const aboveZero = (v: number) => v > 0;

/** ค่าที่กรอกในตัวคิดใช้ได้ไหม (ไม่รวมราคา — ดู tilePricingErrors) */
export function tileConfigErrors(config: TileCalcConfig): string[] {
  const errors: string[] = [];
  const { widthMm, lengthMm, thicknessMm, jointMm } = config;
  if (!positive(widthMm) || !positive(lengthMm) || widthMm < 20 || lengthMm < 20 || widthMm > 3000 || lengthMm > 3000) {
    errors.push("ขนาดแผ่นต้องอยู่ระหว่าง 20–3,000 มม.");
  }
  if (!positive(thicknessMm) || thicknessMm > 50) errors.push("ความหนาแผ่นต้องมากกว่า 0 และไม่เกิน 50 มม.");
  if (!atLeastZero(jointMm) || jointMm > 20) errors.push("ร่องยาแนวต้องอยู่ระหว่าง 0–20 มม.");
  if (config.piecesPerBox != null && (!Number.isInteger(config.piecesPerBox) || config.piecesPerBox <= 0)) {
    errors.push("แผ่นต่อกล่องต้องเป็นจำนวนเต็มมากกว่า 0");
  }
  if (!atLeastZero(config.wastePct) || config.wastePct > 50) errors.push("เผื่อแตกหักต้องอยู่ระหว่าง 0–50%");
  const a = config.adhesive;
  if (a && (!positive(a.kgPerSqm) || a.kgPerSqm > 30 || !positive(a.bagKg) || !atLeastZero(a.wastePct) || a.wastePct > 50)) {
    errors.push("ปูนกาว: กรอกปริมาณต่อ ตร.ม. ขนาดถุง และเผื่อให้ถูกต้อง");
  }
  const g = config.grout;
  if (g && (!positive(g.packKg) || !atLeastZero(g.wastePct) || g.wastePct > 50)) {
    errors.push("ยาแนว: กรอกขนาดถุงและเผื่อให้ถูกต้อง");
  } else if (g && !aboveZero(jointMm)) {
    errors.push("ร่องยาแนว 0 มม. ไม่ต้องใช้ยาแนว — เอายาแนวออก หรือกรอกความกว้างร่อง");
  }
  const t = config.trim;
  if (t && (!positive(t.lengthM) || !positive(t.pieceLengthM))) {
    errors.push("คิ้ว: กรอกความยาวขอบและความยาวต่อเส้นมากกว่า 0");
  }
  return errors;
}

/** ราคาที่ต้องมีเมื่อให้ตัวคิดตั้งราคาวัสดุของบรรทัด */
export function tilePricingErrors(config: TileCalcConfig): string[] {
  const errors: string[] = [];
  const price = (v: number | null) => v != null && Number.isFinite(v) && v >= 0;
  if (!price(config.tilePrice)) errors.push("กรอกราคากระเบื้อง");
  if (config.tilePriceUnit === "BOX" && config.piecesPerBox == null) errors.push("ราคาต่อกล่องต้องรู้จำนวนแผ่นต่อกล่อง");
  if (config.adhesive && !price(config.adhesive.pricePerBag)) errors.push("กรอกราคาปูนกาวต่อถุง");
  if (config.grout && !price(config.grout.pricePerPack)) errors.push("กรอกราคายาแนวต่อถุง");
  if (config.trim && !price(config.trim.pricePerPiece)) errors.push("กรอกราคาคิ้วต่อเส้น");
  return errors;
}

/** วางแผ่นตามแนวหนึ่ง: แผ่นเต็มกี่แผ่น + เศษที่ต้องตัด (ม.) */
function spanFit(span: number, tile: number, joint: number): { full: number; cut: number } {
  const full = floorSafe((span + joint) / (tile + joint));
  const cut = span - full * (tile + joint);
  return { full, cut: cut < MIN_CUT ? 0 : cut };
}

/** หนึ่งแผ่นตัดเป็นชิ้นยาว `cut` ได้กี่ชิ้น */
function piecesPerTile(cut: number, tile: number): number {
  return Math.max(1, floorSafe((tile + KERF) / (cut + KERF)));
}

interface TileSteps {
  joint: number;
  tA: number;
  tB: number;
  stepA: number;
  stepB: number;
}

/** ช่องหัก: นับเฉพาะแผ่นเต็มที่อยู่ในช่องแน่ ๆ (ช่องวางตรงไหนของแนวปูก็ได้) */
function deductRoom(row: TakeoffRowInput, t: TileSteps, times: string): TileRoomCount {
  const n = row.count;
  const inA = Math.max(0, floorSafe(row.length! / t.stepA) - 1);
  const inB = Math.max(0, floorSafe(row.width! / t.stepB) - 1);
  const saved = n * inA * inB;
  return {
    label: row.label,
    deduct: true,
    pieces: saved,
    explain: `แผ่นเต็มที่อยู่ในช่องแน่ ๆ ${inA} × ${inB}${times} = ${saved} แผ่น`,
  };
}

/** "1.2 ม. = 4 แผ่นเต็ม + เศษ 0.05 ม." */
function alongText(span: number, fit: { full: number; cut: number }): string {
  const rest = fit.cut > 0 ? ` + เศษ ${fmt(fit.cut, 3)} ม.` : "";
  return `${fmt(span)} ม. = ${fit.full} แผ่นเต็ม${rest}`;
}

/** "ตัดขอบ 6 (แผ่นละ 2 ชิ้น)" */
function edgeText(count: number, perTile: number): string {
  const yieldNote = perTile > 1 ? ` (แผ่นละ ${perTile} ชิ้น)` : "";
  return `ตัดขอบ ${count}${yieldNote}`;
}

/** ห้องหนึ่งแถว: แผ่นเต็ม + แผ่นตัดขอบสองแนว + มุม */
function floorRoom(row: TakeoffRowInput, t: TileSteps, times: string): TileRoomCount {
  const n = row.count;
  const L = row.length!;
  const W = row.width!;
  const a = spanFit(L, t.tA, t.joint);
  const b = spanFit(W, t.tB, t.joint);
  const full = n * a.full * b.full;
  const yieldA = a.cut > 0 ? piecesPerTile(a.cut, t.tA) : 0;
  const yieldB = b.cut > 0 ? piecesPerTile(b.cut, t.tB) : 0;
  const edgeA = yieldA && b.full > 0 ? ceilSafe((n * b.full) / yieldA) : 0;
  const edgeB = yieldB && a.full > 0 ? ceilSafe((n * a.full) / yieldB) : 0;
  const corner = yieldA && yieldB ? ceilSafe(n / (yieldA * yieldB)) : 0;
  const pieces = full + edgeA + edgeB + corner;
  const parts = [`เต็ม ${full}`];
  if (edgeA) parts.push(edgeText(edgeA, yieldA));
  if (edgeB) parts.push(edgeText(edgeB, yieldB));
  if (corner) parts.push(`มุม ${corner}`);
  return {
    label: row.label,
    deduct: false,
    pieces,
    explain: `ยาว ${alongText(L, a)} · กว้าง ${alongText(W, b)}${times} → ${parts.join(" + ")} = ${pieces} แผ่น`,
  };
}

function layoutRows(config: TileCalcConfig, rows: TakeoffRowInput[]): { rooms: TileRoomCount[]; base: number } {
  const joint = config.jointMm / 1000;
  const long = config.lengthMm / 1000;
  const short = config.widthMm / 1000;
  // ด้านยาวของแผ่นตามด้าน "ยาว" ของห้อง (หรือกลับกันเมื่อติ๊กหมุน)
  const tA = config.rotate ? short : long;
  const tB = config.rotate ? long : short;
  const steps: TileSteps = { joint, tA, tB, stepA: tA + joint, stepB: tB + joint };
  const rooms: TileRoomCount[] = [];
  let base = 0;
  for (const row of rows) {
    const times = row.count > 1 ? ` × ${row.count} ห้อง` : "";
    const room = row.deduct ? deductRoom(row, steps, times) : floorRoom(row, steps, times);
    base += row.deduct ? -room.pieces : room.pieces;
    rooms.push(room);
  }
  return { rooms, base };
}

/** แถวใบถอดแบบนับตามแนวปูได้ไหม — คืนเหตุผลถ้าไม่ได้ */
function layoutBlocker(config: TileCalcConfig, rows: TakeoffRowInput[] | null | undefined): string | null {
  if (config.pattern !== "STRAIGHT") return "ลายทแยง/ก้างปลาตัดแผ่นทุกแผ่นที่ชนขอบ";
  if (!rows?.length) return "ยังไม่มีขนาดห้อง";
  for (const r of rows) {
    if (r.length == null || r.width == null || r.height != null || r.barDia != null) {
      return "ใบถอดแบบมีแถวที่ไม่ใช่ ยาว × กว้าง";
    }
    if (!Number.isInteger(r.count)) return "จำนวนห้องในใบถอดแบบไม่ใช่จำนวนเต็ม";
  }
  return null;
}

/**
 * คิดกระเบื้องของหนึ่งบรรทัด
 * @param rows แถวใบถอดแบบ (กว้าง × ยาว ทีละห้อง) — มีครบ = นับตามแนวปู
 * @param area พื้นที่ปูสุทธิ (ตร.ม.) ใช้เมื่อนับตามแนวปูไม่ได้
 */
export function tileTakeoff(
  config: TileCalcConfig,
  source: { rows?: TakeoffRowInput[] | null; area: number },
): TileTakeoffResult {
  const empty: TileTakeoffResult = {
    mode: "AREA",
    area: 0,
    basePieces: 0,
    cutPct: 0,
    pieces: 0,
    boxes: null,
    rooms: [],
    areaReason: null,
    adhesive: null,
    grout: null,
    trim: null,
    errors: [],
  };
  const errors = tileConfigErrors(config);
  if (errors.length > 0) return { ...empty, errors };

  const blocker = layoutBlocker(config, source.rows);
  let mode: "LAYOUT" | "AREA" = "AREA";
  let area = source.area;
  let basePieces: number;
  let rooms: TileRoomCount[] = [];
  if (blocker === null) {
    mode = "LAYOUT";
    const rows = source.rows!;
    area = rows.reduce((sum, r) => sum + (r.deduct ? -1 : 1) * r.count * r.length! * r.width!, 0);
    const counted = layoutRows(config, rows);
    rooms = counted.rooms;
    basePieces = Math.max(0, counted.base);
  } else {
    const cell = ((config.widthMm + config.jointMm) * (config.lengthMm + config.jointMm)) / 1e6;
    basePieces = round3(Math.max(0, area) / cell);
  }
  area = round3(area);
  if (!aboveZero(area) || !aboveZero(basePieces)) {
    return { ...empty, mode, errors: ["พื้นที่ปูต้องมากกว่า 0 — แถวหักมากกว่าพื้นที่ห้อง"] };
  }

  const cutPct = tileCutAllowancePct(config.pattern, mode === "LAYOUT");
  const pieces = ceilSafe(basePieces * (1 + (cutPct + config.wastePct) / 100));
  const boxes = config.piecesPerBox ? ceilSafe(pieces / config.piecesPerBox) : null;

  const adhesive = config.adhesive
    ? (() => {
        const kg = round3(area * config.adhesive.kgPerSqm * (1 + config.adhesive.wastePct / 100));
        return { kgPerSqm: config.adhesive.kgPerSqm, kg, bags: ceilSafe(kg / config.adhesive.bagKg) };
      })()
    : null;
  const grout = config.grout
    ? (() => {
        const kgPerSqm = round3(groutKgPerSqm(config.widthMm, config.lengthMm, config.jointMm, config.thicknessMm));
        const kg = round3(area * kgPerSqm * (1 + config.grout.wastePct / 100));
        return { kgPerSqm, kg, packs: ceilSafe(kg / config.grout.packKg) };
      })()
    : null;
  const trim = config.trim ? { pieces: ceilSafe(config.trim.lengthM / config.trim.pieceLengthM) } : null;

  return {
    mode,
    area,
    basePieces,
    cutPct,
    pieces,
    boxes,
    rooms,
    areaReason: blocker,
    adhesive,
    grout,
    trim,
    errors: [],
  };
}

/** ชื่อกระเบื้องที่ใช้ในวัสดุย่อย/รายการสั่งซื้อ */
export function tileDisplayName(config: TileCalcConfig): string {
  const base = config.tileName.trim() || `กระเบื้อง ${config.widthMm}×${config.lengthMm} มม.`;
  return config.piecesPerBox ? `${base} (กล่องละ ${config.piecesPerBox} แผ่น)` : base;
}

/** ชื่อของประกอบ — ใช้ทั้งวัสดุย่อยและรายการสั่งซื้อ ให้รวมกลุ่มข้ามบรรทัดได้ */
export const tileAdhesiveName = (bagKg: number) => `ปูนกาว (ถุง ${fmt(bagKg)} กก.)`;
export const tileGroutName = (packKg: number) => `ยาแนว (ถุง ${fmt(packKg)} กก.)`;
export const tileTrimName = (pieceLengthM: number) => `คิ้วจบขอบ (เส้นละ ${fmt(pieceLengthM)} ม.)`;

export interface TileComponent {
  name: string;
  unit: string;
  /** ต่อ 1 หน่วยของบรรทัด (ตร.ม.) */
  qtyPerUnit: number;
  wasteFactorPct: number | null;
  unitPrice: number;
}

const round2 = (v: number) => roundTo(v, 2);
// ปัดลง 4 ตำแหน่ง (ความละเอียดของคอลัมน์) — ปัดขึ้นแล้วคูณกลับจะเกินจำนวนจริงจนรายการสั่งซื้อปัดเพิ่มอีกหนึ่ง
const floor4 = (v: number) => Math.max(0.0001, Math.floor(v * 1e4 + 1e-6) / 1e4);

/**
 * วัสดุย่อยต่อ 1 ตร.ม. ของบรรทัด (ใช้เมื่อให้ตัวคิดตั้งราคาวัสดุ)
 * กระเบื้องเป็นกล่อง (ถ้ารู้แผ่นต่อกล่อง) — รวมเผื่อแล้ว จึงไม่ใส่เผื่อซ้ำในวัสดุย่อย
 * ปูนกาว/ยาแนวใส่เผื่อไว้ที่วัสดุย่อย · ปริมาณเป็นเศษได้ รายการสั่งซื้อรวมทุกบรรทัดแล้วค่อยปัดขึ้น
 */
/** ราคากระเบื้องต่อหน่วยที่ใช้ในสูตร — ต่อกล่องถ้ารู้แผ่นต่อกล่อง ไม่งั้นต่อแผ่น */
function tileUnitPrice(config: TileCalcConfig, tileArea: number): number {
  const ppb = config.piecesPerBox;
  const p = config.tilePrice ?? 0;
  if (!ppb) return config.tilePriceUnit === "PIECE" ? p : p * tileArea;
  if (config.tilePriceUnit === "BOX") return p;
  if (config.tilePriceUnit === "PIECE") return p * ppb;
  return p * ppb * tileArea;
}

export function tileComponents(config: TileCalcConfig, result: TileTakeoffResult, lineQuantity: number): TileComponent[] {
  if (result.errors.length > 0 || !aboveZero(lineQuantity)) return [];
  const tileArea = (config.widthMm * config.lengthMm) / 1e6;
  const ppb = config.piecesPerBox;
  const tilePrice = tileUnitPrice(config, tileArea);
  const out: TileComponent[] = [
    {
      name: tileDisplayName(config),
      unit: ppb ? "กล่อง" : "แผ่น",
      qtyPerUnit: floor4((ppb ? result.pieces / ppb : result.pieces) / lineQuantity),
      wasteFactorPct: null,
      unitPrice: round2(tilePrice),
    },
  ];
  if (config.adhesive) {
    out.push({
      name: tileAdhesiveName(config.adhesive.bagKg),
      unit: "ถุง",
      qtyPerUnit: floor4((result.area * config.adhesive.kgPerSqm) / config.adhesive.bagKg / lineQuantity),
      wasteFactorPct: config.adhesive.wastePct || null,
      unitPrice: round2(config.adhesive.pricePerBag ?? 0),
    });
  }
  if (config.grout && result.grout) {
    out.push({
      name: tileGroutName(config.grout.packKg),
      unit: "ถุง",
      qtyPerUnit: floor4((result.area * result.grout.kgPerSqm) / config.grout.packKg / lineQuantity),
      wasteFactorPct: config.grout.wastePct || null,
      unitPrice: round2(config.grout.pricePerPack ?? 0),
    });
  }
  if (config.trim && result.trim) {
    out.push({
      name: tileTrimName(config.trim.pieceLengthM),
      unit: "เส้น",
      qtyPerUnit: floor4(result.trim.pieces / lineQuantity),
      wasteFactorPct: null,
      unitPrice: round2(config.trim.pricePerPiece ?? 0),
    });
  }
  return out;
}
