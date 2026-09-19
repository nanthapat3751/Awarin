import { Bell, CheckCircle2, Eye, FileText, PencilLine, UserPlus, XCircle, type LucideIcon } from "lucide-react";

import type { NotificationDto } from "@systemboq/shared-types";

interface NotificationVisual {
  Icon: LucideIcon;
  /** Tailwind bg + text for the round icon badge. */
  colorClass: string;
}

/**
 * การแจ้งเตือนไม่มีคอลัมน์ `type` ที่ชัดเจน เราจึงเดาหมวดหมู่จาก message/link เพื่อเลือกไอคอน + สี
 * ลำดับสำคัญ: ข้อความยอมรับ/ปฏิเสธ/ขอปรับแก้ ก็มีคำว่า "ใบเสนอราคา" อยู่ด้วย จึงต้องจับคู่ก่อน
 * เคสใบเสนอราคาทั่วไป
 */
export function notificationVisual(n: Pick<NotificationDto, "message" | "link">): NotificationVisual {
  const msg = n.message;
  const link = n.link ?? "";
  if (msg.includes("คำขอใหม่") || link.startsWith("/leads")) {
    return { Icon: UserPlus, colorClass: "bg-blue-100 text-blue-600" };
  }
  if (msg.includes("ยอมรับ")) {
    return { Icon: CheckCircle2, colorClass: "bg-green-100 text-green-600" };
  }
  if (msg.includes("ปฏิเสธ")) {
    return { Icon: XCircle, colorClass: "bg-red-100 text-red-600" };
  }
  // ต้องมาก่อนเคสใบเสนอราคาทั่วไป เพราะข้อความก็มีคำว่า "ใบเสนอราคา" อยู่ด้วย
  if (msg.includes("เปิดดู")) {
    return { Icon: Eye, colorClass: "bg-sky-100 text-sky-600" };
  }
  if (msg.includes("ปรับแก้") || msg.includes("แก้ไข")) {
    return { Icon: PencilLine, colorClass: "bg-amber-100 text-amber-600" };
  }
  if (msg.includes("ใบเสนอราคา") || link.includes("/quotes")) {
    return { Icon: FileText, colorClass: "bg-indigo-100 text-indigo-600" };
  }
  return { Icon: Bell, colorClass: "bg-slate-100 text-slate-700" };
}

/** Relative time for compact spots like the bell dropdown. */
export function timeAgo(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return new Date(value).toLocaleDateString("th-TH");
}

/** Day-bucket label (วันนี้ / เมื่อวาน / date) used to group the full list. */
export function dayGroupLabel(value: string): string {
  const d = new Date(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 86_400_000;
  const startOfThatDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfThatDay) / dayMs);
  if (diffDays <= 0) return "วันนี้";
  if (diffDays === 1) return "เมื่อวาน";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

export interface NotificationGroup {
  label: string;
  items: NotificationDto[];
}

/** Groups an already date-sorted (desc) list into consecutive day buckets. */
export function groupByDay(notifications: NotificationDto[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  for (const n of notifications) {
    const label = dayGroupLabel(n.createdAt);
    const last = groups.at(-1);
    if (last?.label === label) {
      last.items.push(n);
    } else {
      groups.push({ label, items: [n] });
    }
  }
  return groups;
}
