import {
  roundTo,
  TILE_BREAKAGE_DEFAULT_PCT,
  TILE_PATTERNS,
  defaultAdhesive,
  defaultTileJointMm,
  defaultTileThicknessMm,
  groutKgPerSqm,
  parseTileSize,
  tileComponents,
  tileConfigErrors,
  tileDisplayName,
  tilePricingErrors,
  tileTakeoff,
  type BoqItemDto,
  type MaterialDto,
  type TakeoffRowInput,
  type TileCalcConfig,
  type TilePattern,
  type TilePriceUnit,
} from "@systemboq/shared-types";
import { Check, ChevronDown, Copy, Grid3x3, Minus, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

const num = (n: number, digits = 3) => n.toLocaleString("th-TH", { maximumFractionDigits: digits });
const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (v: number) => roundTo(v, 2);
const round3 = (v: number) => roundTo(v, 3);

/** ขนาดยอดนิยม (มม.) — ปุ่มลัดในหมวดแผ่นกระเบื้อง · กรอกขนาดอื่นเองได้ในช่องด้านล่าง */
const SIZE_PRESETS = [
  [300, 300],
  [600, 600],
  [300, 600],
  [600, 1200],
] as const;

/** มม. → ซม. สำหรับโชว์ (ฉลากกระเบื้องที่ร้านเขียนเป็น ซม.) */
const cm = (mm: number) => num(mm / 10, 1);

/**
 * ช่องที่ว่างไว้ = ใช้ค่าตั้งต้น — เดิม placeholder เป็นตัวเทาจาง ผู้ใช้แยกไม่ออกว่าระบบใช้ค่านี้อยู่
 * หรือยังไม่ได้กรอก จึงให้ placeholder เข้มเท่าตัวเลขจริง แล้วติดป้าย "ค่าตั้งต้น" ที่หัวช่องแทน
 */
const DEFAULT_PLACEHOLDER = "placeholder:text-slate-800";

type StepId = "tile" | "pattern" | "area" | "extras" | "price";

const input = "w-full min-w-0 rounded-md border border-slate-300 px-2 py-1 text-sm";
const numInput = `${input} text-right tabular-nums`;

const ROOM_FIELD_LABEL = { count: "จำนวน", length: "ยาว", width: "กว้าง" } as const;

const positive = (n: number) => n > 0;

/** หน่วยราคาของวัสดุในคลัง → หน่วยราคากระเบื้อง (null = หน่วยอื่น ไม่ดึงราคา) */
function tilePriceUnitOf(unit: string): TilePriceUnit | null {
  if (unit.includes("กล่อง")) return "BOX";
  if (unit.includes("แผ่น")) return "PIECE";
  return unit.includes("ตร") ? "SQM" : null;
}

/** ราคาวัสดุ/ตร.ม. ของบรรทัด: ตัวคิดตั้งราคา · เคยตั้งแล้วเลิก = ราคาที่กรอกแทน · นอกนั้นราคาเดิม */
function lineMaterialPrice(priced: boolean, pricedMaterial: number, wasPricedByCalc: boolean, fallbackPrice: string, current: number) {
  if (priced) return pricedMaterial;
  return wasPricedByCalc ? Number(fallbackPrice) : current;
}

/** เลิกให้ตัวคิดตั้งราคาแล้วแต่ยังไม่ได้กรอกราคาที่จะใช้แทน */
function fallbackMissing(priced: boolean, wasPricedByCalc: boolean, fallbackPrice: string) {
  if (priced || !wasPricedByCalc) return false;
  return !(Number(fallbackPrice) >= 0 && fallbackPrice.trim() !== "");
}

type Issue = { text: string; step: StepId };

/** ปัญหาแรกที่กั้นการบันทึก พร้อมหมวดที่ต้องไปแก้ */
function firstIssue(p: {
  sized: boolean;
  configError: string | undefined;
  useRooms: boolean;
  rooms: { valid: unknown[]; error: string | null };
  resultError: string | undefined;
  pricingError: string | undefined;
  missingFallback: boolean;
}): Issue | null {
  if (!p.sized) return { text: "กรอกขนาดแผ่น (กว้าง × ยาว มม.)", step: "tile" };
  if (p.configError) return { text: p.configError, step: stepOfConfigError(p.configError) };
  if (p.useRooms && p.rooms.error) return { text: p.rooms.error, step: "area" };
  if (p.useRooms && p.rooms.valid.length === 0) return { text: "กรอกขนาดห้องอย่างน้อย 1 ห้อง", step: "area" };
  if (p.resultError) return { text: p.resultError, step: "area" };
  if (p.pricingError) return { text: p.pricingError, step: "price" };
  if (p.missingFallback) return { text: "กรอกราคาวัสดุต่อ ตร.ม. ที่จะใช้แทน", step: "price" };
  return null;
}

/** ข้อความบนหัวหมวดที่พับอยู่ — บอกค่าที่ใช้ในบรรทัดเดียว */
function stepSummaries(p: {
  form: TileForm;
  config: TileCalcConfig;
  sized: boolean;
  useRooms: boolean;
  roomCount: number;
  area: number;
  lineArea: number;
  materialPrice: number;
}) {
  const { form, config, sized } = p;
  const patternLabel = TILE_PATTERNS.find((x) => x.value === config.pattern)?.label ?? "";
  const tile = sized
    ? [
        `${cm(config.widthMm)}×${cm(config.lengthMm)} ซม.`,
        `หนา ${num(config.thicknessMm)} มม.`,
        `ร่อง ${num(config.jointMm)} มม.`,
        config.piecesPerBox ? `${config.piecesPerBox} แผ่น/กล่อง` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "ยังไม่ได้กรอกขนาดแผ่น";
  const pattern = [patternLabel, config.rotate ? "วางด้านยาวตามแนวกว้าง" : null, `เผื่อแตกหัก ${num(config.wastePct)}%`]
    .filter(Boolean)
    .join(" · ");
  const roomArea = sized && p.area > 0 ? ` · ${num(p.area)} ตร.ม.` : "";
  const area = p.useRooms ? `ขนาดห้อง ${p.roomCount} รายการ${roomArea}` : `ใช้ปริมาณของบรรทัด ${num(p.lineArea)} ตร.ม.`;
  const extras =
    [form.useAdhesive && "ปูนกาว", form.useGrout && "ยาแนว", form.useTrim && "คิ้วจบขอบ"].filter(Boolean).join(" · ") ||
    "ไม่คิดของประกอบ";
  const price = config.priced
    ? `ตั้งราคาจากตัวคิด · ${baht(p.materialPrice)} บาท/ตร.ม.`
    : `คงราคาเหมาเดิม · ${baht(p.materialPrice)} บาท/ตร.ม.`;
  return { tile, pattern, area, extras, price };
}

/** จำนวนแผ่นของแถวห้อง (แถวหักติดเครื่องหมายลบ) — undefined = ยังคิดไม่ได้ */
function roomPiecesText(pieces: number | undefined, deduct: boolean) {
  if (pieces === undefined) return null;
  return deduct ? `−${pieces}` : String(pieces);
}

/** ให้แต่ละรายการมี key ที่ไม่ซ้ำโดยไม่ใช้ลำดับในอาร์เรย์ — ชื่อซ้ำได้เลขต่อท้าย */
function withUniqueKeys<T>(items: T[], labelOf: (item: T) => string) {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const label = labelOf(item);
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return { item, key: `${label}#${n}` };
  });
}

