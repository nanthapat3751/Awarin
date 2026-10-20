import {
  DEFAULT_COVER,
  DEFAULT_TAKEOFF_RULES,
  STANDARD_REBARS,
  STRUCTURAL_KINDS,
  isWeightUnit,
  structuralTakeoff,
  takeoffShapeForUnit,
  type BoqItemDto,
  type FootingType,
  type MaterialDto,
  type MeshEnd,
  type StructuralInput,
  type StructuralKind,
  type StructuralMemberDto,
  type StructuralOutputRow,
  type TakeoffRuleSet,
} from "@systemboq/shared-types";
import { Boxes, ChevronDown, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ApiError } from "../lib/api";
import { applyTakeoff, replaceStructuralMember, type TakeoffTarget } from "../lib/boq-api";
import { getTakeoffRules } from "../lib/settings-api";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";
import { Notice } from "./Notice";
import { SearchableSelect, type SearchableOption } from "./SearchableSelect";

const fmtQty = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** ปลายทางของผลลัพธ์หนึ่งก้อน: บรรทัดเดิม · บรรทัดใหม่ · ไม่ลง */
type Target = { kind: "item"; itemId: string } | { kind: "new" } | { kind: "skip" };

interface NewLine {
  materialId: string;
  categoryId: string;
}

/** ผลลัพธ์รวมเป็นก้อนตามบรรทัดปลายทาง: คอนกรีต · ไม้แบบ · เหล็กแต่ละขนาด */
interface OutputGroup {
  key: string;
  title: string;
  unit: string;
  /** ชื่อบรรทัดใหม่ตั้งต้น (ถ้าไม่เลือกวัสดุจากคลัง) */
  defaultName: string;
  rows: StructuralOutputRow[];
  total: number;
  fits: (unit: string) => boolean;
  /** คำในชื่อบรรทัดที่น่าจะเป็นปลายทาง — ใช้เดาให้ตั้งต้น */
  keywords: string[];
}

function barCode(dia: number) {
  return STANDARD_REBARS.find((b) => b.diameterMm === dia)?.code ?? `${dia} มม.`;
}

function groupsOf(rows: StructuralOutputRow[]): OutputGroup[] {
  const groups: OutputGroup[] = [];
  const concrete = rows.filter((r) => r.group === "CONCRETE");
  const formwork = rows.filter((r) => r.group === "FORMWORK");
  const sum = (rs: StructuralOutputRow[]) => rs.reduce((n, r) => n + r.value, 0);
  if (concrete.length) {
    groups.push({
      key: "CONCRETE",
      title: "คอนกรีต",
      unit: "ลบ.ม.",
      defaultName: "คอนกรีตโครงสร้าง",
      rows: concrete,
      total: sum(concrete),
      fits: (u) => takeoffShapeForUnit(u) === "VOLUME",
      keywords: ["คอนกรีต"],
    });
  }
  if (formwork.length) {
    groups.push({
      key: "FORMWORK",
      title: "ไม้แบบ",
      unit: "ตร.ม.",
      defaultName: "ไม้แบบ",
      rows: formwork,
      total: sum(formwork),
      fits: (u) => takeoffShapeForUnit(u) === "AREA",
      keywords: ["แบบ"],
    });
  }
  const dias = [...new Set(rows.filter((r) => r.group === "REBAR").map((r) => r.row.barDia!))].sort((a, b) => a - b);
  for (const dia of dias) {
    const rs = rows.filter((r) => r.group === "REBAR" && r.row.barDia === dia);
    const code = barCode(dia);
    const round = dia === 6 || dia === 9;
    groups.push({
      key: `REBAR-${dia}`,
      title: `เหล็ก ${code}`,
      unit: "กก.",
      defaultName: `${round ? "เหล็กเส้นกลม" : "เหล็กข้ออ้อย"} ${code}`,
      rows: rs,
      total: sum(rs),
      fits: isWeightUnit,
      keywords: [code, `${dia} มม`, `${dia}มม`],
    });
  }
  return groups;
}

/** บรรทัดที่รับแถวได้: กรอกเอง/ใบถอดแบบ (บรรทัดที่คิดจากค่าวัดรับไม่ได้) และหน่วยเข้ากัน */
function candidatesFor(group: OutputGroup, items: BoqItemDto[]) {
  return items.filter((i) => (i.qtyBasis === "MANUAL" || i.qtyBasis === "SHEET") && group.fits(i.unit));
}

function suggestTarget(group: OutputGroup, items: BoqItemDto[], remembered: Map<string, string>): Target {
  const candidates = candidatesFor(group, items);
  // บรรทัดที่เพิ่งสร้างจากรอบก่อน (ทำชิ้นถัดไป) ต้องถูกเลือกต่อ ไม่งั้นได้บรรทัดซ้ำ
  const name = remembered.get(group.key);
  const byName = name ? candidates.find((i) => i.name === name) : undefined;
  if (byName) return { kind: "item", itemId: byName.id };
  const byKeyword = candidates.find((i) => group.keywords.some((k) => i.name.includes(k)));
  if (byKeyword) return { kind: "item", itemId: byKeyword.id };
  return { kind: "new" };
}

const LABEL = "flex flex-col gap-1 text-xs text-slate-600";
const INPUT = "w-full min-w-0 rounded-md border border-slate-300 px-2 py-1 text-sm text-right tabular-nums";

function NumberField({
  label,
  value,
  onChange,
  suffix,
  step = "any",
}: Readonly<{ label: ReactNode; value: string; onChange: (v: string) => void; suffix?: string; step?: string }>) {
  return (
    <label className={LABEL}>
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT}
        />
        {suffix && <span className="shrink-0 text-slate-400">{suffix}</span>}
      </span>
    </label>
  );
}

function BarSelect({ value, onChange, label }: Readonly<{ value: string; onChange: (v: string) => void; label: string }>) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="rounded-md border border-slate-300 px-1.5 py-1 text-sm"
    >
      {STANDARD_REBARS.map((b) => (
        <option key={b.code} value={b.diameterMm}>
          {b.code}
        </option>
      ))}
    </select>
  );
}

