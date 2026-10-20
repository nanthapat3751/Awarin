import { useEffect, useRef, type ReactNode } from "react";

import type { FailureKind } from "../lib/request-failure";

/**
 * กล่องแจ้งเหตุขัดข้องระดับฟอร์ม — ตัวเดียวใช้ทุกหน้าในกลุ่มเข้าสู่ระบบ
 *
 * **ทำไมต้องมี role="alert"** ก่อนหน้านี้ข้อความผิดพลาดเป็น <p> เปล่า ๆ วัดได้ว่าทั้งฟอร์ม
 * ไม่มี role="alert" และไม่มี aria-live เลยแม้แต่จุดเดียว คนที่ใช้โปรแกรมอ่านหน้าจอกดเข้าสู่ระบบ
 * แล้วจะเงียบสนิท ไม่รู้ว่าพลาดหรือกำลังโหลดอยู่ · role="alert" ทำให้ประกาศทันทีที่โผล่
 *
 * **ทำไมต้องย้ายโฟกัสมาที่กล่องนี้** ประกาศอย่างเดียวยังไม่พอ — พอประกาศจบ เคอร์เซอร์ยังค้าง
 * อยู่ที่เดิม คนต้องไล่หาเองว่าข้อความอยู่ตรงไหนของหน้า การดึงโฟกัสมาที่กล่อง (tabIndex={-1})
 * ทำให้กด Tab ครั้งเดียวถึงปุ่ม "ลองใหม่" พอดี และคนตาดีที่เลื่อนหน้าลงไปก็ถูกดึงกลับมาเห็นด้วย
 *
 * โฟกัสเฉพาะตอนข้อความ "เปลี่ยน" ไม่ใช่ทุกครั้งที่ re-render ไม่งั้นพิมพ์แก้ทีไรโฟกัสจะถูก
 * กระชากออกจากช่องที่กำลังพิมพ์อยู่
 *
 * `focus={false}` = ไม่ดึงโฟกัส — ช่องรหัส 6 หลักที่กรอกผิด ผู้เรียกคืนโฟกัสให้ช่องพร้อมเลือกตัวเลขเดิมไว้
 * (พิมพ์รหัสใหม่ทับได้ทันที) · role="alert" ยังประกาศข้อความให้โปรแกรมอ่านหน้าจอเหมือนเดิม
 *
 * **หน้าตาแบบ A (ผู้ใช้เลือก 18 ต.ค. แบบหน้าเข้าสู่ระบบของ Google):** แถบพื้นอ่อนไม่มีกรอบ ไอคอนซ้าย
 * ข้อความสั้นบรรทัดเดียว ปุ่ม "ลองใหม่" ชิดขวาบรรทัดเดียวกัน (กด = ส่งฟอร์มซ้ำให้เลย) · ไม่มีวงแหวนโฟกัส
 * บนกล่อง (กล่องรับโฟกัสเพื่อโปรแกรมอ่านหน้าจอเท่านั้น ไม่ได้กดได้ — วงแหวนเทาทำให้ดูเหมือนปุ่ม)
 */

const TONE: Record<FailureKind, { box: string; icon: string }> = {
  // แดง = คุณต้องแก้อะไรสักอย่างที่กรอกไว้
  input: { box: "bg-red-50 text-red-800", icon: "text-red-600" },
  // เหลือง/ส้ม = ไม่ใช่ความผิดคุณ เดี๋ยวก็ใช้ได้ ไม่ต้องไปแก้อะไรในฟอร์ม
  network: { box: "bg-amber-50 text-amber-900", icon: "text-amber-600" },
  server: { box: "bg-amber-50 text-amber-900", icon: "text-amber-600" },
  rateLimit: { box: "bg-amber-50 text-amber-900", icon: "text-amber-600" },
  locked: { box: "bg-amber-50 text-amber-900", icon: "text-amber-600" },
};

function AlertIcon({ kind }: Readonly<{ kind: FailureKind }>) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5 shrink-0",
    "aria-hidden": true,
  };

  // นาฬิกาสำหรับ "รอแล้วค่อยมาใหม่" — บอกด้วยรูปทรงว่าเป็นเรื่องเวลา ไม่ใช่เรื่องที่กรอกผิด
  if (kind === "locked" || kind === "rateLimit") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }

  // เมฆขาด = ต่อไม่ติด
  if (kind === "network") {
    return (
      <svg {...common}>
        <path d="M6.5 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17 8.5" />
        <path d="M14 14.5h4.2a3.3 3.3 0 0 1 .3 6.5H11" />
        <path d="m3 3 18 18" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4.5M12 16h.01" />
    </svg>
  );
}

export function FormAlert({
  kind,
  message,
  detail,
  onRetry,
  focus = true,
}: Readonly<{
  kind: FailureKind;
  message: string;
  /** บรรทัดที่สองที่เปลี่ยนเองได้ทุกวินาที เช่นนาฬิกานับถอยหลัง */
  detail?: ReactNode;
  /** มีเมื่อกดลองใหม่แล้วมีโอกาสสำเร็จโดยไม่ต้องแก้อะไร (เน็ตหลุด/ระบบขัดข้อง) */
  onRetry?: () => void;
  /** false = ไม่ดึงโฟกัสมาที่กล่อง (ดูคำอธิบายด้านบน) */
  focus?: boolean;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const announced = useRef<string | null>(null);
  const [head, sub] = message.includes(" · ") ? message.split(" · ", 2) : [message, null];

  useEffect(() => {
    if (announced.current === message) return;
    announced.current = message;
    if (focus) ref.current?.focus();
  }, [message, focus]);

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none ${TONE[kind].box}`}
    >
      <span className={TONE[kind].icon}>
        <AlertIcon kind={kind} />
      </span>
      <div className="min-w-0 flex-1">
        {/* "เรื่องหลัก · ส่วนขยาย" → บรรทัดหัว + บรรทัดรองตัวเล็ก (ฟอร์มแคบ ไม่ให้ตัดกลางวลี) */}
        <p className="font-medium leading-snug">{head}</p>
        {sub && <p className="text-xs leading-snug opacity-80">{sub}</p>}
        {detail}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-white px-4 text-sm font-medium text-brand shadow-sm ring-1 ring-black/5 transition-colors hover:bg-brand/5 active:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 lg:min-h-8"
        >
          ลองใหม่
        </button>
      )}
    </div>
  );
}
