import { useEffect, useMemo, useRef, useState } from "react";

export interface SearchableOption {
  value: string;
  label: string;
  /** บรรทัดที่สอง (สีเทา ตัวเล็ก) ใต้ label เช่น path ของหมวดงาน — ช่วยให้สแกนง่ายขึ้น */
  sublabel?: string;
  /** Extra text matched by the search box on top of `label` (e.g. code, category path). */
  keywords?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Show a clear (×) affordance when something is selected. */
  clearable?: boolean;
  className?: string;
}

// dropdown แบบพิมพ์เพื่อกรอง สำหรับรายการที่ยาวเกินกว่าจะเลื่อนดู (หมวดงาน/วัสดุ มีหลายร้อยแถว)
// ทำให้เล็กและไม่พึ่ง dependency: ช่องค้นหา + รายการที่กรองแล้ว, ปิดเมื่อคลิกนอกพื้นที่หรือกด
// Escape, กด Enter เลือกรายการบนสุด จำกัดจำนวนผลลัพธ์เพื่อไม่ให้แคตตาล็อกขนาดใหญ่ render
// โหนดเป็นพัน ๆ พร้อมกัน
const RESULT_CAP = 50;

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "เลือก...",
  clearable = false,
  className,
}: Readonly<SearchableSelectProps>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = q
      ? options.filter((o) =>
          `${o.label} ${o.sublabel ?? ""} ${o.keywords ?? ""}`.toLowerCase().includes(q),
        )
      : options;
    return source.slice(0, RESULT_CAP);
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      {/* กรอบเดียวกัน แต่ปุ่มเปิดรายการกับปุ่มล้างค่าแยกกัน — ปุ่มซ้อนในปุ่มกดด้วยคีย์บอร์ดไม่ได้ */}
      <div className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`min-w-0 flex-1 truncate text-left ${selected ? "text-slate-800" : "text-slate-500"}`}
          title={selected ? [selected.sublabel, selected.label].filter(Boolean).join(" › ") : undefined}
        >
          {selected ? selected.label : placeholder}
        </button>
        {clearable && selected && (
          <button
            type="button"
            aria-label="ล้างค่า"
            onClick={() => pick("")}
            className="text-slate-500 hover:text-slate-700"
          >
            ×
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => setOpen((v) => !v)}
          className="text-slate-500 text-xs"
        >
          ▾
        </button>
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // กัน Enter/Esc ของ dropdown รั่วไปสั่งบันทึก/ปิดฟอร์มแม่ (ฟอร์ม BOQ ดัก Enter=บันทึก, Esc=ยกเลิก)
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
                setQuery("");
              } else if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                if (filtered.length > 0) pick(filtered[0].value);
              }
            }}
            placeholder="พิมพ์เพื่อค้นหา..."
            className="w-full border-b border-slate-200 px-2 py-1.5 text-sm focus:outline-none"
          />
          <ul className="max-h-64 overflow-auto">
            {filtered.length === 0 && (
              <li className="px-2 py-2 text-sm text-slate-500">ไม่พบรายการ</li>
            )}
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => pick(o.value)}
                  className={`w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 ${
                    o.value === value ? "bg-slate-50" : ""
                  }`}
                >
                  {o.sublabel ? (
                    <span className="flex flex-col leading-tight">
                      <span className={o.value === value ? "font-semibold text-slate-800" : "text-slate-800"}>
                        {o.label}
                      </span>
                      <span className="text-xs text-slate-500">{o.sublabel}</span>
                    </span>
                  ) : (
                    <span className={o.value === value ? "font-medium" : ""}>{o.label}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
