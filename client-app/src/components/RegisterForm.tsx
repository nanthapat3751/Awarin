import {
  EMAIL_ERROR_MESSAGE,
  looksLikeEmail,
  newAccountEmailProblem,
  normalizeEmail,
  normalizeThaiMobile,
  passwordProblem,
  PASSWORD_HINT,
  suggestEmailFix,
  THAI_MOBILE_ERROR_MESSAGE,
  validateFullName,
} from "@systemboq/shared-types";
import { useState, type ReactNode, type SubmitEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  CircleAlertIcon,
  CircleCheckIcon,
  EyeIcon,
  EyeOffIcon,
  FieldAdornment,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  UserIcon,
} from "./FieldIcons";
import { FormAlert } from "./FormAlert";
import {
  CapsLockHint,
  PasswordMatchHint,
  PasswordRules,
  PasswordStrengthBar,
  ThaiKeyboardHint,
} from "./PasswordHints";
import { WaveField } from "./WaveField";
import { useAuth } from "../lib/auth-context";
import { saveSignupTicket } from "../lib/signup-ticket";
import {
  describeFailure,
  inputFailure,
  isRetryable,
  type Failure,
} from "../lib/request-failure";
import { useCapsLock } from "../lib/use-caps-lock";

/**
 * ฟอร์มสมัครสมาชิก — เนื้อในฝั่งสว่างของการ์ดใบมีด (AuthBlade)
 *
 * ยาวกว่าฟอร์มเข้าสู่ระบบ 3 ช่อง การ์ดจึงต้องไล่ความสูงตามตอนสลับโหมด (ดู AuthBlade)
 */
/**
 * ค่าตั้งต้นที่ส่งมาทาง router state — ตอนนี้มาจากหน้าส่งคำขอสำเร็จ ("สมัครด้วยข้อมูลนี้")
 * ส่งทาง state ไม่ใช่ query string: ชื่อ/อีเมล/เบอร์เป็นข้อมูลส่วนตัว ห้ามโผล่ใน URL (ประวัติเบราว์เซอร์/log)
 */
export interface RegisterPrefill {
  fullName?: string;
  email?: string;
  phone?: string;
}

type CheckedField = "name" | "email" | "phone";

/**
 * ไอคอนท้ายช่อง (แบบ C): ยังไม่ได้ตรวจ = ไอคอนประจำช่อง · ถูก = ติ๊กเขียว · ผิด = ! แดง
 * ข้อความบอกเหตุอยู่ใต้ช่องเสมอ (WaveField error) — ไอคอนเป็นแค่สัญญาณเสริม โปรแกรมอ่านหน้าจอไม่ได้ยิน
 */
function statusAdornment(status: "ok" | "error" | null, icon: ReactNode) {
  if (status === "ok") {
    return (
      <FieldAdornment tone="ok">
        <CircleCheckIcon />
      </FieldAdornment>
    );
  }
  if (status === "error") {
    return (
      <FieldAdornment tone="error">
        <CircleAlertIcon />
      </FieldAdornment>
    );
  }
  return <FieldAdornment>{icon}</FieldAdornment>;
}

