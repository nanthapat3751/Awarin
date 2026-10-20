import { monthLabelTh } from "@systemboq/shared-types";
import { CalendarDays } from "lucide-react";
import { useRef, useState } from "react";

import { ThaiCalendar } from "./ThaiCalendar";

/**
 * ช่องเลือกเดือน (ค่า YYYY-MM) — แสดง "ตุลาคม 2569" แทน <input type="month"> ที่เป็นอังกฤษ ค.ศ. ตามภาษาเครื่อง
 * กดแล้วเปิดปฏิทินไทยชั้นเดือน (ThaiCalendar mode="month") ชุดเดียวกับช่องวันที่ทั้งระบบ
 */
export function MonthInput({
  value,
  onChange,
  max,
  id,
  className = "",
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  /** เดือนสุดท้ายที่เลือกได้ YYYY-MM (เช่นเดือนปัจจุบัน — รายงานเดือนที่ยังไม่มาถึงไม่มีความหมาย) */
  max?: string;
  id?: string;
  className?: string;
}>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex min-w-40 items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 hover:border-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 ${className}`}
      >
        <span>{monthLabelTh(value) || "เลือกเดือน"}</span>
        <CalendarDays size={15} className="text-slate-400" aria-hidden />
      </button>
      {open && (
        <ThaiCalendar
          anchor={ref.current}
          mode="month"
          value={value}
          // ThaiCalendar เทียบช่วงเป็นวันที่ — เดือนสุดท้ายใช้วันใดก็ได้ในเดือนนั้น
          max={max ? `${max}-31` : undefined}
          onPick={(v) => {
            setOpen(false);
            if (v && v !== value) onChange(v);
            ref.current?.focus();
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
