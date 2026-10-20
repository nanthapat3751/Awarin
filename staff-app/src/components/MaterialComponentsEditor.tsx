import { Copy, Layers } from "lucide-react";

import type { MaterialDto } from "@systemboq/shared-types";

import { useConfirm } from "../lib/confirm-context";
import { SearchableSelect } from "./SearchableSelect";
import { roundTo } from "@systemboq/shared-types";
import { RecipeRows } from "./RecipeRows";

// หนึ่งแถวของสูตรวัสดุย่อย (เก็บเป็น string ระหว่างแก้ในฟอร์ม)
export interface ComponentRow {
  componentMaterialId: string;
  name: string;
  unit: string;
  qtyPerUnit: string;
  wasteFactorPct: string;
  unitPrice: string;
}

export const EMPTY_COMPONENT: ComponentRow = {
  componentMaterialId: "",
  name: "",
  unit: "",
  qtyPerUnit: "",
  wasteFactorPct: "",
  unitPrice: "",
};

/** สูตรที่มีอยู่แล้ว (วัสดุในคลัง / บรรทัดอื่นในโครงการ) ที่คัดลอกมาเป็นจุดเริ่มได้ */
export interface RecipeSource {
  value: string;
  label: string;
  rows: ComponentRow[];
}

function money(value: number): string {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function amount(value: number): string {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

const wasteOf = (r: ComponentRow) => (r.wasteFactorPct.trim() === "" ? 0 : Number(r.wasteFactorPct));

// ราคาวัสดุต่อหน่วยจากสูตร = Σ (ปริมาณต่อหน่วย × (1+เผื่อเสีย%) × ราคาต่อหน่วย) — ตรงกับ deriveMaterialUnitPrice ฝั่ง server
export function deriveUnitPriceFromRows(rows: ComponentRow[]): number {
  const sum = rows.reduce((acc, r) => {
    const qty = Number(r.qtyPerUnit);
    const price = Number(r.unitPrice);
    // ช่องที่ยังไม่ใช่ตัวเลข (NaN) ข้ามเหมือนค่าติดลบ/ศูนย์
    if (Number.isNaN(qty) || qty <= 0 || Number.isNaN(price) || price < 0) return acc;
    return acc + qty * (1 + wasteOf(r) / 100) * price;
  }, 0);
  return roundTo(sum, 2);
}

// แถวสูตรที่กรอกครบพอส่งได้ (มีชื่อ/หน่วย/ปริมาณ>0)
export function validComponentRows(rows: ComponentRow[]): ComponentRow[] {
  return rows.filter((r) => r.name.trim() && r.unit.trim() && Number(r.qtyPerUnit) > 0);
}

// แปลงสูตรที่ valid → payload ส่ง server (ใช้ตอน submit)
export function componentRowsToInput(rows: ComponentRow[]) {
  return validComponentRows(rows).map((r, i) => ({
    componentMaterialId: r.componentMaterialId || null,
    name: r.name.trim(),
    unit: r.unit.trim(),
    qtyPerUnit: Number(r.qtyPerUnit),
    wasteFactorPct: r.wasteFactorPct.trim() === "" ? null : Number(r.wasteFactorPct),
    unitPrice: Number(r.unitPrice || 0),
    sortOrder: i,
  }));
}

/** แถวสูตรจาก DTO (วัสดุในคลัง / บรรทัด BOQ) → แถวที่แก้ในฟอร์มได้ */
export function componentRowsFrom(
  components: {
    componentMaterialId: string | null;
    name: string;
    unit: string;
    qtyPerUnit: string;
    wasteFactorPct: string | null;
    unitPrice: string;
  }[],
): ComponentRow[] {
  return components.map((c) => ({
    componentMaterialId: c.componentMaterialId ?? "",
    name: c.name,
    unit: c.unit,
    qtyPerUnit: c.qtyPerUnit,
    wasteFactorPct: c.wasteFactorPct ?? "",
    unitPrice: c.unitPrice,
  }));
}

interface Props {
  rows: ComponentRow[];
  onChange: (rows: ComponentRow[]) => void;
  materialById: Map<string, MaterialDto>;
  unitLabel: string;
  unitDatalistId?: string;
  /** ปริมาณของบรรทัดตอนนี้ — มี = โชว์ค่าวัสดุทั้งบรรทัด · null = ยังคิดไม่ได้ */
  lineQuantity?: number | null;
  /** สูตรที่คัดลอกมาเริ่มได้ (ว่าง = ไม่โชว์ช่องคัดลอก) */
  copySources?: RecipeSource[];
}

/**
 * ค่าวัสดุของบรรทัด BOQ: "ใส่ราคาเอง" หรือ "คิดราคาจากสูตรวัสดุ"
 *
 * ถามก่อนว่าบรรทัดนี้คิดค่าวัสดุแบบไหน (บอกตัวอย่างว่าบรรทัดแบบไหนควรใช้สูตร) แล้วค่อยกางสูตร
 * แถวสูตรเป็นแบบอ่านเป็นประโยค ชุดเดียวกับหน้าวัสดุ (RecipeRows — ผู้ใช้เลือกแบบ A 18 ต.ค.)
 * เดิมมีช่อง "② ต้องซื้อเท่าไร" — ถอดพร้อมงานจัดซื้อ (18 ต.ค.) เหลือแต่เรื่องราคา
 *
 * โหมดตัดสินจากแถวล้วน ๆ (มีแถว = แตก) ไม่เก็บสถานะแยก — ฟอร์มล้างแถวทิ้งเมื่อไรก็กลับเป็นใส่ราคาเอง
 */
export function MaterialComponentsEditor({
  rows,
  onChange,
  materialById,
  unitLabel,
  unitDatalistId,
  lineQuantity = null,
  copySources = [],
}: Readonly<Props>) {
  const confirm = useConfirm();
  const unit = unitLabel || "หน่วย";
  const breakdown = rows.length > 0;
  const validRows = validComponentRows(rows);
  const derived = deriveUnitPriceFromRows(validRows);

  async function chooseLump() {
    if (!breakdown) return;
    if (validRows.length > 0) {
      const ok = await confirm(`ล้างวัสดุที่กรอกไว้ ${validRows.length} รายการ แล้วกลับไปใส่ราคาเอง?`, {
        confirmLabel: "ล้างแล้วใส่ราคาเอง",
        variant: "danger",
      });
      if (!ok) return;
    }
    onChange([]);
  }

  async function copyFrom(value: string) {
    const source = copySources.find((s) => s.value === value);
    if (!source) return;
    if (validRows.length > 0) {
      const ok = await confirm(`แทนวัสดุ ${validRows.length} รายการที่กรอกไว้ ด้วยสูตรของ "${source.label}"?`, {
        confirmLabel: "แทนที่",
        variant: "danger",
      });
      if (!ok) return;
    }
    // คัดลอกเป็นแถวใหม่ (คีย์ใหม่) — แก้ต่อได้ทุกช่องโดยไม่กระทบต้นฉบับ
    onChange(source.rows.map((r) => ({ ...r })));
  }

  const choiceClass = (active: boolean) =>
    `flex flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors ${
      active ? "border-slate-800 bg-white ring-1 ring-slate-800" : "border-slate-200 bg-white hover:border-slate-400"
    }`;
  const radioDot = (active: boolean) => (
    <span
      aria-hidden
      className={`flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full border ${
        active ? "border-slate-800" : "border-slate-400"
      }`}
    >
      {active && <span className="h-1.5 w-1.5 rounded-full bg-slate-800" />}
    </span>
  );

  const copyPicker = copySources.length > 0 && (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
      <Copy size={13} className="text-slate-400" />
      <span>เริ่มจากสูตรที่มีอยู่</span>
      <div className="min-w-64 flex-1">
        <SearchableSelect
          options={copySources.map(({ value, label }) => ({ value, label }))}
          value=""
          onChange={(v) => void copyFrom(v)}
          placeholder="คัดลอกจากวัสดุในคลัง / บรรทัดอื่นในโครงการ"
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-2 text-xs font-medium text-slate-700">ค่าวัสดุของบรรทัดนี้คิดยังไง?</p>
        <div role="radiogroup" aria-label="วิธีคิดค่าวัสดุ" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" role="radio" aria-checked={!breakdown} onClick={() => void chooseLump()} className={choiceClass(!breakdown)}>
            <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
              {radioDot(!breakdown)} ใส่ราคาเอง
            </span>
            <span className="pl-5.5 text-xs text-slate-500">ของชิ้นเดียว งานเหมา หรือค่าแรงล้วน · เช่น สุขภัณฑ์ 1 ชุด</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={breakdown}
            onClick={() => !breakdown && onChange([{ ...EMPTY_COMPONENT }])}
            className={choiceClass(breakdown)}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
              {radioDot(breakdown)} คิดราคาจากสูตรวัสดุ
            </span>
            <span className="pl-5.5 text-xs text-slate-500">งานที่ผสมจากของหลายอย่าง · เช่น ผนังก่ออิฐ เทคอนกรีต</span>
          </button>
        </div>
      </div>

      {breakdown && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
            <Layers size={14} className="text-brand" /> สูตรวัสดุของ 1 {unit}
          </p>
          {copyPicker}
          <RecipeRows
            rows={rows}
            onChange={onChange}
            emptyRow={() => ({ ...EMPTY_COMPONENT })}
            unitLabel={unit}
            materialById={materialById}
            unitDatalistId={unitDatalistId}
            footer={
              lineQuantity != null && lineQuantity > 0 && validRows.length > 0 ? (
                <p className="text-right text-xs text-slate-500">
                  งาน {amount(lineQuantity)} {unit} · ค่าวัสดุทั้งบรรทัด{" "}
                  <span className="font-medium tabular-nums text-slate-700">{money(roundTo(lineQuantity * derived, 2))}</span> บาท
                </p>
              ) : null
            }
          />
        </div>
      )}

      {!breakdown && copySources.length > 0 && (
        <p className="text-xs text-slate-400">หรือเลือก &quot;คิดราคาจากสูตรวัสดุ&quot; แล้วคัดลอกสูตรจากวัสดุ/บรรทัดอื่นมาแก้ต่อได้</p>
      )}
    </div>
  );
}
