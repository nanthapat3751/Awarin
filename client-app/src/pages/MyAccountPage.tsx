import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type InputHTMLAttributes,
  type ReactNode,
  type SubmitEvent,
} from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import {
  type AuthenticatedUser,
  type CustomerProfileDto,
  type CustomerType,
  PASSWORD_HINT,
  passwordProblem,
} from "@systemboq/shared-types";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  LockIcon,
  TrashIcon,
  UserIcon,
} from "../components/FieldIcons";
import {
  CapsLockHint,
  PasswordMatchHint,
  PasswordRules,
  PasswordStrengthBar,
  ThaiKeyboardHint,
} from "../components/PasswordHints";
import { Avatar } from "../components/Avatar";
import { EditDialog } from "../components/EditDialog";
import { ProfilePhotoEditor } from "../components/ProfilePhotoEditor";
import { apiFetch } from "../lib/api";
import { ApiError, useAuth } from "../lib/auth-context";
import { useCapsLock } from "../lib/use-caps-lock";
import { InfoRowsSkeleton, Skeleton } from "../components/Skeleton";
import { usePageMeta } from "../lib/page-meta";

// หมวดของหน้า (เมนูด้านข้าง) — เก็บใน ?tab= เพื่อให้ลิงก์ตรงเข้าหมวดได้ และปุ่มย้อนกลับบนมือถือ
// พากลับไปหน้ารายการหมวดได้เอง
type Tab = "profile" | "billing" | "security" | "delete";

const TABS: {
  id: Tab;
  label: string;
  hint: string;
  Icon: ComponentType<{ className?: string }>;
  danger?: boolean;
}[] = [
  {
    id: "profile",
    label: "ข้อมูลส่วนตัว",
    hint: "รูปโปรไฟล์ ชื่อ และเบอร์โทรศัพท์",
    Icon: UserIcon,
  },
  {
    id: "billing",
    label: "ข้อมูลออกเอกสาร",
    hint: "ผู้ว่าจ้างและที่อยู่บนใบเสนอราคาและสัญญา",
    Icon: FileTextIcon,
  },
  {
    id: "security",
    label: "รหัสผ่าน",
    hint: "เปลี่ยนรหัสผ่านเข้าสู่ระบบ",
    Icon: LockIcon,
  },
  {
    id: "delete",
    label: "ลบบัญชี",
    hint: "ปิดบัญชีและลบข้อมูลส่วนตัว",
    Icon: TrashIcon,
    danger: true,
  },
];

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50";
const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-slate-700";
const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50 lg:min-h-10";

