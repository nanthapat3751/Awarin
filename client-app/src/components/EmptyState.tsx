import { Link } from "react-router-dom";

// สถานะว่าง (empty state) ที่อธิบายว่าหน้านี้มีไว้ทำอะไร + ปุ่มพาไปทำขั้นตอนถัดไป — ช่วยให้ลูกค้า
// ที่เพิ่งล็อกอินแล้วยังไม่มีข้อมูลเข้าใจว่าเข้ามาทำอะไรได้ แทนที่จะเจอบรรทัด "ยังไม่มีข้อมูล" เปล่า ๆ
export function EmptyState({
  title,
  description,
  ctaLabel,
  ctaTo,
}: Readonly<{
  title: string;
  description: string;
  ctaLabel?: string;
  ctaTo?: string;
}>) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 px-6 py-12 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {ctaLabel && ctaTo && (
        <Link
          to={ctaTo}
          className="mt-4 inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
