import type { ReactNode } from "react";

interface FloatingFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  // ไอคอนนำหน้า (ซ้ายในช่อง)
  icon: ReactNode;
  type?: string;
  // องค์ประกอบท้ายช่อง เช่น ปุ่มตาดูรหัสผ่าน
  trailing?: ReactNode;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  // คลาสเสริมของ input (เช่น font-mono/uppercase/tracking สำหรับช่องรหัส)
  inputClassName?: string;
}

// ช่องกรอกสไตล์ Material: ไอคอนนำหน้า + floating label (label ลอยขึ้นเมื่อโฟกัส/พิมพ์)
// placeholder=" " จำเป็นทางเทคนิคให้ :placeholder-shown ทำงานคู่ floating label
export function FloatingField({
  id,
  label,
  value,
  onChange,
  icon,
  type = "text",
  trailing,
  required,
  autoComplete,
  autoFocus,
  inputClassName = "",
}: Readonly<FloatingFieldProps>) {
  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        required={required}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder=" "
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`peer w-full rounded-md border border-slate-300 pl-10 ${
          trailing ? "pr-10" : "pr-3"
        } pt-5 pb-1.5 text-slate-800 transition duration-200 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 ${inputClassName}`}
      />
      {/* ไอคอนนำหน้า — เปลี่ยนเป็นสีนาวีตอนโฟกัส */}
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors peer-focus:text-brand">
        {icon}
      </span>
      {/* floating label — วางตรงกับข้อความ (หลังไอคอน) ลอยขึ้นมุมซ้ายบนเมื่อโฟกัส/พิมพ์ */}
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 text-sm text-slate-400 transition-all duration-150 peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-brand peer-not-placeholder-shown:top-1.5 peer-not-placeholder-shown:translate-y-0 peer-not-placeholder-shown:text-xs peer-not-placeholder-shown:text-slate-500"
      >
        {label}
      </label>
      {trailing && (
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">{trailing}</div>
      )}
    </div>
  );
}
