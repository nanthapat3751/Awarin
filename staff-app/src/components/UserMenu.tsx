import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { useAuth } from "../lib/auth-context";
import { ROLE_LABEL } from "../lib/role-labels";
import { Avatar } from "./Avatar";

/**
 * กล่องผู้ใช้ท้ายเมนูข้าง: ทั้งแถว (avatar + ชื่อ + บรรทัดล่าง) เป็นลิงก์ไปหน้า "บัญชีของฉัน" ตรง ๆ
 *
 * เดิมเป็นปุ่มเด้งเมนู (บัญชีของฉัน + สถานะ 2FA) แต่ดูไม่ออกว่ากดได้ และของข้างในมีแค่สองอย่าง
 * ที่หน้า /account มีครบอยู่แล้ว จึงเปลี่ยนเป็นลิงก์มีลูกศร › บอกว่าพาไปหน้าอื่น
 *
 * ยังไม่เปิด 2FA = บรรทัดล่างเปลี่ยนเป็น "ยังไม่เปิด 2FA" สีเหลือง + จุดบน avatar และลิงก์ไปที่แถว 2FA
 * เลย — เรื่องความปลอดภัยต้องเห็นได้โดยไม่ต้องคลิก (ตอนย่อเมนูเหลือแค่จุด)
 *
 * ปุ่มออกจากระบบ **ไม่อยู่ที่นี่** — อยู่เป็นปุ่มวงกลมข้างกระดิ่งบนแถบบนขวา (ดู LogoutButton)
 * เพราะของเดิมที่ซ่อนในเมนูนี้ผู้ใช้หาไม่เจอ ห้ามย้ายกลับมา
 */
export function UserMenu({ collapsed }: Readonly<{ collapsed: boolean }>) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return null;
  const twoFactorOff = !user.twoFactorEnabled;
  const active = location.pathname === "/account";
  const subtitle = twoFactorOff ? "ยังไม่เปิด 2FA" : (user.jobTitle ?? ROLE_LABEL[user.role]);

  return (
    <Link
      to={twoFactorOff ? "/account#two-factor" : "/account"}
      aria-current={active ? "page" : undefined}
      title={collapsed ? `${user.fullName} · ${subtitle}` : "บัญชีของฉัน"}
      className={`group flex w-full items-center rounded-md transition-colors hover:bg-slate-100 ${
        active ? "bg-slate-100" : ""
      } ${collapsed ? "justify-center px-0 py-2" : "gap-2.5 px-2 py-2 text-left"}`}
    >
      <span className="relative shrink-0">
        <Avatar name={user.fullName} src={user.avatarUrl} size={32} />
        {twoFactorOff && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" aria-hidden />
        )}
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-800">{user.fullName}</span>
            <span className={`block truncate text-xs ${twoFactorOff ? "font-medium text-amber-700" : "text-slate-500"}`}>
              {subtitle}
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600" />
        </>
      )}
    </Link>
  );
}
