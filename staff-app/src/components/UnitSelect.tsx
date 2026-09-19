import { Check, ChevronDown, Plus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

interface UnitSelectProps {
  value: string;
  onChange: (value: string) => void;
  /** หน่วยมาตรฐานที่อยากให้เลือกก่อน (เรียงตามที่ใช้บ่อย) */
  options: readonly string[];
  /** หน่วยที่มีอยู่จริงในระบบแต่ไม่อยู่ในลิสต์มาตรฐาน — โชว์แยกกลุ่มไว้ให้เลือกซ้ำได้ */
  inUse?: readonly string[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** ปิดการแก้ไข — ใช้ตอนหน่วยถูกกำหนดมาจากที่อื่นแล้ว (เช่น เลือกวัสดุจากแคตตาล็อก) */
  disabled?: boolean;
}

/**
 * ช่องเลือกหน่วยนับ — เปลี่ยนจาก <datalist> ของเบราว์เซอร์ (หน้าตาคุมไม่ได้ ขึ้นเป็นลิสต์ดำ
 * ตามธีมของ OS และไม่บอกว่าอันไหนคือหน่วยมาตรฐาน) มาเป็น dropdown ของแอปเอง
 *
 * ยังพิมพ์หน่วยใหม่เองได้เหมือนเดิม แต่ต้องกดยืนยันแถว "ใช้ … เป็นหน่วยใหม่" เพื่อให้เป็น
 * การตัดสินใจที่ตั้งใจ ไม่ใช่พิมพ์ผิดแล้วหลุดเข้าฐานข้อมูล (ที่มาของปัญหา ตร.ม./ตรม.)
 */
export function UnitSelect({
  value,
  onChange,
  options,
  inUse = [],
  placeholder = "เลือกหรือพิมพ์",
  className = "",
  autoFocus = false,
  disabled = false,
}: Readonly<UnitSelectProps>) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null); // null = ยังไม่ได้พิมพ์ (โชว์ value)
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const text = query ?? value;

  const extra = useMemo(
    () => inUse.filter((u) => u && !options.includes(u)).sort((a, b) => a.localeCompare(b, "th")),
    [inUse, options],
  );

  const groups = useMemo(() => {
    const q = (query ?? "").trim().toLowerCase();
    const match = (u: string) => (q === "" ? true : u.toLowerCase().includes(q));
    return [
      { label: "หน่วยมาตรฐาน", items: options.filter(match) },
      { label: "หน่วยอื่นที่ใช้อยู่ในระบบ", items: extra.filter(match) },
    ].filter((g) => g.items.length > 0);
  }, [options, extra, query]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const typed = (query ?? "").trim();
  /** พิมพ์คำที่ยังไม่มีในลิสต์ → เสนอเป็นตัวเลือกท้ายสุด */
  const canCreate = typed !== "" && !flat.some((u) => u.toLowerCase() === typed.toLowerCase());
  const rows = canCreate ? [...flat, typed] : flat;

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // เลื่อนรายการที่ไฮไลต์ให้อยู่ในกรอบเสมอเวลากดลูกศร
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function close() {
    setOpen(false);
    setQuery(null);
    setActive(0);
  }

  function pick(unit: string) {
    onChange(unit);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return (next + rows.length) % Math.max(rows.length, 1);
      });
      return;
    }
    if (e.key === "Enter") {
      if (open && rows[active]) {
        // กัน Enter ไม่ให้ทะลุไปสั่งบันทึกฟอร์ม ตอนที่ยังเลือกหน่วยอยู่
        e.preventDefault();
        e.stopPropagation();
        pick(rows[active]);
      }
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  let idx = -1;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          autoFocus={autoFocus}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => !disabled && setOpen(true)}
          onClick={() => !disabled && setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
            onChange(e.target.value);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="w-full rounded-md border border-slate-300 py-1 pl-2 pr-7 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-slate-100 disabled:text-slate-500"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={open ? "ปิดรายการหน่วย" : "เปิดรายการหน่วย"}
          onClick={() => (open ? close() : setOpen(true))}
          className="absolute inset-y-0 right-0 flex w-7 items-center justify-center text-slate-400 hover:text-slate-500 disabled:text-slate-300"
        >
          <ChevronDown size={14} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
      </div>

      {open && !disabled && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full min-w-40 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {groups.map((g) => (
            <div key={g.label}>
              <div className="px-3 pb-0.5 pt-1.5 text-xs font-medium text-slate-400">{g.label}</div>
              {g.items.map((u) => {
                idx += 1;
                const i = idx;
                return (
                  <button
                    key={u}
                    type="button"
                    data-idx={i}
                    role="option"
                    aria-selected={u === value}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(u)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${
                      i === active ? "bg-slate-100" : ""
                    } ${u === value ? "font-medium text-brand" : "text-slate-700"}`}
                  >
                    <span>{u}</span>
                    {u === value && <Check size={14} />}
                  </button>
                );
              })}
            </div>
          ))}

          {canCreate &&
            (() => {
              idx += 1;
              const i = idx;
              return (
                <button
                  type="button"
                  data-idx={i}
                  role="option"
                  aria-selected={false}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(typed)}
                  className={`mt-1 flex w-full items-center gap-1.5 border-t border-slate-100 px-3 py-1.5 text-left text-sm text-slate-700 ${
                    i === active ? "bg-slate-100" : ""
                  }`}
                >
                  <Plus size={14} className="shrink-0 text-slate-400" />
                  <span>
                    ใช้ “<span className="font-medium">{typed}</span>” เป็นหน่วยใหม่
                  </span>
                </button>
              );
            })()}

          {rows.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">ไม่พบหน่วยที่ตรงกับคำค้น</div>}
        </div>
      )}
    </div>
  );
}
