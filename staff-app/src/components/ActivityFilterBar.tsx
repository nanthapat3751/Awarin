import { X } from "lucide-react";

import { CUSTOMER_ACTIVITY_FILTER_KINDS } from "@systemboq/shared-types";
import type { CustomerActivityFilterKind } from "@systemboq/shared-types";

import { SearchInput } from "./SearchInput";

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

/**
 * แถบตัวกรองกิจกรรม — ช่วงวันที่ · ชนิด · ค้นหา
 *
 * ชนิดเป็นชิปกดสลับ ไม่ใช่ dropdown เพราะเลือกหลายอันพร้อมกันได้ และเห็นทั้งหมดในตาเดียว
 * ว่ามีชนิดอะไรให้เลือกบ้าง (dropdown ต้องกดเปิดก่อนถึงจะรู้)
 */
export function ActivityFilterBar({
  value,
  onChange,
  children,
}: Readonly<{
  value: ActivityFilterValue;
  onChange: (v: ActivityFilterValue) => void;
  /** ตัวกรองเพิ่มเติมเฉพาะหน้า เช่น ช่องเลือกลูกค้าในฟีดรวม */
  children?: React.ReactNode;
}>) {
  const toggleKind = (k: CustomerActivityFilterKind) =>
    onChange({
      ...value,
      kinds: value.kinds.includes(k) ? value.kinds.filter((x) => x !== k) : [...value.kinds, k],
    });

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span>ตั้งแต่</span>
          <input
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className={DATE_INPUT}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span>ถึง</span>
          <input
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className={DATE_INPUT}
          />
        </label>
        {children}
        <div className="ms-auto">
          <SearchInput
            value={value.q}
            onChange={(q) => onChange({ ...value, q })}
            placeholder="ค้นหาในกิจกรรม"
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {CUSTOMER_ACTIVITY_FILTER_KINDS.map((k) => {
          const on = value.kinds.includes(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleKind(k)}
              aria-pressed={on}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                on
                  ? "border-brand bg-brand/10 font-medium text-brand"
                  : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          );
        })}
        {isFilterActive(value) && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTER)}
            className="ms-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={12} /> ล้างตัวกรอง
          </button>
        )}
      </div>
    </div>
  );
}
