import { Loader2, MailCheck, User } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { AuthCard } from "../components/AuthCard";
import { FloatingField } from "../components/FloatingField";
import { ApiError } from "../lib/api";
import { requestStaffPasswordReset } from "../lib/password-reset-api";

/**
 * ลืมรหัสผ่าน (ฝั่งพนักงาน) — กรอกชื่อผู้ใช้ ระบบส่งลิงก์ตั้งรหัสใหม่ไปที่อีเมลที่ยืนยันแล้วของบัญชีนั้น
 *
 * ผลลัพธ์บอกเหมือนกันทุกกรณี ไม่บอกว่าชื่อผู้ใช้มีจริงหรือไม่ หรือมีอีเมลไหม (กันคนไล่เดาบัญชี)
 * จึงต้องบอกทางออกไว้ในข้อความเดียวกัน: ไม่ได้รับเมล = ยังไม่ได้ยืนยันอีเมล → ติดต่อเจ้าของระบบ
 */
export function ForgotPasswordPage() {
  const location = useLocation();
  // ชื่อที่พิมพ์ค้างไว้ในหน้าเข้าสู่ระบบ ส่งมาทาง state (ไม่ใส่ใน URL)
  const [username, setUsername] = useState((location.state as { username?: string } | null)?.username ?? "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await requestStaffPasswordReset(username.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ส่งคำขอไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <AuthCard title="ตรวจอีเมลของคุณ">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <MailCheck size={24} aria-hidden />
          </span>
          <p className="text-sm text-slate-600">
            ถ้าชื่อผู้ใช้ <span className="font-medium text-slate-800">{username.trim()}</span> มีอีเมลที่ยืนยันไว้แล้ว
            เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลนั้น — ใช้ได้ภายใน 30 นาที
          </p>
          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
            ไม่ได้รับภายในไม่กี่นาที ดูในกล่องจดหมายขยะก่อน · ถ้ายังไม่เคยยืนยันอีเมลในหน้าบัญชีของฉัน
            ให้ติดต่อเจ้าของระบบเพื่อรีเซ็ตรหัสให้
          </p>
        </div>
        <Link to="/login" className="text-center text-sm font-medium text-brand hover:underline">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="ลืมรหัสผ่าน">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-center text-sm text-slate-500">กรอกชื่อผู้ใช้ เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลของบัญชีนั้น</p>
        <FloatingField
          id="forgot-username"
          label="ชื่อผู้ใช้"
          type="text"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={setUsername}
          icon={<User size={18} />}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={sending || !username.trim()}
          className="flex h-11 items-center justify-center gap-2 rounded-md bg-slate-800 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-60"
        >
          {sending && <Loader2 size={16} className="animate-spin" aria-hidden />}
          ส่งลิงก์ตั้งรหัสผ่านใหม่
        </button>
        <Link to="/login" className="text-center text-sm text-slate-500 hover:text-slate-800">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </form>
    </AuthCard>
  );
}
