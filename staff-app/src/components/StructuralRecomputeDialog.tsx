import type { StructuralRecomputeDto } from "@systemboq/shared-types";
import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { ApiError } from "../lib/api";
import { recomputeStructuralMembers } from "../lib/boq-api";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";
import { Notice } from "./Notice";

const qty = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ยอดพร้อมเครื่องหมาย + / − (ศูนย์ไม่มีเครื่องหมาย) */
function signed(n: number) {
  if (n > 0) return `+${money(n)}`;
  return n < 0 ? `−${money(Math.abs(n))}` : money(Math.abs(n));
}

/**
 * คิดชิ้นส่วนทุกชิ้นใหม่ด้วยชุดเสนอราคาปัจจุบัน (Phase 2 ข้อ 3b) — พรีวิวก่อน-หลังก่อนยืนยันเสมอ
 *
 * ใช้หลังแก้ ตั้งค่า → ถอดปริมาณ: ชิ้นที่ลงไว้ก่อนแก้ยังคิดด้วยกฎเดิมจนกว่าจะกดคิดใหม่
 * เงินในตารางเป็นต้นทุนตรง (ปริมาณ × ราคาต่อหน่วยของบรรทัด) — ราคาขายขยับตาม % กำไร/VAT ของเวอร์ชันอีกชั้น
 */
export function StructuralRecomputeDialog({
  projectId,
  onApplied,
  onClose,
}: Readonly<{ projectId: string; onApplied: () => Promise<void> | void; onClose: () => void }>) {
  const toast = useToast();
  const [preview, setPreview] = useState<StructuralRecomputeDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    recomputeStructuralMembers(projectId, false)
      .then(({ recompute }) => alive && setPreview(recompute))
      .catch((err) => alive && setError(err instanceof ApiError ? err.message : "คิดพรีวิวไม่สำเร็จ"));
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  async function confirmApply() {
    setSaving(true);
    try {
      const { recompute } = await recomputeStructuralMembers(projectId, true);
      await onApplied();
      toast.success(
        `คิดใหม่แล้ว ${recompute.changedMembers} ชิ้น · ${recompute.lines.length} บรรทัด` +
          (recompute.willBranch ? ` · แตกเป็นเวอร์ชัน ${recompute.versionNo}` : ""),
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "คิดใหม่ไม่สำเร็จ");
      setSaving(false);
    }
  }

  const nothing = preview?.changedMembers === 0;

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
        aria-labelledby="recompute-title"
        className="relative flex max-h-[88vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="recompute-title" className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <RefreshCw size={17} className="text-brand" /> คิดชิ้นส่วนใหม่ทั้งโครงการ
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              คิดทุกชิ้นด้วยชุดเสนอราคาปัจจุบัน (ตั้งค่า → ถอดปริมาณ) ขนาดเดิม · ดูผลก่อน-หลังก่อนยืนยัน
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

        <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4 text-sm">
          {error && <Notice tone="red">{error}</Notice>}
          {!preview && !error && <p className="text-slate-500">กำลังคิดพรีวิว…</p>}
          {preview && nothing && (
            <p className="text-slate-700">
              ทุกชิ้น ({preview.members} ชิ้น) ตรงกับชุดเสนอราคาปัจจุบันแล้ว — ไม่มีอะไรต้องคิดใหม่
            </p>
          )}
          {preview && !nothing && (
            <>
              <p className="text-slate-700">
                ชิ้นส่วนที่แถวจะเปลี่ยน <b>{preview.changedMembers}</b> จาก {preview.members} ชิ้น · บรรทัดที่ปริมาณขยับ{" "}
                <b>{preview.lines.length}</b> บรรทัด
              </p>
              {preview.lines.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead className="bg-slate-100 text-left text-xs text-slate-600">
                      <tr>
                        <th className="px-3 py-2 font-medium">บรรทัด</th>
                        <th className="px-3 py-2 text-right font-medium">ปริมาณเดิม</th>
                        <th className="px-3 py-2 text-right font-medium">ใหม่</th>
                        <th className="px-3 py-2 text-right font-medium">ต้นทุนตรงเปลี่ยน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.lines.map((l) => (
                        <tr key={l.itemId} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-800">{l.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                            {qty(l.qtyBefore)} {l.unit}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-900">
                            {qty(l.qtyAfter)} {l.unit}
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums ${
                              l.costAfter - l.costBefore > 0 ? "text-red-700" : "text-emerald-700"
                            }`}
                          >
                            {signed(l.costAfter - l.costBefore)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50">
                        <td colSpan={3} className="px-3 py-2 text-right text-xs text-slate-600">
                          ต้นทุนตรงรวมเปลี่ยน
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-semibold tabular-nums ${
                            preview.costDelta > 0 ? "text-red-700" : "text-emerald-700"
                          }`}
                        >
                          {signed(preview.costDelta)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <p className="text-xs text-slate-500">
                ราคาขายขยับตาม % กำไร/VAT ของเวอร์ชัน · ค่ามาตรฐาน (ทาบ ยาวเหล็ก ขอ งอ) ของทุกชิ้นถูกตั้งตามชุดเสนอราคาปัจจุบัน ·
                เผื่อเสียของบรรทัดและแถวที่กรอกเองไม่เปลี่ยน
              </p>
              {preview.willBranch && (
                <Notice tone="amber">
                  เวอร์ชัน {preview.versionNo} ส่งใบเสนอราคาแล้ว — ยืนยันแล้วจะแตกเป็นเวอร์ชันใหม่ ใบที่ส่งไปไม่เปลี่ยน
                </Notice>
              )}
            </>
          )}
          {preview && preview.skipped.length > 0 && (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="font-medium text-slate-700">ชิ้นที่ไม่ได้คิดใหม่ ({preview.skipped.length})</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {preview.skipped.map((s) => (
                  <li key={s.label}>
                    {s.label} — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {nothing ? "ปิด" : "ยกเลิก"}
          </Button>
          {!nothing && (
            <Button variant="brand" onClick={() => void confirmApply()} disabled={!preview || saving}>
              {saving ? "กำลังคิดใหม่..." : "ยืนยันคิดใหม่"}
            </Button>
          )}
        </div>
      </dialog>
    </div>,
    document.body,
  );
}
