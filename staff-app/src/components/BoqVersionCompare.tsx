import type {
  BoqDiffField,
  BoqDiffLineDto,
  BoqDiffLineValuesDto,
  BoqVersionDiffDto,
  BoqVersionSummaryDto,
  ProjectVersionDto,
} from "@systemboq/shared-types";
import { ArrowRight, X } from "lucide-react";
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

// ป้ายชนิดเป็นตัวอักษรสีเล็ก ๆ + แถบสีบาง ๆ ซ้ายแถว — ไม่ใช้กล่องมีกรอบ (ตารางยาวแล้วกล่องสีเรียงกันลายตา)
const KIND_TAG: Record<BoqDiffLineDto["kind"], { label: string; text: string; bar: string; dot: string } | null> = {
  added: { label: "เพิ่ม", text: "text-emerald-700", bar: "shadow-[inset_2px_0_0_#10b981]", dot: "bg-emerald-500" },
  removed: { label: "ลบ", text: "text-red-700", bar: "shadow-[inset_2px_0_0_#f87171]", dot: "bg-red-400" },
  changed: { label: "แก้", text: "text-amber-700", bar: "shadow-[inset_2px_0_0_#f59e0b]", dot: "bg-amber-500" },
  unchanged: null,
};

/**
 * ค่าในช่อง: ถ้าช่องนี้เปลี่ยน โชว์ค่าเก่าขีดฆ่าไว้บน ค่าใหม่อยู่ล่าง — อ่านจบในช่องเดียว ไม่ต้องไล่สองตาราง
 * แถว "แก้" ช่องที่ไม่ได้เปลี่ยนจะจางลง ให้ตาไปหยุดที่ช่องที่เปลี่ยนจริงเท่านั้น
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
  if (line.kind === "changed") return <span className="text-slate-400">{render(current)}</span>;
  return <>{render(current)}</>;
}

/** หัวคอลัมน์สองบรรทัด: ชื่อเวอร์ชันเด่น วันที่/เลขใบเสนอราคาจางอยู่ใต้ (เดิมเป็นบรรทัดเดียวยาว อ่านยาก) */
function VersionHead({ v }: Readonly<{ v: BoqVersionSummaryDto }>) {
  const q = v.quotes?.length ? ` · ${v.quotes.map((x) => x.quoteNo).join(", ")}` : "";
  return (
    <>
      <div className="font-semibold text-slate-700">เวอร์ชัน {v.versionNo}</div>
      <div className="font-normal text-slate-400">
        {formatDay(v.createdAt)}
        {q}
      </div>
    </>
  );
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

  const selectCls = "rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700";
  const lines = diff ? diff.lines.filter((l) => showUnchanged || l.kind !== "unchanged") : [];

  type SummaryRow = { label: string; pick: (s: BoqVersionSummaryDto) => string; strong?: boolean };
  const allSummaryRows: SummaryRow[] = diff
    ? [
        { label: "ต้นทุนตรง", pick: (s) => s.directCost },
        // ขึ้นเฉพาะเวอร์ชันที่เผื่อจริง — โครงการที่ไม่ได้เผื่อเหลือเผื่อขาดจะไม่เห็นแถวศูนย์เปล่า ๆ
        ...(Number(diff.from.contingencyAmt) || Number(diff.to.contingencyAmt)
          ? [{ label: "เผื่อเหลือเผื่อขาด", pick: (s: BoqVersionSummaryDto) => s.contingencyAmt }]
          : []),
        { label: "ค่าดำเนินการและกำไร", pick: (s) => s.overheadProfitAmt },
        { label: "ส่วนลด", pick: (s) => (Number(s.discountAmt) ? `-${s.discountAmt}` : "0") },
        { label: "ส่วนลดปัดเศษ", pick: (s) => (Number(s.roundingAmt) ? `-${s.roundingAmt}` : "0") },
        { label: "VAT", pick: (s) => s.vatAmt },
        { label: "ราคาสุทธิ", pick: (s) => s.netPrice, strong: true },
      ]
    : [];
  // แถวที่เป็นศูนย์ทั้งสองเวอร์ชัน (ส่วนลด/ปัดเศษที่ไม่ได้ใช้) ไม่ต้องแสดง — มีแต่ 0.00 0.00 — เรียงกันรกตา
  const summaryRows = allSummaryRows.filter(
    (r) => r.strong || !diff || Number(r.pick(diff.from)) !== 0 || Number(r.pick(diff.to)) !== 0,
  );

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
        <ArrowRight size={14} className="text-slate-400" aria-label="เทียบกับ" />
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
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="pb-2 pr-3 text-left align-bottom font-medium">สรุปยอด</th>
                  <th className="pb-2 pr-3 text-right align-bottom">
                    <VersionHead v={diff.from} />
                  </th>
                  <th className="pb-2 pr-3 text-right align-bottom">
                    <VersionHead v={diff.to} />
                  </th>
                  <th className="pb-2 pr-3 text-right align-bottom font-medium">ผลต่าง</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {summaryRows.map((r) => {
                  const a = Number(r.pick(diff.from));
                  const b = Number(r.pick(diff.to));
                  if (r.strong) {
                    return (
                      <tr key={r.label} className="bg-slate-50 font-semibold text-slate-900">
                        <td className="rounded-l-md px-3 py-2.5 text-left">{r.label}</td>
                        <td className="py-2.5 pr-3 text-right">{money(a)}</td>
                        <td className="py-2.5 pr-3 text-right">{money(b)}</td>
                        <td className={`rounded-r-md py-2.5 pr-3 text-right ${deltaColor(b - a)}`}>{signed(b - a)}</td>
                      </tr>
                    );
                  }
                  // แถวที่ยอดเท่าเดิมจางลง — แถวที่ขยับจริงจะเด่นขึ้นมาเอง
                  const same = Math.round((b - a) * 100) === 0;
                  return (
                    <tr key={r.label} className={same ? "text-slate-400" : "text-slate-700"}>
                      <td className="py-1.5 pr-3 text-left">
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
                      <td className="py-1.5 pr-3 text-right">{signed(b - a)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-5 mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-4 text-sm">
            <span className="font-medium text-slate-700">รายการที่เปลี่ยน</span>
            {(["changed", "added", "removed"] as const)
              .filter((k) => diff.counts[k] > 0)
              .map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${KIND_TAG[k]!.dot}`} />
                  {KIND_TAG[k]!.label} {diff.counts[k]}
                </span>
              ))}
            {diff.counts.unchanged > 0 && (
              <span className="text-xs text-slate-400">เหมือนเดิม {diff.counts.unchanged}</span>
            )}
            {diff.counts.unchanged > 0 && (
              <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500">
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
                <thead className="text-left text-xs text-slate-400">
                  <tr>
                    <th className="py-1.5 pl-3 pr-3 font-medium">รหัส</th>
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
                        className={`border-t border-slate-100 align-top ${removed || !tag ? "text-slate-400" : ""}`}
                      >
                        <td className={`whitespace-nowrap py-2.5 pl-3 pr-3 text-xs text-slate-400 ${tag?.bar ?? ""}`}>
                          {l.categoryCode ?? "—"}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-baseline gap-2">
                            {tag && <span className={`w-7 shrink-0 text-xs font-medium ${tag.text}`}>{tag.label}</span>}
                            <div className={removed ? "line-through" : ""}>
                              <Cell line={l} field="name" render={(v) => v.name} />
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">
                          <Cell
                            line={l}
                            field={l.changed.includes("unit") ? "unit" : "quantity"}
                            render={(v) => `${qty(v.quantity)} ${v.unit}`}
                          />
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">
                          <Cell line={l} field="materialUnitPrice" render={(v) => money(v.materialUnitPrice)} />
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">
                          <Cell line={l} field="laborUnitPrice" render={(v) => money(v.laborUnitPrice)} />
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">
                          {money((l.after ?? l.before)!.lineTotal)}
                        </td>
                        <td
                          className={`whitespace-nowrap py-2.5 text-right tabular-nums ${
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
