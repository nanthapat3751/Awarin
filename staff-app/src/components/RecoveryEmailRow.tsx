import {
  EMAIL_ERROR_MESSAGE,
  looksLikeEmail,
  newAccountEmailProblem,
  normalizeEmail,
  suggestEmailFix,
} from "@systemboq/shared-types";
import { CircleAlert, CircleCheck, Mail } from "lucide-react";
import { useEffect, useState } from "react";

import { resendRecoveryCode, setRecoveryEmail, verifyRecoveryEmail } from "../lib/account-api";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";
import { OtpInput } from "./OtpInput";

type Mode = "view" | "edit" | "code";

const FIELD = "w-full rounded-md border px-3 py-2 text-sm text-slate-800";
// ผิด = ขอบแดง และวงโฟกัสแดงด้วย — หลังเตือนเคอร์เซอร์ถูกพาไปที่ช่อง วงโฟกัสสีดำปกติจะกลบขอบแดงจนมองไม่เห็น
const fieldTone = (bad: boolean) =>
  bad ? "border-red-500 focus:outline-2 focus:outline-offset-0 focus:outline-red-500" : "border-slate-300";

/**
 * ตรวจอีเมลตอนกดบันทึก — แบบเดียวกับหน้าลืมรหัส/สมัครฝั่งลูกค้า (ผู้ใช้สั่ง 18 ต.ค.)
 * ข้อความมีแค่ "กรุณากรอกอีเมล" / "กรุณากรอกอีเมลให้ถูกต้อง" ไม่มีปุ่มแนะนำ — ยกเว้นอีเมลชั่วคราวที่บอกเหตุเอง
 * เซิร์ฟเวอร์ตรวจด้วย newAccountEmailSchema: โดเมนที่ผิดแน่ชัด/อีเมลชั่วคราว = ตีกลับ จึงกันตายตัว
 * ส่วนโดเมนที่ "เดา" ว่าผิด (suggestEmailFix) เดาผิดได้ = กันครั้งแรก กดบันทึกซ้ำด้วยอีเมลเดิมผ่าน
 */
function emailProblem(value: string, warnedTypo: string | null): { message: string; guessed: boolean } | null {
  if (value === "") return { message: "กรุณากรอกอีเมล", guessed: false };
  if (!looksLikeEmail(value)) return { message: EMAIL_ERROR_MESSAGE, guessed: false };
  const hard = newAccountEmailProblem(value);
  // ข้อความของ shared-types พูดถึง "สมัคร" — ที่นี่เป็นอีเมลกู้รหัส จึงใช้ถ้อยคำของตัวเอง
  if (hard) {
    const message = hard.startsWith("อีเมลชั่วคราว") ? "อีเมลชั่วคราวใช้ไม่ได้ กรุณาใช้อีเมลที่ใช้งานจริง" : EMAIL_ERROR_MESSAGE;
    return { message, guessed: false };
  }
  if (suggestEmailFix(value) && warnedTypo !== value) return { message: EMAIL_ERROR_MESSAGE, guessed: true };
  return null;
}

/**
 * อีเมลกู้รหัสผ่าน (แถวในแท็บความปลอดภัย) — ลืมรหัสแล้วขอลิงก์มาที่อีเมลนี้ได้เอง เมื่อยืนยันแล้ว
 *
 * ตั้ง/เปลี่ยนต้องใส่รหัสผ่านปัจจุบัน แล้วกรอกรหัส 6 หลักที่ส่งไปที่อีเมลนั้น — เข้าระบบยังใช้ชื่อผู้ใช้เหมือนเดิม
 */
/** เปิดมาเพื่อยืนยันอีเมล (defaultOpen) และยังไม่ยืนยัน: มีอีเมลแล้ว = รอกรอกรหัส · ยังไม่มี = กรอกอีเมล */
function initialMode(defaultOpen: boolean, verified: boolean, email: string | null): Mode {
  if (!defaultOpen || verified) return "view";
  return email ? "code" : "edit";
}

