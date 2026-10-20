import type { ReactNode } from "react";

/**
 * โครงร่างระหว่างโหลด — แถบแสงวิ่งซ้ายไปขวา (CSS .skeleton ใน index.css)
 *
 * รูปร่างเลียนหน้าจริง (ตาราง / การ์ด / แผง) พอข้อมูลมาเนื้อหาลงที่เดิม ไม่กระโดด · โผล่หลัง 0.15 วิ
 * (โหลดเร็วกว่านั้นไม่เห็นเลย) · โปรแกรมอ่านหน้าจอได้ยิน "กำลังโหลด" ครั้งเดียว ไม่อ่านก้อนเทาทีละก้อน
 */
export function Skeleton({ className = "" }: Readonly<{ className?: string }>) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonGroup({
  label = "กำลังโหลด...",
  className = "",
  children,
}: Readonly<{ label?: string; className?: string; children: ReactNode }>) {
  return (
    <div role="status" aria-live="polite" className="skeleton-group">
      <span className="sr-only">{label}</span>
      {/* className ลงกล่องในที่ห่อก้อนจริง — ใส่ที่กล่องนอกแล้ว flex/grid จะจัดแค่ span กับกล่องในสองตัว */}
      <div aria-hidden className={className}>
        {children}
      </div>
    </div>
  );
}

// ความกว้างของก้อนในแต่ละคอลัมน์ วนใช้ — ทุกช่องกว้างเท่ากันหมดจะดูเป็นตารางปลอม ไม่เหมือนข้อมูลจริง
const CELL_WIDTHS = ["w-24", "w-48", "w-20", "w-32", "w-16", "w-28"];

function TableShape({ rows, cols }: Readonly<{ rows: number; cols: number }>) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* หัวตารางของจริงเป็นแถบ slate-200 — ทำแถบเดียวกัน ไม่ใส่ก้อนข้างใน (สีเดียวกันจะมองไม่เห็นอยู่ดี) */}
      <div className="h-8 border-b border-slate-300 bg-slate-200" />
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-6 px-3 py-3">
            {Array.from({ length: cols }, (_, c) => (
              <Skeleton
                key={c}
                className={`h-3.5 ${c === cols - 1 ? "ml-auto w-14" : CELL_WIDTHS[(c + r) % CELL_WIDTHS.length]}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** ตารางรายการ — หน้ารายชื่อโครงการ ลูกค้า วัสดุ ฯลฯ (หัวตาราง + แถว) */
export function TableSkeleton({ rows = 8, cols = 4, label }: Readonly<{ rows?: number; cols?: number; label?: string }>) {
  return (
    <SkeletonGroup label={label}>
      <TableShape rows={rows} cols={cols} />
    </SkeletonGroup>
  );
}

/** การ์ดรูป + ชื่อ — หน้าแบบบ้าน / ผลงาน / คลังรูป */
export function CardGridSkeleton({
  count = 6,
  className = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  label,
}: Readonly<{ count?: number; className?: string; label?: string }>) {
  return (
    <SkeletonGroup label={label}>
      <div className={`grid gap-4 ${className}`}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <Skeleton className="aspect-video rounded-none" />
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** รายการทีละบรรทัดในกรอบ (แจ้งเตือน, กิจกรรม, แม่แบบ) */
export function ListSkeleton({ rows = 5, label }: Readonly<{ rows?: number; label?: string }>) {
  return (
    <SkeletonGroup label={label}>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className={`h-3.5 ${i % 2 ? "w-2/3" : "w-1/2"}`} />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** แผงย่อยในแท็บ/การ์ด — ไม่มีกรอบของตัวเอง เพราะอยู่ในการ์ดที่มีกรอบแล้ว */
export function PanelSkeleton({ lines = 4, label }: Readonly<{ lines?: number; label?: string }>) {
  return (
    <SkeletonGroup label={label} className="py-1">
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={`h-3.5 ${["w-full", "w-11/12", "w-4/5", "w-2/3"][i % 4]}`} />
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** หน้ารายละเอียด: หัวเรื่อง + การ์ดตัวเลข + ตาราง — โครงการ / แฟ้มลูกค้า / ตั้งค่า */
export function DetailSkeleton({
  stats = 4,
  title = true,
  label,
}: Readonly<{ stats?: number; title?: boolean; label?: string }>) {
  return (
    <SkeletonGroup label={label}>
      {title && (
        <div className="mb-6">
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="mt-2.5 h-4 w-48" />
        </div>
      )}
      {stats > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: stats }, (_, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2.5 h-6 w-28" />
            </div>
          ))}
        </div>
      )}
      <TableShape rows={6} cols={4} />
    </SkeletonGroup>
  );
}

/** ระหว่างตรวจว่าเข้าสู่ระบบอยู่ไหม (ProtectedRoute) — โครงเมนูซ้าย + เนื้อหา ให้ตรงกับ Layout */
export function AppShellSkeleton() {
  return (
    <SkeletonGroup className="flex min-h-screen bg-slate-50">
      <div className="flex h-screen w-60 shrink-0 flex-col gap-3 border-r border-slate-200 bg-white px-4 py-5">
        <Skeleton className="mb-4 h-8 w-32" />
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className={`h-4 ${["w-32", "w-28", "w-36", "w-24"][i % 4]}`} />
        ))}
      </div>
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <Skeleton className="h-7 w-56" />
        <div className="mt-6">
          <TableShape rows={6} cols={4} />
        </div>
      </div>
    </SkeletonGroup>
  );
}
