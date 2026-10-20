import { Layers, Plus, Trash2 } from "lucide-react";
import { useId, type ReactNode } from "react";

import type { MaterialDto } from "@systemboq/shared-types";

import { rowKey, sameRowKey } from "../lib/row-keys";
import { Button, iconButtonClasses } from "./Button";
import { Tooltip } from "./Tooltip";

/** หนึ่งแถวของสูตร (เก็บเป็น string ระหว่างแก้ในฟอร์ม) — รูปเดียวกับ ComponentRow ของสองหน้าที่ใช้ */
export interface RecipeRow {
  componentMaterialId: string;
  name: string;
  unit: string;
  qtyPerUnit: string;
  wasteFactorPct: string;
  unitPrice: string;
}

const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wasteOf = (r: RecipeRow) => (r.wasteFactorPct.trim() === "" ? 0 : Number(r.wasteFactorPct));

/** เงินของแถวต่องาน 1 หน่วย — ช่องที่ยังไม่ใช่ตัวเลขนับเป็น 0 (ตรงกับ deriveMaterialUnitPrice ฝั่งเซิร์ฟเวอร์) */
export function recipeRowCost(r: RecipeRow): number {
  const qty = Number(r.qtyPerUnit);
  const price = Number(r.unitPrice);
  if (Number.isNaN(qty) || qty <= 0 || Number.isNaN(price) || price < 0) return 0;
  return qty * (1 + wasteOf(r) / 100) * price;
}

const SMALL =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm tabular-nums focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

/**
 * สูตรวัสดุแบบ "อ่านเป็นประโยค" (แบบ A ผู้ใช้เลือก 18 ต.ค.) — ใช้ร่วมกันในหน้าวัสดุและแผงแก้บรรทัด BOQ
 *
 * เดิมเป็นตาราง 7 ช่อง (วัสดุดิบ · ชื่อ · หน่วย · ปริมาณ/หน่วย · เผื่อ% · ราคา/หน่วย) ผู้ใช้ไม่รู้ว่า "หน่วย"
 * หมายถึงหน่วยของงานหรือหน่วยของของ — ตอนนี้แต่ละแถวอ่านว่า
 * "ใช้ [อิฐมอญ] [130] [ก้อน] ต่อ 1 ตร.ม. · เผื่อ [5]% · ราคา [1.20] บาท/ก้อน = 163.80"
 * ช่องชื่อรวมกับการเลือกจากคลัง (พิมพ์เอง หรือเลือกชื่อจากรายการ แล้วหน่วย/ราคาเติมให้) · ยอดล่างบอกว่าใช้แทนราคาที่พิมพ์ไว้
 */
