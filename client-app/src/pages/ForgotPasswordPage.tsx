import {
  EMAIL_ERROR_MESSAGE,
  looksLikeEmail,
  normalizeEmail,
  suggestEmailFix,
} from "@systemboq/shared-types";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AuthShell } from "../components/AuthShell";
import { FieldAdornment, MailIcon } from "../components/FieldIcons";
import { FormAlert } from "../components/FormAlert";
import { PrivacyNote } from "../components/PrivacyNote";
import { WaveField } from "../components/WaveField";
import { apiFetch } from "../lib/api";
import {
  describeFailure,
  inputFailure,
  isRetryable,
  selectCodeAfterFailure,
  type Failure,
} from "../lib/request-failure";
import { mailProviderFor } from "../lib/mail-provider";
import { usePageMeta } from "../lib/page-meta";

/**
 * ขอลิงก์ตั้งรหัสผ่านใหม่
 *
 * **หน้านี้ตั้งใจไม่บอกว่าอีเมลที่กรอกมามีบัญชีอยู่จริงหรือไม่** ไม่ว่าจะมีหรือไม่มี ข้อความที่ขึ้น
 * เหมือนกันทุกตัวอักษร — ถ้าบอกต่างกันเมื่อไร หน้านี้จะกลายเป็นเครื่องมือกวาดรายชื่ออีเมลลูกค้า
 * ของบริษัททันที (พิมพ์อีเมลไล่ไปเรื่อย ๆ แล้วดูว่าอันไหนตอบว่า "พบบัญชี")
 *
 * ด้วยเหตุผลเดียวกัน ปุ่มส่งใหม่จึงนับถอยหลังตายตัว 60 วินาทีจากฝั่งนี้เอง ไม่ได้ถามเซิร์ฟเวอร์ว่า
 * เหลืออีกกี่วินาที เพราะคำตอบนั้นจะมีก็ต่อเมื่อมีบัญชีจริง
 *
 * เมลมีทั้งปุ่มและรหัส 6 หลัก — ลูกค้ามักอ่านเมลในมือถือแต่เปิดหน้านี้ค้างไว้ในคอม จึงให้พิมพ์รหัส
 * ลงหน้านี้ได้เลย (ทางหลัก) หรือกดปุ่มในเมลก็ได้ · รหัสถูกแล้วไปหน้าตั้งรหัสใหม่ด้วยลิงก์ใบใหม่
 * ที่เซิร์ฟเวอร์ออกให้ (ลิงก์ในเมลตายทันที ใช้อันไหนก่อนอีกอันตาย)
 */
const RESEND_SECONDS = 60;

/**
 * ตรวจอีเมลตอนกดส่ง (แบบ A — ผู้ใช้เลือก 18 ต.ค. + ให้เช็คโดเมนอย่าง gmail.com ด้วย) คืนข้อความผิด หรือ null
 *
 * ข้อความมีแค่สองแบบ "กรุณากรอกอีเมล" / "กรุณากรอกอีเมลให้ถูกต้อง" และไม่มีปุ่มแนะนำอีเมล (ผู้ใช้สั่งเอาออก)
 * ตรวจแค่ "รูปแบบ" กับ "โดเมนที่น่าจะพิมพ์ผิด" ฝั่งเว็บเท่านั้น **ไม่ถามเซิร์ฟเวอร์ว่ามีบัญชีไหม**
 * (หน้านี้ห้ามบอกว่าอีเมลไหนมีบัญชี) — อีเมลที่ผ่านแล้วเซิร์ฟเวอร์ตอบ "ส่งแล้ว" เหมือนเดิมทุกกรณี
 *
 * โดเมนที่น่าจะพิมพ์ผิด (gmial.com) เป็นการเดา — เดาผิดได้ (โดเมนจริงที่หน้าตาคล้าย) จึงเตือนครั้งเดียว:
 * กดส่งซ้ำด้วยอีเมลเดิมโดยไม่แก้ = ยืนยันว่าพิมพ์ถูกแล้ว ส่งได้ (warnedTypo)
 */
function checkEmail(value: string, warnedTypo: string | null): string | null {
  if (value === "") return "กรุณากรอกอีเมล";
  if (!looksLikeEmail(value)) return EMAIL_ERROR_MESSAGE;
  if (suggestEmailFix(value) && warnedTypo !== value) return EMAIL_ERROR_MESSAGE;
  return null;
}