/** error ของ tileConfigErrors อยู่หมวดไหน — ใช้พาไปเปิดหมวดที่ต้องแก้ */
function stepOfConfigError(message: string): StepId {
  if (["ปูนกาว", "ยาแนว", "คิ้ว"].some((p) => message.startsWith(p)) || message.includes("ไม่ต้องใช้ยาแนว")) return "extras";
  if (message.startsWith("เผื่อแตกหัก")) return "pattern";
  return "tile";
}

/** ช่องตัวเลขในฟอร์มเก็บเป็นข้อความ — ช่องว่าง = ใช้ค่าตั้งต้น (โชว์เป็น placeholder) */
interface TileForm {
  sourceMaterialId: string;
  tileName: string;
  widthMm: string;
  lengthMm: string;
  thicknessMm: string;
  jointMm: string;
  piecesPerBox: string;
  rotate: boolean;
  pattern: TilePattern;
  wastePct: string;
  useAdhesive: boolean;
  adhesiveKg: string;
  bagKg: string;
  adhesiveWaste: string;
  adhesivePrice: string;
  useGrout: boolean;
  packKg: string;
  groutWaste: string;
  groutPrice: string;
  useTrim: boolean;
  trimLength: string;
  trimPieceLength: string;
  trimPrice: string;
  tilePrice: string;
  tilePriceUnit: TilePriceUnit;
  priced: boolean;
}

interface RoomRow {
  key: number;
  label: string;
  count: string;
  length: string;
  width: string;
  deduct: boolean;
}

export interface TileCalcApply {
  tileCalc: TileCalcConfig;
  /** ใช้ขนาดห้อง = บรรทัดกลายเป็นใบถอดแบบ (ไม่เผื่อซ้ำ เพราะเผื่อของกระเบื้องอยู่ในตัวคิดแล้ว) */
  qtyBasis?: "SHEET";
  takeoffRows?: TakeoffRowInput[];
  wasteFactorPct?: null;
  /** เลิกให้ตัวคิดตั้งราคา → ราคาวัสดุต่อ ตร.ม. ที่จะใช้แทน */
  materialUnitPrice?: number;
}

let nextKey = 1;
const blankRoom = (deduct = false): RoomRow => ({ key: nextKey++, label: "", count: "1", length: "", width: "", deduct });
const s = (v: number | null | undefined) => (v == null ? "" : String(v));

/** แถวใบถอดแบบเดิมเป็นห้อง (ยาว × กว้าง) ล้วนไหม — ถ้าใช่ เปิดมาในโหมดขนาดห้องได้เลย */
function areaRowsOf(item: BoqItemDto): RoomRow[] | null {
  if (item.qtyBasis !== "SHEET" || item.takeoffRows.length === 0) return null;
  if (item.takeoffRows.some((r) => r.length == null || r.width == null || r.height != null || r.barDia != null)) {
    return null;
  }
  return item.takeoffRows.map((r) => ({
    key: nextKey++,
    label: r.label,
    count: String(Number(r.count)),
    length: String(Number(r.length)),
    width: String(Number(r.width)),
    deduct: r.deduct,
  }));
}

function initialForm(item: BoqItemDto, material: MaterialDto | undefined): TileForm {
  const c = item.tileCalc;
  if (c) {
    return {
      sourceMaterialId: c.sourceMaterialId ?? "",
      tileName: c.tileName,
      widthMm: s(c.widthMm),
      lengthMm: s(c.lengthMm),
      thicknessMm: s(c.thicknessMm),
      jointMm: s(c.jointMm),
      piecesPerBox: s(c.piecesPerBox),
      rotate: c.rotate,
      pattern: c.pattern,
      wastePct: s(c.wastePct),
      useAdhesive: c.adhesive != null,
      adhesiveKg: s(c.adhesive?.kgPerSqm),
      bagKg: s(c.adhesive?.bagKg ?? 20),
      adhesiveWaste: s(c.adhesive?.wastePct ?? 5),
      adhesivePrice: s(c.adhesive?.pricePerBag),
      useGrout: c.grout != null,
      packKg: s(c.grout?.packKg ?? 1),
      groutWaste: s(c.grout?.wastePct ?? 10),
      groutPrice: s(c.grout?.pricePerPack),
      useTrim: c.trim != null,
      trimLength: s(c.trim?.lengthM),
      trimPieceLength: s(c.trim?.pieceLengthM ?? 2.5),
      trimPrice: s(c.trim?.pricePerPiece),
      tilePrice: s(c.tilePrice),
      tilePriceUnit: c.tilePriceUnit,
      priced: c.priced,
    };
  }
  // ขนาดแผ่น: วัสดุของบรรทัด (ถ้าตั้งไว้ในคลัง) > อ่านจากชื่อบรรทัด > ให้กรอกเอง
  const fromMaterial =
    material?.tileWidthMm != null && material.tileLengthMm != null
      ? { widthMm: material.tileWidthMm, lengthMm: material.tileLengthMm }
      : null;
  const size = fromMaterial ?? parseTileSize(item.name);
  return {
    sourceMaterialId: fromMaterial ? material!.id : "",
    tileName: "",
    widthMm: s(size?.widthMm),
    lengthMm: s(size?.lengthMm),
    thicknessMm: fromMaterial && material!.tileThicknessMm != null ? String(Number(material!.tileThicknessMm)) : "",
    jointMm: "",
    piecesPerBox: fromMaterial ? s(material!.tilePiecesPerBox) : "",
    rotate: false,
    pattern: "STRAIGHT",
    wastePct: String(TILE_BREAKAGE_DEFAULT_PCT),
    useAdhesive: true,
    adhesiveKg: "",
    bagKg: "20",
    adhesiveWaste: "5",
    adhesivePrice: "",
    useGrout: true,
    packKg: "1",
    groutWaste: "10",
    groutPrice: "",
    useTrim: false,
    trimLength: "",
    trimPieceLength: "2.5",
    trimPrice: "",
    tilePrice: "",
    tilePriceUnit: "SQM",
    priced: false,
  };
}

/** ช่องว่าง = ค่าตั้งต้น · ข้อความที่ไม่ใช่ตัวเลข = NaN (ให้ตัวตรวจค่าจับ) */
const numOr = (v: string, fallback: number) => (v.trim() === "" ? fallback : Number(v));
const priceOf = (v: string) => (v.trim() === "" ? null : Number(v));

