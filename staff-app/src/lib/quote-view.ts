// "ส่งใบเสนอราคาไปแล้ว ลูกค้าเปิดดูหรือยัง" — คำถามที่ถามก่อนตัดสินใจว่าจะโทรตามหรือรอต่อ
//
// อยู่ในไฟล์กลางเพราะแสดงสองที่ (ตารางใบเสนอราคาในหน้าโครงการ + หน้างานค้าง) ถ้าเขียนแยกกัน
// เกณฑ์จะเพี้ยนจากกันเมื่อแก้ที่เดียว เช่นที่หนึ่งนับใบร่างว่า "ยังไม่เปิด" อีกที่ไม่นับ

import type { QuoteDto } from "@systemboq/shared-types";

export type QuoteViewTone = "none" | "unopened" | "opened";

export interface QuoteViewStatus {
  tone: QuoteViewTone;
  /** ข้อความหลักในคอลัมน์ */
  label: string;
  /** บรรทัดรองใต้ข้อความหลัก (null = ไม่ต้องมี) */
  hint: string | null;
  /** ข้อความเต็มสำหรับ title= เมื่อเอาเมาส์ชี้ */
  title: string;
}

type QuoteViewFields = Pick<
  QuoteDto,
  "status" | "sentAt" | "createdAt" | "firstViewedAt" | "lastViewedAt" | "viewCount"
>;

/**
 * วันที่ระบบเริ่มเก็บข้อมูลการเปิดดู (migration 20260908120000_add_quote_view_tracking)
 *
 * ใบที่ส่งไปก่อนหน้านี้ไม่มีใครรู้ว่าลูกค้าเปิดหรือยัง — ถ้าปล่อยให้ขึ้นว่า "ยังไม่เปิด" ก็คือ
 * ตอบผิด และพนักงานจะไล่โทรตามลูกค้าที่อ่านใบเสนอราคาไปแล้ว จึงต้องบอกตรง ๆ ว่าไม่มีข้อมูล
 */
export const VIEW_TRACKING_SINCE = new Date("2026-09-08T00:00:00+07:00");

/** "เมื่อสักครู่" / "12 นาทีก่อน" / "3 ชม.ก่อน" / "5 วันก่อน" / วันที่เต็มเมื่อเกินสัปดาห์ */
export function viewTimeAgo(value: string): string {
  const mins = Math.floor((Date.now() - new Date(value).getTime()) / 60_000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีก่อน`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชม.ก่อน`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} วันก่อน`;
  return new Date(value).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function fullDateTime(value: string): string {
  return new Date(value).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function quoteViewStatus(quote: QuoteViewFields): QuoteViewStatus {
  // ใบร่างลูกค้ามองไม่เห็นเลย (listMyQuotes กรอง DRAFT ออก) จึงไม่ใช่ "ยังไม่เปิด" แต่คือ "ยังไม่ถึงมือ"
  if (quote.status === "DRAFT") {
    return { tone: "none", label: "—", hint: null, title: "ยังไม่ได้ส่งให้ลูกค้า" };
  }

  if (!quote.firstViewedAt) {
    // ส่งไปก่อนระบบเริ่มเก็บ = ไม่รู้ ไม่ใช่ "ยังไม่เปิด" (ถ้าลูกค้ากลับมาเปิดอีกก็จะมีข้อมูลเอง)
    const sentAt = new Date(quote.sentAt ?? quote.createdAt);
    if (sentAt < VIEW_TRACKING_SINCE) {
      return {
        tone: "none",
        label: "—",
        hint: null,
        title:
          "ไม่มีข้อมูล — ใบนี้ส่งก่อนที่ระบบจะเริ่มเก็บว่าลูกค้าเปิดดูเมื่อไร " +
          `(เริ่มเก็บ ${VIEW_TRACKING_SINCE.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })})`,
      };
    }
    return {
      tone: "unopened",
      label: "ยังไม่เปิด",
      hint: null,
      title: "ลูกค้ายังไม่เคยเปิดดูใบเสนอราคาฉบับนี้ในระบบ",
    };
  }

  const last = quote.lastViewedAt ?? quote.firstViewedAt;
  return {
    tone: "opened",
    label: viewTimeAgo(last),
    hint: quote.viewCount > 1 ? `เปิด ${quote.viewCount} ครั้ง` : null,
    title:
      `เปิดครั้งแรก ${fullDateTime(quote.firstViewedAt)}` +
      `\nเปิดล่าสุด ${fullDateTime(last)}` +
      (quote.viewCount > 0 ? `\nรวม ${quote.viewCount} ครั้ง` : ""),
  };
}

/** สีตัวอักษรของคอลัมน์ — "ยังไม่เปิด" คือสถานะที่ต้องสะดุดตา ที่เหลือเป็นข้อมูลเฉย ๆ */
export const QUOTE_VIEW_TONE_CLASS: Record<QuoteViewTone, string> = {
  none: "text-slate-400",
  unopened: "text-amber-700",
  opened: "text-slate-700",
};
