import type { KeyboardEvent, MouseEvent } from "react";
import { useNavigate } from "react-router-dom";

/**
 * สไตล์ hover/active ที่ใช้ร่วมกันสำหรับแถวที่คลิกได้: พื้นเทาเข้มขึ้นเมื่อ hover, สถานะกดที่เข้ม
 * ขึ้นอีกนิด และแถบเน้นสีเข้มที่ขอบซ้ายตอน hover (ใช้ inset shadow บนเซลล์แรก จึงไม่ทำให้เกิด
 * layout shift) นำไปต่อท้าย class ขอบของแถวเอง
 */
export const rowNavClass =
  "cursor-pointer transition-colors hover:bg-slate-100 active:bg-slate-200 [&:hover>td:first-child]:shadow-[inset_3px_0_0_#1e293b]";

/**
 * กันไม่ให้การคลิกภายในเซลล์ที่เป็นปุ่มกด (ปุ่ม, select, ลิงก์ชื่อ) ไปกระตุ้นการนำทางของแถวด้วย
 * นำไป spread บน <td>/<a> ที่มี event คลิกของตัวเอง
 */
export function stopRowNav(e: MouseEvent) {
  e.stopPropagation();
}

/**
 * ทำให้ทั้งแถว <table> ทำตัวเหมือนลิงก์ นำ props ที่คืนมา spread บน <tr> และเพิ่ม `cursor-pointer`
 * + `hover:bg-*` ใน className เซลล์ที่โต้ตอบได้ภายในแถวต้องเรียก {@link stopRowNav} เพื่อไม่ให้
 * การคลิกของมันเองไปนำทาง
 */
export function useRowNav() {
  const navigate = useNavigate();
  return (to: string) => ({
    onClick: () => navigate(to),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter") navigate(to);
    },
    role: "link" as const,
    tabIndex: 0,
  });
}
