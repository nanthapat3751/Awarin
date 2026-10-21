import { PASSWORD_HINT, passwordProblem } from "@systemboq/shared-types";
import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AuthShell } from "../components/AuthShell";
import { CheckIcon, EyeIcon, EyeOffIcon } from "../components/FieldIcons";
import { FormAlert } from "../components/FormAlert";
import {
  CapsLockHint,
  PasswordMatchHint,
  PasswordRules,
  PasswordStrengthBar,
  ThaiKeyboardHint,
} from "../components/PasswordHints";
import { PrivacyNote } from "../components/PrivacyNote";
import { WaveField } from "../components/WaveField";
import { apiFetch } from "../lib/api";
import { useCapsLock } from "../lib/use-caps-lock";
import {
  describeFailure,
  inputFailure,
  isRetryable,
  type Failure,
} from "../lib/request-failure";
import { usePageMeta } from "../lib/page-meta";

/**
 * ตั้งรหัสผ่านใหม่จากลิงก์ในอีเมล
 *
 * **ตั้งเสร็จแล้วยังไม่ได้เข้าระบบ** เซิร์ฟเวอร์ตั้งใจไม่ออก session ให้ที่ปลายทางนี้ คนที่อ่าน
 * อีเมลได้จึงไม่ได้ session ติดมือฟรี ๆ จากการกดลิงก์ และการบังคับล็อกอินอีกครั้งก็เป็นการยืนยัน
 * ว่ารหัสใหม่ใช้ได้จริง
 *
 * การเปิดหน้านี้ (GET) แค่ตรวจว่าลิงก์ยังใช้ได้ **ไม่เผาลิงก์ทิ้ง** เพราะโปรแกรมอ่านอีเมลกับตัวสแกน
 * ความปลอดภัยหลายตัวกดลิงก์ล่วงหน้าเอง ถ้าเผาตั้งแต่เปิด ลูกค้าจะเจอลิงก์ตายก่อนได้แตะด้วยซ้ำ
 */

/** ค้างสถานะสำเร็จไว้ก่อนพาไปหน้าเข้าสู่ระบบ — จังหวะเดียวกับหน้าเข้าสู่ระบบ */
const SUCCESS_HOLD_MS = 900;

/**
 * `unusable` เก็บ Failure ทั้งก้อน ไม่ใช่แค่ข้อความ — เพราะ "ลิงก์หมดอายุ" กับ "โหลดไม่สำเร็จ
 * เพราะเน็ตหลุด" ต้องพาผู้ใช้ไปคนละทาง: อย่างแรกต้องขอลิงก์ใหม่ อย่างหลังแค่กดโหลดซ้ำ
 *
 * ของเดิมยุบทั้งสองกรณีเป็นข้อความเดียวว่า "ลิงก์นี้ใช้ไม่ได้แล้วหรือหมดอายุ" — ลูกค้าที่ถือลิงก์
 * ที่ยังใช้ได้อยู่แต่เน็ตสะดุด จะถูกบอกว่าลิงก์ตาย แล้วไปขอใบใหม่ซึ่งเผาใบเดิมทิ้งฟรี ๆ
 */
type Status =
  | { kind: "checking" }
  | { kind: "unusable"; failure: Failure }
  | { kind: "ready"; maskedEmail: string };

/** ลิงก์ใช้ไม่ได้ — โหลดไม่ผ่านเพราะเครือข่าย/เซิร์ฟเวอร์ = ลิงก์อาจยังดีอยู่ ห้ามบอกให้ไปขอใบใหม่ */
function UnusableLink({ failure, onRetry }: Readonly<{ failure: Failure; onRetry: () => void }>) {
  const reachable = !isRetryable(failure.kind);
  const buttonClass =
    "auth-submit mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-dark";
  return (
    <AuthShell>
      <div className="auth-card w-full max-w-md rounded-2xl border border-slate-200 bg-paper p-8 text-center shadow-card">
        <h1 className="text-xl font-semibold text-slate-800">{reachable ? "ลิงก์ใช้ไม่ได้" : "เปิดลิงก์ไม่ได้ในขณะนี้"}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{failure.message}</p>
        {reachable ? (
          <Link to="/forgot-password" className={buttonClass}>
            ขอลิงก์ใหม่
          </Link>
        ) : (
          <button type="button" onClick={onRetry} className={buttonClass}>
            ลองเปิดลิงก์อีกครั้ง
          </button>
        )}
      </div>
    </AuthShell>
  );
}

function SubmitLabel({ done, submitting }: Readonly<{ done: boolean; submitting: boolean }>) {
  if (!done) return submitting ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่";
  return (
    <>
      <CheckIcon className="check-pop h-5 w-5" />
      <span>ตั้งรหัสผ่านใหม่แล้ว</span>
    </>
  );
}

