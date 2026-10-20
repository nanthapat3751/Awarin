import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { useAuth } from "../lib/auth-context";
import { useHeroLoading } from "../lib/hero-loading";
import { Avatar } from "./Avatar";
import { NotificationBell } from "./NotificationBell";

const COMPANY_NAME = "Awarin Engineering Co., Ltd.";

const PUBLIC_LINKS = [
  { to: "/", label: "หน้าแรก", end: true },
  { to: "/about", label: "เกี่ยวกับเรา" },
  { to: "/services", label: "บริการ" },
  { to: "/house-designs", label: "แบบบ้าน" },
  { to: "/portfolio", label: "ผลงาน" },
  { to: "/contact", label: "ติดต่อเรา" },
];

// เมนูของลูกค้าที่เข้าระบบ — จอใหญ่อยู่ในเมนูพับ "พื้นที่ลูกค้า ▾" (CustomerMenu) · ลิ้นชักมือถือเรียงเป็นแถวตามเดิม
// เดิมวาง 4 ลิงก์นี้ต่อท้ายเมนูหลักตรง ๆ แถบยาวจนต้องย่อชื่อ (คำขอ/ใบเสนอราคา/…) ที่จอ 1024–1279
const CUSTOMER_LINKS = [
  { to: "/my/requests", label: "คำขอของฉัน" },
  { to: "/my/quotes", label: "ใบเสนอราคาของฉัน" },
  { to: "/my/contracts", label: "สัญญาของฉัน" },
  { to: "/my/payments", label: "การชำระเงิน" },
];

function ChevronDownIcon({ open }: Readonly<{ open: boolean }>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** หน่วงปิดตอนเมาส์ออก — เลื่อนเมาส์จากปุ่มลงไปที่รายการแล้วเฉียดออกนิดเดียว เมนูจะได้ไม่หุบใส่ */
const CLOSE_DELAY_MS = 180;

/**
 * กลไกเมนูพับในแถบเมนู (ใช้ร่วมกันทั้ง "พื้นที่ลูกค้า ▾" ตอนเข้าระบบแล้ว และตอนยังไม่เข้าระบบ)
 * เปิดได้ทั้งชี้เมาส์ (จอที่มีเมาส์) และกด/แตะ/Enter · ปิดเมื่อ Esc (โฟกัสกลับปุ่ม) · คลิกนอกเมนู · เปลี่ยนหน้า
 */
function useNavPopover() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  // อุปกรณ์ของการกดครั้งล่าสุด — เมาส์ชี้แล้วเมนูกางไปแล้ว คลิกซ้ำต้อง "คงเปิด" ไม่ใช่สลับปิด
  // (เดิมคลิกด้วยเมาส์ = ชี้เปิด + คลิกปิด เมนูหุบทันทีที่กด) · นิ้ว/คีย์บอร์ดยังกดสลับเปิด-ปิดตามปกติ
  const pressedWith = useRef<string>("");

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const openNow = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  return {
    open,
    location,
    buttonProps: {
      ref: buttonRef,
      onPointerDown: (e: ReactPointerEvent) => {
        pressedWith.current = e.pointerType;
      },
      onClick: () => {
        const mouse = pressedWith.current === "mouse";
        pressedWith.current = "";
        if (mouse || !open) openNow();
        else setOpen(false);
      },
    },
    wrapProps: {
      ref: wrapRef,
      // ชี้เมาส์เปิดเฉพาะเมาส์จริง — นิ้วแตะยิง pointerenter ด้วย ถ้าไม่กรอง แตะครั้งเดียวจะเปิดแล้วปิดทันที (enter + click)
      onPointerEnter: (e: ReactPointerEvent) => {
        if (e.pointerType === "mouse") openNow();
      },
      onPointerLeave: (e: ReactPointerEvent) => {
        if (e.pointerType === "mouse") closeSoon();
      },
    },
  };
}

/**
 * เมนูพับ "พื้นที่ลูกค้า ▾" (ผู้ใช้เลือกแบบ B 13 ต.ค. 2026 + รายการแนวตั้งแคบ ๆ ไม่ให้บังจอ)
 * ไม่ใช้ role="menu" — รายการเป็นลิงก์ธรรมดา ไล่ด้วย Tab ได้ตามปกติ (role menu บังคับให้ทำลูกศรขึ้นลงเอง)
 */
