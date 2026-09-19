import {
  EMAIL_ERROR_MESSAGE,
  looksLikeEmail,
  GENERAL_INQUIRY_SERVICE_TYPE,
  NAME_MAX_LENGTH,
  SERVICE_TYPES,
  THAI_MOBILE_ERROR_MESSAGE,
  normalizeFullName,
  normalizeThaiMobile,
  validateFullName,
} from "@systemboq/shared-types";
import { useEffect, useState, type SubmitEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { AuthShell } from "../components/AuthShell";
import { Collapsible } from "../components/Collapsible";
import { Reveal } from "../components/Reveal";
import {
  CalendarIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  RulerIcon,
  UserIcon,
} from "../components/FieldIcons";
import { FloatingField } from "../components/FloatingField";
import { FacebookIcon, LineIcon, YoutubeIcon } from "../components/SocialIcons";
import { TurnstileWidget } from "../components/TurnstileWidget";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { createLead, getPublicSettings } from "../lib/public-api";
import { lineHref as toLineHref, safeHttpUrl } from "../lib/safe-url";

export function ContactPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const houseDesignId = searchParams.get("houseDesignId") ?? undefined;
  // ข้อมูลสำนักงานใช้ทั้งคอลัมน์ขวาและแถบแผนที่ท้ายหน้า จึงดึงที่เดียวแล้วส่งต่อ
  const office = useOfficeInfo();

  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  // เริ่มเป็นค่าว่างโดยตั้งใจ: การเลือกบริการไว้ล่วงหน้าจะทำให้คนส่งตัวเลือกที่ไม่ได้อ่านจริง
  // ส่วน `required` จะบล็อก placeholder ที่ว่างไว้
  const [serviceType, setServiceType] = useState("");
  const [message, setMessage] = useState("");
  // ข้อมูลโครงการเบื้องต้น (ถ้าลูกค้าทราบ) — ช่วยให้พนักงานเริ่มงานได้เร็วขึ้น ทุกช่อง optional
  const [siteAddress, setSiteAddress] = useState("");
  const [projectArea, setProjectArea] = useState("");
  const [desiredStart, setDesiredStart] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // CAPTCHA (Cloudflare Turnstile) — token ยืนยันว่าเป็นมนุษย์ ต้องมีก่อนส่ง
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  // โหลดวิดเจ็ต CAPTCHA เฉพาะตอนผู้ใช้เริ่มกรอกฟอร์ม (ไม่ให้กล่องค้างตั้งแต่เปิดหน้า) — พอเริ่มกรอก
  // มันจะยืนยันเงียบ ๆ ในพื้นหลัง token พร้อมทันเวลากดส่ง
  const [showCaptcha, setShowCaptcha] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.fullName);
      setEmail(user.email);
    }
  }, [user]);

  // ใช้พฤติกรรม "เตือนเฉพาะหลังออกจากช่องแล้ว" เหมือนช่องเบอร์/อีเมลด้านล่าง เพื่อไม่ให้ชื่อ
  // ที่พิมพ์ค้างครึ่ง ๆ ถูกขึ้นแดงระหว่างที่กำลังพิมพ์
  const nameError = nameTouched && name.trim() !== "" ? validateFullName(name) : null;

  const normalizedPhone = normalizeThaiMobile(phone);
  // เตือนเฉพาะเมื่อออกจากช่องแล้ว: การขึ้นแดงเบอร์ที่พิมพ์ค้างครึ่ง ๆ ระหว่างที่ยังพิมพ์อยู่
  // จะทำให้รู้สึกเหมือนทำอะไรผิด
  const phoneError =
    phoneTouched && phone.trim() !== "" && normalizedPhone === null
      ? THAI_MOBILE_ERROR_MESSAGE
      : null;

  const normalizedEmail = email.trim().toLowerCase();
  const emailLooksValid = looksLikeEmail(normalizedEmail);
  const emailError = emailTouched && normalizedEmail !== "" && !emailLooksValid ? EMAIL_ERROR_MESSAGE : null;

  // ข้อมูลโครงการเบื้องต้นมีความหมายเฉพาะงานก่อสร้าง/ออกแบบ — ซ่อนไว้สำหรับ "สอบถามทั่วไป"
  // เพื่อไม่ให้ฟอร์มดูยาวเกินจำเป็นสำหรับคนที่แค่มาถามคำถาม
  const showProjectInfo = serviceType !== "" && serviceType !== GENERAL_INQUIRY_SERVICE_TYPE;
  const parsedArea = Number(projectArea);
  const areaValid = projectArea.trim() !== "" && Number.isFinite(parsedArea) && parsedArea > 0;

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const nameValidationError = validateFullName(name);
    if (nameValidationError) {
      setNameTouched(true);
      setError(nameValidationError);
      return;
    }
    if (normalizedPhone === null) {
      setPhoneTouched(true);
      setError(THAI_MOBILE_ERROR_MESSAGE);
      return;
    }
    if (!emailLooksValid) {
      setEmailTouched(true);
      setError(EMAIL_ERROR_MESSAGE);
      return;
    }
    if (!turnstileToken) {
      setError("กรุณายืนยันว่าคุณไม่ใช่บอทก่อนส่งคำขอ");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createLead({
        name: normalizeFullName(name),
        phone: normalizedPhone,
        email: normalizedEmail,
        serviceType,
        houseDesignId,
        message: message || undefined,
        // แนบข้อมูลโครงการเบื้องต้นเฉพาะงานก่อสร้าง/ออกแบบ และเฉพาะช่องที่กรอกจริง
        siteAddress: showProjectInfo && siteAddress.trim() !== "" ? siteAddress.trim() : undefined,
        areaSqm: showProjectInfo && areaValid ? parsedArea : undefined,
        desiredStartDate: showProjectInfo && desiredStart !== "" ? desiredStart : undefined,
        turnstileToken,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ส่งคำขอไม่สำเร็จ");
      // token ของ Turnstile ใช้ได้ครั้งเดียว — รีเซ็ตวิดเจ็ตเพื่อให้ลองส่งใหม่ได้
      setTurnstileToken(null);
      setTurnstileReset((v) => v + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <>
        <AuthShell>
          <div className="success-card w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-lg">
            {/* เครื่องหมายถูกวาดตัวเอง (วงกลมก่อน แล้วขีดถูก) — จังหวะเดียวที่ยอมให้มีลูกเล่นในหน้านี้
                เพราะเป็นปลายทางของการกรอกฟอร์ม ไม่ใช่ของประดับระหว่างทาง */}
            <svg
              viewBox="0 0 52 52"
              className="mx-auto mb-4 h-16 w-16 text-emerald-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle className="success-circle" cx="26" cy="26" r="23" />
              <path className="success-mark" d="M15 27l7.5 7.5L37 20" />
            </svg>
            <h1 className="text-2xl font-semibold text-slate-800">ส่งคำขอเรียบร้อยแล้ว</h1>
            <p className="text-slate-500 mt-2">ทีมงานจะติดต่อกลับโดยเร็วที่สุด ขอบคุณที่สนใจบริการของเรา</p>
            {/* ข้อความ just-in-time: บอกล่วงหน้าว่าบัญชี + ลิงก์ติดตามงานจะตามมาเมื่อมีใบเสนอราคา */}
            <p className="mt-4 rounded-md bg-brand/5 px-4 py-3 text-sm leading-relaxed text-slate-600">
              เมื่อมีใบเสนอราคา เราจะส่งลิงก์ให้คุณเข้าดูรายละเอียดและติดตามสถานะงานได้
            </p>
          </div>
        </AuthShell>
        <MapBand office={office} />
      </>
    );
  }

  return (
    <>
      <AuthShell fill={false}>
        {/* สองคอลัมน์ ไม่มีการ์ดขาวครอบแล้ว
            ทำไมถึงเอากรอบออก: พื้นหลังของ AuthShell เกือบขาวอยู่แล้ว เงาการ์ดจึงเป็นขาวบนขาว
            แทบไม่ได้ทำหน้าที่แยกอะไร ส่วนช่องกรอกมีเส้นขอบของตัวเองอยู่แล้ว เอาการ์ดออกก็ยังอ่านออก
            ของเดิมวางการ์ดซ้อนกันสองใบกว้าง 512px ทำให้หน้าสูง 1,653px จนที่อยู่ตกใต้เส้นพับ
            ทั้งที่จอ 1440px เหลือที่ว่างซ้าย-ขวารวม 928px (64% ของจอ) */}
        {/* ต่ำกว่า lg คอลัมน์ซ้อนลงมา จึงคุมความกว้างไว้เท่าการ์ดเดิม ไม่ให้ช่องกรอกยืดเป็น 736px
            บนแท็บเล็ตแล้วป้ายกำกับลอยห่างจากขอบขวาไปไกล */}
        <div className="w-full max-w-xl lg:max-w-5xl">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-5 lg:gap-16">
            {/* ห่อด้วย Reveal ที่ตัว "ลูกของกริด" โดยตรง — ถ้าห่อไว้ข้างในแล้วปล่อย div เดิมเป็นลูกกริด
                คลาส lg:col-span-3 จะไปอยู่ผิดชั้น คอลัมน์จะหลุดสัดส่วน 3:2 ทันที */}
            <Reveal className="lg:col-span-3">
              <h1 className="text-2xl font-semibold text-slate-800">ติดต่อเรา</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                กรอกรายละเอียดด้านล่าง แล้วทีมงานจะติดต่อกลับโดยเร็วที่สุด
              </p>
              <form
                onSubmit={handleSubmit}
                onFocus={() => setShowCaptcha(true)}
                className="mt-6 flex flex-col gap-4"
              >
                <FloatingField
                  id="name"
                  label="ชื่อ-นามสกุล"
                  icon={<UserIcon />}
                  error={nameError}
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  // ตัด/ยุบช่องว่างเมื่อออกจากช่องแล้ว เพื่อให้สิ่งที่เห็นตรงกับสิ่งที่ถูกเก็บ
                  onBlur={() => {
                    setNameTouched(true);
                    setName((current) => normalizeFullName(current));
                  }}
                  maxLength={NAME_MAX_LENGTH}
                />
                <FloatingField
                  id="phone"
                  label="เบอร์โทรศัพท์มือถือ"
                  icon={<PhoneIcon />}
                  error={phoneError}
                  required
                  inputMode="tel"
                  // คำใบ้รูปแบบ โผล่ตอนโฟกัส (ไม่ใช่เบอร์จริง)
                  placeholder="08X-XXX-XXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => {
                    setPhoneTouched(true);
                    setPhone((current) => normalizeThaiMobile(current) ?? current);
                  }}
                />
                <FloatingField
                  id="email"
                  label="อีเมล"
                  icon={<MailIcon />}
                  error={emailError}
                  required
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => {
                    setEmailTouched(true);
                    setEmail((current) => current.trim().toLowerCase());
                  }}
                />
                <div className="relative">
                  <label
                    htmlFor="serviceType"
                    className="pointer-events-none absolute left-3 top-2 z-10 text-xs text-slate-500"
                  >
                    บริการที่สนใจ
                  </label>
                  <select
                    id="serviceType"
                    required
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className={`field-glow w-full rounded border border-slate-300 bg-white pl-3 pr-3 pt-6 pb-2 focus:border-brand focus:outline-none ${
                      serviceType ? "text-slate-800" : "text-slate-400"
                    }`}
                  >
                    <option value="" disabled>
                      เลือกบริการที่สนใจ
                    </option>
                    {SERVICE_TYPES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                {/* ข้อมูลโครงการเบื้องต้น — โผล่เฉพาะงานก่อสร้าง/ออกแบบ ช่วยให้ทีมงานเริ่มงานได้เร็วขึ้น
                    และไปเติมในโครงการอัตโนมัติเมื่อพนักงานสร้างโครงการจากคำขอนี้ ทุกช่องไม่บังคับ */}
                {/* กางออกแทนการโผล่ทันที — บล็อกนี้สูง ~214px ถ้าโผล่พรึ่บจะดันปุ่มส่งหนีมือผู้ใช้ */}
                <Collapsible open={showProjectInfo}>
                  <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs font-medium text-slate-500">
                      ข้อมูลโครงการเบื้องต้น{" "}
                      <span className="font-normal text-slate-400">(ถ้าทราบ — ไม่บังคับ)</span>
                    </p>
                    <FloatingField
                      id="siteAddress"
                      label="สถานที่ก่อสร้าง / ที่ตั้งที่ดิน"
                      icon={<MapPinIcon />}
                      value={siteAddress}
                      onChange={(e) => setSiteAddress(e.target.value)}
                      maxLength={1000}
                    />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FloatingField
                        id="projectArea"
                        label="พื้นที่โดยประมาณ (ตร.ม.)"
                        icon={<RulerIcon />}
                        inputMode="decimal"
                        value={projectArea}
                        // ฟอร์มสาธารณะจึงไม่เข้มงวด: รับเฉพาะตัวเลข/จุดทศนิยม
                        onChange={(e) => setProjectArea(e.target.value.replace(/[^\d.]/g, ""))}
                      />
                      {/* ช่องวันที่ใช้เลย์เอาต์เดียวกับ select ด้านบน (label ลอยบน + ไอคอนซ้าย) */}
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                          <CalendarIcon />
                        </span>
                        <label
                          htmlFor="desiredStart"
                          className="pointer-events-none absolute left-10 top-2 z-10 text-xs text-slate-500"
                        >
                          ช่วงที่อยากเริ่มก่อสร้าง
                        </label>
                        <input
                          id="desiredStart"
                          type="date"
                          value={desiredStart}
                          onChange={(e) => setDesiredStart(e.target.value)}
                          className={`field-glow w-full rounded border border-slate-300 bg-white pl-10 pr-3 pt-6 pb-2 focus:border-brand focus:outline-none ${
                            desiredStart ? "text-slate-800" : "text-slate-400"
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                </Collapsible>

                <div className="relative">
                  <label
                    htmlFor="message"
                    className="pointer-events-none absolute left-3 top-2 z-10 text-xs text-slate-500"
                  >
                    รายละเอียดที่ต้องการ
                  </label>
                  <textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    placeholder="เล่ารายละเอียดที่ต้องการ เช่น งบประมาณ ขนาดพื้นที่/ที่ดิน สไตล์ที่ชอบ หรือคำถามที่อยากสอบถาม"
                    className="field-glow w-full rounded border border-slate-300 bg-white pl-3 pr-3 pt-6 pb-2 text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none"
                  />
                </div>

                {/* วิดเจ็ตยัง mount ตอนโฟกัสเหมือนเดิม (ไม่โหลดสคริปต์ก่อนเวลา) แต่ตัวครอบอยู่ในดอมตลอด
                    ทรานซิชันจึงมีเฟรมเริ่มต้นให้ไล่ */}
                <Collapsible open={showCaptcha}>
                  {showCaptcha && (
                    <TurnstileWidget onVerify={setTurnstileToken} resetSignal={turnstileReset} />
                  )}
                </Collapsible>

                <Collapsible open={Boolean(error)}>
                  <p className="text-sm text-red-600">{error}</p>
                </Collapsible>

                <button
                  type="submit"
                  disabled={submitting || !turnstileToken}
                  className="bg-slate-800 text-white rounded py-2 font-medium disabled:opacity-50"
                >
                  {submitting ? "กำลังส่ง..." : "ส่งคำขอ"}
                </button>
              </form>
            </Reveal>

            <OfficeInfo office={office} />
          </div>
        </div>
      </AuthShell>
      <MapBand office={office} />
    </>
  );
}

type OfficeInfoData = {
  address: string;
  phone: string;
  email: string;
  companyName: string;
  /** คำค้นที่เข้ารหัสแล้วสำหรับเล็งแผนที่ — ว่างเมื่อยังไม่มีที่อยู่ในหน้าตั้งค่า */
  mapQuery: string;
  settings: Record<string, string>;
};

/**
 * ดึงข้อมูลติดต่อจากหน้าตั้งค่ามาที่เดียว แล้วแจกให้ทั้งคอลัมน์ขวาและแถบแผนที่ท้ายหน้า
 * (ก่อนหน้านี้การ์ดที่อยู่ยิง getPublicSettings เองซ้ำกับที่ฟุตเตอร์ยิงอยู่แล้ว)
 */
function useOfficeInfo(): OfficeInfoData {
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    getPublicSettings()
      .then((res) => setSettings(res.settings))
      .catch(() => undefined);
  }, []);

  const address = settings.companyAddress?.trim() ?? "";
  const phone = settings.companyPhone?.trim() ?? "";
  const email = settings.companyEmail?.trim() ?? "";
  const companyName = settings.companyName?.trim() || "สำนักงาน";

  // ต้องเป็น "ชื่อบริษัท + ที่อยู่" เท่านั้น — ทดสอบกับที่อยู่จริงแล้วทั้งสามแบบให้ผลต่างกันมาก:
  //   ที่อยู่ล้วน      → แผนที่เลื่อนไปถูกย่าน แต่ "ไม่ปักหมุด" เลย (เลขที่บ้านไทยไม่ถูก geocode)
  //   ชื่อบริษัทล้วน  → ไปโผล่คนละที่ (เจอบริษัทอื่นที่ชื่อใกล้เคียง)
  //   ชื่อ + ที่อยู่   → เจอรายการธุรกิจจริงบน Google และปักหมุดตรงจุด ✓
  // ถ้าวันหนึ่งหมุดเพี้ยน ให้แก้ที่ชื่อ/ที่อยู่ในหน้าตั้งค่าให้ตรงกับที่จดไว้บน Google Business
  const mapQuery = address ? encodeURIComponent(`${companyName} ${address}`) : "";

  return { address, phone, email, companyName, mapQuery, settings };
}

/**
 * คอลัมน์ข้อมูลติดต่อ (ขวาของฟอร์ม) — ไม่มีการ์ด มีแค่เส้นคั่นบาง ๆ บนจอกว้าง
 *
 * ทำไมต้องมี: ก่อนหน้านี้หน้าติดต่อเราไม่มีที่อยู่หรือเบอร์โทรเลยสักตัว มีแต่ฟอร์มล้วน ๆ
 * ที่อยู่โผล่แค่ในฟุตเตอร์ — คนที่อยากโทรหรือขับรถมาหาต้องเลื่อนลงไปหาเอง
 *
 * อีเมลมาจากหน้าตั้งค่า (companyEmail) — ยังไม่มี "แฟกซ์" เพราะไม่มีคีย์นี้ ถ้าจะเพิ่มต้องแก้ทั้ง
 * PUBLIC_SETTING_KEYS ฝั่งเซิร์ฟเวอร์และหน้าตั้งค่าก่อน
 */
function OfficeInfo({ office }: Readonly<{ office: OfficeInfoData }>) {
  const { address, phone, email, companyName, mapQuery, settings } = office;

  // กรอง href ให้เหลือเฉพาะ http/https จริง (กัน javascript:/data: → stored XSS) เหมือนฟุตเตอร์
  const facebookHref = safeHttpUrl(settings.companyFacebook);
  const youtubeHref = safeHttpUrl(settings.companyYoutube);
  const lineHref = toLineHref(settings.companyLine);

  if (!address && !phone && !email && !facebookHref && !youtubeHref && !lineHref) return null;

  return (
    // หน่วงกว่าฟอร์มเล็กน้อยให้อ่านเป็นลำดับ ซ้ายก่อนขวา — ไม่ใช่โผล่พร้อมกันสองก้อน
    <Reveal className="lg:col-span-2 lg:self-start" delay={120}>
      <aside className="lg:border-l lg:border-slate-200 lg:pl-12">
          <h2 className="text-lg font-semibold text-slate-800">ที่อยู่สำนักงาน</h2>
        <ul className="mt-5 flex flex-col gap-4 text-sm">
          {address && (
            <li className="flex gap-3">
              <MapPinIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <div>
                <p className="font-medium text-slate-800">{companyName}</p>
                {/* ปล่อยให้ที่อยู่ตัดบรรทัดเองในคอลัมน์แคบ — ไม่ตัดคำจาก "ตำบล/อำเภอ/จังหวัด"
                    เพราะช่องที่อยู่ในหน้าตั้งค่าพิมพ์อิสระ กฎแบบนั้นพังทันทีที่รูปแบบเปลี่ยน */}
                <p className="mt-1 leading-relaxed text-slate-600">{address}</p>
              </div>
            </li>
          )}
          {phone && (
            <li className="flex items-center gap-3">
              <PhoneIcon className="h-5 w-5 shrink-0 text-brand" />
              <a
                href={`tel:${phone.replace(/\s+/g, "")}`}
                className="inline-flex min-h-11 items-center font-medium text-slate-700 transition-colors hover:text-brand lg:min-h-0"
              >
                {phone}
              </a>
            </li>
          )}
          {email && (
            <li className="flex items-center gap-3">
              <MailIcon className="h-5 w-5 shrink-0 text-brand" />
              <a
                href={`mailto:${email}`}
                className="inline-flex min-h-11 items-center break-all font-medium text-slate-700 transition-colors hover:text-brand lg:min-h-0"
              >
                {email}
              </a>
            </li>
          )}
          {facebookHref && (
            <li className="flex items-center gap-3">
              <FacebookIcon className="h-5 w-5 shrink-0 text-brand" />
              <a
                href={facebookHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-slate-700 transition-colors hover:text-brand lg:min-h-0"
              >
                Facebook
              </a>
            </li>
          )}
          {youtubeHref && (
            <li className="flex items-center gap-3">
              <YoutubeIcon className="h-5 w-5 shrink-0 text-brand" />
              <a
                href={youtubeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-slate-700 transition-colors hover:text-brand lg:min-h-0"
              >
                YouTube
              </a>
            </li>
          )}
          {lineHref && (
            <li className="flex items-center gap-3">
              <LineIcon className="h-5 w-5 shrink-0 text-brand" />
              <a
                href={lineHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-slate-700 transition-colors hover:text-brand lg:min-h-0"
              >
                LINE
              </a>
            </li>
          )}
        </ul>
        {address && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-brand px-4 text-sm font-medium text-brand transition-colors hover:bg-brand hover:text-white"
          >
            Google Maps
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="h-3.5 w-3.5"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
            </svg>
          </a>
        )}
      </aside>
    </Reveal>
  );
}

/**
 * แถบแผนที่เต็มความกว้างจอ คั่นระหว่างเนื้อหากับฟุตเตอร์
 *
 * อยู่นอก AuthShell โดยตั้งใจ — AuthShell มี px-4 py-16 และจัดกึ่งกลาง ถ้าวางแผนที่ไว้ข้างในจะได้
 * กล่องแคบ ๆ กลางหน้าแทนที่จะเป็นแถบเต็มจอ (main ไม่มี max-width จึงเต็มจอได้จริง)
 *
 * แผนที่ใช้ลิงก์ฝังแบบไม่ต้องมี API key (`?q=...&output=embed`) จึงไม่มีค่าใช้จ่ายและไม่ต้องผูก
 * บัญชี Cloud ใด ๆ และเล็งจาก companyAddress ในหน้าตั้งค่าโดยตรง — แก้ที่อยู่ในหน้าตั้งค่าแล้ว
 * หมุดขยับตาม ไม่ต้องกลับมาแก้โค้ด
 *
 * **แผนที่นี้ทำให้ Google เห็นหมายเลขไอพีของทุกคนที่เปิดหน้านี้** ไม่ว่าจะดูแผนที่หรือไม่
 * จึงต้องมีชื่ออยู่ในหน้านโยบายความเป็นส่วนตัวข้อ 5 และข้อ 6 (การส่งข้อมูลออกนอกราชอาณาจักร)
 * ถ้าวันหนึ่งเอาแผนที่ออก อย่าลืมถอดออกจากนโยบายด้วย
 *
 * loading="lazy" — โหลดตอนเลื่อนมาถึง ไม่ต้องกดปุ่มอะไรก่อน แต่ก็ไม่ถ่วงตอนเปิดหน้าแรก
 */
function MapBand({ office }: Readonly<{ office: OfficeInfoData }>) {
  const { mapQuery, companyName } = office;
  if (!mapQuery) return null;

  return (
    <section className="w-full border-t border-slate-200">
      {/* หน่วงเป็นลำดับสุดท้ายต่อจากสองคอลัมน์ด้านบน (0 → 120 → 200ms)
          วัดจริงบนจอ 1440x1000: แถบแผนที่เริ่มที่ y≈792 คือ "โผล่พ้นเส้นพับอยู่แล้ว" ไม่ได้รอเลื่อน
          จอเตี้ยกว่านี้ถึงจะเผยตอนเลื่อนมาถึง — หน่วงไว้จึงได้ลำดับบนลงล่างทั้งสองกรณี
          (loading="lazy" ของ iframe ดูระยะจากจอ ไม่ได้ดู opacity การหน่วงตรงนี้จึงไม่กันแผนที่โหลด) */}
      <Reveal delay={200}>
        <iframe
          title={`แผนที่ ${companyName}`}
          src={`https://www.google.com/maps?q=${mapQuery}&hl=th&z=16&output=embed`}
          className="block h-64 w-full border-0 sm:h-80 lg:h-[420px]"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </Reveal>
    </section>
  );
}
