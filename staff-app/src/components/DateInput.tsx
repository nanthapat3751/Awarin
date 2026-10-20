import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { dmyToIso, isoToDmy, maskDmy } from "@systemboq/shared-types";

import { ThaiCalendar } from "./ThaiCalendar";

/**
 * ช่องวันที่แบบ วว/ดด/ปปปป (ปี พ.ศ.) แทน <input type="date"> ทั้งระบบ
 *
 * ช่องวันที่ของเบราว์เซอร์จัดรูปแบบตามภาษาของเครื่อง (อังกฤษแบบอเมริกา = เดือนขึ้นก่อน) เว็บสั่งไม่ได้
 * ช่องนี้พิมพ์เองได้ (ใส่ / ให้อัตโนมัติ · พิมพ์ปี ค.ศ. มาก็รับ) + ปุ่มปฏิทินเปิดปฏิทินไทย (ThaiCalendar)
 * แทนปฏิทินของเบราว์เซอร์ที่เป็นอังกฤษ ค.ศ. (ผู้ใช้เลือกแบบ A + ปี พ.ศ. 17 ต.ค.)
 *
 * ค่าเข้า/ออกยังเป็น "YYYY-MM-DD" (หรือ "" = ว่าง) เหมือน input เดิม — onChange เรียกเฉพาะตอนได้วันที่
 * ครบและถูกต้อง หรือตอนลบจนว่าง ระหว่างพิมพ์ไม่ครบจะไม่ส่งค่าครึ่ง ๆ กลาง ๆ ออกไป
 * min/max ใช้ตรวจตอนพิมพ์ด้วย (วันที่นอกช่วง = กรอบแดง ไม่ส่งค่า) และส่งต่อให้ปฏิทิน
 */
export function DateInput({
  value,
  onChange,
  min,
  max,
  disabled,
  className = "",
  id,
  "aria-label": ariaLabel,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}>) {
  const [text, setText] = useState(() => isoToDmy(value));
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ค่าจากภายนอกเปลี่ยน (โหลดใหม่ / เลือกจากปฏิทิน / ฟอร์มรีเซ็ต) → แสดงตาม · ถ้าข้อความที่พิมพ์อยู่
  // แปลงแล้วตรงกับค่าเดิมอยู่แล้ว ไม่ต้องทับ (กันเคอร์เซอร์กระโดดระหว่างพิมพ์)
  useEffect(() => {
    if (dmyToIso(text) === (value || null)) return;
    setText(isoToDmy(value));
    setInvalid(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตอบสนองเฉพาะ value จากภายนอก
  }, [value]);

  const outOfRange = (iso: string) => (min != null && min !== "" && iso < min) || (max != null && max !== "" && iso > max);

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
      // พิมพ์ครบแล้วแต่ไม่ใช่วันที่จริงหรือนอกช่วง = แดงทันที · ยังพิมพ์ไม่ครบ = รอ
      setInvalid(next.length === 10);
    }
  }

  // ออกจากช่องตอนพิมพ์ค้างไว้ไม่ครบ/ผิด → กลับไปแสดงค่าล่าสุดที่ใช้ได้ ไม่ปล่อยข้อความที่ไม่ได้บันทึกค้างไว้
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

  // คลาสความกว้างย้ายไปที่กรอบนอก (ช่องพิมพ์ในกรอบกว้างเต็มกรอบเสมอ) · ไม่กำหนด = กว้างตามช่องเอง (size)
  // แต่ยืดเต็มเมื่ออยู่ในคอลัมน์ flex แบบที่ฟอร์มส่วนใหญ่ใช้ เหมือน input เดิม
  const tokens = className.split(/\s+/).filter(Boolean);
  const isWidth = (t: string) => /^(w-|min-w-|max-w-|flex-1$|shrink)/.test(t);
  const wrapWidth = tokens.filter(isWidth).join(" ");
  const inputClass = tokens.filter((t) => !isWidth(t)).join(" ");
  return (
    <span ref={wrapRef} className={`relative flex ${wrapWidth}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="วว/ดด/ปปปป"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        title={invalid ? "วันที่ไม่ถูกต้องหรืออยู่นอกช่วงที่เลือกได้" : "พิมพ์ วัน/เดือน/ปี พ.ศ. หรือกดปุ่มปฏิทิน"}
        value={text}
        disabled={disabled}
        maxLength={10}
        onChange={(e) => handleText(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          // Alt+↓ เปิดปฏิทิน แบบช่องวันที่ทั่วไป
          if (e.altKey && e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        size={11}
        className={`${inputClass} w-full min-w-0 pr-8 tabular-nums ${invalid ? "border-red-400" : ""}`}
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        tabIndex={-1}
        aria-label="เลือกจากปฏิทิน"
        aria-expanded={open}
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-slate-400 hover:text-brand disabled:cursor-not-allowed disabled:hover:text-slate-400"
      >
        <CalendarDays size={15} />
      </button>
      {open && !disabled && (
        <ThaiCalendar
          anchor={wrapRef.current}
          value={value}
          min={min}
          max={max}
          onPick={pick}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}
