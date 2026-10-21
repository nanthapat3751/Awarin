import type { ProjectOpeningDto } from "@systemboq/shared-types";
import { DoorOpen, Plus, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

import { openingsTotal } from "../lib/takeoff";
import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

const fmt2 = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Row {
  key: number;
  label: string;
  count: string;
  width: string;
  height: string;
}

let nextKey = 1;
const blank = (): Row => ({ key: nextKey++, label: "", count: "", width: "", height: "" });

/**
 * รายการช่องเปิดประตู/หน้าต่างของโครงการ — ยอดรวมหักออกจากพื้นที่ผนังก่อนคิดงานผนังทุกบรรทัด
 * (ก่ออิฐ/ฉาบ/ทาสีไม่ทำตรงช่องเปิด) · กรอกตามตารางประตูหน้าต่างในแบบ: ชื่อ × จำนวน × กว้าง × สูง
 */
export function OpeningsDialog({
  initial,
  wallArea,
  onApply,
  onClose,
}: Readonly<{
  initial: ProjectOpeningDto[];
  /** พื้นที่ผนังที่ใช้คิดอยู่ (ก่อนหัก) — null = ยังไม่ได้ตั้ง */
  wallArea: number | null;
  onApply: (openings: ProjectOpeningDto[]) => void;
  onClose: () => void;
}>) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length
      ? initial.map((o) => ({ key: nextKey++, label: o.label, count: String(o.count), width: String(o.width), height: String(o.height) }))
      : [blank()],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { valid, error } = useMemo(() => {
    const out: ProjectOpeningDto[] = [];
    for (const [i, r] of rows.entries()) {
      if (!r.label.trim() && !r.count && !r.width && !r.height) continue;
      const count = Number(r.count);
      const width = Number(r.width);
      const height = Number(r.height);
      if (!Number.isInteger(count) || count < 1) return { valid: out, error: `แถว ${i + 1}: จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1` };
      if (!positive(width) || !positive(height)) return { valid: out, error: `แถว ${i + 1}: กรอกกว้างและสูง (เมตร)` };
      out.push({ label: r.label.trim() || `ช่องเปิด ${i + 1}`, count, width, height });
    }
    return { valid: out, error: null as string | null };
  }, [rows]);

  const total = openingsTotal(valid);
  const tooBig = wallArea != null && valid.length > 0 && total >= wallArea;
  const blocker = error ?? (tooBig ? `ช่องเปิดรวมต้องน้อยกว่าพื้นที่ผนัง ${fmt2(wallArea!)} ตร.ม.` : null);
  const update = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const cell = "w-full min-w-0 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" tabIndex={-1} aria-label="ปิด" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-black/40" />
      <dialog open aria-modal="true" aria-labelledby="openings-title" className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="openings-title" className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <DoorOpen size={18} className="text-brand" /> ช่องเปิดประตู/หน้าต่าง
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">ยอดรวมหักออกจากพื้นที่ผนัง ก่อนคิดงานผนังทุกบรรทัด (ก่อ ฉาบ ทาสี)</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-2">
              <tr>
                <th>ชื่อตามแบบ</th>
                <th className="w-20 text-right">จำนวน</th>
                <th className="w-24 text-right">กว้าง (ม.)</th>
                <th className="w-24 text-right">สูง (ม.)</th>
                <th className="w-24 text-right">= ตร.ม.</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const area = Number(r.count) * Number(r.width) * Number(r.height);
                return (
                  <tr key={r.key} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">
                      <input value={r.label} onChange={(e) => update(i, { label: e.target.value })} placeholder={i === 0 ? "เช่น D1, W2" : ""} maxLength={80} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="1" step="1" value={r.count} onChange={(e) => update(i, { count: e.target.value })} aria-label={`จำนวน แถว ${i + 1}`} className={cell} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" step="any" value={r.width} onChange={(e) => update(i, { width: e.target.value })} aria-label={`กว้าง แถว ${i + 1}`} className={cell} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" step="any" value={r.height} onChange={(e) => update(i, { height: e.target.value })} aria-label={`สูง แถว ${i + 1}`} className={cell} />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{area > 0 ? fmt2(area) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-1 py-1.5">
                      <Tooltip label="ลบแถว" side="top" align="end">
                        <button type="button" onClick={() => setRows((prev) => (prev.length === 1 ? [blank()] : prev.filter((_, j) => j !== i)))} aria-label={`ลบแถว ${i + 1}`} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      </Tooltip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div>
            <Button variant="ghost" size="sm" onClick={() => setRows((prev) => [...prev, blank()])}>
              <Plus size={14} /> เพิ่มช่องเปิด
            </Button>
          </div>
          <div className="ml-auto w-full max-w-xs rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm tabular-nums">
            <div className="flex justify-between">
              <span className="text-slate-500">ช่องเปิดรวม</span>
              <span className="font-semibold text-slate-800">{fmt2(total)} ตร.ม.</span>
            </div>
            {wallArea != null && (
              <div className="mt-1 flex justify-between border-t border-slate-200 pt-1">
                <span className="text-slate-500">ผนัง {fmt2(wallArea)} → เหลือ</span>
                <span className={`font-semibold ${tooBig ? "text-red-600" : "text-brand"}`}>{fmt2(Math.max(wallArea - total, 0))} ตร.ม.</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-5 py-3">
          {blocker && <span className="text-xs text-amber-700">{blocker}</span>}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button onClick={() => onApply(valid)} disabled={Boolean(blocker)}>
              ใช้รายการนี้
            </Button>
          </div>
        </div>
      </dialog>
    </div>,
    document.body,
  );
}

function positive(n: number) {
  return n > 0;
}