export function RecoveryEmailRow({ defaultOpen = false }: Readonly<{ defaultOpen?: boolean }>) {
  const { user, commitUser } = useAuth();
  const toast = useToast();
  const email = user?.email ?? null;
  const verified = user?.emailVerified ?? false;
  const [mode, setMode] = useState<Mode>(() => initialMode(defaultOpen, verified, email));
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  // อีเมลที่เพิ่งถูกกันเพราะโดเมนน่าจะพิมพ์ผิด (เดา) — กดบันทึกซ้ำโดยไม่แก้ = ยืนยันว่าถูกแล้ว
  const [warnedTypo, setWarnedTypo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function fail(err: unknown, fallback: string) {
    setError(err instanceof ApiError ? err.message : fallback);
  }

  async function saveEmail(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const value = normalizeEmail(newEmail);
    // อีเมลเดิมที่ยืนยันแล้ว — บอกตั้งแต่ตรงนี้ ไม่ต้องรอให้พิมพ์รหัสผ่านแล้วเซิร์ฟเวอร์ตีกลับ
    const problem =
      email !== null && verified && value === email
        ? { message: "อีเมลนี้ยืนยันไว้แล้ว", guessed: false }
        : emailProblem(value, warnedTypo);
    const pwMissing = password === "";
    setEmailError(problem?.message ?? null);
    setPasswordError(pwMissing ? "กรุณากรอกรหัสผ่านปัจจุบัน" : null);
    if (problem) {
      if (problem.guessed) setWarnedTypo(value);
      document.getElementById("recovery-email-input")?.focus();
      return;
    }
    if (pwMissing) {
      document.getElementById("recovery-email-password")?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await setRecoveryEmail(value, password);
      commitUser(res.user);
      setPassword("");
      setCode("");
      setCooldown(res.code.retryAfterSeconds);
      setMode("code");
      toast.success(`ส่งรหัสยืนยันไปที่ ${res.user.email} แล้ว`);
    } catch (err) {
      // ข้อผิดของช่องใดช่องหนึ่งขึ้นใต้ช่องนั้น เหมือนข้อความที่ตรวจฝั่งเว็บ — ที่เหลือขึ้นบรรทัดรวมด้านล่าง
      const message = err instanceof ApiError ? err.message : null;
      if (message === "รหัสผ่านปัจจุบันไม่ถูกต้อง") {
        setPasswordError(message);
        setPassword("");
        document.getElementById("recovery-email-password")?.focus();
      } else if (message?.includes("อีเมล")) {
        setEmailError(message);
        document.getElementById("recovery-email-input")?.focus();
      } else {
        fail(err, "บันทึกอีเมลไม่สำเร็จ");
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const res = await resendRecoveryCode();
      setCooldown(res.retryAfterSeconds);
      if (res.sent) toast.success("ส่งรหัสยืนยันอีกครั้งแล้ว");
    } catch (err) {
      fail(err, "ส่งรหัสไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      commitUser(await verifyRecoveryEmail(value));
      setMode("view");
      toast.success("ยืนยันอีเมลแล้ว — ลืมรหัสผ่านเมื่อไร ขอลิงก์มาที่อีเมลนี้ได้เลย");
    } catch (err) {
      fail(err, "ยืนยันไม่สำเร็จ");
      setTimeout(() => setCode(""), 450);
    } finally {
      setBusy(false);
    }
  }

  let status = (
    <span className="inline-flex items-center gap-1 text-amber-700">
      <CircleAlert size={13} aria-hidden /> ยังไม่ได้ตั้ง — ลืมรหัสแล้วต้องให้เจ้าของระบบรีเซ็ตให้
    </span>
  );
  if (email && verified) {
    status = (
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <CircleCheck size={13} aria-hidden /> {email} · ยืนยันแล้ว
      </span>
    );
  } else if (email) {
    status = (
      <span className="inline-flex items-center gap-1 text-amber-700">
        <CircleAlert size={13} aria-hidden /> {email} · ยังไม่ยืนยัน (ยังใช้กู้รหัสไม่ได้)
      </span>
    );
  }

  return (
    <div id="recovery-email" className="flex scroll-mt-24 flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Mail size={18} className="mt-0.5 shrink-0 text-brand" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">อีเมลกู้รหัสผ่าน</p>
            <p className="mt-0.5 text-xs">{status}</p>
          </div>
        </div>
        {mode === "view" && (
          <div className="flex gap-2">
            {email && !verified && (
              <Button
                size="sm"
                variant="brand"
                onClick={() => {
                  setMode("code");
                  void resend();
                }}
              >
                ยืนยันอีเมล
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setNewEmail(email ?? "");
                setError(null);
                setEmailError(null);
                setPasswordError(null);
                setMode("edit");
              }}
            >
              {email ? "เปลี่ยนอีเมล" : "ตั้งอีเมล"}
            </Button>
          </div>
        )}
      </div>

      {mode === "edit" && (
        // noValidate: ตรวจเองแล้วขึ้นข้อความไทยใต้ช่อง (ตัวตรวจของเบราว์เซอร์จับได้แค่ "ไม่มี @")
        <form noValidate onSubmit={saveEmail} className="flex flex-col gap-3 pl-[30px]">
          <p className="text-xs text-slate-500">
            เข้าระบบยังใช้ชื่อผู้ใช้เหมือนเดิม — อีเมลนี้ใช้รับลิงก์ตั้งรหัสใหม่ตอนลืมรหัสเท่านั้น
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>อีเมล</span>
              <input
                id="recovery-email-input"
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  // แก้แล้วข้อความเดิมหายทันที — ตรวจใหม่ตอนกดบันทึก ไม่ขึ้นแดงระหว่างพิมพ์
                  if (emailError) setEmailError(null);
                }}
                placeholder="name@example.com"
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? "recovery-email-error" : undefined}
                className={`${FIELD} ${fieldTone(Boolean(emailError))}`}
              />
              {emailError && (
                <span id="recovery-email-error" className="text-xs text-red-600">
                  {emailError}
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>รหัสผ่านปัจจุบัน (ยืนยันว่าเป็นคุณ)</span>
              <input
                id="recovery-email-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={passwordError ? "recovery-password-error" : undefined}
                className={`${FIELD} ${fieldTone(Boolean(passwordError))}`}
              />
              {passwordError && (
                <span id="recovery-password-error" className="text-xs text-red-600">
                  {passwordError}
                </span>
              )}
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "กำลังส่ง..." : "บันทึกและส่งรหัสยืนยัน"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode("view")} disabled={busy}>
              ยกเลิก
            </Button>
          </div>
        </form>
      )}

      {mode === "code" && (
        <div className="flex flex-col gap-3 pl-[30px]">
          <p className="text-sm text-slate-600">
            กรอกรหัส 6 หลักที่ส่งไปที่ <span className="font-medium text-slate-800">{email}</span> (ใช้ได้ 15 นาที)
          </p>
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v);
              setError(null);
            }}
            onComplete={(v) => void verify(v)}
            disabled={busy}
            autoFocus
            status={error ? "error" : "default"}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => void resend()}
              disabled={busy || cooldown > 0}
              className="text-brand hover:underline disabled:text-slate-400 disabled:no-underline"
            >
              {cooldown > 0 ? `ส่งรหัสอีกครั้งได้ใน ${cooldown} วินาที` : "ส่งรหัสอีกครั้ง"}
            </button>
            <button type="button" onClick={() => setMode("view")} className="text-slate-500 hover:text-slate-800">
              ไว้ทีหลัง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
