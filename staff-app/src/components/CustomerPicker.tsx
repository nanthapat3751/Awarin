import type { CustomerDto } from "@systemboq/shared-types";
import { Check, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "./Avatar";
import { SearchInput } from "./SearchInput";

/**
 * กล่องเลือกลูกค้า (combobox แบบ GitHub/Linear) — กางในการ์ดลูกค้าใต้ปุ่ม "เปลี่ยนลูกค้า" (embedded)
 * ไม่ลอยทับหน้า: แบบลอยเคยทับเมนูข้างและการ์ดราคาข้างล่าง
 * เปิดมาเห็นลูกค้าปัจจุบัน + ลูกค้าล่าสุดทันทีโดยไม่ต้องพิมพ์ · ค้นได้ทั้งชื่อ อีเมล เบอร์
 * ↑/↓ เลื่อน · Enter เลือก · Esc หรือคลิกนอกกล่อง = ปิด
 * "เลิกผูก" เป็นลิงก์เล็กสีแดงแยกไว้ขวาสุด ไม่วางคู่กับปุ่มยกเลิกให้กดพลาด
 */
export function CustomerPicker({
  current,
  query,
  onQuery,
  results,
  searching,
  busy,
  onPick,
  onUnlink,
  onCreateNew,
  onClose,
  embedded = false,
  className = "",
}: Readonly<{
  current: CustomerDto | null;
  query: string;
  onQuery: (q: string) => void;
  results: CustomerDto[];
  searching: boolean;
  busy: boolean;
  onPick: (customer: CustomerDto) => void;
  onUnlink?: () => void;
  onCreateNew?: () => void;
  onClose: () => void;
  /** อยู่ในการ์ด: เต็มความกว้าง มีแค่เส้นคั่นบน · false = กล่องมีกรอบของตัวเอง (วางใต้การ์ด 3 ทาง) */
  embedded?: boolean;
  className?: string;
}>) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const typed = query.trim() !== "";
  // ยังไม่พิมพ์: ลูกค้าปัจจุบันแยกไว้หัวรายการ ไม่ซ้ำใน "ล่าสุด" · พิมพ์แล้ว: อยู่ในผลค้นหาพร้อมติ๊กถูก
  // (ตัดออกจะกลายเป็น "ไม่พบ" ตอนค้นชื่อคนที่ผูกอยู่ ซึ่งไม่จริง)
  const list = typed ? results : results.filter((c) => c.id !== current?.id);

  useEffect(() => setActive(0), [query, results]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // ปุ่มที่เปิดกล่องเป็นตัวสลับเปิด/ปิดเอง — ปิดตรงนี้ด้วยจะกลายเป็นปิดแล้วเปิดใหม่ทันที
      if (target.closest?.("[data-customer-picker-trigger]")) return;
      if (boxRef.current && !boxRef.current.contains(target)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && list[active] && list[active].id !== current?.id && !busy) {
      e.preventDefault();
      onPick(list[active]);
    }
  }

  const row = (c: CustomerDto, opts: { selected?: boolean; index?: number }) => (
    <button
      key={c.id}
      type="button"
      role="option"
      aria-selected={opts.selected ?? opts.index === active}
      disabled={busy || opts.selected}
      onClick={() => onPick(c)}
      onMouseEnter={() => opts.index !== undefined && setActive(opts.index)}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left disabled:cursor-default ${
        opts.selected ? "bg-slate-50" : opts.index === active ? "bg-slate-100" : ""
      } ${busy && !opts.selected ? "opacity-50" : ""}`}
    >
      <Avatar name={c.fullName} src={c.avatarUrl} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-slate-800">{c.fullName}</span>
        <span className="block truncate text-xs text-slate-500">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
      </span>
      {opts.selected && <Check size={15} className="shrink-0 text-brand" aria-label="ลูกค้าปัจจุบัน" />}
    </button>
  );

  const section = (label: string) => <p className="px-3 pb-1 pt-2 text-[11px] font-medium text-slate-400">{label}</p>;

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="เลือกลูกค้า"
      className={`bg-white text-sm ${
        embedded ? "border-t border-slate-200" : "w-80 max-w-full overflow-hidden rounded-lg border border-slate-200"
      } ${className}`}
    >
      <div className="border-b border-slate-100 p-2">
        <SearchInput
          autoFocus
          placeholder="พิมพ์ชื่อ อีเมล หรือเบอร์โทร"
          value={query}
          onChange={onQuery}
          onKeyDown={onInputKey}
          inputClassName="py-1"
        />
      </div>
      <div role="listbox" aria-label="ลูกค้า" className="max-h-64 overflow-y-auto pb-1">
        {current && !typed && (
          <>
            {section("ลูกค้าปัจจุบัน")}
            {row(current, { selected: true })}
          </>
        )}
        {section(typed ? "ผลการค้นหา" : "ล่าสุด")}
        {list.length > 0 ? (
          list.map((c, i) => row(c, { index: i, selected: c.id === current?.id || undefined }))
        ) : (
          <p className="px-3 py-2 text-xs text-slate-500">
            {searching
              ? "กำลังค้นหา..."
              : typed
                ? `ไม่พบ "${query.trim()}" — ค้นได้เฉพาะลูกค้าที่มีบัญชีแล้ว`
                : "ยังไม่มีลูกค้าคนอื่นในระบบ"}
          </p>
        )}
      </div>
      {(onCreateNew || onUnlink) && (
        <div className="flex items-center gap-3 border-t border-slate-100 px-3 py-2 text-xs">
          {onCreateNew && (
            <button type="button" onClick={onCreateNew} className="link-pill -mx-2.5 -my-1 flex items-center gap-1 font-medium text-brand">
              <UserPlus size={13} /> สร้างลูกค้าใหม่
            </button>
          )}
          {onUnlink && (
            <button type="button" onClick={onUnlink} disabled={busy} className="link-pill -my-1 -mr-2.5 ml-auto text-red-600 hover:bg-red-50 disabled:bg-transparent disabled:opacity-50">
              เลิกผูกลูกค้า
            </button>
          )}
        </div>
      )}
    </div>
  );
}
