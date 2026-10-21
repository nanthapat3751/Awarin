import { looksLikeEmail } from "@systemboq/shared-types";
import { ImageUp, Lock, X } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

import { BackupSettings } from "../components/BackupSettings";
import { Button, buttonClasses } from "../components/Button";
import { Layout } from "../components/Layout";
import { IpCheckSettings } from "../components/IpCheckSettings";
import { MailSettings } from "../components/MailSettings";
import { TakeoffRulesSettings } from "../components/TakeoffRulesSettings";
import { PageHeader } from "../components/PageHeader";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { resizeLogo } from "../lib/logo-resize";
import { useToast } from "../lib/toast-context";
import {
  type DocumentLogo,
  getDocumentLogo,
  getSettings,
  resetDocumentLogo,
  updateSettings,
  uploadDocumentLogo,
} from "../lib/settings-api";
import { PromptPayTest } from "../components/PromptPayTest";
import { DetailSkeleton } from "../components/Skeleton";
import { ScrollableTabBar } from "../components/ScrollableTabBar";

interface FormState {
  companyName: string;
  companyAddress: string;
  companyNameEn: string;
  companyAddressEn: string;
  companyPhone: string;
  companyTaxId: string;
  companyVatRegistered: boolean;
  companyBranch: string;
  companyEmail: string;
  companyFacebook: string;
  companyYoutube: string;
  companyLine: string;
  companySignatoryName: string;
  companySignatoryTitle: string;
  paymentBankName: string;
  paymentBankBranch: string;
  paymentAccountName: string;
  paymentAccountNo: string;
  paymentPromptPay: string;
  quoteValidityDays: string;
  /** เงินประกันผลงานตั้งต้นของสัญญาใหม่ (%) — ว่าง = ไม่มี */
  retentionPercent: string;
  quoteTerms: string;
  overheadProfitPercent: string;
  overheadPercent: string;
  vatPercent: string;
}

const EMPTY_FORM: FormState = {
  companyName: "",
  companyAddress: "",
  companyNameEn: "",
  companyAddressEn: "",
  companyPhone: "",
  companyTaxId: "",
  companyVatRegistered: false,
  companyBranch: "สำนักงานใหญ่",
  companyEmail: "",
  companyFacebook: "",
  companyYoutube: "",
  companyLine: "",
  companySignatoryName: "",
  companySignatoryTitle: "",
  paymentBankName: "",
  paymentBankBranch: "",
  paymentAccountName: "",
  paymentAccountNo: "",
  paymentPromptPay: "",
  quoteValidityDays: "",
  retentionPercent: "",
  quoteTerms: "",
  overheadProfitPercent: "",
  overheadPercent: "",
  vatPercent: "",
};

/** ข้อความล้วนในฟอร์ม — ช่องตัวเลข (อัตรา %) จัดการแยกตอนบันทึก */
const TEXT_KEYS = [
  "companyName",
  "companyAddress",
  "companyNameEn",
  "companyAddressEn",
  "companyPhone",
  "companyBranch",
  "companyEmail",
  "companyFacebook",
  "companyYoutube",
  "companyLine",
  "companySignatoryName",
  "companySignatoryTitle",
  "paymentBankName",
  "paymentBankBranch",
  "paymentAccountName",
  "paymentAccountNo",
  "paymentPromptPay",
  "quoteTerms",
] as const;

/** ยืนราคานานสุด — ตรงกับเพดานฝั่งเซิร์ฟเวอร์ (MAX_QUOTE_VALIDITY_DAYS) */
const MAX_VALIDITY_DAYS = 365;

/**
 * ชื่อธนาคารเต็มตามที่ใช้บนเอกสาร — เป็นแค่ตัวช่วยเลือก พิมพ์ชื่ออื่นเองได้
 * (ใส่ชื่อเต็มเพราะกล่องการชำระเงินบนใบเสนอราคาพิมพ์ชื่อนี้ตรง ๆ ไม่ได้เติมคำว่า "ธนาคาร" ให้)
 */
const THAI_BANKS = [
  "ธนาคารกรุงเทพ",
  "ธนาคารกสิกรไทย",
  "ธนาคารกรุงไทย",
  "ธนาคารไทยพาณิชย์",
  "ธนาคารกรุงศรีอยุธยา",
  "ธนาคารทหารไทยธนชาต",
  "ธนาคารออมสิน",
  "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร",
  "ธนาคารอาคารสงเคราะห์",
  "ธนาคารยูโอบี",
  "ธนาคารซีไอเอ็มบี ไทย",
  "ธนาคารแลนด์ แอนด์ เฮ้าส์",
  "ธนาคารเกียรตินาคินภัทร",
  "ธนาคารทิสโก้",
  "ธนาคารไอซีบีซี (ไทย)",
  "ธนาคารอิสลามแห่งประเทศไทย",
];

const DIGITS_AND_SEPARATORS = /^[\d\s-]+$/;

/** โลโก้ที่เลือกไว้แต่ยังไม่ได้บันทึก — บันทึกพร้อมช่องอื่นด้วยปุ่มเดียวกัน */
type LogoChange =
  | { kind: "upload"; large: Blob; small: Blob; preview: string }
  | { kind: "reset" }
  | null;

// แท็บแบ่งหมวดการตั้งค่า -- ลดการเลื่อนหน้ายาว และแยกเรื่อง "แสดงบนเว็บลูกค้า" กับ "ภายใน"
// และ "การสำรองข้อมูล" ออกจากกันชัดเจน
const TABS = [
  { id: "company", label: "ข้อมูลบริษัท" },
  // ของที่พิมพ์ลงเอกสารที่ส่งลูกค้า นอกเหนือจากชื่อ/ที่อยู่ — โลโก้ คนเซ็น และบัญชีที่ให้โอนเข้า
  { id: "documents", label: "เอกสารและการรับเงิน" },
  { id: "pricing", label: "อัตราราคา" },
  // ชุดกฎการคิดเหล็กของตัวคิดชิ้นส่วนโครงสร้าง (เสนอราคา / สั่งตัด) — ทุกคนเห็น แก้ได้เฉพาะเจ้าของ
  { id: "takeoff", label: "ถอดปริมาณ" },
  // รหัสผ่านกับการยืนยัน 2 ชั้นย้ายไปหน้า "บัญชีของฉัน" (/account) แล้ว เพราะเป็นเรื่องของแต่ละคน
  // ไม่ใช่การตั้งค่าบริษัท — ที่เหลือตรงนี้คือการสำรองข้อมูล ซึ่งเป็นของเจ้าของระบบเท่านั้น
  { id: "backup", label: "สำรองข้อมูล", ownerOnly: true },
  // การเชื่อมต่อส่งเมลอยู่ใน server/.env — แท็บนี้มีไว้ตรวจว่าเมลถึงลูกค้าจริงไหม ไม่ได้แก้ค่า
  { id: "mail", label: "การส่งอีเมล", ownerOnly: true },
  // ตรวจว่า IP ที่บันทึกในแฟ้มลูกค้าเป็นของคนใช้งานจริง (หลัง proxy/Docker) — เจ้าของเท่านั้น เหมือนการเห็น IP
  { id: "network", label: "การรับ IP", ownerOnly: true },
] as const;
type TabId = (typeof TABS)[number]["id"];

