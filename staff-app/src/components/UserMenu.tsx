import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronsUpDown, ShieldAlert, ShieldCheck } from "lucide-react";

import type { Role } from "@systemboq/shared-types";

import { useAuth } from "../lib/auth-context";

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "เจ้าของระบบ",
  ADMIN: "ผู้ดูแลระบบ",
  CUSTOMER: "ลูกค้า",
};

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
 * กล่องผู้ใช้ท้ายเมนูข้าง: แถวเดียว (avatar + ชื่อ + ตำแหน่ง) กดแล้วเด้งเมนูขึ้นมา
 * — ชื่อ/อีเมล + สถานะการยืนยัน 2 ชั้น
 *
 * ยังคง "เตือน 2FA" ให้เห็นตอนเมนูปิดด้วยจุดสีเหลืองบน avatar เพราะเป็นเรื่องความปลอดภัย
 * ไม่ควรถูกซ่อนหลังการคลิก
 *
 * ปุ่มออกจากระบบ **ไม่อยู่ในเมนูนี้แล้ว** — ย้ายไปเป็นปุ่มวงกลมข้างกระดิ่งบนแถบบนขวา
 * (ดู LogoutButton) เพราะของเดิมซ่อนลึกจนผู้ใช้หาไม่เจอ. เหตุผลเดิมที่เคยเอาเข้ามาซ่อนคือ
 * ไม่อยากได้ปุ่มบล็อกสีแดงเต็มความกว้างมาดึงสายตา — ปุ่มไอคอนวงกลมบนแถบบนไม่ขัดข้อนั้น
 * และห้ามใส่กลับเข้ามาที่นี่อีก จะกลายเป็นปุ่มออกจากระบบสองที่
 */
export function UserMenu({ collapsed }: Readonly<{ collapsed: boolean }>) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // เปลี่ยนหน้าแล้วปิดเมนูเอง (กดเมนูข้างในแล้วเมนูค้างอยู่จะดูแปลก)
  useEffect(() => setOpen(false), [location.pathname]);
  // ย่อ/ขยาย sidebar แล้วปิดด้วย เพราะตำแหน่งเมนูย้ายข้าง
  useEffect(() => setOpen(false), [collapsed]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;
  const twoFactorOff = !user.twoFactorEnabled;

  const avatar = (
    <span className="relative shrink-0">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
        {initialsOf(user.fullName)}
      </span>
      {twoFactorOff && (
        <span
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white"
          aria-hidden
        />
      )}
    </span>
  );

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? `${user.fullName} · ${ROLE_LABEL[user.role]}` : undefined}
        className={`flex w-full items-center rounded-md transition-colors hover:bg-slate-100 ${
          open ? "bg-slate-100" : ""
        } ${collapsed ? "justify-center px-0 py-2" : "gap-2.5 px-2 py-2 text-left"}`}
      >
        {avatar}
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-800">
                {user.fullName}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {ROLE_LABEL[user.role]}
              </span>
            </span>
            <ChevronsUpDown size={14} className="shrink-0 text-slate-400" />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute bottom-full z-30 mb-2 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
            collapsed ? "left-0 w-56" : "left-0 right-0"
          }`}
        >
          <div className="border-b border-slate-100 px-3 pb-2 pt-1.5">
            <p className="truncate text-sm font-medium text-slate-800">{user.fullName}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>

          {/* ไม่ใส่ "ตั้งค่า" ซ้ำกับเมนูข้าง — เมนูนี้เก็บเฉพาะเรื่องของบัญชีที่ลงลึกกว่า
              คือพาไปแท็บความปลอดภัยตรง ๆ (เมนูข้างจะเปิดที่แท็บข้อมูลบริษัท) */}
          {user.twoFactorEnabled ? (
            <Link
              to="/settings?tab=security"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
            >
              <ShieldCheck size={15} className="shrink-0 text-emerald-600" />
              การยืนยัน 2 ชั้น
              <span className="ml-auto text-xs font-medium text-emerald-600">เปิดอยู่</span>
            </Link>
          ) : (
            <Link
              to="/settings?tab=security"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-amber-700 transition-colors hover:bg-amber-50"
            >
              <ShieldAlert size={15} className="shrink-0 text-amber-500" />
              เปิดการยืนยัน 2 ชั้น
              <span className="ml-auto text-xs">แนะนำ</span>
            </Link>
          )}

        </div>
      )}
    </div>
  );
}
