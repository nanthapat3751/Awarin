// "วันนี้ควรโทรหาใครก่อน" — แปลพฤติกรรมการเปิดดูของลูกค้าเป็นสิ่งที่ควรทำ
//
// ตัวเลข "รอมาแล้ว 5 วัน" อย่างเดียวตัดสินใจไม่ได้ เพราะ 5 วันที่ลูกค้ายังไม่เปิดอ่านเลย
// (ลิงก์ไม่ถึงมือ? ส่งผิดอีเมล?) กับ 5 วันที่เปิดอ่านไปแล้ว 6 ครั้ง (กำลังชั่งใจ/เทียบราคา)
// เป็นคนละสถานการณ์ที่ต้องทำคนละอย่าง

import type { QuoteDto } from "@systemboq/shared-types";

import { VIEW_TRACKING_SINCE, viewTimeAgo } from "./quote-view";

/** เรียงจากเร่งสุดไปหาไม่เร่ง — ใช้เป็นลำดับของแถวในหน้างานค้างด้วย */
export type SignalLevel = "urgent" | "opportunity" | "watch" | "calm" | "unknown";

export interface QuoteSignal {
  level: SignalLevel;
  /** สิ่งที่เกิดขึ้น (สั้น) */
  headline: string;
  /** สิ่งที่ควรทำ */
  action: string;
}

const DAY_MS = 86_400_000;

const daysSince = (value: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / DAY_MS));

/** ส่งไปแล้วเกินกี่วันถึงจะถือว่า "ควรตามแล้ว" ถ้าลูกค้ายังไม่เปิดอ่านเลย */
const SILENT_DAYS = 3;
/** เปิดกี่ครั้งขึ้นไปถึงจะถือว่ากำลังชั่งใจอยู่จริง (ไม่ใช่เปิดผ่าน ๆ) */
const INTERESTED_VIEWS = 3;
/** เปิดครั้งสุดท้ายนานกี่วันถึงจะถือว่าเงียบไปแล้ว */
const GONE_QUIET_DAYS = 7;

// "unknown" ต้องอยู่เหนือ "calm" -- ใบที่ไม่รู้ว่าลูกค้าเปิดหรือยังแต่รอมา 5 วันแล้ว ต้องการ
// การตามมากกว่าใบที่เพิ่งส่งวันนี้ ถ้าเรียง unknown ไว้ล่างสุดจะกลับหัวกลับหาง
export const SIGNAL_ORDER: Record<SignalLevel, number> = {
  urgent: 0,
  opportunity: 1,
  watch: 2,
  unknown: 3,
  calm: 4,
};

export const SIGNAL_CLASS: Record<SignalLevel, string> = {
  urgent: "text-red-700",
  opportunity: "text-emerald-700",
  watch: "text-amber-700",
  unknown: "text-slate-600",
  calm: "text-slate-500",
};

type SignalFields = Pick<
  QuoteDto,
  "status" | "sentAt" | "createdAt" | "firstViewedAt" | "lastViewedAt" | "viewCount"
>;

export function quoteSignal(quote: SignalFields): QuoteSignal {
  const sentAt = quote.sentAt ?? quote.createdAt;
  const waited = daysSince(sentAt);

  // ส่งก่อนระบบเริ่มเก็บข้อมูลการเปิดดู = ไม่รู้ว่าลูกค้าอ่านหรือยัง จะสรุปว่าอะไรไม่ได้เลย
  // แต่ยังบอกได้ว่ารอมานานแค่ไหน -- ใบที่รอนานพอควรต้องไม่ตกไปอยู่ท้ายแถวเหมือนใบที่เพิ่งส่ง
  if (!quote.firstViewedAt && new Date(sentAt) < VIEW_TRACKING_SINCE) {
    if (waited >= SILENT_DAYS) {
      return {
        level: "unknown",
        headline: `รอมา ${waited} วัน · ไม่มีข้อมูลการเปิดดู`,
        action: "ใบนี้ส่งก่อนระบบเริ่มเก็บ — ต้องโทรถามเองว่าได้รับหรือยัง",
      };
    }
    return {
      level: "calm",
      headline: "ไม่มีข้อมูลการเปิดดู",
      action: `ส่งไป ${waited} วัน — ใบนี้ส่งก่อนระบบเริ่มเก็บ ยังไม่ต้องตาม`,
    };
  }

  if (!quote.firstViewedAt) {
    if (waited >= SILENT_DAYS) {
      return {
        level: "urgent",
        headline: `ส่งไป ${waited} วัน ยังไม่เปิดเลย`,
        action: "เช็คว่าลิงก์ถึงมือลูกค้าจริงไหม (อีเมลถูกตัว? เข้าถังสแปม?)",
      };
    }
    return {
      level: "calm",
      headline: waited === 0 ? "เพิ่งส่งวันนี้" : `ส่งไป ${waited} วัน ยังไม่เปิด`,
      action: "ยังไม่ต้องตาม รออีกสักหน่อย",
    };
  }

  const lastViewed = quote.lastViewedAt ?? quote.firstViewedAt;
  const sinceLastView = daysSince(lastViewed);

  if (quote.viewCount >= INTERESTED_VIEWS && sinceLastView <= SILENT_DAYS) {
    return {
      level: "opportunity",
      headline: `เปิดดู ${quote.viewCount} ครั้ง ล่าสุด ${viewTimeAgo(lastViewed)}`,
      action: "กำลังชั่งใจอยู่ — จังหวะดีที่จะโทรปิดการขาย",
    };
  }

  if (sinceLastView >= GONE_QUIET_DAYS) {
    return {
      level: "watch",
      headline: `เปิดครั้งสุดท้าย ${sinceLastView} วันก่อนแล้วเงียบ`,
      action: "อาจกำลังเทียบราคาที่อื่น — ลองโทรถามว่าติดตรงไหน",
    };
  }

  return {
    level: "watch",
    headline: `เปิดแล้ว ล่าสุด ${viewTimeAgo(lastViewed)}`,
    action: "อ่านแล้วแต่ยังไม่ตอบ — รอได้อีกสองสามวัน",
  };
}
