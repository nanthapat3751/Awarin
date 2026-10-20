import { ChevronDown, MoreHorizontal } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

import { iconButtonClasses } from "./Button";

export interface RowMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  /** คำสั่งที่ย้อนไม่ได้/ทำให้ของหาย — สีแดง และถูกจัดไว้ท้ายเมนูเสมอ */
  danger?: boolean;
}

/**
 * เมนู ⋯ ท้ายแถว — ที่อยู่ของคำสั่งที่ใช้ไม่บ่อย (แก้/ลบ/ยกเลิกเอกสาร)
 * แยกออกจากแถวเพื่อให้ปุ่มที่เห็นในแถวเหลือแต่ "สิ่งที่ต้องทำต่อ" และกดคำสั่งอันตรายพลาดไม่ได้
 *
 * กล่องเมนูใช้ position: fixed คำนวณจากตำแหน่งปุ่ม — ตารางอยู่ในกล่อง overflow-x-auto
 * ถ้าวางแบบ absolute เมนูของแถวล่าง ๆ จะถูกตัดหรือทำให้ตารางมีแถบเลื่อนแนวตั้ง
 */
export function RowMenu({
  items,
  label,
  disabled,
  text,
  triggerClassName,
}: Readonly<{
  items: RowMenuItem[];
  label: string;
  disabled?: boolean;
  /** ปุ่มเปิดเป็นข้อความ + ลูกศร (เช่น "เพิ่มเติม") แทนไอคอน ⋯ — ใช้กับแถบเครื่องมือ */
  text?: string;
  triggerClassName?: string;
}>) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = pos != null;

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    // ตำแหน่ง fixed ไม่เลื่อนตามหน้า — เลื่อนหน้า/ย่อขยายหน้าต่างแล้วปิดไปเลยดีกว่าลอยผิดที่
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    menuRef.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (items.length === 0) return null;
  const ordered = [...items.filter((i) => !i.danger), ...items.filter((i) => i.danger)];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (open) {
            setPos(null);
            return;
          }
          const r = buttonRef.current!.getBoundingClientRect();
          const right = window.innerWidth - r.right;
          // แถวท้าย ๆ ใกล้ขอบล่างจอ — ที่ไม่พอให้เปิดขึ้นด้านบนปุ่มแทน (ประมาณ 34px ต่อรายการ)
          const height = items.length * 34 + 16;
          setPos(
            r.bottom + 4 + height > window.innerHeight && r.top - 4 - height > 0
              ? { bottom: window.innerHeight - r.top + 4, right }
              : { top: r.bottom + 4, right },
          );
        }}
        className={triggerClassName ?? iconButtonClasses()}
      >
        {text ? (
          <>
            {text} <ChevronDown size={14} aria-hidden />
          </>
        ) : (
          <MoreHorizontal size={16} />
        )}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{ top: pos.top, bottom: pos.bottom, right: pos.right }}
          className="fixed z-50 min-w-52 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg"
        >
          {ordered.map((item, i) => (
            <Fragment key={item.key}>
              {/* เส้นคั่นก่อนกลุ่มคำสั่งอันตราย — แยกเป็นเส้นของตัวเอง ไม่ติดกับแถวที่ไฮไลต์ */}
              {item.danger && i > 0 && !ordered[i - 1].danger && (
                <div role="separator" className="mx-2 my-1 border-t border-slate-200" />
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setPos(null);
                  item.onSelect();
                }}
                // ชี้ = พื้นเข้มขึ้นชัด ๆ · กดค้าง = เข้มอีกขั้น · focus-visible = แบบเดียวกับชี้ (คีย์บอร์ด)
                // ใช้ focus-visible ไม่ใช่ focus: เปิดเมนูด้วยเมาส์แล้วรายการแรกถูก focus เอง จะได้ไม่ดูเหมือนถูกชี้อยู่
                className={`block w-full rounded-md px-3 py-2 text-left transition-colors focus:outline-none ${
                  item.danger
                    ? "text-rose-700 hover:bg-rose-100 hover:text-rose-800 focus-visible:bg-rose-100 active:bg-rose-200"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:bg-slate-100 active:bg-slate-200 active:text-slate-900"
                }`}
              >
                {item.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </>
  );
}
