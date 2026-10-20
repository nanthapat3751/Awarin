// แปลงงานค้างทั้ง 12 หมวดเป็น "รายการเดียว" เรียงตามความเร่ง (หน้างานที่รอดำเนินการ แบบ A)
//
// ที่นี่เป็นที่เดียวที่ตัดสินว่าอะไรเร่งกว่าอะไร — หน้าจอแค่วาดตามลำดับที่ได้
// ระดับ: urgent = เร่ง (เงิน/ดีลกำลังหลุด) · soon = ควรทำวันนี้ (มีคนรอเราอยู่) · watch = ติดตาม (ค้างได้แต่อย่าลืม)
import type { PendingWorkDto } from "@systemboq/shared-types";

import { quoteSignal } from "./quote-signal";

export type PendingLevel = "urgent" | "soon" | "watch";

export const LEVEL_ORDER: PendingLevel[] = ["urgent", "soon", "watch"];
export const LEVEL_LABEL: Record<PendingLevel, string> = {
  urgent: "เร่ง",
  soon: "ควรทำวันนี้",
  watch: "ติดตาม",
};

export interface PendingItem {
  key: string;
  level: PendingLevel;
  /** หมวด เช่น "งวดถึงกำหนดแต่ยังไม่ได้เงิน" */
  category: string;
  /** บรรทัดหลัก — ชื่อโครงการ หรือชื่อลูกค้าที่ส่งคำขอ */
  title: string;
  /** เลขที่อ้างอิง (โครงการ · เอกสาร) หรือเบอร์โทร */
  refs: string;
  customer: string | null;
  /** ทำไมถึงขึ้นมา เช่น "เลยกำหนด 6 วัน" */
  reason: string;
  /** ยอดเงินที่เกี่ยวข้อง — null = ไม่มี/ไม่รู้ (ไม่เดา) */
  amount: number | null;
  /** ปุ่มสิ่งที่ต้องทำต่อ */
  action: string;
  href: string;
  /** อายุของเรื่อง (วัน) ใช้เรียงในระดับเดียวกัน + คอลัมน์ "รอมา" — null = เรื่องนี้ไม่มีวันเริ่มที่แน่นอน (ไม่เดา) */
  days: number | null;
  /** ลำดับของหมวดภายในระดับเดียวกัน (น้อย = ขึ้นก่อน) — เงินที่เลยกำหนดต้องมาก่อนใบเสนอราคาที่รอนาน */
  weight: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysSince(value: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / MS_PER_DAY));
}

/** ยิ่งค้างนานยิ่งเลื่อนระดับ: เกิน 14 วัน = เร่งขึ้นหนึ่งขั้น (สูงสุดถึง max) */
function agedLevel(base: PendingLevel, days: number, max: PendingLevel): PendingLevel {
  if (days <= 14) return base;
  const up = LEVEL_ORDER[Math.max(0, LEVEL_ORDER.indexOf(base) - 1)];
  return LEVEL_ORDER.indexOf(up) < LEVEL_ORDER.indexOf(max) ? max : up;
}

function ago(days: number, prefix: string): string {
  return days === 0 ? `${prefix}วันนี้` : `${prefix} ${days} วัน`;
}

