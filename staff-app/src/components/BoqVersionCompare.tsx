import type {
  BoqDiffField,
  BoqDiffLineDto,
  BoqDiffLineValuesDto,
  BoqVersionDiffDto,
  BoqVersionSummaryDto,
  ProjectVersionDto,
} from "@systemboq/shared-types";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ApiError } from "../lib/api";
import { compareBoqVersions } from "../lib/boq-api";

function money(value: string | number): string {
  return Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function signed(value: number): string {
  if (Math.round(value * 100) === 0) return "—";
  return `${value > 0 ? "+" : "−"}${money(Math.abs(value))}`;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

const qty = (v: string) => Number(v).toLocaleString("th-TH", { maximumFractionDigits: 3 });

const KIND_TAG: Record<BoqDiffLineDto["kind"], { label: string; cls: string } | null> = {
  added: { label: "เพิ่ม", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  removed: { label: "ลบ", cls: "bg-red-50 text-red-700 border-red-200" },
  changed: { label: "แก้", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  unchanged: null,
};

/**
 * ค่าในช่อง: ถ้าช่องนี้เปลี่ยน โชว์ค่าเก่าขีดฆ่าไว้บน ค่าใหม่อยู่ล่าง — อ่านจบในช่องเดียว ไม่ต้องไล่สองตาราง
 */
function Cell({
  line,
  field,
  render,
}: Readonly<{
  line: BoqDiffLineDto;
  field: BoqDiffField | null;
  render: (v: BoqDiffLineValuesDto) => ReactNode;
}>) {
  const current = line.after ?? line.before!;
  if (field && line.changed.includes(field) && line.before) {
    return (
      <>
        <div className="text-xs text-slate-400 line-through">{render(line.before)}</div>
        <div className="font-medium text-slate-900">{render(current)}</div>
      </>
    );
  }
  return <>{render(current)}</>;
}

function versionLabel(v: { versionNo: number; createdAt: string }, quotes?: BoqVersionSummaryDto["quotes"]) {
  const q = quotes?.length ? ` · ${quotes.map((x) => x.quoteNo).join(", ")}` : "";
  return `เวอร์ชัน ${v.versionNo} · ${formatDay(v.createdAt)}${q}`;
}

/**
 * เทียบ BOQ สองเวอร์ชัน — ตอบคำถามลูกค้า "ฉบับก่อนกับฉบับนี้ต่างกันตรงไหน" โดยไม่ต้องเปิด PDF สองไฟล์
 * ค่าเริ่มต้นเทียบเวอร์ชันก่อนหน้ากับล่าสุด (คู่ที่ถามกันบ่อยที่สุด)
 */
/** สีของตัวเลขส่วนต่าง: แพงขึ้น = แดง · ถูกลง = เขียว · เท่าเดิม = จาง */
function deltaColor(delta: number): string {
  if (delta > 0) return "text-red-700";
  if (delta < 0) return "text-emerald-700";
  return "text-slate-400";
}

export function BoqVersionCompare({
  projectId,
  versions,
  onClose,
}: Readonly<{
  projectId: string;
  versions: ProjectVersionDto[];
  onClose: () => void;
}>) {
  const nos = versions.map((v) => v.versionNo).sort((a, b) => a - b);
  // ปุ่มเทียบเวอร์ชันโผล่เฉพาะเมื่อมีอย่างน้อย 2 เวอร์ชัน — ตั้งต้นที่คู่ล่าสุด
  const [from, setFrom] = useState(nos.at(-2) ?? 1);
  const [to, setTo] = useState(nos.at(-1) ?? 1);
  const [diff, setDiff] = useState<BoqVersionDiffDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(null);
    compareBoqVersions(projectId, from, to)
      .then((d) => alive && setDiff(d))
      .catch((err) => alive && setError(err instanceof ApiError ? err.message : "เทียบเวอร์ชันไม่สำเร็จ"));
    return () => {
      alive = false;
    };
  }, [projectId, from, to]);

  const selectCls = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";
  const lines = diff ? diff.lines.filter((l) => showUnchanged || l.kind !== "unchanged") : [];

  const summaryRows: { label: string; pick: (s: BoqVersionSummaryDto) => string; strong?: boolean }[] = diff
    ? [
        { label: "ต้นทุนตรง", pick: (s) => s.directCost },
        { label: "ค่าดำเนินการและกำไร", pick: (s) => s.overheadProfitAmt },
        { label: "ส่วนลด", pick: (s) => (Number(s.discountAmt) ? `-${s.discountAmt}` : "0") },
        { label: "VAT", pick: (s) => s.vatAmt },
        { label: "ราคาสุทธิ", pick: (s) => s.netPrice, strong: true },
      ]
    : [];

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-2 text-sm font-semibold text-slate-800">เทียบเวอร์ชัน</h3>
        <select
          aria-label="เวอร์ชันเก่า"
          className={selectCls}
          value={from}
          onChange={(e) => setFrom(Number(e.target.value))}
        >
          {nos
            .filter((n) => n < to)
            .map((n) => (
              <option key={n} value={n}>
                เวอร์ชัน {n}
              </option>
            ))}
        </select>
        <span className="text-sm text-slate-500">กับ</span>
        <select aria-label="เวอร์ชันใหม่" className={selectCls} value={to} onChange={(e) => setTo(Number(e.target.value))}>
          {nos
            .filter((n) => n > from)
            .map((n) => (
              <option key={n} value={n}>
                เวอร์ชัน {n}
                {n === nos.at(-1) ? " (ล่าสุด)" : ""}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดการเทียบเวอร์ชัน"
          className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={16} />
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {diff && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-1.5 pr-3 font-medium" />
                  <th className="py-1.5 pr-3 text-right font-medium">{versionLabel(diff.from, diff.from.quotes)}</th>
                  <th className="py-1.5 pr-3 text-right font-medium">{versionLabel(diff.to, diff.to.quotes)}</th>
                  <th className="py-1.5 text-right font-medium">ผลต่าง</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {summaryRows.map((r) => {
                  const a = Number(r.pick(diff.from));
                  const b = Number(r.pick(diff.to));
                  return (
                    <tr
                      key={r.label}
                      className={`border-t border-slate-100 ${r.strong ? "font-semibold text-slate-900" : "text-slate-700"}`}
                    >
                      <td className="py-1.5 pr-3 text-left font-normal text-slate-600">
                        {r.label}
                        {r.label === "ค่าดำเนินการและกำไร" && diff.from.overheadProfitPct !== diff.to.overheadProfitPct && (
                          <span className="ml-1 text-xs text-slate-500">
                            ({Number(diff.from.overheadProfitPct)}% → {Number(diff.to.overheadProfitPct)}%)
                          </span>
                        )}
                        {r.label === "VAT" && diff.from.vatPct !== diff.to.vatPct && (
                          <span className="ml-1 text-xs text-slate-500">
                            ({Number(diff.from.vatPct)}% → {Number(diff.to.vatPct)}%)
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right">{money(a)}</td>
                      <td className="py-1.5 pr-3 text-right">{money(b)}</td>
                      <td className="py-1.5 text-right">{signed(b - a)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span>
              แก้ {diff.counts.changed} · เพิ่ม {diff.counts.added} · ลบ {diff.counts.removed} · เหมือนเดิม{" "}
              {diff.counts.unchanged} รายการ
            </span>
            {diff.counts.unchanged > 0 && (
              <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={showUnchanged} onChange={(e) => setShowUnchanged(e.target.checked)} />
                <span>แสดงรายการที่ไม่เปลี่ยนด้วย</span>
              </label>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="text-sm text-slate-500">รายการ BOQ ของสองเวอร์ชันนี้เหมือนกันทุกบรรทัด</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">รหัส</th>
                    <th className="py-1.5 pr-3 font-medium">รายการ</th>
                    <th className="py-1.5 pr-3 text-right font-medium">ปริมาณ</th>
                    <th className="py-1.5 pr-3 text-right font-medium">วัสดุ/หน่วย</th>
                    <th className="py-1.5 pr-3 text-right font-medium">แรง/หน่วย</th>
                    <th className="py-1.5 pr-3 text-right font-medium">รวม</th>
                    <th className="py-1.5 text-right font-medium">ผลต่าง</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {lines.map((l, i) => {
                    const tag = KIND_TAG[l.kind];
                    const removed = l.kind === "removed";
                    const delta = Number(l.lineTotalDelta);
                    return (
                      <tr
                        key={i}
                        className={`border-t border-slate-100 align-top ${removed ? "text-slate-400" : ""}`}
                      >
                        <td className="whitespace-nowrap py-2 pr-3 text-xs text-slate-500">{l.categoryCode ?? "—"}</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-start gap-2">
                            {tag && (
                              <span className={`mt-0.5 shrink-0 rounded border px-1.5 text-xs ${tag.cls}`}>
                                {tag.label}
                              </span>
                            )}
                            <div className={removed ? "line-through" : ""}>
                              <Cell line={l} field="name" render={(v) => v.name} />
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                          <Cell
                            line={l}
                            field={l.changed.includes("unit") ? "unit" : "quantity"}
                            render={(v) => `${qty(v.quantity)} ${v.unit}`}
                          />
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                          <Cell line={l} field="materialUnitPrice" render={(v) => money(v.materialUnitPrice)} />
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                          <Cell line={l} field="laborUnitPrice" render={(v) => money(v.laborUnitPrice)} />
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                          {money((l.after ?? l.before)!.lineTotal)}
                        </td>
                        <td
                          className={`whitespace-nowrap py-2 text-right tabular-nums ${
                            deltaColor(delta)
                          }`}
                        >
                          {signed(delta)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
