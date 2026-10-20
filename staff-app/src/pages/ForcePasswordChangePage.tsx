import { PASSWORD_HINT, passwordProblem } from "@systemboq/shared-types";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import { useState, type SubmitEvent } from "react";

import { Button } from "../components/Button";
import {
  CapsLockHint,
  PasswordMatchHint,
  PasswordRules,
  PasswordStrengthBar,
  ThaiKeyboardHint,
} from "../components/PasswordHints";
import { ApiError } from "../lib/api";
import { changeMyPassword } from "../lib/account-api";
import { useAuth } from "../lib/auth-context";
import { useCapsLock } from "../lib/use-caps-lock";

/**
 * บังคับตั้งรหัสผ่านใหม่ — ขึ้นแทนทุกหน้าเมื่อบัญชีติดธง mustChangePassword
 *
 * เจอหน้านี้เมื่อรหัสที่ใช้เข้ามาเป็นรหัสที่ **คนอื่นตั้งให้** (เจ้าของระบบสร้างบัญชีใหม่ หรือ
 * รีเซ็ตรหัสให้) รหัสนั้นเดินทางผ่าน LINE/กระดาษ/ปากเปล่า จึงมีคนรู้อย่างน้อยสองคนตั้งแต่ต้น
 *
 * **ไม่มีปุ่มข้าม และไม่มีเมนูให้กดไปที่อื่น** โดยตั้งใจ — เซิร์ฟเวอร์ปิดทุกปลายทางไว้อยู่แล้ว
 * (ดู middleware/must-change-password.ts) ถ้าใส่ปุ่มข้ามไว้ คนจะกดข้ามแล้วเจอ 403 ทุกหน้าโดยไม่รู้
 * สาเหตุ · ปุ่มออกจากระบบต้องมี เพราะการติดอยู่ในหน้าเดียวที่ออกไม่ได้เลยแย่กว่า
 *
 * ต้องกรอกรหัสปัจจุบันด้วย (ปลายทางเดียวกับหน้าบัญชีของฉัน) — คนที่แอบใช้เครื่องที่เปิดค้างไว้
 * จะได้เปลี่ยนรหัสยึดบัญชีไปเลยไม่ได้
 */
export function ForcePasswordChangePage() {
  const { user, refresh, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { capsOn, capsProps } = useCapsLock();

  const personal = [user?.username, user?.fullName, user?.workPhone];
  const nextOk = next !== "" && passwordProblem(next, personal) === null;
  const matches = next !== "" && next === confirm;

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const issue = passwordProblem(next, personal);
    if (issue !== null) {
      setError(issue);
      return;
    }
    if (next !== confirm) {
      setError("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
      return;
    }
    if (next === current) {
      setError("รหัสผ่านใหม่ต้องไม่ใช่รหัสเดิมที่ได้รับมา");
      return;
    }

    setSaving(true);
    try {
      await changeMyPassword(current, next);
      // ดึงข้อมูลตัวเองใหม่เพื่อให้ธง mustChangePassword หายไป แล้ว ProtectedRoute จะปล่อยเข้าระบบเอง
      // (เซิร์ฟเวอร์ออกคุกกี้ session ใหม่มาให้พร้อมกับการเปลี่ยนรหัสอยู่แล้ว)
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ตั้งรหัสผ่านใหม่ไม่สำเร็จ");
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <ShieldAlert size={22} />
        </span>

        <h1 className="mt-4 text-lg font-semibold text-slate-800">ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
          รหัสผ่านที่คุณใช้เข้ามาเป็นรหัสที่ผู้ดูแลระบบตั้งให้ ซึ่งมีคนอื่นรู้ด้วย
          ตั้งรหัสใหม่ที่มีคุณคนเดียวรู้ก่อนใช้งานต่อ
        </p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            รหัสผ่านที่ได้รับมา
            <input
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-700">
            รหัสผ่านใหม่
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                required
                autoComplete="new-password"
                placeholder={PASSWORD_HINT}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                {...capsProps}
                className={`${inputClass} pr-9`}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <CapsLockHint on={capsOn} />
            <ThaiKeyboardHint value={next} />
            <PasswordStrengthBar value={next} personal={personal} />
            {/* หน้านี้มีไว้ตั้งรหัสอย่างเดียว — โชว์กฎตั้งแต่เปิดหน้า */}
            <PasswordRules value={next} personal={personal} show />
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-700">
            ยืนยันรหัสผ่านใหม่
            <input
              type={show ? "text" : "password"}
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
            <PasswordMatchHint password={next} confirm={confirm} />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" disabled={saving || !current || !nextOk || !matches} className="mt-1">
            {saving ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่และเข้าใช้งาน"}
          </Button>
        </form>

        {/* ทางออกเดียวที่ให้ไว้ — ไม่ใช่ปุ่มข้าม แต่คือการออกจากระบบไปเลย
            ไม่ใช้ <LogoutButton /> เพราะตัวนั้นเป็นปุ่มไอคอนกลมของแถบบน และถามยืนยันก่อน
            (กันงานที่ทำค้างหาย) ซึ่งที่นี่ไม่มีงานค้างให้หาย */}
        <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
          ยังไม่พร้อมตั้งรหัสตอนนี้?{" "}
          <button
            type="button"
            onClick={() => void logout()}
            className="text-slate-600 underline underline-offset-2 hover:text-slate-800"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  );
}
