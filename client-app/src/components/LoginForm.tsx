import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { EyeIcon, EyeOffIcon, FieldAdornment, MailIcon } from "./FieldIcons";
import { FormAlert } from "./FormAlert";
import { CapsLockHint } from "./PasswordHints";
import { WaveField } from "./WaveField";
import { ApiError, useAuth } from "../lib/auth-context";
import { forgetLastEmail } from "../lib/last-email";
import { describeFailure, isRetryable, type Failure } from "../lib/request-failure";
import { returnPathFrom } from "../lib/return-to";
import { useCapsLock } from "../lib/use-caps-lock";

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
function submitLabel(submitting: boolean, waitRemaining: number | null): string {
  if (submitting) return "กำลังเข้าสู่ระบบ...";
  if (waitRemaining != null) return `ลองใหม่ได้ในอีก ${formatCountdown(waitRemaining)}`;
  return "เข้าสู่ระบบ";
}

// ล้างอีเมลที่ฟีเจอร์ "จำอีเมลล่าสุด" (ถอดออก 16 ต.ค.) เคยเก็บไว้ในเครื่อง — ครั้งเดียวต่อการโหลดหน้า
forgetLastEmail();

/*
 * เตือนก่อนบัญชีถูกล็อก (ข้อ C — ผู้ใช้สั่งทำ 18 ต.ค.)
 *
 * นับที่เบราว์เซอร์ ไม่ใช่ที่บัญชี: เครื่องนี้กดเข้าสู่ระบบแล้วถูกปฏิเสธเพราะอีเมล/รหัสผ่านไม่ตรงมากี่ครั้ง
 * ครบ 3 ครั้งขึ้นคำเตือนกลาง ๆ + ดันปุ่มตั้งรหัสผ่านใหม่ให้เด่น · **ห้ามบอกจำนวนครั้งที่เหลือ** — ตัวนับของ
 * เซิร์ฟเวอร์มีเฉพาะบัญชีที่มีจริง เอามาโชว์ = บอกได้ว่าอีเมลไหนเป็นลูกค้าเรา (กฎ "ห้ามบอกว่าอีเมลไหนมีบัญชี")
 * ตัวเลขนี้เท่ากันทุกอีเมลและเป็นจำนวนที่คนกดเอง จึงไม่บอกอะไรใหม่ · เก็บใน sessionStorage (ปิดแท็บ = เริ่มใหม่)
 */
const WARN_AFTER_REJECTS = 3;
const REJECTS_KEY = "loginRejects";

/** รายละเอียดใต้ข้อความผิดพลาด: ติดล็อก = นับถอยหลัง · ผิดหลายครั้ง = เตือนก่อนล็อก + ทางไปตั้งรหัสใหม่ */
function failureDetail(waitRemaining: number | null, warnLock: boolean) {
  if (waitRemaining != null) {
    return <p className="font-semibold tabular-nums">ลองใหม่ได้ในอีก {formatCountdown(waitRemaining)}</p>;
  }
  if (!warnLock) return undefined;
  return (
    <div className="mt-1 flex flex-col items-start gap-2">
      <p>กรอกผิดหลายครั้งแล้ว ถ้ายังผิดอีก บัญชีอาจถูกล็อกชั่วคราว — จำรหัสไม่ได้ ตั้งรหัสใหม่ได้เลย</p>
      <Link
        to="/forgot-password"
        className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-medium text-brand shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 lg:min-h-9"
      >
        ตั้งรหัสผ่านใหม่
      </Link>
    </div>
  );
}

