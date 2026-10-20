import type { ReactNode } from "react";

import { cardGridClass } from "../lib/card-grid";

/**
 * โครงร่างระหว่างโหลด — แถบแสงวิ่งซ้ายไปขวา (CSS .skeleton ใน index.css)
 *
 * รูปร่างเลียนหน้าจริงของแต่ละหน้า พอข้อมูลมาเนื้อหาจะลงที่เดิม ไม่กระโดด · โผล่หลัง 0.15 วิ
 * (โหลดเร็วกว่านั้นจะไม่เห็นเลย) · โปรแกรมอ่านหน้าจอได้ยิน "กำลังโหลด" ครั้งเดียว ไม่อ่านก้อนเทา ๆ ทีละก้อน
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

/**
 * การ์ดรูป + ชื่อ + คำอธิบาย — หน้าแบบบ้าน / ผลงาน (ตะแกรงเดียวกับ cardGridClass ของหน้าจริง)
 * หน้าแรกใช้การ์ดคนละขนาด (รูปสูง h-56 · ชื่อ + พื้นที่ 2 บรรทัด) จึงปรับได้ทั้งตะแกรง รูป และจำนวนบรรทัด
 */
export function CardGridSkeleton({
  count = 6,
  label,
  gridClass,
  imageClass = "aspect-4/3",
  lines = 3,
}: Readonly<{ count?: number; label?: string; gridClass?: string; imageClass?: string; lines?: number }>) {
  return (
    <SkeletonGroup label={label}>
      <div className={`grid gap-6 ${gridClass ?? cardGridClass(count)}`}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <Skeleton className={`${imageClass} rounded-none`} />
            <div className="flex flex-col gap-2.5 p-4">
              <Skeleton className="h-5 w-3/5" />
              {lines >= 2 && <Skeleton className={`h-3.5 ${lines === 2 ? "w-1/4" : "w-full"}`} />}
              {lines >= 3 && <Skeleton className="h-3.5 w-4/5" />}
            </div>
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

function StatusCards({ count }: Readonly<{ count: number }>) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
          <span className="absolute inset-y-0 left-0 w-1 bg-slate-200" />
          <div className="flex items-start justify-between gap-3 pl-2">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4.5 w-1/2" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** การ์ดสถานะในพอร์ทัล (แถบสีซ้าย + ชื่อ + บรรทัดรอง + ป้าย) — ใบเสนอราคา / สัญญา / คำขอ */
export function StatusListSkeleton({
  count = 3,
  label,
}: Readonly<{ count?: number; label?: string }>) {
  return (
    <SkeletonGroup label={label}>
      <StatusCards count={count} />
    </SkeletonGroup>
  );
}

/** รายการแจ้งเตือน (ไอคอน + ข้อความ + เวลา) — แผงกระดิ่ง (compact) และหน้าแจ้งเตือน */
export function NotificationListSkeleton({ count = 4, compact = false }: Readonly<{ count?: number; compact?: boolean }>) {
  if (compact) {
    return (
      <SkeletonGroup className="px-3 py-3">
        <div className="flex flex-col gap-3">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="flex flex-1 flex-col gap-2 pt-1">
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </SkeletonGroup>
    );
  }
  return (
    <SkeletonGroup>
      <NotificationGroupBody count={count} />
    </SkeletonGroup>
  );
}

/**
 * หน้าแจ้งเตือน: หัวกลุ่มวัน ("วันนี้") + การ์ดแถว (ไอคอน 40px · px-4 py-3) ทรงเดียวกับหน้าจริง
 * เดิมไม่มีหัวกลุ่มและไอคอนเล็กกว่า (36px) พอรายการจริงขึ้นทุกแถวขยับลง
 */
function NotificationGroupBody({ count }: Readonly<{ count: number }>) {
  return (
    <div className="mb-5">
      <Skeleton className="mb-2.5 ml-1 h-3 w-14" />
      <div className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 bg-white/80 shadow-sm">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3">
            <Skeleton className="mt-0.5 h-10 w-10 shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <Skeleton className={`h-3.5 ${i % 2 ? "w-3/5" : "w-4/5"}`} />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** หน้ารายละเอียด (รูปใหญ่ + หัวเรื่อง + ย่อหน้า) — แบบบ้าน / ผลงาน */
export function DetailPageSkeleton() {
  return (
    <SkeletonGroup className="mx-auto max-w-5xl px-4 py-10">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-8 w-2/3 max-w-md" />
      <Skeleton className="mt-6 aspect-video w-full rounded-xl" />
      <div className="mt-6 flex flex-col gap-2.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </SkeletonGroup>
  );
}

/** คำขอฉบับเดียว (กล่องสถานะ + แถบ 4 ขั้น · กล่องสิ่งที่ส่งมา) — หน้ารายละเอียดคำขอ */
export function RequestDetailSkeleton() {
  return (
    <SkeletonGroup>
      <RequestDetailBody />
    </SkeletonGroup>
  );
}

function RequestDetailBody() {
  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <Skeleton className="h-4 w-16" />
          <div className="mt-5 flex justify-between gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-5 h-3.5 w-4/5" />
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5">
          <Skeleton className="h-4 w-28" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** เอกสารในพอร์ทัล (หัว + กล่องตัวเลข + ตารางรายการ) — หน้าใบเสนอราคาฉบับเดียว */
/**
 * หน้าใบเสนอราคา (สองคอลัมน์): การ์ดราคา+ปุ่มขวา · หมวดงานซ้าย — จอแคบการ์ดราคาขึ้นก่อนเหมือนหน้าจริง
 * โครงต้องตรงกับ MyQuoteDetailPage ไม่งั้นพอข้อมูลมาเลย์เอาต์กระโดด
 */
export function DocumentSkeleton() {
  return (
    <SkeletonGroup>
      <DocumentBody />
    </SkeletonGroup>
  );
}

function DocumentBody() {
  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4 lg:col-start-9 lg:row-start-1">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-3.5 w-28" />
          </div>
          <div className="mt-5 flex flex-col gap-2.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-full" />
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="mt-5 h-11 w-full rounded-md" />
          <Skeleton className="mt-2 h-11 w-full rounded-md" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-8 lg:row-start-1">
          <Skeleton className="h-5 w-48" />
          <div className="mt-4 flex flex-col divide-y divide-slate-100">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 py-4">
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * ระหว่างตรวจว่าเข้าสู่ระบบอยู่ไหม (ProtectedRoute) — หน้าพอร์ทัลทุกหน้ามีแถบหัวกรมท่าเหมือนกัน
 * ทำแถบเดียวกันไว้ก่อน พอเนื้อหาจริงมาสีพื้นไม่สลับจากขาวเป็นกรมท่าให้สะดุ้ง
 */
/**
 * หน้าการชำระเงิน (/my/payments) — หัวข้อ "ต้องชำระ" + การ์ดงวดค้าง · "งวดถัดไป" การ์ดใหญ่ที่มีไทม์ไลน์งวด
 * · "ประวัติการชำระ" ทรงเดียวกับหน้าจริง (เดิมเป็นการ์ดสถานะเล็ก 3 ใบ → 2 ใบ แล้วหน้าจริงกระโดดเป็นคนละรูป)
 */
function PaymentsBody() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-36" />
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-4.5 w-3/5" />
            <Skeleton className="h-5 w-4/5 rounded-full" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
        </div>
      </div>
      <div>
        <Skeleton className="h-5 w-24" />
        <div className="mt-3 rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-5 w-40 rounded-full" />
            </div>
            <Skeleton className="h-8 w-40" />
          </div>
          <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-4">
            <Skeleton className="h-3 w-32" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-3.5 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <Skeleton className="h-5 w-28" />
        <div className="mt-3 flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2 shadow-sm sm:px-5">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <Skeleton className="h-3.5 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * หน้าจ่ายงวด (/my/payments/:id) — ซ้าย "เลือกงวด" รายการวงกลม + "ชำระด้วย" สองช่อง · ขวา การ์ดสรุปยอด
 * + ฟอร์มแจ้งโอน + ปุ่มส่ง (เดิมใช้โครงร่างเอกสาร 8/4 ที่ไม่เหมือนหน้านี้)
 */
function PaymentDetailBody() {
  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <div className="flex min-w-0 flex-col gap-8 lg:col-span-7">
        <div>
          <Skeleton className="h-6 w-40" />
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex min-h-14 items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
                <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="h-6 w-24" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Skeleton className="h-21 rounded-xl" />
            <Skeleton className="h-21 rounded-xl" />
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3 lg:col-span-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-2 h-6 w-20" />
          <Skeleton className="mt-1.5 h-3.5 w-28" />
          <Skeleton className="mt-4 h-9 w-52" />
          <div className="mt-4 flex flex-col gap-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-slate-100 pt-5">
            <Skeleton className="h-4 w-16" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Skeleton className="h-11 rounded-md" />
              <Skeleton className="h-11 rounded-md" />
            </div>
            <Skeleton className="mt-3 h-24 w-full rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}

/** ใช้ในหน้าการชำระเงินระหว่างรอข้อมูล (หัวสีน้ำเงินของ PortalPage ขึ้นแล้ว) */
export function PaymentsSkeleton() {
  return (
    <SkeletonGroup label="กำลังโหลดข้อมูลการชำระเงิน...">
      <PaymentsBody />
    </SkeletonGroup>
  );
}

/** ใช้ในหน้าจ่ายงวดระหว่างรอข้อมูล */
export function PaymentDetailSkeleton() {
  return (
    <SkeletonGroup label="กำลังโหลดรายละเอียดงวด...">
      <PaymentDetailBody />
    </SkeletonGroup>
  );
}

export function PortalPageSkeleton({
  back = false,
  wide = false,
  body = "list",
}: Readonly<{
  /** หน้ารายละเอียดมีปุ่มย้อนกลับในแถบหัว (สูง 44px + mb-4) — ไม่จองไว้ หัวจะยืดตอนหน้าจริงขึ้น */
  back?: boolean;
  /** กว้าง max-w-6xl แบบ PortalPage wide (หน้าใบเสนอราคา) */
  wide?: boolean;
  /** รูปเนื้อหา: รายการการ์ดสถานะ · คำขอฉบับเดียว · เอกสารสองคอลัมน์ · รายการแจ้งเตือน */
  body?: "list" | "request" | "document" | "notifications" | "payments" | "payment";
}>) {
  const width = wide ? "max-w-6xl" : "max-w-2xl";
  return (
    <SkeletonGroup className="flex min-h-[calc(100vh-4.5rem)] flex-col">
      <div className="bg-linear-to-br from-brand to-brand-dark">
        <div className={`mx-auto ${width} px-4 py-10`}>
          {back && <Skeleton className="on-dark mb-4 h-11 w-44 rounded-full" />}
          <Skeleton className="on-dark h-7 w-56" />
          <Skeleton className="on-dark mt-2.5 h-4 w-72 max-w-full" />
        </div>
      </div>
      <div className={`mx-auto w-full ${width} px-4 py-8`}>
        {body === "list" && <StatusCards count={3} />}
        {body === "request" && <RequestDetailBody />}
        {body === "document" && <DocumentBody />}
        {body === "payments" && <PaymentsBody />}
        {body === "payment" && <PaymentDetailBody />}
        {body === "notifications" && (
          <>
            {/* ปุ่มแท็บ "ทั้งหมด / ยังไม่อ่าน" (สูง 44px) แล้วตามด้วยรายการ */}
            <div className="mb-5 flex gap-2">
              <Skeleton className="h-11 w-24 rounded-full" />
              <Skeleton className="h-11 w-28 rounded-full" />
            </div>
            <NotificationGroupBody count={5} />
          </>
        )}
      </div>
    </SkeletonGroup>
  );
}

/**
 * หน้าดู PDF ระหว่างเซิร์ฟเวอร์สร้างไฟล์ (จริง ๆ ใช้ 1–2 วินาที — จุดที่ลูกค้าเห็นช่วงรอบ่อยที่สุด)
 * กระดาษ A4 หนึ่งแผ่นกลางจอ: หัวกระดาษ (โลโก้ + ชื่อบริษัท) · ชื่อเอกสาร · ตารางรายการ · ช่องเซ็น
 * สูงตามจอ กว้างตามสัดส่วน 210:297 — จอแคบ (มือถือ) กว้างเต็มจอแทน
 */
export function PdfPaperSkeleton({ label = "กำลังเตรียมไฟล์ PDF..." }: Readonly<{ label?: string }>) {
  return (
    <SkeletonGroup label={label} className="flex h-full items-start justify-center overflow-hidden p-4 sm:p-8">
      <div className="flex aspect-210/297 w-full max-w-[calc((100vh_-_4rem)*210/297)] flex-col bg-white p-[6%] shadow-md">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-[4%]">
          <Skeleton className="aspect-square w-[9%] rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-2.5 w-2/5" />
            <Skeleton className="h-2 w-3/5" />
          </div>
        </div>
        <Skeleton className="mx-auto mt-[6%] h-3.5 w-1/3" />
        <Skeleton className="mx-auto mt-2 h-2 w-1/4" />
        <div className="mt-[6%] flex flex-col gap-2">
          <Skeleton className="h-2 w-1/2" />
          <Skeleton className="h-2 w-2/5" />
        </div>
        {/* ระยะห่างแถวเป็นค่าคงที่ — gap แบบ % ในกล่อง flex ที่สูงไม่ตายตัวคิดเป็น 0 แถวเบียดเป็นก้อนเดียว */}
        <div className="mt-[5%] flex flex-col gap-3 border-y border-slate-100 py-3">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className={`h-2 ${["w-1/2", "w-2/5", "w-3/5"][i % 3]}`} />
              <Skeleton className="ml-auto h-2 w-[14%]" />
            </div>
          ))}
        </div>
        <div className="mt-[4%] flex flex-col items-end gap-1.5">
          <Skeleton className="h-2.5 w-1/4" />
          <Skeleton className="h-2 w-1/5" />
        </div>
        <div className="mt-auto grid grid-cols-2 gap-[12%] px-[4%]">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <Skeleton className="h-px w-full" />
              <Skeleton className="h-2 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonGroup>
  );
}

/** ช่องในฟอร์ม (ป้าย + กล่องกรอก) — หน้าบัญชีของฉันระหว่างดึงข้อมูลติดต่อเดิม */
/**
 * แถวข้อมูลแบบ "กดแถวเพื่อแก้" (InfoRow หน้าบัญชีของฉัน) — ป้ายซ้าย 144px · ค่า · ลูกศร
 * ไม่มีปุ่มบันทึกเพราะหน้าจริงไม่มี (แก้ในหน้าต่างทีละช่อง)
 */
export function InfoRowsSkeleton({ rows, label }: Readonly<{ rows: number; label?: string }>) {
  return (
    <SkeletonGroup label={label}>
      <InfoRowsBody rows={rows} />
    </SkeletonGroup>
  );
}

function InfoRowsBody({ rows }: Readonly<{ rows: number }>) {
  return (
    <div className="divide-y divide-slate-100 border-y border-slate-100">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-14 flex-wrap items-start gap-x-4 gap-y-2 px-1 py-3.5 sm:flex-nowrap">
          <Skeleton className="h-3.5 w-24 shrink-0 sm:w-28" />
          <Skeleton className={`h-3.5 flex-1 ${i % 2 ? "max-w-48" : "max-w-64"}`} />
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
        </div>
      ))}
    </div>
  );
}

/**
 * หน้าบัญชีของฉันตอนตรวจ login / โหลดไฟล์โค้ด — หัวข้อบนพื้นขาว + เมนูหมวดซ้าย (รูป ชื่อ 4 หมวด)
 * + การ์ดเนื้อหา (หัวหมวด · รูปโปรไฟล์ · แถวข้อมูล) · หน้านี้ไม่มีแถบหัวกรมท่าแบบหน้าพอร์ทัลอื่น
 * ถ้าใช้ PortalPageSkeleton พื้นจะสลับกรมท่า → ขาวทันทีที่หน้าจริงขึ้น
 * มือถือหน้าแรกคือรายการหมวด (ยังไม่เลือกหมวด) จึงซ่อนการ์ดเนื้อหาต่ำกว่า lg เหมือนหน้าจริง
 */
export function AccountPageSkeleton() {
  return (
    <SkeletonGroup label="กำลังโหลดบัญชีของฉัน" className="mx-auto max-w-5xl px-4 py-10 lg:py-12">
      <Skeleton className="h-8 w-40" />
      <div className="mt-6 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:border-0 lg:bg-transparent lg:p-0">
            <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3.5 w-40 max-w-full" />
            </div>
          </div>
          <div className="mt-4 flex flex-col divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white lg:mt-6 lg:gap-1 lg:divide-y-0 lg:rounded-none lg:border-0 lg:bg-transparent">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-3 lg:min-h-10 lg:px-3 lg:py-2">
                <Skeleton className="h-[18px] w-[18px] shrink-0 rounded" />
                <Skeleton className="h-3.5 w-28" />
              </div>
            ))}
          </div>
        </div>
        <div className="hidden rounded-xl border border-slate-200 bg-white p-5 sm:p-8 lg:block">
          <div className="border-b border-slate-100 pb-5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-3.5 w-72 max-w-full" />
          </div>
          <div className="flex max-w-xl flex-col gap-6 pt-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-22 w-22 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-56 max-w-full" />
                <Skeleton className="mt-1 h-9 w-28 rounded-lg" />
              </div>
            </div>
            <InfoRowsBody rows={3} />
          </div>
        </div>
      </div>
    </SkeletonGroup>
  );
}

