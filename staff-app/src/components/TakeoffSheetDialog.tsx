import {
  STANDARD_REBARS,
  TAKEOFF_MAX_ROWS,
  TAKEOFF_SHAPES,
  isWeightUnit,
  sumTakeoffSheet,
  takeoffRowValue,
  takeoffShapeOf,
  type TakeoffDimension,
  type TakeoffRowDto,
  type TakeoffRowInput,
  type TakeoffShape,
} from "@systemboq/shared-types";
import { Minus, Plus, Ruler, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

const fmt3 = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtQty = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 3 });

/** แถวในหน้าจอ — ตัวเลขเก็บเป็นข้อความระหว่างพิมพ์ (ช่องว่าง = ไม่ได้กรอก) */
interface EditorRow {
  key: number;
  label: string;
  count: string;
  length: string;
  width: string;
  height: string;
  barDia: string;
  deduct: boolean;
  /** แถวจากตัวคิดชิ้นส่วน — คงไว้ตอนบันทึก (ดู TakeoffRowInput.memberKey) */
  memberKey: string | null;
}

const DIM_LABEL: Record<TakeoffShape, Partial<Record<TakeoffDimension, string>>> = {
  COUNT: {},
  LENGTH: { length: "ยาว (ม.)" },
  AREA: { length: "ยาว (ม.)", width: "กว้าง/สูง (ม.)" },
  VOLUME: { length: "ยาว (ม.)", width: "กว้าง (ม.)", height: "สูง/หนา (ม.)" },
  WEIGHT: { length: "ยาว/เส้น (ม.)", barDia: "ขนาดเหล็ก" },
};

let nextKey = 1;
const blankRow = (deduct = false): EditorRow => ({
  key: nextKey++,
  label: "",
  count: "",
  length: "",
  width: "",
  height: "",
  barDia: "",
  deduct,
  memberKey: null,
});

/** แถวที่บันทึกไว้ (string จาก API หรือ number จากตัวคิดโครงสร้าง) → แถวแก้ไขได้ */
function toEditorRows(rows: (TakeoffRowDto | TakeoffRowInput)[]): EditorRow[] {
  const s = (v: string | number | null | undefined) => (v == null ? "" : String(Number(v)));
  return rows.map((r) => ({
    key: nextKey++,
    label: r.label,
    count: s(r.count),
    length: s(r.length),
    width: s(r.width),
    height: s(r.height),
    barDia: r.barDia == null ? "" : String(r.barDia),
    deduct: Boolean(r.deduct),
    memberKey: r.memberKey ?? null,
  }));
}

const isBlank = (r: EditorRow) => !r.label.trim() && !r.count && !r.length && !r.width && !r.height && !r.barDia;

/**
 * ตรวจหนึ่งแถวตามรูปแบบที่เลือก — คืน [แถวที่ใช้ได้ | null, ข้อความผิด | null]
 * กติกา: กรอกทุกมิติของรูปแบบ หรือไม่กรอกเลย (แถว "ยอดรวม" ที่นับเป็นก้อน เช่น ปริมาณเดิม)
 * กรอกครึ่ง ๆ กลาง ๆ คือพิมพ์ตก — ถ้าปล่อยผ่าน ช่องว่างจะไม่ถูกคูณแล้วตัวเลขเพี้ยนเงียบ ๆ
 */
function parseRow(r: EditorRow, index: number, shape: TakeoffShape): [TakeoffRowInput | null, string | null] {
  const where = `แถว ${index + 1}`;
  const count = Number(r.count);
  if (r.count.trim() === "" || !Number.isFinite(count) || count <= 0) return [null, `${where}: กรอกจำนวนมากกว่า 0`];
  const dims = TAKEOFF_SHAPES.find((s) => s.value === shape)!.dims;
  const filled = dims.filter((d) => r[d].trim() !== "");
  if (filled.length > 0 && filled.length < dims.length) {
    return [null, `${where}: กรอกให้ครบทุกช่อง หรือเว้นทั้งหมดถ้าเป็นยอดรวมก้อนเดียว`];
  }
  const out: TakeoffRowInput = { label: r.label.trim() || where, count, deduct: r.deduct, memberKey: r.memberKey };
  for (const d of filled) {
    const v = Number(r[d]);
    if (!Number.isFinite(v) || v <= 0) return [null, `${where}: ขนาดต้องมากกว่า 0`];
    if (d !== "barDia" && v > 10_000) return [null, `${where}: ขนาดเป็นเมตร — ${v} ม. มากผิดปกติ`];
    out[d] = v;
  }
  return [out, null];
}

