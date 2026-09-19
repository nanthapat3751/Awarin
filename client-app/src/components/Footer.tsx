import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { getPublicSettings } from "../lib/public-api";
import { lineHref as toLineHref, safeHttpUrl } from "../lib/safe-url";
import { FacebookIcon, LineIcon, YoutubeIcon } from "./SocialIcons";

const ORG_LINKS = [
  { to: "/house-designs", label: "แบบบ้าน" },
  { to: "/portfolio", label: "ผลงาน" },
  { to: "/contact", label: "ติดต่อเรา" },
  // PDPA: ต้องแจ้งวัตถุประสงค์การเก็บข้อมูลก่อน/ขณะเก็บ ฟุตเตอร์จึงเป็นที่ที่ต้องมีลิงก์นี้ทุกหน้า
  { to: "/privacy", label: "นโยบายความเป็นส่วนตัวของข้อมูล" },
];

// ลิงก์ลงตรงไปยังแต่ละส่วนของหน้าบริการ — id ทั้งสามมีอยู่แล้วใน ServicesPage และมี scroll-mt-24
// กันหัวข้อถูกแถบเมนู fixed บัง การเลื่อนไปยัง #id ทำโดย ScrollOnNavigate ใน App.tsx (เบราว์เซอร์
// ทำเองไม่ได้ เพราะตอนมันมองหาจุดหมาย React ยังเรนเดอร์ส่วนนั้นไม่เสร็จ)
const SERVICE_LINKS = [
  { to: "/services#design", label: "งานออกแบบ" },
  { to: "/services#construction", label: "งานก่อสร้าง" },
  { to: "/services#engineering", label: "งานระบบวิศวกรรม" },
];

function LinkColumn({ title, links }: Readonly<{ title: string; links: { to: string; label: string }[] }>) {
  return (
    <div>
      <h4 className="text-white text-sm font-medium mb-3">{title}</h4>
      {/* บนมือถือแต่ละลิงก์สูง 44px ตามเกณฑ์นิ้วมือ; บนเดสก์ท็อปกลับไปกระชับเหมือนเดิม */}
      <ul className="flex flex-col text-sm lg:gap-2">
        {links.map((link) => (
          <li key={link.to}>
            <Link
              to={link.to}
              className="flex min-h-11 items-center text-slate-400 transition-colors hover:text-white lg:min-h-0"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function SocialLink({ href, label, children }: Readonly<{ href: string; label: string; children: ReactNode }>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-brand lg:h-9 lg:w-9"
    >
      {children}
    </a>
  );
}

export function Footer() {
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    getPublicSettings()
      .then((res) => setSettings(res.settings))
      .catch(() => undefined);
  }, []);

  const companyName = settings.companyName || "บริษัทรับออกแบบและสร้างบ้าน";
  const year = new Date().getFullYear() + 543; // พ.ศ.

  // กรอง href ให้เหลือเฉพาะ http/https จริง (กัน javascript:/data: → stored XSS)
  const facebookHref = safeHttpUrl(settings.companyFacebook);
  const youtubeHref = safeHttpUrl(settings.companyYoutube);
  const lineHref = toLineHref(settings.companyLine);
  const hasSocial = Boolean(facebookHref || youtubeHref || lineHref);
  const email = settings.companyEmail?.trim() ?? "";

  return (
    <footer className="bg-[#000033] text-slate-300">
      {/* 4 คอลัมน์บนจอใหญ่ · 2 คอลัมน์บนแท็บเล็ต · เรียงลงมาบนมือถือ */}
      <div className="max-w-5xl mx-auto px-4 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div>
          <h3 className="text-white font-semibold text-lg">{companyName}</h3>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            รับออกแบบและก่อสร้างบ้าน พร้อมประเมินราคาต้นทุนอย่างโปร่งใส
          </p>
        </div>

        <LinkColumn title="องค์กร" links={ORG_LINKS} />
        <LinkColumn title="บริการ" links={SERVICE_LINKS} />

        <div>
          <h4 className="text-white text-sm font-medium mb-3">ติดต่อ</h4>
          <ul className="flex flex-col gap-2 text-sm text-slate-400">
            {settings.companyPhone && (
              <li className="flex items-center">
                โทร.{" "}
                <a
                  href={`tel:${settings.companyPhone}`}
                  className="ml-1 inline-flex min-h-11 items-center hover:text-white lg:min-h-0"
                >
                  {settings.companyPhone}
                </a>
              </li>
            )}
            {email && (
              <li className="flex items-center">
                อีเมล{" "}
                <a
                  href={`mailto:${email}`}
                  className="ml-1 inline-flex min-h-11 items-center break-all hover:text-white lg:min-h-0"
                >
                  {email}
                </a>
              </li>
            )}
            {settings.companyAddress && <li className="leading-relaxed">{settings.companyAddress}</li>}
            {!settings.companyPhone && !settings.companyAddress && !email && (
              <li>
                <Link to="/contact" className="flex min-h-11 items-center hover:text-white lg:min-h-0">
                  ส่งข้อความถึงเรา →
                </Link>
              </li>
            )}
          </ul>

          {(hasSocial || settings.companyPhone) && (
            <div className="flex items-center gap-2 mt-4">
              {facebookHref && (
                <SocialLink href={facebookHref} label="Facebook">
                  <FacebookIcon />
                </SocialLink>
              )}
              {youtubeHref && (
                <SocialLink href={youtubeHref} label="Youtube">
                  <YoutubeIcon />
                </SocialLink>
              )}
              {lineHref && (
                <SocialLink href={lineHref} label="LINE">
                  <LineIcon />
                </SocialLink>
              )}
              {settings.companyPhone && (
                <SocialLink href={`tel:${settings.companyPhone}`} label="โทร">
                  <PhoneIcon />
                </SocialLink>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-4 text-xs text-slate-500 text-center">
          © {year} {companyName}. สงวนลิขสิทธิ์
        </div>
      </div>
    </footer>
  );
}
