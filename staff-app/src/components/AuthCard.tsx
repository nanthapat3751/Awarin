import type { ReactNode } from "react";

/**
 * กรอบหน้าสาธารณะฝั่งพนักงาน (ลืมรหัสผ่าน / ตั้งรหัสใหม่) — พื้นหลังรูป + การ์ดขาวกลางจอ
 * หน้าตาเดียวกับหน้าเข้าสู่ระบบ คนกดมาจากหน้านั้นจะได้รู้ว่ายังอยู่ในระบบเดิม
 */
export function AuthCard({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-slate-900 bg-cover bg-center px-4"
      style={{
        backgroundImage: "linear-gradient(rgba(15,23,42,0.55), rgba(15,23,42,0.55)), url('/web10.jpg')",
      }}
    >
      <div className="login-card flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-8 shadow-xl">
        <img src="/logo-white-removed.png" alt="Awarin Engineering" className="mx-auto h-16 w-auto" />
        <h1 className="text-center text-xl font-semibold text-slate-800">{title}</h1>
        {children}
      </div>
    </div>
  );
}