export function FormFieldsSkeleton({
  fields = ["input", "choice", "textarea"],
  label = "กำลังโหลดข้อมูลติดต่อ...",
}: Readonly<{ fields?: ("input" | "choice" | "textarea")[]; label?: string }>) {
  return (
    <SkeletonGroup label={label} className="flex flex-col gap-4">
      {fields.map((kind, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-28" />
          {kind === "input" && <Skeleton className="h-10.5 w-full rounded" />}
          {kind === "textarea" && <Skeleton className="h-21 w-full rounded" />}
          {kind === "choice" && (
            <div className="flex gap-6">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-36" />
            </div>
          )}
        </div>
      ))}
      <Skeleton className="mt-2 h-10 w-36 rounded" />
    </SkeletonGroup>
  );
}

/** ระหว่างโหลดโค้ดของหน้าที่เพิ่งกดเข้า (แยกไฟล์รายหน้า) — ยังไม่รู้ว่าหน้าหน้าตาแบบไหน จึงเป็นหัวเรื่อง + ย่อหน้ากลาง ๆ */
/**
 * โครงร่างตอนโหลดไฟล์โค้ดหน้าเกี่ยวกับเรา — รูปทรงเดียวกับหน้าจริง (หัวหน้าพื้นสว่าง → หัวข้อสองโทน →
 * รูปกว้าง → 3 บทบาท) แทนโครงร่างกลาง 3 เส้นที่ไม่เหมือนหน้าไหนเลย · ขนาดต้องตรงกับ AboutPage
 * ไม่งั้นพอหน้าจริงขึ้นเนื้อหาจะกระโดด
 */