function toConfig(f: TileForm): TileCalcConfig {
  const w = Number(f.widthMm);
  const l = Number(f.lengthMm);
  const sized = w > 0 && l > 0;
  return {
    sourceMaterialId: f.sourceMaterialId || null,
    tileName: f.tileName.trim(),
    widthMm: w,
    lengthMm: l,
    thicknessMm: numOr(f.thicknessMm, sized ? defaultTileThicknessMm(w, l) : 0),
    jointMm: numOr(f.jointMm, sized ? defaultTileJointMm(w, l) : 0),
    piecesPerBox: f.piecesPerBox.trim() === "" ? null : Number(f.piecesPerBox),
    rotate: w !== l && f.rotate,
    pattern: f.pattern,
    wastePct: numOr(f.wastePct, 0),
    adhesive: f.useAdhesive
      ? {
          kgPerSqm: numOr(f.adhesiveKg, sized ? defaultAdhesive(w, l).kgPerSqm : 0),
          bagKg: numOr(f.bagKg, 20),
          wastePct: numOr(f.adhesiveWaste, 0),
          pricePerBag: priceOf(f.adhesivePrice),
        }
      : null,
    grout: f.useGrout
      ? { packKg: numOr(f.packKg, 1), wastePct: numOr(f.groutWaste, 0), pricePerPack: priceOf(f.groutPrice) }
      : null,
    trim: f.useTrim
      ? {
          lengthM: Number(f.trimLength),
          pieceLengthM: numOr(f.trimPieceLength, 2.5),
          pricePerPiece: priceOf(f.trimPrice),
        }
      : null,
    tilePrice: priceOf(f.tilePrice),
    tilePriceUnit: f.tilePriceUnit,
    priced: f.priced,
  };
}

/** ตรวจแถวห้อง — คืนแถวที่ใช้ได้ (พร้อมเลขแถวเดิม) และข้อความผิดแถวแรก */
function parseRooms(rows: RoomRow[]): { valid: { index: number; row: TakeoffRowInput }[]; error: string | null } {
  const valid: { index: number; row: TakeoffRowInput }[] = [];
  for (const [i, r] of rows.entries()) {
    if (!r.label.trim() && !r.length && !r.width) continue;
    const where = `แถว ${i + 1}`;
    const count = Number(r.count);
    const length = Number(r.length);
    const width = Number(r.width);
    if (!Number.isInteger(count) || count <= 0) return { valid, error: `${where}: จำนวนห้องต้องเป็นจำนวนเต็มมากกว่า 0` };
    if (!positive(length) || !positive(width)) return { valid, error: `${where}: กรอกยาวและกว้างเป็นเมตร (มากกว่า 0)` };
    if (length > 1000 || width > 1000) return { valid, error: `${where}: ขนาดเป็นเมตร — ${Math.max(length, width)} ม. มากผิดปกติ` };
    valid.push({ index: i, row: { label: r.label.trim() || where, count, length, width, deduct: r.deduct } });
  }
  return { valid, error: null };
}

/**
 * ตัวคิดกระเบื้องของหนึ่งบรรทัด BOQ (หน่วย ตร.ม.)
 *
 * ซ้าย = ค่าที่กรอก (แผ่น · พื้นที่ · ของประกอบ · ราคา) ขวา = ผลสด ที่เซิร์ฟเวอร์จะคิดซ้ำด้วยสูตรเดียวกัน
 * (shared-types/tile.ts) ตอนบันทึก — พรีวิวกับของที่บันทึกจึงตรงกันเสมอ
 */
export function TileCalcDialog({
  item,
  materials,
  onApply,
  onDetach,
  onClose,
}: Readonly<{
  item: BoqItemDto;
  materials: MaterialDto[];
  onApply: (payload: TileCalcApply) => void | Promise<void>;
  /** มี = บรรทัดนี้ใช้ตัวคิดอยู่แล้ว เลิกใช้ได้ */
  onDetach?: (materialUnitPrice: number | undefined) => void | Promise<void>;
  onClose: () => void;
}>) {
  const lineMaterial = materials.find((m) => m.id === item.materialId);
  const [form, setForm] = useState<TileForm>(() => initialForm(item, lineMaterial));
  const existingRooms = useMemo(() => areaRowsOf(item), [item]);
  // บรรทัดคิดจากค่าวัดของโครงการ/กรอกเอง → ตั้งต้นใช้ปริมาณของบรรทัด · ใบถอดแบบที่เป็นห้อง → ใช้ห้อง
  const [useRooms, setUseRooms] = useState(existingRooms != null);
  const [rooms, setRooms] = useState<RoomRow[]>(() => existingRooms ?? [blankRoom()]);
  const wasPricedByCalc = Boolean(item.tileCalc?.priced);
  // เลิกให้ตัวคิดตั้งราคา → ต้องบอกราคาเหมาที่จะกลับไปใช้ (ราคาตอนนี้มาจากวัสดุย่อยของตัวคิด)
  const [fallbackPrice, setFallbackPrice] = useState(
    lineMaterial ? String(Number(lineMaterial.materialUnitPrice)) : String(Number(item.materialUnitPrice)),
  );
  const [saving, setSaving] = useState(false);
  // เปิดทีละหมวด — เริ่มที่แผ่นกระเบื้อง (ขนาดที่อ่านจากชื่อบรรทัดควรถูกตรวจก่อนเสมอ)
  const [openStep, setOpenStep] = useState<StepId | null>("tile");
  const toggleStep = (id: StepId) => setOpenStep((cur) => (cur === id ? null : id));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const set = (patch: Partial<TileForm>) => setForm((f) => ({ ...f, ...patch }));
  const tileMaterials = useMemo(
    () => materials.filter((m) => m.tileWidthMm != null && m.tileLengthMm != null && m.active),
    [materials],
  );

  const config = toConfig(form);
  const sized = config.widthMm > 0 && config.lengthMm > 0;
  const lineWaste = Number(item.wasteFactorPct ?? 0);
  const lineArea = Number(item.quantity) / (1 + lineWaste / 100);
  const parsedRooms = parseRooms(rooms);
  const result = tileTakeoff(config, {
    rows: useRooms ? parsedRooms.valid.map((v) => v.row) : null,
    area: lineArea,
  });
  // ปริมาณของบรรทัดหลังบันทึก: ใช้ห้อง = พื้นที่สุทธิของห้อง (ไม่เผื่อซ้ำ) · ไม่ใช้ = ปริมาณเดิม
  const lineQty = useRooms ? round3(result.area) : Number(item.quantity);
  const components = config.priced ? tileComponents(config, result, lineQty) : [];
  const pricedMaterial = round2(
    components.reduce((sum, c) => sum + c.qtyPerUnit * (1 + (c.wasteFactorPct ?? 0) / 100) * c.unitPrice, 0),
  );
  const materialPrice = lineMaterialPrice(config.priced, pricedMaterial, wasPricedByCalc, fallbackPrice, Number(item.materialUnitPrice));
  const labor = Number(item.laborUnitPrice);
  const lineTotal = round2(round2(lineQty * materialPrice) + round2(lineQty * labor));

  const configError = tileConfigErrors(config)[0];
  const pricingError = config.priced ? tilePricingErrors(config)[0] : undefined;
  // ปัญหาแรกที่กั้นการบันทึก พร้อมหมวดที่ต้องไปแก้ (ปุ่ม "ไปแก้" + จุดเตือนบนหัวหมวด)
  const issue = firstIssue({
    sized,
    configError,
    useRooms,
    rooms: parsedRooms,
    resultError: result.errors[0],
    pricingError,
    missingFallback: fallbackMissing(config.priced, wasPricedByCalc, fallbackPrice),
  });
  const blocker = issue?.text ?? null;

  function pickMaterial(id: string) {
    const m = tileMaterials.find((x) => x.id === id);
    if (!m) {
      set({ sourceMaterialId: "" });
      return;
    }
    const other = m.id !== item.materialId;
    // วัสดุอื่นที่เป็นตัวกระเบื้องจริง: ชื่อ/ราคาของมันคือของกระเบื้อง · วัสดุของบรรทัดเองเป็นงานเหมา ไม่ใช่
    const priceUnit = tilePriceUnitOf(m.unit);
    set({
      sourceMaterialId: m.id,
      widthMm: String(m.tileWidthMm),
      lengthMm: String(m.tileLengthMm),
      thicknessMm: m.tileThicknessMm != null ? String(Number(m.tileThicknessMm)) : "",
      piecesPerBox: s(m.tilePiecesPerBox),
      ...(other ? { tileName: m.name } : {}),
      ...(other && priceUnit ? { tilePrice: String(Number(m.materialUnitPrice)), tilePriceUnit: priceUnit } : {}),
    });
  }

  async function apply() {
    if (blocker) return;
    setSaving(true);
    try {
      await onApply({
        tileCalc: config,
        ...(useRooms
          ? { qtyBasis: "SHEET" as const, takeoffRows: parsedRooms.valid.map((v) => v.row), wasteFactorPct: null }
          : {}),
        ...(!config.priced && wasPricedByCalc ? { materialUnitPrice: Number(fallbackPrice) } : {}),
      });
    } finally {
      setSaving(false);
    }
  }

  async function detach() {
    if (!onDetach) return;
    setSaving(true);
    try {
      await onDetach(wasPricedByCalc ? Number(fallbackPrice) : undefined);
    } finally {
      setSaving(false);
    }
  }

  // พิกัดผลต่อแถวห้อง: result.rooms เรียงตามแถวที่ใช้ได้
  const piecesByIndex = new Map<number, number>();
  if (result.mode === "LAYOUT") {
    parsedRooms.valid.forEach((v, i) => {
      const r = result.rooms[i];
      if (r) piecesByIndex.set(v.index, r.pieces);
    });
  }

  const summary = stepSummaries({
    form,
    config,
    sized,
    useRooms,
    roomCount: parsedRooms.valid.length,
    area: result.area,
    lineArea,
    materialPrice,
  });
  const switchingFromDriver = useRooms && item.qtyBasis !== "SHEET" && item.qtyBasis !== "MANUAL";
  const replacingSheet = useRooms && item.qtyBasis === "SHEET" && existingRooms == null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label="ปิด"
        onClick={() => !saving && onClose()}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />
      <dialog open
        aria-modal="true"
        aria-labelledby="tile-calc-title"
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="tile-calc-title" className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <Grid3x3 size={18} className="text-brand" /> ตัวคิดกระเบื้อง
            </h2>
            <p className="mt-0.5 truncate text-sm text-slate-600">
              {item.name} <span className="text-slate-400">· หน่วย {item.unit}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* ───── ค่าที่กรอก: 5 หมวดพับได้ หมวดที่ปิดบอกค่าที่ใช้อยู่ในบรรทัดเดียว ───── */}
          <div className="flex flex-col gap-2 px-5 py-4">
            <Step
              n={1}
              title="แผ่นกระเบื้อง"
              summary={summary.tile}
              open={openStep === "tile"}
              onToggle={() => toggleStep("tile")}
              flagged={issue?.step === "tile"}
            >
