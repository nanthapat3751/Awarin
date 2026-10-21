import { PASSWORD_HINT, passwordProblem, type StaffUserDto } from "@systemboq/shared-types";
import { Check, Copy, KeyRound, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ApiError } from "../lib/api";
import { generateTempPassword } from "../lib/temp-password";
import { useToast } from "../lib/toast-context";
import { resetStaffPassword } from "../lib/users-api";
import { Button } from "./Button";
import { PasswordRules, ThaiKeyboardHint } from "./PasswordHints";

/**
 * รีเซ็ตรหัสผ่านพนักงาน — หน้าต่างกลางจอแบบที่เว็บทั่วไปใช้ แทนการกางช่องใต้แถวในตาราง
 *
 * OWNER ตั้งรหัสชั่วคราว (พิมพ์เอง หรือกด "สร้างรหัสให้") แล้วคัดลอกไปบอกพนักงาน · ระบบออกจากระบบ
 * ทุกเครื่องของคนนั้นและบังคับให้ตั้งรหัสใหม่เองตอนเข้าครั้งถัดไป (รหัสที่ OWNER รู้ใช้ได้ครั้งเดียว)
 */
export function ResetPasswordDialog({
  target,
  onClose,
}: Readonly<{ target: StaffUserDto; onClose: () => void }>) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disableTwoFactor, setDisableTwoFactor] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const personal = [target.username, target.fullName];
  const name = target.fullName || target.username || "พนักงาน";

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  function generate() {
    setValue(generateTempPassword(personal));
    setCopied(false);
    setError(null);
  }

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ — เลือกข้อความในช่องแล้วคัดลอกเองได้");
    }
  }

  async function submit() {
    // ปุ่มกดได้เสมอ — บอกเหตุผลข้อแรกที่ยังไม่ผ่าน แทนการทำปุ่มเทาเงียบ ๆ
    const problem = value ? passwordProblem(value, personal) : "กรอกรหัสผ่านใหม่ หรือกด “สร้างรหัสให้”";
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await resetStaffPassword(target.id, value, disableTwoFactor);
      toast.success(`รีเซ็ตรหัสผ่านของ ${name} แล้ว — แจ้งรหัสใหม่ให้เจ้าตัว ระบบจะให้ตั้งรหัสใหม่เองตอนเข้าครั้งถัดไป`);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "รีเซ็ตรหัสผ่านไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* ฉากหลังเป็นปุ่มจริง (กดแล้วปิด) — ไม่ต้องดักคลิกบน div */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="ปิด"
        onClick={() => !saving && onClose()}
        className="absolute inset-0 h-full w-full cursor-default bg-slate-900/40"
      />
      <dialog
        open
        aria-modal="true"
        aria-labelledby="reset-pw-title"
        className="relative w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="contents"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <KeyRound size={18} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id="reset-pw-title" className="text-base font-semibold text-slate-800">
                รีเซ็ตรหัสผ่าน
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {name}
                {target.username && <span className="text-slate-400"> · {target.username}</span>}
              </p>
            </div>
          </div>

          <ul className="mt-4 space-y-1 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            <li>• ออกจากระบบทุกเครื่องของคนนี้ทันที</li>
            <li>• รหัสนี้ใช้เข้าได้ครั้งเดียว — ระบบจะให้ตั้งรหัสใหม่ของตัวเองตอนเข้าครั้งถัดไป</li>
          </ul>

          <label htmlFor="reset-pw-input" className="mt-4 block text-sm font-medium text-slate-700">
            รหัสผ่านชั่วคราว
          </label>
          <div className="mt-1.5 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                id="reset-pw-input"
                ref={inputRef}
                // type=text โดยตั้งใจ — OWNER ต้องอ่านรหัสไปบอกต่อ
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setCopied(false);
                  setError(null);
                }}
                placeholder={PASSWORD_HINT}
                className="w-full rounded-md border border-slate-300 py-2 pl-3 pr-10 font-mono text-sm tracking-wide"
              />
              <button
                type="button"
                onClick={() => void copy()}
                disabled={!value}
                aria-label={copied ? "คัดลอกแล้ว" : "คัดลอกรหัส"}
                title={copied ? "คัดลอกแล้ว" : "คัดลอกรหัส"}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
              >
                {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
              </button>
            </div>
            <Button type="button" variant="ghost" onClick={generate}>
              <Wand2 size={14} /> สร้างรหัสให้
            </Button>
          </div>
          <ThaiKeyboardHint value={value} />
          <div className="mt-2">
            <PasswordRules value={value} personal={personal} show />
          </div>
          {target.twoFactorEnabled && (
            <label className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={disableTwoFactor}
                onChange={(e) => setDisableTwoFactor(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                ปิดยืนยันตัวตน 2 ชั้นด้วย<span className="block text-xs text-slate-500">
                  ใช้เมื่อทำมือถือหายและไม่มีรหัสสำรอง — เจ้าตัวเปิดใหม่เองได้ในหน้าบัญชีของฉัน
                </span>
              </span>
            </label>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "กำลังรีเซ็ต..." : "รีเซ็ตรหัสผ่าน"}
            </Button>
          </div>
        </form>
      </dialog>
    </div>,
    document.body,
  );
}