export function buildPendingItems(data: PendingWorkDto, now = Date.now()): PendingItem[] {
  const items: PendingItem[] = [];

  for (const { project, quote } of data.rejectedQuotes) {
    const days = quote.respondedAt ? daysSince(quote.respondedAt, now) : 0;
    items.push({
      key: `rejected-${quote.id}`,
      level: "urgent",
      category: "ลูกค้าปฏิเสธใบเสนอราคา",
      title: project.name,
      refs: `${project.projectNo} · ${quote.quoteNo}`,
      customer: project.customer?.fullName ?? null,
      reason: quote.customerNote ? `“${quote.customerNote}”` : "ไม่ได้ระบุเหตุผล",
      amount: null,
      action: "ดูเหตุผล แล้วออกใบใหม่",
      href: `/projects/${project.id}?tab=quotes`,
      days,
      weight: 1,
    });
  }

  for (const row of data.awaitingPayment) {
    items.push({
      key: `payment-${row.installment.id}`,
      // เลยกำหนดแล้ว = เร่ง · ครบกำหนดวันนี้พอดี = ควรทำวันนี้
      level: row.daysOverdue > 0 ? "urgent" : "soon",
      category: "งวดถึงกำหนดแต่ยังไม่ได้เงิน",
      title: row.project.name,
      refs: `${row.project.projectNo} · ${row.contract.contractNo} · งวดที่ ${row.installment.seq}`,
      customer: row.project.customer?.fullName ?? null,
      reason: row.daysOverdue > 0 ? `เลยกำหนด ${row.daysOverdue} วัน` : "ครบกำหนดวันนี้",
      // ยอดที่ยังขาด ไม่ใช่ยอดเต็มของงวด (บางงวดรับมาบางส่วนแล้ว)
      amount: row.remaining,
      action: "ทวงถาม / บันทึกรับเงิน",
      href: `/projects/${row.project.id}?tab=contract&view=payments&contract=${row.contract.id}`,
      days: row.daysOverdue,
      weight: 0,
    });
  }

  for (const { project, quote } of data.awaitingResponse) {
    const days = quote.sentAt ? daysSince(quote.sentAt, now) : 0;
    const signal = quoteSignal(quote);
    items.push({
      key: `awaiting-${quote.id}`,
      // รอเกิน 14 วัน = เร่ง · เกิน 7 วัน = ควรทำวันนี้ · ใหม่กว่านั้น = ติดตาม (เกณฑ์เดียวกับป้ายสีเดิมของหน้านี้)
      level: days > 14 ? "urgent" : days > 7 ? "soon" : "watch",
      category: "ใบเสนอราคารอลูกค้าตอบ",
      title: project.name,
      refs: `${project.projectNo} · ${quote.quoteNo}`,
      customer: project.customer?.fullName ?? null,
      // headline ของสัญญาณบอกจำนวนวันที่ส่งไปอยู่แล้ว (เช่น "ส่งไป 8 วัน ยังไม่เปิดเลย") ไม่ต้องต่อซ้ำ
      reason: signal.headline,
      amount: null,
      action: "ตามลูกค้า",
      href: `/projects/${project.id}?tab=quotes`,
      days,
      weight: 4,
    });
  }

  for (const row of data.pendingApprovals) {
    const days = daysSince(row.requestedAt, now);
    items.push({
      key: `approval-${row.quote.id}`,
      level: agedLevel("soon", days, "urgent"),
      category: "ใบเสนอราคารออนุมัติก่อนส่ง",
      title: row.project.name,
      refs: `${row.project.projectNo} · ${row.quote.quoteNo}`,
      customer: null,
      reason: `เสนอโดย ${row.proposerName} · ${ago(days, "รอมา")}`,
      amount: null,
      action: "ตรวจแล้วอนุมัติ",
      href: `/projects/${row.project.id}?tab=quotes`,
      days,
      weight: 2,
    });
  }

  for (const { project, quote } of data.pendingRevisions) {
    const days = quote.respondedAt ? daysSince(quote.respondedAt, now) : 0;
    items.push({
      key: `revision-${quote.id}`,
      level: agedLevel("soon", days, "urgent"),
      category: "ลูกค้าขอแก้ใบเสนอราคา",
      title: project.name,
      refs: `${project.projectNo} · ${quote.quoteNo}`,
      customer: project.customer?.fullName ?? null,
      reason: quote.customerNote ? `“${quote.customerNote}”` : "ไม่ได้ระบุรายละเอียด",
      amount: null,
      action: "แก้แล้วออกใบใหม่",
      href: `/projects/${project.id}?tab=quotes`,
      days,
      weight: 3,
    });
  }

  for (const lead of data.newLeads) {
    const days = daysSince(lead.createdAt, now);
    items.push({
      key: `newlead-${lead.id}`,
      level: agedLevel("soon", days, "urgent"),
      category: "คำขอใหม่ยังไม่ได้ติดต่อ",
      title: lead.name,
      refs: lead.phone,
      customer: null,
      reason: `${lead.serviceType} · ${ago(days, "เข้ามา")}`,
      amount: null,
      action: "ติดต่อลูกค้า",
      href: "/leads",
      days,
      weight: 5,
    });
  }

  const NOTICE_CATEGORY: Record<string, string> = {
    PASSED: "ลูกค้าแจ้งโอน ตรวจสลิปผ่านแล้ว รอกดยืนยัน",
    MISMATCH: "ลูกค้าแจ้งโอน สลิปมีจุดไม่ตรง",
  };
  // ลูกค้าบอกว่าโอนแล้ว — ลูกค้ารอเราอยู่ และทิ้งไว้นานลูกค้าจะเห็นงวดค้างทั้งที่จ่ายแล้ว
  for (const row of data.pendingPaymentNotices ?? []) {
    const days = daysSince(row.notice.createdAt, now);
    items.push({
      key: `notice-${row.notice.id}`,
      level: agedLevel("soon", days, "urgent"),
      // ตรวจสลิปผ่าน = ไม่ต้องเปิดแอปธนาคาร แค่กดยืนยัน · ไม่ตรง = ต้องดูก่อน
      category: NOTICE_CATEGORY[row.notice.slipStatus ?? ""] ?? "ลูกค้าแจ้งโอน รอตรวจกับบัญชี",
      title: row.project.name,
      refs: `${row.project.projectNo} · ${row.contract.contractNo} · งวดที่ ${row.installment.seq}`,
      customer: row.project.customer?.fullName ?? null,
      reason: `แจ้งว่าโอนวันที่ ${new Date(`${row.notice.paidOn}T00:00:00Z`).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })} · ${ago(days, "แจ้งมา")}`,
      amount: Number(row.notice.amount),
      action: row.notice.slipStatus === "PASSED" ? "ยืนยันรับเงิน" : "ตรวจสลิป",
      href: `/projects/${row.project.id}?tab=contract&view=payments&contract=${row.contract.id}`,
      days,
      weight: 1,
    });
  }

  for (const row of data.awaitingChangeOrders) {
    const days = row.changeOrder.sentAt ? daysSince(row.changeOrder.sentAt, now) : 0;
    items.push({
      key: `vo-${row.changeOrder.id}`,
      level: agedLevel("watch", days, "soon"),
      category: "ใบงานเพิ่ม-ลดรอลูกค้าอนุมัติ",
      title: row.project.name,
      refs: `${row.project.projectNo} · ${row.changeOrder.docNo}`,
      customer: row.project.customer?.fullName ?? null,
      reason: `${row.changeOrder.title} · ${ago(days, "ส่งไป")}`,
      amount: Number(row.changeOrder.totalAmount),
      action: "ตามให้อนุมัติ",
      href: `/projects/${row.project.id}?tab=contract&view=changes`,
      days,
      weight: 6,
    });
  }

  for (const row of data.unsignedContracts) {
    const days = daysSince(row.contracts[0].createdAt, now);
    const amounts = row.contracts.map((c) => c.amount).filter((a): a is string => a != null);
    items.push({
      key: `unsigned-${row.project.id}`,
      level: agedLevel("watch", days, "soon"),
      category: "สัญญายังไม่ลงนาม",
      title: row.project.name,
      refs: `${row.project.projectNo} · ${row.contracts.map((c) => c.contractNo).join(", ")}`,
      customer: row.project.customer?.fullName ?? null,
      reason:
        row.contracts.length > 1
          ? `ออกค้างไว้ ${row.contracts.length} ฉบับ · ${ago(days, "ออกมา")}`
          : ago(days, "ออกมา"),
      // หลายฉบับยอดเท่ากัน (ตัวเลือกของงานเดียวกัน) ใช้ฉบับสูงสุดฉบับเดียว ไม่บวกกัน · สัญญาเก่าไม่มียอด = null
      amount: amounts.length > 0 ? Math.max(...amounts.map(Number)) : null,
      action: row.contracts.length > 1 ? "เลือกฉบับแล้วลงนาม" : "ตามให้ลงนาม",
      href: `/projects/${row.project.id}?tab=contract&view=documents`,
      days,
      weight: 7,
    });
  }

  for (const row of data.missingDueDates) {
    items.push({
      key: `duedate-${row.contract.id}`,
      level: "watch",
      category: "งวดยังไม่ได้ตั้งวันครบกำหนด",
      title: row.project.name,
      refs: `${row.project.projectNo} · ${row.contract.contractNo}`,
      customer: row.project.customer?.fullName ?? null,
      reason: `${row.missingCount} จาก ${row.installmentCount} งวดยังไม่มีวัน — ระบบจะเตือนไม่ได้`,
      amount: row.remaining,
      action: "ตั้งวันครบกำหนด",
      href: `/projects/${row.project.id}?tab=contract&view=payments&contract=${row.contract.id}`,
      days: null,
      weight: 9,
    });
  }

  for (const row of data.contactedLeads) {
    const days = daysSince(row.lastActivityAt, now);
    items.push({
      key: `contacted-${row.lead.id}`,
      level: agedLevel("watch", days, "soon"),
      category: "ติดต่อแล้วแต่ยังไม่เสนอราคา",
      title: row.lead.name,
      refs: row.project ? `${row.lead.phone} · ${row.project.projectNo}` : row.lead.phone,
      customer: null,
      reason: `${row.project ? "มีโครงการร่างแล้ว" : "ยังไม่ได้สร้างโครงการ"} · ${ago(days, "เงียบมา")}`,
      amount: null,
      action: row.project ? "ทำใบเสนอราคา" : "สร้างโครงการ",
      href: row.project ? `/projects/${row.project.id}` : "/leads",
      days,
      weight: 8,
    });
  }

  // บันทึกรับเงินแล้วแต่ยังไม่มีใครตรวจกับบัญชีธนาคาร — ออกใบเสร็จไม่ได้ ลูกค้ายังไม่เห็น
  // ค้างเกิน 3 วัน = เร่ง (ยิ่งนานยิ่งจำไม่ได้ว่าเงินก้อนไหนเข้าวันไหน)
  for (const row of data.unverifiedPayments ?? []) {
    const days = daysSince(row.payment.createdAt, now);
    items.push({
      key: `verify-${row.payment.id}`,
      level: days > 3 ? "urgent" : "soon",
      category: "รับเงินรอยืนยันกับบัญชี",
      title: row.project.name,
      refs: `${row.project.projectNo} · ${row.contract.contractNo} · งวดที่ ${row.installment.seq}`,
      customer: row.project.customer?.fullName ?? null,
      reason: `${row.payment.recordedByName ? `${row.payment.recordedByName} บันทึก` : "บันทึก"} · ${ago(days, "รอมา")}`,
      amount: Number(row.payment.amount),
      action: "ตรวจกับบัญชี",
      href: `/projects/${row.project.id}?tab=contract`,
      days,
      weight: 2,
    });
  }

  // จ่ายออกมากกว่าเงินที่ลูกค้าจ่ายเข้า (รวม VAT) — เงินบริษัทจมอยู่ในงานนี้ ควรเร่งเก็บงวดถัดไป
  // งวดที่เลยกำหนดแล้วขึ้นหมวด "งวดถึงกำหนด" ของมันเองอยู่แล้ว ที่นี่บอกภาพรวมของโครงการ
  for (const row of data.cashShortfall ?? []) {
    const next = row.nextInstallment;
    items.push({
      key: `cash-${row.project.id}`,
      level: "soon",
      category: "ออกเงินแทนลูกค้า",
      title: row.project.name,
      refs: row.project.projectNo,
      customer: row.project.customer?.fullName ?? null,
      reason: next
        ? `งวดที่ ${next.seq} ยังค้าง ${next.outstanding.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท${next.dueOn ? "" : " (ยังไม่ได้ตั้งวันครบกำหนด)"}`
        : "เก็บครบทุกงวดแล้ว — ตรวจบิลที่บันทึก",
      amount: -row.net,
      action: "ดูเงินสดโครงการ",
      href: `/projects/${row.project.id}?tab=costs&cost=cash`,
      days: null,
      weight: 3,
    });
  }

  // ราคาในคลังขึ้นหลังเซ็นสัญญา และยังไม่ได้กดซื้อแล้ว/ล็อกราคาแล้ว — ติดตาม (ยังไม่ใช่เงินที่เสียไป)
  for (const row of data.priceDriftSigned ?? []) {
    items.push({
      key: `drift-${row.project.id}`,
      level: "watch",
      category: "ราคาวัสดุขึ้นหลังเซ็นสัญญา",
      title: row.project.name,
      refs: `${row.project.projectNo} · ${row.contract.contractNo}`,
      customer: row.project.customer?.fullName ?? null,
      reason: `${row.lineCount} รายการแพงขึ้น — ซื้อหรือล็อกราคาก่อนขึ้นอีก`,
      amount: row.increase,
      action: "ดูรายการ",
      href: `/projects/${row.project.id}?tab=costs`,
      days: null,
      weight: 7,
    });
  }

  return items.sort(
    (a, b) =>
      LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) ||
      a.weight - b.weight ||
      (b.days ?? -1) - (a.days ?? -1) ||
      (b.amount ?? 0) - (a.amount ?? 0),
  );
}
