import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { useId, useState } from "react";

import { todayIso } from "@systemboq/shared-types";
import type { CustomerActivityFilterKind } from "@systemboq/shared-types";

import { SearchInput } from "./SearchInput";
import { DateInput } from "./DateInput";

export const KIND_LABEL: Record<CustomerActivityFilterKind, string> = {
  view: "เปิดดูใบเสนอราคา",
  file: "ดาวน์โหลดไฟล์",
  respond: "ตอบรับ/ปฏิเสธ",
  lead: "ส่งคำขอ",
  project: "สถานะโครงการ",
  login: "เข้าสู่ระบบ",
  security: "รหัสผ่าน/ความปลอดภัย",
  account: "บัญชี",
  staff: "พนักงานดำเนินการ",
};

/** 9 ชนิดแบ่ง 3 กลุ่มในกล่องตัวกรอง — อ่านเป็นหมวดง่ายกว่าเรียงยาวแถวเดียว */
const KIND_GROUPS: { label: string; kinds: CustomerActivityFilterKind[] }[] = [
  { label: "ลูกค้าทำ", kinds: ["view", "file", "respond", "lead"] },
  { label: "บัญชีลูกค้า", kinds: ["login", "security", "account"] },
  { label: "ฝั่งบริษัท", kinds: ["project", "staff"] },
];

export interface ActivityFilterValue {
  from: string;
  to: string;
  kinds: CustomerActivityFilterKind[];
  q: string;
}

export const EMPTY_FILTER: ActivityFilterValue = { from: "", to: "", kinds: [], q: "" };

export function isFilterActive(v: ActivityFilterValue): boolean {
  return v.from !== "" || v.to !== "" || v.kinds.length > 0 || v.q.trim() !== "";
}

/** แปลงเป็น query string ให้ตรงกับที่ readFilter ฝั่งเซิร์ฟเวอร์อ่าน */
export function filterToQuery(v: ActivityFilterValue, extra?: Record<string, string>): string {
  const p = new URLSearchParams();
  if (v.from) p.set("from", v.from);
  if (v.to) p.set("to", v.to);
  if (v.kinds.length > 0) p.set("kinds", v.kinds.join(","));
  if (v.q.trim()) p.set("q", v.q.trim());
  for (const [k, val] of Object.entries(extra ?? {})) if (val) p.set(k, val);
  const s = p.toString();
  return s ? `?${s}` : "";
}

const DATE_INPUT =
  "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

/** ปุ่มลัดช่วงวันที่ — ตั้งแต่ (วันนี้ − n + 1) ไม่มีวันสิ้นสุด จึงยังนับวันนี้เสมอแม้เปิดค้างข้ามคืน */
const PRESETS = [
  { days: 1, label: "วันนี้" },
  { days: 7, label: "7 วันล่าสุด" },
  { days: 30, label: "30 วันล่าสุด" },
];

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return todayIso(d);
}

const shortTh = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

/** ข้อความบนชิปช่วงวันที่ — ตรงกับปุ่มลัดใช้ชื่อปุ่ม ไม่งั้นบอกวันจริง */
function dateChipLabel(from: string, to: string): string {
  if (!to) {
    const preset = PRESETS.find((p) => from === daysAgoIso(p.days - 1));
    if (preset) return preset.label;
    return `ตั้งแต่ ${shortTh(from)}`;
  }
  if (!from) return `ถึง ${shortTh(to)}`;
  return from === to ? shortTh(from) : `${shortTh(from)} – ${shortTh(to)}`;
}

function ActiveChip({ label, onRemove }: Readonly<{ label: string; onRemove: () => void }>) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/5 py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`เอาตัวกรอง ${label} ออก`}
        className="rounded-full p-0.5 transition-colors hover:bg-brand/10"
      >
        <X size={12} aria-hidden />
      </button>
    </span>
  );
}

/**
 * แถบตัวกรองกิจกรรม — แบบ D (ผู้ใช้เลือก 18 ต.ค. แทนชิป 9 อันเรียงแถวที่ดูรก)
 *
 * ตอนไม่กรอง เหลือแค่ช่องค้นหา (ซ้าย) + ปุ่ม "ตัวกรอง" (ขวา) · กดแล้วกล่องกางลงมาในหน้า (ไม่ใช่แผงเลื่อนจากขวา)
 * มีช่วงวันที่ + ปุ่มลัด และติ๊กชนิดแบ่ง 3 กลุ่ม · ตัวกรองที่ใช้อยู่โชว์เป็นชิปใต้ปุ่ม กด ✕ เอาออกทีละอัน
 * เลขบนปุ่มนับช่วงวันที่เป็น 1 + ชนิดที่ติ๊ก (คำค้นไม่นับ เพราะเห็นในช่องค้นหาอยู่แล้ว)
 */
