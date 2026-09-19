import { useState, type SubmitEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { AccountBenefits } from "../components/AccountBenefits";
import { AuthShell } from "../components/AuthShell";
import { EyeIcon, EyeOffIcon } from "../components/FieldIcons";
import { WaveField } from "../components/WaveField";
import { ApiError, useAuth } from "../lib/auth-context";

export function RegisterPage() {
  const { user, status, register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "ready" && user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register({ fullName, email, phone, password, address: address.trim() || undefined });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "สมัครสมาชิกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="auth-card grid w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-xl md:grid-cols-2">
        {/* แผงบอกประโยชน์ — บนมือถืออยู่ใต้ฟอร์ม (order-2) */}
        <div className="auth-aside order-2 flex items-center border-t border-slate-100 bg-slate-50 p-8 md:order-1 md:border-t-0 md:border-r">
          <AccountBenefits />
        </div>
        <form
          onSubmit={handleSubmit}
          className="auth-form order-1 flex flex-col gap-4 p-8 md:order-2"
        >
          <h1 className="text-xl font-semibold text-slate-800 text-center">สมัครสมาชิก</h1>

        <WaveField
          id="reg-name"
          label="ชื่อ-นามสกุล"
          required
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <WaveField
          id="reg-email"
          label="อีเมล"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <WaveField
          id="reg-phone"
          label="เบอร์โทรศัพท์"
          required
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <WaveField
          id="reg-address"
          label="ที่อยู่ (ไม่บังคับ)"
          autoComplete="street-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={1000}
        />

        <WaveField
          id="reg-password"
          label="รหัสผ่าน"
          type={showPassword ? "text" : "password"}
          required
          minLength={8}
          autoComplete="new-password"
          // คำใบ้ข้อกำหนด โผล่ตอนโฟกัส (ไม่ใช่ค่าจริง)
          placeholder="อย่างน้อย 8 ตัวอักษร"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 bg-slate-800 text-white rounded py-2 font-medium disabled:opacity-50"
        >
          {submitting ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
        </button>

          <p className="text-sm text-center text-slate-500">
            มีบัญชีอยู่แล้ว?{" "}
            <Link to="/login" className="inline-flex min-h-11 items-center text-slate-800 underline lg:min-h-0">
              เข้าสู่ระบบ
            </Link>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