export function AboutPageSkeleton() {
  return (
    <SkeletonGroup label="กำลังโหลดหน้าเกี่ยวกับเรา">
      <div className="border-b border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="mt-6 h-9 w-full max-w-md sm:h-11" />
          <Skeleton className="mt-3 h-9 w-56 sm:h-11" />
          <Skeleton className="mt-6 h-5 w-full max-w-xl" />
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <Skeleton className="h-7 w-full max-w-4xl sm:h-8" />
        <Skeleton className="mt-3 h-7 w-2/3 sm:h-8" />
        <Skeleton className="mt-10 h-72 w-full rounded-2xl sm:h-[440px] md:mt-12 lg:h-[600px]" />
        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-10 md:mt-12">
          {[0, 1, 2].map((i) => (
            <div key={i} className="border-t border-slate-200 pt-5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-3 h-6 w-36" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonGroup>
  );
}

/**
 * หน้ารายการการ์ด (แบบบ้าน) ตอนโหลดไฟล์โค้ด — หัวข้อ + คำโปรย + ตะแกรงการ์ด ทรงเดียวกับหน้าจริง
 * (max-w-5xl · py-12 · 6 การ์ดเต็มสองแถวบนจอกว้าง) แทนโครงร่างกลาง 3 เส้น
 */
export function CardListPageSkeleton({
  label,
  filters = 0,
}: Readonly<{ label?: string; /** จำนวนปุ่มกรองเหนือตะแกรง (หน้าผลงานมี 3) */ filters?: number }>) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12">
      <SkeletonGroup label={label}>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 mb-6 h-4 w-full max-w-md" />
        {filters > 0 && (
          <div className="mb-6 flex gap-2">
            {Array.from({ length: filters }, (_, i) => (
              <Skeleton key={i} className="h-11 w-24 rounded-full lg:h-8" />
            ))}
          </div>
        )}
      </SkeletonGroup>
      <CardGridSkeleton count={6} />
    </div>
  );
}

/**
 * หน้ารายละเอียดแบบบ้าน — ปุ่มย้อนกลับ · แกลเลอรี 2/3 (รูปหลัก h-72/sm:h-105 + แถวรูปย่อ)
 * · การ์ดสเปก 1/3 ทางขวา ทรงเดียวกับหน้าจริง (max-w-6xl) ข้อมูลมาแล้วไม่กระโดด
 * ใช้ทั้งตอนโหลดไฟล์โค้ดและตอนรอข้อมูลแบบบ้าน
 */
export function HouseDesignDetailSkeleton() {
  return (
    <SkeletonGroup label="กำลังโหลดแบบบ้าน" className="mx-auto max-w-6xl px-4 py-8">
      <Skeleton className="h-9 w-48 rounded-full" />
      <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Skeleton className="h-72 w-full rounded-xl sm:h-105" />
          <div className="mt-3 flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-24 shrink-0 rounded-lg" />
            ))}
          </div>
          <Skeleton className="mt-8 h-5 w-28" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-4/5" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:self-start">
          <Skeleton className="h-6 w-3/4" />
          {/* รายการสเปก 4 แถว + ปุ่มหลัก — ทรงเดียวกับ HouseSpecList */}
          <div className="mt-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between border-t border-slate-100 py-3.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-4 h-12 w-full rounded-lg" />
        </div>
      </div>
    </SkeletonGroup>
  );
}

