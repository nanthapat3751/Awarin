import type { InputHTMLAttributes, ReactNode } from "react";

// ช่องกรอกฝั่งลูกค้า: ไอคอนนำหน้า + floating label (label เริ่มกลางช่อง ลอยขึ้นมุมบนเมื่อโฟกัส/มีค่า)
// ถ้าส่ง placeholder มา จะเป็น "คำใบ้รูปแบบ" ที่โผล่เฉพาะตอนโฟกัส (ไม่ใช่ค่าปลอม)
type FloatingFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  icon: ReactNode;
  error?: string | null;
  // องค์ประกอบท้ายช่อง เช่น ปุ่มตาดูรหัสผ่าน
  trailing?: ReactNode;
};

export function FloatingField({
  id,
  label,
  icon,
  error,
  trailing,
  placeholder,
  className,
  ...rest
}: FloatingFieldProps) {
  const hasHint = Boolean(placeholder && placeholder.trim() !== "");
  return (
    <div>
      <div className="relative">
        <input
          id={id}
          // ต้องมี placeholder เสมอเพื่อให้ :placeholder-shown ทำงาน; ถ้าไม่มีคำใบ้ใช้ช่องว่าง
          placeholder={placeholder ?? " "}
          aria-invalid={error ? true : undefined}
          // field-glow = วงแหวนนาวีจาง + เงาตกใต้ตอนโฟกัส (นิยามใน index.css)
          // ถอด focus:ring-* ของ Tailwind ออกแล้ว เพราะ field-glow วาดวงแหวนชั้นในเองครบ
          className={`peer field-glow w-full rounded border bg-white pl-10 ${
            trailing ? "pr-10" : "pr-3"
          } pt-6 pb-2 text-slate-800 focus:outline-none ${
            error
              ? "field-glow--error border-red-400 focus:border-red-400"
              : "border-slate-300 focus:border-brand"
          } ${hasHint ? "placeholder:text-transparent focus:placeholder:text-slate-400" : ""} ${
            className ?? ""
          }`}
          {...rest}
        />
        {/* ไอคอนนำหน้า — เปลี่ยนเป็นสีนาวีตอนโฟกัส (แดงถ้ามี error) */}
        <span
          className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transition-colors peer-focus:text-brand ${
            error ? "text-red-400" : "text-slate-400"
          }`}
        >
          {icon}
        </span>
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-10 top-2 text-xs text-slate-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-base peer-placeholder-shown:text-slate-400 peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-brand"
        >
          {label}
        </label>
        {trailing && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>
        )}
      </div>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </div>
  );
}