// สีแบรนด์ Awarin (กรมท่า) ใช้เน้นแท็บที่กำลังเลือก
const BRAND_NAVY = "#000099";

/*
 * คอลัมน์เดียวกว้าง 768px ทุกแท็บ — ไม่ยืดเต็ม 1,152px เพราะช่องกรอกที่ยาวเกินอ่านยาก
 * และไม่แคบเท่าของเดิม (512px) เพราะต้องพอให้จับคู่ช่องเป็นสองสามคอลัมน์ในการ์ดได้
 *
 * เคยมีแผงข้อมูลคอลัมน์ขวาสามแผง (ค่านี้ไปโผล่ที่ไหน / สถานะการกรอก / ตัวอย่างการคิดราคา)
 * ผู้ใช้สั่งเอาออก 2026-08-30 — อย่าใส่กลับเองถ้าไม่ได้สั่ง
 */
const COL = "flex flex-col gap-4 max-w-3xl";
const CARD = "bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3";
const FIELD = "flex flex-col gap-1 text-xs text-slate-700";
const INPUT_BASE = "border rounded-md px-2 py-1 text-sm";
const INPUT = `${INPUT_BASE} border-slate-300`;
// ต้องเขียนเป็นชุดเต็มแบบนี้ ต่อท้าย "border-red-400" ไปเฉย ๆ ไม่ชนะ border-slate-300
// (Tailwind ตัดสินจากลำดับในไฟล์ CSS ไม่ใช่ลำดับที่เขียนใน class) — วัดแล้วว่าขอบไม่เปลี่ยนสีจริง ๆ
const INPUT_INVALID = `${INPUT_BASE} border-red-400`;

/** กรอบช่องกรอก: แดงเมื่อค่าผิด */
function inputClass(invalid: boolean): string {
  return invalid ? INPUT_INVALID : INPUT;
}
/** ช่องที่ผู้ใช้คนนี้ไม่มีสิทธิ์แก้ — ยังอ่านค่าได้ชัด แต่ดูออกว่ากดไม่ได้ */
const LOCKED = "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

/** เอาเฉพาะตัวเลขออกมา — ผู้ใช้พิมพ์ขีดหรือเว้นวรรคมาก็ได้ */
function taxIdDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * จัดรูปเป็น X-XXXX-XXXXX-XX-X ตอนบันทึก เพื่อให้ที่พิมพ์บนหัวเอกสารอ่านง่ายและหน้าตาเหมือนกันทุกใบ
 * ไม่ครบ 13 หลักคืนค่าเดิม (ฟอร์มกันไม่ให้บันทึกอยู่แล้ว)
 */
function formatTaxId(value: string): string {
  const d = taxIdDigits(value);
  if (d.length !== 13) return value.trim();
  return `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`;
}

/** หัวการ์ด — ชื่อส่วน + บรรทัดเดียวว่าค่าในส่วนนี้มีผลกับอะไร */
function CardHead({ title, desc }: Readonly<{ title: string; desc: string }>) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-800">{title}</p>
      <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
    </div>
  );
}

/**
 * แถวปุ่มบันทึก + สถานะ ใช้ร่วมกันทั้งแท็บข้อมูลบริษัทและอัตราราคา
 *
 * โชว์ข้อความ "บันทึกเรียบร้อยแล้ว" ต่อเมื่อยังไม่มีการแก้ค่าอะไรต่อ — เดิมข้อความค้างอยู่ตลอด
 * แม้จะพิมพ์แก้ต่อหรือสลับไปอีกแท็บ กลายเป็นบอกว่า "บันทึกแล้ว" ทั้งที่ของในช่องยังไม่ได้บันทึก
 */
function SaveRow({
  onSave,
  disabled,
  dirty,
  savedMessage,
  blockedBy,
  onGoToTab,
}: Readonly<{
  onSave: () => void;
  disabled: boolean;
  dirty: boolean;
  savedMessage: string | null;
  /**
   * แท็บอื่นที่ยังมีช่องกรอกผิด — ฟอร์มใช้ร่วมกันทุกแท็บ ปุ่มบันทึกจึงถูกล็อกตามแท็บที่มองไม่เห็นด้วย
   * ต้องบอกว่าติดที่ไหน ไม่งั้นผู้ใช้เห็นปุ่มกดไม่ได้โดยไม่รู้ว่าไปผิดตรงไหน
   */
  blockedBy: { id: TabId; label: string }[];
  onGoToTab: (id: TabId) => void;
}>) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      {blockedBy.map((tab) => (
        <p key={tab.id} className="text-xs text-red-600">
          ช่องในแท็บ{" "}
          <button
            type="button"
            onClick={() => onGoToTab(tab.id)}
            className="font-medium underline underline-offset-2"
          >
            {tab.label}
          </button>{" "}
          ยังไม่ถูกต้อง — แก้ก่อนจึงจะบันทึกได้
        </p>
      ))}
      <div className="flex items-center gap-3">
        <Button onClick={onSave} disabled={disabled}>
          บันทึก
        </Button>
        {dirty ? (
          <span className="text-sm text-amber-600">ยังไม่ได้บันทึก</span>
        ) : (
          savedMessage && <span className="text-sm text-emerald-600">{savedMessage}</span>
        )}
      </div>
    </div>
  );
}

/** ข้อความผิดใต้ช่อง — รูปแบบเดียวกับของเลขผู้เสียภาษีที่มีอยู่แล้ว */
function FieldError({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="flex items-center gap-1 text-xs text-red-600">
      <X size={12} /> {children}
    </span>
  );
}

function digitCount(value: string): number {
  return value.replace(/\D/g, "").length;
}

/** ปุ่มแท็บ: แท็บที่เปิดอยู่ขีดเส้นใต้สีแบรนด์ */
function tabButtonProps(active: boolean): { className: string; style?: CSSProperties } {
  if (active) {
    return {
      className: "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
      style: { color: BRAND_NAVY, borderBottomColor: BRAND_NAVY },
    };
  }
  return { className: "px-4 py-2 text-sm text-slate-500 border-b-2 border-transparent hover:text-slate-800" };
}

