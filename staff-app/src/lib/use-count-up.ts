import { useEffect, useState } from "react";

// ตัวเลขวิ่งขึ้นจาก 0 ตอนโหลดหน้า -- สั้น ๆ พอให้รู้สึกว่าข้อมูลเพิ่งมาถึง ไม่ใช่ลูกเล่นยืดเวลา
const DURATION_MS = 600;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * นับตัวเลขขึ้นถึง `target` ด้วย requestAnimationFrame
 * ผู้ใช้ที่ตั้งค่าระบบให้ลดการเคลื่อนไหวจะได้ค่าปลายทางทันทีโดยไม่มีอนิเมชั่น
 */
export function useCountUp(target: number): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      // ease-out cubic: พุ่งเร็วตอนต้นแล้วค่อย ๆ นิ่ง อ่านตัวเลขปลายทางได้ชัด
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setValue(target); // ปิดท้ายด้วยค่าจริงเป๊ะ ๆ กันปัดเศษเพี้ยน
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
}
