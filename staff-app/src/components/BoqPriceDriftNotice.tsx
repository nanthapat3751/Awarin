import type { BoqPriceDriftDto, BoqPriceDriftLineDto } from "@systemboq/shared-types";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError } from "../lib/api";
import { applyCatalogPrices, getPriceDrift, keepCurrentPrices } from "../lib/boq-api";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";

function money(value: string | number): string {
  return Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function signedMoney(value: number): string {
  if (value === 0) return "0.00";
  return `${value > 0 ? "+" : "−"}${money(Math.abs(value))}`;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

/** ราคาต่อหน่วย วัสดุ + แรง ในบรรทัดเดียว — ค่าแรงศูนย์ไม่ต้องโชว์ */
function unitPrices(p: BoqPriceDriftLineDto["current"]): string {
  const labor = Number(p.laborUnitPrice);
  return labor ? `${money(p.materialUnitPrice)} + แรง ${money(labor)}` : money(p.materialUnitPrice);
}

/**
 * แถบเตือนบนแท็บ BOQ เมื่อราคาในคลังวัสดุเปลี่ยนหลังจากตั้งราคาในโครงการ
 *
 * ราคาใน BOQ ถูกตรึงไว้โดยตั้งใจ (ใบเสนอราคาที่ส่งแล้วต้องไม่ขยับเอง) — แถบนี้แค่บอกให้รู้ แล้วให้
 * พนักงานเลือกเองทีละบรรทัดว่าจะใช้ราคาใหม่หรือคงราคาเดิม · ไม่มีอะไรเกิดขึ้นเองโดยไม่กด
 */
/** สีของตัวเลขส่วนต่าง: แพงขึ้น = แดง · ถูกลง = เขียว · เท่าเดิม = จาง */
function deltaColor(delta: number): string {
  if (delta > 0) return "text-red-700";
  if (delta < 0) return "text-emerald-700";
  return "text-slate-400";
}

export function BoqPriceDriftNotice({
  projectId,
  refreshKey,
  onChanged,
  onLines,
}: {
  projectId: string;
  /** เปลี่ยนเมื่อ BOQ เปลี่ยน (เวอร์ชัน/ยอด) — โหลดสถานะใหม่ */
  refreshKey: string;
  onChanged: () => void;
  /** id บรรทัดที่ควรตรวจราคา (ว่าง = ไม่มี) — หน้าโครงการใช้ขึ้นจุดบนแท็บหมวด */
  onLines?: (itemIds: Set<string>) => void;
}) {
  const toast = useToast();
  const [drift, setDrift] = useState<BoqPriceDriftDto | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // "คงราคาเดิม" ไม่ทำให้ยอด BOQ ขยับ (refreshKey เท่าเดิม) — ต้องโหลดตัวเองใหม่
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let alive = true;
    getPriceDrift(projectId)
      .then((d) => {
        if (!alive) return;
        setDrift(d);
        setSelected(new Set(d.lines.map((l) => l.itemId)));
        onLines?.(new Set(d.applicable ? d.lines.map((l) => l.itemId) : []));
      })
      // แถบเสริม — โหลดไม่ได้ก็ไม่ควรรบกวนหน้า BOQ ที่เหลือ
      .catch(() => {
        if (!alive) return;
        setDrift(null);
        onLines?.(new Set());
      });
    return () => {
      alive = false;
    };
    // onLines เป็น setState ของหน้าแม่ (ไม่เปลี่ยน) — ใส่ใน deps แล้วฟังก์ชันแบบ inline จะโหลดวนไม่หยุด
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshKey, reloadTick]);

  if (!drift || !drift.applicable || drift.lines.length === 0) return null;

  const lines = drift.lines;
  const chosen = lines.filter((l) => selected.has(l.itemId));
  const chosenDelta = chosen.reduce((s, l) => s + Number(l.catalog.lineTotal) - Number(l.current.lineTotal), 0);
  const totalDelta = Number(drift.directCostDelta);
  const allChosen = chosen.length === lines.length;

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(kind: "apply" | "keep") {
    const ids = chosen.map((l) => l.itemId);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      if (kind === "apply") {
        const res = await applyCatalogPrices(projectId, ids);
        toast.success(
          res.newVersion
            ? `อัปเดตราคา ${res.updatedCount} รายการ ในเวอร์ชันใหม่ (${res.version.versionNo}) — ใบเสนอราคาที่ส่งไปแล้วไม่เปลี่ยน`
            : `อัปเดตราคา ${res.updatedCount} รายการแล้ว`,
        );
      } else {
        const res = await keepCurrentPrices(projectId, ids);
        toast.success(`คงราคาเดิม ${res.keptCount} รายการ — ถ้าราคาในคลังเปลี่ยนอีกจะเตือนใหม่`);
      }
      setReloadTick((t) => t + 1);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 text-amber-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <AlertTriangle size={16} className="shrink-0 text-amber-700" />
        <p className="min-w-0 flex-1 text-sm">
          ราคาในคลังวัสดุเปลี่ยนหลังตั้งราคาในโครงการนี้ <strong>{lines.length} รายการ</strong>
          <span className="text-amber-800">
            {" "}
            · ถ้าใช้ราคาใหม่ทั้งหมด ต้นทุนตรง{" "}
            <span className="tabular-nums font-medium">{signedMoney(totalDelta)}</span> บาท (ก่อนบวกกำไรและ VAT)
          </span>
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-amber-900 hover:bg-amber-100"
        >
          {open ? "ซ่อน" : "ดูรายการ"} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-amber-200 bg-white px-3 py-3">
          {drift.versionQuoted && (
            <p className="mb-2 text-xs text-slate-600">
              เวอร์ชันนี้ส่งเป็นใบเสนอราคาแล้ว — ถ้าอัปเดต ระบบจะสร้างเวอร์ชันใหม่ ใบที่ส่งไปแล้วไม่เปลี่ยน
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="w-8 py-1.5 pr-2">
                    <input
                      type="checkbox"
                      aria-label="เลือกทั้งหมด"
                      checked={allChosen}
                      onChange={() => setSelected(allChosen ? new Set() : new Set(lines.map((l) => l.itemId)))}
                    />
                  </th>
                  <th className="py-1.5 pr-3 font-medium">รายการ</th>
                  <th className="py-1.5 pr-3 text-right font-medium">ราคาต่อหน่วยในโครงการ</th>
                  <th className="py-1.5 pr-3 text-right font-medium">ในคลังตอนนี้</th>
                  <th className="py-1.5 text-right font-medium">ยอดบรรทัดเปลี่ยน</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {lines.map((l) => {
                  const delta = Number(l.catalog.lineTotal) - Number(l.current.lineTotal);
                  return (
                    <tr key={l.itemId} className="border-t border-slate-100 align-top">
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          aria-label={`เลือก ${l.name}`}
                          checked={selected.has(l.itemId)}
                          onChange={() => toggle(l.itemId)}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <div className="text-slate-800">{l.name}</div>
                        <div className="text-xs text-slate-500">
                          {Number(l.quantity).toLocaleString("th-TH")} {l.unit} · คลังเปลี่ยนเมื่อ{" "}
                          {formatDay(l.catalogUpdatedAt)}
                        </div>
                        {l.components.map((c, i) => (
                          <div key={i} className="text-xs text-slate-500">
                            {c.name} {money(c.from)} → {money(c.to)} /{c.unit}
                          </div>
                        ))}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-slate-500">
                        {unitPrices(l.current)}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-slate-800">
                        {unitPrices(l.catalog)}
                      </td>
                      <td
                        className={`whitespace-nowrap py-2 text-right tabular-nums ${
                          deltaColor(delta)
                        }`}
                      >
                        {signedMoney(delta)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => run("apply")} disabled={busy || chosen.length === 0}>
              ใช้ราคาในคลัง ({chosen.length})
            </Button>
            <Button variant="ghost" size="sm" onClick={() => run("keep")} disabled={busy || chosen.length === 0}>
              คงราคาเดิม
            </Button>
            {chosen.length > 0 && !allChosen && (
              <span className="text-xs text-slate-500 tabular-nums">
                ต้นทุนตรงของที่เลือก {signedMoney(chosenDelta)} บาท
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
