import { useState } from "react";

/**
 * อักษรย่อบน avatar — ชื่อไทยมักเขียนติดกัน จึงใช้ 2 ตัวแรกเมื่อมีคำเดียว (สระหน้าอย่าง "เ" จะได้
 * อ่านออก เช่น เกรียงไกร -> เก). ข้ามคำที่ขึ้นต้นด้วยเครื่องหมาย เช่น "บัญชีสาธิต (Demo)" ไม่ให้ได้ "บ("
 */
function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => /^[\p{L}\p{N}]/u.test(part));
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * รูปโปรไฟล์วงกลม — ไม่มีรูป หรือรูปโหลดไม่ขึ้น (ไฟล์หาย/เน็ตหลุด) ก็กลับไปโชว์ตัวย่อชื่อ
 *
 * จำว่า "src ไหน" ที่พัง ไม่ใช่แค่ธง true/false: ถ้าเก็บเป็นธงเฉย ๆ พอเปลี่ยนรูปใหม่ที่โหลดได้
 * ธงเก่ายังค้างอยู่ รูปใหม่จะไม่โชว์เลยจนกว่าจะรีเฟรช
 */
export function Avatar({
  name,
  src,
  size = 32,
  className = "",
}: Readonly<{ name: string; src: string | null | undefined; size?: number; className?: string }>) {
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
      style={{ ...box, fontSize: Math.max(11, Math.round(size * 0.36)) }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand/10 font-semibold text-brand ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}
