import { PASSWORD_HINT, passwordProblem } from "@systemboq/shared-types";
import { CircleCheck, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AuthCard } from "../components/AuthCard";
import { FloatingField } from "../components/FloatingField";
import { PasswordMatchHint, PasswordRules, PasswordStrengthBar, ThaiKeyboardHint } from "../components/PasswordHints";
import { ApiError } from "../lib/api";
import { inspectStaffResetToken, submitStaffPasswordReset } from "../lib/password-reset-api";

/**
 * ตั้งรหัสผ่านใหม่จากลิงก์ในอีเมล (ฝั่งพนักงาน)
 *
 * เปิดหน้า = ตรวจลิงก์อย่างเดียว ไม่เผาทิ้ง (โปรแกรมอ่านเมลชอบกดลิงก์ล่วงหน้าเอง) — ลิงก์ถูกใช้ตอนกดตั้งรหัส
 * ตั้งเสร็จไม่ล็อกอินให้ ต้องกลับไปเข้าระบบเองด้วยรหัสใหม่ (+ รหัส 2FA ถ้าเปิดไว้)
 */
export function ResetPasswordPage() {
  const { token = "" } = useParams();
  const [account, setAccount] = useState<{ maskedEmail: string; username: string | null } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    inspectStaffResetToken(token)
      .then(setAccount)
      .catch((err) => setLinkError(err instanceof ApiError ? err.message : "ลิงก์นี้ใช้ไม่ได้"));
  }, [token]);

  const personal = [account?.username];

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem =
      (!password && "กรอกรหัสผ่านใหม่") ||
      passwordProblem(password, personal) ||
      (confirm !== password && "ยืนยันรหัสผ่านไม่ตรงกัน") ||
      null;
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await submitStaffPasswordReset(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ตั้งรหัสผ่านไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (linkError) {
    return (
      <AuthCard title="ลิงก์ใช้ไม่ได้">
        <p className="text-center text-sm text-slate-600">{linkError}</p>
        <Link to="/forgot-password" className="text-center text-sm font-medium text-brand hover:underline">
          ขอลิงก์ใหม่
        </Link>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="ตั้งรหัสผ่านใหม่แล้ว">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <CircleCheck size={24} aria-hidden />
          </span>
          <p className="text-sm text-slate-600">
            ทุกเครื่องที่เคยเข้าระบบไว้ถูกออกจากระบบแล้ว — เข้าสู่ระบบใหม่ด้วยรหัสผ่านใหม่ได้เลย
          </p>
        </div>
        <Link
          to="/login"
          state={{ username: account?.username ?? undefined }}
          className="flex h-11 items-center justify-center rounded-md bg-slate-800 text-sm font-medium text-white hover:bg-slate-700"
        >
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="ตั้งรหัสผ่านใหม่">
      {!account ? (
        <div className="flex justify-center py-6 text-slate-400">
          <Loader2 className="animate-spin" aria-label="กำลังตรวจลิงก์" />
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-center text-sm text-slate-500">
            บัญชี <span className="font-medium text-slate-800">{account.username}</span>
            {account.maskedEmail && ` · ${account.maskedEmail}`}
          </p>
          {/* ให้ตัวจัดการรหัสผ่านของเบราว์เซอร์รู้ว่ารหัสใหม่เป็นของบัญชีไหน */}
          <input type="text" name="username" autoComplete="username" value={account.username ?? ""} readOnly hidden />
          <div>
            <FloatingField
              id="new-password"
              label="รหัสผ่านใหม่"
              type={show ? "text" : "password"}
              required
              autoComplete="new-password"
              value={password}
              onChange={(v) => {
                setPassword(v);
                setError(null);
              }}
              icon={<Lock size={18} />}
              trailing={
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  className="text-slate-400 hover:text-slate-500"
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
            />
            <ThaiKeyboardHint value={password} />
            <PasswordStrengthBar value={password} personal={personal} />
            <div className="mt-2">
              <PasswordRules value={password} personal={personal} show />
            </div>
          </div>
          <div>
            <FloatingField
              id="confirm-password"
              label="ยืนยันรหัสผ่านใหม่"
              type={show ? "text" : "password"}
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(v) => {
                setConfirm(v);
                setError(null);
              }}
              icon={<Lock size={18} />}
            />
            <PasswordMatchHint password={password} confirm={confirm} />
          </div>
          {/* บอกล่วงหน้าแบบเดียวกับฝั่งลูกค้า — คนที่เปิดค้างไว้อีกเครื่องจะได้ไม่งงว่าทำไมหลุด */}
          <p className="text-xs leading-relaxed text-slate-500">
            เมื่อตั้งรหัสผ่านใหม่แล้ว ทุกเครื่องที่เข้าสู่ระบบค้างไว้จะถูกออกจากระบบ
            และต้องเข้าสู่ระบบใหม่ด้วยรหัสที่เพิ่งตั้ง · ถ้าเปิดยืนยันตัวตน 2 ชั้นไว้ ยังต้องกรอกรหัสจากแอปตามปกติ
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            title={PASSWORD_HINT}
            className="flex h-11 items-center justify-center gap-2 rounded-md bg-slate-800 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-60"
          >
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}
            ตั้งรหัสผ่านใหม่
          </button>
        </form>
      )}
    </AuthCard>
  );
}