export function RecipeRows<R extends RecipeRow>({
  rows,
  onChange,
  emptyRow,
  unitLabel,
  materialById,
  renderUnit,
  unitDatalistId,
  typedPrice,
  footer,
}: Readonly<{
  rows: R[];
  onChange: (rows: R[]) => void;
  emptyRow: () => R;
  /** หน่วยนับของงาน (ตร.ม.) — ว่าง = "หน่วย" */
  unitLabel: string;
  /** วัสดุในคลังที่เลือกเป็นของในสูตรได้ */
  materialById: Map<string, MaterialDto>;
  /** ช่องหน่วยของของ (หน้าวัสดุใช้ UnitSelect) — ไม่ส่ง = ช่องพิมพ์ธรรมดา + datalist */
  renderUnit?: (value: string, onChange: (unit: string) => void) => ReactNode;
  unitDatalistId?: string;
  /** ราคาวัสดุที่พิมพ์ไว้ก่อนมีสูตร — มี = บอกว่ายอดสูตรใช้แทนตัวเลขนี้ */
  typedPrice?: number | null;
  /** บรรทัดเพิ่มใต้ยอด (เช่น ค่าวัสดุทั้งบรรทัดใน BOQ) */
  footer?: ReactNode;
}>) {
  const unit = unitLabel.trim() || "หน่วย";
  const listId = useId();
  // ชื่อในคลัง → วัสดุ (ชื่อซ้ำ = ใช้ตัวแรก) · พิมพ์ชื่อตรงกับในคลังเป๊ะ = ผูกกับวัสดุนั้น เติมหน่วย/ราคาให้
  const byName = new Map<string, MaterialDto>();
  for (const m of materialById.values()) if (!byName.has(m.name)) byName.set(m.name, m);

  const patch = (idx: number, p: Partial<RecipeRow>) =>
    onChange(rows.map((r, i) => (i === idx ? sameRowKey(r, { ...r, ...p }) : r)));

  function setName(idx: number, name: string) {
    const row = rows[idx];
    const m = byName.get(name.trim());
    if (m && m.id !== row.componentMaterialId) {
      // เลือกจากคลัง — เติมหน่วยกับราคาให้ (แก้ทับได้)
      patch(idx, { name, componentMaterialId: m.id, unit: m.unit, unitPrice: m.materialUnitPrice });
      return;
    }
    // พิมพ์เป็นชื่ออื่นแล้ว = ไม่ใช่วัสดุในคลังตัวเดิม
    patch(idx, { name, ...(m ? {} : { componentMaterialId: "" }) });
  }

  const total = rows.reduce((s, r) => s + recipeRowCost(r), 0);
  const filled = rows.some((r) => recipeRowCost(r) > 0);

  return (
    <div className="flex flex-col gap-1">
      <datalist id={listId}>
        {[...byName.keys()].map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <p className="mb-1 text-xs text-slate-500">
        งานนี้ <span className="font-medium text-slate-700">1 {unit}</span> ใช้ของอะไรบ้าง — พิมพ์ชื่อเอง หรือเลือกชื่อจากคลังแล้วหน่วยกับราคาจะเติมให้
      </p>
      {rows.map((row, idx) => {
        const rowUnit = row.unit.trim() || "หน่วย";
        const cost = recipeRowCost(row);
        return (
          <div
            key={rowKey(row)}
            data-recipe-row
            className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md bg-white px-2 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200"
          >
            <span>ใช้</span>
            <input
              list={listId}
              value={row.name}
              onChange={(e) => setName(idx, e.target.value)}
              placeholder="ชื่อของ เช่น อิฐมอญ"
              aria-label="ชื่อของที่ใช้"
              className={`${SMALL} w-44 placeholder:text-slate-300`}
            />
            <input
              type="number"
              min="0"
              step="any"
              value={row.qtyPerUnit}
              onChange={(e) => patch(idx, { qtyPerUnit: e.target.value })}
              placeholder="130"
              aria-label={`ใช้กี่${rowUnit} ต่องาน 1 ${unit}`}
              className={`${SMALL} w-20 text-right placeholder:text-slate-300`}
            />
            <span className="w-24">
              {renderUnit ? (
                renderUnit(row.unit, (u) => patch(idx, { unit: u }))
              ) : (
                <input
                  list={unitDatalistId}
                  value={row.unit}
                  onChange={(e) => patch(idx, { unit: e.target.value })}
                  placeholder="ก้อน"
                  aria-label="หน่วยของของ"
                  className={`${SMALL} w-full placeholder:text-slate-300`}
                />
              )}
            </span>
            <span>ต่อ 1 {unit} · เผื่อ</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={row.wasteFactorPct}
              onChange={(e) => patch(idx, { wasteFactorPct: e.target.value })}
              placeholder="0"
              aria-label="เผื่อแตก/เสีย (%)"
              className={`${SMALL} w-14 text-right placeholder:text-slate-300`}
            />
            <span>% · ราคา</span>
            <input
              type="number"
              min="0"
              step="any"
              value={row.unitPrice}
              onChange={(e) => patch(idx, { unitPrice: e.target.value })}
              placeholder="0.00"
              aria-label={`ราคาต่อ 1 ${rowUnit}`}
              className={`${SMALL} w-24 text-right placeholder:text-slate-300`}
            />
            <span>บาท/{rowUnit}</span>
            <span className="ml-auto flex items-center gap-1">
              <span
                className={`tabular-nums ${cost > 0 ? "font-medium text-slate-800" : "text-slate-400"}`}
                title={`เงินของ${row.name.trim() || "ของนี้"} ต่องาน 1 ${unit}`}
              >
                = {money(cost)}
              </span>
              <Tooltip label="ลบแถวนี้" side="top" align="end">
                <button
                  type="button"
                  aria-label="ลบแถวนี้"
                  onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                  className={iconButtonClasses("danger")}
                >
                  <Trash2 size={14} />
                </button>
              </Tooltip>
            </span>
          </div>
        );
      })}

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => onChange([...rows, emptyRow()])}>
          <Plus size={14} /> เพิ่มของอีกอย่าง
        </Button>
        <span className="flex items-center gap-1.5 text-sm text-slate-600">
          <Layers size={14} className="text-brand" />
          ราคาวัสดุต่อ 1 {unit}
          <span className="font-semibold tabular-nums text-brand">{money(total)}</span>
        </span>
      </div>
      {filled && typedPrice != null && Math.abs(typedPrice - total) >= 0.005 && (
        <p className="text-right text-xs text-slate-500">
          ใช้แทนราคาที่พิมพ์ไว้ {money(typedPrice)} บาท
        </p>
      )}
      {footer}
    </div>
  );
}

/**
 * หน้าว่างของสูตร (แบบ D) — บอกก่อนว่าต้องใส่ไหม งานแบบไหนไม่ต้องใส่ แล้วค่อยให้เริ่ม
 * ตัวอย่างเป็นภาพอธิบายเท่านั้น (ติดป้าย "ตัวอย่าง") ไม่ใช่ค่ามาตรฐาน — ตัวเลขจริงต้องมาจากผู้ใช้
 */
export function RecipeEmptyState({ unitLabel, onStart }: Readonly<{ unitLabel: string; onStart: () => void }>) {
  const unit = unitLabel.trim() || "หน่วย";
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="text-slate-700">
        <span className="font-medium text-slate-800">ยังไม่มีสูตร</span> — ราคาวัสดุใช้ตัวเลขที่พิมพ์ไว้ด้านบน
      </p>
      <p className="text-xs text-slate-500">
        ถ้างานนี้ผสมจากของหลายอย่าง บอกว่า 1 {unit} ใช้อะไรเท่าไหร่ ระบบจะคิดราคาวัสดุให้ และตอบได้ว่าราคามาจากไหน
      </p>
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">ตัวอย่าง</span>
        ผนัง 1 ตร.ม. = อิฐ 130 ก้อน + ปูนก่อ 0.25 ถุง + ทราย 0.01 คิว
      </p>
      <div className="mt-1">
        <Button variant="ghost" size="sm" onClick={onStart}>
          <Plus size={14} /> เริ่มใส่สูตร
        </Button>
      </div>
      <p className="text-xs text-slate-400">ประตู สุขภัณฑ์ ของสำเร็จรูป ไม่ต้องใส่สูตร — พิมพ์ราคาตรง ๆ ได้เลย</p>
    </div>
  );
}