// ครบหรือว่างทั้งหมด — บัญชีครึ่ง ๆ กลาง ๆ ไม่ถูกพิมพ์ลงเอกสารเลย (เซิร์ฟเวอร์ปฏิเสธด้วย)
const BANK_REQUIRED_FIELDS = [
  { key: "paymentBankName", label: "ธนาคาร" },
  { key: "paymentAccountName", label: "ชื่อบัญชี" },
  { key: "paymentAccountNo", label: "เลขที่บัญชี" },
] as const;

/** กรอกแล้วแต่รูปแบบผิด — ช่องว่างถือว่าผ่าน (ไม่บังคับกรอก) */
function filledButInvalid(value: string, isValid: (trimmed: string) => boolean): boolean {
  const v = value.trim();
  return v !== "" && !isValid(v);
}

function isAccountNo(v: string): boolean {
  const n = digitCount(v);
  return DIGITS_AND_SEPARATORS.test(v) && n >= 10 && n <= 12;
}

function isPromptPay(v: string): boolean {
  if (!DIGITS_AND_SEPARATORS.test(v)) return false;
  const digits = v.replace(/\D/g, "");
  // เบอร์มือถือต้องขึ้นต้น 0 — ไม่งั้นสร้าง QR พร้อมเพย์ไม่ได้
  return digits.length === 13 || (digits.length === 10 && digits.startsWith("0"));
}

function isRetentionPct(v: string): boolean {
  const n = Number(v);
  return /^\d+(\.\d+)?$/.test(v.trim()) && n > 0 && n <= 20;
}

function isValidityDays(v: string): boolean {
  return /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= MAX_VALIDITY_DAYS;
}

/** ตรวจทุกช่องของฟอร์มตั้งค่า + บอกว่าแท็บไหนยังมีช่องผิด (ปุ่มบันทึกใช้ร่วมกันทุกแท็บ) */
function validateForm(form: FormState) {
  // เว้นว่างได้ แต่ถ้ากรอกต้องเป็นตัวเลข 13 หลัก — เลขนี้ถูกพิมพ์ลงหัวเอกสารที่ส่งลูกค้าจริง
  const taxIdInvalid = filledButInvalid(form.companyTaxId, (v) => taxIdDigits(v).length === 13);
  // เปิดสวิตช์ VAT ได้ต่อเมื่อเลขผู้เสียภาษีครบ 13 หลัก (เซิร์ฟเวอร์ตรวจซ้ำอีกชั้น)
  const vatToggleReady = taxIdDigits(form.companyTaxId).length === 13;
  const emailInvalid = filledButInvalid(form.companyEmail, looksLikeEmail);

  // ค่าดำเนินการมากกว่าอัตรารวม = กำไรติดลบ เป็นการกรอกผิดเสมอ กันไว้ตั้งแต่ปุ่มบันทึก
  // (เซิร์ฟเวอร์ก็ปฏิเสธอยู่แล้ว แต่ให้รู้ตั้งแต่ตอนพิมพ์ดีกว่ารู้ตอนกดแล้วเด้ง error)
  const overheadOverTotal =
    form.overheadPercent.trim() !== "" && Number(form.overheadPercent) > Number(form.overheadProfitPercent);

  // บัญชีรับเงิน — เลขผิดไปหลักเดียวเงินลูกค้าเข้าบัญชีคนอื่น จึงตรวจตั้งแต่ตอนพิมพ์
  const accountNoInvalid = filledButInvalid(form.paymentAccountNo, isAccountNo);
  const promptPayInvalid = filledButInvalid(form.paymentPromptPay, isPromptPay);
  const bankStarted = [
    form.paymentBankName,
    form.paymentBankBranch,
    form.paymentAccountName,
    form.paymentAccountNo,
    form.paymentPromptPay,
  ].some((v) => v.trim() !== "");
  const bankMissing = bankStarted ? BANK_REQUIRED_FIELDS.filter((f) => form[f.key].trim() === "") : [];

  const validityInvalid = filledButInvalid(form.quoteValidityDays, isValidityDays);
  const retentionInvalid = filledButInvalid(form.retentionPercent, isRetentionPct);

  const invalidTabs = new Set<TabId>();
  if (taxIdInvalid || emailInvalid) invalidTabs.add("company");
  if (accountNoInvalid || promptPayInvalid || bankMissing.length > 0 || validityInvalid || retentionInvalid) {
    invalidTabs.add("documents");
  }
  if (overheadOverTotal) invalidTabs.add("pricing");

  return {
    taxIdInvalid,
    vatToggleReady,
    emailInvalid,
    overheadOverTotal,
    accountNoInvalid,
    promptPayInvalid,
    bankMissing,
    validityInvalid,
    retentionInvalid,
    invalidTabs,
  };
}

/** โลโก้ในตัวอย่าง = สิ่งที่จะถูกพิมพ์หลังกดบันทึก */
function logoPreviewOf(change: LogoChange, logo: DocumentLogo | null, defaultLogo: string | null): string | null {
  if (change?.kind === "upload") return change.preview;
  if (change?.kind === "reset") return defaultLogo;
  return logo?.logo ?? null;
}

/** ปุ่มรองข้างปุ่มเลือกไฟล์: มีของค้างอยู่ = ยกเลิกของที่ค้าง · ใช้โลโก้ของบริษัทอยู่ = กลับไปใช้ตั้งต้น */
function logoSecondaryActionOf(
  change: LogoChange,
  logo: DocumentLogo | null,
  setChange: (next: LogoChange) => void,
): { label: string; run: () => void } | null {
  if (change !== null) return { label: "ยกเลิก", run: () => setChange(null) };
  if (logo?.custom) return { label: "กลับไปใช้โลโก้ตั้งต้น", run: () => setChange({ kind: "reset" }) };
  return null;
}

/** ข้อความใต้ช่องค่าดำเนินการ — บอกผลของสิ่งที่กรอกไปแล้ว ไม่ใช่คำอธิบายลอย ๆ */
function overheadSplitHintOf(form: FormState): string {
  if (form.overheadPercent.trim() === "") return "เว้นว่าง = ไม่แยก แสดงเป็นก้อนรวมเหมือนเดิม";
  const total = Number(form.overheadProfitPercent);
  const overhead = Number(form.overheadPercent);
  if (!Number.isFinite(total) || !Number.isFinite(overhead)) return "";
  if (overhead > total) return "มากกว่าอัตรารวมไม่ได้";
  return `→ กำไร ${Math.round((total - overhead) * 100) / 100}%`;
}

