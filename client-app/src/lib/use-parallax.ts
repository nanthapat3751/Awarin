import { useEffect, useRef } from "react";

/**
 * Parallax เบา ๆ: เลื่อน element ตามการสกรอลล์ให้ช้ากว่าหน้าจอเล็กน้อย เกิดความรู้สึกมีชั้นความลึก
 *
 * ใช้กับรูปพื้นหลังที่ครอบด้วยกล่อง `overflow-hidden` และรูปถูกขยายไว้เผื่อขอบ (scale) เพื่อไม่ให้
 * เห็นขอบว่างตอนเลื่อน. ผูก listener แบบ passive + คำนวณใน requestAnimationFrame เฟรมละครั้ง
 * ผู้ใช้ที่ตั้ง prefers-reduced-motion จะไม่มีการเคลื่อนไหวเลย (ไม่ผูก listener ตั้งแต่แรก)
 */
export function useParallax<T extends HTMLElement>(strength = 0.12, scale = 1.12) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      // ระยะห่างระหว่างจุดกึ่งกลาง element กับกึ่งกลางจอ (0 = อยู่กลางจอพอดี)
      const fromCenter = rect.top + rect.height / 2 - window.innerHeight / 2;
      const offset = -fromCenter * strength;
      el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0) scale(${scale})`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    el.style.willChange = "transform";
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [strength, scale]);

  return ref;
}
