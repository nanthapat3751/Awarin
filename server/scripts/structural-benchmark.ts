/**
 * วัดความแม่นยำของตัวคิดชิ้นส่วนโครงสร้าง เทียบกับปริมาณที่วิศวกรถอดจากแบบจริง
 *
 *   npm run structural:benchmark -- <ไฟล์.json> [--md รายงาน.md]
 *
 * ไฟล์ข้อมูลดูรูปแบบที่ scripts/structural-benchmark.template.json
 *   - members  = ชิ้นส่วนทุกตัวในแบบ กรอกแบบเดียวกับหน้าต่าง "คำนวณโครงสร้าง"
 *   - engineer = ยอดรวมจาก BOQ ของวิศวกร (คอนกรีต ลบ.ม. · ไม้แบบ ตร.ม. · เหล็กแยกขนาด กก.)
 *     ช่องที่เป็น null = ยังไม่มีตัวเลขเทียบ แสดงเฉพาะยอดของระบบ ไม่คิด % ให้
 *
 * ตัวเลขทั้งสองฝั่งเป็น "ปริมาณสุทธิก่อนเผื่อเสีย" — ถ้า BOQ วิศวกรรวมเผื่อเสียไว้แล้ว ให้ใส่ wastePct
 * ของแต่ละงานใน engineerWastePct เพื่อถอดออกก่อนเทียบ ไม่งั้นจะดูเหมือนระบบขาดเท่ากับเผื่อเสีย
 */
import { readFileSync, writeFileSync } from "node:fs";

import {
  DEFAULT_COVER,
  DEFAULT_STRUCTURAL_SETTINGS,
  structuralTakeoff,
  type StructuralInput,
  type StructuralSettings,
} from "@systemboq/shared-types";

type Member = Omit<StructuralInput, "settings"> & { cover?: number };

interface BenchmarkFile {
  project: string;
  /** ที่มาของตัวเลขวิศวกร — ใคร/เอกสารไหน/วันที่ (พิมพ์ลงรายงาน) */
  source: string;
  settings?: Partial<Omit<StructuralSettings, "cover">>;
  members: Member[];
  engineer: {
    concrete: number | null;
    formwork: number | null;
    /** กก. แยกตามขนาดเหล็ก (มม.) เช่น { "6": 120, "12": 850 } */
    rebar: Record<string, number | null>;
  };
  /** % เผื่อเสียที่รวมอยู่ในตัวเลขวิศวกรแล้ว (ถ้ามี) */
  engineerWastePct?: { concrete?: number; formwork?: number; rebar?: number };
}

interface Line {
  item: string;
  unit: string;
  system: number;
  engineer: number | null;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) fail("ใช้: npm run structural:benchmark -- <ไฟล์.json> [--md รายงาน.md]");
const mdIndex = args.indexOf("--md");
const mdPath = mdIndex >= 0 ? args[mdIndex + 1] : undefined;

const data = JSON.parse(readFileSync(file, "utf8")) as BenchmarkFile;
if (!Array.isArray(data.members) || data.members.length === 0) fail("ไม่มีชิ้นส่วนใน members");

// ── ถอดทุกชิ้นด้วยตัวคิดเดียวกับหน้าจอ ──
let concrete = 0;
let formwork = 0;
const rebar = new Map<number, number>();
for (const m of data.members) {
  const { cover, ...member } = m;
  const result = structuralTakeoff({
    ...member,
    settings: { ...DEFAULT_STRUCTURAL_SETTINGS, ...data.settings, cover: cover ?? DEFAULT_COVER[m.kind] },
  });
  if (result.errors.length > 0) fail(`${m.label}: ${result.errors.join(" · ")}`);
  for (const r of result.rows) {
    if (r.group === "CONCRETE") concrete += r.value;
    else if (r.group === "FORMWORK") formwork += r.value;
    else rebar.set(r.row.barDia!, (rebar.get(r.row.barDia!) ?? 0) + r.value);
  }
}

