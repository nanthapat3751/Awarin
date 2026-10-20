import type { ReactNode } from "react";

// ไอคอนช่องกรอก (inline SVG สไตล์เส้น) สำหรับฟอร์มฝั่งลูกค้า — client ไม่ได้ติดตั้ง lucide
function Svg({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-[18px] w-[18px]"}
      aria-hidden
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

export const UserIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Svg>
);

export const PhoneIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </Svg>
);

export const MailIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </Svg>
);

export const LockIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Svg>
);

export const BriefcaseIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </Svg>
);

export const MessageIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Svg>
);

export const MapPinIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </Svg>
);

export const RulerIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 9.5 14.5 21a2 2 0 0 0 2.83 0L21 17.33a2 2 0 0 0 0-2.83L9.5 3a2 2 0 0 0-2.83 0L3 6.67a2 2 0 0 0 0 2.83Z" />
    <path d="m7.5 10.5 1 1M10.5 7.5l1 1M13.5 4.5l1 1M4.5 13.5l1 1" />
  </Svg>
);

export const CalendarIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Svg>
);

export const FileTextIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v5h6M16 13H8M16 17H8M10 9H8" />
  </Svg>
);

export const CameraIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
    <circle cx="12" cy="13" r="3" />
  </Svg>
);

export const TrashIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Svg>
);

export const ChevronRightIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);

export const ChevronLeftIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);

/* เส้นหนากว่าไอคอนช่องกรอก เพราะใช้เป็นสัญญาณ "สำเร็จ" บนพื้นสีทึบ ไม่ใช่ไอคอนประกอบข้อความ */
export const CheckIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className ?? "h-[18px] w-[18px]"}
    aria-hidden
  >
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

/** สถานะช่องกรอก: ถูกแล้ว (แทนไอคอนประจำช่อง — แบบ C ที่ผู้ใช้เลือก 16 ต.ค.) */
export const CircleCheckIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="m8 12.5 2.5 2.5L16 9.5" />
  </Svg>
);

/** สถานะช่องกรอก: ยังไม่ถูก — มีข้อความบอกเหตุใต้ช่องเสมอ ไอคอนอย่างเดียวไม่พอ */
export const CircleAlertIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4.5" />
    <path d="M12 16h.01" />
  </Svg>
);

export const EyeIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const EyeOffIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <path d="m2 2 20 20" />
  </Svg>
);

// กรอบวางไอคอนประดับท้ายช่องกรอก (ไม่ใช่ปุ่ม กดไม่ได้) — ใช้ขนาดเดียวกับปุ่มตาดูรหัสผ่าน
// ที่อยู่ในตำแหน่งเดียวกัน ไอคอนของทุกช่องจะได้อยู่แนวเดียวกันพอดี
// tone: สีของไอคอนสถานะ — เขียว emerald-700 (600 คอนทราสต์ไม่ผ่านบนพื้นขาว) / แดงเดียวกับข้อความเตือน
const ADORNMENT_TONE = { idle: "text-slate-400", ok: "text-emerald-700", error: "text-red-600" } as const;
export const FieldAdornment = ({
  children,
  tone = "idle",
}: Readonly<{ children: ReactNode; tone?: keyof typeof ADORNMENT_TONE }>) => (
  <span aria-hidden className={`inline-flex h-11 w-11 items-center justify-center ${ADORNMENT_TONE[tone]}`}>
    {children}
  </span>
);
