import type { ReactNode } from "react";
import { Link } from "react-router-dom";

// เชลล์หน้าพื้นที่ลูกค้า (portal): แถบหัว navy แบบ "พิมพ์เขียววิศวกร" + พื้นหลังบล็อบเบลอนุ่ม
// ใช้ร่วมกันทั้งหน้า คำขอ/ใบเสนอราคา/สัญญา เพื่อให้ทั้งพอร์ทัลเข้าชุดกัน

// แถบหัว navy ไล่เฉด + ลายกริดจาง + วงโค้งซ้อน (ขาวจาง) ชื่อหน้าเป็นสีขาว
function BackArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
      aria-hidden
    >
      <path d="M19 12H5" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

export interface PortalBack {
  to: string;
  label: string;
}

function PortalHero({
  title,
  subtitle,
  back,
  width,
}: Readonly<{
  title: string;
  subtitle: string;
  back?: PortalBack;
  width: string;
}>) {
  return (
    <div className="relative overflow-hidden bg-linear-to-br from-brand to-brand-dark text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <svg className="absolute inset-0 h-full w-full text-white/10">
          <defs>
            <pattern id="portal-grid" width="34" height="34" patternUnits="userSpaceOnUse">
              <path d="M34 0H0V34" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#portal-grid)" />
        </svg>
        <svg
          className="absolute -right-8 -top-12 h-64 w-64 text-white/10"
          viewBox="0 0 200 200"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="140" cy="60" r="34" />
          <circle cx="140" cy="60" r="62" />
          <circle cx="140" cy="60" r="90" />
        </svg>
      </div>
      <div className={`relative mx-auto ${width} px-4 py-10`}>
        {/* ปุ่มย้อนกลับอยู่ในแถบหัว เหนือชื่อหน้า — ที่ทางที่คนคุ้นว่าต้องหาตรงนี้
            (เดิมเป็นข้อความมีขีดเส้นใต้ลอยอยู่ในเนื้อหา ดันเนื้อหาลงไปหนึ่งบรรทัดโดยไม่ได้ช่วยอะไร) */}
        {back && (
          <Link
            to={back.to}
            className="group mb-4 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm text-white/85 ring-1 ring-white/25 transition-colors hover:bg-white/10 hover:text-white"
          >
            <BackArrow />
            {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-white/70">{subtitle}</p>
      </div>
    </div>
  );
}

// บล็อบ navy/ฟ้าเบลอนุ่มด้านล่างแถบหัว — เติมพื้นที่ว่างจนถึง footer โดยไม่รบกวนการอ่าน
function PortalBlobs() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute top-20 -right-28 h-96 w-96 rounded-full bg-sky-300/20 blur-3xl" />
      <div className="absolute bottom-8 left-1/4 h-72 w-72 rounded-full bg-brand/5 blur-3xl" />
    </div>
  );
}

export function PortalPage({
  title,
  subtitle,
  back,
  wide = false,
  children,
}: Readonly<{
  title: string;
  subtitle: string;
  back?: PortalBack;
  /** หน้าสองคอลัมน์ (เนื้อหา + การ์ดสรุปติดจอขวา) — กว้าง max-w-6xl ทั้งแถบหัวและเนื้อหา ขอบซ้ายจะตรงกัน */
  wide?: boolean;
  children: ReactNode;
}>) {
  const width = wide ? "max-w-6xl" : "max-w-2xl";
  return (
    <div className="flex min-h-[calc(100vh-4.5rem)] flex-col">
      <PortalHero title={title} subtitle={subtitle} back={back} width={width} />
      {/* ไม่ใส่ overflow-hidden ตอนกว้าง — position: sticky ของการ์ดสรุปจะไม่ทำงานถ้าบรรพบุรุษตัดขอบ
          บล็อบพื้นหลังตัดขอบของตัวเองอยู่แล้ว (PortalBlobs มี overflow-hidden) จึงไม่ล้นจอ */}
      <div className={`relative isolate flex-1 ${wide ? "" : "overflow-hidden"}`}>
        <PortalBlobs />
        <div className={`relative mx-auto ${width} px-4 py-8`}>{children}</div>
      </div>
    </div>
  );
}

// ── ไอคอนสถานะ (inline SVG — client-app ไม่ได้ใช้ไลบรารีไอคอน) สืบสีจาก currentColor ──
export type PortalIconName =
  | "clock"
  | "phone"
  | "file"
  | "check"
  | "x"
  | "pen"
  | "contract"
  | "bell"
  | "lock";

export function PortalIcon({ name }: Readonly<{ name: PortalIconName }>) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5",
    "aria-hidden": true,
  };
  switch (name) {
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common}>
          <path d="M4 5a2 2 0 0 1 2-2h1.6a1 1 0 0 1 .95.68l.9 2.5a1 1 0 0 1-.27 1.05L8 8.5a12 12 0 0 0 5.5 5.5l1.27-1.18a1 1 0 0 1 1.05-.27l2.5.9a1 1 0 0 1 .68.95V16a2 2 0 0 1-2 2A14 14 0 0 1 4 5Z" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v4h4" />
          <path d="M9.5 12.5h5M9.5 16h5" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12 2.5 2.5 4.5-5" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m9 9 6 6M15 9l-6 6" />
        </svg>
      );
    case "pen":
      return (
        <svg {...common}>
          <path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z" />
          <path d="M13.5 6.5l3 3" />
        </svg>
      );
    case "contract":
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v4h4" />
          <path d="m9.5 14.5 1.5 1.5 3-3" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
          <path d="M10.5 20a2 2 0 0 0 3 0" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
          <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
        </svg>
      );
  }
}