/**
 * หน้ารายละเอียดผลงาน — ปุ่มย้อนกลับ · ปกเต็มกว้าง (h-80/sm:h-115 มีชื่อทับมุมล่าง) · ย่อหน้านำ
 * · ตะแกรงรูป 2 คอลัมน์ ทรงเดียวกับหน้าจริง (max-w-5xl) · ใช้ทั้งตอนโหลดไฟล์โค้ดและตอนรอข้อมูล
 */
export function PortfolioDetailSkeleton() {
  return (
    <SkeletonGroup label="กำลังโหลดผลงาน" className="mx-auto max-w-5xl px-4 py-8">
      <Skeleton className="h-9 w-36 rounded-full" />
      <Skeleton className="mt-4 h-80 w-full rounded-2xl sm:h-115" />
      <div className="mt-8 flex max-w-3xl flex-col gap-2.5">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </SkeletonGroup>
  );
}

/**
 * หน้าบริการตอนโหลดไฟล์โค้ด — หัวพื้นนาวี (สูงเท่าหัวจริง) + การ์ดสามบริการลอยซ้อนขอบล่าง
 * ทรงเดียวกับหน้าจริง · ก้อนบนหัวใช้ .on-dark (ก้อนเทาทึบบนนาวีจะโดดออกมา)
 */
