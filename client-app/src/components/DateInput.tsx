import { useEffect, useRef, useState, type ReactNode } from "react";

import { ThaiCalendar } from "./ThaiCalendar";

import { dmyToIso, isoToDmy, maskDmy } from "@systemboq/shared-types";

/**
 * ช่องวันที่แบบ วว/ดด/ปปปป (ปี พ.ศ.) แทน <input type="date"> · ปุ่มไอคอนเปิดปฏิทินไทย (ThaiCalendar)
 *
 * ช่องวันที่ของเบราว์เซอร์จัดรูปแบบตามภาษาของเครื่อง (อังกฤษแบบอเมริกา = เดือนขึ้นก่อน) เว็บสั่งไม่ได้
 * ช่องนี้พิมพ์เองได้ (ใส่ / ให้อัตโนมัติ · พิมพ์ปี พ.ศ. แปลงให้) + ไอคอนปฏิทินกดเปิดตัวเลือกของเบราว์เซอร์
 * ค่าเข้า/ออกยังเป็น "YYYY-MM-DD" หรือ "" — ส่งออกเฉพาะตอนได้วันที่ครบและถูกต้อง หรือตอนลบจนว่าง
 * (ตัวเดียวกับฝั่งพนักงาน staff-app/src/components/DateInput.tsx แต่ไอคอนอยู่ซ้ายตามดีไซน์ฟอร์มลูกค้า)
 */
export function DateInput({
  id,
  value,
  onChange,
  min,
  max,
  className = "",
  icon,
}: Readonly<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  className?: string;
  /** ไอคอนปฏิทินทางซ้าย (กดเปิดปฏิทินได้) — ช่องต้องเว้นที่ซ้ายเอง เช่น pl-10 */
  icon: ReactNode;
}>) {
  const [text, setText] = useState(() => isoToDmy(value));
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dmyToIso(text) === (value || null)) return;
    setText(isoToDmy(value));
    setInvalid(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตอบสนองเฉพาะ value จากภายนอก
  }, [value]);

  const outOfRange = (iso: string) => (!!min && iso < min) || (!!max && iso > max);

  function handleText(raw: string) {
    const next = maskDmy(raw);
    setText(next);
    if (next === "") {
      setInvalid(false);
      if (value !== "") onChange("");
      return;
    }
    const iso = dmyToIso(next);
    if (iso && !outOfRange(iso)) {
      setInvalid(false);
      if (iso !== value) onChange(iso);
    } else {
      setInvalid(next.length === 10);
    }
  }

  function handleBlur() {
    const iso = dmyToIso(text);
    if (text !== "" && (!iso || outOfRange(iso))) {
      setText(isoToDmy(value));
      setInvalid(false);
    } else if (iso) {
      // พิมพ์ปี ค.ศ. หรือวัน/เดือนหลักเดียวมา → จัดให้เป็นรูปแบบเต็ม ปี พ.ศ. แบบเดียวกับที่แสดง
      setText(isoToDmy(iso));
    }
  }

  function pick(iso: string) {
    setOpen(false);
    setInvalid(false);
    setText(isoToDmy(iso));
    if (iso !== value) onChange(iso);
    inputRef.current?.focus();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        tabIndex={-1}
        aria-label="เลือกจากปฏิทิน"
        aria-expanded={open}
        className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400 hover:text-brand"
      >
        {icon}
      </button>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="วว/ดด/ปปปป"
        aria-invalid={invalid || undefined}
        value={text}
        maxLength={10}
        onChange={(e) => handleText(e.target.value)}
        onBlur={handleBlur}
        className={`${className} tabular-nums ${invalid ? "border-red-400" : ""}`}
      />
      {open && (
        <ThaiCalendar
          // กล่องที่ครอบทั้งไอคอนและช่อง — คลิกไอคอนเพื่อปิดจะไม่ถูกนับเป็น "คลิกนอกปฏิทิน" แล้วเปิดซ้ำ
          anchor={inputRef.current?.parentElement ?? null}
          value={value}
          min={min}
          max={max}
          allowClear
          onPick={pick}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
