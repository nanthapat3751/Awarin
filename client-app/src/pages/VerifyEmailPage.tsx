import { EMAIL_ERROR_MESSAGE, looksLikeEmail, normalizeEmail, suggestEmailFix } from "@systemboq/shared-types";
import { useEffect, useState, type SubmitEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { AuthShell } from "../components/AuthShell";
import { EmailSuggestion } from "../components/EmailSuggestion";
import { FormAlert } from "../components/FormAlert";
import { PrivacyNote } from "../components/PrivacyNote";
import { WaveField } from "../components/WaveField";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  describeFailure,
  inputFailure,
  isRetryable,
  selectCodeAfterFailure,
  type Failure,
} from "../lib/request-failure";
import { clearSignupTicket, readSignupTicket, saveSignupTicket } from "../lib/signup-ticket";
import { usePageMeta } from "../lib/page-meta";

/**
 * กรอกรหัส 6 หลักที่ส่งไปทางอีเมล — ด่านสุดท้ายก่อนบัญชีใช้งานได้
 *
 * อีเมลมากับ ?email= ที่หน้าสมัคร/หน้าเข้าสู่ระบบส่งต่อมาให้ ไม่ให้พิมพ์เองเพราะพิมพ์ผิด
 * แล้วจะได้แค่ "รหัสไม่ถูกต้อง" ซึ่งหาสาเหตุไม่เจอ · ถ้าเข้ามาตรง ๆ โดยไม่มีอีเมลก็ไล่กลับไป
 * หน้าเข้าสู่ระบบ
 */