<TileFields form={form} config={config} sized={sized} tileMaterials={tileMaterials} set={set} onPickMaterial={pickMaterial} />
            </Step>

            <Step
              n={2}
              title="วิธีปู"
              summary={summary.pattern}
              open={openStep === "pattern"}
              onToggle={() => toggleStep("pattern")}
              flagged={issue?.step === "pattern"}
            >
<PatternFields form={form} config={config} sized={sized} set={set} />
            </Step>

            <Step
              n={3}
              title="พื้นที่ปู"
              summary={summary.area}
              open={openStep === "area"}
              onToggle={() => toggleStep("area")}
              flagged={issue?.step === "area"}
            >
              <div role="radiogroup" aria-label="ที่มาของพื้นที่" className="flex flex-col gap-1.5 text-sm">
                <label className="flex items-start gap-2">
                  <input type="radio" checked={useRooms} onChange={() => setUseRooms(true)} className="mt-1" />
                  <span>
                    <span className="font-medium text-slate-800">กรอกขนาดห้อง</span>{" "}
                    <span className="text-slate-500">— นับแผ่นตามแนวปูจริง แม่นที่สุด</span>
                  </span>
                </label>
                {/* ใบถอดแบบที่เป็นห้องอยู่แล้ว = ห้องคือที่มาของปริมาณ เซิร์ฟเวอร์นับตามห้องเสมอ จึงไม่มีทางเลือกนี้ */}
                {existingRooms == null && (
                <label className="flex items-start gap-2">
                  <input type="radio" checked={!useRooms} onChange={() => setUseRooms(false)} className="mt-1" />
                  <span>
                    <span className="font-medium text-slate-800">ใช้ปริมาณของบรรทัด {num(lineArea)} ตร.ม.</span>{" "}
                    <span className="text-slate-500">
                      — คิดจากพื้นที่ + เผื่อเศษตัด{lineWaste > 0 && ` (หักเผื่อเสีย ${lineWaste}% ของบรรทัดออกก่อน)`}
                    </span>
                  </span>
                </label>
                )}
              </div>

              {useRooms && (
                <>
                  {(switchingFromDriver || replacingSheet) && (
                    <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {switchingFromDriver
                        ? "บรรทัดนี้คิดปริมาณจากค่าวัดของโครงการ — ใช้ขนาดห้องแทนจะเลิกผูกกับค่าวัดนั้น"
                        : "ใบถอดแบบเดิมของบรรทัดนี้ไม่ใช่ขนาดห้อง — จะถูกแทนด้วยห้องที่กรอกที่นี่"}
                    </p>
                  )}
<RoomsTable rooms={rooms} setRooms={setRooms} piecesByIndex={piecesByIndex} />
                </>
              )}
            </Step>

            <Step
              n={4}
              title="ปูนกาว · ยาแนว · คิ้ว"
              summary={summary.extras}
              open={openStep === "extras"}
              onToggle={() => toggleStep("extras")}
              flagged={issue?.step === "extras"}
            >
<ExtrasFields form={form} config={config} sized={sized} set={set} />
            </Step>

            <Step
              n={5}
              title="ราคาวัสดุของบรรทัด"
              summary={summary.price}
              open={openStep === "price"}
              onToggle={() => toggleStep("price")}
              flagged={issue?.step === "price"}
            >
<PriceFields
                form={form}
                config={config}
                sized={sized}
                wasPricedByCalc={wasPricedByCalc}
                fallbackPrice={fallbackPrice}
                setFallbackPrice={setFallbackPrice}
                set={set}
              />
            </Step>
          </div>

          {/* ───── ผล ───── */}
          <aside className="border-t border-slate-200 bg-slate-50 px-5 py-4 lg:border-t-0 lg:border-l" aria-live="polite">
            <ResultPanel
              config={config}
              result={result}
              sized={sized}
              piecesPerBox={config.piecesPerBox}
              priced={config.priced}
              wastePct={config.wastePct}
              lineQty={lineQty}
              materialPrice={materialPrice}
              oldMaterialPrice={Number(item.materialUnitPrice)}
              lineTotal={lineTotal}
              oldLineTotal={Number(item.lineTotal)}
              components={components}
            />
          </aside>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-5 py-3">
          {onDetach && (
            <Button variant="dangerQuiet" size="sm" onClick={detach} disabled={saving}>
              เลิกใช้ตัวคิด
            </Button>
          )}
          {issue && (
            <span className="flex flex-wrap items-center gap-2 text-xs text-amber-700">
              {issue.text}
              {openStep !== issue.step && (
                <button type="button" onClick={() => setOpenStep(issue.step)} className="font-medium underline underline-offset-2">
                  ไปแก้
                </button>
              )}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={apply} disabled={Boolean(blocker) || saving}>
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </div>
      </dialog>
    </div>,
    document.body,
  );
}

