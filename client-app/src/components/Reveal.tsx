import { useEffect, useRef, useState, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** หน่วงก่อนโผล่ (มิลลิวินาที) — ใช้ไล่ทีละชิ้น (stagger) ในกริดเดียวกัน */
  delay?: number;
  /** id สำหรับให้ลิงก์ #... เลื่อนมาหยุดตรงนี้ (ต้องคู่กับ scroll-mt-* ใน className) */
  id?: string;
}

/**
 * Scroll-reveal: ห่อ element ให้ค่อย ๆ จางเข้า + เลื่อนขึ้นเมื่อเลื่อนหน้าจอมาถึง (โผล่ครั้งเดียว).
 * ใช้ IntersectionObserver ล้วน ไม่มี dependency; ผู้ใช้ที่ตั้ง prefers-reduced-motion จะเห็นเนื้อหา
 * ทันทีโดยไม่มีอนิเมชั่น (คุมด้วยคลาส .reveal ใน index.css)
 */
export function Reveal({ children, className = "", delay = 0, id }: Readonly<RevealProps>) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target); // โผล่แล้วเลิกเฝ้า ไม่ซ่อนซ้ำตอน scroll กลับ
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      id={id}
      ref={ref}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
