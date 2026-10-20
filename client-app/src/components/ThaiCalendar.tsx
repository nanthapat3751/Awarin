import {
  BE_OFFSET,
  THAI_MONTHS,
  THAI_MONTHS_SHORT,
  THAI_WEEKDAYS_SHORT,
  addDaysIso,
  calendarWeeks,
  todayIso,
} from "@systemboq/shared-types";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

// ไฟล์นี้มีสองชุดเหมือนกัน: staff-app/src/components/ThaiCalendar.tsx และ client-app/src/components/ThaiCalendar.tsx
// (สองแอปไม่มีแพ็กเกจ UI กลาง) — แก้ที่หนึ่งต้องแก้อีกที่ด้วย

type Level = "day" | "month" | "year";

const ym = (iso: string) => iso.slice(0, 7);
const pad2 = (n: number) => String(n).padStart(2, "0");
const ymOf = (year: number, month0: number) => `${year}-${pad2(month0 + 1)}`;
const be = (year: number) => year + BE_OFFSET;
const WIDTH = 272;

/**
 * ปฏิทินไทยแบบ A (ผู้ใช้เลือก 17 ต.ค.) — ใช้ร่วมกันทุกช่องวันที่และช่องเลือกเดือนในระบบ แทนปฏิทินของเบราว์เซอร์ที่เป็นอังกฤษ ค.ศ.
 *
 * - หัว "ตุลาคม 2569 ▾" ‹ › · กดหัว → ตาราง 12 เดือน → กดหัวอีกที → ตาราง 12 ปี (แบบ Google/Windows)
 * - mode="month" เปิดที่ชั้นเดือนเลย เลือกแล้วจบ (หน้ารายงานภาษีขาย) · ค่า YYYY-MM
 * - mode="day" ค่า YYYY-MM-DD · วันนี้มีวงรอบ · วันที่เลือกระบายสี · นอกช่วง min/max กดไม่ได้
 * - วางแบบ fixed ผ่าน portal — ช่องวันที่อยู่ในตารางที่เลื่อนแนวนอนได้ (overflow) ปฏิทินจะไม่โดนตัด
 * - คีย์บอร์ด: ลูกศรเลื่อนวัน (บน/ล่าง = สัปดาห์) · PageUp/PageDown = เดือน · Enter เลือก · Esc ปิด
 */