export function RegisterForm() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const prefill = (useLocation().state as { prefill?: RegisterPrefill } | null)?.prefill;
  const [fullName, setFullName] = useState(prefill?.fullName ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // เคยคลิกช่องรหัสแล้ว = โชว์รายการกฎค้างไว้ (ไม่ซ่อนตอนย้ายไปช่องยืนยันทั้งที่ยังไม่ครบ)
  const [passwordFocused, setPasswordFocused] = useState(false);
  // ช่องที่ออกมาแล้วอย่างน้อยหนึ่งครั้ง — หลังจากนั้นตรวจสดทุกตัวที่พิมพ์ (แก้ถูกแล้วแดงหายทันที)
  const [touched, setTouched] = useState<Record<CheckedField, boolean>>({ name: false, email: false, phone: false });
  // กดสมัครไปแล้ว = ช่องว่างก็เตือนด้วย (ก่อนหน้านั้นไม่เตือนช่องว่าง กด Tab ผ่านแล้วแดงทั้งฟอร์มน่ารำคาญ)
  const [submitTried, setSubmitTried] = useState(false);
  // อีเมลที่เพิ่งถูกกันเพราะโดเมน "น่าจะพิมพ์ผิด" (เดา) — กดสมัครซ้ำโดยไม่แก้ = ยืนยันว่าพิมพ์ถูกแล้ว
  const [warnedTypo, setWarnedTypo] = useState<string | null>(null);
  const touch = (field: CheckedField) => setTouched((t) => (t[field] ? t : { ...t, [field]: true }));
  const [failure, setFailure] = useState<Failure | null>(null);
  // ข้อผิดพลาดของช่องรหัสผ่าน: เคอร์เซอร์ไปที่ช่องนั้นแทน — กล่องแจ้งเตือนไม่ต้องแย่งโฟกัส
  const [fieldFailure, setFieldFailure] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { capsOn, capsProps } = useCapsLock();

  // เตือนหลังออกจากช่องแล้วเท่านั้น — ขึ้นแดงระหว่างที่ยังพิมพ์ค้างครึ่ง ๆ ทำให้รู้สึกเหมือนทำผิด
  // (แพตเทิร์นเดียวกับหน้าติดต่อเรา) · ใช้กฎชุดเดียวกับเซิร์ฟเวอร์จาก shared-types คนจะได้ไม่ต้อง
  // กดส่งก่อนถึงจะรู้ว่าพิมพ์ผิด
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizeThaiMobile(phone);
  /*
   * ข้อความอีเมลมีแค่ "กรุณากรอกอีเมล" / "กรุณากรอกอีเมลให้ถูกต้อง" และไม่มีปุ่มแนะนำ "หมายถึง ... หรือเปล่า"
   * (ผู้ใช้สั่ง 18 ต.ค. ให้เหมือนหน้าลืมรหัสผ่าน) — ยกเว้นอีเมลชั่วคราว ซึ่งรูปแบบถูกแต่ใช้สมัครไม่ได้ จึงบอกเหตุตรง ๆ
   * โดเมนพิมพ์ผิดมีสองชั้น: รายการที่ผิดแน่ชัด (gmial.com) เซิร์ฟเวอร์ตีกลับด้วย = กันตายตัว
   * · ที่ "เดา" จากระยะห่างตัวอักษร (suggestEmailFix) เดาผิดได้ = กันครั้งแรก กดสมัครซ้ำด้วยอีเมลเดิมผ่าน
   */
  const newAccountProblem = looksLikeEmail(normalizedEmail) ? newAccountEmailProblem(normalizedEmail) : null;
  const guessedTypo =
    looksLikeEmail(normalizedEmail) && newAccountProblem === null && suggestEmailFix(normalizedEmail) !== null;

  // ปัญหาของแต่ละช่องตามค่าปัจจุบัน (ไม่สนว่าเตือนหรือยัง) — ใช้ทั้งตอนแสดงและตอนกดสมัคร
  const problems: Record<CheckedField, string | null> = {
    name: validateFullName(fullName),
    email: (() => {
      if (normalizedEmail === "") return "กรุณากรอกอีเมล";
      if (!looksLikeEmail(normalizedEmail)) return EMAIL_ERROR_MESSAGE;
      if (newAccountProblem !== null) {
        // อีเมลชั่วคราวบอกเหตุของมันเอง · โดเมนที่ผิดแน่ชัด = ข้อความกลาง
        return newAccountProblem.startsWith("อีเมลชั่วคราว") ? newAccountProblem : EMAIL_ERROR_MESSAGE;
      }
      return guessedTypo ? EMAIL_ERROR_MESSAGE : null;
    })(),
    phone: (() => {
      if (phone.trim() === "") return "กรุณากรอกเบอร์โทรศัพท์";
      return normalizedPhone === null ? THAI_MOBILE_ERROR_MESSAGE : null;
    })(),
  };
  const values: Record<CheckedField, string> = { name: fullName, email, phone };
  // เตือนเมื่อ: ออกจากช่องแล้วและพิมพ์อะไรไว้ · หรือกดสมัครไปแล้ว (ช่องว่างก็เตือน)
  const shown = (field: CheckedField) => (touched[field] && values[field].trim() !== "") || submitTried;
  const fieldError = (field: CheckedField) => (shown(field) ? problems[field] : null);
  const fieldStatus = (field: CheckedField): "ok" | "error" | null => {
    if (fieldError(field)) return "error";
    // ติ๊กเขียวเมื่อออกจากช่องแล้วและผ่านกฎ
    if (touched[field] && problems[field] === null) return "ok";
    return null;
  };

  // ข้อมูลตัวเองที่ห้ามอยู่ในรหัสผ่าน — ส่งให้ตัวตรวจชุดเดียวกับที่เซิร์ฟเวอร์ใช้ คนจะได้รู้
  // ตั้งแต่ตอนพิมพ์ ไม่ใช่รู้ตอนกดสมัครแล้วถูกตีกลับ
  const personal = [normalizedEmail, fullName, phone];

  async function submit() {
    setFailure(null);
    setFieldFailure(false);
    setSubmitTried(true);

    // ช่องที่ผิดเตือนใต้ช่องพร้อมกันทุกช่อง แล้วพาเคอร์เซอร์ไปช่องแรกที่ผิด — ไม่ต้องมีกล่องแจ้งซ้ำ
    // โดเมนที่เดาว่าผิดและเคยกันไปแล้วครั้งหนึ่ง = ลูกค้ายืนยันว่าถูก ไม่กันซ้ำ (ข้อความแดงยังอยู่จนกว่าจะแก้)
    const acceptedTypo = guessedTypo && warnedTypo === normalizedEmail;
    const firstBad = (["name", "email", "phone"] as const).find(
      (f) => problems[f] !== null && !(f === "email" && acceptedTypo),
    );
    if (firstBad) {
      if (firstBad === "email" && guessedTypo) setWarnedTypo(normalizedEmail);
      document.getElementById(`reg-${firstBad}`)?.focus();
      return;
    }

    // ตรวจด้วยกฎชุดเดียวกับเซิร์ฟเวอร์ก่อนยิงคำขอ — ประหยัดรอบเดินทางและได้ข้อความเดียวกัน
    const passwordIssue = passwordProblem(password, personal);
    // ปุ่มกดได้เสมอ (เดิมล็อกไว้จนกฎครบ คนกดแล้วเงียบ ไม่รู้ว่าขาดอะไร — 16 ต.ค.)
    // กดแล้วบอกข้อที่ขาด + พาเคอร์เซอร์ไปช่องที่ต้องแก้
    if (passwordIssue !== null) {
      setFailure(inputFailure(passwordIssue));
      setFieldFailure(true);
      document.getElementById("reg-password")?.focus();
      return;
    }
    if (password !== confirm) {
      setFailure(inputFailure("รหัสผ่านทั้งสองช่องไม่ตรงกัน"));
      setFieldFailure(true);
      document.getElementById("reg-password-confirm")?.focus();
      return;
    }

    setSubmitting(true);
    try {
      // ส่งอีเมลที่ normalize แล้ว ให้ตรงกับที่เซิร์ฟเวอร์จะเก็บ (เซิร์ฟเวอร์ normalize ซ้ำอยู่ดี)
      const ticket = await register({
        fullName,
        email: normalizedEmail,
        // ผ่านด่านบนมาแล้ว normalizedPhone ไม่เป็น null — ส่งรูปแบบมาตรฐาน 0XXXXXXXXX
        phone: normalizedPhone ?? phone,
        password,
        address: address.trim() || undefined,
      });
      // ให้หน้ายืนยันแก้อีเมลได้ ถ้าเพิ่งรู้ตัวว่าพิมพ์ผิด
      if (ticket) saveSignupTicket(normalizedEmail, ticket);
      // สมัครเสร็จยังเข้าระบบไม่ได้ — ต้องกรอกรหัสที่ส่งไปทางอีเมลก่อน
      navigate(`/verify-email?email=${encodeURIComponent(normalizedEmail)}`, { replace: true });
    } catch (err) {
      setFailure(describeFailure(err, "สมัครสมาชิกไม่สำเร็จ"));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit();
  }

  return (
    // noValidate: ตรวจเองรายช่องเป็นภาษาไทย — ไม่ให้กล่องเด้งของเบราว์เซอร์ (บางเครื่องเป็นอังกฤษ) โผล่ก่อน
    <form noValidate onSubmit={handleSubmit} className="auth-form flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-800">สมัครสมาชิก</h1>

      <WaveField
        id="reg-name"
        label="ชื่อ-นามสกุล"
        required
        autoComplete="name"
        value={fullName}
        error={fieldError("name")}
        onChange={(e) => setFullName(e.target.value)}
        onBlur={() => touch("name")}
        trailing={statusAdornment(fieldStatus("name"), <UserIcon />)}
      />

      <WaveField
        id="reg-email"
        label="อีเมล"
        type="email"
        required
        autoComplete="email"
        value={email}
        error={fieldError("email")}
        onChange={(e) => setEmail(e.target.value)}
        onBlur={() => touch("email")}
        trailing={statusAdornment(fieldStatus("email"), <MailIcon />)}
      />

      <WaveField
        id="reg-phone"
        label="เบอร์โทรศัพท์"
        required
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        error={fieldError("phone")}
        onChange={(e) => setPhone(e.target.value)}
        onBlur={() => touch("phone")}
        trailing={statusAdornment(fieldStatus("phone"), <PhoneIcon />)}
      />

      <WaveField
        id="reg-address"
        label="ที่อยู่ (ไม่บังคับ)"
        autoComplete="street-address"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        maxLength={1000}
        trailing={
          <FieldAdornment>
            <MapPinIcon />
          </FieldAdornment>
        }
      />

      <div>
        <WaveField
          id="reg-password"
          label="รหัสผ่าน"
          type={showPassword ? "text" : "password"}
          required
          minLength={8}
          autoComplete="new-password"
          // คำใบ้ข้อกำหนด โผล่ตอนโฟกัส (ไม่ใช่ค่าจริง)
          placeholder={PASSWORD_HINT}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={() => setPasswordFocused(true)}
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
        <PasswordStrengthBar value={password} personal={personal} />
        <PasswordRules value={password} personal={personal} show={passwordFocused} />
      </div>

      {/* ช่องยืนยัน — พิมพ์ผิดในช่องที่มองไม่เห็นตัวอักษรแล้วต้องไปกดลืมรหัสผ่านทันที
          เป็นเรื่องที่กันได้ด้วยช่องเดียว · แสดงตลอดแบบเว็บทั่วไป (ผู้ใช้ขอ) รูปตาเปิดทั้งสองช่องพร้อมกัน */}
      <div>
        <WaveField
          id="reg-password-confirm"
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
          focus={!fieldFailure}
          onRetry={isRetryable(failure.kind) && !submitting ? () => void submit() : undefined}
        />
      )}

      <button
        type="submit"
        disabled={submitting}
        className="auth-submit mt-2 rounded-full bg-brand py-2.5 font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
      >
        {submitting ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
      </button>

      <p className="text-sm text-slate-500">
        มีบัญชีอยู่แล้ว?{" "}
        <Link
          to="/login"
          className="auth-link inline-flex min-h-11 items-center lg:min-h-0"
        >
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  );
}
