import type { ReactNode } from "react";

/**
 * ป้ายบอกชื่อปุ่มไอคอนตอนชี้เมาส์/กด Tab (แบบ YouTube/GitHub) — แทน title ของเบราว์เซอร์ที่ขึ้นช้าและหน้าตาไม่เข้ากับระบบ
 *
 * - หน่วง 300ms ก่อนโผล่ ลากเมาส์ผ่านเฉย ๆ ไม่กระพริบ · ออกแล้วหายทันที
 * - ซ่อนเมื่อแผงของปุ่มเปิดอยู่ (aria-expanded=true) ไม่ให้ป้ายทับแผงแจ้งเตือน
 * - ป้ายเป็น aria-hidden — ปุ่มข้างในต้องมี aria-label ข้อความเดียวกันเสมอ (โปรแกรมอ่านหน้าจอได้ยินครั้งเดียว)
 * - align="end" สำหรับปุ่มชิดขอบขวาของแถบ ไม่ให้ป้ายยื่นพ้นจอ
 * - side="top" สำหรับปุ่มในตารางที่ห่อด้วย overflow-x-auto — ป้ายใต้แถวสุดท้ายจะถูกตัด/เกิดแถบเลื่อน
 * - จอสัมผัสไม่มีการชี้เมาส์ ป้ายจึงไม่โผล่ — ตั้งใจ
 */
export function Tooltip({
  label,
  align = "center",
  side = "bottom",
  children,
}: Readonly<{ label: string; align?: "center" | "end"; side?: "bottom" | "top"; children: ReactNode }>) {
  const horizontal = align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";
  const vertical = side === "top" ? "bottom-full mb-2" : "top-full mt-2";
  const position = `${horizontal} ${vertical}`;
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        aria-hidden
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition-opacity duration-150 group-hover/tip:opacity-100 group-hover/tip:delay-300 group-has-[:focus-visible]/tip:opacity-100 group-has-[[aria-expanded=true]]/tip:hidden ${position}`}
      >
        {label}
      </span>
    </span>
  );
}
