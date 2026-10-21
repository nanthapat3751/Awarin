import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ClipboardList,
  FileSignature,
  FileSpreadsheet,
  FolderKanban,
  Home,
  ImagePlus,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  ListTree,
  Package,
  Settings,
  Trash2,
  type LucideIcon,
  UserCog,
  UserRound,
  Users,
} from "lucide-react";


import { useAuth } from "../lib/auth-context";
import { usePendingBadge } from "../lib/pending-count";
import { NARROW_SCREEN, useMediaQuery } from "../lib/use-media-query";
import { LogoutButton } from "./LogoutButton";
import { NotificationBell } from "./NotificationBell";
import { RecoveryEmailBanner } from "./RecoveryEmailBanner";
import { UserMenu } from "./UserMenu";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "แดชบอร์ด", icon: LayoutDashboard },
  { to: "/pending-work", label: "งานที่รอดำเนินการ", icon: ClipboardList },
  { to: "/projects", label: "โครงการ", icon: FolderKanban },
  { to: "/templates", label: "แม่แบบ", icon: LayoutTemplate },
  { to: "/categories", label: "หมวดงาน", icon: ListTree },
  { to: "/materials", label: "วัสดุ/ค่าแรง", icon: Package },
  { to: "/house-designs", label: "แบบบ้าน", icon: Home },
  { to: "/portfolio", label: "ผลงาน", icon: Images },
  { to: "/leads", label: "คำขอลูกค้า", icon: Users },
  { to: "/customers", label: "แฟ้มลูกค้า", icon: UserRound },
  { to: "/users", label: "จัดการผู้ใช้", icon: UserCog, ownerOnly: true },
  { to: "/contract-templates", label: "แม่แบบสัญญา", icon: FileSignature },
  { to: "/site-images", label: "คลังรูปเว็บไซต์", icon: ImagePlus },
  { to: "/reports/sales-tax", label: "รายงานภาษีขาย", icon: FileSpreadsheet },
  { to: "/trash", label: "ถังขยะ", icon: Trash2 },
  { to: "/settings", label: "ตั้งค่า", icon: Settings },
];

// เก็บค่าไว้เพื่อให้ตัวเลือกย่อ/ขยายอยู่รอดข้ามการเปลี่ยนหน้า -- แต่ละหน้า mount Layout ของ
// ตัวเอง ถ้าใช้ useState เฉย ๆ ค่าจะถูกรีเซ็ตทุกครั้งที่เปลี่ยน route
const COLLAPSED_STORAGE_KEY = "staffSidebarCollapsed";