/** หมวด 1 — ขนาด/ความหนา/ร่อง/แผ่นต่อกล่อง (เลือกจากคลังหรือกรอกเอง) */
function TileFields({
  form,
  config,
  sized,
  tileMaterials,
  set,
  onPickMaterial,
}: Readonly<{
  form: TileForm;
  config: TileCalcConfig;
  sized: boolean;
  tileMaterials: MaterialDto[];
  set: (patch: Partial<TileForm>) => void;
  onPickMaterial: (id: string) => void;
}>) {
  return (
    <>
      {tileMaterials.length > 0 && (
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          <span>เลือกจากคลังวัสดุ</span>
          <select
            value={form.sourceMaterialId}
            onChange={(e) => onPickMaterial(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">— กรอกขนาดเอง —</option>
            {tileMaterials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code ? `${m.code} · ` : ""}
                {m.name} ({m.tileWidthMm}×{m.tileLengthMm})
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-slate-600">ขนาดยอดนิยม</span>
        <div className="flex flex-wrap gap-2">
          {SIZE_PRESETS.map(([w, l]) => {
            const active =
              (config.widthMm === w && config.lengthMm === l) || (config.widthMm === l && config.lengthMm === w);
            return (
              <button
                key={`${w}x${l}`}
                type="button"
                aria-pressed={active}
                onClick={() => set({ widthMm: String(w), lengthMm: String(l), sourceMaterialId: "" })}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors ${
                  active
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                <TileShape widthMm={w} lengthMm={l} />
                {cm(w)}×{cm(l)} ซม.
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label="กว้าง (มม.)">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={form.widthMm}
            onChange={(e) => set({ widthMm: e.target.value, sourceMaterialId: "" })}
            placeholder="300"
            aria-label="กว้างของแผ่น (มม.)"
            className={numInput}
          />
        </Field>
        <Field label="ยาว (มม.)">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={form.lengthMm}
            onChange={(e) => set({ lengthMm: e.target.value, sourceMaterialId: "" })}
            placeholder="300"
            aria-label="ยาวของแผ่น (มม.)"
            className={numInput}
          />
        </Field>
        <Field label="หนา (มม.)" isDefault={sized && form.thicknessMm.trim() === ""}>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            value={form.thicknessMm}
            onChange={(e) => set({ thicknessMm: e.target.value })}
            placeholder={sized ? String(defaultTileThicknessMm(config.widthMm, config.lengthMm)) : ""}
            aria-label="ความหนาแผ่น (มม.)"
            className={`${numInput} ${DEFAULT_PLACEHOLDER}`}
          />
        </Field>
        <Field label="ร่องยาแนว (มม.)" isDefault={sized && form.jointMm.trim() === ""}>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            value={form.jointMm}
            onChange={(e) => set({ jointMm: e.target.value })}
            placeholder={sized ? String(defaultTileJointMm(config.widthMm, config.lengthMm)) : ""}
            aria-label="ความกว้างร่องยาแนว (มม.)"
            className={`${numInput} ${DEFAULT_PLACEHOLDER}`}
          />
        </Field>
        <Field label="แผ่นต่อกล่อง">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={form.piecesPerBox}
            onChange={(e) => set({ piecesPerBox: e.target.value })}
            placeholder="ดูข้างกล่อง"
            aria-label="แผ่นต่อกล่อง"
            className={numInput}
          />
        </Field>
      </div>
      <p className="text-xs text-slate-400">
        ช่องที่มีป้าย &quot;ค่าตั้งต้น&quot; ระบบใช้ค่านั้นอยู่แล้ว — กรอกทับเมื่อของจริงต่างจากนี้
      </p>
    </>
  );
}

/** หมวด 2 — รูปแบบการปู · หมุนแผ่น · เผื่อแตกหัก */
function PatternFields({
  form,
  config,
  sized,
  set,
}: Readonly<{ form: TileForm; config: TileCalcConfig; sized: boolean; set: (patch: Partial<TileForm>) => void }>) {
  return (
    <>
      <div role="radiogroup" aria-label="รูปแบบการปู" className="grid grid-cols-3 gap-2 sm:max-w-md">
        {TILE_PATTERNS.map((p) => {
          const active = form.pattern === p.value;
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => set({ pattern: p.value })}
              className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs transition-colors ${
                active
                  ? "border-slate-800 text-slate-800 ring-1 ring-slate-800"
                  : "border-slate-200 text-slate-600 hover:border-slate-400"
              }`}
            >
              <PatternIcon pattern={p.value} />
              <span className={active ? "font-medium" : undefined}>{p.label}</span>
            </button>
          );
        })}
      </div>
      {sized && config.widthMm !== config.lengthMm && form.pattern === "STRAIGHT" && (
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={form.rotate} onChange={(e) => set({ rotate: e.target.checked })} />
          <span>วางด้านยาวของแผ่นตามแนว &quot;กว้าง&quot; ของห้อง</span>
        </label>
      )}
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <span>เผื่อแตกหัก/สำรองซ่อม</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max="50"
          step="any"
          value={form.wastePct}
          onChange={(e) => set({ wastePct: e.target.value })}
          aria-label="เผื่อแตกหัก (%)"
          className="w-16 rounded-md border border-slate-300 px-2 py-0.5 text-right text-sm"
        />
        <span>%</span>
        <span className="text-slate-400">· เศษจากการตัดแผ่น ระบบเผื่อให้เองตามวิธีปู</span>
      </label>
    </>
  );
}

/** หมวด 3 — ตารางขนาดห้อง (แถวหัก = ส่วนที่ไม่ปู) พร้อมจำนวนแผ่นต่อแถว */
function RoomsTable({
  rooms,
  setRooms,
  piecesByIndex,
}: Readonly<{
  rooms: RoomRow[];
  setRooms: (update: (prev: RoomRow[]) => RoomRow[]) => void;
  piecesByIndex: Map<number, number>;
}>) {
  function updateRoom(index: number, patch: Partial<RoomRow>) {
    setRooms((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1.5">
            <tr>
              <th className="min-w-36">ห้อง / ตำแหน่ง</th>
              <th className="w-20 text-right">จำนวน</th>
              <th className="w-24 text-right">ยาว (ม.)</th>
              <th className="w-24 text-right">กว้าง (ม.)</th>
              <th className="w-16 text-right">แผ่น</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {rooms.map((r, i) => (
              <tr key={r.key} className={`border-t border-slate-100 ${r.deduct ? "bg-red-50/60" : ""}`}>
                <td className="px-2 py-1">
                  <div className="flex items-center gap-1.5">
                    {r.deduct && (
                      <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">หัก</span>
                    )}
                    <input
                      value={r.label}
                      onChange={(e) => updateRoom(i, { label: e.target.value })}
                      placeholder={r.deduct ? "เช่น ฐานเคาน์เตอร์" : "เช่น ห้องน้ำ 1"}
                      maxLength={120}
                      aria-label={`ชื่อห้อง แถว ${i + 1}`}
                      className={input}
                    />
                  </div>
                </td>
                {(["count", "length", "width"] as const).map((k) => (
                  <td key={k} className="px-2 py-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={r[k]}
                      onChange={(e) => updateRoom(i, { [k]: e.target.value })}
                      aria-label={`${ROOM_FIELD_LABEL[k]} แถว ${i + 1}`}
                      className={numInput}
                    />
                  </td>
                ))}
                <td className={`px-2 py-1 text-right tabular-nums ${r.deduct ? "text-red-700" : "text-slate-700"}`}>
                  {roomPiecesText(piecesByIndex.get(i), r.deduct) ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="px-1 py-1">
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      type="button"
                      onClick={() => updateRoom(i, { deduct: !r.deduct })}
                      title={r.deduct ? "เปลี่ยนเป็นห้องที่ปู" : "เปลี่ยนเป็นส่วนที่ไม่ปู (หัก)"}
                      aria-pressed={r.deduct}
                      aria-label={`แถวหัก แถว ${i + 1}`}
                      className={`rounded p-1 ${r.deduct ? "text-red-600 hover:bg-red-100" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
                    >
                      <Minus size={14} />
                    </button>
                    <Tooltip label="ลบแถว" side="top" align="end">
                      <button
                        type="button"
                        onClick={() => setRooms((prev) => (prev.length === 1 ? [blankRoom()] : prev.filter((_, j) => j !== i)))}
                        aria-label={`ลบแถว ${i + 1}`}
                        title="ลบแถว"
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setRooms((p) => [...p, blankRoom()])}>
          <Plus size={14} /> เพิ่มห้อง
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setRooms((p) => [...p, blankRoom(true)])}>
          <Minus size={14} /> เพิ่มส่วนที่ไม่ปู
        </Button>
        <span className="text-xs text-slate-400">ผนัง: ยาว = ความยาวผนัง · กว้าง = ความสูงที่ปู</span>
      </div>
    </>
  );
}

/** หมวด 4 — ปูนกาว · ยาแนว · คิ้วจบขอบ */
function ExtrasFields({
  form,
  config,
  sized,
  set,
}: Readonly<{ form: TileForm; config: TileCalcConfig; sized: boolean; set: (patch: Partial<TileForm>) => void }>) {
  const defaults = sized ? defaultAdhesive(config.widthMm, config.lengthMm) : null;
  const groutPerSqm = sized ? groutKgPerSqm(config.widthMm, config.lengthMm, config.jointMm, config.thicknessMm) : 0;
  return (
    <>
      <Accessory
        checked={form.useAdhesive}
        onToggle={(v) => set({ useAdhesive: v })}
        label="ปูนกาว"
        hint={defaults ? `ค่าตั้งต้นสำหรับเกรียงร่อง ${defaults.trowelMm} มม. — แก้ตามฉลากถุงที่ใช้` : undefined}
      >
        <MiniField
          label="กก./ตร.ม."
          value={form.adhesiveKg}
          placeholder={defaults ? String(defaults.kgPerSqm) : ""}
          isDefault={defaults != null && form.adhesiveKg.trim() === ""}
          onChange={(v) => set({ adhesiveKg: v })}
        />
        <MiniField label="กก./ถุง" value={form.bagKg} onChange={(v) => set({ bagKg: v })} />
        <MiniField label="เผื่อ %" value={form.adhesiveWaste} onChange={(v) => set({ adhesiveWaste: v })} />
      </Accessory>
      <Accessory
        checked={form.useGrout}
        onToggle={(v) => set({ useGrout: v })}
        label="ยาแนว"
        hint={sized && groutPerSqm > 0 ? `ใช้ ${num(groutPerSqm)} กก./ตร.ม. คิดจากขนาดแผ่น ร่อง และความหนา` : undefined}
      >
        <MiniField label="กก./ถุง" value={form.packKg} onChange={(v) => set({ packKg: v })} />
        <MiniField label="เผื่อ %" value={form.groutWaste} onChange={(v) => set({ groutWaste: v })} />
      </Accessory>
      <Accessory checked={form.useTrim} onToggle={(v) => set({ useTrim: v })} label="คิ้วจบขอบ" hint="ขอบที่ไม่ชนผนัง เช่น ขอบขั้นบันได มุมเสา">
        <MiniField label="ความยาวขอบรวม (ม.)" value={form.trimLength} onChange={(v) => set({ trimLength: v })} wide />
        <MiniField label="ม./เส้น" value={form.trimPieceLength} onChange={(v) => set({ trimPieceLength: v })} />
      </Accessory>
    </>
  );
}

/** หมวด 5 — คงราคาเหมา หรือให้ตัวคิดตั้งราคาวัสดุ (กระเบื้อง + ของประกอบ) */
function PriceFields({
  form,
  config,
  sized,
  wasPricedByCalc,
  fallbackPrice,
  setFallbackPrice,
  set,
}: Readonly<{
  form: TileForm;
  config: TileCalcConfig;
  sized: boolean;
  wasPricedByCalc: boolean;
  fallbackPrice: string;
  setFallbackPrice: (v: string) => void;
  set: (patch: Partial<TileForm>) => void;
}>) {
  return (
    <>
      <div role="radiogroup" aria-label="วิธีตั้งราคา" className="flex flex-col gap-1.5 text-sm">
        <label className="flex items-start gap-2">
          <input type="radio" checked={!form.priced} onChange={() => set({ priced: false })} className="mt-1" />
          <span>
            <span className="font-medium text-slate-800">คงราคาเหมาเดิม</span>{" "}
            <span className="text-slate-500">— ใช้ตัวคิดดูจำนวนแผ่น/กล่องอย่างเดียว ราคาบรรทัดไม่เปลี่ยน</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" checked={form.priced} onChange={() => set({ priced: true })} className="mt-1" />
          <span>
            <span className="font-medium text-slate-800">ตั้งราคาวัสดุจากรายการนี้</span>{" "}
            <span className="text-slate-500">— ราคาวัสดุ/ตร.ม. = กระเบื้องที่ต้องใช้จริง + ของประกอบ</span>
          </span>
        </label>
      </div>
      {!form.priced && wasPricedByCalc && (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <span>ราคาวัสดุต่อ ตร.ม. ที่จะใช้แทน</span>
          <input
            type="number"
            min="0"
            step="any"
            value={fallbackPrice}
            onChange={(e) => setFallbackPrice(e.target.value)}
            aria-label="ราคาวัสดุต่อ ตร.ม. ที่จะใช้แทน"
            className="w-28 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
          />
          <span>บาท</span>
        </label>
      )}
      {form.priced && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="ราคากระเบื้อง (บาท)">
            <div className="flex gap-1">
              <input
                type="number"
                min="0"
                step="any"
                value={form.tilePrice}
                onChange={(e) => set({ tilePrice: e.target.value })}
                aria-label="ราคากระเบื้อง"
                className={numInput}
              />
              <select
                value={form.tilePriceUnit}
                onChange={(e) => set({ tilePriceUnit: e.target.value as TilePriceUnit })}
                aria-label="ราคาต่อ"
                className="rounded-md border border-slate-300 px-1 text-xs"
              >
                <option value="SQM">/ตร.ม.</option>
                <option value="BOX">/กล่อง</option>
                <option value="PIECE">/แผ่น</option>
              </select>
            </div>
          </Field>
          {form.useAdhesive && (
            <Field label="ปูนกาว (บาท/ถุง)">
              <input type="number" min="0" step="any" value={form.adhesivePrice} onChange={(e) => set({ adhesivePrice: e.target.value })} aria-label="ราคาปูนกาวต่อถุง" className={numInput} />
            </Field>
          )}
          {form.useGrout && (
            <Field label="ยาแนว (บาท/ถุง)">
              <input type="number" min="0" step="any" value={form.groutPrice} onChange={(e) => set({ groutPrice: e.target.value })} aria-label="ราคายาแนวต่อถุง" className={numInput} />
            </Field>
          )}
          {form.useTrim && (
            <Field label="คิ้ว (บาท/เส้น)">
              <input type="number" min="0" step="any" value={form.trimPrice} onChange={(e) => set({ trimPrice: e.target.value })} aria-label="ราคาคิ้วต่อเส้น" className={numInput} />
            </Field>
          )}
        </div>
      )}
      <Field label="ชื่อกระเบื้องในรายการสั่งซื้อ">
        <input
          value={form.tileName}
          onChange={(e) => set({ tileName: e.target.value })}
          placeholder={sized ? tileDisplayName({ ...config, tileName: "", piecesPerBox: null }) : "เช่น แกรนิตโต้ 60×60 สีเทา"}
          maxLength={120}
          className={input}
        />
      </Field>
    </>
  );
}

function DefaultBadge() {
  return <span className="rounded bg-slate-100 px-1 py-px text-[10px] font-normal text-slate-500">ค่าตั้งต้น</span>;
}

function Field({ label, isDefault, children }: Readonly<{ label: string; isDefault?: boolean; children: ReactNode }>) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-600">
      <span>{label}</span>
      {/* ป้ายอยู่ในช่อง (ชิดซ้าย ตัวเลขชิดขวา) — ไว้ที่หัวช่องแล้วหัวยาวตัดบรรทัด ช่องเลื่อนไม่ตรงแถว */}
      <span className="relative block">
        {children}
        {isDefault && (
          <span className="pointer-events-none absolute top-1/2 left-1.5 -translate-y-1/2">
            <DefaultBadge />
          </span>
        )}
      </span>
    </label>
  );
}

/** หมวดพับได้ — ปิดอยู่ก็ยังบอกค่าที่ใช้ (summary) และมีจุดเตือนถ้าหมวดนี้กั้นการบันทึกอยู่ */
function Step({
  n,
  title,
  summary,
  open,
  onToggle,
  flagged,
  children,
}: Readonly<{
  n: number;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  flagged?: boolean;
  children: ReactNode;
}>) {
  const bodyId = `tile-step-${n}`;
  return (
    <section className={`rounded-lg border ${open ? "border-slate-300" : "border-slate-200"}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"
      >
        <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-slate-800 text-[11px] font-medium text-white">
          {n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">{title}</span>
          {!open && <span className="block truncate text-xs text-slate-500">{summary}</span>}
        </span>
        {flagged && <span className="h-2 w-2 flex-none rounded-full bg-amber-500" title="หมวดนี้ยังมีช่องที่ต้องแก้" />}
        <span className="flex flex-none items-center gap-1 text-xs text-slate-400">
          {open ? "ย่อ" : "แก้"}
          <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div id={bodyId} className="flex flex-col gap-3 border-t border-slate-100 px-3 py-3">
          {children}
        </div>
      )}
    </section>
  );
}

/** รูปแผ่นตามสัดส่วนจริงบนปุ่มขนาด */
function TileShape({ widthMm, lengthMm }: Readonly<{ widthMm: number; lengthMm: number }>) {
  const max = Math.max(widthMm, lengthMm);
  const w = Math.max(5, Math.round((14 * widthMm) / max));
  const h = Math.max(5, Math.round((14 * lengthMm) / max));
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x={(14 - w) / 2 + 0.5} y={(14 - h) / 2 + 0.5} width={w - 1} height={h - 1} fill="none" stroke="currentColor" />
    </svg>
  );
}

/** รูปลายปู — คนที่ไม่เคยได้ยินชื่อลายเห็นแล้วรู้ทันที */
function PatternIcon({ pattern }: Readonly<{ pattern: TilePattern }>) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1 } as const;
  return (
    <svg width="56" height="36" viewBox="0 0 56 36" aria-hidden className="text-slate-500">
      <rect x="0.5" y="0.5" width="55" height="35" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.25" />
      {pattern === "STRAIGHT" && (
        <g {...stroke}>
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={4 + c * 16} y={3 + r * 10} width={16} height={10} />),
          )}
        </g>
      )}
      {pattern === "DIAGONAL" && (
        <g {...stroke}>
          <clipPath id="tile-diag-clip">
            <rect x="1" y="1" width="54" height="34" />
          </clipPath>
          <g clipPath="url(#tile-diag-clip)">
            {[-3, -2, -1, 0, 1, 2, 3, 4, 5].map((i) => (
              <g key={i}>
                <line x1={i * 10} y1={0} x2={i * 10 + 36} y2={36} />
                <line x1={i * 10 + 36} y1={0} x2={i * 10} y2={36} />
              </g>
            ))}
          </g>
        </g>
      )}
      {pattern === "HERRINGBONE" && (
        <g {...stroke}>
          {[0, 1, 2].map((r) => (
            <g key={r} transform={`translate(0 ${r * 11})`}>
              <polyline points="2,12 8,4 14,12 20,4 26,12 32,4 38,12 44,4 50,12 54,7" />
              <polyline points="2,7 8,-1 14,7 20,-1 26,7 32,-1 38,7 44,-1 50,7 54,2" strokeOpacity="0.6" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

function MiniField({
  label,
  value,
  onChange,
  placeholder,
  isDefault,
  wide,
}: Readonly<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  isDefault?: boolean;
  wide?: boolean;
}>) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-slate-500 ${wide ? "w-36" : "w-28"}`}>
      <span>{label}</span>
      <span className="relative block">
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums ${isDefault ? DEFAULT_PLACEHOLDER : ""}`}
      />
        {isDefault && (
          <span className="pointer-events-none absolute top-1/2 left-1.5 -translate-y-1/2">
            <DefaultBadge />
          </span>
        )}
      </span>
    </label>
  );
}

function Accessory({
  checked,
  onToggle,
  label,
  hint,
  children,
}: Readonly<{ checked: boolean; onToggle: (v: boolean) => void; label: string; hint?: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
        <span className="font-medium text-slate-800">{label}</span>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </label>
      {checked && <div className="flex flex-wrap gap-3 pl-6">{children}</div>}
    </div>
  );
}

/** สรุปเป็นประโยค — อ่านแล้วเข้าใจทันที และคัดลอกส่งช่าง/ร้านวัสดุได้ตรง ๆ */
function summaryLines(config: TileCalcConfig, result: ReturnType<typeof tileTakeoff>): string[] {
  const pattern = TILE_PATTERNS.find((p) => p.value === config.pattern)?.label ?? "";
  const lines = [`ปูพื้นที่ ${num(result.area)} ตร.ม. ด้วยแผ่น ${cm(config.widthMm)}×${cm(config.lengthMm)} ซม. แบบ${pattern}`];
  const order =
    result.boxes != null ? `${num(result.boxes, 0)} กล่อง (${num(result.pieces, 0)} แผ่น)` : `${num(result.pieces, 0)} แผ่น`;
  const allowance = [
    result.cutPct > 0 ? `เผื่อเศษตัด ${num(result.cutPct)}%` : null,
    config.wastePct > 0 ? `แตกหัก ${num(config.wastePct)}%` : null,
  ].filter(Boolean);
  const allowanceNote = allowance.length > 0 ? ` (รวม${allowance.join(" และ")})` : "";
  lines.push(`ต้องสั่งกระเบื้อง ${order}${allowanceNote}`);
  const extras = [
    result.adhesive && config.adhesive ? `ปูนกาว ${result.adhesive.bags} ถุง (ถุงละ ${num(config.adhesive.bagKg)} กก.)` : null,
    result.grout && config.grout ? `ยาแนว ${result.grout.packs} ถุง (ถุงละ ${num(config.grout.packKg)} กก.)` : null,
    result.trim ? `คิ้วจบขอบ ${result.trim.pieces} เส้น` : null,
  ].filter(Boolean);
  if (extras.length > 0) lines.push(extras.join(" · "));
  return lines;
}

function ResultPanel({
  config,
  result,
  sized,
  piecesPerBox,
  priced,
  wastePct,
  lineQty,
  materialPrice,
  oldMaterialPrice,
  lineTotal,
  oldLineTotal,
  components,
}: Readonly<{
  config: TileCalcConfig;
  result: ReturnType<typeof tileTakeoff>;
  sized: boolean;
  piecesPerBox: number | null;
  priced: boolean;
  wastePct: number;
  lineQty: number;
  materialPrice: number;
  oldMaterialPrice: number;
  lineTotal: number;
  oldLineTotal: number;
  components: ReturnType<typeof tileComponents>;
}>) {
  const [copied, setCopied] = useState(false);
  if (!sized || result.errors.length > 0 || result.pieces === 0) {
    return <p className="text-sm text-slate-500">กรอกขนาดแผ่นและพื้นที่ปู แล้วผลจะขึ้นที่นี่</p>;
  }
  const allowance = result.cutPct + wastePct;
  // คิดจากพื้นที่ = แผ่นตั้งต้นเป็นเศษ (13,751.073) — โชว์จำนวนเต็มแล้วให้ส่วนเผื่อเป็นส่วนต่างที่เหลือ
  // ตัวเลขสองบรรทัดจึงบวกกันได้ยอดที่ต้องสั่งพอดีเสมอ
  const baseShown = Math.round(result.basePieces);
  const lines = summaryLines(config, result);

  async function copy() {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // เบราว์เซอร์ไม่ให้เข้าคลิปบอร์ด (เช่น ไม่ใช่ https) — ผู้ใช้ลากคลุมข้อความเองได้
    }
  }

  return (
    <div className="flex flex-col gap-4 text-sm lg:sticky lg:top-0">
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
        <p className="text-xs text-slate-500">กระเบื้องที่ต้องสั่ง</p>
        <p className="mt-0.5 text-2xl font-semibold text-brand tabular-nums">
          {result.boxes != null ? `${num(result.boxes, 0)} กล่อง` : `${num(result.pieces, 0)} แผ่น`}
        </p>
        <p className="text-xs text-slate-500 tabular-nums">
          {result.boxes != null
            ? `ใช้ ${num(result.pieces, 0)} แผ่น · เหลือ ${num(result.boxes * piecesPerBox! - result.pieces, 0)} แผ่น`
            : "ใส่แผ่นต่อกล่อง (หมวด ①) เพื่อคิดเป็นกล่อง"}
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg bg-white/70 px-3 py-2.5 ring-1 ring-slate-200">
        <ul className="flex flex-col gap-1 leading-relaxed text-slate-700">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 self-start rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "คัดลอกแล้ว" : "คัดลอกข้อความ"}
        </button>
      </div>

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer text-brand">วิธีคิด</summary>
        <p className="mt-1.5 font-medium text-slate-500">
          {result.mode === "LAYOUT" ? "นับตามแนวปูทีละห้อง" : "คิดจากพื้นที่ + เผื่อเศษตัด"}
        </p>
        {result.areaReason && <p className="mt-0.5 text-slate-400">{result.areaReason}</p>}
        <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
          <dt>พื้นที่ปูสุทธิ</dt>
          <dd className="text-right text-slate-700">{num(result.area)} ตร.ม.</dd>
          <dt>{result.mode === "LAYOUT" ? "แผ่นตามแนวปู" : "พื้นที่ ÷ ขนาดแผ่น"}</dt>
          <dd className="text-right text-slate-700">
            {baseShown !== result.basePieces && "≈ "}
            {num(baseShown, 0)} แผ่น
          </dd>
          {allowance > 0 && (
            <>
              <dt>
                เผื่อ{result.cutPct > 0 && ` เศษตัด ${num(result.cutPct)}%`}
                {result.cutPct > 0 && wastePct > 0 && " +"}
                {wastePct > 0 && ` แตกหัก ${num(wastePct)}%`}
              </dt>
              <dd className="text-right text-slate-700">+{num(result.pieces - baseShown, 0)} แผ่น</dd>
            </>
          )}
          {result.adhesive && (
            <>
              <dt>ปูนกาว</dt>
              <dd className="text-right text-slate-700">{num(result.adhesive.kg, 1)} กก.</dd>
            </>
          )}
          {result.grout && (
            <>
              <dt>ยาแนว</dt>
              <dd className="text-right text-slate-700">{num(result.grout.kg, 2)} กก.</dd>
            </>
          )}
        </dl>
        {result.rooms.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {withUniqueKeys(result.rooms, (r) => r.label).map(({ item: r, key }) => (
              <li key={key} className={r.deduct ? "text-red-700" : undefined}>
                <span className="font-medium">{r.label}</span> — {r.explain}
              </li>
            ))}
          </ul>
        )}
      </details>

      <div className="border-t border-slate-200 pt-3">
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
          <dt className="text-slate-500">ปริมาณบรรทัด</dt>
          <dd className="text-right text-slate-700">{num(lineQty)} ตร.ม.</dd>
          <dt className="text-slate-500">ราคาวัสดุ/ตร.ม.</dt>
          <dd className="text-right text-slate-700">
            {materialPrice !== oldMaterialPrice && <span className="mr-1 text-slate-400 line-through">{baht(oldMaterialPrice)}</span>}
            {baht(materialPrice)}
          </dd>
          <dt className="font-medium text-slate-700">รวมบรรทัด</dt>
          <dd className="text-right font-semibold text-slate-900">
            {lineTotal !== oldLineTotal && <span className="mr-1 font-normal text-slate-400 line-through">{baht(oldLineTotal)}</span>}
            {baht(lineTotal)}
          </dd>
        </dl>
        {priced && components.length > 0 && (
          <ul className="mt-2 flex flex-col gap-0.5 text-xs text-slate-500">
            {components.map((c) => (
              <li key={c.name}>
                {c.name}: {num(c.qtyPerUnit, 4)} {c.unit}/ตร.ม. × {baht(c.unitPrice)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
