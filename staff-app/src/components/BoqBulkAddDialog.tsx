import { ListPlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { MaterialDto } from "@systemboq/shared-types";

import { ApiError } from "../lib/api";
import { addBoqItems } from "../lib/boq-api";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";
import { SearchableSelect, type SearchableOption } from "./SearchableSelect";
import { SearchInput } from "./SearchInput";

const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** แสดงในตารางไม่เกินนี้ — คลังจริงมีหลายร้อยตัว ที่เหลือให้พิมพ์ค้น/กรองหมวดแทนการเลื่อน */
const LIST_LIMIT = 150;
/** เพดานเดียวกับเซิร์ฟเวอร์ (createBoqItemsSchema) */
const MAX_LINES = 50;
/** ปุ่มกรองของวัสดุที่ไม่ได้ผูกหมวด (หรือผูกกับหมวดที่ปิดใช้งาน) */
const NO_GROUP = "__none";

/** หมวดบนสุดของหมวดระดับรายการ — ใช้ทำปุ่มกรอง (A เตรียมการ / B โครงสร้าง …) */
export interface TopCategory {
  key: string;
  label: string;
  /** ใช้เรียงปุ่ม (รหัสหมวด) */
  sort: string;
}

/** ข้อความในช่องจำนวน: ว่าง = ไม่เลือก · ตัวเลขมากกว่า 0 = เลือก · อย่างอื่น (0, ".") = ผิด */
const qtyValue = (text: string) => (text.trim() === "" ? null : Number(text));
const isValidQty = (text: string) => {
  const n = qtyValue(text);
  return n != null && Number.isFinite(n) && n > 0;
};

/**
 * เพิ่มหลายบรรทัดจากคลังวัสดุในครั้งเดียว — ตารางเดียว พิมพ์จำนวนในแถวไหน = เลือกแถวนั้น
 * (เดิมติ๊กฝั่งซ้ายแล้วไปกรอกจำนวนฝั่งขวา ตาต้องวิ่งข้ามจอทุกรายการ)
 * Enter / ↓ ไปช่องจำนวนแถวถัดไป · ↑ ย้อนขึ้น · "เฉพาะที่เลือก" ไว้ทวนก่อนกดเพิ่ม
 * ใช้กับวัสดุในคลังเท่านั้น (ชื่อ/หน่วย/ราคามาจากคลัง) คิดปริมาณแบบกรอกเอง —
 * บรรทัดที่ต้องถอดจากแบบ/คิดจากค่าวัด/แก้ราคา ให้แก้ต่อในตารางหลังเพิ่ม หรือใช้ฟอร์มเพิ่มทีละรายการ
 */
export function BoqBulkAddDialog({
  projectId,
  materials,
  categoryOptions,
  topCategoryOf,
  onAdded,
  onClose,
}: Readonly<{
  projectId: string;
  materials: MaterialDto[];
  categoryOptions: SearchableOption[];
  /** หมวดระดับรายการ → หมวดบนสุดของมัน (ทำปุ่มกรอง) */
  topCategoryOf: Map<string, TopCategory>;
  /** categoryId ของบรรทัดแรกที่เพิ่ม — ให้หน้าโครงการเปิดหมวดนั้นโชว์ */
  onAdded: (firstCategoryId: string) => void | Promise<void>;
  onClose: () => void;
}>) {
  const toast = useToast();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  // materialId → ข้อความในช่องจำนวน (มีคีย์ = เคยพิมพ์ · ว่าง = ไม่เลือกแล้ว)
  const [qty, setQty] = useState<Record<string, string>>({});
  // โหมดทวน: ล็อกชุดแถวไว้ตอนกด — ลบจำนวนแล้วแถวยังอยู่ให้พิมพ์กลับได้ ไม่หายไปต่อหน้า
  const [reviewIds, setReviewIds] = useState<Set<string> | null>(null);
  // หมวดสำรองให้วัสดุที่ในคลังไม่ได้ผูกหมวด (หรือผูกกับหมวดที่ปิดใช้งานไปแล้ว)
  const [fallbackCategoryId, setFallbackCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const qtyRefs = useRef(new Map<string, HTMLInputElement>());

  const usableCategory = useMemo(() => new Set(categoryOptions.map((o) => o.value)), [categoryOptions]);
  const hasUsableCategory = (m: MaterialDto) => !!m.categoryId && usableCategory.has(m.categoryId);
  const groupOf = (m: MaterialDto) =>
    (hasUsableCategory(m) ? topCategoryOf.get(m.categoryId!)?.key : undefined) ?? NO_GROUP;

  const active = useMemo(
    () =>
      materials
        .filter((m) => m.active)
        .sort((a, b) => (a.code ?? "￿").localeCompare(b.code ?? "￿", "th") || a.name.localeCompare(b.name, "th")),
    [materials],
  );

  // ปุ่มกรองหมวด: เฉพาะหมวดที่มีวัสดุจริง เรียงตามรหัส + จำนวนวัสดุ
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of active) counts.set(groupOf(m), (counts.get(groupOf(m)) ?? 0) + 1);
    const tops = new Map([...topCategoryOf.values()].map((t) => [t.key, t]));
    return [...counts.entries()]
      .map(([key, count]) => ({
        key,
        count,
        label: key === NO_GROUP ? "ไม่มีหมวด" : (tops.get(key)?.label ?? "ไม่มีหมวด"),
        sort: key === NO_GROUP ? "￿" : (tops.get(key)?.sort ?? "￿"),
      }))
      .sort((a, b) => a.sort.localeCompare(b.sort, "th"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- groupOf อ่านจาก usableCategory/topCategoryOf ที่อยู่ใน deps แล้ว
  }, [active, topCategoryOf, usableCategory]);

  const picked = active.filter((m) => (qty[m.id] ?? "").trim() !== "");
  const pickedCount = picked.length;
  const pickedInGroup = (key: string) => picked.filter((m) => groupOf(m) === key).length;

  const rows = useMemo(() => {
    if (reviewIds) return active.filter((m) => reviewIds.has(m.id));
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return active.filter((m) => {
      if (group && groupOf(m) !== group) return false;
      if (words.length === 0) return true;
      const hay = `${m.code ?? ""} ${m.name} ${m.spec ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- groupOf อ่านจาก usableCategory/topCategoryOf
  }, [active, query, group, reviewIds, usableCategory, topCategoryOf]);
  const shown = rows.slice(0, LIST_LIMIT);

  const categoryOf = (m: MaterialDto) => (hasUsableCategory(m) ? m.categoryId : fallbackCategoryId || null);
  const needsFallback = picked.some((m) => !hasUsableCategory(m));
  const unitPrice = (m: MaterialDto) => Number(m.materialUnitPrice) + Number(m.laborUnitPrice);
  const total = picked.reduce((sum, m) => (isValidQty(qty[m.id]) ? sum + Number(qty[m.id]) * unitPrice(m) : sum), 0);

  async function requestClose() {
    if (saving) return;
    if (pickedCount > 0) {
      const ok = await confirm(`ทิ้งรายการที่กรอกจำนวนไว้ ${pickedCount} รายการ?`, {
        confirmLabel: "ทิ้ง",
        variant: "danger",
      });
      if (!ok) return;
    }
    onClose();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function setRowQty(m: MaterialDto, raw: string) {
    // ตัวเลขกับจุดทศนิยมเท่านั้น (ช่องเป็น text — type=number ทำให้ลูกศร/ล้อเมาส์เปลี่ยนค่าเองโดยไม่ตั้งใจ)
    const text = raw.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
    const wasPicked = (qty[m.id] ?? "").trim() !== "";
    if (!wasPicked && text !== "" && pickedCount >= MAX_LINES) {
      toast.error(`เพิ่มได้ครั้งละไม่เกิน ${MAX_LINES} รายการ`);
      return;
    }
    setQty((cur) => ({ ...cur, [m.id]: text }));
  }

  function focusRow(index: number) {
    const el = shown[index] ? qtyRefs.current.get(shown[index].id) : undefined;
    el?.focus();
    el?.select();
  }

  function toggleReview() {
    if (reviewIds) {
      setReviewIds(null);
      return;
    }
    setReviewIds(new Set(picked.map((m) => m.id)));
  }

  async function submit() {
    setSubmitted(true);
    const firstBad = picked.find((m) => !isValidQty(qty[m.id]));
    if (firstBad) {
      setReviewIds(new Set(picked.map((m) => m.id)));
      requestAnimationFrame(() => qtyRefs.current.get(firstBad.id)?.focus());
      toast.error("จำนวนต้องมากกว่า 0 — แก้หรือลบช่องที่เป็นสีแดง");
      return;
    }
    if (picked.some((m) => !categoryOf(m))) {
      toast.error("เลือกหมวดงานให้วัสดุที่ยังไม่มีหมวด");
      return;
    }
    setSaving(true);
    try {
      const items = picked.map((m) => ({ categoryId: categoryOf(m)!, materialId: m.id, quantity: Number(qty[m.id]) }));
      await addBoqItems(projectId, items);
      toast.success(`เพิ่ม ${items.length} รายการแล้ว`);
      await onAdded(items[0].categoryId);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เพิ่มรายการไม่สำเร็จ");
      setSaving(false);
    }
  }

  const chip = (on: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
      on ? "border-brand bg-brand/[0.06] font-medium text-brand" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label="ปิด"
        onClick={() => void requestClose()}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="boq-bulk-title"
        className="relative flex h-[85vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div>
            <h2 id="boq-bulk-title" className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <ListPlus size={18} className="text-brand" /> เพิ่มหลายรายการจากคลัง
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">พิมพ์จำนวนในแถวที่ต้องการ แล้วกดเพิ่ม · Enter ไปแถวถัดไป</p>
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            aria-label="ปิด"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2.5 border-b border-slate-200 px-5 pb-3">
          <div className="flex items-center gap-2">
            <SearchInput
              value={query}
              onChange={(v) => {
                setQuery(v);
                setReviewIds(null);
              }}
              placeholder="ค้นหารหัส / ชื่อ / สเปก"
              className="flex-1"
              autoFocus
              onKeyDown={(e) => {
                // Enter ในช่องค้นหา = เริ่มกรอกจำนวนแถวแรกของผลค้น
                if (e.key === "Enter" || e.key === "ArrowDown") {
                  e.preventDefault();
                  focusRow(0);
                }
              }}
            />
            {(pickedCount > 0 || reviewIds) && (
              <button type="button" onClick={toggleReview} aria-pressed={!!reviewIds} className={chip(!!reviewIds)}>
                เฉพาะที่เลือก <span className="tabular-nums">{pickedCount}</span>
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="กรองตามหมวด">
            <button
              type="button"
              aria-pressed={!reviewIds && group == null}
              onClick={() => {
                setGroup(null);
                setReviewIds(null);
              }}
              className={chip(!reviewIds && group == null)}
            >
              ทั้งหมด <span className="tabular-nums text-slate-400">{active.length}</span>
            </button>
            {groups.map((g) => {
              const on = !reviewIds && group === g.key;
              const n = pickedInGroup(g.key);
              return (
                <button
                  key={g.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setGroup(on ? null : g.key);
                    setReviewIds(null);
                  }}
                  className={chip(on)}
                  title={n > 0 ? `กรอกจำนวนไว้ ${n} รายการในหมวดนี้` : undefined}
                >
                  {g.label}
                  <span className="tabular-nums text-slate-400">{g.count}</span>
                  {n > 0 && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label={`เลือกไว้ ${n}`} />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="sticky top-0 z-10 bg-white text-xs text-slate-500 shadow-[inset_0_-1px_0_#e2e8f0]">
              <tr>
                <th className="w-24 py-2 pl-5 pr-2 text-left font-normal">รหัส</th>
                <th className="px-2 py-2 text-left font-normal">รายการ</th>
                <th className="w-28 px-2 py-2 text-right font-normal">ราคา/หน่วย</th>
                <th className="w-24 px-2 py-2 text-right font-normal">จำนวน</th>
                <th className="w-16 px-2 py-2 text-left font-normal">หน่วย</th>
                <th className="w-28 py-2 pl-2 pr-5 text-right font-normal">รวม</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m, i) => {
                const text = qty[m.id] ?? "";
                const isPicked = text.trim() !== "";
                const valid = isValidQty(text);
                // แดงหลังกดเพิ่มเท่านั้น — ระหว่างพิมพ์ "0.5" จะผ่าน "0" ก่อน ไม่ควรแดงวูบ
                const bad = submitted && isPicked && !valid;
                const noCategory = isPicked && !hasUsableCategory(m);
                return (
                  <tr
                    key={m.id}
                    onClick={(e) => {
                      // คลิกตรงไหนของแถวก็ได้ = ไปช่องจำนวนของแถวนั้น
                      if (e.target instanceof HTMLInputElement) return;
                      qtyRefs.current.get(m.id)?.focus();
                    }}
                    className={`cursor-text border-b border-slate-100 align-middle transition-colors ${
                      isPicked ? "bg-brand/[0.04]" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="truncate py-1.5 pl-5 pr-2 text-xs text-slate-400">{m.code ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      <span className={`block truncate ${isPicked ? "font-medium text-slate-900" : "text-slate-800"}`} title={m.name}>
                        {m.name}
                      </span>
                      {noCategory && <span className="block text-xs text-amber-700">ยังไม่มีหมวด — เลือกด้านล่าง</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{money(unitPrice(m))}</td>
                    <td className="px-2 py-1">
                      <input
                        ref={(el) => {
                          if (el) qtyRefs.current.set(m.id, el);
                          else qtyRefs.current.delete(m.id);
                        }}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="—"
                        value={text}
                        aria-label={`จำนวน ${m.name} (${m.unit})`}
                        aria-invalid={bad || undefined}
                        onChange={(e) => setRowQty(m, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "ArrowDown") {
                            e.preventDefault();
                            focusRow(i + 1);
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            focusRow(i - 1);
                          }
                        }}
                        className={`w-full rounded-md border px-2 py-1 text-right text-sm tabular-nums placeholder:text-slate-300 focus:outline-none focus:ring-1 ${
                          bad
                            ? "border-red-400 bg-red-50 focus:ring-red-400"
                            : isPicked
                              ? "border-brand bg-white font-medium text-brand focus:ring-brand"
                              : "border-slate-200 bg-white focus:border-brand focus:ring-brand"
                        }`}
                      />
                    </td>
                    <td className="truncate px-2 py-1.5 text-slate-500">{m.unit}</td>
                    <td className="py-1.5 pl-2 pr-5 text-right tabular-nums">
                      {valid ? (
                        <span className="text-slate-800">{money(Number(text) * unitPrice(m))}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              {query ? "ไม่พบวัสดุที่ตรงกับคำค้น" : "หมวดนี้ยังไม่มีวัสดุในคลัง"}
            </p>
          )}
          {rows.length > LIST_LIMIT && (
            <p className="px-5 py-3 text-center text-xs text-slate-500">
              แสดง {LIST_LIMIT} จาก {rows.length.toLocaleString("th-TH")} รายการ — พิมพ์ค้นหรือเลือกหมวดเพื่อแคบลง
            </p>
          )}
        </div>

        {needsFallback && (
          <div className="border-t border-amber-100 bg-amber-50/60 px-5 py-3 text-xs text-slate-700">
            <span className="mb-1 block">หมวดงานสำหรับวัสดุที่ในคลังยังไม่ได้ผูกหมวด</span>
            <SearchableSelect
              options={categoryOptions}
              value={fallbackCategoryId}
              onChange={setFallbackCategoryId}
              placeholder="พิมพ์รหัส/ชื่อหมวดงาน"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-slate-500">
            <span>
              เลือก <b className="font-semibold tabular-nums text-slate-800">{pickedCount}</b> รายการ
            </span>
            {pickedCount > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span>
                  รวมต้นทุน{" "}
                  <b className="text-base font-semibold tabular-nums text-slate-800">{money(total)}</b>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setQty({});
                    setReviewIds(null);
                    setSubmitted(false);
                  }}
                  className="link-pill -my-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  ล้างทั้งหมด
                </button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => void requestClose()} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={submit} disabled={saving || pickedCount === 0}>
              {saving ? "กำลังเพิ่ม..." : pickedCount > 0 ? `เพิ่ม ${pickedCount} รายการ` : "เพิ่มรายการ"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