export function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const { user } = useAuth();
  // ตัวเลขบนเมนู = เรื่องที่ต้องทำตอนนี้ (เร่ง + ควรทำวันนี้) · มีเรื่องเร่ง = แดง ไม่งั้นนาวี
  // แดชบอร์ด/งานค้างเปิดได้เฉพาะ OWNER/ADMIN (บทบาทอื่นไม่ยิงขอเลย)
  const pendingBadge = usePendingBadge(user?.role === "OWNER" || user?.role === "ADMIN");
  const showBadge = pendingBadge != null && pendingBadge.count > 0;
  const badgeColor = pendingBadge && pendingBadge.urgent > 0 ? "bg-red-600" : "bg-brand";
  const location = useLocation();
  const [pinnedCollapsed, setPinnedCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1",
  );
  const [logoError, setLogoError] = useState(false);
  // จอแคบกว่า 1280 (iPad ทุกรุ่นทั้งสองแนว) = รางไอคอน 64px เสมอ กด ☰ แล้วเมนูเต็มกางทับเนื้อหา (ไม่ดันเนื้อหาให้แคบลง)
  // จอคอม 1280 ขึ้นไป = แบบเดิม ย่อ/ขยายเองแล้วจำไว้
  const narrow = useMediaQuery(NARROW_SCREEN);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const collapsed = narrow ? !overlayOpen : pinnedCollapsed;

  useEffect(() => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, pinnedCollapsed ? "1" : "0");
  }, [pinnedCollapsed]);

  // เปลี่ยนหน้า / หมุนจอเป็นแนวนอน → ปิดเมนูที่กางทับอยู่
  useEffect(() => {
    setOverlayOpen(false);
  }, [location.pathname, narrow]);

  useEffect(() => {
    if (!overlayOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOverlayOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayOpen]);

  function toggleMenu() {
    if (narrow) setOverlayOpen((v) => !v);
    else setPinnedCollapsed((v) => !v);
  }

  // ปุ่มย่อ/ขยายเมนู (hamburger เส้นเหลื่อม) — วางไว้มุมบนขวาของหัว sidebar ใช้ซ้ำทั้งตอนขยาย/ย่อ
  const toggleBtn = (
    <button
      type="button"
      onClick={toggleMenu}
      aria-expanded={!collapsed}
      title={collapsed ? "ขยายเมนู" : "ยุบเมนู"}
      aria-label={collapsed ? "ขยายเมนู" : "ยุบเมนู"}
      className="menu-toggle shrink-0 rounded-md p-2 text-slate-500 hover:text-brand hover:bg-slate-100 transition-colors"
    >
      <span className="menu-toggle__lines" aria-hidden>
        <span />
        <span />
        <span />
      </span>
    </button>
  );

  // เส้นทางของเมนูที่ตรงกับหน้าปัจจุบันและยาวที่สุด (เจาะจงที่สุด)
  const bestMatch = NAV_ITEMS.filter((item) => item.to !== "/" && location.pathname.startsWith(item.to))
    .sort((a, b) => b.to.length - a.to.length)[0]?.to;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* จอแคบ: เมนูลอย (fixed) ทับเนื้อหา — กล่องเปล่า 64px นี้กันที่ไว้ให้รางไอคอน เนื้อหาจึงไม่ขยับตอนกาง */}
      {narrow && <div aria-hidden className="w-16 shrink-0" />}
      {narrow && overlayOpen && (
        <div aria-hidden className="fixed inset-0 z-40 bg-slate-900/30" onClick={() => setOverlayOpen(false)} />
      )}
      <aside
        className={`shrink-0 border-r border-slate-200 bg-white flex flex-col h-screen ${
          narrow ? "fixed inset-y-0 left-0 z-40" : "sticky top-0"
        } ${narrow && overlayOpen ? "shadow-xl" : ""} ${collapsed ? "w-16" : "w-60"}`}
      >
        {/* หัว sidebar สูง 64px (h-16) เท่ากับแถบ header ด้านขวาเป๊ะ → เส้นขอบล่างตรงกันเป็นเส้นเดียว
            โลโก้ h-14 (56px) พอดีในความสูงนี้ ไม่ต้องย่อ */}
        <div className="h-16 border-b border-slate-200 overflow-hidden">
          {collapsed ? (
            <div className="flex h-full items-center justify-center px-2">{toggleBtn}</div>
          ) : (
            <div className="flex h-full items-center justify-between gap-2 px-4">
              <div className="min-w-0 flex-1">
                {logoError ? (
                  <p className="text-lg font-semibold text-slate-800 whitespace-nowrap">
                    Awarin Engineering
                  </p>
                ) : (
                  <img
                    src="/logo.png"
                    alt="Awarin Engineering"
                    className="h-14 w-auto max-w-full object-contain"
                    onError={() => setLogoError(true)}
                  />
                )}
              </div>
              {toggleBtn}
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {NAV_ITEMS.filter((item) => !item.ownerOnly || user?.role === "OWNER").map((item) => {
            // เลือกเมนูที่ "เจาะจงที่สุด" ที่ตรงกับ path ปัจจุบัน -- ถ้าเช็คแค่ startsWith เมนูที่
            // path เป็นคำนำหน้าของอีกอันจะไฮไลต์พร้อมกันสองอัน (เคยเกิดจริงตอนมีเมนูซ้อนใต้ /customers)
            const active = item.to === "/" ? location.pathname === "/" : bestMatch === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={
                  active
                    ? "flex items-center gap-3 px-4 py-2 text-sm font-medium text-slate-800 bg-slate-100 border-l-2 border-slate-800"
                    : "flex items-center gap-3 px-4 py-2 text-sm text-slate-700 border-l-2 border-transparent hover:bg-slate-50 hover:text-slate-800"
                }
              >
                <span className="relative shrink-0">
                  <Icon size={18} />
                  {/* เมนูยุบ = จุดแดงเล็ก ๆ บนไอคอน (ไม่มีที่วางตัวเลข) */}
                  {collapsed && item.to === "/pending-work" && showBadge && (
                    <span aria-hidden className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${badgeColor}`} />
                  )}
                </span>
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                {!collapsed && item.to === "/pending-work" && showBadge && (
                  <span
                    className={`ml-auto rounded-full px-1.5 text-xs font-medium leading-5 tabular-nums text-white ${badgeColor}`}
                    aria-label={badgeLabel(pendingBadge.count, pendingBadge.urgent)}
                    title="เรื่องที่ต้องทำตอนนี้ (เร่ง + ควรทำวันนี้) · เรื่องระดับติดตามไม่นับ"
                  >
                    {pendingBadge.count > 99 ? "99+" : pendingBadge.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 px-3 py-2">
          <UserMenu collapsed={collapsed} />
        </div>

      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* แถบบนขวา สูง 64px (h-16) เท่าหัว sidebar → เส้นขอบล่างเสมอกัน */}
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-end gap-2 px-6">
          <NotificationBell />
          <LogoutButton />
        </header>
        <RecoveryEmailBanner />
        <main className="flex-1 px-6 py-8 w-full max-w-6xl mx-auto">{children}</main>
      </div>
    </div>
  );
}

function badgeLabel(count: number, urgent: number) {
  const urgentNote = urgent > 0 ? ` (เร่ง ${urgent})` : "";
  return `ต้องทำตอนนี้ ${count} เรื่อง${urgentNote}`;
}
