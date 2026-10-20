import { useEffect, useRef, useState } from "react";

/**
 * รูปที่ "สูงตามรูปจริง" (แปลนบ้าน · รูปในแกลเลอรีผลงาน) — สัดส่วนไม่แน่นอน จึงครอบสัดส่วนตายตัวแบบ
 * FadeImage ไม่ได้ (แปลนจะถูกตัดขาด) · ระหว่างรอจองความสูงขั้นต่ำ + แสงวิ่ง แล้วปล่อยให้สูงตามรูป
 * เมื่อโหลดเสร็จ (จางเข้า) · โหลดไม่ขึ้นก็ถือว่าจบ ไม่ให้แสงวิ่งค้าง
 * className ลงกรอบนอก (เส้นขอบ/มุมมน) · การขยายตอนชี้ใช้ความเร็วของ .fade-image
 */
export function NaturalImage({
  src,
  alt,
  className = "",
}: Readonly<{ src: string; alt: string; className?: string }>) {
  const [done, setDone] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // รูปในแคชอาจโหลดเสร็จก่อน React ผูก onLoad
    setDone(Boolean(ref.current?.complete));
  }, [src]);
  return (
    <div className={`relative overflow-hidden ${done ? "" : "min-h-56"} ${className}`}>
      {!done && <div aria-hidden className="skeleton absolute inset-0 rounded-none" />}
      <img
        ref={ref}
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setDone(true)}
        onError={() => setDone(true)}
        className={`fade-image w-full hover:scale-105 ${done ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