export function ServicesPageSkeleton() {
  return (
    <SkeletonGroup label="กำลังโหลดหน้าบริการ">
      <div className="h-[clamp(26rem,60vh,34rem)] bg-linear-to-br from-brand via-brand-dark to-[#0b1040] lg:h-[34rem]">
        <div className="mx-auto flex h-full max-w-6xl flex-col justify-end px-6 pb-28 md:pb-36">
          <Skeleton className="on-dark h-4 w-32" />
          <Skeleton className="on-dark mt-4 h-12 w-48 sm:h-14" />
          <Skeleton className="on-dark mt-5 h-5 w-full max-w-xl" />
          <Skeleton className="on-dark mt-2 h-5 w-2/3 max-w-md" />
        </div>
      </div>
      <div className="relative mx-auto -mt-20 grid max-w-6xl grid-cols-1 gap-4 px-6 md:-mt-24 md:grid-cols-3 md:gap-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-lg ring-1 ring-slate-200">
            <Skeleton className="h-20 w-24 shrink-0 rounded-lg" />
            <div className="flex-1">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="mt-2 h-3.5 w-full" />
              <Skeleton className="mt-3 h-3.5 w-24" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/**
 * หน้าติดต่อเราตอนโหลดไฟล์โค้ด — ฟอร์มซ้าย 3/5 (หัวข้อ · ช่องกรอก · ช่องรายละเอียด · ปุ่ม) / ที่อยู่ขวา 2/5
 * ทรงเดียวกับหน้าจริง (max-w-xl → lg:max-w-5xl · py-16 แบบ AuthShell)
 */
export function ContactPageSkeleton() {
  return (
    <SkeletonGroup label="กำลังโหลดหน้าติดต่อเรา" className="flex justify-center px-4 py-16">
      <div className="grid w-full max-w-xl grid-cols-1 gap-10 lg:max-w-5xl lg:grid-cols-5 lg:gap-16">
        <div className="lg:col-span-3">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="mt-3 h-4 w-full max-w-sm" />
          <div className="mt-6 flex flex-col gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded" />
            ))}
            <Skeleton className="h-28 w-full rounded" />
            <Skeleton className="h-10 w-full rounded" />
          </div>
        </div>
        <div className="lg:col-span-2 lg:border-l lg:border-slate-200 lg:pl-12">
          <Skeleton className="h-6 w-36" />
          <div className="mt-5 flex flex-col gap-4">
            {["w-4/5", "w-2/3", "w-1/2"].map((w) => (
              <div key={w} className="flex items-center gap-3">
                <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                <Skeleton className={`h-4 ${w}`} />
              </div>
            ))}
          </div>
          <Skeleton className="mt-5 h-11 w-36 rounded-lg" />
        </div>
      </div>
    </SkeletonGroup>
  );
}

export function RouteSkeleton() {
  return (
    <SkeletonGroup className="mx-auto w-full max-w-5xl px-4 py-12">
      <Skeleton className="h-8 w-64 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 flex flex-col gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </SkeletonGroup>
  );
}
