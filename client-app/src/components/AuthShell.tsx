import type { ReactNode } from "react";

// เชลล์สำหรับหน้าเข้าสู่ระบบ/สมัคร/ตั้งรหัส: สูงเต็มจอ (footer ไม่เด้งขึ้นเมื่อการ์ดสั้น) + จัด
// การ์ดกึ่งกลาง + พื้นหลังบล็อบ navy/ฟ้าเบลอนุ่ม + วงกลมซ้อนจาง ให้เข้าชุดกับพื้นที่ลูกค้า (portal)
//
// fill=false สำหรับหน้าที่มีเนื้อหาต่อท้ายเชลล์เอง (หน้าติดต่อเรามีแถบแผนที่เต็มจอต่อท้าย) —
// ถ้ายังบังคับสูงเต็มจอจะเกิดช่องว่างเปล่าคั่นกลางก่อนถึงส่วนถัดไป (วัดได้ 226px บนจอสูง 1000px)
export function AuthShell({ children, fill = true }: Readonly<{ children: ReactNode; fill?: boolean }>) {
  return (
    <div
      className={`relative isolate flex items-center justify-center overflow-hidden px-4 py-16 ${
        fill ? "min-h-[calc(100vh-4.5rem)]" : ""
      }`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-sky-300/20 blur-3xl" />
        <svg
          className="absolute -right-10 top-10 h-72 w-72 text-brand/5"
          viewBox="0 0 200 200"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="120" cy="80" r="34" />
          <circle cx="120" cy="80" r="62" />
          <circle cx="120" cy="80" r="90" />
        </svg>
      </div>
      {children}
    </div>
  );
}