export function MyAccountPage() {
  usePageMeta("บัญชีของฉัน");
  const { user, changePassword, deleteAccount, replaceUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // null = ยังไม่ได้เลือกหมวด — มือถือแสดงรายการหมวด ส่วนจอกว้างเปิดหมวดแรกให้เลย
  const selectedTab = TABS.find((t) => t.id === searchParams.get("tab"))?.id ?? null;
  const tab: Tab = selectedTab ?? "profile";

  // ข้อมูลติดต่อ (เบอร์โทร/ที่อยู่) — ที่อยู่ใช้พิมพ์ "ที่อยู่ผู้ว่าจ้าง" บนใบเสนอราคา/สัญญา
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  // ผู้ว่าจ้างที่เป็นนิติบุคคลต้องบอกเองได้ตั้งแต่ต้น ไม่ใช่รอให้พนักงานสังเกตแล้วมากรอกให้ทีหลัง —
  // ไม่งั้นใบเสนอราคาใบแรกจะออกในนามชื่อคนที่สมัคร ซึ่งฝ่ายบัญชีของบริษัทตั้งเบิกไม่ได้
  const [customerType, setCustomerType] = useState<CustomerType>("INDIVIDUAL");
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [branch, setBranch] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  // ค่าที่บันทึกแล้ว — แถวในหน้าแสดงจากตัวนี้ · ช่องในหน้าต่างแก้ (state ด้านบน) เป็นแค่ร่าง กดยกเลิกแล้วทิ้ง
  const [saved, setSaved] = useState<CustomerProfileDto | null>(null);
  // หน้าต่างแก้ที่เปิดอยู่ (แบบ C: แถวอ่านอย่างเดียว กดแถวแล้วแก้ในหน้าต่าง)
  const [editing, setEditing] = useState<EditKind | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [savingTab, setSavingTab] = useState<Tab | null>(null);
  // ผลการบันทึกล่าสุด ผูกกับหมวดที่กด — สลับไปหมวดอื่นแล้วข้อความจะไม่ตามไปโผล่ผิดที่
  const [notice, setNotice] = useState<{
    tab: Tab;
    ok: boolean;
    text: string;
  } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPasswordFocused, setNewPasswordFocused] = useState(false);
  // ปิดไว้ก่อนเป็นแถวสรุป กด "เปลี่ยนรหัสผ่าน" แล้วค่อยกางฟอร์ม — คนส่วนใหญ่เข้าหน้านี้ไม่ได้มาเปลี่ยนรหัส
  const [editingPassword, setEditingPassword] = useState(false);
  // null = ไม่รู้ (บัญชีก่อนมีคอลัมน์นี้) — ไม่โชว์บรรทัด "เปลี่ยนล่าสุด" เลย ดีกว่าเดาวันที่ผิด
  const [passwordChangedAt, setPasswordChangedAt] = useState<string | null>(null);
  const changePasswordButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef(false);
  const { capsOn, capsProps } = useCapsLock();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    apiFetch<{ profile: CustomerProfileDto; passwordChangedAt: string | null }>("/api/auth/me/profile")
      .then((res) => {
        applyProfile(res.profile);
        setPasswordChangedAt(res.passwordChangedAt);
      })
      .catch(() => {
        // เงียบไว้ — โหลดโปรไฟล์ไม่สำเร็จไม่ควรบล็อกทั้งหน้า (ยังเปลี่ยนรหัสผ่านได้)
      })
      .finally(() => setProfileLoading(false));
  }, []);

  // ปิดฟอร์มแล้วคืนโฟกัสให้ปุ่ม "เปลี่ยนรหัสผ่าน" ที่เพิ่งกลับมา — คนใช้คีย์บอร์ด/โปรแกรมอ่านจอ
  // จะได้ไม่หลุดไปเริ่มที่หัวหน้าเว็บ
  useEffect(() => {
    if (!editingPassword && returnFocusRef.current) {
      returnFocusRef.current = false;
      changePasswordButtonRef.current?.focus();
    }
  }, [editingPassword]);

  function closePasswordForm() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setNewPasswordFocused(false);
    returnFocusRef.current = true;
    setEditingPassword(false);
  }

  function applyProfile(profile: CustomerProfileDto) {
    setSaved(profile);
    setPhone(profile.phone ?? "");
    setAddress(profile.address ?? "");
    setCustomerType(profile.customerType);
    setCompanyName(profile.companyName ?? "");
    setTaxId(profile.taxId ?? "");
    setBranch(profile.branch ?? "");
    setContactPerson(profile.contactPerson ?? "");
  }

  /** เปิดหน้าต่างแก้ — ร่างเริ่มจากค่าที่บันทึกแล้วเสมอ (เปิดซ้ำหลังกดยกเลิกต้องไม่เห็นค่าที่พิมพ์ค้าง) */
  function openEdit(kind: EditKind) {
    if (saved) applyProfile(saved);
    setFullName(user?.fullName ?? "");
    setDialogError(null);
    setNotice(null);
    setEditing(kind);
  }

  function closeEdit() {
    setEditing(null);
    setDialogError(null);
  }

  // PATCH แก้เฉพาะช่องที่ส่งไป (undefined = ไม่แตะ) แต่ละหน้าต่างจึงบันทึกแยกกันได้โดยไม่ทับกัน
  async function saveProfile(target: Tab, body: Record<string, unknown>, okText: string) {
    setNotice(null);
    setDialogError(null);
    setSavingTab(target);
    try {
      const res = await apiFetch<{
        profile: CustomerProfileDto;
        user: AuthenticatedUser;
      }>("/api/auth/me/profile", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      applyProfile(res.profile);
      replaceUser(res.user);
      setFullName(res.user.fullName);
      setNotice({ tab: target, ok: true, text: okText });
      setEditing(null);
    } catch (err) {
      setDialogError(err instanceof ApiError ? err.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setSavingTab(null);
    }
  }

  function saveName() {
    if (fullName.trim() === "") {
      setDialogError("กรุณากรอกชื่อ-นามสกุล");
      return;
    }
    void saveProfile("profile", { fullName: fullName.trim() }, "บันทึกชื่อแล้ว");
  }

  function savePhone() {
    // เบอร์โทรเป็นช่องบังคับของบัญชีลูกค้า (ทีมงานใช้ติดต่อกลับ) — ลบทิ้งไม่ได้ เปลี่ยนได้อย่างเดียว
    if (phone.trim() === "") {
      setDialogError("กรุณากรอกเบอร์โทรศัพท์");
      return;
    }
    void saveProfile("profile", { phone: phone.trim() }, "บันทึกเบอร์โทรศัพท์แล้ว");
  }

  function saveParty() {
    void saveProfile(
      "billing",
      {
        customerType,
        // กลับไปเป็นบุคคลธรรมดา = ล้างช่องของบริษัททิ้ง ไม่ใช่แค่ซ่อน ไม่งั้นวันหนึ่งติ๊กกลับมา
        // แล้วชื่อบริษัทเก่าจะโผล่ขึ้นเอกสารเงียบ ๆ
        companyName: customerType === "COMPANY" ? companyName.trim() : null,
        taxId: customerType === "COMPANY" ? taxId.trim() : null,
        branch: customerType === "COMPANY" ? branch.trim() : null,
        contactPerson: customerType === "COMPANY" ? contactPerson.trim() : null,
      },
      "บันทึกผู้ว่าจ้างในเอกสารแล้ว",
    );
  }

  function saveAddress() {
    // ส่ง null เพื่อ "ล้างที่อยู่" ให้ชัดเจน (undefined = ไม่แตะ)
    void saveProfile("billing", { address: address.trim() === "" ? null : address.trim() }, "บันทึกที่อยู่แล้ว");
  }

  async function handleChangePassword(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);

    // กฎชุดเดียวกับเซิร์ฟเวอร์ พร้อมข้อมูลตัวเองเพื่อกันการตั้งรหัสที่มีชื่อ/อีเมล/เบอร์ตัวเองอยู่ข้างใน
    const passwordIssue = passwordProblem(newPassword, [user?.email, user?.fullName, phone]);
    if (passwordIssue !== null) {
      setNotice({ tab: "security", ok: false, text: passwordIssue });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({
        tab: "security",
        ok: false,
        text: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน",
      });
      return;
    }
    if (newPassword === currentPassword) {
      setNotice({
        tab: "security",
        ok: false,
        text: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน",
      });
      return;
    }

    setSavingTab("security");
    try {
      await changePassword(currentPassword, newPassword);
      closePasswordForm();
      setPasswordChangedAt(new Date().toISOString());
      // เซิร์ฟเวอร์เลื่อน sessionVersion จริง (เครื่องนี้ได้ session ใหม่) จึงบอกได้ว่าเครื่องอื่นหลุดแล้ว
      setNotice({
        tab: "security",
        ok: true,
        text: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว อุปกรณ์อื่นที่เข้าสู่ระบบด้วยบัญชีนี้ถูกออกจากระบบแล้ว",
      });
    } catch (err) {
      setNotice({
        tab: "security",
        ok: false,
        text: err instanceof ApiError ? err.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ",
      });
    } finally {
      setSavingTab(null);
    }
  }

  async function handleDeleteAccount(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      navigate("/", { replace: true });
    } catch (err) {
      setNotice({
        tab: "delete",
        ok: false,
        text: err instanceof ApiError ? err.message : "ลบบัญชีไม่สำเร็จ",
      });
    } finally {
      setDeleting(false);
    }
  }

  const tabNotice = notice?.tab === tab ? notice : null;

  /** หมวดลบบัญชี — บอกผลก่อน · กดแล้วค่อยกางช่องรหัสผ่านยืนยัน */
  function renderDeleteTab() {
    return (
      <div className="flex flex-col gap-5">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
          <li>บัญชีของคุณจะถูกปิดใช้งาน</li>
          <li>ข้อมูลส่วนตัว (ชื่อ อีเมล เบอร์โทร ที่อยู่) จะถูกลบออก</li>
          <li>ประวัติคำขอและใบเสนอราคาจะยังถูกเก็บไว้ตามข้อกำหนดทางกฎหมาย</li>
          <li className="font-medium text-red-700">การลบบัญชีไม่สามารถย้อนกลับได้</li>
        </ul>

        {confirmingDelete ? (
          <form
            onSubmit={handleDeleteAccount}
            className="flex flex-col gap-4 rounded-lg border border-red-200 bg-red-50/50 p-4"
          >
            <label className={labelClass}>
              <span>กรอกรหัสผ่านเพื่อยืนยันการลบบัญชี</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
              />
            </label>

            {tabNotice && <NoticeText notice={tabNotice} />}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={deleting}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50 lg:min-h-10"
              >
                {deleting ? "กำลังลบ..." : "ยืนยันลบบัญชี"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                  setDeletePassword("");
                  setNotice(null);
                }}
                className="inline-flex min-h-11 items-center px-2 text-sm text-slate-600 hover:text-slate-800 lg:min-h-10"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="inline-flex min-h-11 items-center self-start rounded-lg border border-red-300 px-4 text-sm font-medium text-red-700 hover:bg-red-50 lg:min-h-10"
          >
            ลบบัญชีของฉัน
          </button>
        )}
      </div>
    );
  }

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 lg:py-12">
      <h1 className="text-2xl font-semibold text-slate-800">บัญชีของฉัน</h1>

      <div className="mt-6 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-10">
        {/* มือถือ: เมื่อเลือกหมวดแล้วซ่อนเมนู ให้เนื้อหาเต็มจอ (กลับด้วยลิงก์ด้านบนหรือปุ่มย้อนกลับ) */}
        <aside
          className={`${selectedTab ? "hidden lg:block" : "block"} lg:sticky lg:top-[calc(var(--nav-h)+1.5rem)]`}
        >
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:border-0 lg:bg-transparent lg:p-0">
            <Avatar name={user?.fullName} src={user?.avatarUrl} size={48} />
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">{user?.fullName}</p>
              <p className="truncate text-sm text-slate-500" title={user?.email ?? undefined}>
                {user?.email}
              </p>
            </div>
          </div>

          <nav
            aria-label="หมวดการตั้งค่าบัญชี"
            className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white lg:mt-6 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent"
          >
            <ul className="divide-y divide-slate-100 lg:flex lg:flex-col lg:gap-1 lg:divide-y-0">
              {TABS.map(({ id, label, hint, Icon, danger }) => {
                // จอกว้างที่ยังไม่เลือกหมวดเปิด "ข้อมูลส่วนตัว" อยู่ — ไฮไลต์เฉพาะจอกว้าง
                // ส่วนมือถือหน้านั้นคือรายการหมวด ยังไม่มีหมวดไหนถูกเลือก
                let selectedClass = "";
                if (selectedTab === id) {
                  selectedClass = danger ? "lg:bg-red-50" : "lg:bg-brand/[0.07] lg:text-brand";
                } else if (selectedTab === null && id === "profile") {
                  selectedClass = "lg:bg-brand/[0.07] lg:text-brand";
                }
                return (
                  <li key={id}>
                    <Link
                      to={{ search: `?tab=${id}` }}
                      state={{ fromTabList: true }}
                      aria-current={tab === id ? "page" : undefined}
                      className={`flex min-h-14 items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50 lg:min-h-10 lg:rounded-lg lg:px-3 lg:py-2 ${
                        danger ? "text-red-700" : "text-slate-700"
                      } ${selectedClass} ${tab === id ? "lg:font-medium" : ""}`}
                    >
                      <Icon className="h-[18px] w-[18px] flex-none" />
                      <span className="min-w-0 flex-1">
                        <span className="block">{label}</span>
                        <span className="block text-xs font-normal text-slate-500 lg:hidden">{hint}</span>
                      </span>
                      <ChevronRightIcon className="h-4 w-4 flex-none text-slate-400 lg:hidden" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <section
          aria-labelledby="account-section-title"
          className={`${selectedTab ? "block" : "hidden lg:block"} min-w-0`}
        >
          <Link
            to={{ search: "" }}
            onClick={(e) => {
              // มาจากรายการหมวดในหน้านี้ = ถอยประวัติแทนการดันหน้าใหม่ ไม่งั้นปุ่มย้อนกลับของเครื่อง
              // จะพากลับมาหมวดเดิมซ้ำ
              if ((location.state as { fromTabList?: boolean } | null)?.fromTabList) {
                e.preventDefault();
                navigate(-1);
              }
            }}
            replace
            className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-slate-600 hover:text-slate-800 lg:hidden"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            หมวดทั้งหมด
          </Link>

          <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-8">
            <header className="border-b border-slate-100 pb-5">
              <h2
                id="account-section-title"
                className={`text-lg font-semibold ${current.danger ? "text-red-700" : "text-slate-800"}`}
              >
                {current.label}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{SECTION_DESCRIPTION[tab]}</p>
            </header>

            <div className="max-w-xl pt-6">
              {tab === "profile" && (
                <div className="flex flex-col gap-6">
                  {user && <ProfilePhotoEditor user={user} onUser={replaceUser} />}

                  {profileLoading ? (
                    // ทรงเดียวกับแถวจริง (ชื่อ · อีเมล · เบอร์) — เดิมเป็นช่องกรอก + ปุ่มบันทึกที่หน้านี้ไม่มีแล้ว
                    <InfoRowsSkeleton rows={3} label="กำลังโหลดข้อมูลส่วนตัว" />
                  ) : (
                    <ul className="divide-y divide-slate-100 border-y border-slate-100">
                      <InfoRow
                        label="ชื่อ-นามสกุล"
                        value={user?.fullName}
                        hint="พิมพ์เป็นผู้ว่าจ้างบนใบเสนอราคาและสัญญา"
                        onEdit={() => openEdit("name")}
                      />
                      <InfoRow
                        label="อีเมล"
                        value={user?.email}
                        hint={
                          <>
                            ใช้เข้าสู่ระบบ หากต้องการเปลี่ยน{" "}
                            <Link to="/contact" className="text-brand underline underline-offset-2">
                              ติดต่อทีมงาน
                            </Link>
                          </>
                        }
                      />
                      <InfoRow
                        label="เบอร์โทรศัพท์"
                        value={saved?.phone}
                        empty="เพิ่มเบอร์โทรศัพท์"
                        onEdit={() => openEdit("phone")}
                      />
                    </ul>
                  )}
                  {tabNotice && <NoticeText notice={tabNotice} />}
                </div>
              )}

              {tab === "billing" &&
                (profileLoading ? (
                  <InfoRowsSkeleton rows={2} label="กำลังโหลดข้อมูลออกเอกสาร" />
                ) : (
                  <div className="flex flex-col gap-4">
                    <ul className="divide-y divide-slate-100 border-y border-slate-100">
                      <InfoRow
                        label="ผู้ว่าจ้างในเอกสาร"
                        value={saved ? partySummary(saved, user?.fullName) : null}
                        onEdit={() => openEdit("party")}
                      />
                      <InfoRow
                        label="ที่อยู่"
                        value={saved?.address}
                        empty="เพิ่มที่อยู่"
                        multiline
                        onEdit={() => openEdit("address")}
                      />
                    </ul>
                    {tabNotice && <NoticeText notice={tabNotice} />}
                  </div>
                ))}

              {editing === "name" && (
                <EditDialog
                  title="แก้ชื่อ-นามสกุล"
                  description="ใช้พิมพ์เป็นผู้ว่าจ้างบนใบเสนอราคาและสัญญา เมื่อผู้ว่าจ้างเป็นบุคคลธรรมดา"
                  error={dialogError}
                  saving={savingTab === "profile"}
                  onSubmit={saveName}
                  onClose={closeEdit}
                >
                  <input
                    aria-label="ชื่อ-นามสกุล"
                    maxLength={200}
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      setDialogError(null);
                    }}
                    className={inputClass}
                  />
                </EditDialog>
              )}

              {editing === "phone" && (
                <EditDialog
                  title="แก้เบอร์โทรศัพท์"
                  description="ทีมงานใช้เบอร์นี้ติดต่อกลับเรื่องใบเสนอราคาและงานก่อสร้าง"
                  error={dialogError}
                  saving={savingTab === "profile"}
                  onSubmit={savePhone}
                  onClose={closeEdit}
                >
                  <input
                    aria-label="เบอร์โทรศัพท์"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setDialogError(null);
                    }}
                    placeholder="เช่น 081-234-5678"
                    className={inputClass}
                  />
                </EditDialog>
              )}

              {editing === "party" && (
                <EditDialog
                  title="ผู้ว่าจ้างในเอกสาร"
                  description="ชื่อที่พิมพ์เป็นผู้ว่าจ้างบนใบเสนอราคา สัญญา และใบกำกับภาษี"
                  error={dialogError}
                  saving={savingTab === "billing"}
                  onSubmit={saveParty}
                  onClose={closeEdit}
                >
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                    {(
                      [
                        ["INDIVIDUAL", "ตัวฉันเอง (บุคคลธรรมดา)"],
                        ["COMPANY", "บริษัท / นิติบุคคล"],
                      ] as [CustomerType, string][]
                    ).map(([value, label]) => (
                      <label
                        key={value}
                        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md px-3 py-1 text-center text-sm leading-snug text-slate-600 hover:text-slate-800 has-[:checked]:bg-white has-[:checked]:font-medium has-[:checked]:text-brand has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 lg:min-h-9"
                      >
                        <input
                          type="radio"
                          name="customerType"
                          className="sr-only"
                          checked={customerType === value}
                          onChange={() => setCustomerType(value)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  {customerType === "INDIVIDUAL" ? (
                    <p className="text-sm text-slate-500">
                      เอกสารจะออกในนาม <span className="font-medium text-slate-700">{user?.fullName}</span>
                    </p>
                  ) : (
                    <>
                      <label className={labelClass}>
                        <span>ชื่อนิติบุคคล</span>
                        <input
                          value={companyName}
                          maxLength={200}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="ตามหนังสือรับรอง เช่น บริษัท ตัวอย่าง จำกัด"
                          className={inputClass}
                        />
                      </label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className={labelClass}>
                          <span>เลขประจำตัวผู้เสียภาษี</span>
                          <input
                            value={taxId}
                            inputMode="numeric"
                            maxLength={13}
                            onChange={(e) => setTaxId(e.target.value.replace(/\D/g, ""))}
                            placeholder="13 หลัก"
                            className={inputClass}
                          />
                        </label>
                        <label className={labelClass}>
                          <span>สำนักงาน / สาขา</span>
                          <input
                            value={branch}
                            maxLength={100}
                            onChange={(e) => setBranch(e.target.value)}
                            placeholder="เช่น สำนักงานใหญ่"
                            className={inputClass}
                          />
                        </label>
                      </div>
                      <label className={labelClass}>
                        <span>ผู้ประสานงาน</span>
                        <input
                          value={contactPerson}
                          maxLength={200}
                          onChange={(e) => setContactPerson(e.target.value)}
                          placeholder={user?.fullName ?? ""}
                          className={inputClass}
                        />
                        <span className="text-xs font-normal text-slate-500">เว้นว่างไว้จะใช้ชื่อบัญชีของคุณ</span>
                      </label>
                    </>
                  )}
                </EditDialog>
              )}

              {editing === "address" && (
                <EditDialog
                  title="แก้ที่อยู่"
                  description="พิมพ์เป็นที่อยู่ผู้ว่าจ้างบนใบเสนอราคาและสัญญา · เว้นว่าง = ไม่พิมพ์ที่อยู่"
                  error={dialogError}
                  saving={savingTab === "billing"}
                  onSubmit={saveAddress}
                  onClose={closeEdit}
                >
                  <textarea
                    aria-label="ที่อยู่"
                    rows={4}
                    value={address}
                    maxLength={1000}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
                    className={inputClass}
                  />
                </EditDialog>
              )}

              {tab === "security" &&
                (editingPassword ? (
                  <form onSubmit={handleChangePassword} className="flex flex-col gap-5">
                    {/* ให้โปรแกรมจำรหัสผ่านรู้ว่ารหัสใหม่เป็นของบัญชีไหน (ไม่งั้นบันทึกเป็นรายการไร้ชื่อ) */}
                    <input
                      type="email"
                      name="username"
                      autoComplete="username"
                      value={user?.email ?? ""}
                      readOnly
                      hidden
                    />

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <label htmlFor="current-password" className="text-sm font-medium text-slate-700">
                          รหัสผ่านปัจจุบัน
                        </label>
                        <Link
                          to="/forgot-password"
                          className="link-pill -my-1 -mr-2.5 text-xs font-medium text-brand"
                        >
                          จำรหัสผ่านปัจจุบันไม่ได้?
                        </Link>
                      </div>
                      <PasswordInput
                        id="current-password"
                        required
                        autoFocus
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="new-password" className="text-sm font-medium text-slate-700">
                        รหัสผ่านใหม่
                      </label>
                      <PasswordInput
                        id="new-password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        placeholder={PASSWORD_HINT}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        onFocus={() => setNewPasswordFocused(true)}
                        {...capsProps}
                      />
                      <CapsLockHint on={capsOn} />
                      <ThaiKeyboardHint value={newPassword} />
                      <PasswordStrengthBar
                        value={newPassword}
                        personal={[user?.email, user?.fullName, phone]}
                      />
                      <PasswordRules
                        value={newPassword}
                        personal={[user?.email, user?.fullName, phone]}
                        show={newPasswordFocused}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="confirm-password" className="text-sm font-medium text-slate-700">
                        ยืนยันรหัสผ่านใหม่
                      </label>
                      <PasswordInput
                        id="confirm-password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                      <PasswordMatchHint password={newPassword} confirm={confirmPassword} />
                    </div>

                    <p className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
                      <LockIcon className="mt-px h-4 w-4 flex-none text-slate-400" />
                      เมื่อเปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นที่เข้าสู่ระบบด้วยบัญชีนี้อยู่จะถูกออกจากระบบ
                      ส่วนเครื่องนี้ใช้งานต่อได้ตามปกติ
                    </p>

                    <FormFooter notice={tabNotice}>
                      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={() => {
                            setNotice(null);
                            closePasswordForm();
                          }}
                          className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-800 lg:min-h-10"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="submit"
                          disabled={
                            savingTab === "security" ||
                            currentPassword === "" ||
                            passwordProblem(newPassword, [user?.email, user?.fullName, phone]) !== null ||
                            confirmPassword !== newPassword
                          }
                          className={primaryButtonClass}
                        >
                          {savingTab === "security" ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
                        </button>
                      </div>
                    </FormFooter>
                  </form>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="grid items-center gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-6">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden
                          className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-slate-100 text-slate-500"
                        >
                          <LockIcon className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">รหัสผ่าน</p>
                          {/* วันเปลี่ยนรหัสมากับข้อมูลโปรไฟล์ — ระหว่างรอจองบรรทัดไว้ ไม่ให้โผล่มาดันการ์ด */}
                          {profileLoading && <Skeleton className="mt-1.5 h-3.5 w-36" />}
                          {passwordChangedAt && (
                            <p className="text-sm text-slate-500">
                              เปลี่ยนล่าสุด{" "}
                              <time dateTime={passwordChangedAt} title={fullThaiDate(passwordChangedAt)}>
                                {passwordAge(passwordChangedAt)}
                              </time>
                            </p>
                          )}
                        </div>
                      </div>
                      <span aria-hidden className="hidden text-lg tracking-[0.2em] text-slate-400 sm:block">
                        ••••••••
                      </span>
                      <button
                        ref={changePasswordButtonRef}
                        type="button"
                        onClick={() => {
                          setNotice(null);
                          setEditingPassword(true);
                        }}
                        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 lg:min-h-10"
                      >
                        เปลี่ยนรหัสผ่าน
                      </button>
                    </div>
                    {tabNotice && <NoticeText notice={tabNotice} />}
                  </div>
                ))}

              {tab === "delete" && renderDeleteTab()}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

const SECTION_DESCRIPTION: Record<Tab, string> = {
  profile: "รูป ชื่อ และช่องทางที่ทีมงานใช้ติดต่อกลับเรื่องงานของคุณ",
  billing: 'ชื่อและที่อยู่ตรงนี้จะถูกใช้พิมพ์เป็น "ผู้ว่าจ้าง" บนใบเสนอราคาและสัญญาของคุณ',
  security: "จัดการรหัสผ่านที่ใช้เข้าสู่ระบบบัญชีนี้",
  delete: "ปิดบัญชีและลบข้อมูลส่วนตัวของคุณออกจากระบบ",
};

type EditKind = "name" | "phone" | "party" | "address";

/**
 * แถวข้อมูลอ่านอย่างเดียว — มี onEdit = ทั้งแถวเป็นปุ่ม (ลูกศรท้ายแถว) กดแล้วเปิดหน้าต่างแก้
 * ไม่มี onEdit = แถวล็อก (เช่น อีเมลที่ใช้เข้าสู่ระบบ) · ค่าว่างแสดงเป็นลิงก์ "เพิ่ม…" ชวนกรอก
 */
function InfoRow({
  label,
  value,
  empty = "—",
  hint,
  multiline = false,
  onEdit,
}: Readonly<{
  label: string;
  value: string | null | undefined;
  empty?: string;
  hint?: ReactNode;
  multiline?: boolean;
  onEdit?: () => void;
}>) {
  const text = value?.trim();
  const body = (
    <>
      <span className="w-full shrink-0 text-sm text-slate-500 sm:w-36">{label}</span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-sm ${valueTone(Boolean(text), Boolean(onEdit))} ${
            multiline ? "line-clamp-3 whitespace-pre-line" : "truncate"
          }`}
        >
          {text || empty}
        </span>
        {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      </span>
    </>
  );
  if (!onEdit) {
    return (
      <li className="flex flex-wrap items-start gap-x-4 gap-y-1 px-1 py-3.5 sm:flex-nowrap">
        {body}
        <LockIcon className="mt-0.5 h-4 w-4 flex-none text-slate-300" />
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        className="group flex min-h-14 w-full flex-wrap items-start gap-x-4 gap-y-1 px-1 py-3.5 text-left transition-colors hover:bg-slate-50 sm:flex-nowrap"
      >
        {body}
        <ChevronRightIcon className="mt-0.5 h-4 w-4 flex-none text-slate-300 group-hover:text-slate-500" />
      </button>
    </li>
  );
}

/** "ตัวฉันเอง — ชื่อ" หรือ "บริษัท … · เลขภาษี … · สาขา" — สรุปในแถวเดียวว่าเอกสารจะออกในนามใคร */
function partySummary(profile: CustomerProfileDto, fullName: string | undefined): string {
  if (profile.customerType !== "COMPANY") return `ตัวฉันเอง (บุคคลธรรมดา) — ${fullName ?? ""}`.trim();
  const parts = [profile.companyName || "บริษัท (ยังไม่ได้ใส่ชื่อ)"];
  if (profile.taxId) parts.push(`เลขภาษี ${profile.taxId}`);
  if (profile.branch) parts.push(profile.branch);
  return parts.join(" · ");
}

type Notice = { ok: boolean; text: string };

function NoticeText({ notice }: Readonly<{ notice: Notice }>) {
  return notice.ok ? (
    <output className="text-sm text-emerald-700 block">
      {notice.text}
    </output>
  ) : (
    <p role="alert" className="text-sm text-red-600">
      {notice.text}
    </p>
  );
}

/** แถบท้ายฟอร์ม: ผลการบันทึกด้านซ้าย ปุ่มด้านขวา (มือถือเรียงลงมา ปุ่มเต็มแถว) */
function FormFooter({ notice, children }: Readonly<{ notice: Notice | null; children: ReactNode }>) {
  return (
    <div className="mt-1 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-h-5">{notice && <NoticeText notice={notice} />}</div>
      <div className="flex flex-col sm:flex-row">{children}</div>
    </div>
  );
}

/** ช่องรหัสผ่านพร้อมปุ่มตาเปิด/ปิดของตัวเอง (แต่ละช่องเปิดดูแยกกันได้) */
function PasswordInput(props: Readonly<Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${inputClass} pr-12`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
        aria-pressed={visible}
        title={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
        className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-slate-400 hover:text-slate-600"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function fullThaiDate(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** อายุรหัสผ่านแบบคร่าว ๆ ("3 เดือนที่แล้ว") — วันที่เต็มอยู่ใน title ของ <time> */
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

/** สีค่าของแถว: มีค่า = เข้ม · ว่างแต่กดแก้ได้ = สีแบรนด์ (ชวนกรอก) · ว่างแก้ไม่ได้ = เทา */
function valueTone(hasValue: boolean, editable: boolean) {
  if (hasValue) return "text-slate-800";
  return editable ? "text-brand" : "text-slate-400";
}
