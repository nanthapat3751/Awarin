import { useMemo, type InputHTMLAttributes, type ReactNode } from "react";

// แยกข้อความเป็น "กลุ่มพยางค์" (grapheme) เพื่อให้สระ/วรรณยุกต์ไทยติดกับพยัญชนะ ไม่หลุดตอนทำเวฟ
// เช่น "อีเมล" → ["อี","เ","ม","ล"] แทนที่จะเป็น ["อ","ี","เ","ม","ล"]
function toGraphemes(str: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter("th", { granularity: "grapheme" });
    return Array.from(seg.segment(str), (s) => s.segment);
  }
  return Array.from(str);
}

// หน่วงต่อหนึ่งอักษร (มิลลิวินาที) — ทำให้ตัวอักษรวิ่งขึ้นทีละตัวเป็นคลื่นซ้าย→ขวา
const STEP_MS = 45;

// ช่องกรอกสไตล์เส้นใต้ + label เวฟทีละตัว (สไตล์ CSS อยู่ใน index.css คลาส .wave-field)
// label เริ่มอยู่ในช่อง พอโฟกัส/มีค่า จะลอยขึ้นบน + ตัวอักษรวิ่งซ้าย→ขวาเป็นคลื่น
type WaveFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string | null;
  // องค์ประกอบท้ายช่อง เช่น ปุ่มตาดูรหัสผ่าน
  trailing?: ReactNode;
};

export function WaveField({
  id,
  label,
  error,
  trailing,
  placeholder,
  className,
  ...rest
}: WaveFieldProps) {
  const graphemes = useMemo(() => toGraphemes(label), [label]);

  return (
    <div>
      <div className={`wave-field ${error ? "wave-field--error" : ""}`}>
        <input
          id={id}
          // ต้องมี placeholder เสมอเพื่อให้ :placeholder-shown ทำงาน (คำใบ้จริงจะโผล่ตอนโฟกัสเท่านั้น)
          placeholder={placeholder ?? " "}
          aria-invalid={error ? true : undefined}
          className={`peer ${trailing ? "has-trailing" : ""} ${className ?? ""}`}
          {...rest}
        />
        <span className="line-base" aria-hidden />
        <span className="line-active" aria-hidden />
        {/* aria-label ให้ screen reader อ่านทั้งคำ ส่วน span แต่ละตัว (อักษรเดี่ยว) ซ่อนจากการอ่าน */}
        <label htmlFor={id} aria-label={label}>
          {graphemes.map((g, i) => (
            <span key={i} aria-hidden style={{ transitionDelay: `${i * STEP_MS}ms` }}>
              {g === " " ? " " : g}
            </span>
          ))}
        </label>
        {trailing && <div className="wave-trailing">{trailing}</div>}
      </div>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </div>
  );
}
