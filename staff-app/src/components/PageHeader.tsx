import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  // คำอธิบายใต้หัวข้อ (ไม่ใส่ก็ได้)
  subtitle?: ReactNode;
  // องค์ประกอบด้านขวา เช่น ปุ่มสร้าง/กรอง
  action?: ReactNode;
  className?: string;
}

// หัวข้อหน้ามาตรฐานฝั่งพนักงาน: แถบสีแบรนด์นาวี + หัวข้อ + subtitle + ช่องปุ่มด้านขวา
// ใช้ทุกหน้าเพื่อให้ระยะห่าง/สไตล์สม่ำเสมอ (เดิมแต่ละหน้าเขียน h1 เองไม่เท่ากัน)
export function PageHeader({ title, subtitle, action, className }: Readonly<PageHeaderProps>) {
  return (
    <div className={`mb-6 flex items-start justify-between gap-4 ${className ?? ""}`}>
      <div className="flex min-w-0 items-stretch gap-3">
        <span className="w-1 shrink-0 rounded-full bg-brand" aria-hidden />
        <div className="min-w-0 py-0.5">
          <h1 className="text-2xl font-semibold text-slate-800">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
