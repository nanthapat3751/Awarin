import type { LeadStatus } from "@systemboq/shared-types";

// สไตล์ตามสถานะคำขอ: ป้ายสถานะ + แถบสีซ้าย — แยกสถานะได้จากสีทันที (ใช้ทั้งหน้ารายการและหน้ารายละเอียด)
export const LEAD_STATUS_STYLE: Record<LeadStatus, { label: string; badge: string; accent: string }> = {
  NEW: { label: "รอการติดต่อ", badge: "bg-amber-100 text-amber-700", accent: "bg-amber-400" },
  CONTACTED: { label: "ทีมงานติดต่อแล้ว", badge: "bg-sky-100 text-sky-700", accent: "bg-sky-400" },
  QUOTED: { label: "อยู่ระหว่างเสนอราคา", badge: "bg-brand/10 text-brand", accent: "bg-brand" },
  CLOSED: {
    label: "ดำเนินการเสร็จสิ้น",
    badge: "bg-emerald-100 text-emerald-700",
    accent: "bg-emerald-400",
  },
  REJECTED: { label: "ไม่ดำเนินการต่อ", badge: "bg-rose-100 text-rose-700", accent: "bg-rose-400" },
};