export function ForgotPasswordPage() {
  usePageMeta("ลืมรหัสผ่าน");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  // อีเมลที่เพิ่งเตือนว่าโดเมนน่าจะพิมพ์ผิด — กดส่งซ้ำโดยไม่แก้ = ยืนยันว่าถูกแล้ว
  const [warnedTypo, setWarnedTypo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeFailure, setCodeFailure] = useState<Failure | null>(null);
  // ยืนยันอัตโนมัติเมื่อพิมพ์ครบ 6 หลักแค่ครั้งเดียวต่อรหัส — ผิดแล้วไม่ยิงซ้ำเองจนกว่าจะพิมพ์ใหม่
  const autoTried = useRef("");
  const navigate = useNavigate();
  const provider = mailProviderFor(email);
  const digits = code.replace(/\D/g, "");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit(target = email) {
    setFailure(null);
    setSubmitting(true);
    try {
      await apiFetch("/api/auth/customer/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: target }),
      });
      setSent(true);
      setCooldown(RESEND_SECONDS);
      // ขอใหม่ = รหัสเดิมตายแล้ว ล้างช่องให้พิมพ์รหัสจากเมลฉบับล่าสุด
      setCode("");
      setCodeFailure(null);
      autoTried.current = "";
    } catch (err) {
      setFailure(describeFailure(err, "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
    } finally {
      setSubmitting(false);
    }
  }

  function focusEmail() {
    document.getElementById("forgot-email")?.focus();
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = normalizeEmail(email);
    const problem = checkEmail(value, warnedTypo);
    setEmailError(problem);
    if (problem) {
      if (looksLikeEmail(value)) setWarnedTypo(value);
      focusEmail();
      return;
    }
    // หน้า "ส่งแล้ว" และปุ่มส่งใหม่ใช้อีเมลที่ตัดช่องว่าง/ตัวพิมพ์เล็กแล้ว
    setEmail(value);
    void submit(value);
  }

  async function verify(value = digits) {
    if (value.length !== 6) {
      setCodeFailure(inputFailure("กรอกรหัส 6 หลักจากอีเมล"));
      return;
    }
    setCodeFailure(null);
    setVerifying(true);
    try {
      const res = await apiFetch<{ token: string }>("/api/auth/customer/reset-password/verify-code", {
        method: "POST",
        body: JSON.stringify({ email, code: value }),
      });
      // replace — ปุ่มย้อนกลับไม่พากลับมาหน้ากรอกรหัสที่ใช้ไปแล้ว
      navigate(`/reset-password/${res.token}`, { replace: true });
    } catch (err) {
      const failure = describeFailure(err, "ยืนยันรหัสไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setCodeFailure(failure);
      selectCodeAfterFailure("reset-code", failure);
    } finally {
      setVerifying(false);
    }
  }

  function changeCode(next: string) {
    setCode(next);
    setCodeFailure(null);
    const only = next.replace(/\D/g, "");
    if (only.length === 6 && autoTried.current !== only && !verifying) {
      autoTried.current = only;
      void verify(only);
    }
  }

  return (
    <AuthShell note={<PrivacyNote />}>
      <div className="auth-card w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-paper p-8 shadow-card">
        {sent ? (
          <div className="auth-form flex flex-col items-center gap-4 text-center">
            {/* ไอคอนวงกลม — จุดสายตาแรกที่บอกว่า "เรื่องนี้จบที่อีเมลของคุณแล้ว" ก่อนอ่านตัวหนังสือ */}
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-7 w-7"
                aria-hidden
              >
                <rect x="2" y="5" width="20" height="14" rx="2.5" />
                <path d="m3 7 8.2 5.6a1.4 1.4 0 0 0 1.6 0L21 7" />
              </svg>
            </span>

            <div>
              <h1 className="text-xl font-semibold text-slate-800">ตรวจกล่องจดหมายของคุณ</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                เราส่งรหัส 6 หลักไปที่ <span className="font-medium text-slate-800">{email}</span> แล้ว
              </p>
              {/* เงื่อนไข "หากมีบัญชี" ต้องอยู่ ไม่งั้นหน้านี้กลายเป็นตัวยืนยันว่าอีเมลไหนเป็นลูกค้าเรา
                  แยกเป็นย่อหน้าของตัวเอง เพราะพอต่อท้ายประโยคบนแล้วเบราว์เซอร์ตัดคำไทยขึ้นบรรทัด
                  ใหม่กลางคำ ("หากอีเมล / นี้มีบัญชี") อ่านสะดุด */}
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                หากอีเมลนี้มีบัญชีอยู่กับเรา · ใช้ได้ 30 นาที
              </p>
            </div>

            {/* ทางหลัก: พิมพ์รหัสจากเมลลงหน้านี้ — ไม่ต้องสลับเครื่องหรือแท็บ */}
            <form
              className="flex w-full flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
            >
              <label htmlFor="reset-code" className="text-sm font-medium text-slate-700">
                กรอกรหัสจากอีเมล
              </label>
              <input
                id="reset-code"
                value={code}
                onChange={(e) => changeCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={7}
                placeholder="000000"
                aria-describedby="reset-code-hint"
                className="w-full rounded-xl border border-slate-300 bg-white py-3 text-center font-mono text-2xl tracking-[0.5em] text-slate-800 placeholder:text-slate-300 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
              {codeFailure && (
                <FormAlert
                  kind={codeFailure.kind}
                  message={codeFailure.message}
                  focus={isRetryable(codeFailure.kind)}
                  onRetry={isRetryable(codeFailure.kind) && !verifying ? () => void verify() : undefined}
                />
              )}
              <button
                type="submit"
                disabled={verifying}
                className="auth-submit rounded-full bg-brand py-2.5 font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
              >
                {verifying ? "กำลังตรวจรหัส..." : "ยืนยันรหัส"}
              </button>
              <p id="reset-code-hint" className="text-xs leading-relaxed text-slate-500">
                หรือกดปุ่ม “ตั้งรหัสผ่านใหม่” ในอีเมลก็ได้ — ใช้อย่างใดอย่างหนึ่ง
              </p>
            </form>

            {provider && (
              <a
                href={provider.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 py-2.5 font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
              >
                เปิด {provider.name}
                {/* ไอคอนลูกศรออกนอก บอกว่าจะเปิดแท็บใหม่ ไม่ได้ทิ้งหน้านี้ไป */}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <path d="M14 4h6v6" />
                  <path d="M20 4 10 14" />
                  <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
                </svg>
              </a>
            )}

            {!provider && (
              // เดาผู้ให้บริการไม่ได้ (โดเมนองค์กร) — บอกชื่อผู้ส่งไปแทน จะได้ค้นในกล่องจดหมายเจอ
              <p className="text-sm leading-relaxed text-slate-600">
                เปิดกล่องจดหมายของคุณ แล้วมองหาอีเมลจาก{" "}
                <span className="whitespace-nowrap font-medium text-slate-800">Awarin Engineering</span>
              </p>
            )}

            {failure && (
              <FormAlert
                kind={failure.kind}
                message={failure.message}
                onRetry={isRetryable(failure.kind) && !submitting ? () => void submit() : undefined}
              />
            )}

            <div className="w-full border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
              <p>ไม่เจอในกล่องจดหมาย? ลองดูในโฟลเดอร์จดหมายขยะ</p>
              <p className="mt-2">
                {cooldown > 0 ? (
                  <span className="tabular-nums">ส่งใหม่ได้ในอีก {cooldown} วินาที</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={submitting}
                    className="auth-link inline-flex min-h-11 items-center lg:min-h-0 disabled:opacity-50"
                  >
                    ส่งรหัสอีกครั้ง
                  </button>
                )}
                <span className="mx-2 text-slate-300">·</span>
                <Link
                  to="/login"
                  className="auth-link inline-flex min-h-11 items-center lg:min-h-0"
                >
                  กลับไปหน้าเข้าสู่ระบบ
                </Link>
              </p>
            </div>
          </div>
        ) : (
          // noValidate: ตรวจเองแล้วขึ้นข้อความใต้ช่อง — ตัวตรวจของเบราว์เซอร์จับได้แค่ "ไม่มี @"
          // (somchai@gmail / somchai@gmial.com ผ่านไปเฉย ๆ แล้วขึ้นว่าส่งแล้วทั้งที่ไม่มีเมลไปถึง)
          <form noValidate onSubmit={handleSubmit} className="auth-form flex flex-col gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-800">ลืมรหัสผ่าน</h1>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                กรอกอีเมลที่ใช้สมัคร เราจะส่งรหัส 6 หลักสำหรับตั้งรหัสผ่านใหม่ไปให้
              </p>
            </div>

            <WaveField
              id="forgot-email"
              label="อีเมล"
              type="email"
              required
              autoComplete="username"
              autoFocus
              value={email}
              error={emailError}
              onChange={(e) => {
                setEmail(e.target.value);
                // แก้แล้วข้อความเดิมหายทันที — ตรวจใหม่ตอนกดส่ง ไม่ขึ้นแดงระหว่างพิมพ์
                if (emailError) setEmailError(null);
              }}
              trailing={
                <FieldAdornment>
                  <MailIcon />
                </FieldAdornment>
              }
            />

            {failure && (
              <FormAlert
                kind={failure.kind}
                message={failure.message}
                onRetry={isRetryable(failure.kind) && !submitting ? () => void submit() : undefined}
              />
            )}

            <button
              type="submit"
              disabled={submitting}
              className="auth-submit mt-2 rounded-full bg-brand py-2.5 font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
            >
              {submitting ? "กำลังส่ง..." : "ส่งรหัส"}
            </button>

            <p className="text-sm text-slate-500">
              นึกรหัสผ่านออกแล้ว?{" "}
              <Link
                to="/login"
                className="auth-link inline-flex min-h-11 items-center lg:min-h-0"
              >
                เข้าสู่ระบบ
              </Link>
            </p>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
