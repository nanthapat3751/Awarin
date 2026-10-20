import {
  AREA_RANGES,
  EMAIL_ERROR_MESSAGE,
  looksLikeEmail,
  type AreaRange,
  GENERAL_INQUIRY_SERVICE_TYPE,
  NAME_MAX_LENGTH,
  SERVICE_TYPES,
  THAI_MOBILE_ERROR_MESSAGE,
  normalizeFullName,
  normalizeThaiMobile,
  validateFullName,
} from "@systemboq/shared-types";
import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AuthShell } from "../components/AuthShell";
import type { RegisterPrefill } from "../components/RegisterForm";
import { Collapsible } from "../components/Collapsible";
import { DateInput } from "../components/DateInput";
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
import { Skeleton, SkeletonGroup } from "../components/Skeleton";
import { TurnstileWidget } from "../components/TurnstileWidget";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { cachedPublicSettings, createLead, getPublicSettings } from "../lib/public-api";
import { lineHref as toLineHref, safeHttpUrl } from "../lib/safe-url";
import { usePageMeta } from "../lib/page-meta";

/** หลังส่งคำขอ — ลำดับงานจริงของบริษัท (ขั้นที่ 3 = ลิงก์ "พื้นที่ลูกค้า" ที่พนักงานออกให้เมื่อมีใบเสนอราคา) */
const NEXT_STEPS = [
  { title: "ทีมงานติดต่อกลับ", desc: "ทางโทรศัพท์หรืออีเมลที่ให้ไว้ เพื่อคุยรายละเอียดงาน" },
  { title: "ประเมินราคาและทำใบเสนอราคา", desc: "แยกค่าวัสดุและค่าแรงทุกรายการ" },
  { title: "รับลิงก์เข้า “พื้นที่ลูกค้า”", desc: "ดูใบเสนอราคา อนุมัติ และติดตามสัญญากับงวดเงินออนไลน์" },
];