// ตัวเลขวิศวกรที่รวมเผื่อเสียมาแล้ว → ถอดกลับเป็นปริมาณสุทธิ
const net = (value: number | null | undefined, wastePct = 0) => (value == null ? null : value / (1 + wastePct / 100));
const waste = data.engineerWastePct ?? {};
const dias = [...new Set([...rebar.keys(), ...Object.keys(data.engineer.rebar ?? {}).map(Number)])].sort((a, b) => a - b);
const lines: Line[] = [
  { item: "คอนกรีต", unit: "ลบ.ม.", system: concrete, engineer: net(data.engineer.concrete, waste.concrete) },
  { item: "ไม้แบบ", unit: "ตร.ม.", system: formwork, engineer: net(data.engineer.formwork, waste.formwork) },
  ...dias.map((d) => ({
    item: `เหล็ก ${d === 6 || d === 9 ? "RB" : "DB"}${d}`,
    unit: "กก.",
    system: rebar.get(d) ?? 0,
    engineer: net(data.engineer.rebar?.[String(d)], waste.rebar),
  })),
];
const rebarLines = lines.filter((l) => l.unit === "กก.");
const rebarCompared = rebarLines.every((l) => l.engineer != null);
if (rebarLines.length > 0) {
  lines.push({
    item: "เหล็กรวมทุกขนาด",
    unit: "กก.",
    system: rebarLines.reduce((n, l) => n + l.system, 0),
    engineer: rebarCompared ? rebarLines.reduce((n, l) => n + l.engineer!, 0) : null,
  });
}

// ── รายงาน ──
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const diffPct = (l: Line) => {
  if (l.engineer == null || l.engineer === 0) return null;
  const d = ((l.system - l.engineer) / l.engineer) * 100;
  return Math.abs(d) < 0.005 ? 0 : d; // กัน "-0.00%" จากเศษทศนิยม
};
const table = [
  "| รายการ | หน่วย | ระบบ | วิศวกร | ต่าง | ความแม่นยำ |",
  "|---|---|---:|---:|---:|---:|",
  ...lines.map((l) => {
    const d = diffPct(l);
    const engineer = l.engineer == null ? "—" : fmt(l.engineer);
    const sign = d != null && d > 0 ? "+" : "";
    const diff = d == null ? "—" : `${sign}${d.toFixed(2)}%`;
    const accuracy = d == null ? "ยังไม่มีตัวเลขเทียบ" : `${Math.max(0, 100 - Math.abs(d)).toFixed(2)}%`;
    return `| ${l.item} | ${l.unit} | ${fmt(l.system)} | ${engineer} | ${diff} | ${accuracy} |`;
  }),
].join("\n");

const compared = lines.filter((l) => diffPct(l) != null);
const worst = compared.reduce<Line | null>((w, l) => (w == null || Math.abs(diffPct(l)!) > Math.abs(diffPct(w)!) ? l : w), null);
const summary =
  compared.length === 0
    ? "ยังไม่มีตัวเลขของวิศวกรให้เทียบ — ใส่ใน engineer แล้วรันใหม่"
    : `เทียบได้ ${compared.length} รายการ · คลาดมากสุด ${worst!.item} ${diffPct(worst!)!.toFixed(2)}%` +
      ` · ผ่านเกณฑ์ ±2% ${compared.filter((l) => Math.abs(diffPct(l)!) <= 2).length}/${compared.length} รายการ`;

const report = [
  `# ผลเทียบตัวคิดโครงสร้าง — ${data.project}`,
  "",
  `ตัวเลขวิศวกร: ${data.source}`,
  `ชิ้นส่วน ${data.members.length} แบบ (${data.members.reduce((n, m) => n + m.count, 0)} ชิ้น) · ปริมาณสุทธิก่อนเผื่อเสีย`,
  "",
  table,
  "",
  summary,
  "",
].join("\n");

console.log(report);
if (mdPath) {
  writeFileSync(mdPath, report, "utf8");
  console.log(`บันทึกรายงานที่ ${mdPath}`);
}
