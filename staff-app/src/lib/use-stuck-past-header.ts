import { useCallback, useEffect, useRef, useState } from "react";

/**
 * บอกว่าหัวเรื่องของหน้าเลื่อนพ้นขอบบนจอไปแล้วหรือยัง — เอาไว้สั่งให้แถบหัวติดจอโผล่
 *
 * ใช้ callback ref ไม่ใช่ useRef + useEffect เพราะหน้าที่เอาไปใช้มักมี `if (loading) return`
 * คั่นอยู่ก่อนหัวเรื่อง — ตอน effect ทำงานรอบแรก node ยังไม่เกิด และ effect ที่ deps ว่าง
 * จะไม่ทำงานอีก ทำให้ observer ไม่เคยถูกผูกเลย
 */
export function useStuckPastHeader() {
  const [stuck, setStuck] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node || typeof IntersectionObserver === "undefined") return;
    // หมุดวางไว้ท้ายหัวเรื่องจริง — พอหมุดเลื่อนพ้นขอบบนจอ ค่อยโชว์แถบ
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting));
    io.observe(node);
    observerRef.current = io;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { sentinelRef, stuck };
}
