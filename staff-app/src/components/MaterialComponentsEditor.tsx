import { Layers, Plus, Trash2 } from "lucide-react";

import type { MaterialDto } from "@systemboq/shared-types";

import { Button } from "./Button";
import { SearchableSelect, type SearchableOption } from "./SearchableSelect";
import { rowKey, sameRowKey } from "../lib/row-keys";

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

function money(value: number): string {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

// ราคาวัสดุต่อหน่วยจากสูตร = Σ (ปริมาณต่อหน่วย × (1+เผื่อเสีย%) × ราคาต่อหน่วย) — ตรงกับ deriveMaterialUnitPrice ฝั่ง server
export function deriveUnitPriceFromRows(rows: ComponentRow[]): number {
  const sum = rows.reduce((acc, r) => {
    const qty = Number(r.qtyPerUnit);
    const price = Number(r.unitPrice);
    // ช่องที่ยังไม่ใช่ตัวเลข (NaN) ข้ามเหมือนค่าติดลบ/ศูนย์
    if (Number.isNaN(qty) || qty <= 0 || Number.isNaN(price) || price < 0) return acc;
    const waste = r.wasteFactorPct.trim() === "" ? 0 : Number(r.wasteFactorPct);
    return acc + qty * (1 + waste / 100) * price;
  }, 0);
  return Math.round((sum + Number.EPSILON) * 100) / 100;
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

interface Props {
  rows: ComponentRow[];
  onChange: (rows: ComponentRow[]) => void;
  materialOptions: SearchableOption[];
  materialById: Map<string, MaterialDto>;
  unitLabel: string;
  unitDatalistId?: string;
}

/**
 * ตัวแก้สูตรวัสดุย่อย (bill of materials) — ใช้ทั้งในแคตตาล็อกวัสดุและในบรรทัด BOQ.
 * เลือกวัสดุดิบจากแคตตาล็อกแล้วเติมชื่อ/หน่วย/ราคาให้อัตโนมัติ หรือกรอกเอง.
 */
export function MaterialComponentsEditor({
  rows,
  onChange,
  materialOptions,
  materialById,
  unitLabel,
  unitDatalistId,
}: Readonly<Props>) {
  const validRows = validComponentRows(rows);
  const hasRecipe = validRows.length > 0;
  const derived = deriveUnitPriceFromRows(validRows);

  const patchRow = (idx: number, patch: Partial<ComponentRow>) =>
    onChange(rows.map((r, i) => (i === idx ? sameRowKey(r, { ...r, ...patch }) : r)));
  const pickRowMaterial = (idx: number, materialId: string) => {
    const m = materialId ? materialById.get(materialId) : undefined;
    patchRow(idx, {
      componentMaterialId: materialId,
      ...(m ? { name: m.name, unit: m.unit, unitPrice: m.materialUnitPrice } : {}),
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
          <Layers size={14} className="text-brand" />
          สูตรวัสดุย่อย (ถอดปริมาณวัสดุ)
          <span className="text-slate-400 font-normal">— ต่อ 1 {unitLabel || "หน่วย"} (ไม่บังคับ)</span>
        </div>
        {hasRecipe && (
          <span className="text-xs text-slate-500">
            ราคาวัสดุ/หน่วย = <span className="font-semibold text-brand">{money(derived)}</span>
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row, idx) => {
            const rowQty = Number(row.qtyPerUnit);
            const rowPrice = Number(row.unitPrice);
            const rowWaste = row.wasteFactorPct.trim() === "" ? 0 : Number(row.wasteFactorPct);
            const rowCost = rowQty > 0 && rowPrice >= 0 ? rowQty * (1 + rowWaste / 100) * rowPrice : 0;
            return (
              <div key={rowKey(row)} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end bg-slate-50 rounded-md p-2">
                <div className="col-span-2 sm:col-span-4">
                  <span className="block text-xs text-slate-500 mb-0.5">วัสดุดิบ</span>
                  <SearchableSelect
                    options={materialOptions}
                    value={row.componentMaterialId}
                    onChange={(v) => pickRowMaterial(idx, v)}
                    placeholder="เลือกจากแคตตาล็อก / พิมพ์เอง"
                    clearable
                  />
                </div>
                <label className="col-span-1 sm:col-span-2 flex flex-col gap-0.5 text-xs text-slate-500">
                  <span>ชื่อ</span>
                  <input
                    value={row.name}
                    onChange={(e) => patchRow(idx, { name: e.target.value })}
                    className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                  />
                </label>
                <label className="col-span-1 sm:col-span-1 flex flex-col gap-0.5 text-xs text-slate-500">
                  <span>หน่วย</span>
                  <input
                    list={unitDatalistId}
                    value={row.unit}
                    onChange={(e) => patchRow(idx, { unit: e.target.value })}
                    className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                  />
                </label>
                <label className="col-span-1 sm:col-span-2 flex flex-col gap-0.5 text-xs text-slate-500">
                  <span>ปริมาณ/หน่วย</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.qtyPerUnit}
                    onChange={(e) => patchRow(idx, { qtyPerUnit: e.target.value })}
                    className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                  />
                </label>
                <label className="col-span-1 sm:col-span-1 flex flex-col gap-0.5 text-xs text-slate-500">
                  <span>เผื่อ%</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={row.wasteFactorPct}
                    onChange={(e) => patchRow(idx, { wasteFactorPct: e.target.value })}
                    className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                  />
                </label>
                <label className="col-span-1 sm:col-span-1 flex flex-col gap-0.5 text-xs text-slate-500">
                  <span>ราคา/หน่วย</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.unitPrice}
                    onChange={(e) => patchRow(idx, { unitPrice: e.target.value })}
                    className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                  />
                </label>
                <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:justify-end gap-1">
                  <span
                    className="text-xs text-slate-500"
                    title="ต้นทุนวัสดุย่อยนี้ต่อ 1 หน่วยของรายการ"
                  >
                    {money(rowCost)}
                  </span>
                  <button
                    type="button"
                    aria-label="ลบวัสดุย่อย"
                    onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* เป็นการกระทำ (เพิ่มแถว) ไม่ใช่การนำทาง จึงเป็นปุ่มเงียบเหมือนปุ่มประจำแถวอื่นในแอป */}
      <Button
        variant="ghost"
        size="sm"
        className="mt-2"
        onClick={() => onChange([...rows, { ...EMPTY_COMPONENT }])}
      >
        <Plus size={14} /> เพิ่มวัสดุย่อย
      </Button>
    </div>
  );
}