function CustomerMenu({
  linkClass,
}: Readonly<{ linkClass: (state: { isActive: boolean }) => string }>) {
  const { open, location, buttonProps, wrapProps } = useNavPopover();
  // อยู่ในหน้าใดหน้าหนึ่งของลูกค้า = ปุ่มขีดเส้นใต้แบบเมนูที่เปิดอยู่
  const inPortal = [...CUSTOMER_LINKS.map((l) => l.to), "/my/account"].some((to) =>
    location.pathname.startsWith(to),
  );

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    `block whitespace-nowrap rounded-lg px-3 py-2.5 text-sm transition-colors ${
      isActive ? "bg-slate-50 font-medium text-brand" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
    }`;

  return (
    <div {...wrapProps} className="relative">
      <button
        {...buttonProps}
        type="button"
        aria-expanded={open}
        aria-controls="customer-menu"
        className={`${linkClass({ isActive: inPortal })} inline-flex items-center gap-1`}
      >
        พื้นที่ลูกค้า
        <ChevronDownIcon open={open} />
      </button>
      {open && (
        // pt-3 แทน mt-3 — ช่องว่างระหว่างปุ่มกับรายการยังนับเป็นตัวเมนู เลื่อนเมาส์ผ่านแล้วไม่หลุด
        // [text-shadow:none] — แถบเมนูโหมดโปร่งทับ hero ใส่เงาตัวอักษรไว้ทั้งแถบ ในการ์ดขาวไม่ต้องการ
        <div className="absolute left-1/2 top-full z-40 -translate-x-1/2 pt-3 [text-shadow:none]">
          <nav
            id="customer-menu"
            aria-label="พื้นที่ลูกค้า"
            className="nav-menu-pop w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
          >
            {CUSTOMER_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} className={itemClass}>
                {link.label}
              </NavLink>
            ))}
            <div className="my-1.5 border-t border-slate-100" />
            <NavLink to="/my/account" className={itemClass}>
              บัญชีของฉัน
            </NavLink>
          </nav>
        </div>
      )}
    </div>
  );
}

/**
 * เมนูรูปโปรไฟล์ (แบบ C — ผู้ใช้เลือก 17 ต.ค. แบบ Google/YouTube) ชื่อ อีเมล บัญชีของฉัน ออกจากระบบ
 * แทนชื่อ + ปุ่มออกจากระบบที่เคยวางเรียงบนแถบ ให้เมนูหลักขยับไปชิดขวาได้ · กลไกเปิด/ปิดชุดเดียวกับ "พื้นที่ลูกค้า ▾"
 */