/** แถวกรอกเหล็ก: [จำนวน] เส้น [ขนาด] หรือ [ขนาด] @ [ระยะ] ม. */
function BarRow({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    // หัวข้อชิดบนให้ตรงกับแถวช่องกรอกแถวแรก — แถวที่มีคำอธิบายบรรทัดล่าง ถ้าจัดกลางหัวข้อจะไหลลงไปอยู่ระหว่างช่องกับคำอธิบาย
    // pt ชดเชยให้ตัวอักษรอยู่กึ่งกลางความสูงช่องกรอก (วัดจริง: ช่องกรอก/ตัวเลือกสูง ~38px)
    <div className="grid grid-cols-[6.5rem_1fr] items-start gap-2 text-sm">
      <span className="pt-[11px] text-xs leading-4 text-slate-600">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** ภาพลายเส้นของชิ้นส่วน พร้อมตัวอักษรที่ตรงกับช่องกรอก — ให้รู้ว่า "กว้าง" คือด้านไหน */
function KindDiagram({ kind, small = false }: Readonly<{ kind: StructuralKind; small?: boolean }>) {
  const size = small ? 48 : 132;
  const stroke = "currentColor";
  const label = (x: number, y: number, t: string) =>
    small ? null : (
      <text x={x} y={y} fontSize="9" fill="currentColor" textAnchor="middle" className="fill-brand">
        {t}
      </text>
    );
  return (
    // ไอคอนบนปุ่มเลือกชนิด: สีตามปุ่ม (เลือกอยู่ = นาวี) · ภาพใหญ่ในกล่องขนาด: เทา
    <svg viewBox="0 0 120 80" width={size} height={(size * 80) / 120} aria-hidden className={small ? undefined : "text-slate-500"}>
      {kind === "FOOTING" && (
        <>
          <rect x="44" y="10" width="32" height="30" fill="none" stroke={stroke} strokeDasharray="3 2" />
          <path d="M20 40 L100 40 L100 58 L20 58 Z" fill="currentColor" fillOpacity="0.12" stroke={stroke} />
          {label(60, 72, "กว้าง × ยาว")}
          {label(110, 52, "หนา")}
        </>
      )}
      {kind === "COLUMN" && (
        <>
          <rect x="50" y="6" width="20" height="62" fill="currentColor" fillOpacity="0.12" stroke={stroke} />
          {label(38, 40, "สูง")}
          {label(60, 77, "กว้าง × ลึก")}
        </>
      )}
      {kind === "BEAM" && (
        <>
          {/* ป้าย "ลึก" ต้องอยู่ในกรอบภาพ (viewBox กว้าง 120) — เดิมวางที่ x 116 ตัวอักษรล้นไปทับช่องกรอกข้าง ๆ */}
          <rect x="6" y="24" width="76" height="22" fill="currentColor" fillOpacity="0.12" stroke={stroke} />
          <rect x="86" y="24" width="12" height="22" fill="none" stroke={stroke} />
          {label(44, 60, "ยาวรวม")}
          {label(92, 18, "กว้าง")}
          {label(109, 38, "ลึก")}
        </>
      )}
      {kind === "STAIR" && (
        <>
          <path d="M14 62 L14 54 L30 54 L30 44 L46 44 L46 34 L62 34 L62 24 L78 24 L78 14 L100 14 L100 22 L22 66 Z" fill="currentColor" fillOpacity="0.12" stroke={stroke} />
          {label(52, 77, "ระยะราบ")}
          {label(110, 42, "สูง")}
        </>
      )}
      {kind === "SLAB" && (
        <>
          <path d="M12 44 L40 28 L108 28 L80 44 Z" fill="currentColor" fillOpacity="0.12" stroke={stroke} />
          <path d="M12 44 L12 50 L80 50 L80 44 M80 50 L108 34 L108 28" fill="none" stroke={stroke} />
          {label(60, 66, "กว้าง × ยาว")}
          {label(60, 20, "หนา")}
        </>
      )}
    </svg>
  );
}

/**
 * วิธีวัดที่สูตรตั้งไว้ — ทุกชนิดต้องวัดแบบเดียวกันถึงจะไม่นับคอนกรีตซ้ำตรงรอยต่อ:
 * เสาคิดเต็มความสูง · คานคิดช่วงสุทธิระหว่างหน้าเสาและใต้ท้องพื้น · พื้นคิดเต็มพื้นที่
 */
const MEASURE_HINTS: Record<StructuralKind, string> = {
  FOOTING: "วัดขนาดฐานรากตามแบบ — เสาตอม่อคิดในชนิด “เสา”",
  COLUMN: "สูง = วัดเต็มความสูงจากหลังฐานราก (หรือหลังพื้นชั้นล่าง) ถึงหลังพื้นชั้นถัดไป — คานกับพื้นหักส่วนที่ซ้อนกับเสาเอง",
  BEAM: "ยาวรวม = วัดถึงผิวนอกเสาทั้งสองข้าง (เหล็กบน/ล่างใช้ความยาวนี้ หักระยะหุ้มปลายให้เอง) · กรอกเสาและพื้นด้านล่างเพื่อไม่ให้นับคอนกรีตซ้ำ",
  SLAB: "กว้าง × ยาว = วัดเต็มพื้นที่ถึงขอบนอก — คานใต้พื้นให้กรอก “พื้นบนคาน” ในชนิดคาน คอนกรีตจะไม่ซ้อนกัน",
  STAIR: "หนา = ความหนาท้องบันได (ตั้งฉากกับแนวเอียง) · ระยะราบ = ความยาวช่วงขั้นตามแปลน · ชานพักคิดในชนิด “พื้น”",
};

const DIM_LABELS: Record<StructuralKind, { width: string; depth: string; length: string }> = {
  FOOTING: { width: "กว้าง", depth: "หนา", length: "ยาว" },
  COLUMN: { width: "กว้าง", depth: "ลึก", length: "สูง" },
  BEAM: { width: "กว้าง", depth: "ลึก", length: "ยาวรวม" },
  SLAB: { width: "กว้าง", depth: "หนา", length: "ยาว" },
  STAIR: { width: "กว้าง", depth: "หนาท้อง", length: "ระยะราบ" },
};

interface FormState {
  label: string;
  count: string;
  width: string;
  depth: string;
  length: string;
  mainCount: string;
  mainDia: string;
  topCount: string;
  topDia: string;
  bottomCount: string;
  bottomDia: string;
  tieDia: string;
  tieSpacing: string;
  /** ปลอกถี่ช่วงปลาย — ว่างทั้งคู่ = ระยะเดียวตลอดชิ้น */
  tieEndSpacing: string;
  tieEndLength: string;
  meshDia: string;
  meshSpacing: string;
  /** ตะแกรงบน — ระยะว่าง = ชั้นเดียว */
  meshTopDia: string;
  meshTopSpacing: string;
  /** คาน: เสาที่คานพาดผ่าน (จำนวนต้น + ด้านตามแนวคาน) — ว่างทั้งคู่ = ไม่หัก */
  supportCount: string;
  supportWidth: string;
  /** คาน: พื้นบนคาน — ความหนาว่าง = ไม่มีพื้นบนคาน */
  slabThickness: string;
  slabSides: "1" | "2";
  onGround: boolean;
  /** พื้น: งอปลายตะแกรง · คาน: งอปลายเหล็กบน/ล่างเข้าเสา */
  endBends: boolean;
  /** ฐานราก: ฐานแผ่ (ตะแกรง) หรือหัวเสาเข็ม (เหล็กยืนรอบ + ปลอกรัด) */
  footingType: FootingType;
  /** หัวเสาเข็ม: ปลอกรัด 2 ชุดต่อชั้น (แบบเขียน "2ป") */
  diamondTies: boolean;
  /** ฐานราก: ปลายตะแกรง ตรง / งอ / งอขึ้นถึงผิวบน */
  meshEnd: MeshEnd;
  /** ฐานราก: ตะแกรงล่างกำหนดเป็นจำนวนเส้นตามแบบ (เช่น 4-DB16 / 8-DB16) แทนระยะห่าง */
  meshByCount: boolean;
  meshCountLong: string;
  meshCountShort: string;
  /** พื้น: ตั้งแบบขอบพื้น · ความยาวขอบว่าง = รอบรูป */
  edgeForm: boolean;
  edgeLength: string;
  /** ฐานราก: เหล็กเดือย — จำนวนว่าง = ไม่มี */
  dowelCount: string;
  dowelDia: string;
  dowelLength: string;
  /** คาน: เหล็กเสริมพิเศษบน (ต่อจุดรองรับ ยาว L/ตัวหาร) / ล่าง (กลางช่วง ตัดห่าง L/ตัวหาร) — จำนวนว่าง = ไม่มี */
  extraTopCount: string;
  extraTopDia: string;
  extraTopDiv: string;
  extraBottomCount: string;
  extraBottomDia: string;
  extraBottomDiv: string;
  /** บันได */
  stairRise: string;
  stairSteps: string;
  stairMainDia: string;
  stairMainSpacing: string;
  stairDistDia: string;
  stairDistSpacing: string;
  /** เสา: ความหนาฐานรากที่เหล็กยืนฝังลงไป — ว่าง = ไม่ใช่ต้นที่ตั้งบนฐานราก */
  footingDepth: string;
  topFloor: boolean;
  coverCm: string;
  lapFactor: string;
  stockLength: string;
  hookFactor: string;
  bendFactor: string;
}

// งอปลายเปิดไว้ตั้งต้นที่ฐานรากกับคาน (แบบบ้านทั่วไปงอเสมอ) · พื้นปิดไว้ เพราะพื้นวางบนคานส่วนใหญ่ใช้เหล็กตรงฝากคาน
const FORM_DEFAULTS: Record<StructuralKind, Partial<FormState>> = {
  FOOTING: { label: "F1", meshDia: "12", meshSpacing: "0.15", meshEnd: "BEND" },
  COLUMN: { label: "C1", mainCount: "4", mainDia: "12", tieDia: "6", tieSpacing: "0.20" },
  BEAM: { label: "B1", topCount: "2", topDia: "12", bottomCount: "2", bottomDia: "12", tieDia: "6", tieSpacing: "0.15", endBends: true },
  SLAB: { label: "S1", meshDia: "9", meshSpacing: "0.20" },
  STAIR: { label: "ST1", stairMainDia: "12", stairMainSpacing: "0.15", stairDistDia: "9", stairDistSpacing: "0.25" },
};

// ค่ามาตรฐานตั้งต้นมาจากชุดเสนอราคา (ตั้งค่า → ถอดปริมาณ) — ก่อนโหลดเสร็จใช้ค่าตั้งต้นของระบบ
function freshForm(kind: StructuralKind, rule: TakeoffRuleSet = DEFAULT_TAKEOFF_RULES.tender): FormState {
  return {
    label: "",
    count: "1",
    width: "",
    depth: "",
    length: "",
    mainCount: "",
    mainDia: "12",
    topCount: "",
    topDia: "12",
    bottomCount: "",
    bottomDia: "12",
    tieDia: "6",
    tieSpacing: "",
    tieEndSpacing: "",
    tieEndLength: "",
    meshDia: "12",
    meshSpacing: "",
    meshTopDia: "9",
    meshTopSpacing: "",
    supportCount: "",
    supportWidth: "",
    slabThickness: "",
    slabSides: "2",
    onGround: false,
    endBends: false,
    footingType: "MESH",
    diamondTies: false,
    meshEnd: "STRAIGHT",
    meshByCount: false,
    meshCountLong: "",
    meshCountShort: "",
    edgeForm: false,
    edgeLength: "",
    dowelCount: "",
    dowelDia: "20",
    dowelLength: "",
    extraTopCount: "",
    extraTopDia: "12",
    extraTopDiv: "4",
    extraBottomCount: "",
    extraBottomDia: "12",
    extraBottomDiv: "5",
    stairRise: "",
    stairSteps: "",
    stairMainDia: "12",
    stairMainSpacing: "",
    stairDistDia: "9",
    stairDistSpacing: "",
    footingDepth: "",
    topFloor: false,
    // 0.035 × 100 = 3.5000000000000004 ในทศนิยมของเครื่อง — ปัดก่อนแสดง
    coverCm: String(Number((DEFAULT_COVER[kind] * 100).toFixed(2))),
    lapFactor: String(rule.lapFactor),
    stockLength: String(rule.stockLength),
    hookFactor: String(rule.hookFactor),
    bendFactor: String(rule.bendFactor),
    ...FORM_DEFAULTS[kind],
  };
}

/**
 * ขนาดที่เก็บไว้ → ค่าในฟอร์ม (ตรงข้ามกับ inputOf) — ใช้ตอนเปิดแก้ชิ้นส่วนที่ลงไปแล้ว
 * ค่ามาตรฐาน (ทาบ/ยาวเหล็ก/ขอ/งอ/ระยะหุ้ม) ใช้ของชิ้นส่วนเอง · ชุดกฎ (หัก/บวกอะไร) ใช้ชุดเสนอราคาปัจจุบันตอนคิดใหม่
 */
function formFromInput(input: StructuralInput): FormState {
  const kind = input.kind;
  const base = freshForm(kind);
  const s = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "" : String(v));
  // ratio 0.25 → ตัวหาร "4" (ปัดกันทศนิยมเครื่อง 1/0.2 = 4.999…)
  const divOf = (ratio: number | undefined) => (ratio ? String(Number((1 / ratio).toFixed(2))) : "");
  let meshEnd: MeshEnd = "STRAIGHT";
  if (input.meshBendUp) meshEnd = "BEND_UP";
  else if (input.endBends) meshEnd = "BEND";
  const settings = input.settings;
  return {
    ...base,
    label: input.label,
    count: s(input.count),
    width: s(input.width),
    depth: s(input.depth),
    length: s(input.length),
    mainCount: s(input.mainBars?.count),
    mainDia: input.mainBars ? String(input.mainBars.dia) : base.mainDia,
    topCount: s(input.topBars?.count),
    topDia: input.topBars ? String(input.topBars.dia) : base.topDia,
    bottomCount: s(input.bottomBars?.count),
    bottomDia: input.bottomBars ? String(input.bottomBars.dia) : base.bottomDia,
    tieSpacing: s(input.ties?.spacing),
    tieDia: input.ties ? String(input.ties.dia) : base.tieDia,
    tieEndSpacing: s(input.tieEndZone?.spacing),
    tieEndLength: s(input.tieEndZone?.length),
    meshByCount: Boolean(input.meshCount),
    meshCountLong: s(input.meshCount?.long),
    meshCountShort: s(input.meshCount?.short),
    // ตะแกรงตามจำนวนเส้นเก็บระยะ 1 ไว้แทน — ไม่ใช่ค่าที่ผู้ใช้กรอก
    meshSpacing: input.meshCount ? "" : s(input.mesh?.spacing),
    meshDia: input.mesh ? String(input.mesh.dia) : base.meshDia,
    meshTopSpacing: s(input.meshTop?.spacing),
    meshTopDia: input.meshTop ? String(input.meshTop.dia) : base.meshTopDia,
    footingType: input.footingType ?? "MESH",
    diamondTies: Boolean(input.diamondTies),
    meshEnd,
    endBends: kind === "FOOTING" ? base.endBends : Boolean(input.endBends),
    supportCount: s(input.supports?.count),
    supportWidth: s(input.supports?.width),
    slabThickness: s(input.slabOnTop?.thickness),
    slabSides: input.slabOnTop?.sides === 1 ? "1" : "2",
    onGround: Boolean(input.onGround),
    edgeForm: Boolean(input.edgeForm),
    edgeLength: s(input.edgeForm?.length),
    dowelCount: s(input.dowels?.count),
    dowelDia: input.dowels ? String(input.dowels.dia) : base.dowelDia,
    dowelLength: s(input.dowels?.length),
    extraTopCount: s(input.extraTop?.count),
    extraTopDia: input.extraTop ? String(input.extraTop.dia) : base.extraTopDia,
    extraTopDiv: input.extraTop ? divOf(input.extraTop.ratio) : base.extraTopDiv,
    extraBottomCount: s(input.extraBottom?.count),
    extraBottomDia: input.extraBottom ? String(input.extraBottom.dia) : base.extraBottomDia,
    extraBottomDiv: input.extraBottom ? divOf(input.extraBottom.ratio) : base.extraBottomDiv,
    stairRise: s(input.stair?.rise),
    stairSteps: s(input.stair?.steps),
    stairMainSpacing: s(input.stair?.main?.spacing),
    stairMainDia: input.stair?.main ? String(input.stair.main.dia) : base.stairMainDia,
    stairDistSpacing: s(input.stair?.distribution?.spacing),
    stairDistDia: input.stair?.distribution ? String(input.stair.distribution.dia) : base.stairDistDia,
    footingDepth: s(input.footingDepth),
    topFloor: Boolean(input.topFloor),
    coverCm: String(Number((settings.cover * 100).toFixed(2))),
    lapFactor: s(settings.lapFactor) || base.lapFactor,
    stockLength: s(settings.stockLength) || base.stockLength,
    hookFactor: s(settings.hookFactor) || base.hookFactor,
    bendFactor: s(settings.bendFactor) || base.bendFactor,
  };
}

/** บรรทัดเดิมของชิ้นส่วน → ปลายทางของแต่ละก้อนผลลัพธ์ (คอนกรีต/ไม้แบบ/เหล็กรายขนาด) — ตอนแก้เลือกบรรทัดเดิมไว้ให้ */
function targetsFromLines(lines: StructuralMemberDto["lines"]): Record<string, Target> {
  const out: Record<string, Target> = {};
  for (const line of lines) {
    const shape = takeoffShapeForUnit(line.unit);
    if (line.barDias.length > 0 && isWeightUnit(line.unit)) {
      for (const dia of line.barDias) out[`REBAR-${dia}`] ??= { kind: "item", itemId: line.itemId };
    } else if (shape === "VOLUME") out.CONCRETE ??= { kind: "item", itemId: line.itemId };
    else if (shape === "AREA") out.FORMWORK ??= { kind: "item", itemId: line.itemId };
  }
  return out;
}

/** rule = ชุดเสนอราคา — แถวที่ลง BOQ คิดด้วยกฎชุดนี้ (ชุดสั่งตัดเซิร์ฟเวอร์คิดจากขนาดที่เก็บไว้เอง) */
function inputOf(kind: StructuralKind, f: FormState, rule: TakeoffRuleSet): StructuralInput {
  const n = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));
  // ช่องจำนวนเส้นว่าง = ไม่มีเหล็กชุดนั้น (เช่น คานที่ยังไม่รู้เหล็กบน)
  const bars = (count: string, dia: string) => (count.trim() === "" ? null : { count: n(count), dia: Number(dia) });
  const spaced = (spacing: string, dia: string) => (spacing.trim() === "" ? null : { spacing: n(spacing), dia: Number(dia) });
  const hasTies = kind === "COLUMN" || kind === "BEAM";
  const pileCap = kind === "FOOTING" && f.footingType === "PILE_CAP";
  const meshFooting = kind === "FOOTING" && !pileCap;
  // ตะแกรงตามจำนวนเส้น: ระยะห่างไม่ได้ใช้นับ แต่ตะแกรงต้องมีค่า — ใส่ 1 ไว้ (ไม่แสดงในชื่อแถว)
  const meshSpacing = meshFooting && f.meshByCount ? "1" : f.meshSpacing;
  // ช่องใดช่องหนึ่งของช่วงปลายกรอกแล้ว = ตั้งใจใช้ — อีกช่องว่างจะได้ NaN ให้ตัวคิดแจ้งว่ากรอกไม่ครบ
  const endZone =
    hasTies && (f.tieEndSpacing.trim() !== "" || f.tieEndLength.trim() !== "")
      ? { spacing: n(f.tieEndSpacing), length: n(f.tieEndLength) }
      : null;
  return {
    kind,
    label: f.label.trim() || STRUCTURAL_KINDS.find((k) => k.value === kind)!.prefix,
    count: n(f.count),
    width: n(f.width),
    depth: n(f.depth),
    length: n(f.length),
    mainBars: kind === "COLUMN" || pileCap ? bars(f.mainCount, f.mainDia) : null,
    topBars: kind === "BEAM" ? bars(f.topCount, f.topDia) : null,
    bottomBars: kind === "BEAM" ? bars(f.bottomCount, f.bottomDia) : null,
    ties: hasTies || pileCap ? spaced(f.tieSpacing, f.tieDia) : null,
    tieEndZone: endZone,
    mesh: meshFooting || kind === "SLAB" ? spaced(meshSpacing, f.meshDia) : null,
    meshTop: meshFooting || kind === "SLAB" ? spaced(f.meshTopSpacing, f.meshTopDia) : null,
    meshCount: meshFooting && f.meshByCount ? { long: n(f.meshCountLong), short: n(f.meshCountShort) } : null,
    footingType: kind === "FOOTING" ? f.footingType : undefined,
    diamondTies: pileCap && f.diamondTies,
    // ช่องใดช่องหนึ่งกรอกแล้ว = ตั้งใจหัก — อีกช่องว่างได้ NaN ให้ตัวคิดแจ้งว่ากรอกไม่ครบ
    supports:
      kind === "BEAM" && (f.supportCount.trim() !== "" || f.supportWidth.trim() !== "")
        ? { count: n(f.supportCount), width: n(f.supportWidth) }
        : null,
    slabOnTop:
      kind === "BEAM" && f.slabThickness.trim() !== "" ? { thickness: n(f.slabThickness), sides: f.slabSides === "1" ? 1 : 2 } : null,
    onGround: (kind === "SLAB" || kind === "BEAM") && f.onGround,
    edgeForm: kind === "SLAB" && f.edgeForm ? { length: f.edgeLength.trim() === "" ? null : n(f.edgeLength) } : null,
    endBends: kind === "FOOTING" ? f.meshEnd !== "STRAIGHT" : kind !== "COLUMN" && f.endBends,
    meshBendUp: kind === "FOOTING" && f.meshEnd === "BEND_UP",
    dowels:
      kind === "FOOTING" && f.dowelCount.trim() !== ""
        ? { count: n(f.dowelCount), dia: Number(f.dowelDia), length: n(f.dowelLength) }
        : null,
    // ตัวหาร 4 = L/4 · ว่าง/ผิด = NaN ให้ตัวคิดแจ้งว่ากรอกไม่ครบ
    extraTop:
      kind === "BEAM" && f.extraTopCount.trim() !== ""
        ? { count: n(f.extraTopCount), dia: Number(f.extraTopDia), ratio: 1 / n(f.extraTopDiv) }
        : null,
    extraBottom:
      kind === "BEAM" && f.extraBottomCount.trim() !== ""
        ? { count: n(f.extraBottomCount), dia: Number(f.extraBottomDia), ratio: 1 / n(f.extraBottomDiv) }
        : null,
    stair:
      kind === "STAIR"
        ? {
            rise: n(f.stairRise),
            steps: n(f.stairSteps),
            main: spaced(f.stairMainSpacing, f.stairMainDia),
            distribution: spaced(f.stairDistSpacing, f.stairDistDia),
          }
        : null,
    footingDepth: kind === "COLUMN" && f.footingDepth.trim() !== "" ? n(f.footingDepth) : null,
    topFloor: kind === "COLUMN" && f.topFloor,
    settings: {
      cover: n(f.coverCm) / 100,
      lapFactor: n(f.lapFactor),
      stockLength: n(f.stockLength),
      hookFactor: n(f.hookFactor),
      bendFactor: n(f.bendFactor),
      rules: {
        deductCover: rule.deductCover,
        bends: rule.bends,
        laps: rule.laps,
        hooks: rule.hooks,
        fullDepthLayers: rule.fullDepthLayers,
      },
    },
  };
}