export function ResetPasswordPage() {
  usePageMeta("ตั้งรหัสผ่านใหม่");
  const { token = "" } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState<Status>({ kind: "checking" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { capsOn, capsProps } = useCapsLock();

  // เพิ่มค่านี้เพื่อสั่งให้ตรวจลิงก์ใหม่อีกรอบ (ปุ่ม "ลองใหม่" ตอนโหลดไม่สำเร็จ)
  const [reloadAt, setReloadAt] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus({ kind: "checking" });
    apiFetch<{ maskedEmail: string }>(
      `/api/auth/customer/reset-password/${encodeURIComponent(token)}`,
    )
      .then((info) => alive && setStatus({ kind: "ready", maskedEmail: info.maskedEmail }))
      .catch((err: unknown) => {
        if (!alive) return;
        setStatus({
          kind: "unusable",
          failure: describeFailure(err, "ลิงก์นี้ใช้ไม่ได้แล้วหรือหมดอายุ"),
        });
      });
    return () => {
      alive = false;
    };
  }, [token, reloadAt]);

  async function submit() {
    setFailure(null);
    // กฎชุดเดียวกับเซิร์ฟเวอร์ · หน้านี้ไม่รู้ชื่อ/เบอร์ของเจ้าของบัญชี (รู้แค่อีเมลแบบปิดบัง)
    // ข้อ "ห้ามมีข้อมูลตัวเองในรหัส" จึงตรวจได้ที่เซิร์ฟเวอร์ฝ่ายเดียว — ข้อความที่ตีกลับมา
    // เป็นชุดเดียวกัน คนจึงอ่านเข้าใจได้เหมือนกันทั้งสองทาง
    const passwordIssue = passwordProblem(password);
    if (passwordIssue !== null) {
      setFailure(inputFailure(passwordIssue));
      return;
    }
    if (password !== confirm) {
      setFailure(inputFailure("รหัสผ่านทั้งสองช่องไม่ตรงกัน"));
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/auth/customer/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), SUCCESS_HOLD_MS);
    } catch (err) {
      setFailure(describeFailure(err, "ตั้งรหัสผ่านไม่สำเร็จ"));
      setSubmitting(false);
    }
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit();
  }

  if (status.kind === "checking") {
    return (
      <AuthShell>
        <p className="text-slate-400">กำลังตรวจสอบลิงก์...</p>
      </AuthShell>
    );
  }

  if (status.kind === "unusable") {
    return <UnusableLink failure={status.failure} onRetry={() => setReloadAt((n) => n + 1)} />;
  }

  return (
    <AuthShell note={<PrivacyNote />}>
      <div className="auth-card w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-paper p-8 shadow-card">
        <form onSubmit={handleSubmit} className="auth-form flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">ตั้งรหัสผ่านใหม่</h1>
            <p className="mt-1 text-sm text-slate-500">
              สำหรับบัญชี{" "}
              <span className="font-medium text-slate-700">{status.maskedEmail}</span>
            </p>
          </div>

          <div>
            <WaveField
              id="reset-password"
              label="รหัสผ่านใหม่"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={PASSWORD_HINT}
              autoFocus
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
            <ThaiKeyboardHint value={password} />
            <PasswordStrengthBar value={password} />
            {/* ช่องนี้โฟกัสเองตอนเปิดหน้า — โชว์กฎตั้งแต่แรก */}
            <PasswordRules value={password} show />
          </div>

          <div>
            <WaveField
              id="reset-confirm"
              label="ยืนยันรหัสผ่านอีกครั้ง"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <PasswordMatchHint password={password} confirm={confirm} />
          </div>

          {failure && (
            <FormAlert
              kind={failure.kind}
              message={failure.message}
              onRetry={isRetryable(failure.kind) && !submitting ? () => void submit() : undefined}
            />
          )}

          {/* บอกล่วงหน้าว่าจะเกิดอะไรขึ้น — คนที่เปิดค้างไว้อีกเครื่องจะได้ไม่งงว่าทำไมหลุด */}
          <p className="text-xs leading-relaxed text-slate-500">
            เมื่อตั้งรหัสผ่านใหม่แล้ว อุปกรณ์ทุกเครื่องที่เข้าสู่ระบบค้างไว้จะถูกออกจากระบบ
            และคุณต้องเข้าสู่ระบบใหม่ด้วยรหัสผ่านที่เพิ่งตั้ง
          </p>

          <button
            type="submit"
            disabled={submitting || done || passwordProblem(password) !== null || confirm !== password}
            className={`auth-submit mt-1 flex items-center justify-center gap-2 rounded-full py-2.5 font-medium text-white transition-colors ${
              done
                ? "bg-emerald-600 disabled:opacity-100"
                : "bg-brand hover:bg-brand-dark disabled:opacity-50"
            }`}
          >
            <SubmitLabel done={done} submitting={submitting} />
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
