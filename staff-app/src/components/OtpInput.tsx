import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  // เรียกเมื่อกรอกครบทุกช่อง (ใช้ auto-submit)
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  // สถานะภาพของช่อง: ปกติ / ผิด (แดง+สั่น) / ถูก (เขียว) — ใช้ให้ feedback ตอนยืนยัน 2FA
  status?: "default" | "error" | "success";
}

// ช่องกรอกรหัส OTP แบบแยกช่อง (1 หลัก/ช่อง) — พิมพ์แล้วเลื่อนช่องเอง, backspace ถอยช่อง,
// วางรหัสทั้งก้อนได้ (paste). เก็บค่าเป็นสตริงตัวเลขชิดซ้าย ป้องกันช่องว่างกลาง
const BOX_COLOR = {
  default: "border-slate-300 text-slate-800 focus:border-brand focus:ring-brand/25",
  error: "border-red-400 text-red-600 focus:border-red-400 focus:ring-red-200",
  success: "border-emerald-400 text-emerald-700 focus:border-emerald-400 focus:ring-emerald-200",
} as const;

export function OtpInput({
  value,
  onChange,
  length = 6,
  onComplete,
  disabled,
  autoFocus,
  status = "default",
}: Readonly<OtpInputProps>) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  // สีขอบ/ตัวอักษรตามสถานะ (โฟกัสยังคงเน้นเหมือนเดิมในแต่ละสถานะ)
  const boxColor = BOX_COLOR[status ?? "default"];

  const focusBox = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(i, length - 1))];
    el?.focus();
    el?.select();
  };

  const commit = (next: string) => {
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  const handleChange = (i: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    // กันช่องว่าง: แก้ได้เฉพาะช่องถัดจากตัวสุดท้ายที่กรอกไว้แล้ว
    const idx = Math.min(i, value.length);
    const chars = value.split("");
    // ถ้าพิมพ์/วางหลายหลักในช่องเดียว ให้กระจายไปช่องถัด ๆ
    let k = idx;
    for (const d of digits) {
      if (k >= length) break;
      chars[k] = d;
      k += 1;
    }
    commit(chars.join("").slice(0, length));
    focusBox(k);
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) {
        commit(value.slice(0, i) + value.slice(i + 1));
        focusBox(i);
      } else if (i > 0) {
        commit(value.slice(0, i - 1) + value.slice(i));
        focusBox(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(i + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, length);
    if (!digits) return;
    commit(digits);
    focusBox(digits.length);
  };

  return (
    <div className={`flex justify-center gap-2 ${status === "error" ? "otp-shake" : ""}`.trim()}>
      {Array.from({ length }, (_, n) => `otp-box-${n + 1}`).map((boxKey, i) => (
        <input
          key={boxKey}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && i === 0}
          maxLength={1}
          disabled={disabled}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          aria-label={`หลักที่ ${i + 1}`}
          className={`h-12 w-11 rounded-lg border text-center text-lg font-semibold transition-all duration-150 motion-reduce:transition-none motion-safe:focus:-translate-y-0.5 focus:outline-none focus:ring-2 disabled:opacity-50 ${boxColor}`}
        />
      ))}
    </div>
  );
}