/**
 * คำนวณจากชิ้นส่วนโครงสร้าง — ใส่ขนาดและเหล็กของชิ้นส่วนหนึ่งแบบครั้งเดียว ได้แถวใบถอดแบบของ
 * คอนกรีต ไม้แบบ และเหล็กแต่ละขนาด แล้วเลือกว่าจะลงบรรทัดไหนใน BOQ
 *
 * เจตนาหน้าตา: ซ้ายกรอก ขวาเห็นผลทันทีพร้อมวิธีคิด (ตรวจได้ว่าเลขมาจากไหน) · ปลายทางเดาให้ตั้งต้น
 * จากชื่อ/หน่วยของบรรทัดที่มี · ทำหลายชิ้นต่อกันได้โดยไม่ต้องเลือกปลายทางใหม่ทุกครั้ง
 */
export function StructuralCalcDialog({
  projectId,
  items,
  materials,
  categoryOptions,
  editing = null,
  onApplied,
  onClose,
}: Readonly<{
  projectId: string;
  items: BoqItemDto[];
  materials: MaterialDto[];
  categoryOptions: SearchableOption[];
  /**
   * แก้ชิ้นส่วนที่ลงไปแล้ว (Phase 2 ข้อ 3c) — ฟอร์มเติมจากขนาดที่เก็บไว้ ปลายทางเลือกบรรทัดเดิมไว้ให้
   * กดบันทึก = ลงทับ (แถวเดิมของชิ้นนี้ถูกถอดออกก่อน) · เปลี่ยนชนิดชิ้นส่วนไม่ได้
   */
  editing?: StructuralMemberDto | null;
  /** หลังลงสำเร็จ — ให้หน้าโหลด BOQ ใหม่ (รายการปลายทางในหน้าต่างนี้จะอัปเดตตาม) */
  onApplied: () => Promise<void> | void;
  onClose: () => void;
}>) {
  const toast = useToast();
  const [kind, setKind] = useState<StructuralKind>(editing?.kind ?? "BEAM");
  const [form, setForm] = useState<FormState>(() => (editing ? formFromInput(editing.input) : freshForm("BEAM")));
  const [targets, setTargets] = useState<Record<string, Target>>(() => (editing ? targetsFromLines(editing.lines) : {}));
  const [newLines, setNewLines] = useState<Record<string, NewLine>>({});
  // ชื่อบรรทัดที่เพิ่งสร้างไป — รอบถัดไปเลือกบรรทัดนั้นให้เอง
  const [remembered, setRemembered] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [rule, setRule] = useState<TakeoffRuleSet>(DEFAULT_TAKEOFF_RULES.tender);

  // ชุดเสนอราคาของบริษัท — โหลดไม่ได้ใช้ค่าตั้งต้นของระบบ (ตัวคิดยังใช้ได้ ไม่ขวางการทำงาน)
  useEffect(() => {
    let alive = true;
    getTakeoffRules()
      .then(({ rules }) => {
        if (!alive) return;
        setRule(rules.tender);
        // แก้ชิ้นส่วน: ค่ามาตรฐานของชิ้นนั้นมาจากตอนลง ไม่เขียนทับด้วยค่าปัจจุบันของบริษัท
        if (editing) return;
        setForm((f) => ({
          ...f,
          lapFactor: String(rules.tender.lapFactor),
          stockLength: String(rules.tender.stockLength),
          hookFactor: String(rules.tender.hookFactor),
          bendFactor: String(rules.tender.bendFactor),
        }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [editing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  function pickKind(next: StructuralKind) {
    setKind(next);
    // เก็บค่ามาตรฐานที่ผู้ใช้แก้ไว้ (ทาบ/ยาวเหล็ก/ขอ/งอ) แต่ระยะหุ้มเปลี่ยนตามชนิดชิ้นส่วน
    setForm((f) => ({
      ...freshForm(next, rule),
      lapFactor: f.lapFactor,
      stockLength: f.stockLength,
      hookFactor: f.hookFactor,
      bendFactor: f.bendFactor,
    }));
  }

  const dimsReady = form.width.trim() !== "" && form.depth.trim() !== "" && form.length.trim() !== "";
  const result = useMemo(
    () => (dimsReady ? structuralTakeoff(inputOf(kind, form, rule)) : null),
    [kind, form, dimsReady, rule],
  );
  const groups = useMemo(() => (result ? groupsOf(result.rows) : []), [result]);

  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  // แก้ชิ้นส่วน: กลุ่มผลลัพธ์ที่ตอนลงครั้งแรกไม่ได้ลง (เช่น ลงแต่เหล็ก ไม่ลงคอนกรีต/ไม้แบบ) ตั้งต้นเป็น "ไม่ลง"
  // ไม่งั้นทุกครั้งที่เปิดแก้จะโผล่บรรทัดใหม่ที่ไม่เคยตั้งใจสร้าง · เหล็กขนาดใหม่ยังเดาปลายทางให้ตามปกติ
  const editedGroups = useMemo(
    () => (editing ? new Set(Object.keys(targetsFromLines(editing.lines)).map((k) => k.split("-")[0])) : null),
    [editing],
  );

  /** ปลายทางที่ใช้จริง: ที่ผู้ใช้เลือก (ถ้ายังมีอยู่) ไม่งั้นเดาให้ */
  function targetOf(g: OutputGroup): Target {
    const chosen = targets[g.key];
    const fallback = (): Target =>
      editedGroups && !editedGroups.has(g.key.split("-")[0]) ? { kind: "skip" } : suggestTarget(g, items, remembered);
    if (chosen?.kind === "item" && !items.some((i) => i.id === chosen.itemId)) return fallback();
    return chosen ?? fallback();
  }

  function materialOptionsFor(g: OutputGroup): SearchableOption[] {
    return materials
      .filter((m) => m.active && g.fits(m.unit))
      .map((m) => ({ value: m.id, label: m.code ? `${m.code} — ${m.name}` : m.name, sublabel: `หน่วย ${m.unit}`, keywords: `${m.code ?? ""} ${m.name}` }));
  }

  const plan = groups.map((g) => ({ group: g, target: targetOf(g), newLine: newLines[g.key] ?? { materialId: "", categoryId: "" } }));
  const planError = plan
    .map(({ group, target, newLine }) =>
      // บรรทัดใหม่ต้องรู้หมวด: เลือกเอง หรือได้จากวัสดุที่เลือก (วัสดุบางตัวไม่มีหมวด)
      target.kind === "new" && !newLine.categoryId && !materialById.get(newLine.materialId)?.categoryId
        ? `${group.title}: เลือกหมวดงานของบรรทัดใหม่`
        : null,
    )
    .find(Boolean);
  const active = plan.filter((p) => p.target.kind !== "skip");
  const blocker =
    (!dimsReady ? "กรอกขนาดให้ครบ" : null) ??
    result?.errors[0] ??
    (active.length === 0 ? "เลือกอย่างน้อยหนึ่งปลายทาง" : null) ??
    planError ??
    null;

  async function apply(keepOpen: boolean) {
    if (blocker) return;
    const payload: TakeoffTarget[] = active.map(({ group, target, newLine }) => {
      const rows = group.rows.map((r) => r.row);
      if (target.kind === "item") return { itemId: target.itemId, rows };
      const material = newLine.materialId ? materialById.get(newLine.materialId) : undefined;
      return {
        newItem: material
          ? { categoryId: newLine.categoryId || material.categoryId || "", materialId: material.id }
          : { categoryId: newLine.categoryId, name: group.defaultName, unit: group.unit, materialUnitPrice: 0, laborUnitPrice: 0 },
        rows,
      };
    });
    setSaving(true);
    try {
      if (editing) {
        const res = await replaceStructuralMember(projectId, editing.key, payload, inputOf(kind, form, rule));
        await onApplied();
        const label = form.label.trim() || editing.label;
        toast.success(
          `แก้ ${label} แล้ว` +
            (res.created > 0 ? ` · สร้างบรรทัดใหม่ ${res.created}` : "") +
            (res.removed > 0 ? ` · ลบบรรทัดที่ไม่เหลือแถว ${res.removed}` : "") +
            (res.newVersion ? ` · แตกเป็นเวอร์ชัน ${res.version.versionNo} (เวอร์ชันเดิมส่งใบเสนอราคาแล้ว)` : ""),
        );
        onClose();
        return;
      }
      // ส่งขนาดชิ้นส่วนไปด้วย — เซิร์ฟเวอร์เก็บไว้คิดรายการสั่งเหล็กหน้างาน (ชุดสั่งตัด)
      const res = await applyTakeoff(projectId, payload, inputOf(kind, form, rule));
      // จำชื่อบรรทัดใหม่ไว้ — ชิ้นถัดไปลงบรรทัดเดียวกันแทนการสร้างซ้ำ
      const nextRemembered = new Map(remembered);
      for (const { group, target, newLine } of active) {
        if (target.kind !== "new") continue;
        nextRemembered.set(group.key, materialById.get(newLine.materialId)?.name ?? group.defaultName);
      }
      setRemembered(nextRemembered);
      setTargets((prev) => {
        const next = { ...prev };
        for (const { group, target } of active) if (target.kind === "new") delete next[group.key];
        return next;
      });
      await onApplied();
      const label = form.label.trim() || kind;
      toast.success(
        `ลง ${label} แล้ว ${res.lines} บรรทัด${res.created > 0 ? ` (สร้างใหม่ ${res.created})` : ""}` +
          (res.created > 0 && active.some((a) => a.target.kind === "new" && !a.newLine.materialId) ? " — อย่าลืมใส่ราคาบรรทัดใหม่" : ""),
      );
      if (keepOpen) {
        // ชิ้นถัดไปมักเป็นชนิดเดียวกัน (B1 → B2) — คงเหล็ก/ค่ามาตรฐานไว้ ล้างชื่อกับขนาด
        set({ label: nextLabel(form.label), width: "", depth: "", length: "", count: "1" });
      } else {
        onClose();
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ลงใบถอดแบบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const dimLabels = DIM_LABELS[kind];
  // สิ่งที่ชุดเสนอราคาไม่คิด — บอกไว้ใต้ค่ามาตรฐาน ให้รู้ว่าทำไมเหล็กสั้นกว่าตัดจริง
  const ruleNotes = [
    !rule.deductCover && "ไม่หักระยะหุ้ม",
    !rule.bends && "ไม่บวกงอ",
    !rule.laps && "ไม่บวกทาบ",
    !rule.hooks && "ไม่มีขอปลอก",
  ].filter(Boolean);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label="ปิด"
        onClick={() => !saving && onClose()}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="structural-title"
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="structural-title" className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <Boxes size={18} className="text-brand" />{" "}
              {editing ? `แก้ชิ้นส่วน ${editing.label}` : "คำนวณจากชิ้นส่วนโครงสร้าง"}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {editing
                ? "แก้ขนาดหรือเหล็กแล้วบันทึก — แถวเดิมของชิ้นนี้ในทุกบรรทัดถูกแทนด้วยค่าใหม่ บรรทัดที่ไม่เหลือแถวจะถูกลบ"
                : "ใส่ขนาดและเหล็กครั้งเดียว ได้คอนกรีต ไม้แบบ และเหล็กพร้อมกัน — ลงเป็นแถวในใบถอดแบบของแต่ละบรรทัด"}
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

        <div className="grid gap-5 overflow-y-auto px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* ───── ซ้าย: กรอก ───── */}
          <div className="flex flex-col gap-4">
            <div role="radiogroup" aria-label="ชนิดชิ้นส่วน" className="grid grid-cols-5 gap-2">
              {STRUCTURAL_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.value}
                  // แก้ชิ้นส่วน: ชนิดคงที่ (เปลี่ยนชนิด = ลบชิ้นนี้แล้วลงใหม่)
                  disabled={Boolean(editing) && kind !== k.value}
                  onClick={() => pickKind(k.value)}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    kind === k.value
                      ? "border-brand bg-brand/5 font-medium text-brand"
                      : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <KindDiagram kind={k.value} small />
                  {k.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className={LABEL}>
                <span>ชื่อตามแบบ</span>
                <input
                  value={form.label}
                  onChange={(e) => set({ label: e.target.value })}
                  maxLength={40}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <NumberField label="จำนวนชิ้นที่เหมือนกัน" value={form.count} onChange={(v) => set({ count: v })} step="1" />
            </div>

            <fieldset className="rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-medium text-slate-700">ขนาด (เมตร)</legend>
              <div className="flex items-center gap-3">
                <div className="hidden shrink-0 sm:block">
                  <KindDiagram kind={kind} />
                </div>
                <div className="grid flex-1 grid-cols-3 gap-2">
                  <NumberField label={dimLabels.width} value={form.width} onChange={(v) => set({ width: v })} />
                  <NumberField label={dimLabels.depth} value={form.depth} onChange={(v) => set({ depth: v })} />
                  <NumberField label={dimLabels.length} value={form.length} onChange={(v) => set({ length: v })} />
                </div>
              </div>
              {/* วัดคนละจุดได้ผลต่างกันมาก (ถึงศูนย์กลาง/หน้าเสา/ผิวนอก) — บอกจุดที่สูตรตั้งไว้ให้ชัด */}
              <p className="mt-2 text-xs text-slate-500">{MEASURE_HINTS[kind]}</p>
              {kind === "STAIR" && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <BarRow label="ความสูง / ขั้น">
                    <span className="text-xs text-slate-500">สูงรวม</span>
                    <input type="number" min="0" step="any" value={form.stairRise} onChange={(e) => set({ stairRise: e.target.value })} aria-label="ความสูงรวมของบันได" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="text-xs text-slate-500">ม. ·</span>
                    <input type="number" min="0" step="1" value={form.stairSteps} onChange={(e) => set({ stairSteps: e.target.value })} aria-label="จำนวนลูกตั้ง" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="text-xs text-slate-500">ลูกตั้ง</span>
                    {form.stairRise && form.stairSteps && Number(form.stairSteps) > 0 && form.length && (
                      <span className="w-full text-xs text-slate-400">
                        ลูกตั้ง {(Number(form.stairRise) / Number(form.stairSteps)).toFixed(3)} ม. · ลูกนอน {(Number(form.length) / Number(form.stairSteps)).toFixed(3)} ม.
                      </span>
                    )}
                  </BarRow>
                </div>
              )}
              {kind === "BEAM" && (
                <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
                  <p className="text-xs font-medium text-slate-600">หักส่วนที่ซ้อนกับเสาและพื้น (เว้นว่าง = ไม่หัก)</p>
                  <BarRow label="เสาที่คานพาดผ่าน">
                    <input type="number" min="0" step="1" value={form.supportCount} onChange={(e) => set({ supportCount: e.target.value })} aria-label="จำนวนเสาที่คานพาดผ่าน" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="text-xs text-slate-500">ต้น กว้าง</span>
                    <input type="number" min="0" step="any" value={form.supportWidth} onChange={(e) => set({ supportWidth: e.target.value })} aria-label="ความกว้างเสาตามแนวคาน" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="text-xs text-slate-500">ม.</span>
                    <span className="w-full text-xs text-slate-400">นับรวมเสาสองปลาย · กว้าง = ด้านของเสาตามแนวคาน</span>
                  </BarRow>
                  <BarRow label="พื้นบนคาน">
                    <span className="text-xs text-slate-500">หนา</span>
                    <input type="number" min="0" step="any" value={form.slabThickness} onChange={(e) => set({ slabThickness: e.target.value })} aria-label="ความหนาพื้นบนคาน" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="text-xs text-slate-500">ม.</span>
                    <select value={form.slabSides} onChange={(e) => set({ slabSides: e.target.value as "1" | "2" })} aria-label="พื้นวางบนคานกี่ข้าง" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                      <option value="2">พื้นสองข้าง</option>
                      <option value="1">ข้างเดียว (คานขอบ)</option>
                    </select>
                  </BarRow>
                </div>
              )}
            </fieldset>

            <fieldset className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-medium text-slate-700">เหล็กเสริม (เว้นว่าง = ไม่คิด)</legend>
              {kind === "COLUMN" && (
                <BarRow label="เหล็กยืน">
                  <input type="number" min="0" step="1" value={form.mainCount} onChange={(e) => set({ mainCount: e.target.value })} aria-label="จำนวนเหล็กยืน" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                  <span className="text-xs text-slate-500">เส้น</span>
                  <BarSelect value={form.mainDia} onChange={(v) => set({ mainDia: v })} label="ขนาดเหล็กยืน" />
                </BarRow>
              )}
              {kind === "BEAM" && (
                <>
                  <BarRow label="เหล็กบน">
                    <input type="number" min="0" step="1" value={form.topCount} onChange={(e) => set({ topCount: e.target.value })} aria-label="จำนวนเหล็กบน" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="text-xs text-slate-500">เส้น</span>
                    <BarSelect value={form.topDia} onChange={(v) => set({ topDia: v })} label="ขนาดเหล็กบน" />
                  </BarRow>
                  <BarRow label="เหล็กล่าง">
                    <input type="number" min="0" step="1" value={form.bottomCount} onChange={(e) => set({ bottomCount: e.target.value })} aria-label="จำนวนเหล็กล่าง" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="text-xs text-slate-500">เส้น</span>
                    <BarSelect value={form.bottomDia} onChange={(v) => set({ bottomDia: v })} label="ขนาดเหล็กล่าง" />
                  </BarRow>
                  <BarRow label="เหล็กพิเศษบน">
                    <input type="number" min="0" step="1" value={form.extraTopCount} onChange={(e) => set({ extraTopCount: e.target.value })} aria-label="จำนวนเหล็กพิเศษบนต่อจุดรองรับ" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="text-xs text-slate-500">เส้น</span>
                    <BarSelect value={form.extraTopDia} onChange={(v) => set({ extraTopDia: v })} label="ขนาดเหล็กพิเศษบน" />
                    <span className="text-xs text-slate-500">ยาว L/</span>
                    <input type="number" min="1" step="any" value={form.extraTopDiv} onChange={(e) => set({ extraTopDiv: e.target.value })} aria-label="ตัวหารความยาวเหล็กพิเศษบน" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="w-full text-xs text-slate-400">ต่อจุดรองรับ ยื่นจากหน้าเสาเข้าช่วง · จุดกลาง (คานต่อเนื่อง) ยื่นสองข้าง · เว้นว่าง = ไม่มี</span>
                  </BarRow>
                  <BarRow label="เหล็กพิเศษล่าง">
                    <input type="number" min="0" step="1" value={form.extraBottomCount} onChange={(e) => set({ extraBottomCount: e.target.value })} aria-label="จำนวนเหล็กพิเศษล่างต่อช่วง" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="text-xs text-slate-500">เส้น</span>
                    <BarSelect value={form.extraBottomDia} onChange={(v) => set({ extraBottomDia: v })} label="ขนาดเหล็กพิเศษล่าง" />
                    <span className="text-xs text-slate-500">ตัดห่างหน้าเสา L/</span>
                    <input type="number" min="1" step="any" value={form.extraBottomDiv} onChange={(e) => set({ extraBottomDiv: e.target.value })} aria-label="ตัวหารระยะตัดเหล็กพิเศษล่าง" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="w-full text-xs text-slate-400">กลางช่วง ยาว L − 2 × L/5 (ตามแบบขยายการเสริมเหล็กพิเศษ) · L = ช่วงสุทธิ · เว้นว่าง = ไม่มี</span>
                  </BarRow>
                </>
              )}
              {kind === "STAIR" && (
                <>
                  <BarRow label="เหล็กหลัก">
                    <BarSelect value={form.stairMainDia} onChange={(v) => set({ stairMainDia: v })} label="ขนาดเหล็กหลักบันได" />
                    <span className="text-xs text-slate-500">@</span>
                    <input type="number" min="0" step="any" value={form.stairMainSpacing} onChange={(e) => set({ stairMainSpacing: e.target.value })} aria-label="ระยะห่างเหล็กหลักบันได" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="text-xs text-slate-500">ม. วิ่งตามแนวเอียง</span>
                  </BarRow>
                  <BarRow label="เหล็กกันร้าว">
                    <BarSelect value={form.stairDistDia} onChange={(v) => set({ stairDistDia: v })} label="ขนาดเหล็กกันร้าวบันได" />
                    <span className="text-xs text-slate-500">@</span>
                    <input type="number" min="0" step="any" value={form.stairDistSpacing} onChange={(e) => set({ stairDistSpacing: e.target.value })} aria-label="ระยะห่างเหล็กกันร้าวบันได" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="text-xs text-slate-500">ม. วิ่งตามความกว้าง</span>
                  </BarRow>
                </>
              )}
              {(kind === "COLUMN" || kind === "BEAM") && (
                <BarRow label="ปลอก">
                  <BarSelect value={form.tieDia} onChange={(v) => set({ tieDia: v })} label="ขนาดปลอก" />
                  <span className="text-xs text-slate-500">@</span>
                  <input type="number" min="0" step="any" value={form.tieSpacing} onChange={(e) => set({ tieSpacing: e.target.value })} aria-label="ระยะห่างปลอก" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                  <span className="text-xs text-slate-500">ม.</span>
                </BarRow>
              )}
              {(kind === "COLUMN" || kind === "BEAM") && (
                <BarRow label="ปลอกถี่ช่วงปลาย">
                  <span className="text-xs text-slate-500">@</span>
                  <input type="number" min="0" step="any" value={form.tieEndSpacing} onChange={(e) => set({ tieEndSpacing: e.target.value })} aria-label="ระยะห่างปลอกช่วงปลาย" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                  <span className="text-xs text-slate-500">ม. ยาวข้างละ</span>
                  <input type="number" min="0" step="any" value={form.tieEndLength} onChange={(e) => set({ tieEndLength: e.target.value })} aria-label="ความยาวช่วงปลายต่อข้าง" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                  <span className="text-xs text-slate-500">ม.</span>
                  <span className="w-full text-xs text-slate-400">
                    {kind === "BEAM" ? "ปลายคานทั้งสองข้าง มักยาว L/4" : "หัวและโคนเสา"} · เว้นว่าง = ระยะเดียวตลอด
                  </span>
                </BarRow>
              )}
              {kind === "COLUMN" && (
                <>
                  <BarRow label="ตั้งบนฐานราก">
                    <span className="text-xs text-slate-500">ฐานหนา</span>
                    <input type="number" min="0" step="any" value={form.footingDepth} onChange={(e) => set({ footingDepth: e.target.value })} aria-label="ความหนาฐานราก" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="text-xs text-slate-500">ม.</span>
                    <span className="w-full text-xs text-slate-400">เหล็กยืนฝังลงถึงตะแกรงล่างแล้วงอ {form.bendFactor}d · เว้นว่าง = เสาชั้นบน</span>
                  </BarRow>
                  <label className="mt-1 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={form.topFloor} onChange={(e) => set({ topFloor: e.target.checked })} />
                    ชั้นบนสุด — งอเข้าคานหลังคา {form.bendFactor}d แทนเผื่อทาบต่อชั้นถัดไป
                  </label>
                </>
              )}
              {kind === "FOOTING" && (
                <BarRow label="รูปแบบเหล็ก">
                  <select
                    value={form.footingType}
                    onChange={(e) => {
                      const next = e.target.value as FootingType;
                      // หัวเสาเข็มตั้งต้นตามแบบที่พบบ่อย (16-DB16 + ปลอก RB6@0.10) — แก้ได้
                      set(
                        next === "PILE_CAP"
                          ? { footingType: next, mainCount: form.mainCount || "16", mainDia: "16", tieDia: "6", tieSpacing: form.tieSpacing || "0.10" }
                          : { footingType: next },
                      );
                    }}
                    aria-label="รูปแบบเหล็กฐานราก"
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  >
                    <option value="MESH">ฐานแผ่ — ตะแกรงสองทาง</option>
                    <option value="PILE_CAP">หัวเสาเข็ม — เหล็กยืนรอบ + ปลอกรัด</option>
                  </select>
                </BarRow>
              )}
              {kind === "FOOTING" && form.footingType === "PILE_CAP" && (
                <>
                  <BarRow label="เหล็กยืนรอบฐาน">
                    <input type="number" min="0" step="1" value={form.mainCount} onChange={(e) => set({ mainCount: e.target.value })} aria-label="จำนวนเหล็กยืนรอบฐาน" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="text-xs text-slate-500">เส้น</span>
                    <BarSelect value={form.mainDia} onChange={(v) => set({ mainDia: v })} label="ขนาดเหล็กยืนรอบฐาน" />
                    <span className="w-full text-xs text-slate-400">ยาว = หนา − ระยะหุ้มบนล่าง + งอเข้าในฐานบนและล่าง {form.bendFactor}d</span>
                  </BarRow>
                  <BarRow label="ปลอกรัด">
                    <BarSelect value={form.tieDia} onChange={(v) => set({ tieDia: v })} label="ขนาดปลอกรัด" />
                    <span className="text-xs text-slate-500">@</span>
                    <input type="number" min="0" step="any" value={form.tieSpacing} onChange={(e) => set({ tieSpacing: e.target.value })} aria-label="ระยะห่างปลอกรัดตามความหนา" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="text-xs text-slate-500">ม. ตามความหนา</span>
                  </BarRow>
                  <label className="mt-1 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={form.diamondTies} onChange={(e) => set({ diamondTies: e.target.checked })} />
                    ปลอก 2 ชุดต่อชั้น (สี่เหลี่ยม + ข้าวหลามตัด) — แบบเขียน “2ป”
                  </label>
                </>
              )}
              {kind === "FOOTING" && form.footingType === "MESH" && (
                <BarRow label="ตะแกรงล่าง">
                  <BarSelect value={form.meshDia} onChange={(v) => set({ meshDia: v })} label="ขนาดตะแกรงล่าง" />
                  <select value={form.meshByCount ? "count" : "spacing"} onChange={(e) => set({ meshByCount: e.target.value === "count" })} aria-label="กำหนดตะแกรงล่างด้วย" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                    <option value="spacing">ระยะห่าง</option>
                    <option value="count">จำนวนเส้น</option>
                  </select>
                  {form.meshByCount ? (
                    <span className="flex w-full flex-wrap items-center gap-1.5">
                      <span className="text-xs text-slate-500">แนวยาว</span>
                      <input type="number" min="0" step="1" value={form.meshCountLong} onChange={(e) => set({ meshCountLong: e.target.value })} aria-label="จำนวนเส้นตะแกรงแนวยาว" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                      <span className="text-xs text-slate-500">เส้น · แนวกว้าง</span>
                      <input type="number" min="0" step="1" value={form.meshCountShort} onChange={(e) => set({ meshCountShort: e.target.value })} aria-label="จำนวนเส้นตะแกรงแนวกว้าง" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                      <span className="text-xs text-slate-500">เส้น</span>
                      <span className="w-full text-xs text-slate-400">แนวยาว = เส้นที่วิ่งตามด้านยาว · ใส่ตามที่แบบเขียน เช่น 4-DB16 / 8-DB16</span>
                    </span>
                  ) : (
                    <>
                      <span className="text-xs text-slate-500">@</span>
                      <input type="number" min="0" step="any" value={form.meshSpacing} onChange={(e) => set({ meshSpacing: e.target.value })} aria-label="ระยะห่างตะแกรงล่าง" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                      <span className="text-xs text-slate-500">ม. สองทาง</span>
                    </>
                  )}
                </BarRow>
              )}
              {((kind === "FOOTING" && form.footingType === "MESH") || kind === "SLAB") && (
                <>
                  {kind === "SLAB" && (
                    <BarRow label="ตะแกรงล่าง">
                      <BarSelect value={form.meshDia} onChange={(v) => set({ meshDia: v })} label="ขนาดตะแกรงล่าง" />
                      <span className="text-xs text-slate-500">@</span>
                      <input type="number" min="0" step="any" value={form.meshSpacing} onChange={(e) => set({ meshSpacing: e.target.value })} aria-label="ระยะห่างตะแกรงล่าง" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                      <span className="text-xs text-slate-500">ม. สองทาง</span>
                    </BarRow>
                  )}
                  <BarRow label="ตะแกรงบน">
                    <BarSelect value={form.meshTopDia} onChange={(v) => set({ meshTopDia: v })} label="ขนาดตะแกรงบน" />
                    <span className="text-xs text-slate-500">@</span>
                    <input type="number" min="0" step="any" value={form.meshTopSpacing} onChange={(e) => set({ meshTopSpacing: e.target.value })} aria-label="ระยะห่างตะแกรงบน" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                    <span className="text-xs text-slate-500">ม. สองทาง</span>
                    <span className="w-full text-xs text-slate-400">แบบกำหนดเหล็ก 2 ชั้น · เว้นว่าง = ชั้นเดียว</span>
                  </BarRow>
                </>
              )}
              {kind === "FOOTING" && (
                <BarRow label="เหล็กเดือย">
                  <input type="number" min="0" step="1" value={form.dowelCount} onChange={(e) => set({ dowelCount: e.target.value })} aria-label="จำนวนเหล็กเดือยต่อฐาน" className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                  <span className="text-xs text-slate-500">เส้น</span>
                  <BarSelect value={form.dowelDia} onChange={(v) => set({ dowelDia: v })} label="ขนาดเหล็กเดือย" />
                  <span className="text-xs text-slate-500">ยาว</span>
                  <input type="number" min="0" step="any" value={form.dowelLength} onChange={(e) => set({ dowelLength: e.target.value })} aria-label="ความยาวเหล็กเดือยต่อเส้น" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                  <span className="text-xs text-slate-500">ม./เส้น</span>
                  <span className="w-full text-xs text-slate-400">เช่น 4-DB20 DOWEL ฝังหัวเสาเข็ม · ยาวกรอกตามแบบ · เว้นว่าง = ไม่มี</span>
                </BarRow>
              )}
              {kind === "FOOTING" && form.footingType === "MESH" && (
                <BarRow label="ปลายตะแกรง">
                  <select value={form.meshEnd} onChange={(e) => set({ meshEnd: e.target.value as MeshEnd })} aria-label="ปลายตะแกรงฐานราก" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                    <option value="STRAIGHT">ตรง ไม่งอ</option>
                    <option value="BEND">งอปลายข้างละ {form.bendFactor}d</option>
                    <option value="BEND_UP">งอขึ้นถึงผิวบน (รูปตัว U)</option>
                  </select>
                  {form.meshEnd === "BEND_UP" && (
                    <span className="w-full text-xs text-slate-400">ขาสูงข้างละ หนา − ระยะหุ้มบนล่าง</span>
                  )}
                </BarRow>
              )}
              {(kind === "BEAM" || kind === "SLAB") && (
                <label className="mt-1 flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="mt-1" checked={form.endBends} onChange={(e) => set({ endBends: e.target.checked })} />
                  <span>
                    {kind === "BEAM" ? "งอปลายเหล็กบน/ล่างเข้าเสา" : "งอปลายตะแกรง"} ข้างละ {form.bendFactor}d
                    {!rule.bends && <span className="block text-xs text-slate-400">ใช้ในรายการสั่งเหล็ก (ชุดเสนอราคาไม่บวกงอ)</span>}
                  </span>
                </label>
              )}
              {kind === "BEAM" && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.onGround} onChange={(e) => set({ onGround: e.target.checked })} />
                  คานคอดินเทบนดิน (ไม่มีไม้แบบท้องคาน)
                </label>
              )}
              {kind === "SLAB" && (
                <>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={form.onGround} onChange={(e) => set({ onGround: e.target.checked })} />
                    พื้นเทบนดิน (ไม่มีไม้แบบท้องพื้น)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={form.edgeForm} onChange={(e) => set({ edgeForm: e.target.checked })} />
                    ตั้งแบบขอบพื้น
                  </label>
                  {form.edgeForm && (
                    <BarRow label="ยาวขอบที่ตั้งแบบ">
                      <input type="number" min="0" step="any" value={form.edgeLength} onChange={(e) => set({ edgeLength: e.target.value })} aria-label="ความยาวขอบพื้นที่ตั้งแบบ" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />
                      <span className="text-xs text-slate-500">ม. ต่อแผ่น</span>
                      <span className="w-full text-xs text-slate-400">เว้นว่าง = รอบรูป 2×(กว้าง+ยาว) · พื้นรูปไม่เหลี่ยมให้วัดขอบจริงจากแปลน · ขอบที่วางบนคานไม่ต้องนับ</span>
                    </BarRow>
                  )}
                </>
              )}
            </fieldset>

            <details className="group rounded-lg border border-slate-200 px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-slate-600">
                <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                ค่ามาตรฐานที่ใช้คิด: ระยะหุ้ม {form.coverCm} ซม. · ทาบ {form.lapFactor}d · เหล็กยาว {form.stockLength} ม. · ขอปลอก {form.hookFactor}d · งอปลาย {form.bendFactor}d
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <NumberField label="ระยะหุ้ม" value={form.coverCm} onChange={(v) => set({ coverCm: v })} suffix="ซม." />
                <NumberField label="ระยะทาบ" value={form.lapFactor} onChange={(v) => set({ lapFactor: v })} suffix="× d" />
                <NumberField label="เหล็กยาวต่อเส้น" value={form.stockLength} onChange={(v) => set({ stockLength: v })} suffix="ม." />
                <NumberField label="ขอปลอกต่อข้าง" value={form.hookFactor} onChange={(v) => set({ hookFactor: v })} suffix="× d" />
                <NumberField label="งอปลายเหล็กหลัก" value={form.bendFactor} onChange={(v) => set({ bendFactor: v })} suffix="× d" />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                ไม่รวมเหล็กเสริมพิเศษ (เหล็กเสริมบนเหนือเสา/ปลายคาน เหล็กคอม้า) — เผื่อด้วย % เผื่อเสียในใบถอดแบบของบรรทัดเหล็ก
              </p>
              <p className="mt-1 text-xs text-slate-500">
                เหล็กที่ลง BOQ คิดตาม “ชุดเสนอราคา”{ruleNotes.length > 0 && ` (${ruleNotes.join(" · ")})`}{" "}
                — ขนาดที่กรอกถูกเก็บไว้คิด “รายการสั่งเหล็กหน้างาน” ด้วยชุดสั่งตัดให้เอง · ตั้งได้ที่ ตั้งค่า → ถอดปริมาณ
              </p>
            </details>
          </div>

          {/* ───── ขวา: ผลลัพธ์ + ปลายทาง ───── */}
          <div className="flex flex-col gap-3">
            {!dimsReady && (
              <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                กรอก{dimLabels.width} {dimLabels.depth} และ{dimLabels.length} ผลลัพธ์จะขึ้นที่นี่ทันที
              </div>
            )}
            {result?.errors.map((e) => (
              <Notice key={e} tone="amber">
                {e}
              </Notice>
            ))}
            {plan.map(({ group, target, newLine }) => {
              const candidates = candidatesFor(group, items);
              const value = target.kind === "item" ? target.itemId : target.kind;
              return (
                <section key={group.key} className={`rounded-lg border p-3 ${target.kind === "skip" ? "border-slate-200 opacity-60" : "border-slate-200"}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-800">{group.title}</h3>
                    <span className="text-base font-semibold text-brand tabular-nums">
                      {fmtQty(group.total)} <span className="text-xs font-normal">{group.unit}</span>
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                    {group.rows.map((r) => (
                      <li key={r.row.label}>
                        <span className="text-slate-700">{r.row.label}</span> — {r.explain}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                    <label htmlFor={`target-${group.key}`} className="text-xs text-slate-600">
                      ลงบรรทัด
                    </label>
                    <select
                      id={`target-${group.key}`}
                      value={value}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTargets((t) => ({
                          ...t,
                          [group.key]: v === "new" || v === "skip" ? { kind: v } : { kind: "item", itemId: v },
                        }));
                      }}
                      className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    >
                      {candidates.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.unit}){i.qtyBasis === "SHEET" ? ` · ใบถอดแบบ ${i.takeoffRows.length} แถว` : ""}
                        </option>
                      ))}
                      <option value="new">+ สร้างบรรทัดใหม่</option>
                      <option value="skip">ไม่ต้องลง</option>
                    </select>
                  </div>
                  {target.kind === "new" && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="text-xs text-slate-600">
                        <span className="mb-1 block">วัสดุจากคลัง (ราคามาด้วย)</span>
                        <SearchableSelect
                          options={materialOptionsFor(group)}
                          value={newLine.materialId}
                          onChange={(v) => setNewLines((n) => ({ ...n, [group.key]: { ...newLine, materialId: v } }))}
                          placeholder={`ค้นหาวัสดุหน่วย ${group.unit}`}
                          clearable
                        />
                      </div>
                      <div className="text-xs text-slate-600">
                        <span className="mb-1 block">
                          หมวดงาน{materialById.get(newLine.materialId)?.categoryId ? " (เว้นได้ — ใช้หมวดของวัสดุ)" : ""}
                        </span>
                        <SearchableSelect
                          options={categoryOptions}
                          value={newLine.categoryId}
                          onChange={(v) => setNewLines((n) => ({ ...n, [group.key]: { ...newLine, categoryId: v } }))}
                          placeholder="เลือกหมวดงาน"
                          clearable
                        />
                      </div>
                      {!newLine.materialId && (
                        <p className="text-xs text-slate-500 sm:col-span-2">
                          จะสร้าง “{group.defaultName}” หน่วย {group.unit} ราคา 0 — ใส่ราคาทีหลังที่ปุ่มแก้ไขของบรรทัด
                        </p>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-5 py-3">
          {blocker && dimsReady && <span className="text-xs text-amber-700">{blocker}</span>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              ปิด
            </Button>
            {!editing && (
              <Button variant="ghost" onClick={() => apply(true)} disabled={Boolean(blocker) || saving}>
                ลง BOQ แล้วทำชิ้นถัดไป
              </Button>
            )}
            <Button onClick={() => apply(false)} disabled={Boolean(blocker) || saving}>
              {editing ? (saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข") : saving ? "กำลังลง..." : "ลง BOQ"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** B1 → B2, F12 → F13 · ชื่อที่ไม่ลงท้ายด้วยเลขคงไว้ */
function nextLabel(label: string): string {
  const m = /^(.*?)(\d+)$/.exec(label.trim());
  return m ? `${m[1]}${Number(m[2]) + 1}` : label;
}
