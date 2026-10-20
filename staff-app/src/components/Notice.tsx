import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

/** กล่องแจ้งเตือนตัวเล็กในแผงตั้งค่า — แดง = ใช้งานไม่ได้ตอนนี้ · เหลือง = ใช้ได้แต่ควรแก้ */
export function Notice({ tone, children }: Readonly<{ tone: "red" | "amber"; children: ReactNode }>) {
  const cls =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <p className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${cls}`}>
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
