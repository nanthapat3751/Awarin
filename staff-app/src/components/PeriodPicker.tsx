import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** ช่วงเวลาที่กรอง — ปี ค.ศ. + เดือน 1–12 (null = ทั้งปี) · ทั้งก้อนเป็น null = ทุกช่วงเวลา */
export interface Period {
  year: number;
  month: number | null;
}

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
// ปีแรกที่ระบบมีข้อมูล — เลื่อนย้อนไปก่อนนี้ไม่มีอะไรให้ดู
const FIRST_YEAR = 2024;

/** ปี/เดือนปัจจุบันตามเวลาไทย (เครื่องคนใช้อาจตั้งโซนเวลาอื่น) */
function thaiToday(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "numeric" })
    .formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month") };
}

/** "ต.ค. 2569" · "ปี 2569" · "ทุกช่วงเวลา" — ปีแสดงเป็น พ.ศ. */
export function periodLabel(value: Period | null): string {
  if (!value) return "ทุกช่วงเวลา";
  const be = value.year + 543;
  return value.month ? `${MONTHS[value.month - 1]} ${be}` : `ปี ${be}`;
}

/**
 * ตัวกรองช่วงเวลาแบบปฏิทิน — กดแล้วกางกล่อง: ‹ ปี › + "ทั้งปี" + ตาราง 12 เดือน
 * กดเดือน/ทั้งปีแล้วกล่องปิดเองทันที · เดือนในอนาคตกดไม่ได้ · ปุ่ม × ข้างป้ายล้างกลับเป็นทุกช่วงเวลา
 */
export function PeriodPicker({
  value,
  onChange,
  noun = "รายการ",
}: Readonly<{ value: Period | null; onChange: (next: Period | null) => void; noun?: string }>) {
  const today = thaiToday();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(value?.year ?? today.year);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    // เปิดใหม่ = เริ่มที่ปีที่เลือกอยู่ (หรือปีนี้) ไม่ค้างปีที่เลื่อนดูทิ้งไว้รอบก่อน
    if (!open) setViewYear(value?.year ?? today.year);
    setOpen((v) => !v);
  }

  function pick(next: Period | null) {
    onChange(next);
    setOpen(false);
  }

  const wholeYearActive = value?.year === viewYear && value.month == null;

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={`flex h-full items-center rounded-md border text-sm ${
          value ? "border-brand/40 bg-brand/5 text-brand" : "border-slate-300 bg-white text-slate-700"
        }`}
      >
        <button
          ref={buttonRef}
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5"
        >
          <CalendarDays size={15} aria-hidden />
          {periodLabel(value)}
          <ChevronDown size={14} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="ล้างช่วงเวลา (ดูทุกช่วงเวลา)"
            className="mr-1 rounded p-0.5 text-brand/70 hover:bg-brand/10 hover:text-brand"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="เลือกช่วงเวลา"
          className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              disabled={viewYear <= FIRST_YEAR}
              aria-label="ปีก่อนหน้า"
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium tabular-nums text-slate-800">พ.ศ. {viewYear + 543}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              disabled={viewYear >= today.year}
              aria-label="ปีถัดไป"
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => pick({ year: viewYear, month: null })}
            aria-pressed={wholeYearActive}
            className={`mb-2 w-full rounded-md py-1.5 text-sm transition-colors ${
              wholeYearActive ? "bg-brand text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            ทั้งปี {viewYear + 543}
          </button>

          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS.map((label, i) => {
              const month = i + 1;
              const active = value?.year === viewYear && value.month === month;
              const future = viewYear > today.year || (viewYear === today.year && month > today.month);
              const current = viewYear === today.year && month === today.month;
              return (
                <button
                  key={label}
                  type="button"
                  disabled={future}
                  onClick={() => pick({ year: viewYear, month })}
                  aria-pressed={active}
                  className={`rounded-md py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:text-slate-300 ${
                    active
                      ? "bg-brand text-white"
                      : `text-slate-700 hover:bg-slate-100 ${current ? "ring-1 ring-inset ring-brand/40" : ""}`
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
            <span className="text-slate-400">กรองจากวันที่สร้าง{noun}</span>
            <button
              type="button"
              onClick={() => pick(null)}
              className="rounded px-1.5 py-1 font-medium text-slate-600 hover:bg-slate-100"
            >
              ทุกช่วงเวลา
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
