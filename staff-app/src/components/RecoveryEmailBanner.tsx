import { Mail, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "../lib/auth-context";

const DISMISS_KEY = "recoveryEmailBannerDismissed";

/**
 * แถบเตือนบนสุดเมื่อบัญชียังไม่มีอีเมลกู้รหัสผ่านที่ยืนยันแล้ว — ลืมรหัสแล้วกู้เองไม่ได้
 * ปิดได้ (จำในแท็บนี้จนปิดเบราว์เซอร์) ไม่ขึ้นในหน้าบัญชีของฉัน เพราะแถวตั้งค่าอยู่ตรงนั้นแล้ว
 */
export function RecoveryEmailBanner() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (!user || user.emailVerified || dismissed || pathname.startsWith("/account")) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // เก็บไม่ได้ (โหมดส่วนตัว) — ปิดเฉพาะหน้านี้ก็พอ
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900">
      <Mail size={16} className="shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        {user.email ? "ยังไม่ได้ยืนยันอีเมลกู้รหัสผ่าน" : "ยังไม่ได้ตั้งอีเมลกู้รหัสผ่าน"} — ถ้าลืมรหัสจะขอลิงก์ตั้งรหัสใหม่เองไม่ได้
      </p>
      <Link
        to="/account#recovery-email"
        className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
      >
        {user.email ? "ยืนยันอีเมล" : "ตั้งอีเมลตอนนี้"}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="ปิดแถบเตือนนี้"
        className="shrink-0 rounded p-1 text-amber-700 hover:bg-amber-100"
      >
        <X size={15} />
      </button>
    </div>
  );
}