export function ActivityFilterBar({
  value,
  onChange,
  children,
}: Readonly<{
  value: ActivityFilterValue;
  onChange: (v: ActivityFilterValue) => void;
  /** ตัวกรองเพิ่มเติมเฉพาะหน้า เช่น ช่องเลือกลูกค้าในฟีดรวม — อยู่หน้าปุ่มตัวกรองด้านขวา */
  children?: React.ReactNode;
}>) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const toggleKind = (k: CustomerActivityFilterKind) =>
    onChange({
      ...value,
      kinds: value.kinds.includes(k) ? value.kinds.filter((x) => x !== k) : [...value.kinds, k],
    });

  const hasDate = value.from !== "" || value.to !== "";
  const count = (hasDate ? 1 : 0) + value.kinds.length;

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
      {/* แบบ A (ผู้ใช้เลือก 18 ต.ค.): ค้นหาซ้ายกว้าง · ลูกค้า + ปุ่มตัวกรองชิดขวา (ปุ่มเครื่องมืออยู่ขวาแบบ Shopee/Gmail) */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={value.q}
          onChange={(q) => onChange({ ...value, q })}
          placeholder="ค้นหาในกิจกรรม"
          className="w-full sm:w-80"
        />
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {children}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
              open ? "border-brand text-brand" : "border-slate-300 text-slate-700 hover:border-slate-400"
            }`}
          >
            <SlidersHorizontal size={15} aria-hidden />
            ตัวกรอง
            {count > 0 && (
              <span className="rounded-full bg-brand px-1.5 text-xs font-medium tabular-nums text-white">{count}</span>
            )}
            <ChevronDown size={14} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* ตัวกรองที่ใช้อยู่ — บรรทัดที่สองชิดขวาใต้ปุ่ม ขึ้นเฉพาะตอนกรองอยู่ */}
      {count > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {hasDate && (
            <ActiveChip
              label={dateChipLabel(value.from, value.to)}
              onRemove={() => onChange({ ...value, from: "", to: "" })}
            />
          )}
          {value.kinds.map((k) => (
            <ActiveChip key={k} label={KIND_LABEL[k]} onRemove={() => toggleKind(k)} />
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...value, from: "", to: "", kinds: [] })}
            className="link-pill -mr-2.5 text-xs text-slate-500 hover:text-slate-700"
          >
            ล้างทั้งหมด
          </button>
        </div>
      )}

      {open && (
        <div id={panelId} className="mt-3 grid gap-x-8 gap-y-4 border-t border-slate-100 pt-3 xl:grid-cols-[auto_1fr]">
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-slate-500">ช่วงวันที่</legend>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => {
                const on = value.to === "" && value.from === daysAgoIso(p.days - 1);
                return (
                  <button
                    key={p.days}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ ...value, from: daysAgoIso(p.days - 1), to: "" })}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      on
                        ? "border-brand bg-brand/10 font-medium text-brand"
                        : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <label className="flex items-center gap-2">
                <span>ตั้งแต่</span>
                <DateInput
                  value={value.from}
                  max={value.to || undefined}
                  onChange={(v) => onChange({ ...value, from: v })}
                  className={DATE_INPUT}
                />
              </label>
              <label className="flex items-center gap-2">
                <span>ถึง</span>
                <DateInput
                  value={value.to}
                  min={value.from || undefined}
                  onChange={(v) => onChange({ ...value, to: v })}
                  className={DATE_INPUT}
                />
              </label>
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            {KIND_GROUPS.map((g) => (
              <fieldset key={g.label}>
                <legend className="mb-2 text-xs font-medium text-slate-500">{g.label}</legend>
                <div className="space-y-1.5">
                  {g.kinds.map((k) => (
                    <label key={k} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={value.kinds.includes(k)}
                        onChange={() => toggleKind(k)}
                        className="h-4 w-4 rounded border-slate-300 accent-brand"
                      />
                      {KIND_LABEL[k]}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
