import type { NotificationDto } from "@systemboq/shared-types";

import type { PortalIconName } from "../components/PortalPage";

export interface NotificationVisual {
  icon: PortalIconName;
  /** คลาสสีของชิปไอคอนกลม (พื้น + สีไอคอน) — ชุดสีเดียวกับป้ายสถานะในพอร์ทัล */
  chip: string;
}

/**
 * ตาราง `Notification` ไม่มีคอลัมน์ประเภท (เก็บแค่ message/link) จึงต้องเดาหมวดจากข้อความ+ลิงก์
 *
 * **ลำดับสำคัญมาก** — ข้อความสถานะโครงการอย่าง "…ทีมงานจะจัดเตรียมสัญญาให้ในขั้นตอนถัดไป"
 * มีคำว่า "สัญญา" อยู่ด้วย ถ้าเช็คสัญญาก่อนจะจับผิดตัว จึงต้องเช็คสถานะโครงการก่อนเสมอ
 * (คู่กับฝั่งพนักงานที่ staff-app/src/lib/notifications-format.ts แต่คนละชุดข้อความกัน
 *  เพราะลูกค้ากับพนักงานได้รับคนละเหตุการณ์)
 */
export function notificationVisual(
  n: Pick<NotificationDto, "message" | "link">,
): NotificationVisual {
  const msg = n.message;
  const link = n.link ?? "";

  // ความปลอดภัยของบัญชี — ต้องมาก่อนทุกข้อ เป็นเรื่องที่ต้องสะดุดตาที่สุด
  if (msg.includes("ถูกล็อก") || msg.includes("รหัสผ่าน")) {
    return { icon: "lock", chip: "bg-rose-100 text-rose-600" };
  }
  // สถานะโครงการ (ไม่มีลิงก์) — เช็คก่อนเคสสัญญา เพราะข้อความมีคำว่า "สัญญา" ปนอยู่
  if (msg.includes("ได้รับการอนุมัติ") || msg.includes("ส่งมอบงาน")) {
    return { icon: "check", chip: "bg-emerald-100 text-emerald-600" };
  }
  if (msg.includes("ถูกยกเลิก")) {
    return { icon: "x", chip: "bg-rose-100 text-rose-600" };
  }
  if (link === "/my/contracts" || msg.startsWith("สัญญาเลขที่")) {
    return { icon: "contract", chip: "bg-emerald-100 text-emerald-600" };
  }
  if (msg.includes("ฉบับแก้ไข") || msg.includes("ปรับแก้")) {
    return { icon: "pen", chip: "bg-amber-100 text-amber-600" };
  }
  if (msg.includes("แนบเอกสาร")) {
    return { icon: "file", chip: "bg-sky-100 text-sky-600" };
  }
  if (msg.includes("ใบเสนอราคา") || link.includes("/my/quotes")) {
    return { icon: "file", chip: "bg-indigo-100 text-indigo-600" };
  }
  if (msg.includes("คำขอ") || link === "/my/requests") {
    return { icon: "phone", chip: "bg-blue-100 text-blue-600" };
  }
  return { icon: "bell", chip: "bg-slate-100 text-slate-600" };
}

/** เวลาแบบสั้นสำหรับแผงกระดิ่ง */
export function timeAgo(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return new Date(value).toLocaleDateString("th-TH");
}

/** ป้ายหัวกลุ่มของหน้ารวม: วันนี้ / เมื่อวาน / วันที่เต็ม */
export function dayGroupLabel(value: string): string {
  const d = new Date(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfThatDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfThatDay) / 86_400_000);
  if (diffDays <= 0) return "วันนี้";
  if (diffDays === 1) return "เมื่อวาน";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

export interface NotificationGroup {
  label: string;
  items: NotificationDto[];
}

/** จัดกลุ่มรายการที่เรียงจากใหม่ไปเก่าอยู่แล้ว ให้เป็นก้อนตามวัน */
export function groupByDay(notifications: NotificationDto[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  for (const n of notifications) {
    const label = dayGroupLabel(n.createdAt);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }
  return groups;
}
