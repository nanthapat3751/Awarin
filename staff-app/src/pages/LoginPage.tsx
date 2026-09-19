import { Check, Clock, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, Smartphone } from "lucide-react";
import { useEffect, useState, type SubmitEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { FloatingField } from "../components/FloatingField";
import { OtpInput } from "../components/OtpInput";
import { ApiError, useAuth } from "../lib/auth-context";

// จัดรูปรหัสสำรองเป็น XXXX-XXXX อัตโนมัติระหว่างพิมพ์ (ใส่ขีดหลังตัวที่ 4, ตัดเหลือ 8 ตัว)
function formatBackupCode(raw: string): string {
  const clean = raw
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/*
 * โชว์สถานะ "สำเร็จ" นานเท่านี้ก่อนเปลี่ยนหน้า (ขั้นรหัสผ่านที่ไม่ต้องใช้ 2FA)
 * สั้นกว่านี้จะตัดหน้าพอดีตอนปุ่มเพิ่งไล่สีเขียวเสร็จ — สั้นกว่าจอ "ยืนยันสำเร็จ" ของ 2FA (900ms)
 * เพราะขั้นตอนนี้เบากว่า ไม่ได้ผ่านการยืนยันสองชั้น
 */
const SUCCESS_HOLD_MS = 650;

// วินาที → "MM:SS" สำหรับนับถอยหลังเวลาปลดล็อกบัญชี
function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function submitLabel(submitting: boolean, lockRemaining: number | null): string {
  if (submitting) return "กำลังเข้าสู่ระบบ...";
  if (lockRemaining != null) return `ลองใหม่ได้ในอีก ${formatCountdown(lockRemaining)}`;
  return "เข้าสู่ระบบ";
}

/** ข้อความใต้ช่องรหัสผ่าน: ถูกล็อกชั่วคราว (เหลือง + นับถอยหลัง) · ผิดธรรมดา (แดง) · ไม่มี */
function CredentialsAlert({
  lockRemaining,
  error,
}: Readonly<{ lockRemaining: number | null; error: string | null }>) {
  if (lockRemaining != null) {
    // สถานะป้องกันชั่วคราว — ใช้โทนเหลือง/ส้ม + ไอคอนนาฬิกา (ไม่ใช่แดงแบบ error) พร้อมนับถอยหลัง
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
        <Clock size={18} className="mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p>{error ?? "บัญชีถูกล็อกชั่วคราวเนื่องจากพยายามเข้าสู่ระบบผิดหลายครั้ง"}</p>
          <p className="font-semibold tabular-nums">ลองใหม่ได้ในอีก {formatCountdown(lockRemaining)} นาที</p>
        </div>
      </div>
    );
  }
  return error ? <p className="text-sm text-red-600">{error}</p> : null;
}

function CredentialsSubmit({
  loginSuccess,
  submitting,
  lockRemaining,
}: Readonly<{ loginSuccess: boolean; submitting: boolean; lockRemaining: number | null }>) {
  return (
    <button
      type="submit"
      disabled={submitting || lockRemaining != null}
      className={`mt-2 flex items-center justify-center gap-2 rounded-md py-2 font-medium text-white transition-all duration-200 motion-reduce:transition-none motion-safe:hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:shadow disabled:hover:translate-y-0 disabled:hover:shadow-none ${
        loginSuccess
          ? "bg-emerald-600 disabled:opacity-100 disabled:hover:bg-emerald-600"
          : "bg-slate-800 hover:bg-brand disabled:opacity-60 disabled:hover:bg-slate-800"
      }`}
    >
      {loginSuccess ? (
        <>
          <Check size={18} strokeWidth={2.6} className="check-pop" />
          <span>เข้าสู่ระบบสำเร็จ</span>
        </>
      ) : (
        <>
          {submitting && <Loader2 size={16} className="animate-spin" />}
          {submitLabel(submitting, lockRemaining)}
        </>
      )}
    </button>
  );
}

function VerifySuccess() {
  return (
    <div className="flex flex-col items-center gap-2 py-6">
      <div className="check-pop flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <Check size={34} strokeWidth={2.5} />
      </div>
      <p className="text-lg font-semibold text-slate-800">ยืนยันสำเร็จ</p>
      <p className="text-sm text-slate-500">กำลังเข้าสู่ระบบ...</p>
    </div>
  );
}

/** ขั้นที่ 2: กรอกรหัสจากแอป (OTP 6 ช่อง) หรือรหัสสำรอง XXXX-XXXX + ปุ่มสลับโหมด/ย้อนกลับ */
function TwoFactorFields({
  mode,
  code,
  backupCode,
  error,
  submitting,
  onCode,
  onBackupCode,
  onComplete,
  onToggleMode,
  onBack,
}: Readonly<{
  mode: "app" | "backup";
  code: string;
  backupCode: string;
  error: string | null;
  submitting: boolean;
  onCode: (v: string) => void;
  onBackupCode: (v: string) => void;
  onComplete: (v: string) => void;
  onToggleMode: () => void;
  onBack: () => void;
}>) {
  const isApp = mode === "app";
  const incomplete = isApp ? code.length < 6 : backupCode.replaceAll(/[^A-Za-z0-9]/g, "").length < 8;
  return (
    <>
      <p className="text-xs font-medium text-slate-400 text-center -mb-2">ขั้นที่ 2 จาก 2</p>
      <h1 className="text-xl font-semibold text-slate-800 text-center">ยืนยันตัวตน 2 ชั้น</h1>
      <p className="text-sm text-slate-500 text-center -mt-2">
        {isApp ? "กรอกรหัส 6 หลักจากแอป Authenticator" : "กรอกรหัสสำรองหนึ่งชุด"}
      </p>

      {isApp ? (
        <OtpInput
          value={code}
          onChange={onCode}
          onComplete={onComplete}
          disabled={submitting}
          status={error ? "error" : "default"}
          autoFocus
        />
      ) : (
        <FloatingField
          id="backupCode"
          label="รหัสสำรอง"
          autoFocus
          autoComplete="one-time-code"
          value={backupCode}
          onChange={onBackupCode}
          icon={<KeyRound size={18} />}
          inputClassName="font-mono uppercase tracking-wider"
        />
      )}

      {error ? (
        <p className="text-sm text-red-600 text-center">{error}</p>
      ) : (
        <p className="text-xs text-slate-400 text-center">
          {isApp ? "รหัสในแอปเปลี่ยนทุก 30 วินาที" : "รหัสสำรองใช้ได้ครั้งเดียวต่อชุด"}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || incomplete}
        className="mt-1 flex items-center justify-center gap-2 rounded-md bg-slate-800 py-2 font-medium text-white transition-all duration-200 motion-reduce:transition-none motion-safe:hover:-translate-y-0.5 hover:bg-brand hover:shadow-lg active:translate-y-0 active:shadow disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-slate-800 disabled:hover:shadow-none"
      >
        {submitting && <Loader2 size={16} className="animate-spin" />}
        {submitting ? "กำลังตรวจสอบ..." : "ยืนยัน"}
      </button>

      <button
        type="button"
        onClick={onToggleMode}
        className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-brand hover:text-brand-dark"
      >
        {isApp ? <KeyRound size={14} /> : <Smartphone size={14} />}
        <span className="underline underline-offset-2">{isApp ? "ใช้รหัสสำรองแทน" : "ใช้รหัสจากแอปแทน"}</span>
      </button>

      <button type="button" onClick={onBack} className="-mt-1 text-sm text-slate-400 hover:text-slate-500">
        ← ย้อนกลับไปหน้าเข้าสู่ระบบ
      </button>
    </>
  );
}

export function LoginPage() {
  const { user, status, login, verifyTwoFactor, commitUser } = useAuth();
  const navigate = useNavigate();
  // ผ่านรหัสผ่านแล้วและไม่ต้องใช้ 2FA — โชว์เครื่องหมายถูกสั้น ๆ ก่อนพาเข้าระบบ
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [step, setStep] = useState<"credentials" | "twofactor">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  // ยืนยัน 2FA สำเร็จแล้ว → โชว์เครื่องหมายถูกสั้น ๆ ก่อนพาเข้าระบบ (ให้เห็นว่าระบบตรวจแล้วถูกต้อง)
  const [verifySuccess, setVerifySuccess] = useState(false);
  // โหมดขั้นที่ 2: "app" = รหัสจากแอป (OTP 6 ช่อง), "backup" = รหัสสำรอง XXXX-XXXX
  const [twoFaMode, setTwoFaMode] = useState<"app" | "backup">("app");
  const [backupCode, setBackupCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // วินาทีที่เหลือจนกว่าบัญชีจะปลดล็อก (มาจาก retryAfter ของ 423) — null = ไม่ได้ถูกล็อก
  const [lockRemaining, setLockRemaining] = useState<number | null>(null);

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

  // session ของแอปลูกค้าที่แชร์ผ่าน auth cookie ร่วมกัน นับว่า "ล็อกอินแล้ว" ที่นี่ แต่ไม่ใช่
  // บัญชีพนักงาน — ต้องไม่เด้งกลับไป "/" ไม่งั้นจะไปตีกับ redirect ของ ProtectedRoute ที่พากลับ
  // มาที่นี่ ขณะที่การ logout ของ session นั้นยังทำงานค้างอยู่ (เกิดลูป redirect ไม่รู้จบระหว่าง
  // "/" กับ "/login")
  const isStaff = user?.role === "OWNER" || user?.role === "ADMIN";
  /*
   * คนที่ล็อกอินอยู่แล้วเปิดหน้านี้ = เด้งออกทันที
   * ยกเว้นช่วงที่เพิ่งผ่านรหัสผ่าน เพราะ login() ตั้ง user ทันทีที่เซิร์ฟเวอร์ตอบ ถ้าไม่กันไว้
   * guard จะถอดหน้านี้ทิ้งในเฟรมเดียวกัน เครื่องหมายถูกจะไม่มีวันถูกมองเห็น
   * (ทาง 2FA ไม่เจอปัญหานี้เพราะเลื่อน commitUser ไปหลังอนิเมชั่นอยู่แล้ว)
   */
  if (status === "ready" && isStaff && !loginSuccess) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    let ok = false;
    try {
      const { twoFactorRequired } = await login(email, password);
      if (twoFactorRequired) {
        setStep("twofactor");
        setCode("");
        setBackupCode("");
        setTwoFaMode("app");
        setVerifySuccess(false);
      } else {
        ok = true;
        setLoginSuccess(true);
        setTimeout(() => navigate("/", { replace: true }), SUCCESS_HOLD_MS);
      }
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

  async function submit2fa(value: string) {
    const v = value.trim();
    if (!v || submitting || verifySuccess) return;
    setError(null);
    setSubmitting(true);
    try {
      const authedUser = await verifyTwoFactor(v);
      // สำเร็จ → โชว์เครื่องหมายถูก ~0.75 วิ ให้เห็นชัดว่าตรวจแล้วถูกต้อง แล้วค่อย commit user + เข้าระบบ
      // (commit ทีหลังเพื่อไม่ให้ guard <Navigate> เด้งออกก่อนอนิเมชั่นจบ; ไม่รีเซ็ต submitting)
      setVerifySuccess(true);
      setTimeout(() => {
        commitUser(authedUser);
        navigate("/", { replace: true });
      }, 900);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "รหัสยืนยันไม่ถูกต้อง");
      setSubmitting(false);
      // เคลียร์รหัสจากแอปให้กรอกใหม่หลังโชว์แดง+สั่นชั่วครู่ (รหัสสำรองปล่อยไว้ให้แก้เอง)
      if (twoFaMode === "app") setTimeout(() => setCode(""), 450);
    }
  }

  function handleVerify(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    submit2fa(twoFaMode === "app" ? code : backupCode);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-slate-900 bg-cover bg-center px-4"
      style={{
        // เคลือบสีเข้มทับรูปภาพ เพื่อให้กล่องขาวและตัวอักษรของมันยังอ่านออกได้บนรูปทุกแบบ
        backgroundImage:
          "linear-gradient(rgba(15,23,42,0.55), rgba(15,23,42,0.55)), url('/web10.jpg')",
      }}
    >
      {step === "credentials" ? (
        <form
          onSubmit={handleSubmit}
          className="login-card w-full max-w-sm bg-white rounded-lg shadow-xl p-8 flex flex-col gap-4"
        >
          <img
            src="/logo-white-removed.png"
            alt="Awarin Engineering"
            className="h-20 w-auto mx-auto"
          />
          <h1 className="text-xl font-semibold text-slate-800 text-center">
            เข้าสู่ระบบ — ฝั่งบริษัท
          </h1>

          <FloatingField
            id="email"
            label="อีเมล"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={setEmail}
            icon={<Mail size={18} />}
          />

          <FloatingField
            id="password"
            label="รหัสผ่าน"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            icon={<Lock size={18} />}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                title={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                className="text-slate-400 transition-colors hover:text-slate-500"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
          />

          <CredentialsAlert lockRemaining={lockRemaining} error={error} />

          <CredentialsSubmit loginSuccess={loginSuccess} submitting={submitting} lockRemaining={lockRemaining} />
        </form>
      ) : (
        <form
          onSubmit={handleVerify}
          className="login-card w-full max-w-sm bg-white rounded-lg shadow-xl p-8 flex flex-col gap-4"
        >
          <img
            src="/logo-white-removed.png"
            alt="Awarin Engineering"
            className="h-16 w-auto mx-auto"
          />
          {verifySuccess ? (
            <VerifySuccess />
          ) : (
            <TwoFactorFields
              mode={twoFaMode}
              code={code}
              backupCode={backupCode}
              error={error}
              submitting={submitting}
              onCode={(v) => {
                setCode(v);
                if (error) setError(null);
              }}
              onBackupCode={(v) => {
                setBackupCode(formatBackupCode(v));
                if (error) setError(null);
              }}
              onComplete={(v) => submit2fa(v)}
              onToggleMode={() => {
                setTwoFaMode((m) => (m === "app" ? "backup" : "app"));
                setError(null);
                setCode("");
                setBackupCode("");
              }}
              onBack={() => {
                setStep("credentials");
                setError(null);
                setPassword("");
                setCode("");
                setBackupCode("");
                setTwoFaMode("app");
                setVerifySuccess(false);
              }}
            />
          )}
        </form>
      )}
    </div>
  );
}