// การ์ดสถานะแบบเดียวกันทั้งพอร์ทัล: แถบสีซ้าย + ชิปไอคอน + ชื่อ + ป้ายสถานะ + (เนื้อหา/ปุ่ม)
export function StatusCard({
  accent,
  chip,
  icon,
  title,
  meta,
  badge,
  href,
  action,
  index,
  children,
  footer,
}: Readonly<{
  accent: string; // คลาสสีแถบซ้าย เช่น "bg-amber-400"
  chip?: string; // คลาสสีชิปไอคอน เช่น "bg-amber-100 text-amber-600" (ใส่เมื่อมีไอคอน)
  icon?: ReactNode; // ไอคอนในชิปสี — ถ้าไม่ส่งมา จะไม่แสดงชิปเลย
  title: ReactNode;
  meta?: ReactNode;
  badge?: { label: string; className: string };
  href?: string; // ถ้ามี ทั้งการ์ดเป็นลิงก์
  action?: ReactNode; // ปุ่ม/องค์ประกอบด้านขวา (เช่น ปุ่มดาวน์โหลด)
  /** ลำดับในรายการ — ใส่แล้วการ์ดจะไล่โผล่ทีละใบ (ไม่ใส่ = ไม่มีอนิเมชัน เช่นการ์ดเดี่ยวในหน้ารายละเอียด) */
  index?: number;
  children?: ReactNode;
  /**
   * เนื้อหาเต็มความกว้างการ์ดใต้แถวหัว (ใต้ปุ่มขวาด้วย) — children อยู่ในคอลัมน์ซ้ายข้างปุ่ม จึงยาวไม่สุดขอบขวา
   * (ผู้ใช้ทัก 18 ต.ค. แถบเหลือง "มีงวดที่ต้องชำระ" ในหน้าสัญญาดูไม่บาลานซ์)
   */
  footer?: ReactNode;
}>) {
  const hasBody = children != null || footer != null;
  // ลอยขึ้นตอนชี้เฉพาะการ์ดที่กดได้ — เดิมทุกใบลอย ลูกค้าเลยกดการ์ดคำขอ/สัญญาแล้วไม่มีอะไรเกิดขึ้น
  const cardClass = `group relative block overflow-hidden rounded-xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm transition-all${
    href ? " hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" : ""
  }`;

  // หน่วงทีละ 60ms แต่หยุดเพิ่มที่ใบที่ 9 — รายการยาว ๆ ไม่ควรให้ใบท้าย ๆ รอเป็นวินาที
  const animated = index != null;
  const className = animated ? `${cardClass} portal-item` : cardClass;
  const style = animated ? { animationDelay: `${Math.min(index, 8) * 60}ms` } : undefined;

  const inner = (
    <>
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <div className="flex items-start gap-3 pl-2">
        {icon && (
          <span
            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${chip ?? ""}`}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-slate-800">{title}</p>
            {badge && (
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
            )}
          </div>
          {meta && <div className="mt-0.5 text-xs text-slate-400">{meta}</div>}
          {/*
            การ์ดที่มีเนื้อหาข้างใน (เช่น งวดเงิน + QR ในหน้าสัญญา) บนมือถือ: ปุ่มขวามาอยู่ใต้หัวการ์ดแทน
            ไม่งั้นคอลัมน์ปุ่มกินที่ครึ่งจอ เนื้อหาเหลือแคบจน QR/ตัวเลขตกบรรทัด · การ์ดไม่มีเนื้อหาเหมือนเดิม
          */}
          {action && hasBody && <div className="mt-2 sm:hidden">{action}</div>}
          {children}
        </div>
        {/* การ์ดที่มีเนื้อหาข้างใน (กางรายละเอียดงวดได้) ปุ่มตรึงไว้บนสุดคู่กับหัวการ์ด — เดิม self-center
            ทำให้ปุ่มเลื่อนลงไปกลางการ์ดทุกครั้งที่กางรายการ (ผู้ใช้ทัก 17 ต.ค.) · การ์ดบรรทัดเดียวยังอยู่กึ่งกลาง */}
        {action && (
          <div className={`shrink-0 ${hasBody ? "hidden self-start sm:block" : "self-center"}`}>{action}</div>
        )}
      </div>
      {footer != null && <div className="pl-2">{footer}</div>}
    </>
  );

  if (href) {
    return (
      <Link to={href} className={className} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={className} style={style}>
      {inner}
    </div>
  );
}
