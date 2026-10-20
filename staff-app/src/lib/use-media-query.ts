import { useEffect, useState } from "react";

/** ติดตาม media query สด ๆ — หมุน iPad / ลากขนาดหน้าต่างแล้วค่าเปลี่ยนตามทันที */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/**
 * จอที่เมนูข้างเต็ม (240px) กินเนื้อหาเกินไป → รางไอคอน 64px (กด ☰ กางทับ)
 * เดิมตัดที่ 1023px แต่ iPad แนวนอน (1024 / 1180 / 1194) เหลือเนื้อหาแค่ ~780–950px ตารางตกขอบทุกหน้า
 * (ผู้ใช้สั่ง 18 ต.ค. แบบ A) จึงขยายถึง 1279px = iPad ทุกรุ่นทั้งสองแนวได้รางไอคอน · คอม 1280 ขึ้นไปเหมือนเดิม
 */
export const NARROW_SCREEN = "(max-width: 1279px)";