export function ThaiCalendar({
  anchor,
  mode = "day",
  value,
  min,
  max,
  allowClear = false,
  onPick,
  onClose,
}: Readonly<{
  anchor: HTMLElement | null;
  mode?: "day" | "month";
  /** day: YYYY-MM-DD · month: YYYY-MM · "" = ยังไม่เลือก */
  value: string;
  min?: string;
  max?: string;
  allowClear?: boolean;
  onPick: (value: string) => void;
  onClose: () => void;
}>) {
  const today = todayIso();
  const start = value || (mode === "month" ? ym(today) : today);
  const [level, setLevel] = useState<Level>(mode === "month" ? "month" : "day");
  const [viewYear, setViewYear] = useState(Number(start.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(Number(start.slice(5, 7)) - 1);
  // วันที่ที่ลูกศรคีย์บอร์ดชี้อยู่ (ชั้นวัน) — เริ่มที่ค่าที่เลือกไว้ หรือวันนี้
  const [focusIso, setFocusIso] = useState(mode === "day" ? (value || today) : "");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const minDay = min ?? "";
  const maxDay = max ?? "";
  const minYm = minDay.slice(0, 7);
  const maxYm = maxDay.slice(0, 7);
  const dayDisabled = (iso: string) => (!!minDay && iso < minDay) || (!!maxDay && iso > maxDay);
  const monthDisabled = (y: number, m0: number) => {
    const key = ymOf(y, m0);
    return (!!minYm && key < minYm) || (!!maxYm && key > maxYm);
  };
  const yearDisabled = (y: number) => (!!minYm && `${y}-12` < minYm) || (!!maxYm && `${y}-01` > maxYm);

  // ตำแหน่ง: ใต้ช่อง ชิดซ้ายของช่อง · ล้นขวาเลื่อนเข้า · ล้นล่างพลิกขึ้นเหนือช่อง
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = popRef.current?.offsetHeight ?? 320;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8));
      const below = r.bottom + 4;
      const top = below + h > window.innerHeight - 8 && r.top - h - 4 > 8 ? r.top - h - 4 : below;
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, level]);

  // ปิดเมื่อคลิกนอกปฏิทิน (คลิกที่ช่องเองไม่ปิด — ให้ช่องจัดการเปิด/ปิดเอง)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [anchor, onClose]);

  // Esc ปิดได้ทุกจังหวะ แม้โฟกัสหลุดออกนอกปฏิทิน (เช่นหัวชั้นปีกดไม่ได้แล้ว โฟกัสกลับไปที่ body)
  // ฟังแบบ capture แล้วหยุดไว้ — ไม่ให้ Esc ทะลุไปปิดหน้าต่าง/ฟอร์มที่ครอบช่องวันที่อยู่
  useEffect(() => {
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onEsc, true);
    return () => window.removeEventListener("keydown", onEsc, true);
  }, [onClose]);

  // ชั้นวัน: โฟกัสปุ่มของวันที่ชี้อยู่ (เปิดมาแล้วกดลูกศรได้เลย)
  useEffect(() => {
    if (level !== "day" || !focusIso) return;
    popRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`)?.focus();
  }, [level, focusIso, viewYear, viewMonth]);

  /** เดือนที่ห่างจากเดือนที่กำลังดู n เดือน → [ปี ค.ศ., เดือน 0-11] */
  const monthAt = (n: number): [number, number] => {
    const d = new Date(Date.UTC(viewYear, viewMonth + n, 1));
    return [d.getUTCFullYear(), d.getUTCMonth()];
  };

  function shiftMonth(n: number) {
    const [y, m0] = monthAt(n);
    setViewYear(y);
    setViewMonth(m0);
  }

  function moveFocus(iso: string) {
    setFocusIso(iso);
    const y = Number(iso.slice(0, 4));
    const m0 = Number(iso.slice(5, 7)) - 1;
    if (y !== viewYear || m0 !== viewMonth) {
      setViewYear(y);
      setViewMonth(m0);
    }
  }

  function onKey(e: KeyboardEvent) {
    if (level !== "day" || !focusIso) return;
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in steps) {
      e.preventDefault();
      moveFocus(addDaysIso(focusIso, steps[e.key]));
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const d = new Date(`${focusIso}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + (e.key === "PageUp" ? -1 : 1));
      moveFocus(d.toISOString().slice(0, 10));
    }
  }

  const navBtn = "flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent";
  const cell = "rounded-md text-sm transition-colors disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent";
  const chevron = (dir: "l" | "r") => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d={dir === "l" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );

  let header = "";
  let prev = () => {};
  let next = () => {};
  let prevOff = false;
  let nextOff = false;
  let up: Level | null = null;
  const yearPageStart = Math.floor(viewYear / 12) * 12;
  if (level === "day") {
    header = `${THAI_MONTHS[viewMonth]} ${be(viewYear)}`;
    prev = () => shiftMonth(-1);
    next = () => shiftMonth(1);
    prevOff = monthDisabled(...monthAt(-1));
    nextOff = monthDisabled(...monthAt(1));
    up = "month";
  } else if (level === "month") {
    header = `พ.ศ. ${be(viewYear)}`;
    prev = () => setViewYear((y) => y - 1);
    next = () => setViewYear((y) => y + 1);
    prevOff = yearDisabled(viewYear - 1);
    nextOff = yearDisabled(viewYear + 1);
    up = "year";
  } else {
    header = `${be(yearPageStart)} – ${be(yearPageStart + 11)}`;
    prev = () => setViewYear((y) => y - 12);
    next = () => setViewYear((y) => y + 12);
    prevOff = yearDisabled(yearPageStart - 1);
    nextOff = yearDisabled(yearPageStart + 12);
  }

  const selectedYm = mode === "month" ? value : ym(value);
  const todayYm = ym(today);

  return createPortal(
    <div
      ref={popRef}
      role="dialog"
      aria-label={mode === "month" ? "เลือกเดือน" : "เลือกวันที่"}
      onKeyDown={onKey}
      style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: WIDTH }}
      className="z-[60] rounded-xl border border-slate-200 bg-white p-2 text-slate-800 shadow-lg"
    >
      <div className="mb-1 flex items-center justify-between">
        <button type="button" onClick={prev} disabled={prevOff} aria-label="ก่อนหน้า" className={navBtn}>
          {chevron("l")}
        </button>
        <button
          type="button"
          onClick={() => up && setLevel(up)}
          disabled={!up}
          aria-label={up ? `เลือก${up === "month" ? "เดือน" : "ปี"}` : undefined}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold hover:bg-slate-100 disabled:cursor-default disabled:hover:bg-transparent"
        >
          {header}
          {up && (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          )}
        </button>
        <button type="button" onClick={next} disabled={nextOff} aria-label="ถัดไป" className={navBtn}>
          {chevron("r")}
        </button>
      </div>

      {level === "day" && (
        <div role="grid" className="grid grid-cols-7 gap-0.5 text-center">
          {THAI_WEEKDAYS_SHORT.map((w, i) => (
            <span key={w} className={`py-1 text-xs ${i === 0 ? "text-red-500" : "text-slate-500"}`}>
              {w}
            </span>
          ))}
          {calendarWeeks(viewYear, viewMonth)
            .flat()
            .map((d) => {
              const selected = d.iso === value;
              const isToday = d.iso === today;
              let tone = d.inMonth ? "text-slate-800 hover:bg-slate-100" : "text-slate-300 hover:bg-slate-50";
              if (selected) tone = "bg-brand font-semibold text-white hover:bg-brand";
              else if (isToday) tone += " font-semibold text-brand ring-1 ring-inset ring-brand";
              return (
                <button
                  key={d.iso}
                  type="button"
                  data-iso={d.iso}
                  tabIndex={d.iso === focusIso ? 0 : -1}
                  disabled={dayDisabled(d.iso)}
                  aria-pressed={selected}
                  aria-label={`${d.day} ${THAI_MONTHS[Number(d.iso.slice(5, 7)) - 1]} ${be(Number(d.iso.slice(0, 4)))}`}
                  onClick={() => onPick(d.iso)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !dayDisabled(d.iso)) {
                      e.preventDefault();
                      onPick(d.iso);
                    }
                  }}
                  className={`${cell} h-8 tabular-nums ${tone}`}
                >
                  {d.day}
                </button>
              );
            })}
        </div>
      )}

      {level === "month" && (
        <div className="grid grid-cols-3 gap-1">
          {THAI_MONTHS_SHORT.map((label, m0) => {
            const key = ymOf(viewYear, m0);
            const selected = key === selectedYm;
            let tone = "hover:bg-slate-100";
            if (selected) tone = "bg-brand font-semibold text-white hover:bg-brand";
            else if (key === todayYm) tone += " font-semibold text-brand ring-1 ring-inset ring-brand";
            return (
              <button
                key={label}
                type="button"
                disabled={monthDisabled(viewYear, m0)}
                aria-pressed={selected}
                aria-label={`${THAI_MONTHS[m0]} ${be(viewYear)}`}
                onClick={() => {
                  if (mode === "month") {
                    onPick(key);
                    return;
                  }
                  setViewMonth(m0);
                  setLevel("day");
                }}
                className={`${cell} h-10 ${tone}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {level === "year" && (
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 12 }, (_, i) => yearPageStart + i).map((y) => {
            const selected = selectedYm.startsWith(String(y));
            let tone = "hover:bg-slate-100";
            if (selected) tone = "bg-brand font-semibold text-white hover:bg-brand";
            else if (todayYm.startsWith(String(y))) tone += " font-semibold text-brand ring-1 ring-inset ring-brand";
            return (
              <button
                key={y}
                type="button"
                disabled={yearDisabled(y)}
                onClick={() => {
                  setViewYear(y);
                  setLevel("month");
                }}
                className={`${cell} h-10 tabular-nums ${tone}`}
              >
                {be(y)}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-1 flex items-center justify-between border-t border-slate-100 px-1 pt-1.5 text-sm">
        {mode === "month" ? (
          <button
            type="button"
            disabled={monthDisabled(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1)}
            onClick={() => onPick(todayYm)}
            className="rounded-md px-2 py-1 font-medium text-brand hover:bg-slate-100 disabled:opacity-40"
          >
            เดือนนี้
          </button>
        ) : (
          <button
            type="button"
            disabled={dayDisabled(today)}
            onClick={() => onPick(today)}
            className="rounded-md px-2 py-1 font-medium text-brand hover:bg-slate-100 disabled:opacity-40"
          >
            วันนี้
          </button>
        )}
        {allowClear && value !== "" && (
          <button
            type="button"
            onClick={() => onPick("")}
            className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            ล้าง
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
