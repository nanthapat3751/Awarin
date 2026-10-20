import { useState } from "react";

// สระหน้า (เ แ โ ใ ไ) ไม่ใช่ตัวแทนชื่อ — "เอกชัย" ต้องได้ "อ" ไม่ใช่ "เ"
const LEADING_THAI_VOWEL = /^[เแโใไ]/;

/** อักษรย่อจากสองคำแรกของชื่อ ("เอกชัย ทดสอบ" → "อท") · ข้ามคำที่ขึ้นต้นด้วยเครื่องหมาย */
function initialsOf(fullName: string | null | undefined): string {
  const words = (fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
    .slice(0, 2);
  return words.map((w) => w.replace(LEADING_THAI_VOWEL, "").charAt(0).toUpperCase()).join("") || "?";
}

/**
 * รูปโปรไฟล์วงกลม — ไม่มีรูป หรือรูปโหลดไม่ขึ้น (ไฟล์หาย/เน็ตหลุด) ก็กลับไปโชว์อักษรย่อบนพื้นนาวี
 *
 * จำว่า "src ไหน" ที่พัง ไม่ใช่แค่ธง true/false: ถ้าเก็บเป็นธงเฉย ๆ พอเปลี่ยนรูปใหม่ที่โหลดได้
 * ธงเก่ายังค้างอยู่ รูปใหม่จะไม่โชว์เลยจนกว่าจะรีเฟรช
 */
export function Avatar({
  name,
  src,
  size = 32,
  className = "",
}: Readonly<{ name: string | null | undefined; src: string | null | undefined; size?: number; className?: string }>) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const box = { width: size, height: size };

  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        alt=""
        style={box}
        onError={() => setFailedSrc(src)}
        className={`shrink-0 rounded-full bg-slate-100 object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...box, fontSize: Math.max(11, Math.round(size * 0.34)) }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand font-medium text-white ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}
