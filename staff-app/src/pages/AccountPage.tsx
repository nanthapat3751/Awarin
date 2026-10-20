import { type AuthenticatedUser, PASSWORD_HINT, passwordProblem } from "@systemboq/shared-types";
import {
  Camera,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MonitorSmartphone,
  PenLine,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { Avatar } from "../components/Avatar";
import { AvatarCropDialog } from "../components/AvatarCropDialog";
import { Button } from "../components/Button";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { ProfileFieldDialog } from "../components/ProfileFieldDialog";
import {
  CapsLockHint,
  PasswordMatchHint,
  PasswordRules,
  PasswordStrengthBar,
  ThaiKeyboardHint,
} from "../components/PasswordHints";
import { LoginHistoryCard } from "../components/LoginHistoryCard";
import { RecoveryEmailRow } from "../components/RecoveryEmailRow";
import { SessionsCard } from "../components/SessionsCard";
import { SignatureCard } from "../components/SignatureCard";
import { TwoFactorSettings } from "../components/TwoFactorSettings";
import { changeMyPassword, getMySecurity, removeMyAvatar, updateMyProfile, uploadMyAvatar } from "../lib/account-api";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useConfirm } from "../lib/confirm-context";
import { ROLE_LABEL } from "../lib/role-labels";
import { useCapsLock } from "../lib/use-caps-lock";
import { useToast } from "../lib/toast-context";

// หมวดของหน้า (เมนูด้านข้าง แบบเดียวกับ "บัญชีของฉัน" ฝั่งลูกค้า) — เก็บใน ?tab= ให้ลิงก์ตรงเข้าหมวดได้
type Tab = "profile" | "signature" | "security" | "devices";

const TABS: { id: Tab; label: string; hint: string; Icon: LucideIcon }[] = [
  { id: "profile", label: "โปรไฟล์", hint: "รูป ชื่อ ตำแหน่ง และเบอร์ติดต่อ", Icon: UserRound },
  { id: "signature", label: "ลายเซ็น", hint: "ลงในใบเสนอราคาที่คุณกด", Icon: PenLine },
  { id: "security", label: "ความปลอดภัย", hint: "รหัสผ่านและยืนยันตัวตน 2 ชั้น", Icon: ShieldCheck },
  { id: "devices", label: "อุปกรณ์ที่เข้าสู่ระบบ", hint: "เครื่องที่เข้าอยู่และประวัติการเข้า", Icon: MonitorSmartphone },
];

// ลิงก์เดิมแบบ #hash (เมนูชื่อผู้ใช้ส่งมาที่ /account#two-factor) → หมวดที่ของนั้นย้ายไปอยู่
const HASH_TAB: Record<string, Tab> = {
  profile: "profile",
  signature: "signature",
  password: "security",
  "two-factor": "security",
  "recovery-email": "security",
  devices: "devices",
};

// การ์ดแต่ละหมวดบันทึกของตัวเอง
const CARD = "bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3";
const FIELD = "flex flex-col gap-1 text-xs text-slate-700";
const INPUT = "border border-slate-300 rounded-md px-2 py-1 text-sm";
/** ไฟล์ดิบที่ยอมให้เปิดในหน้าครอป — ย่อในเบราว์เซอร์ก่อนส่ง ที่ส่งจริงจึงเล็กกว่านี้มาก */
const MAX_PICK_BYTES = 20 * 1024 * 1024;

function msg(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function CardHead({ title, desc }: Readonly<{ title: string; desc: string }>) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-800">{title}</p>
      <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
    </div>
  );
}

// ─────────────────────────── รูปโปรไฟล์ ───────────────────────────

