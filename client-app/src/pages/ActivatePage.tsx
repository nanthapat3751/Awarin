import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { AccessTokenInfo } from "@systemboq/shared-types";

import { AccountBenefits } from "../components/AccountBenefits";
import { AuthShell } from "../components/AuthShell";
import { ApiError, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth-context";

// หน้าเปิดจากลิงก์ที่ทีมงานส่งให้: ลูกค้าตั้งรหัสผ่านของตัวเอง แล้วเข้าระบบดูใบเสนอราคาได้ทันที
export function ActivatePage() {
  const { token = "" } = useParams();
  const { activateAccount } = useAuth();
  const navigate = useNavigate();

  const [info, setInfo] = useState<AccessTokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<AccessTokenInfo>(`/api/auth/access/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "ลิงก์นี้ใช้ไม่ได้แล้วหรือหมดอายุ"),
      )
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (password !== confirm) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }
    setSubmitting(true);
    try {
      await activateAccount(token, password, address.trim() || undefined);
      navigate("/my/quotes", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ตั้งรหัสผ่านไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AuthShell>
        <p className="text-slate-400">กำลังตรวจสอบลิงก์...</p>
      </AuthShell>
    );
  }

  if (loadError) {
    return (
      <AuthShell>
        <div className="max-w-lg text-center">
          <h1 className="text-2xl font-semibold text-slate-800">ลิงก์ใช้ไม่ได้</h1>
          <p className="mt-2 text-slate-500">{loadError}</p>
          <Link
            to="/contact"
            className="mt-4 inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            ติดต่อทีมงานเพื่อขอลิงก์ใหม่
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="auth-card grid w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-xl md:grid-cols-2">
        <div className="auth-aside order-2 flex items-center border-t border-slate-100 bg-slate-50 p-8 md:order-1 md:border-t-0 md:border-r">
          <AccountBenefits />
        </div>
        <form onSubmit={handleSubmit} className="auth-form order-1 flex flex-col gap-4 p-8 md:order-2">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-slate-800">ตั้งรหัสผ่านเพื่อเข้าใช้งาน</h1>
            {info && (
              <p className="mt-1 text-sm text-slate-500">
                ตั้งรหัสผ่านสำหรับบัญชี{" "}
                <span className="font-medium text-slate-700">{info.email}</span> เพื่อเข้าดูใบเสนอราคา
              </p>
            )}
          </div>

          <label className="flex flex-col gap-1 text-sm text-slate-600">
            <span>รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-600">
            <span>ยืนยันรหัสผ่านอีกครั้ง</span>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 bg-slate-800 text-white rounded py-2 font-medium disabled:opacity-50"
          >
            {submitting ? "กำลังบันทึก..." : "ตั้งรหัสผ่านและเข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