export function SettingsPage() {
  // แท็บผูกกับ ?tab= เพื่อให้ลิงก์จากที่อื่น (เช่น เมนูผู้ใช้ -> การยืนยัน 2 ชั้น) เปิดตรงแท็บได้เลย
  const [searchParams, setSearchParams] = useSearchParams();
  const tabInUrl = searchParams.get("tab");
  const isTabId = (v: string | null): v is TabId => TABS.some((t) => t.id === v);
  // แท็บ "ความปลอดภัย" เดิมถูกแยกออกไป — ลิงก์เก่าที่ยังค้างอยู่ในแจ้งเตือน/บุ๊กมาร์กต้องไม่พาไปหน้าว่าง
  const legacySecurityTab = tabInUrl === "security";
  const [activeTab, setActiveTab] = useState<TabId>(isTabId(tabInUrl) ? tabInUrl : "company");
  useEffect(() => {
    if (isTabId(tabInUrl)) setActiveTab(tabInUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabInUrl]);
  const toast = useToast();
  // อัตรากำไรเป็นการตัดสินใจของเจ้าของ — ADMIN เห็นค่าแต่แก้ไม่ได้ (เซิร์ฟเวอร์ปฏิเสธด้วย)
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // สำเนาค่าที่โหลดมาล่าสุด ใช้เทียบว่ามีอะไรถูกแก้แล้วยังไม่บันทึกไหม
  const [loadedForm, setLoadedForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // โลโก้บนเอกสาร: ตัวที่ใช้อยู่ + ตัวตั้งต้นของระบบ (ไว้โชว์ตอนกดกลับไปใช้ของเดิม) + ที่เลือกค้างไว้
  const [logo, setLogo] = useState<DocumentLogo | null>(null);
  const [defaultLogo, setDefaultLogo] = useState<string | null>(null);
  const [logoChange, setLogoChange] = useState<LogoChange>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [preparingLogo, setPreparingLogo] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [res, logoRes] = await Promise.all([getSettings(), getDocumentLogo()]);
      const next = Object.fromEntries(
        (Object.keys(EMPTY_FORM) as (keyof FormState)[]).map((key) => [key, res.settings[key] ?? ""]),
      ) as unknown as FormState;
      // ค่าตั้งเก็บเป็นข้อความทั้งหมด — สองช่องนี้ไม่ใช่ข้อความในฟอร์ม
      next.companyVatRegistered = res.settings.companyVatRegistered === "true";
      next.companyBranch = res.settings.companyBranch?.trim() || "สำนักงานใหญ่";
      setForm(next);
      setLoadedForm(next);
      setLogo({ logo: logoRes.logo, custom: logoRes.custom });
      setDefaultLogo(logoRes.defaultLogo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  /** ค่าที่ส่งไปบันทึก */
  function settingsPayload() {
    // ส่งช่องข้อความทุกครั้ง (สถานะฟอร์มใช้ร่วมกันทุกแท็บ) แต่ "อัตราราคา" ส่งเฉพาะเมื่อกรอก
    // เป็นตัวเลขที่ใช้ได้ — กันช่องว่าง (Number("")=0) เขียนทับ margin/VAT เป็น 0% โดยไม่ตั้งใจ
    // เมื่อกดบันทึกจากแท็บข้อมูลบริษัท หรือตอนระบบยังไม่เคยตั้งค่าอัตราราคา
    const payload: Parameters<typeof updateSettings>[0] = {
      ...Object.fromEntries(TEXT_KEYS.map((key) => [key, form[key].trim()])),
      companyTaxId: formatTaxId(form.companyTaxId),
      companyVatRegistered: form.companyVatRegistered,
    };
    // ว่าง = ไม่กำหนดยืนราคา ต้องส่ง null ไปล้าง (ไม่ใช่เงียบ ไม่งั้นค่าเก่าค้าง)
    payload.quoteValidityDays =
      form.quoteValidityDays.trim() === "" ? null : Number(form.quoteValidityDays);
    // ว่าง = สัญญาใหม่ไม่มีเงินประกันผลงาน — ต้องส่ง null ไปล้าง
    payload.retentionPercent = form.retentionPercent.trim() === "" ? null : Number(form.retentionPercent);
    // ADMIN ไม่ส่งอัตรากำไรเลย — ช่องถูกล็อกอยู่แล้ว ส่งไปก็เป็นแค่ค่าเดิม
    if (isOwner) {
      const overhead = Number(form.overheadProfitPercent);
      if (form.overheadProfitPercent.trim() !== "" && Number.isFinite(overhead)) {
        payload.overheadProfitPercent = overhead;
      }
      // ช่องนี้ว่างได้จริง ๆ (= ยังไม่แยกค่าดำเนินการกับกำไร) จึงต้องส่ง null ไปล้างค่า
      // ไม่ใช่เงียบไปเฉย ๆ เหมือนช่องอื่น ไม่งั้นลบค่าออกแล้วมันจะกลับมาเองตอนโหลดหน้าใหม่
      const overheadOnly = Number(form.overheadPercent);
      payload.overheadPercent =
        form.overheadPercent.trim() === "" || !Number.isFinite(overheadOnly)
          ? null
          : overheadOnly;
    }
    const vat = Number(form.vatPercent);
    if (form.vatPercent.trim() !== "" && Number.isFinite(vat)) {
      payload.vatPercent = vat;
    }
    return payload;
  }

  async function submitSave() {
    setSaving(true);
    setSavedMessage(null);
    try {
      // โลโก้ไปก่อน แยกปลายทาง (เป็นไฟล์) — เปลี่ยนแค่โลโก้อย่างเดียวก็ไม่ต้องยิงบันทึกค่าตั้งซ้ำ
      // ให้เกิดบันทึก UPDATE_SETTINGS เปล่า ๆ ใน AuditLog
      if (logoChange?.kind === "upload") {
        setLogo(await uploadDocumentLogo(logoChange.large, logoChange.small));
      } else if (logoChange?.kind === "reset") {
        setLogo(await resetDocumentLogo());
      }
      setLogoChange(null);
      if (!formDirty) {
        setSavedMessage("บันทึกเรียบร้อยแล้ว");
        return;
      }

      await updateSettings(settingsPayload());
      setSavedMessage("บันทึกเรียบร้อยแล้ว");
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  // ยังไม่ได้บันทึก = ค่าปัจจุบันต่างจากที่โหลดมา หรือเลือกโลโก้ค้างไว้ (ฟอร์มใช้ร่วมกันทุกแท็บ
  // ปุ่มบันทึกก็ส่งทุกแท็บพร้อมกัน ตัวเทียบจึงเป็นก้อนเดียว)
  const formDirty = (Object.keys(form) as (keyof FormState)[]).some((k) => form[k] !== loadedForm[k]);
  const dirty = formDirty || logoChange !== null;

  const {
    taxIdInvalid,
    vatToggleReady,
    emailInvalid,
    overheadOverTotal,
    accountNoInvalid,
    promptPayInvalid,
    bankMissing,
    validityInvalid,
    retentionInvalid,
    invalidTabs,
  } = validateForm(form);
  const cannotSave = saving || preparingLogo || !dirty || invalidTabs.size > 0;
  const blockedBy = TABS.filter((t) => t.id !== activeTab && invalidTabs.has(t.id));

  function goToTab(id: TabId) {
    setActiveTab(id);
    // ข้อความ "บันทึกเรียบร้อยแล้ว" เป็นผลของการกดบันทึกครั้งนั้น ไม่ควรตามไปโชว์
    // บนแท็บที่ผู้ใช้ยังไม่ได้กดอะไรเลย
    setSavedMessage(null);
    // replace: กดสลับแท็บไม่ควรทับประวัติการย้อนกลับของเบราว์เซอร์
    setSearchParams({ tab: id }, { replace: true });
  }

  /** เลือกไฟล์โลโก้ → ย่อเป็นสองขนาดทันที แล้วค้างไว้ให้ดูตัวอย่างจนกว่าจะกดบันทึก */
  async function chooseLogo(file: File) {
    setLogoError(null);
    setPreparingLogo(true);
    try {
      const { large, small } = await resizeLogo(file);
      setLogoChange({ kind: "upload", large, small, preview: URL.createObjectURL(large) });
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "เปิดไฟล์รูปนี้ไม่ได้");
    } finally {
      setPreparingLogo(false);
    }
  }

  // ปล่อย object URL ของตัวอย่างเก่าทุกครั้งที่เปลี่ยนไฟล์หรือออกจากหน้า
  useEffect(() => {
    if (logoChange?.kind !== "upload") return;
    const url = logoChange.preview;
    return () => URL.revokeObjectURL(url);
  }, [logoChange]);

  // ตัวอย่างที่โชว์ = สิ่งที่จะถูกพิมพ์หลังกดบันทึก
  const logoPreview = logoPreviewOf(logoChange, logo, defaultLogo);
  // ปุ่มรองข้างปุ่มเลือกไฟล์: มีของค้างอยู่ = ยกเลิกของที่ค้าง · ใช้โลโก้ของบริษัทอยู่ = กลับไปใช้ตั้งต้น
  const logoSecondaryAction = logoSecondaryActionOf(logoChange, logo, setLogoChange);

  const overheadSplitHint = overheadSplitHintOf(form);

  // กันปิดแท็บ/กดรีเฟรชทิ้งของที่ยังไม่ได้บันทึก
  // (การกดเมนูข้างในแอปดักไม่ได้ด้วยวิธีนี้ — react-router แบบ BrowserRouter ไม่มี useBlocker
  //  จึงใช้ป้าย "ยังไม่ได้บันทึก" ข้างปุ่มให้เห็นสถานะแทน)
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // เจ้าของที่มาจากแจ้งเตือนสำรองข้อมูลเก่า → แท็บสำรองข้อมูล · คนอื่น → รหัสผ่าน/2FA ที่ย้ายไปแล้ว
  if (legacySecurityTab) {
    return <Navigate to={isOwner ? "/settings?tab=backup" : "/account"} replace />;
  }

  if (loading) {
    return (
      <Layout>
        <DetailSkeleton stats={0} />
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader title="ตั้งค่าระบบ" />
      {error && <p className="text-red-600 mb-4">{error}</p>}

      {/* แถบแท็บ — ชื่อแท็บห้ามตกบรรทัด (iPad แนวตั้งเคยแตกเป็น "ข้อมูล / บริษัท") ล้นจอแล้วเลื่อนข้างพร้อมปุ่ม ‹ › */}
      <ScrollableTabBar id="settings-tabs" ariaLabel="หมวดการตั้งค่า" selectedKey={activeTab} className="mb-5 h-10">
        {TABS.filter((t) => !("ownerOnly" in t) || isOwner).map((t) => {
          const active = activeTab === t.id;
          const { className, style } = tabButtonProps(active);
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => goToTab(t.id)}
              className={`${className} shrink-0 whitespace-nowrap`}
              style={style}
            >
              {t.label}
            </button>
          );
        })}
      </ScrollableTabBar>

      {activeTab === "company" && (
        <div className={COL}>
          <div className={CARD}>
            <CardHead
              title="ชื่อและที่อยู่"
              desc="พิมพ์บนหัวเอกสารทุกใบ และแสดงบนเว็บฝั่งลูกค้า"
            />
            <label className={FIELD}>
              <span>ชื่อบริษัท</span>
              <input
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                className={INPUT}
              />
            </label>
            <label className={FIELD}>
              <span>ที่อยู่</span>
              <textarea
                value={form.companyAddress}
                onChange={(e) => setForm((f) => ({ ...f, companyAddress: e.target.value }))}
                className={INPUT}
                rows={2}
              />
            </label>
            {/* หัวใบแจ้งหนี้/ใบเสร็จตามแบบฟอร์มของบริษัทมีชื่อ/ที่อยู่อังกฤษด้วย — ว่างไว้ = ไม่พิมพ์บรรทัดนั้น */}
            <label className={FIELD}>
              <span>
                ชื่อบริษัท (ภาษาอังกฤษ) <span className="font-normal text-slate-400">· ใบแจ้งหนี้/ใบเสร็จ</span>
              </span>
              <input
                value={form.companyNameEn}
                onChange={(e) => setForm((f) => ({ ...f, companyNameEn: e.target.value }))}
                className={INPUT}
                placeholder="Awarin Engineering Co., Ltd."
              />
            </label>
            <label className={FIELD}>
              <span>
                ที่อยู่ (ภาษาอังกฤษ) <span className="font-normal text-slate-400">· ใบแจ้งหนี้/ใบเสร็จ</span>
              </span>
              <textarea
                value={form.companyAddressEn}
                onChange={(e) => setForm((f) => ({ ...f, companyAddressEn: e.target.value }))}
                className={INPUT}
                rows={2}
              />
            </label>
            {/* โทรศัพท์ อีเมล เลขภาษี สั้นทั้งหมด วางคู่กันได้ ไม่ต้องกินคนละบรรทัดเต็ม */}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={FIELD}>
                <span>โทรศัพท์</span>
                <input
                  value={form.companyPhone}
                  onChange={(e) => setForm((f) => ({ ...f, companyPhone: e.target.value }))}
                  className={INPUT}
                />
              </label>
              <label className={FIELD}>
                <span>อีเมล</span>
                <input
                  type="email"
                  value={form.companyEmail}
                  onChange={(e) => setForm((f) => ({ ...f, companyEmail: e.target.value }))}
                  className={inputClass(emailInvalid)}
                  placeholder="info@บริษัท.co.th"
                  autoComplete="off"
                />
                {emailInvalid && <FieldError>รูปแบบอีเมลไม่ถูกต้อง</FieldError>}
              </label>
              <label className={FIELD}>
                <span>เลขประจำตัวผู้เสียภาษี</span>
                <input
                  value={form.companyTaxId}
                  onChange={(e) => setForm((f) => ({ ...f, companyTaxId: e.target.value }))}
                  className={inputClass(taxIdInvalid)}
                  placeholder="0-0000-00000-00-0"
                  inputMode="numeric"
                />
                {taxIdInvalid && (
                  <FieldError>
                    ต้องเป็นตัวเลข 13 หลัก (ตอนนี้ {taxIdDigits(form.companyTaxId).length} หลัก)
                  </FieldError>
                )}
              </label>
            </div>

            {/* ภาษีมูลค่าเพิ่ม — ตัวนี้เป็นตัวตัดสินว่าใบเสร็จออกเป็นใบกำกับภาษีได้หรือไม่
                ระบบไม่เดาจากการมีเลขผู้เสียภาษี เพราะนิติบุคคลทุกรายมีเลขนี้อยู่แล้ว */}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/30 disabled:opacity-50"
                  checked={form.companyVatRegistered}
                  disabled={!vatToggleReady}
                  onChange={(e) => setForm((f) => ({ ...f, companyVatRegistered: e.target.checked }))}
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-800">จดทะเบียนภาษีมูลค่าเพิ่ม (VAT) แล้ว</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    เปิดไว้ = ใบเสร็จที่ออกให้ลูกค้าจะเป็น "ใบเสร็จรับเงิน/ใบกำกับภาษี" และเข้ารายงานภาษีขาย ·
                    ใบที่ออกไปแล้วไม่เปลี่ยนตามการแก้ช่องนี้
                  </span>
                  {!vatToggleReady && (
                    <span className="mt-1 block text-xs text-amber-700">
                      กรอกเลขประจำตัวผู้เสียภาษีให้ครบ 13 หลักก่อน จึงจะเปิดได้
                    </span>
                  )}
                </span>
              </label>

              {form.companyVatRegistered && (
                <label className={`${FIELD} mt-3 max-w-xs`}>
                  <span>สถานประกอบการที่พิมพ์บนใบกำกับภาษี</span>
                  <input
                    value={form.companyBranch}
                    onChange={(e) => setForm((f) => ({ ...f, companyBranch: e.target.value }))}
                    className={inputClass(form.companyBranch.trim() === "")}
                    placeholder="สำนักงานใหญ่"
                  />
                  {form.companyBranch.trim() === "" ? (
                    <FieldError>ระบุ "สำนักงานใหญ่" หรือ "สาขาที่ 00001"</FieldError>
                  ) : (
                    <span className="text-xs text-slate-400">ใบกำกับภาษีต้องระบุว่าออกจากสำนักงานใหญ่หรือสาขาไหน</span>
                  )}
                </label>
              )}
            </div>
          </div>

          <div className={CARD}>
          <CardHead
            title="ช่องทางติดต่อ"
            desc="ขึ้นที่ส่วนท้ายและหน้าติดต่อเราของเว็บลูกค้า — เว้นช่องไหนไว้ ช่องนั้นจะไม่แสดง"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={FIELD}>
              <span>Facebook</span>
              <input
                value={form.companyFacebook}
                onChange={(e) => setForm((f) => ({ ...f, companyFacebook: e.target.value }))}
                className={INPUT}
                placeholder="https://facebook.com/..."
              />
            </label>
            <label className={FIELD}>
              <span>YouTube</span>
              <input
                value={form.companyYoutube}
                onChange={(e) => setForm((f) => ({ ...f, companyYoutube: e.target.value }))}
                className={INPUT}
                placeholder="https://youtube.com/@..."
              />
            </label>
            <label className={FIELD}>
              <span>LINE</span>
              <input
                value={form.companyLine}
                onChange={(e) => setForm((f) => ({ ...f, companyLine: e.target.value }))}
                className={INPUT}
                placeholder="@ไอดีไลน์"
              />
            </label>
          </div>
          </div>

          {/* ปุ่มเดียวบันทึกทั้งสองการ์ด (เป็นฟอร์มก้อนเดียวกัน) จึงอยู่นอกการ์ด
              ไม่งั้นจะดูเหมือนบันทึกเฉพาะการ์ดที่มันอยู่ */}
          <SaveRow
            onSave={submitSave}
            disabled={cannotSave}
            dirty={dirty}
            savedMessage={savedMessage}
            blockedBy={blockedBy}
            onGoToTab={goToTab}
          />
        </div>
      )}

      {activeTab === "documents" && (
        <div className={COL}>
          <div className={CARD}>
            <CardHead
              title="โลโก้บนเอกสาร"
              desc="พิมพ์บนหัวใบเสนอราคา BOQ และสัญญาทุกใบ — โลโก้บนเว็บไซต์ไม่เปลี่ยนตาม"
            />
            <div className="flex flex-wrap items-center gap-4">
              {/* ตัวอย่างขนาดเท่าที่พิมพ์จริง: กรอบโลโก้ 96×52 และขนาดตัวอักษรเดียวกับหัวจดหมาย
                  ให้เห็นว่าโลโก้ที่เลือกเล็ก/ใหญ่แค่ไหนเมื่ออยู่ข้างชื่อบริษัท */}
              <div className="flex min-w-0 items-start gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-2.5">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="ตัวอย่างโลโก้บนหัวเอกสาร"
                    className="h-auto max-h-13 w-auto max-w-24"
                  />
                ) : (
                  <span className="text-xs text-slate-400">ไม่มีโลโก้</span>
                )}
                <div className="min-w-0 text-[10px] leading-relaxed text-slate-600">
                  <p className="text-xs font-bold text-slate-800">{form.companyName || "ชื่อบริษัท"}</p>
                  <p className="max-w-64 truncate">{form.companyAddress}</p>
                </div>
              </div>
              <div className="flex flex-col items-start gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {/* label ห่อ input file ที่ซ่อนไว้ — คลิกตรงไหนของปุ่มก็เปิดหน้าต่างเลือกไฟล์ */}
                  <label
                    className={`${buttonClasses("ghost", "sm")} cursor-pointer focus-within:ring-2 focus-within:ring-slate-400`}
                  >
                    <ImageUp size={14} aria-hidden />
                    {preparingLogo ? "กำลังเตรียมรูป..." : "เลือกไฟล์โลโก้"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      disabled={preparingLogo || saving}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        // ล้างค่าให้เลือกไฟล์เดิมซ้ำได้ (ไม่งั้น onChange ไม่ยิงรอบสอง)
                        e.target.value = "";
                        if (file) void chooseLogo(file);
                      }}
                    />
                  </label>
                  {logoSecondaryAction && (
                    <button
                      type="button"
                      onClick={() => {
                        setLogoError(null);
                        logoSecondaryAction.run();
                      }}
                      className="link-pill text-xs font-medium text-brand"
                    >
                      {logoSecondaryAction.label}
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500">PNG, JPG หรือ WEBP · ระบบย่อขนาดให้เอง</p>
                {logoError && <FieldError>{logoError}</FieldError>}
              </div>
            </div>
          </div>

          <div className={CARD}>
            <CardHead
              title="ผู้มีอำนาจลงนาม"
              desc="พิมพ์ใต้ช่องเซ็นฝั่งบริษัทในใบเสนอราคาและสัญญา — สัญญาที่ออกไปแล้วไม่เปลี่ยนตาม"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={FIELD}>
                <span>ชื่อ-นามสกุล</span>
                <input
                  value={form.companySignatoryName}
                  onChange={(e) => setForm((f) => ({ ...f, companySignatoryName: e.target.value }))}
                  className={INPUT}
                  placeholder="เช่น นายสมชาย ใจดี"
                />
              </label>
              <label className={FIELD}>
                <span>ตำแหน่ง</span>
                <input
                  value={form.companySignatoryTitle}
                  onChange={(e) => setForm((f) => ({ ...f, companySignatoryTitle: e.target.value }))}
                  className={INPUT}
                  placeholder="เช่น กรรมการผู้จัดการ"
                />
              </label>
            </div>
          </div>

          <div className={CARD}>
            <CardHead
              title="บัญชีรับเงิน"
              desc="พิมพ์บนใบเสนอราคาที่ส่งลูกค้า และขึ้นในหน้าสัญญาของลูกค้าเมื่อมีงวดค้างชำระ — ใส่ในเนื้อสัญญาได้ด้วยตัวแปร {{บัญชีรับเงิน}}"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={FIELD}>
                <span>ธนาคาร</span>
                <input
                  value={form.paymentBankName}
                  onChange={(e) => setForm((f) => ({ ...f, paymentBankName: e.target.value }))}
                  className={inputClass(bankMissing.some((m) => m.key === "paymentBankName"))}
                  list="settings-thai-banks"
                  placeholder="พิมพ์หรือเลือกจากรายการ"
                />
                <datalist id="settings-thai-banks">
                  {THAI_BANKS.map((bank) => (
                    <option key={bank} value={bank} />
                  ))}
                </datalist>
              </label>
              <label className={FIELD}>
                <span>สาขา (ไม่บังคับ)</span>
                <input
                  value={form.paymentBankBranch}
                  onChange={(e) => setForm((f) => ({ ...f, paymentBankBranch: e.target.value }))}
                  className={INPUT}
                  placeholder="เช่น นครปฐม"
                />
              </label>
              <label className={FIELD}>
                <span>ชื่อบัญชี</span>
                <input
                  value={form.paymentAccountName}
                  onChange={(e) => setForm((f) => ({ ...f, paymentAccountName: e.target.value }))}
                  className={inputClass(bankMissing.some((m) => m.key === "paymentAccountName"))}
                  placeholder={form.companyName || "ชื่อตามหน้าสมุดบัญชี"}
                />
              </label>
              <label className={FIELD}>
                <span>เลขที่บัญชี</span>
                <input
                  value={form.paymentAccountNo}
                  onChange={(e) => setForm((f) => ({ ...f, paymentAccountNo: e.target.value }))}
                  className={`${inputClass(
                    accountNoInvalid || bankMissing.some((m) => m.key === "paymentAccountNo"),
                  )} tabular-nums`}
                  placeholder="xxx-x-xxxxx-x"
                  inputMode="numeric"
                />
                {accountNoInvalid && (
                  <FieldError>
                    ต้องเป็นตัวเลข 10–12 หลัก (ตอนนี้ {digitCount(form.paymentAccountNo)} หลัก)
                  </FieldError>
                )}
              </label>
              <label className={FIELD}>
                <span>พร้อมเพย์ (ไม่บังคับ)</span>
                <input
                  value={form.paymentPromptPay}
                  onChange={(e) => setForm((f) => ({ ...f, paymentPromptPay: e.target.value }))}
                  className={`${inputClass(promptPayInvalid)} tabular-nums`}
                  placeholder="เลขประจำตัวผู้เสียภาษี หรือเบอร์มือถือ"
                  inputMode="numeric"
                />
                {promptPayInvalid && (
                  <FieldError>ต้องเป็นเลข 13 หลัก หรือเบอร์มือถือ 10 หลักที่ขึ้นต้นด้วย 0</FieldError>
                )}
              </label>
            </div>
            {form.paymentPromptPay.trim() !== "" && !promptPayInvalid && (
              <PromptPayTest promptPay={form.paymentPromptPay} accountName={form.paymentAccountName} />
            )}
            {bankMissing.length > 0 && (
              <p className="text-xs text-red-600">
                กรอกให้ครบ: {bankMissing.map((m) => m.label).join(" · ")} — หรือเว้นว่างทั้งหมด
              </p>
            )}
          </div>

          {/* ค่าตั้งต้นของใบเสนอราคา — ถูกตรึงลงใบตอนกดส่ง แก้ตรงนี้ทีหลังใบที่ลูกค้าถืออยู่ไม่เปลี่ยน */}
          <div className={CARD}>
            <CardHead
              title="ใบเสนอราคา"
              desc="พิมพ์ท้ายใบเสนอราคาที่ส่งลูกค้า — ติดไปกับใบตอนกดส่ง แก้ทีหลังใบที่ส่งไปแล้วไม่เปลี่ยนตาม"
            />
            <label className={FIELD}>
              <span>ยืนราคา</span>
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={MAX_VALIDITY_DAYS}
                  step={1}
                  value={form.quoteValidityDays}
                  onChange={(e) => setForm((f) => ({ ...f, quoteValidityDays: e.target.value }))}
                  className={`${inputClass(validityInvalid)} w-24 tabular-nums`}
                  placeholder="30"
                />
                <span className="text-sm text-slate-600">วัน นับจากวันที่ส่ง</span>
              </span>
              {validityInvalid ? (
                <FieldError>ต้องเป็นจำนวนเต็ม 1–{MAX_VALIDITY_DAYS} วัน</FieldError>
              ) : (
                <span className="text-xs text-slate-500">
                  {form.quoteValidityDays.trim() === ""
                    ? "เว้นว่าง = ไม่มีกำหนดหมดอายุ"
                    : "พ้นกำหนดแล้วลูกค้ากดยอมรับเองไม่ได้ — ขยายวันได้ที่หน้าโครงการ"}
                </span>
              )}
            </label>
            <label className={FIELD}>
              <span>เงื่อนไข</span>
              <textarea
                rows={5}
                maxLength={2000}
                value={form.quoteTerms}
                onChange={(e) => setForm((f) => ({ ...f, quoteTerms: e.target.value }))}
                className={`${INPUT} leading-relaxed`}
                placeholder={"ชำระมัดจำ 30% เมื่อเซ็นสัญญา\nราคานี้ไม่รวมค่าขออนุญาตก่อสร้าง\nรับประกันงานโครงสร้าง 1 ปีนับจากวันส่งมอบ"}
              />
              <span className="text-xs text-slate-500">บรรทัดละข้อ — เอกสารใส่เลขข้อให้เอง</span>
            </label>
          </div>

          {/* ค่าตั้งต้นของสัญญาใหม่ — ตรึงลงสัญญาตอนออก แก้ได้ในสัญญาแต่ละฉบับจนกว่าจะลงนาม */}
          <div className={CARD}>
            <CardHead
              title="สัญญา"
              desc="ค่าตั้งต้นของสัญญาที่ออกใหม่ — แก้ได้ในสัญญาแต่ละฉบับจนกว่าจะลงนาม สัญญาที่ออกไปแล้วไม่เปลี่ยนตาม"
            />
            <label className={FIELD}>
              <span>เงินประกันผลงาน</span>
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  value={form.retentionPercent}
                  onChange={(e) => setForm((f) => ({ ...f, retentionPercent: e.target.value }))}
                  className={`${inputClass(retentionInvalid)} w-24 tabular-nums`}
                  placeholder="ไม่มี"
                />
                <span className="text-sm text-slate-600">% ของยอดแต่ละงวด (รวม VAT)</span>
              </span>
              {retentionInvalid ? (
                <FieldError>ใส่ได้มากกว่า 0 ถึง 20%</FieldError>
              ) : (
                <span className="text-xs text-slate-500">
                  {form.retentionPercent.trim() === ""
                    ? "เว้นว่าง = สัญญาใหม่ไม่มีเงินประกันผลงาน"
                    : "ผู้ว่าจ้างกันไว้ทุกงวดแล้วคืนเมื่อพ้นระยะรับประกันผลงาน — พิมพ์ใต้ตารางงวดในสัญญา"}
                </span>
              )}
            </label>
          </div>

          <SaveRow
            onSave={submitSave}
            disabled={cannotSave}
            dirty={dirty}
            savedMessage={savedMessage}
            blockedBy={blockedBy}
            onGoToTab={goToTab}
          />
        </div>
      )}

      {activeTab === "pricing" && (
        <div className={COL}>
          <div className={CARD}>
            <CardHead
              title="อัตราคิดราคา"
              desc="ใช้ภายในเท่านั้น — เป็นค่าเริ่มต้นเมื่อสร้างโครงการใหม่ ปรับรายโครงการได้ภายหลังที่หน้าโครงการ"
            />
            {/* ช่อง % ใส่เลขไม่กี่ตัว ไม่ต้องกว้างเต็มการ์ด (ของเดิมกว้าง 478px เท่าช่องที่อยู่) */}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={FIELD}>
                <span>ค่าดำเนินการและกำไร (%)</span>
                <input
                  type="number"
                  value={form.overheadProfitPercent}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, overheadProfitPercent: e.target.value }))
                  }
                  disabled={!isOwner}
                  className={`${INPUT} ${LOCKED} w-28 tabular-nums`}
                />
              </label>
              <label className={FIELD}>
                <span>ภาษีมูลค่าเพิ่ม (%)</span>
                <input
                  type="number"
                  value={form.vatPercent}
                  onChange={(e) => setForm((f) => ({ ...f, vatPercent: e.target.value }))}
                  className={`${INPUT} w-28 tabular-nums`}
                />
              </label>
              {/* ค่าดำเนินการคือส่วนที่ "แตะไม่ได้" ตอนต่อรองราคา (ค่าคุมงาน สำนักงานสนาม
                  ประกันผลงาน) — แยกไว้แล้วหน้าโครงการจะบอกได้ว่าส่วนลดที่ให้ไปกินกำไรไปเท่าไร
                  เว้นว่าง = ไม่แยก ระบบจะแสดงเป็นก้อนรวมเหมือนเดิมทุกอย่าง */}
              <label className={FIELD}>
                <span>ในจำนวนนั้น เป็นค่าดำเนินการ (%)</span>
                <input
                  type="number"
                  value={form.overheadPercent}
                  onChange={(e) => setForm((f) => ({ ...f, overheadPercent: e.target.value }))}
                  placeholder="ไม่แยก"
                  disabled={!isOwner}
                  className={`${INPUT} ${LOCKED} w-28 tabular-nums`}
                />
                <span
                  className={`text-xs ${overheadOverTotal ? "text-red-600" : "text-slate-500"}`}
                >
                  {overheadSplitHint}
                </span>
              </label>
            </div>
            {!isOwner && (
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Lock size={12} /> อัตราค่าดำเนินการและกำไรแก้ได้เฉพาะเจ้าของระบบ — VAT แก้ได้ตามปกติ
              </p>
            )}

            <SaveRow
              onSave={submitSave}
              disabled={cannotSave}
              dirty={dirty}
              savedMessage={savedMessage}
              blockedBy={blockedBy}
              onGoToTab={goToTab}
            />
          </div>

        </div>
      )}

      {activeTab === "takeoff" && <TakeoffRulesSettings isOwner={isOwner} />}

      {activeTab === "backup" && isOwner && (
        <div className={COL}>
          <BackupSettings />
        </div>
      )}

      {activeTab === "mail" && isOwner && (
        <div className={COL}>
          <MailSettings />
        </div>
      )}

      {activeTab === "network" && isOwner && (
        <div className={COL}>
          <IpCheckSettings />
        </div>
      )}
    </Layout>
  );
}
