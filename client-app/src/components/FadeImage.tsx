import { useEffect, useRef, useState } from "react";

/**
 * รูปที่มีแสงวิ่งรองอยู่ข้างใต้ระหว่างรอ แล้วจางเข้าเมื่อโหลดเสร็จ (แบบเดียวกับรูปใหญ่หน้าแรก)
 *
 * `pending` = ยังไม่รู้ด้วยซ้ำว่าจะใช้รูปไหน (รอค่าตั้งคลังรูป) → แสงวิ่ง · รู้แล้วแต่ไม่มีรูป หรือ
 * โหลดไม่ขึ้น = กล่องสีอ่อนนิ่ง ๆ (แสงวิ่งค้างตลอดไปคือการบอกว่ากำลังโหลดทั้งที่ไม่มีอะไรจะมา)
 * className ลงกล่องนอก (ขนาด/มุมมน) · รูปเต็มกล่องเสมอ · imgClassName ใช้กับลูกเล่นอย่าง group-hover:scale-105
 * ความเร็วจางเข้า/ขยายตอนชี้อยู่ที่ .fade-image ใน index.css (คนละความเร็วกัน ใส่เป็นคลาส Tailwind ไม่ได้)
 */
export function FadeImage({
  src,
  alt,
  className,
  imgClassName = "",
  pending = false,
  dark = false,
  lazy = false,
}: Readonly<{
  src: string;
  alt: string;
  className: string;
  imgClassName?: string;
  pending?: boolean;
  dark?: boolean;
  lazy?: boolean;
}>) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // รูปที่อยู่ในแคชอาจโหลดเสร็จก่อน React ผูก onLoad — เช็คซ้ำตอนเปลี่ยนรูป ไม่งั้นแสงวิ่งค้าง
    const img = imgRef.current;
    setState(img?.complete && img.naturalWidth > 0 ? "loaded" : "loading");
  }, [src]);

  const shimmer = pending || (src !== "" && state === "loading");
  const empty = !pending && (src === "" || state === "failed");
  return (
    <div className={`relative overflow-hidden ${empty ? "bg-slate-100" : ""} ${className}`}>
      {shimmer && (
        <div aria-hidden className={`skeleton absolute inset-0 rounded-none ${dark ? "on-dark" : ""}`} />
      )}
      {src !== "" && state !== "failed" && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading={lazy ? "lazy" : undefined}
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
          className={`fade-image absolute inset-0 h-full w-full object-cover ${
            state === "loaded" ? "opacity-100" : "opacity-0"
          } ${imgClassName}`}
        />
      )}
    </div>
  );
}