function AvatarEditor({ user, onUser }: Readonly<{ user: AuthenticatedUser; onUser: (u: AuthenticatedUser) => void }>) {
  const toast = useToast();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  // มีรูปแล้ว: กดรูป/ไอคอนกล้อง = เปิดเมนู (เปลี่ยนรูป / ลบรูป) · ยังไม่มีรูป = เปิดเลือกไฟล์ทันที
  const [menuOpen, setMenuOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const hasAvatar = !!user.avatarUrl;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function choose() {
    setMenuOpen(false);
    inputRef.current?.click();
  }

  function pick(file: File | undefined) {
    // ล้างค่าเสมอ ไม่งั้นเลือกไฟล์เดิมซ้ำ (หลังกดยกเลิก) จะไม่มี change event
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("เลือกได้เฉพาะไฟล์รูปภาพ");
      return;
    }
    if (file.size > MAX_PICK_BYTES) {
      toast.error("ไฟล์ใหญ่เกิน 20 MB");
      return;
    }
    setPicked(file);
  }

  async function upload(image: Blob) {
    try {
      onUser(await uploadMyAvatar(image));
    } catch (err) {
      throw new Error(msg(err, "อัปโหลดไม่สำเร็จ"));
    }
    setPicked(null);
    toast.success("เปลี่ยนรูปโปรไฟล์แล้ว");
  }

  async function remove() {
    setMenuOpen(false);
    const ok = await confirm("ลบรูปโปรไฟล์? จะกลับไปแสดงตัวย่อชื่อแทน", {
      confirmLabel: "ลบรูป",
      variant: "danger",
    });
    if (!ok) return;
    setRemoving(true);
    try {
      onUser(await removeMyAvatar());
      toast.success("ลบรูปโปรไฟล์แล้ว");
    } catch (err) {
      toast.error(msg(err, "ลบรูปไม่สำเร็จ"));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div ref={boxRef} className="relative shrink-0">
        <button
          type="button"
          onClick={hasAvatar ? () => setMenuOpen((v) => !v) : choose}
          disabled={removing}
          aria-label={hasAvatar ? "จัดการรูปโปรไฟล์" : "อัปโหลดรูปโปรไฟล์"}
          aria-haspopup={hasAvatar ? "menu" : undefined}
          aria-expanded={hasAvatar ? menuOpen : undefined}
          title={hasAvatar ? "เปลี่ยนหรือลบรูป" : "อัปโหลดรูป"}
          className="group relative rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
        >
          <Avatar name={user.fullName} src={user.avatarUrl} size={80} />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white ring-2 ring-white transition-colors group-hover:bg-brand-dark">
            <Camera size={14} />
          </span>
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute left-14 top-full z-30 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={choose}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Upload size={15} className="shrink-0 text-slate-500" />
              เปลี่ยนรูป
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={remove}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
            >
              <Trash2 size={15} className="shrink-0" />
              ลบรูป
            </button>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-sm text-slate-600">
          {hasAvatar ? "กดที่รูปเพื่อเปลี่ยนหรือลบ" : "กดที่รูปเพื่ออัปโหลด"}
        </p>
        <p className="mt-1 text-xs text-slate-500">JPG, PNG หรือ WEBP · เลือกกรอบได้ก่อนบันทึก</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {picked && <AvatarCropDialog file={picked} onCancel={() => setPicked(null)} onConfirm={upload} />}
    </div>
  );
}

// ─────────────────────────── โปรไฟล์ ───────────────────────────

interface ProfileForm {
  fullName: string;
  jobTitle: string;
  workPhone: string;
}

const formOf = (u: AuthenticatedUser): ProfileForm => ({
  fullName: u.fullName,
  jobTitle: u.jobTitle ?? "",
  workPhone: u.workPhone ?? "",
});

type ProfileKey = keyof ProfileForm;

const PROFILE_ROWS: {
  key: ProfileKey;
  label: string;
  empty: string;
  placeholder: string;
  description: string;
  inputType?: "text" | "tel";
  autoComplete?: string;
  required?: boolean;
}[] = [
  {
    key: "fullName",
    label: "ชื่อที่แสดง",
    empty: "—",
    placeholder: "เช่น สมชาย ใจดี",
    description: "ชื่อนี้แสดงในระบบฝั่งบริษัท และพิมพ์บนเอกสารที่คุณเป็นผู้เสนอราคา",
    autoComplete: "name",
    required: true,
  },
  {
    key: "jobTitle",
    label: "ตำแหน่ง",
    empty: "เพิ่มตำแหน่ง",
    placeholder: "เช่น วิศวกรประเมินราคา",
    description: "แสดงใต้ชื่อของคุณในเมนูด้านซ้าย",
  },
  {
    key: "workPhone",
    label: "เบอร์ติดต่อ",
    empty: "เพิ่มเบอร์ติดต่อ",
    placeholder: "เช่น 081-234-5678",
    description: "เบอร์ที่เพื่อนร่วมงานใช้ติดต่อคุณ",
    inputType: "tel",
    autoComplete: "tel",
  },
];

/**
 * โปรไฟล์แบบ "แถวกดได้ → หน้าต่างแก้ช่องนั้น" (แบบบัญชี Google / Apple ID) — เปิดหน้ามาเป็นข้อความ
 * อ่านอย่างเดียว ไม่มีช่องกรอกให้เผลอพิมพ์ทับ · กดแถวไหนแก้เฉพาะช่องนั้นในหน้าต่างกลางจอ
 * ชื่อผู้ใช้เป็นแถวล็อก (ไม่มีลูกศร) · รูปโปรไฟล์ยังกดเปลี่ยนที่รูปได้ตามเดิม
 */
function ProfileCard({ user, onUser }: Readonly<{ user: AuthenticatedUser; onUser: (u: AuthenticatedUser) => void }>) {
  const toast = useToast();
  const [editing, setEditing] = useState<ProfileKey | null>(null);
  const current = formOf(user);
  const row = PROFILE_ROWS.find((r) => r.key === editing);

  async function saveField(key: ProfileKey, value: string): Promise<string | null> {
    const next = { ...current, [key]: value };
    try {
      onUser(
        await updateMyProfile({
          fullName: next.fullName,
          jobTitle: next.jobTitle || null,
          workPhone: next.workPhone || null,
        }),
      );
      toast.success("บันทึกแล้ว");
      return null;
    } catch (err) {
      return msg(err, "บันทึกไม่สำเร็จ");
    }
  }

  return (
    <section id="profile" className={`${CARD} scroll-mt-20`}>
      <CardHead title="โปรไฟล์" desc="ชื่อและรูปนี้แสดงในระบบฝั่งบริษัท ให้เพื่อนร่วมงานรู้ว่าใครทำรายการไหน · กดที่แถวเพื่อแก้ไข" />
      <AvatarEditor user={user} onUser={onUser} />

      <ul className="divide-y divide-slate-100 border-y border-slate-100">
        {PROFILE_ROWS.map((r) => {
          const value = current[r.key].trim();
          return (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => setEditing(r.key)}
                className="group flex w-full items-center gap-4 px-1 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <span className="w-28 shrink-0 text-sm text-slate-500">{r.label}</span>
                <span className={`min-w-0 flex-1 truncate text-sm ${value ? "text-slate-800" : "text-brand"}`}>
                  {value || r.empty}
                </span>
                <ChevronRight size={16} aria-hidden className="shrink-0 text-slate-300 group-hover:text-slate-500" />
              </button>
            </li>
          );
        })}
        <li className="flex items-center gap-4 px-1 py-3" title="ใช้เป็นชื่อเข้าสู่ระบบ จึงแก้จากหน้านี้ไม่ได้ — ให้เจ้าของระบบเปลี่ยนให้">
          <span className="w-28 shrink-0 text-sm text-slate-500">ชื่อผู้ใช้</span>
          <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{user.username ?? "—"}</span>
          <Lock size={14} aria-label="แก้ไม่ได้" className="shrink-0 text-slate-300" />
        </li>
        <li className="flex items-center gap-4 px-1 py-3">
          <span className="w-28 shrink-0 text-sm text-slate-500">บทบาท</span>
          <span className="min-w-0 flex-1 text-sm text-slate-800">{ROLE_LABEL[user.role]}</span>
          <Lock size={14} aria-label="แก้ไม่ได้" className="shrink-0 text-slate-300" />
        </li>
      </ul>
      <p className="text-xs text-slate-400">ชื่อผู้ใช้และบทบาทเปลี่ยนได้โดยเจ้าของระบบเท่านั้น</p>

      {row && (
        <ProfileFieldDialog
          title={row.label}
          description={row.description}
          initial={current[row.key]}
          placeholder={row.placeholder}
          inputType={row.inputType}
          autoComplete={row.autoComplete}
          required={row.required}
          onSave={(v) => saveField(row.key, v)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

// ─────────────────────────── รหัสผ่าน ───────────────────────────

// ปุ่มตาแทนช่อง "ยืนยันรหัสผ่าน" — เห็นว่าพิมพ์อะไรไปก็ไม่ต้องพิมพ์ซ้ำ (แนวทางที่เว็บใหญ่ใช้กันตอนนี้)
function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  capsProps,
  onFocus,
  placeholder,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: ReactNode;
  /** จาก useCapsLock() — ใส่เฉพาะช่องที่ต้องเตือน Caps Lock */
  capsProps?: ReturnType<typeof useCapsLock>["capsProps"];
  onFocus?: () => void;
  placeholder?: string;
}>) {
  const [show, setShow] = useState(false);
  return (
    <label className={FIELD}>
      {label}
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          onFocus={onFocus}
          placeholder={placeholder}
          {...capsProps}
          className={`${INPUT} w-full pr-8`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {hint}
    </label>
  );
}

/** "3 เดือนที่แล้ว" — แบบเดียวกับฝั่งลูกค้า */
function passwordAge(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} วันที่แล้ว`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} เดือนที่แล้ว`;
  return `${Math.floor(days / 365)} ปีที่แล้ว`;
}

/**
 * แถวรหัสผ่านในหมวดความปลอดภัย — พับเหลือบรรทัดสรุป "เปลี่ยนล่าสุด…" กดแล้วค่อยกางฟอร์ม
 * (คนส่วนใหญ่เข้าหน้านี้ไม่ได้มาเปลี่ยนรหัส ฟอร์มสามช่องที่กางรอไว้ตลอดทำให้หน้ารก)
 */
function PasswordRow({ defaultOpen = false }: Readonly<{ defaultOpen?: boolean }>) {
  const toast = useToast();
  const { user } = useAuth();
  const { capsOn, capsProps } = useCapsLock();
  const [open, setOpen] = useState(defaultOpen);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [nextFocused, setNextFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = ไม่รู้ (บัญชีเก่าก่อนมีคอลัมน์นี้) — ไม่โชว์ ดีกว่าเดาวันที่ผิด
  const [changedAt, setChangedAt] = useState<string | null>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    getMySecurity()
      .then((r) => setChangedAt(r.passwordChangedAt))
      .catch(() => setChangedAt(null));
  }, []);

  // กฎชุดเดียวกับเซิร์ฟเวอร์ (@systemboq/shared-types) — ข้อมูลตัวเองส่งไปด้วยเพื่อกัน
  // การตั้งรหัสที่มีชื่อผู้ใช้หรือชื่อ-นามสกุลของตัวเองอยู่ข้างใน
  const personal = [user?.username, user?.fullName, user?.workPhone];
  const sameAsCurrent = next.length > 0 && next === current;

  function close() {
    setOpen(false);
    setCurrent("");
    setNext("");
    setConfirm("");
    setNextFocused(false);
    setError(null);
    // คืนโฟกัสให้ปุ่มที่กดเปิด — คนใช้คีย์บอร์ดไม่หลงตำแหน่ง (รอให้ปุ่มกลับมาก่อน)
    setTimeout(() => openButtonRef.current?.focus(), 0);
  }

  async function submit() {
    // ปุ่มกดได้เสมอ — บอกเหตุผลข้อแรกที่ยังไม่ผ่านแทนการทำปุ่มเทาเงียบ ๆ
    const problem =
      (!current && "กรอกรหัสผ่านปัจจุบัน") ||
      (!next && "กรอกรหัสผ่านใหม่") ||
      passwordProblem(next, personal) ||
      (sameAsCurrent && "รหัสผ่านใหม่ยังเหมือนรหัสเดิม") ||
      (confirm !== next && "ยืนยันรหัสผ่านใหม่ไม่ตรงกัน") ||
      null;
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await changeMyPassword(current, next);
      setChangedAt(new Date().toISOString());
      close();
      toast.success("เปลี่ยนรหัสผ่านแล้ว · อุปกรณ์อื่นถูกออกจากระบบทั้งหมด");
    } catch (err) {
      setError(msg(err, "เปลี่ยนรหัสผ่านไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id="password" className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <KeyRound size={18} className="mt-0.5 shrink-0 text-brand" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">รหัสผ่าน</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {changedAt ? (
                <>
                  เปลี่ยนล่าสุด <time dateTime={changedAt}>{passwordAge(changedAt)}</time>
                </>
              ) : (
                "ใช้เข้าสู่ระบบคู่กับชื่อผู้ใช้"
              )}
            </p>
          </div>
        </div>
        {!open && (
          <Button ref={openButtonRef} size="sm" variant="ghost" onClick={() => setOpen(true)}>
            เปลี่ยนรหัสผ่าน
          </Button>
        )}
      </div>

      {open && (
        <form
          className="flex flex-col gap-3 pl-[30px]"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {/* ให้ตัวจัดการรหัสผ่านของเบราว์เซอร์รู้ว่ารหัสนี้ของบัญชีไหน */}
          <input type="text" name="username" autoComplete="username" value={user?.username ?? ""} readOnly hidden />
          <p className="text-xs text-slate-500">ต้องกรอกรหัสผ่านปัจจุบันก่อนเสมอ · เปลี่ยนแล้วอุปกรณ์อื่นจะถูกออกจากระบบทั้งหมด</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <PasswordField label="รหัสผ่านปัจจุบัน" value={current} onChange={setCurrent} autoComplete="current-password" />
            <div className="hidden sm:block" aria-hidden />
            <PasswordField
              label="รหัสผ่านใหม่"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              placeholder={PASSWORD_HINT}
              capsProps={capsProps}
              onFocus={() => setNextFocused(true)}
              hint={
                <>
                  <CapsLockHint on={capsOn} />
                  <ThaiKeyboardHint value={next} />
                  <PasswordStrengthBar value={next} personal={personal} />
                  <PasswordRules value={next} personal={personal} show={nextFocused} />
                </>
              }
            />
            <PasswordField
              label="ยืนยันรหัสผ่านใหม่"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              hint={<PasswordMatchHint password={next} confirm={confirm} />}
            />
          </div>
          {sameAsCurrent && <p className="text-xs text-amber-700">รหัสผ่านใหม่ยังเหมือนรหัสเดิม</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "กำลังเปลี่ยน..." : "เปลี่ยนรหัสผ่าน"}
            </Button>
            <Button type="button" variant="ghost" onClick={close} disabled={saving}>
              ยกเลิก
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─────────────────────────── หน้า ───────────────────────────

/**
 * บัญชีของฉัน — เรื่องของแต่ละคน (รูป ชื่อ ลายเซ็น รหัสผ่าน 2FA อุปกรณ์) แยกจากหน้าตั้งค่าที่เป็นเรื่องของบริษัท
 *
 * เมนูหมวดด้านข้างแบบเดียวกับ "บัญชีของฉัน" ฝั่งลูกค้า เห็นทีละหมวดแทนการ์ด 5 ใบเรียงยาว ·
 * หมวดความปลอดภัยเป็นแถวพับ (รหัสผ่าน / 2FA) บอกสถานะในบรรทัดเดียว กดแล้วค่อยกาง
 * เปิดจากเมนูชื่อตัวเองท้ายเมนูข้าง · ลิงก์เดิม #two-factor ยังพาเข้าหมวดความปลอดภัยและกางแถว 2FA ให้
 */
export function AccountPage() {
  const { user, commitUser } = useAuth();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.id === searchParams.get("tab"))?.id ?? "profile";
  // มาจากลิงก์ "ตั้งค่า 2FA" ในเมนูชื่อผู้ใช้ — กางแถว 2FA ไว้เลย ไม่ต้องหาปุ่มจัดการอีกที
  const [openTwoFactor, setOpenTwoFactor] = useState(hash === "#two-factor");
  // มาจากปุ่ม "ไม่ใช่ฉัน" ในหน้าอุปกรณ์ — กางฟอร์มเปลี่ยนรหัสผ่านไว้ให้เลย
  const [openPassword, setOpenPassword] = useState(hash === "#password");
  // มาจากแถบเตือน "ยังไม่ได้ตั้งอีเมลกู้รหัสผ่าน" — กางแถวอีเมลไว้ให้เลย
  const [openRecoveryEmail, setOpenRecoveryEmail] = useState(hash === "#recovery-email");

  // ลิงก์เก่าแบบ #hash → ?tab= (replace ไม่ให้ปุ่มย้อนกลับเด้งกลับมาที่ #hash)
  useEffect(() => {
    const target = HASH_TAB[hash.slice(1)];
    if (!target) return;
    if (hash === "#two-factor") setOpenTwoFactor(true);
    if (hash === "#password") setOpenPassword(true);
    if (hash === "#recovery-email") setOpenRecoveryEmail(true);
    navigate({ search: `?tab=${target}`, hash: "" }, { replace: true });
  }, [hash, navigate]);

  function pick(next: Tab) {
    setSearchParams(next === "profile" ? {} : { tab: next }, { replace: true });
  }

  if (!user) return null;
  return (
    <Layout>
      <PageHeader title="บัญชีของฉัน" subtitle="โปรไฟล์ ลายเซ็น รหัสผ่าน และอุปกรณ์ที่เข้าสู่ระบบของบัญชีคุณ" />
      {/* จอแคบกว่า 1024 (iPad แนวตั้ง) เมนูหมวดเป็นแถบแท็บแนวนอนด้านบน — สองคอลัมน์บีบเนื้อหาเหลือครึ่งจอ */}
      <div className="grid max-w-5xl gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        <nav
          aria-label="หมวดของบัญชี"
          className="-mx-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 px-1 [scrollbar-width:none] lg:sticky lg:top-20 lg:mx-0 lg:flex-col lg:overflow-visible lg:border-0 lg:px-0"
        >
          {TABS.map(({ id, label, hint, Icon }) => {
            const active = id === tab;
            return (
              <button
                key={id}
                type="button"
                onClick={() => pick(id)}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-left transition-colors lg:items-start lg:gap-3 lg:whitespace-normal lg:rounded-lg lg:border-b-0 lg:py-2 ${
                  active
                    ? "border-brand text-brand lg:bg-brand/5"
                    : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                }`}
              >
                <Icon size={17} className={`shrink-0 lg:mt-0.5 ${active ? "text-brand" : "text-slate-400"}`} />
                <span className="min-w-0">
                  <span className={`block text-sm ${active ? "font-medium" : ""}`}>{label}</span>
                  <span className="hidden text-xs text-slate-400 lg:block">{hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          {/* key: บันทึกแล้วได้ user ใหม่ ฟอร์มต้องไม่ค้างค่าจากคนก่อนถ้าสลับบัญชีในแท็บเดิม */}
          {tab === "profile" && <ProfileCard key={user.id} user={user} onUser={commitUser} />}
          {tab === "signature" && <SignatureCard />}
          {tab === "security" && (
            <section className={CARD}>
              <CardHead
                title="ความปลอดภัย"
                desc="รหัสผ่าน การยืนยันตัวตน 2 ชั้น และอีเมลกู้รหัสผ่านของบัญชีนี้ — กดที่แต่ละแถวเพื่อจัดการ"
              />
              <div id="two-factor" className="divide-y divide-slate-100 border-t border-slate-100">
                <PasswordRow defaultOpen={openPassword} key={`pw-${openPassword}`} />
                <TwoFactorSettings collapsible defaultOpen={openTwoFactor} key={String(openTwoFactor)} />
                <RecoveryEmailRow defaultOpen={openRecoveryEmail} key={`re-${openRecoveryEmail}`} />
              </div>
            </section>
          )}
          {tab === "devices" && (
            <div className="flex flex-col gap-6">
              <SessionsCard />
              <LoginHistoryCard />
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