export function VerifyEmailPage() {
  usePageMeta("ยืนยันอีเมล");
  const { user, status, verifyEmail, resendVerifyCode } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";

  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [resendNote, setResendNote] = useState<string | null>(null);
  // แก้อีเมลที่พิมพ์ผิด — ทำได้เฉพาะเบราว์เซอร์ที่เพิ่งสมัคร (ถือตั๋วจากตอนสมัคร)
  const ticket = readSignupTicket(email);
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newEmailTouched, setNewEmailTouched] = useState(false);
  const [changing, setChanging] = useState(false);
  const [changeFailure, setChangeFailure] = useState<Failure | null>(null);
  const normalizedNew = normalizeEmail(newEmail);
  const newSuggestion =
    newEmailTouched && looksLikeEmail(normalizedNew) ? suggestEmailFix(normalizedNew) : null;

  // นับถอยหลังปุ่ม "ส่งรหัสใหม่" — เซิร์ฟเวอร์กันไว้ 60 วินาทีอยู่แล้ว ปุ่มนี้แค่บอกให้เห็น
  // ว่าเหลืออีกเท่าไร จะได้ไม่กดแล้วเจอข้อความปฏิเสธเฉย ๆ
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (status === "ready" && user) return <Navigate to="/" replace />;
  if (email === "") return <Navigate to="/login" replace />;

  async function submit() {
    setFailure(null);
    setSubmitting(true);
    try {
      await verifyEmail(email, code);
      // ยืนยันแล้ว ตั๋วแก้อีเมลหมดหน้าที่
      clearSignupTicket();
      setDone(true);
      // ยืนยันแล้วยังไม่ได้เข้าระบบ (ปลายทางยืนยันไม่ออก session โดยตั้งใจ — ใครก็ยิงได้
      // โดยไม่ต้องรู้รหัสผ่าน) จึงพาไปหน้าเข้าสู่ระบบพร้อมอีเมลที่กรอกไว้แล้ว
      setTimeout(() => navigate(`/login?email=${encodeURIComponent(email)}`, { replace: true }), 900);
    } catch (err) {
      const failure = describeFailure(err, "ยืนยันอีเมลไม่สำเร็จ");
      setFailure(failure);
      selectCodeAfterFailure("verify-code", failure);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit();
  }

  async function handleResend() {
    setFailure(null);
    setResendNote(null);
    try {
      const res = await resendVerifyCode(email);
      setCooldown(res.retryAfterSeconds);
      setResendNote(res.sent ? "ส่งรหัสใหม่ไปแล้ว ตรวจกล่องจดหมายอีกครั้ง" : null);
    } catch (err) {
      setFailure(describeFailure(err, "ส่งรหัสใหม่ไม่สำเร็จ"));
    }
  }

  async function changeEmail(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setNewEmailTouched(true);
    if (!looksLikeEmail(normalizedNew)) {
      setChangeFailure(inputFailure(EMAIL_ERROR_MESSAGE));
      return;
    }
    if (!ticket) return;
    setChangeFailure(null);
    setChanging(true);
    try {
      const res = await apiFetch<{ email: string; codeSent: boolean }>("/api/auth/customer/verify-email/change-email", {
        method: "POST",
        body: JSON.stringify({ email, ticket, newEmail: normalizedNew }),
      });
      // ตั๋วเดิมยังใช้ต่อได้ (มีเพดานจำนวนครั้งที่เซิร์ฟเวอร์) — ย้ายไปผูกกับอีเมลใหม่
      saveSignupTicket(res.email, ticket);
      setEditingEmail(false);
      setNewEmail("");
      setNewEmailTouched(false);
      setCode("");
      setFailure(null);
      setCooldown(60);
      setResendNote(
        res.codeSent ? `ส่งรหัสไปที่ ${res.email} แล้ว` : "เปลี่ยนอีเมลแล้ว แต่ส่งรหัสไม่สำเร็จ — กดส่งรหัสใหม่อีกครั้ง",
      );
      navigate(`/verify-email?email=${encodeURIComponent(res.email)}`, { replace: true });
    } catch (err) {
      setChangeFailure(describeFailure(err, "แก้อีเมลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
    } finally {
      setChanging(false);
    }
  }

  if (editingEmail && ticket) {
    return (
      <AuthShell note={<PrivacyNote />}>
        <div className="auth-card w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-paper p-8 shadow-card">
          <form onSubmit={changeEmail} className="flex flex-col gap-4">
            <div className="text-center">
              <h1 className="text-xl font-semibold text-slate-800">แก้อีเมล</h1>
              <p className="mt-1 text-sm text-slate-500">
                อีเมลเดิม <span className="font-medium text-slate-700 line-through decoration-slate-400">{email}</span>
                <br />
                กรอกอีเมลที่ถูกต้อง เราจะส่งรหัสยืนยันไปที่อีเมลนั้นแทน
              </p>
            </div>

            <WaveField
              id="verify-new-email"
              label="อีเมลที่ถูกต้อง"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value);
                setChangeFailure(null);
              }}
              onBlur={() => setNewEmailTouched(true)}
            />
            {newSuggestion && <EmailSuggestion suggestion={newSuggestion} onUse={setNewEmail} />}

            {changeFailure && <FormAlert kind={changeFailure.kind} message={changeFailure.message} />}

            <button
              type="submit"
              disabled={changing}
              className="auth-submit mt-2 rounded-full bg-brand py-2.5 font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
            >
              {changing ? "กำลังส่งรหัส..." : "ส่งรหัสไปอีเมลนี้"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingEmail(false);
                setChangeFailure(null);
              }}
              className="auth-link mx-auto inline-flex min-h-11 items-center text-sm lg:min-h-0"
            >
              ยกเลิก
            </button>
          </form>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell note={<PrivacyNote />}>
      <div className="auth-card w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-paper p-8 shadow-card">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-slate-800">ยืนยันอีเมล</h1>
            <p className="mt-1 text-sm text-slate-500">
              เราส่งรหัส 6 หลักไปที่ <span className="font-medium text-slate-700">{email}</span>
              <br />
              รหัสใช้ได้ 15 นาที
            </p>
          </div>

          <WaveField
            id="verify-code"
            label="รหัส 6 หลัก"
            // inputMode numeric = แป้นตัวเลขบนมือถือ · one-time-code = iOS/Android เติมให้จาก
            // ข้อความที่เพิ่งเข้ามา · ไม่ใช้ type="number" เพราะลูกศรขึ้นลงกับ scroll ทำเลขเปลี่ยนเอง
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            // ช่องเดียวในหน้า โฟกัสให้เลยจะได้พิมพ์ต่อได้ทันทีหลังคัดลอกรหัสมาจากเมล
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center text-lg tracking-[0.4em] tabular-nums"
          />

          {failure && (
            <FormAlert
              kind={failure.kind}
              message={failure.message}
              focus={isRetryable(failure.kind)}
              onRetry={isRetryable(failure.kind) && !submitting ? () => void submit() : undefined}
            />
          )}
          {resendNote && <p className="text-sm text-emerald-700">{resendNote}</p>}

          <button
            type="submit"
            disabled={submitting || done || code.length !== 6}
            className={`auth-submit mt-2 rounded-full py-2.5 font-medium text-white transition-colors ${
              done
                ? "bg-emerald-600 disabled:opacity-100"
                : "bg-brand hover:bg-brand-dark disabled:opacity-50"
            }`}
          >
            {done ? "ยืนยันแล้ว — กำลังพาไปเข้าสู่ระบบ" : submitting ? "กำลังยืนยัน..." : "ยืนยันอีเมล"}
          </button>

          <div className="text-center text-sm text-slate-500">
            ไม่ได้รับรหัส?{" "}
            {cooldown > 0 ? (
              <span className="tabular-nums">ขอรหัสใหม่ได้ในอีก {cooldown} วินาที</span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                className="auth-link inline-flex min-h-11 items-center lg:min-h-0"
              >
                ส่งรหัสใหม่
              </button>
            )}
          </div>

          <p className="text-center text-xs text-slate-400">
            กรอกอีเมลผิด?{" "}
            {ticket ? (
              // เบราว์เซอร์ที่เพิ่งสมัคร: แก้อีเมลได้เลย ไม่ต้องกรอกฟอร์มสมัครใหม่ทั้งหมด
              <button
                type="button"
                onClick={() => setEditingEmail(true)}
                className="auth-link inline-flex min-h-11 items-center lg:min-h-0"
              >
                แก้อีเมล
              </button>
            ) : (
              // คนละแท็บ/คนละเครื่อง (ไม่มีตั๋ว): สมัครใหม่ได้ — บัญชีที่ยังไม่ยืนยันถูกแทนที่ให้
              <Link to="/register" className="auth-link">
                สมัครใหม่ด้วยอีเมลที่ถูกต้อง
              </Link>
            )}
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