export function ContactPage() {
  usePageMeta(
    "ติดต่อเรา",
    "ขอคำปรึกษาหรือประเมินราคาสร้างบ้านฟรี กรอกแบบฟอร์มแล้วทีมงานติดต่อกลับ หรือดูที่ตั้งสำนักงานและช่องทางติดต่อ",
  );
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
  // ช่วงพื้นที่ (บังคับเลือกช่วง/ยังไม่ทราบ หรือพิมพ์ตัวเลข อย่างใดอย่างหนึ่ง) — เลือกอย่างหนึ่งแล้วอีกอย่างถูกล้าง
  const [areaRange, setAreaRange] = useState<AreaRange | null>(null);
  // กดส่งโดยยังไม่ได้บอกขนาดพื้นที่ — ขึ้นแดงที่กลุ่มปุ่ม
  const [areaMissing, setAreaMissing] = useState(false);
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
      // ?? "" เป็นแค่การกันชนิดข้อมูล — คอลัมน์อีเมลเป็น null ได้ตั้งแต่ฝั่งพนักงานย้ายไปใช้ชื่อผู้ใช้
      // แต่บัญชีลูกค้าทุกใบยังต้องมีอีเมลเสมอ (บังคับที่ชั้นแอป) จึงไม่มีเคสจริงที่ว่าง
      setEmail(user.email ?? "");
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
    // งานออกแบบ/ก่อสร้างต้องบอกขนาดพื้นที่อย่างใดอย่างหนึ่ง — "ยังไม่ทราบ" ก็นับ (ไม่บังคับเดาตัวเลข)
    if (showProjectInfo && !areaValid && areaRange === null) {
      setAreaMissing(true);
      setError(AREA_REQUIRED_MESSAGE);
      document.querySelector<HTMLInputElement>('input[name="areaRange"]')?.focus();
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
        areaRange: showProjectInfo && !areaValid && areaRange ? areaRange : undefined,
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
            <p className="text-slate-500 mt-1">ขอบคุณที่สนใจบริการของเรา</p>
            {/* ขั้นตอนต่อไป (ผู้ใช้เลือกแบบ B 14 ต.ค. 2026 แทนป็อปอัพ) — บอกว่าหลังจากนี้จะเกิดอะไร
                และ "พื้นที่ลูกค้า" (ชื่อเดียวกับปุ่มบนแถบเมนู) มาถึงมือตอนไหน */}
            <div className="mt-6 text-left">
              <p className="text-sm font-semibold text-slate-900">ขั้นตอนต่อไป</p>
              <ol className="mt-3 flex flex-col gap-4">
                {NEXT_STEPS.map((step, i) => (
                  <li key={step.title} className="flex gap-3">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm tabular-nums ${
                        i === 0 ? "bg-brand text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{step.title}</p>
                      <p className="text-sm leading-relaxed text-slate-500">{step.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            {/* สมัครไว้ก่อน (ไม่บังคับ) — เฉพาะคนที่ยังไม่เข้าระบบ · ใช้อีเมลเดียวกับคำขอ ตอนบริษัทออกลิงก์
                ระบบจะผูกบัญชีนี้ให้เอง (issueCustomerAccessLink จับคู่ตามอีเมล) ใบเสนอราคาจึงเข้าบัญชีนี้ */}
            {!user && (
              <div className="mt-6 rounded-lg bg-brand/5 px-4 py-3 text-left text-sm text-slate-600">
                <p>
                  อยากเตรียมบัญชีไว้ก่อน?{" "}
                  <Link
                    to="/register"
                    state={{ prefill: { fullName: normalizeFullName(name), email: normalizedEmail, phone } satisfies RegisterPrefill }}
                    className="font-medium text-brand hover:underline"
                  >
                    สมัครด้วยอีเมลนี้ →
                  </Link>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  ไม่บังคับ — ใบเสนอราคาจะเข้าบัญชีนี้เองเมื่อพร้อม · มีบัญชีแล้ว?{" "}
                  <Link to="/login" className="font-medium text-brand hover:underline">
                    เข้าสู่ระบบ
                  </Link>
                </p>
              </div>
            )}
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
                      <span className="font-normal text-slate-400">(ช่องอื่นกรอกถ้าทราบ)</span>
                    </p>
                    <FloatingField
                      id="siteAddress"
                      label="สถานที่ก่อสร้าง / ที่ตั้งที่ดิน"
                      icon={<MapPinIcon />}
                      value={siteAddress}
                      onChange={(e) => setSiteAddress(e.target.value)}
                      maxLength={1000}
                    />
                    <AreaRangePicker
                      value={areaRange}
                      missing={areaMissing}
                      onChange={(next) => {
                        setAreaRange(next);
                        setProjectArea("");
                        setAreaMissing(false);
                      }}
                    />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FloatingField
                        id="projectArea"
                        label="หรือพิมพ์ตัวเลขถ้าทราบ (ตร.ม.)"
                        icon={<RulerIcon />}
                        inputMode="decimal"
                        value={projectArea}
                        // ฟอร์มสาธารณะจึงไม่เข้มงวด: รับเฉพาะตัวเลข/จุดทศนิยม · พิมพ์แล้วช่วงที่เลือกไว้ถูกล้าง
                        onChange={(e) => {
                          const next = e.target.value.replace(/[^\d.]/g, "");
                          setProjectArea(next);
                          if (next !== "") {
                            setAreaRange(null);
                            setAreaMissing(false);
                          }
                        }}
                      />
                      {/* ช่องวันที่ใช้เลย์เอาต์เดียวกับ select ด้านบน (label ลอยบน + ไอคอนซ้าย) */}
                      <div className="relative">
                        <label
                          htmlFor="desiredStart"
                          className="pointer-events-none absolute left-10 top-2 z-10 text-xs text-slate-500"
                        >
                          ช่วงที่อยากเริ่มก่อสร้าง
                        </label>
                        {/* วว/ดด/ปปปป เสมอ — ช่องวันที่ของเบราว์เซอร์ขึ้นเดือนก่อนในเครื่องที่ตั้งภาษาอังกฤษ */}
                        <DateInput
                          id="desiredStart"
                          value={desiredStart}
                          onChange={setDesiredStart}
                          icon={<CalendarIcon />}
                          className="field-glow w-full rounded border border-slate-300 bg-white pl-10 pr-3 pt-6 pb-2 text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none"
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
  /** ยังไม่รู้ค่าตั้งเลย (เปิดเว็บครั้งแรก + API ยังไม่ตอบ) → คอลัมน์ขวาและแผนที่เป็นแสงวิ่ง */
  pending: boolean;
};

/**
 * ดึงข้อมูลติดต่อจากหน้าตั้งค่ามาที่เดียว แล้วแจกให้ทั้งคอลัมน์ขวาและแถบแผนที่ท้ายหน้า
 * (ก่อนหน้านี้การ์ดที่อยู่ยิง getPublicSettings เองซ้ำกับที่ฟุตเตอร์ยิงอยู่แล้ว)
 */
function useOfficeInfo(): OfficeInfoData {
  // เริ่มจากค่าที่จำไว้จากการเปิดครั้งก่อน · null = ยังไม่รู้ — เดิมเริ่มจาก {} คอลัมน์ที่อยู่กับแถบแผนที่
  // จึงไม่มีเลยตอนแรก แล้วค่อยโผล่มาดันเลย์เอาต์ · โหลดไม่สำเร็จ = ถือว่าไม่มีข้อมูล (ไม่ให้แสงวิ่งค้าง)
  const [loaded, setLoaded] = useState<Record<string, string> | null>(cachedPublicSettings);

  useEffect(() => {
    getPublicSettings()
      .then((res) => setLoaded(res.settings))
      .catch(() => setLoaded((prev) => prev ?? {}));
  }, []);

  const pending = loaded === null;
  const settings = loaded ?? {};

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

  return { address, phone, email, companyName, mapQuery, settings, pending };
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
  const { address, phone, email, companyName, mapQuery, settings, pending } = office;

  if (pending) {
    // ทรงเดียวกับคอลัมน์จริง (หัวข้อ · ที่อยู่สองบรรทัด · เบอร์ · อีเมล · ปุ่ม Google Maps)
    return (
      <div className="lg:col-span-2 lg:self-start">
        <SkeletonGroup label="กำลังโหลดที่อยู่สำนักงาน" className="lg:border-l lg:border-slate-200 lg:pl-12">
          <Skeleton className="h-6 w-36" />
          <div className="mt-5 flex flex-col gap-4">
            {["w-4/5", "w-2/3", "w-1/2"].map((w) => (
              <div key={w} className="flex items-center gap-3">
                <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                <Skeleton className={`h-4 ${w}`} />
              </div>
            ))}
          </div>
          <Skeleton className="mt-5 h-11 w-36 rounded-lg" />
        </SkeletonGroup>
      </div>
    );
  }

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
  const { mapQuery, companyName, pending } = office;
  // แสงวิ่งรองใต้แผนที่จน Google Maps วาดเสร็จ (เดิมเป็นช่องเทาเปล่าระหว่างรอ)
  const [mapReady, setMapReady] = useState(false);
  if (pending) {
    // ยังไม่รู้ว่ามีที่อยู่ไหม — จองแถบไว้ก่อน (บริษัทส่วนใหญ่มีที่อยู่) ไม่ให้แผนที่โผล่มาดันฟุตเตอร์ทีหลัง
    return (
      <section className="w-full border-t border-slate-200">
        <SkeletonGroup label="กำลังโหลดแผนที่">
          <Skeleton className="h-64 w-full rounded-none sm:h-80 lg:h-[420px]" />
        </SkeletonGroup>
      </section>
    );
  }
  if (!mapQuery) return null;

  return (
    <section className="w-full border-t border-slate-200">
      {/* หน่วงเป็นลำดับสุดท้ายต่อจากสองคอลัมน์ด้านบน (0 → 120 → 200ms)
          วัดจริงบนจอ 1440x1000: แถบแผนที่เริ่มที่ y≈792 คือ "โผล่พ้นเส้นพับอยู่แล้ว" ไม่ได้รอเลื่อน
          จอเตี้ยกว่านี้ถึงจะเผยตอนเลื่อนมาถึง — หน่วงไว้จึงได้ลำดับบนลงล่างทั้งสองกรณี
          (loading="lazy" ของ iframe ดูระยะจากจอ ไม่ได้ดู opacity การหน่วงตรงนี้จึงไม่กันแผนที่โหลด) */}
      <Reveal delay={200}>
        <div className="relative h-64 sm:h-80 lg:h-[420px]">
          {!mapReady && <div aria-hidden className="skeleton absolute inset-0 rounded-none" />}
          <iframe
            title={`แผนที่ ${companyName}`}
            src={`https://www.google.com/maps?q=${mapQuery}&hl=th&z=16&output=embed`}
            onLoad={() => setMapReady(true)}
            className={`relative block h-full w-full border-0 transition-opacity duration-700 motion-reduce:transition-none ${
              mapReady ? "opacity-100" : "opacity-0"
            }`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      </Reveal>
    </section>
  );
}

const AREA_REQUIRED_MESSAGE = "กรุณาเลือกขนาดพื้นที่โดยประมาณ หรือเลือก “ยังไม่ทราบ”";

/**
 * ขนาดพื้นที่โดยประมาณ — แตะเลือกช่วงครั้งเดียว ไม่ต้องรู้ตัวเลขจริง (ผู้ใช้เลือก 16 ต.ค.)
 * เป็น radio จริงที่ซ่อนตัวไว้ใต้ป้ายมน: คีย์บอร์ด (ลูกศร/Tab) และโปรแกรมอ่านหน้าจอใช้ได้ตามปกติ
 */
function AreaRangePicker({
  value,
  missing,
  onChange,
}: Readonly<{ value: AreaRange | null; missing: boolean; onChange: (next: AreaRange) => void }>) {
  return (
    <fieldset aria-describedby={missing ? "areaRange-error" : undefined}>
      <legend className="mb-2 text-sm text-slate-700">
        ขนาดพื้นที่ใช้สอยโดยประมาณ <span className="text-red-600">*</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {AREA_RANGES.map((r) => {
          const checked = value === r.value;
          let tone = "border-slate-300 bg-white text-slate-700 hover:border-slate-400";
          if (checked) tone = "border-brand bg-brand text-white";
          else if (missing) tone = "border-red-300 bg-white text-slate-700 hover:border-red-400";
          return (
            <label
              key={r.value}
              className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 lg:min-h-9 ${tone}`}
            >
              <input
                type="radio"
                name="areaRange"
                value={r.value}
                checked={checked}
                onChange={() => onChange(r.value)}
                className="sr-only"
              />
              {r.label}
            </label>
          );
        })}
      </div>
      {missing && (
        <p id="areaRange-error" className="mt-1.5 text-xs text-red-600">
          {AREA_REQUIRED_MESSAGE}
        </p>
      )}
    </fieldset>
  );
}