function readRejects(): number {
  try {
    const n = Number(sessionStorage.getItem(REJECTS_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeRejects(n: number): void {
  try {
    if (n > 0) sessionStorage.setItem(REJECTS_KEY, String(n));
    else sessionStorage.removeItem(REJECTS_KEY);
  } catch {
    // โหมดส่วนตัว/บล็อกที่เก็บข้อมูล — ไม่มีคำเตือนก็ยังเข้าสู่ระบบได้ตามปกติ
  }
}

/**
 * ฟอร์มเข้าสู่ระบบ — เนื้อในฝั่งสว่างของการ์ดใบมีด (AuthBlade)
 *
 * onSuccess บอกหน้าแม่ว่าเพิ่งล็อกอินผ่าน เพื่อให้มันหยุดเด้งออกชั่วคราว: auth-context ตั้ง user
 * ทันทีที่เซิร์ฟเวอร์ตอบ ถ้าไม่กันไว้ ตัวกันหน้า "ล็อกอินแล้วห้ามอยู่หน้านี้" จะถอดฟอร์มทิ้งใน
 * เฟรมเดียวกัน เครื่องหมายถูกจะไม่มีวันถูกมองเห็น
 */
export function LoginForm({ onSuccess }: Readonly<{ onSuccess: () => void }>) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(() => params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // วินาทีที่เหลือก่อนลองใหม่ได้ — มาจาก retryAfter ของ 423 (บัญชีถูกล็อก) และ 429 (ยิงถี่เกิน)
  // null = ไม่ต้องรอ
  const [waitRemaining, setWaitRemaining] = useState<number | null>(null);
  const [success, setSuccess] = useState(false);
  const [rejects, setRejects] = useState(readRejects);
  const { capsOn, capsProps } = useCapsLock();

  // เดินนาฬิกาถอยหลังทีละวินาที พอถึง 0 ล้างสถานะให้ผู้ใช้ลองใหม่ได้
  useEffect(() => {
    if (waitRemaining == null) return;
    if (waitRemaining <= 0) {
      setWaitRemaining(null);
      setFailure(null);
      return;
    }
    const t = setTimeout(() => setWaitRemaining((s) => (s == null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [waitRemaining]);

  function handleFailure(err: unknown) {
    // สมัครไว้แต่ยังไม่ยืนยันอีเมล (403) → พาไปกรอกรหัสต่อเลย ไม่ใช่ทิ้งไว้กับข้อความ
    // ที่บอกว่าให้ไปยืนยันแต่ไม่บอกว่าไปยืนยันที่ไหน · เซิร์ฟเวอร์ตอบ 403 นี้เฉพาะตอน
    // รหัสผ่านถูกต้องแล้วเท่านั้น จึงไม่ใช่ช่องให้คนนอกไล่ถามว่าอีเมลไหนสมัครไว้
    if (err instanceof ApiError && err.status === 403) {
      navigate(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
      return true;
    }
    const next = describeFailure(err, "เข้าสู่ระบบไม่สำเร็จ");
    setFailure(next);
    // นับเฉพาะ "อีเมลหรือรหัสผ่านไม่ถูกต้อง" (401) — เน็ตหลุด/ระบบขัดข้อง/ถูกล็อกแล้ว ไม่ใช่การกรอกผิด
    if (err instanceof ApiError && err.status === 401) {
      const n = rejects + 1;
      setRejects(n);
      writeRejects(n);
    }
    // นับถอยหลังเฉพาะกรณีที่ "ต้องรอ" จริง ๆ — รหัสผ่านผิดกดใหม่ได้ทันที
    setWaitRemaining(
      (next.kind === "locked" || next.kind === "rateLimit") && next.retryAfter
        ? next.retryAfter
        : null,
    );
    return false;
  }

  /**
   * แยกออกจาก handler ของฟอร์มเพื่อให้ปุ่ม "ลองใหม่" ในกล่องแจ้งเตือนเรียกซ้ำได้
   * โดยผู้ใช้ไม่ต้องพิมพ์รหัสผ่านใหม่ (ค่ายังอยู่ใน state)
   */
  async function submit() {
    setFailure(null);
    setSubmitting(true);
    let ok = false;
    try {
      await login(email, password);
      ok = true;
      writeRejects(0);
      onSuccess();
      setSuccess(true);
      // กลับไปหน้าที่ตั้งใจเปิด (เช่น ลิงก์ใบเสนอราคาจากอีเมล) — ไม่มีก็หน้าแรก
      const returnTo = returnPathFrom(location.state);
      setTimeout(() => navigate(returnTo, { replace: true }), SUCCESS_HOLD_MS);
    } catch (err) {
      if (handleFailure(err)) return;
    } finally {
      // สำเร็จแล้วไม่ปลดปุ่ม ปล่อยให้ค้างสถานะ "สำเร็จ" จนกว่าจะเปลี่ยนหน้า
      if (!ok) setSubmitting(false);
    }
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit();
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-800">เข้าสู่ระบบ</h1>

      <WaveField
        id="login-email"
        label="อีเมล"
        type="email"
        required
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        trailing={
          <FieldAdornment>
            <MailIcon />
          </FieldAdornment>
        }
      />

      <div>
        <WaveField
          id="login-password"
          label="รหัสผ่าน"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          {...capsProps}
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
        <CapsLockHint on={capsOn} />
        {/* วางไว้ใต้ช่องรหัสผ่านตรงจุดที่คนนึกออกว่าจำไม่ได้พอดี ไม่ใช่ท้ายฟอร์ม */}
        <p className="mt-1.5 text-right text-sm">
          <Link
            to="/forgot-password"
            className="auth-link inline-flex min-h-11 items-center lg:min-h-0"
          >
            ลืมรหัสผ่าน?
          </Link>
        </p>
      </div>

      {failure && (
        <FormAlert
          kind={failure.kind}
          message={failure.message}
          detail={failureDetail(waitRemaining, failure.kind === "input" && rejects >= WARN_AFTER_REJECTS)}
          // ปุ่มลองใหม่มีเฉพาะตอนที่กดแล้วมีโอกาสสำเร็จโดยไม่ต้องแก้อะไร — รหัสผ่านผิด
          // ไม่มีปุ่มนี้ เพราะกดซ้ำด้วยรหัสเดิมก็ผิดเหมือนเดิม แถมนับเข้าโควตาล็อกบัญชี
          onRetry={isRetryable(failure.kind) && !submitting ? () => void submit() : undefined}
        />
      )}

      <button
        type="submit"
        disabled={submitting || waitRemaining != null}
        className={`auth-submit mt-2 flex items-center justify-center gap-2 rounded-full py-2.5 font-medium text-white transition-colors ${
          success ? "bg-emerald-600 disabled:opacity-100" : "bg-brand hover:bg-brand-dark disabled:opacity-50"
        }`}
      >
        {/* สำเร็จ = ปุ่มเขียว + ข้อความอย่างเดียว ไม่มีเครื่องหมายถูก (ผู้ใช้สั่งเอาออก 18 ต.ค.) */}
        {success ? (
          "เข้าสู่ระบบสำเร็จ"
        ) : (
          submitLabel(submitting, waitRemaining)
        )}
      </button>

      <p className="text-sm text-slate-500">
        ยังไม่มีบัญชี?{" "}
        <Link
          to="/register"
          className="auth-link inline-flex min-h-11 items-center lg:min-h-0"
        >
          สมัครสมาชิก
        </Link>
      </p>
    </form>
  );
}
