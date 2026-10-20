import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { type AccessTokenInfo, PASSWORD_HINT, passwordProblem } from "@systemboq/shared-types";

import { AccountBenefits } from "../components/AccountBenefits";
import { AuthBlade } from "../components/AuthBlade";
import { AuthShell } from "../components/AuthShell";
import { FormAlert } from "../components/FormAlert";
import {
  CapsLockHint,
  PasswordMatchHint,
  PasswordRules,
  PasswordStrengthBar,
  ThaiKeyboardHint,
} from "../components/PasswordHints";
import { PrivacyNote } from "../components/PrivacyNote";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  describeFailure,
  inputFailure,
  isRetryable,
  type Failure,
} from "../lib/request-failure";
import { useCapsLock } from "../lib/use-caps-lock";
import { usePageMeta } from "../lib/page-meta";

// หน้าเปิดจากลิงก์ที่ทีมงานส่งให้: ลูกค้าตั้งรหัสผ่านของตัวเอง แล้วเข้าระบบดูใบเสนอราคาได้ทันที
export function ActivatePage() {
  usePageMeta("เปิดใช้บัญชี");
  const { token = "" } = useParams();
  const { activateAccount } = useAuth();
  const navigate = useNavigate();

  const [info, setInfo] = useState<AccessTokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  // เก็บ Failure ทั้งก้อน ไม่ใช่แค่ข้อความ — "ลิงก์หมดอายุ" กับ "โหลดไม่สำเร็จเพราะเน็ตหลุด"
  // ต้องพาผู้ใช้ไปคนละทาง และลิงก์เข้าใช้นี้ออกให้ครั้งเดียว บอกผิดแล้วลูกค้าต้องรบกวนทีมงานใหม่
  const [loadFailure, setLoadFailure] = useState<Failure | null>(null);
  const [reloadAt, setReloadAt] = useState(0);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // เคยคลิกช่องรหัสแล้ว = โชว์รายการกฎค้างไว้จนกว่าจะผ่านครบ
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [address, setAddress] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { capsOn, capsProps } = useCapsLock();

  useEffect(() => {
    setLoading(true);
    setLoadFailure(null);
    apiFetch<AccessTokenInfo>(`/api/auth/access/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((err: unknown) =>
        setLoadFailure(describeFailure(err, "ลิงก์นี้ใช้ไม่ได้แล้วหรือหมดอายุ")),
      )
      .finally(() => setLoading(false));
  }, [token, reloadAt]);

  async function submit() {
    setFailure(null);
    // กฎชุดเดียวกับเซิร์ฟเวอร์ — อีเมลกับชื่อของบัญชีปลายทางส่งไปด้วย เพื่อกันการตั้งรหัส
    // ที่มีชื่อตัวเองอยู่ข้างใน (เซิร์ฟเวอร์ปฏิเสธข้อนี้อยู่แล้ว บอกก่อนดีกว่าให้ถูกตีกลับ)
    const passwordIssue = passwordProblem(password, [info?.email, info?.fullName]);
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
      await activateAccount(token, password, address.trim() || undefined);
      navigate("/my/quotes", { replace: true });
    } catch (err) {
      setFailure(describeFailure(err, "ตั้งรหัสผ่านไม่สำเร็จ"));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit();
  }

  if (loading) {
    return (
      <AuthShell>
        <p className="text-slate-400">กำลังตรวจสอบลิงก์...</p>
      </AuthShell>
    );
  }

  if (loadFailure) {
    // เปิดไม่ได้เพราะเครือข่าย/เซิร์ฟเวอร์ → ลิงก์อาจยังดีอยู่ ห้ามส่งลูกค้าไปรบกวนทีมงานขอใบใหม่
    const reachable = !isRetryable(loadFailure.kind);
    return (
      <AuthShell>
        <div className="max-w-lg text-center">
          <h1 className="text-2xl font-semibold text-slate-800">
            {reachable ? "ลิงก์ใช้ไม่ได้" : "เปิดลิงก์ไม่ได้ในขณะนี้"}
          </h1>
          <p className="mt-2 text-slate-500">{loadFailure.message}</p>
          {reachable ? (
            <Link
              to="/contact"
              className="mt-4 inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              ติดต่อทีมงานเพื่อขอลิงก์ใหม่
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setReloadAt((n) => n + 1)}
              className="mt-4 inline-flex min-h-11 items-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              ลองเปิดลิงก์อีกครั้ง
            </button>
          )}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell note={<PrivacyNote />}>
      {/* ใบมีดอยู่ฝั่งเดียวกับหน้าสมัคร เพราะนี่คือการเปิดบัญชีเหมือนกัน แค่ทีมงานสร้างให้ล่วงหน้า */}
      <AuthBlade
        mode="register"
        aside={
          <AccountBenefits
            title={
              <>
                ตั้ง<span className="font-normal text-white/75">รหัสผ่าน</span>ของคุณ
              </>
            }
            subtitle="ทีมงานเปิดบัญชีให้เรียบร้อยแล้ว เหลือแค่ตั้งรหัสผ่านก็เข้าใช้งานได้ทันที"
          />
        }
      >
        <form onSubmit={handleSubmit} className="auth-form flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">ตั้งรหัสผ่านเพื่อเข้าใช้งาน</h1>
            {info && (
              <p className="mt-1 text-sm text-slate-500">
                ตั้งรหัสผ่านสำหรับบัญชี{" "}
                <span className="font-medium text-slate-700">{info.email}</span> เพื่อเข้าดูใบเสนอราคา
              </p>
            )}
          </div>

          <label className="flex flex-col gap-1 text-sm text-slate-600">
            <span>รหัสผ่านใหม่</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={PASSWORD_HINT}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setPasswordFocused(true)}
              {...capsProps}
              className="border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <CapsLockHint on={capsOn} />
            <ThaiKeyboardHint value={password} />
            <PasswordStrengthBar value={password} personal={[info?.email, info?.fullName]} />
            <PasswordRules value={password} personal={[info?.email, info?.fullName]} show={passwordFocused} />
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-600">
            <span>ยืนยันรหัสผ่านอีกครั้ง</span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <PasswordMatchHint password={password} confirm={confirm} />
          </label>

          {/* ที่อยู่ไม่บังคับ — กรอกไว้เพื่อให้ใบเสนอราคา/สัญญาแสดง "ที่อยู่ผู้ว่าจ้าง" ได้เลย
              แก้ภายหลังได้ที่หน้า "บัญชีของฉัน" */}
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            ที่อยู่ <span className="text-slate-400">(ไม่บังคับ — สำหรับพิมพ์บนใบเสนอราคา/สัญญา)</span>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={1000}
              placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
              className="border border-slate-300 rounded px-3 py-2 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </label>

          {failure && (
            <FormAlert
              kind={failure.kind}
              message={failure.message}
              onRetry={isRetryable(failure.kind) && !submitting ? () => void submit() : undefined}
            />
          )}

          <button
            type="submit"
            disabled={submitting || passwordProblem(password, [info?.email, info?.fullName]) !== null || confirm !== password}
            className="auth-submit mt-2 rounded-full bg-brand py-2.5 font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
          >
            {submitting ? "กำลังบันทึก..." : "ตั้งรหัสผ่านและเข้าสู่ระบบ"}
          </button>
        </form>
      </AuthBlade>
    </AuthShell>
  );
}