/**
 * ใบถอดแบบของหนึ่งบรรทัด BOQ — กรอกทีละชิ้นจากแบบ ระบบคูณและรวมให้
 *
 * หน้าตาตั้งใจให้เหมือนกระดาษถอดแบบที่วิศวกรคุ้น: หนึ่งแถว = หนึ่งชิ้นส่วน · คอลัมน์ตามหน่วยงาน ·
 * แถวหักเป็นสีแดงมีเครื่องหมายลบ · ยอดรวมและเผื่อเสียอยู่ท้ายใบ กด Enter = ไปแถวถัดไป
 */
export function TakeoffSheetDialog({
  lineName,
  unit,
  initialRows,
  initialWaste,
  previousQuantity,
  onApply,
  onDetach,
  onClose,
}: Readonly<{
  lineName: string;
  unit: string;
  initialRows: (TakeoffRowDto | TakeoffRowInput)[];
  initialWaste: string;
  /** ปริมาณที่กรอกเองอยู่ตอนนี้ (บรรทัดที่ยังไม่เคยมีใบ) — บอกให้รู้ว่าจะถูกแทน */
  previousQuantity?: string | null;
  onApply: (rows: TakeoffRowInput[], wasteFactorPct: number | null) => void | Promise<void>;
  /** มี = บรรทัดนี้ใช้ใบถอดแบบอยู่แล้ว เลิกใช้ได้ (กลับไปกรอกจำนวนเอง) */
  onDetach?: () => void | Promise<void>;
  onClose: () => void;
}>) {
  const [rows, setRows] = useState<EditorRow[]>(() => {
    const loaded = toEditorRows(initialRows);
    return loaded.length > 0 ? loaded : [blankRow()];
  });
  const [shape, setShape] = useState<TakeoffShape>(() => takeoffShapeOf(initialRows, unit));
  // 0 แสดงเป็นช่องว่าง (มีเลข 0 จาง ๆ) — ไม่งั้นคลิกแล้วพิมพ์ 5 ได้ "05"/"50"
  const [waste, setWaste] = useState(Number(initialWaste) > 0 ? String(Number(initialWaste)) : "");
  const [saving, setSaving] = useState(false);
  const tableRef = useRef<HTMLTableSectionElement>(null);
  const focusAfterAdd = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  // แถวที่เพิ่งเพิ่มด้วยปุ่ม/Enter — โฟกัสช่องชื่อให้พิมพ์ต่อได้ทันที
  useEffect(() => {
    if (focusAfterAdd.current == null) return;
    const idx = focusAfterAdd.current;
    focusAfterAdd.current = null;
    tableRef.current?.querySelector<HTMLInputElement>(`[data-row="${idx}"][data-col="label"]`)?.focus();
  }, [rows.length]);

  const weightAllowed = isWeightUnit(unit);
  const dims = TAKEOFF_SHAPES.find((s) => s.value === shape)!.dims;
  const wasteNum = waste.trim() === "" ? 0 : Number(waste);

  const parsed = useMemo(() => {
    const valid: TakeoffRowInput[] = [];
    const errors: { index: number; message: string }[] = [];
    rows.forEach((r, i) => {
      if (isBlank(r)) return;
      const [row, err] = parseRow(r, i, shape);
      if (row) valid.push(row);
      else errors.push({ index: i, message: err! });
    });
    return { valid, errors };
  }, [rows, shape]);

  const total = sumTakeoffSheet(parsed.valid, unit, Number.isFinite(wasteNum) ? wasteNum : 0);
  const wasteError = !Number.isFinite(wasteNum) || wasteNum < 0 || wasteNum > 100 ? "เผื่อเสียต้องอยู่ระหว่าง 0–100%" : null;
  const blocker =
    parsed.errors[0]?.message ??
    wasteError ??
    (parsed.valid.length === 0 ? "กรอกอย่างน้อย 1 แถว" : null) ??
    (total.quantity <= 0 ? "แถวหักมากกว่าแถวบวก — ปริมาณต้องมากกว่า 0" : null) ??
    (parsed.valid.length > TAKEOFF_MAX_ROWS ? `ใบหนึ่งมีได้ไม่เกิน ${TAKEOFF_MAX_ROWS} แถว` : null);
  const errorRows = new Set(parsed.errors.map((e) => e.index));

  function update(index: number, patch: Partial<EditorRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow(deduct = false) {
    focusAfterAdd.current = rows.length;
    setRows((prev) => [...prev, blankRow(deduct)]);
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length === 1 ? [blankRow()] : prev.filter((_, i) => i !== index)));
  }

  // Enter = ลงไปช่องเดียวกันของแถวถัดไป (แถวสุดท้าย = เพิ่มแถวใหม่) เหมือนพิมพ์ในตาราง Excel
  function onCellKeyDown(e: ReactKeyboardEvent<HTMLElement>, index: number, col: string) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (index === rows.length - 1) {
      addRow(rows[index].deduct);
      return;
    }
    tableRef.current?.querySelector<HTMLElement>(`[data-row="${index + 1}"][data-col="${col}"]`)?.focus();
  }

  async function apply() {
    if (blocker) return;
    setSaving(true);
    try {
      await onApply(parsed.valid, wasteNum === 0 ? null : wasteNum);
    } finally {
      setSaving(false);
    }
  }

  async function detach() {
    if (!onDetach) return;
    setSaving(true);
    try {
      await onDetach();
    } finally {
      setSaving(false);
    }
  }

  const cell = "border border-slate-300 rounded-md px-2 py-1 text-sm text-right tabular-nums w-full min-w-0";
  const showDeductButton = shape !== "WEIGHT" && shape !== "COUNT";

  // portal ไปที่ body: ใบนี้เปิดจากในฟอร์มเพิ่มบรรทัด/แถวแก้ไข — ถ้าอยู่ใน DOM เดียวกัน Enter จะไป
  // ยิงบันทึกฟอร์มแม่ และ Esc จะปิดแถวแก้ไขพร้อมกับปิดใบ
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
        aria-labelledby="takeoff-title"
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="takeoff-title" className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <Ruler size={18} className="text-brand" /> ใบถอดแบบ
            </h2>
            <p className="mt-0.5 truncate text-sm text-slate-600">
              {lineName} <span className="text-slate-400">· หน่วย {unit}</span>
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

        <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-sm text-slate-600">กรอกทีละชิ้นจากแบบ ระบบคูณและรวมให้</p>
            {/* รูปแบบ = คอลัมน์ที่ต้องกรอก ตั้งต้นจากหน่วยของบรรทัด เปลี่ยนได้ (เช่น งานเหมาที่อยากถอดเป็นพื้นที่) */}
            <div role="radiogroup" aria-label="รูปแบบการถอด" className="ml-auto inline-flex rounded-md border border-slate-300 p-0.5 text-xs">
              {TAKEOFF_SHAPES.map((s) => {
                const disabled = s.value === "WEIGHT" && !weightAllowed;
                return (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={shape === s.value}
                    disabled={disabled}
                    title={disabled ? "ใช้ได้กับบรรทัดหน่วย กก. หรือ ตัน" : undefined}
                    onClick={() => setShape(s.value)}
                    className={`rounded px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      shape === s.value ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {previousQuantity && (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              ตอนนี้กรอกจำนวนเองไว้ {fmtQty(Number(previousQuantity))} {unit} — ผลรวมของใบนี้จะใช้แทน
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-2">
                <tr>
                  <th className="w-8 text-center">#</th>
                  <th className="min-w-40">ชิ้นส่วน / ตำแหน่ง</th>
                  <th className="w-24 text-right">{shape === "WEIGHT" ? "จำนวนเส้น" : "จำนวน"}</th>
                  {dims.map((d) => (
                    <th key={d} className="w-28 text-right">
                      {DIM_LABEL[shape][d]}
                    </th>
                  ))}
                  <th className="w-28 text-right">= {shape === "WEIGHT" ? (unit.includes("ตัน") ? "ตัน" : "กก.") : unit}</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody ref={tableRef}>
                {rows.map((r, i) => {
                  const [row] = isBlank(r) ? [null] : parseRow(r, i, shape);
                  const value = row ? takeoffRowValue(row, unit) : null;
                  const bad = errorRows.has(i);
                  return (
                    <tr
                      key={r.key}
                      className={`border-t border-slate-100 ${r.deduct ? "bg-red-50/60" : ""} ${bad ? "outline outline-1 -outline-offset-1 outline-amber-400" : ""}`}
                    >
                      <td className="px-2 py-1.5 text-center text-xs text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          {r.deduct && (
                            <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">หัก</span>
                          )}
                          <input
                            data-row={i}
                            data-col="label"
                            value={r.label}
                            onChange={(e) => update(i, { label: e.target.value })}
                            onKeyDown={(e) => onCellKeyDown(e, i, "label")}
                            placeholder={r.deduct ? "เช่น ประตู D1" : i === 0 ? "เช่น F1, ผนังห้องนอน 1" : ""}
                            maxLength={120}
                            className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          data-row={i}
                          data-col="count"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          value={r.count}
                          onChange={(e) => update(i, { count: e.target.value })}
                          onKeyDown={(e) => onCellKeyDown(e, i, "count")}
                          aria-label={`จำนวน แถว ${i + 1}`}
                          className={cell}
                        />
                      </td>
                      {dims.map((d) =>
                        d === "barDia" ? (
                          <td key={d} className="px-2 py-1.5">
                            <select
                              data-row={i}
                              data-col={d}
                              value={r.barDia}
                              onChange={(e) => update(i, { barDia: e.target.value })}
                              onKeyDown={(e) => onCellKeyDown(e, i, d)}
                              aria-label={`ขนาดเหล็ก แถว ${i + 1}`}
                              className="w-full rounded-md border border-slate-300 px-1.5 py-1 text-sm"
                            >
                              <option value="">—</option>
                              {STANDARD_REBARS.map((b) => (
                                <option key={b.code} value={b.diameterMm}>
                                  {b.code}
                                </option>
                              ))}
                            </select>
                          </td>
                        ) : (
                          <td key={d} className="px-2 py-1.5">
                            <input
                              data-row={i}
                              data-col={d}
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="any"
                              value={r[d]}
                              onChange={(e) => update(i, { [d]: e.target.value })}
                              onKeyDown={(e) => onCellKeyDown(e, i, d)}
                              aria-label={`${DIM_LABEL[shape][d]} แถว ${i + 1}`}
                              className={cell}
                            />
                          </td>
                        ),
                      )}
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${r.deduct ? "text-red-700" : "text-slate-800"}`}
                      >
                        {value == null ? <span className="text-slate-300">—</span> : `${r.deduct ? "−" : ""}${fmt3(value)}`}
                      </td>
                      <td className="px-1 py-1.5">
                        <div className="flex items-center justify-end gap-0.5">
                          {showDeductButton && (
                            <button
                              type="button"
                              onClick={() => update(i, { deduct: !r.deduct })}
                              title={r.deduct ? "เปลี่ยนเป็นแถวบวก" : "เปลี่ยนเป็นแถวหัก"}
                              aria-pressed={r.deduct}
                              aria-label={`แถวหัก แถว ${i + 1}`}
                              className={`rounded p-1 ${r.deduct ? "text-red-600 hover:bg-red-100" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
                            >
                              <Minus size={14} />
                            </button>
                          )}
                          <Tooltip label="ลบแถว" side="top" align="end">
                            <button
                              type="button"
                              onClick={() => removeRow(i)}
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
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => addRow(false)}>
              <Plus size={14} /> เพิ่มแถว
            </Button>
            {showDeductButton && (
              <Button variant="ghost" size="sm" onClick={() => addRow(true)}>
                <Minus size={14} /> เพิ่มแถวหัก (ช่องเปิด/ส่วนที่ซ้อน)
              </Button>
            )}
            <span className="text-xs text-slate-400">Enter = ไปแถวถัดไป</span>
          </div>

          {/* ท้ายใบ: บวก − หัก = สุทธิ → × เผื่อเสีย = ปริมาณที่ลงบรรทัด */}
          <div className="ml-auto w-full max-w-sm rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
              <dt className="text-slate-500">รวม</dt>
              <dd className="text-right text-slate-700">{fmt3(total.added)}</dd>
              {total.deducted > 0 && (
                <>
                  <dt className="text-slate-500">หัก</dt>
                  <dd className="text-right text-red-700">−{fmt3(total.deducted)}</dd>
                  <dt className="text-slate-500">สุทธิ</dt>
                  <dd className="text-right text-slate-700">{fmt3(total.net)}</dd>
                </>
              )}
              <dt className="flex items-center gap-2 text-slate-500">
                <label htmlFor="takeoff-waste">เผื่อเสีย</label>
                <input
                  id="takeoff-waste"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="any"
                  value={waste}
                  placeholder="0"
                  onChange={(e) => setWaste(e.target.value)}
                  className="w-16 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-right text-sm"
                />
                %
              </dt>
              <dd className="text-right text-slate-500">{wasteNum > 0 ? `+${fmt3(total.quantity - total.net)}` : "—"}</dd>
            </dl>
            <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-2">
              <span className="font-medium text-slate-700">ปริมาณที่ใช้</span>
              <span className="text-lg font-semibold text-brand tabular-nums">
                {fmtQty(Math.max(total.quantity, 0))} <span className="text-sm font-normal">{unit}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-5 py-3">
          {onDetach && (
            <Button variant="dangerQuiet" size="sm" onClick={detach} disabled={saving}>
              เลิกใช้ใบถอดแบบ
            </Button>
          )}
          {blocker && parsed.valid.length + parsed.errors.length > 0 && (
            <span className="text-xs text-amber-700">{blocker}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={apply} disabled={Boolean(blocker) || saving}>
              {saving ? "กำลังบันทึก..." : `ใช้ปริมาณ ${fmtQty(Math.max(total.quantity, 0))} ${unit}`}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * ช่อง "ปริมาณ" ของบรรทัดที่ถอดจากแบบ (ใช้ในฟอร์มเพิ่มและแผงแก้ไข) — แสดงผลรวม + จำนวนแถว
 * และปุ่มเปิดใบ; ใบยังไม่ถูกบันทึกจนกว่าจะกดบันทึกของฟอร์ม
 */
export function SheetQuantityBlock({
  lineName,
  unit,
  rows,
  waste,
  onChange,
  onUseManual,
  previousQuantity,
}: Readonly<{
  lineName: string;
  unit: string;
  rows: TakeoffRowInput[];
  waste: string;
  /** จำนวนที่กรอกเองอยู่ก่อนเปลี่ยนมาใช้ใบ (บอกในใบว่าจะถูกแทน) */
  previousQuantity?: string | null;
  onChange: (rows: TakeoffRowInput[], waste: string) => void;
  /** กลับไปกรอกจำนวนเอง (เก็บผลรวมล่าสุดไว้เป็นจำนวน) */
  onUseManual: (quantity: number | null) => void;
}>) {
  const [open, setOpen] = useState(rows.length === 0);
  const total = rows.length > 0 ? sumTakeoffSheet(rows, unit, Number(waste) || 0) : null;
  const deductCount = rows.filter((r) => r.deduct).length;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-col">
        <span className="text-xs text-slate-500">ปริมาณจากใบถอดแบบ</span>
        {total ? (
          <span className="text-sm font-semibold text-slate-800 tabular-nums">
            {fmtQty(total.quantity)} {unit}
            <span className="ml-2 text-xs font-normal text-slate-500">
              {rows.length} แถว{deductCount > 0 && ` · หัก ${deductCount}`}
              {Number(waste) > 0 && ` · เผื่อ ${Number(waste)}%`}
            </span>
          </span>
        ) : (
          <span className="text-sm text-amber-700">ยังไม่ได้กรอกใบถอดแบบ</span>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Ruler size={14} /> {total ? "แก้ใบถอดแบบ" : "เปิดใบถอดแบบ"}
      </Button>
      <button
        type="button"
        onClick={() => onUseManual(total?.quantity ?? null)}
        className="link-pill text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        กลับไปกรอกจำนวนเอง
      </button>
      {open && (
        <TakeoffSheetDialog
          lineName={lineName || "รายการใหม่"}
          unit={unit || "หน่วย"}
          initialRows={rows}
          initialWaste={waste}
          previousQuantity={rows.length === 0 ? previousQuantity : null}
          onApply={(next, w) => {
            onChange(next, w == null ? "0" : String(w));
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
