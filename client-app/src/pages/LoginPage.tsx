import { useEffect, useState, type SubmitEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { AccountBenefits } from "../components/AccountBenefits";
import { AuthShell } from "../components/AuthShell";
import { CheckIcon, EyeIcon, EyeOffIcon } from "../components/FieldIcons";
import { WaveField } from "../components/WaveField";
import { ApiError, useAuth } from "../lib/auth-context";

/*
 * โชว์สถานะ "สำเร็จ" นานเท่านี้ก่อนเปลี่ยนหน้า
 * สั้นกว่านี้ไม่ได้ — ปุ่มไล่สีเป็นเขียวใช้ ~150ms และเครื่องหมายถูกเด้งใช้ 400ms
 * ถ้าเปลี่ยนหน้าที่ 450ms จะตัดพอดีตอนอนิเมชั่นเพิ่งจบ คนอ่านไม่ทันว่าเกิดอะไรขึ้น
 */
const SUCCESS_HOLD_MS = 650;

// วินาที → "MM:SS" สำหรับนับถอยหลังเวลาปลดล็อกบัญชี
function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** ข้อความบนปุ่มเข้าสู่ระบบตอนยังไม่สำเร็จ */
function submitLabel(submitting: boolean, lockRemaining: number | null): string {
  if (submitting) return "กำลังเข้าสู่ระบบ...";
  if (lockRemaining != null) return `ลองใหม่ได้ในอีก ${formatCountdown(lockRemaining)}`;
  return "เข้าสู่ระบบ";
}

export function LoginPage() {
  const { user, status, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // วินาทีที่เหลือจนกว่าบัญชีจะปลดล็อก (มาจาก retryAfter ของ 423) — null = ไม่ได้ถูกล็อก
  const [lockRemaining, setLockRemaining] = useState<number | null>(null);
  // เข้าสู่ระบบผ่านแล้ว กำลังโชว์เครื่องหมายถูกสั้น ๆ ก่อนพาไปหน้าถัดไป
  const [success, setSuccess] = useState(false);

  // เดินนาฬิกาถอยหลังทีละวินาที พอถึง 0 ล้างสถานะล็อกให้ผู้ใช้ลองใหม่ได้
  useEffect(() => {
    if (lockRemaining == null) return;
    if (lockRemaining <= 0) {
      setLockRemaining(null);
      setError(null);
      return;
    }
    const t = setTimeout(() => setLockRemaining((s) => (s == null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [lockRemaining]);

  /*
   * ผู้ที่ล็อกอินอยู่แล้วเปิดหน้านี้ = เด้งออกทันที
   * แต่ต้องยกเว้นช่วงที่เพิ่งล็อกอินสำเร็จ เพราะ login() ตั้ง user ทันทีที่เซิร์ฟเวอร์ตอบ
   * ถ้าไม่กันไว้ guard จะถอดหน้านี้ทิ้งในเฟรมเดียวกัน เครื่องหมายถูกจะไม่มีวันถูกมองเห็น
   */
  if (status === "ready" && user && !success) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    let ok = false;
    try {
      await login(email, password);
      // โชว์ว่าสำเร็จก่อนสั้น ๆ แล้วค่อยเปลี่ยนหน้า — เดิมจอตัดไปหน้าใหม่ทันทีจนไม่รู้ว่ากดติดหรือเปล่า
      ok = true;
      setSuccess(true);
      setTimeout(() => navigate("/", { replace: true }), SUCCESS_HOLD_MS);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
      // ถูกล็อกชั่วคราว (423) → เริ่มนับถอยหลังจากวินาทีที่เซิร์ฟเวอร์บอก
      if (err instanceof ApiError && err.status === 423 && err.retryAfter) {
        setLockRemaining(err.retryAfter);
      } else {
        setLockRemaining(null);
      }
    } finally {
      // สำเร็จแล้วไม่ปลดปุ่ม ปล่อยให้ค้างสถานะ "สำเร็จ" จนกว่าจะเปลี่ยนหน้า
      if (!ok) setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="auth-card grid w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-xl md:grid-cols-2">
        {/* แผงบอกประโยชน์ — บนมือถือเลื่อนไปอยู่ใต้ฟอร์ม (order-2) เพื่อให้คนล็อกอินซ้ำเจอฟอร์มก่อน */}
        <div className="auth-aside order-2 flex items-center border-t border-slate-100 bg-slate-50 p-8 md:order-1 md:border-t-0 md:border-r">
          <AccountBenefits />
        </div>
        <form
          onSubmit={handleSubmit}
          className="auth-form order-1 flex flex-col gap-4 p-8 md:order-2"
        >
          <h1 className="text-xl font-semibold text-slate-800 text-center">เข้าสู่ระบบ</h1>

        <WaveField
          id="login-email"
          label="อีเมล"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <WaveField
          id="login-password"
          label="รหัสผ่าน"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              title={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-slate-600"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          }
        />

        {lockRemaining != null ? (
          // สถานะป้องกันชั่วคราว — โทนเหลือง/ส้ม + ไอคอนนาฬิกา (ไม่ใช่แดงแบบ error) พร้อมนับถอยหลัง
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 h-4.5 w-4.5 shrink-0"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <div className="space-y-0.5">
              <p>{error ?? "บัญชีถูกล็อกชั่วคราวเนื่องจากพยายามเข้าสู่ระบบผิดหลายครั้ง"}</p>
              <p className="font-semibold tabular-nums">
                ลองใหม่ได้ในอีก {formatCountdown(lockRemaining)} นาที
              </p>
            </div>
          </div>
        ) : (
          error && <p className="text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || lockRemaining != null}
          className={`mt-2 flex items-center justify-center gap-2 rounded py-2 font-medium text-white transition-colors ${
            success
              ? "bg-emerald-600 disabled:opacity-100"
              : "bg-slate-800 disabled:opacity-50"
          }`}
        >
          {success ? (
            <>
              <CheckIcon className="check-pop h-5 w-5" />
              เข้าสู่ระบบสำเร็จ
            </>
          ) : (
            submitLabel(submitting, lockRemaining)
          )}
        </button>

          <p className="text-sm text-center text-slate-500">
            ยังไม่มีบัญชี?{" "}
            <Link to="/register" className="inline-flex min-h-11 items-center text-slate-800 underline lg:min-h-0">
              สมัครสมาชิก
            </Link>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