function AccountMenu({
  name,
  email,
  avatarUrl,
  ringClass,
  onLogout,
}: Readonly<{
  name: string;
  email: string | null;
  avatarUrl: string | null;
  ringClass: string;
  onLogout: () => void;
}>) {
  const { open, location, buttonProps, wrapProps } = useNavPopover();
  const inAccount = location.pathname.startsWith("/my/account");
  const itemClass =
    "flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900";

  return (
    <div {...wrapProps} className="relative">
      <button
        {...buttonProps}
        type="button"
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={`บัญชีของฉัน (${name})`}
        // วงรอบรูป = กำลังเปิดเมนู/อยู่ในหน้าบัญชี · ชี้เมาส์ = วงจาง
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 ring-offset-transparent transition-shadow ${ringClass} ${
          open || inAccount ? "ring-2" : "hover:ring-2"
        }`}
      >
        <Avatar name={name} src={avatarUrl} size={32} />
      </button>
      {open && (
        // ชิดขวาของปุ่ม — ปุ่มอยู่ขอบขวาสุดของแถบ จัดกึ่งกลางจะล้นจอ
        <div className="absolute right-0 top-full z-40 pt-3 [text-shadow:none]">
          <div
            id="account-menu"
            role="region"
            aria-label="บัญชีของฉัน"
            className="nav-menu-pop w-64 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-lg"
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Avatar name={name} src={avatarUrl} size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{name}</p>
                {email && <p className="truncate text-xs text-slate-500">{email}</p>}
              </div>
            </div>
            <div className="my-1.5 border-t border-slate-100" />
            <NavLink to="/my/account" className={itemClass}>
              <UserCircleIcon />
              บัญชีของฉัน
            </NavLink>
            <button type="button" onClick={onLogout} className={itemClass}>
              <LogoutIcon />
              ออกจากระบบ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** สิ่งที่บัญชีลูกค้าใช้ทำได้จริง — กล่องอธิบายของคนที่ยังไม่เข้าระบบ + ลิ้นชักมือถือ */
const GUEST_BENEFITS = [
  "ใบเสนอราคาแยกทุกรายการ อนุมัติหรือขอแก้ได้ออนไลน์",
  "สัญญา งวดเงิน และใบเสร็จ",
  "สถานะคำขอและการแจ้งเตือน",
];

/**
 * ปุ่ม "พื้นที่ลูกค้า ▾" ของคนที่ยังไม่เข้าระบบ (ผู้ใช้เลือกแบบ A 14 ต.ค. 2026 — แทนปุ่ม "เข้าสู่ระบบ" ที่ไม่บอกว่าเข้าไปได้อะไร)
 * ชื่อเดียวกับเมนูหลังเข้าระบบ · กางกล่องอธิบายว่าเข้าไปทำอะไรได้ + ปุ่มเข้าสู่ระบบ + ทางของคนที่ยังไม่มีบัญชี
 * (ปกติบัญชีเกิดจากบริษัทส่งลิงก์ให้หลังส่งคำขอ — สมัครเองได้แต่เป็นทางรอง)
 */
function GuestMenu({ buttonClass }: Readonly<{ buttonClass: string }>) {
  const { open, buttonProps, wrapProps } = useNavPopover();
  return (
    <div {...wrapProps} className="relative">
      <button
        {...buttonProps}
        type="button"
        aria-expanded={open}
        aria-controls="guest-menu"
        className={`${buttonClass} inline-flex items-center gap-1`}
      >
        พื้นที่ลูกค้า
        <ChevronDownIcon open={open} />
      </button>
      {open && (
        // ชิดขวาของปุ่ม — ปุ่มอยู่ขอบขวาสุดของแถบ ถ้าจัดกึ่งกลางกล่องจะล้นออกนอกจอ
        <div className="absolute right-0 top-full z-40 pt-3 [text-shadow:none]">
          <div
            id="guest-menu"
            role="region"
            aria-label="พื้นที่ลูกค้า"
            className="nav-menu-pop w-80 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-xl"
          >
            <p className="font-semibold text-slate-900">พื้นที่ลูกค้า</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              สำหรับลูกค้าที่มีโครงการกับเรา ดูทุกอย่างได้ในที่เดียว
            </p>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm text-slate-700">
              {GUEST_BENEFITS.map((b) => (
                <li key={b} className="flex gap-2">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                  {b}
                </li>
              ))}
            </ul>
            <Link
              to="/login"
              className="mt-4 flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
            >
              เข้าสู่ระบบ
            </Link>
            <p className="mt-3 text-center text-xs leading-relaxed text-slate-500">
              ยังไม่มีบัญชี?{" "}
              <Link to="/contact" className="font-medium text-brand hover:underline">
                ส่งคำขอใบเสนอราคา
              </Link>{" "}
              แล้วเราจะส่งลิงก์ให้ หรือ{" "}
              <Link to="/register" className="font-medium text-brand hover:underline">
                สมัครเอง
              </Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// แถวเมนูในลิ้นชัก: สูง 48px ตามเกณฑ์ปุ่มกดด้วยนิ้ว (Apple 44px / Google 48dp)
// พื้นของแถวที่อยู่ไม่ได้อยู่ที่ตัวแถว แต่เป็นเม็ดยาก้อนเดียวที่เลื่อนไปมา (ดู DrawerHighlight)
// จึงต้อง relative ให้ตัวอักษรลอยเหนือเม็ดยา — ถ้าไม่ใส่ เม็ดยา (absolute) จะทับตัวอักษรมิด
const drawerLinkClass = ({ isActive }: { isActive: boolean }): string =>
  "relative flex min-h-12 items-center justify-between gap-3 rounded-xl px-4 py-3 text-base transition-colors " +
  (isActive ? "font-semibold text-brand" : "text-slate-600 hover:text-slate-900");

interface HighlightPos {
  top: number;
  height: number;
}

/** แถวเมนูในลิ้นชัก — แถวที่อยู่ได้จุดเล็ก ๆ ชิดขวา ไม่ต้องพึ่งสีพื้นอย่างเดียว */
function DrawerLink({
  to,
  label,
  end,
  onPoint,
}: Readonly<{
  to: string;
  label: string;
  end?: boolean;
  /** ชี้/โฟกัสแถวไหน ให้เม็ดยาเลื่อนไปที่แถวนั้น (โฟกัสด้วยเพื่อให้คนใช้คีย์บอร์ดเห็นเหมือนกัน) */
  onPoint: (el: HTMLElement) => void;
}>) {
  const point = (e: { currentTarget: HTMLElement }) => onPoint(e.currentTarget);
  return (
    <NavLink to={to} end={end} className={drawerLinkClass} onMouseEnter={point} onFocus={point}>
      {({ isActive }) => (
        <>
          <span>{label}</span>
          {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />}
        </>
      )}
    </NavLink>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function UserCircleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] text-slate-500"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
    </svg>
  );
}

/** ประตู + ลูกศรออก (แบบที่ผู้ใช้ส่งรูปมา 16 ต.ค.) */
function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] text-slate-500"
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** คลาสของแถบเมนูตามโหมด: กระจกโปร่งใสทับ hero (บนสุดของหน้าที่มี hero) หรือพื้นขาวทึบ */
function navTheme(transparent: boolean) {
  if (transparent) {
    return {
      header: "bg-white/20 backdrop-blur-md border-b border-white/20",
      linkActive: "border-white text-white font-medium",
      linkIdle: "border-transparent text-white/85 hover:border-white hover:text-white",
      avatarRing: "ring-white/70",
    // ปุ่มเข้าสู่ระบบสำหรับผู้ที่ยังไม่ล็อกอิน: ทำเป็นปุ่มมีกรอบเพื่อให้เด่นเป็น "ทางเข้าพื้นที่ลูกค้า"
    // ที่ชัดเจน แทนลิงก์ตัวหนังสือลอย ๆ (ปรับตามโหมดโปร่งใส/ทึบของแถบเมนู)
    //
    // โหมดโปร่งใส = กระจกฝ้าเข้ม: พื้นเข้มโปร่ง 40% + เบลอเฉพาะหลังปุ่ม ยังเห็นรูป hero ทะลุลาง ๆ
    // แต่ตัวอักษรมีพื้นรองแน่นอน — เดิมปุ่มไม่มีพื้นเลย ตัวอักษรขาวทับรูปวัดได้แค่ 3.06:1 (ต่ำกว่า
    // เกณฑ์ 4.5:1) และกรอบจางถึง 2.29:1 จนแทบไม่รู้ว่าเป็นปุ่ม ห้ามถอดพื้นออกกลับไปเป็นกรอบเปล่า
    // [text-shadow:none] จำเป็น เพราะปุ่มอยู่ในกล่องที่ใส่ navShadow ไว้ — พอมีพื้นรองแล้วเงาใต้
    // ตัวอักษรจะเหลือแค่ทำให้ตัวหนังสือดูเลอะ
    //
    // ความทึบ 40% ผูกกับรูป hero ปัจจุบัน: วัดตรงตำแหน่งปุ่มได้ 5.08:1 และจุดสว่างสุดของรูปทั้งแถบบน
    // ได้ 4.7:1 (เฉียดเกณฑ์ 4.5:1) — ถ้าเปลี่ยนรูป hero เป็นภาพที่สว่างกว่านี้ เช่นบ้านตัดกับท้องฟ้าขาว
    // ต้องเพิ่มความทึบเป็น 60% ไม่งั้นจะตกเกณฑ์ทันที (คำนวณที่ภาพสว่าง rgb(235) แล้ว 40% ได้แค่ 2.96:1)
      loginBtn:
        "border-white/60 bg-slate-900/40 text-white backdrop-blur-sm [text-shadow:none] hover:border-white hover:bg-slate-900/60",
    // บน hero ที่สว่าง ตัวอักษร nav สีขาวจะจางกลืนไป; เงาตกกระทบนุ่ม ๆ ช่วยดันให้เด่นออกจากรูป
    // ใช้เฉพาะโหมดโปร่งใส — บนแถบขาวทึบตัวอักษรเป็นสีเข้มอยู่แล้วจึงไม่ต้องใช้
      navShadow: "[text-shadow:0_1px_6px_rgba(0,0,0,0.6)]",
      logoText: "text-white",
      logoSrc: "/logo-white-removed.png",
      menuText: "text-white/85",
      burgerText: "text-white",
    };
  }
  return {
    header: "bg-white border-b border-slate-200",
    linkActive: "border-brand text-brand font-medium",
    linkIdle: "border-transparent hover:border-brand hover:text-brand",
    avatarRing: "ring-brand/40",
    loginBtn: "border-brand text-brand hover:bg-brand hover:text-white",
    navShadow: "",
    logoText: "text-slate-800",
    logoSrc: "/logo.png",
    menuText: "text-slate-600",
    burgerText: "text-slate-700",
  };
}

export function NavBar({ overlayHero = false }: Readonly<{ overlayHero?: boolean }>) {
  const { user, status, logout } = useAuth();
  const location = useLocation();
  const [logoError, setLogoError] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // บอกความสูงจริงของแถบให้ทั้งแอปรู้ (`--nav-h`) — แถบเป็น fixed จึงไม่กินที่ในหน้า
  // ถ้าใครไปเดาค่าเป็นตัวเลขตายตัว เนื้อหาจะถูกบังทันทีที่ความสูงแถบเปลี่ยน (เคยบังอยู่ 16px)
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--nav-h", `${h}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // เปลี่ยนหน้า = ปิดเมนูเสมอ (ไม่งั้นกดลิงก์แล้วเมนูค้างทับหน้าใหม่)
  useEffect(() => setMenuOpen(false), [location.pathname]);

  // ระหว่างเปิดเมนู: ล็อกไม่ให้หน้าด้านหลังเลื่อน + Esc ปิด + โฟกัสไปที่ปุ่มปิด
  useEffect(() => {
    if (!menuOpen) return;
    const burger = burgerRef.current; // เก็บไว้ตั้งแต่ต้น — ตอน cleanup ref อาจเปลี่ยนแล้ว
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      // กักโฟกัสไว้ในลิ้นชัก: ไม่งั้นกด Tab แล้วโฟกัสหลุดไปโดนลิงก์ที่อยู่หลังฉากมืด
      // (มองไม่เห็นว่าตอนนี้อยู่ตรงไหน) — ปัญหาคลาสสิกของ dialog ที่ไม่ trap focus
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items.at(-1) ?? first;
      const active = document.activeElement;
      if (!panel.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      burger?.focus(); // คืนโฟกัสให้ปุ่มที่เปิดเมนู
    };
  }, [menuOpen]);

  // เป็นกระจกโปร่งใสทับ hero เฉพาะตอนอยู่บนสุดของหน้าที่มี hero; นอกนั้นเป็นพื้นทึบ
  // ระหว่างรอรูป hero พื้นยังขาวอยู่ → ใช้แถบขาวทึบก่อน ไม่งั้นตัวอักษรขาวของโหมดกระจกกลืนหาย
  const heroLoading = useHeroLoading();
  const transparent = overlayHero && !scrolled && !heroLoading;

  const theme = navTheme(transparent);
  const headerClass = `fixed top-0 inset-x-0 z-30 transition-colors ${theme.header}`;

  // เส้นใต้บอกตำแหน่ง: แสดงตอน hover และคงอยู่บนหน้าปัจจุบัน สีเปลี่ยนตามโหมด
  const linkClass = ({ isActive }: { isActive: boolean }): string =>
    `whitespace-nowrap pb-1 border-b-2 transition-colors ${isActive ? theme.linkActive : theme.linkIdle}`;

  const loginBtnClass = `whitespace-nowrap rounded-lg border px-4 py-1.5 font-medium transition-colors ${theme.loginBtn}`;
  const navShadow = theme.navShadow;

  const loggedIn = status === "ready" && Boolean(user);

  // เม็ดยาไฮไลต์ในลิ้นชักเป็นก้อนเดียวที่เลื่อนตามเมาส์ ไม่ใช่พื้นหลังของแต่ละแถว
  // ปกติจอดอยู่ที่แถวของหน้าปัจจุบัน ชี้แถวไหนก็ไหลไปแถวนั้น เอาเมาส์ออกแล้วไหลกลับ
  const [activePos, setActivePos] = useState<HighlightPos | null>(null);
  const [hoverPos, setHoverPos] = useState<HighlightPos | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const pointAt = (el: HTMLElement) => setHoverPos({ top: el.offsetTop, height: el.offsetHeight });

  // ต้องวัดหลัง DOM ขึ้นจริง (ลิ้นชักถูก mount ตอนเปิดเท่านั้น) และวัดใหม่เมื่อเปลี่ยนหน้า/สถานะล็อกอิน
  useLayoutEffect(() => {
    if (!menuOpen) {
      setHoverPos(null);
      return;
    }
    const el = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    setActivePos(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
  }, [menuOpen, location.pathname, loggedIn]);

  const highlight = hoverPos ?? activePos;

  return (
    <>
      <header ref={headerRef} className={headerClass}>
        <nav className="max-w-7xl mx-auto flex items-center gap-4 px-4 py-3 sm:px-6">
          {/* logo - left (ย่อลงบนมือถือ ไม่งั้นกินความกว้างไปเกือบครึ่งจอ) */}
          <Link to="/" className="flex min-h-11 shrink-0 items-center" aria-label={COMPANY_NAME}>
            {logoError ? (
              <span className={`font-semibold ${theme.logoText}`}>
                {COMPANY_NAME}
              </span>
            ) : (
              <img
                src={theme.logoSrc}
                alt={COMPANY_NAME}
                className="h-10 w-auto lg:h-16"
                onError={() => setLogoError(true)}
              />
            )}
          </Link>

          {/* menu - ชิดขวาติดกลุ่มบัญชี (แบบ C 17 ต.ค. — เดิมกึ่งกลาง) · ลูกค้าที่เข้าระบบได้เมนูพับ "พื้นที่ลูกค้า ▾" ต่อท้าย */}
          <div
            className={`hidden flex-1 items-center justify-end lg:flex lg:pr-3 ${loggedIn ? "gap-6 xl:gap-8" : "gap-6 xl:gap-10"} text-sm ${theme.menuText} ${navShadow}`}
          >
            {PUBLIC_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={linkClass}>
                {link.label}
              </NavLink>
            ))}
            {loggedIn && <CustomerMenu linkClass={linkClass} />}
          </div>

          {/* account actions - far right */}
          <div
            className={`hidden items-center gap-3 text-sm shrink-0 lg:flex ${theme.menuText} ${navShadow}`}
          >
            {loggedIn ? (
              <>
                <NotificationBell />
                <AccountMenu
                  name={user?.fullName ?? ""}
                  email={user?.email ?? null}
                  avatarUrl={user?.avatarUrl ?? null}
                  ringClass={theme.avatarRing}
                  onLogout={() => logout()}
                />
              </>
            ) : (
              <GuestMenu buttonClass={loginBtnClass} />
            )}
          </div>

          {/* มือถือ/แท็บเล็ต: กระดิ่ง + ปุ่มเปิดลิ้นชักเมนู */}
          <div className={`ml-auto flex items-center gap-1 lg:hidden ${theme.burgerText}`}>
            {loggedIn && <NotificationBell />}
            <button
              ref={burgerRef}
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="เปิดเมนู"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors hover:bg-black/5"
            >
              <MenuIcon />
            </button>
          </div>
        </nav>
      </header>

      {menuOpen && (
        // <dialog open> แบบไม่ใช้ showModal(): โฟกัส/Esc/ล็อกการเลื่อนจัดการเองอยู่แล้วด้านบน
        // ล้างสไตล์ตั้งต้นของ dialog (กรอบ · ระยะขอบ · พื้นขาว · ความกว้างสูงสุด) ให้กินเต็มจอเหมือนเดิม
        <dialog
          open
          aria-modal="true"
          aria-label="เมนู"
          className="fixed inset-0 z-40 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 lg:hidden"
        >
          <button
            type="button"
            aria-label="ปิดเมนู"
            onClick={() => setMenuOpen(false)}
            // เบลอ + มืดขึ้นเป็น 65% เพื่อให้แถบหน้าเดิมที่โผล่ทางซ้ายอ่านไม่ออก จะได้ไม่แย่งสายตา
            // แต่ยังเห็นเป็นเงา ๆ ว่าเมนูซ้อนอยู่บนหน้าเดิม และยังแตะข้างนอกเพื่อปิดได้เหมือนเดิม
            className="nav-drawer-backdrop absolute inset-0 h-full w-full cursor-default bg-slate-900/65 backdrop-blur-sm"
          />
          <div
            ref={panelRef}
            id="mobile-menu"
            className="nav-drawer-panel absolute inset-y-0 right-0 flex w-[82%] max-w-sm flex-col bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              {logoError ? (
                <span className="text-sm font-semibold text-slate-800">{COMPANY_NAME}</span>
              ) : (
                <img
                  src="/logo.png"
                  alt={COMPANY_NAME}
                  className="h-10 w-auto"
                  onError={() => setLogoError(true)}
                />
              )}
              <button
                ref={closeRef}
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="ปิดเมนู"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100"
              >
                <CloseIcon />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-2">
              <div ref={listRef} className="relative space-y-0.5" onMouseLeave={() => setHoverPos(null)}>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 rounded-xl bg-slate-100 transition-[transform,height,opacity] duration-200 ease-out motion-reduce:transition-none"
                  style={{
                    transform: `translateY(${highlight?.top ?? 0}px)`,
                    height: highlight?.height ?? 0,
                    opacity: highlight ? 1 : 0,
                  }}
                />
                {PUBLIC_LINKS.map((link) => (
                  <DrawerLink key={link.to} to={link.to} end={link.end} label={link.label} onPoint={pointAt} />
                ))}

                {loggedIn && (
                  <>
                    <p className="mt-3 border-t border-slate-100 px-4 pb-1 pt-4 text-xs font-medium tracking-wide text-slate-400">
                      พื้นที่ลูกค้า
                    </p>
                    {CUSTOMER_LINKS.map((link) => (
                      <DrawerLink key={link.to} to={link.to} label={link.label} onPoint={pointAt} />
                    ))}
                    <DrawerLink to="/my/account" label="บัญชีของฉัน" onPoint={pointAt} />
                  </>
                )}
              </div>
            </nav>

            {/* เผื่อแถบ home indicator ของ iPhone รุ่นมีรอยบาก (เครื่องอื่น env() = 0 ไม่มีผล) */}
            <div className="border-t border-slate-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {loggedIn ? (
                <>
                  <p className="mb-3 flex items-center gap-2 px-1 text-sm text-slate-500">
                    <Avatar name={user?.fullName} src={user?.avatarUrl} size={28} />
                    <span className="truncate">{user?.fullName}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    ออกจากระบบ
                  </button>
                </>
              ) : (
                <>
                  {/* มือถือไม่มีกล่องชี้เมาส์ — บอกสั้น ๆ ตรงนี้แทนว่าเข้าไปได้อะไร (ข้อความชุดเดียวกับ GuestMenu) */}
                  <p className="mb-3 px-1 text-sm leading-relaxed text-slate-600">
                    <span className="font-medium text-slate-900">พื้นที่ลูกค้า</span> — ดูใบเสนอราคา สัญญา
                    งวดเงิน และสถานะงานของคุณออนไลน์
                  </p>
                  <Link
                    to="/login"
                    className="flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
                  >
                    เข้าสู่ระบบ
                  </Link>
                  <p className="mt-2 text-center text-xs text-slate-500">
                    ยังไม่มีบัญชี?{" "}
                    <Link to="/register" className="inline-flex min-h-11 items-center font-medium text-brand">
                      สมัครเอง
                    </Link>
                  </p>
                </>
              )}
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
