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

type Rows<K extends keyof PendingWorkDto> = NonNullable<PendingWorkDto[K]>;

function rejectedItems(rows: Rows<"rejectedQuotes">, now: number): PendingItem[] {
  return rows.map(({ project, quote }) => ({
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
    days: quote.respondedAt ? daysSince(quote.respondedAt, now) : 0,
    weight: 1,
  }));
}

function paymentItems(rows: Rows<"awaitingPayment">): PendingItem[] {
  return rows.map((row) => ({
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
  }));
}

/** รอเกิน 14 วัน = เร่ง · เกิน 7 วัน = ควรทำวันนี้ · ใหม่กว่านั้น = ติดตาม (เกณฑ์เดียวกับป้ายสีเดิมของหน้านี้) */
function awaitingLevel(days: number): PendingLevel {
  if (days > 14) return "urgent";
  return days > 7 ? "soon" : "watch";
}

function awaitingResponseItems(rows: Rows<"awaitingResponse">, now: number): PendingItem[] {
  return rows.map(({ project, quote }) => {
    const days = quote.sentAt ? daysSince(quote.sentAt, now) : 0;
    return {
      key: `awaiting-${quote.id}`,
      level: awaitingLevel(days),
      category: "ใบเสนอราคารอลูกค้าตอบ",
      title: project.name,
      refs: `${project.projectNo} · ${quote.quoteNo}`,
      customer: project.customer?.fullName ?? null,
      // headline ของสัญญาณบอกจำนวนวันที่ส่งไปอยู่แล้ว (เช่น "ส่งไป 8 วัน ยังไม่เปิดเลย") ไม่ต้องต่อซ้ำ
      reason: quoteSignal(quote).headline,
      amount: null,
      action: "ตามลูกค้า",
      href: `/projects/${project.id}?tab=quotes`,
      days,
      weight: 4,
    };
  });
}

function approvalItems(rows: Rows<"pendingApprovals">, now: number): PendingItem[] {
  return rows.map((row) => {
    const days = daysSince(row.requestedAt, now);
    return {
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
    };
  });
}

function revisionItems(rows: Rows<"pendingRevisions">, now: number): PendingItem[] {
  return rows.map(({ project, quote }) => {
    const days = quote.respondedAt ? daysSince(quote.respondedAt, now) : 0;
    return {
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
    };
  });
}

function newLeadItems(rows: Rows<"newLeads">, now: number): PendingItem[] {
  return rows.map((lead) => {
    const days = daysSince(lead.createdAt, now);
    return {
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
    };
  });
}

const NOTICE_CATEGORY: Record<string, string> = {
  PASSED: "ลูกค้าแจ้งโอน ตรวจสลิปผ่านแล้ว รอกดยืนยัน",
  MISMATCH: "ลูกค้าแจ้งโอน สลิปมีจุดไม่ตรง",
};

/** ลูกค้าบอกว่าโอนแล้ว — ลูกค้ารอเราอยู่ และทิ้งไว้นานลูกค้าจะเห็นงวดค้างทั้งที่จ่ายแล้ว */
function paymentNoticeItems(rows: Rows<"pendingPaymentNotices">, now: number): PendingItem[] {
  return rows.map((row) => {
    const days = daysSince(row.notice.createdAt, now);
    const paidOn = new Date(`${row.notice.paidOn}T00:00:00Z`).toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    return {
      key: `notice-${row.notice.id}`,
      level: agedLevel("soon", days, "urgent"),
      // ตรวจสลิปผ่าน = ไม่ต้องเปิดแอปธนาคาร แค่กดยืนยัน · ไม่ตรง = ต้องดูก่อน
      category: NOTICE_CATEGORY[row.notice.slipStatus ?? ""] ?? "ลูกค้าแจ้งโอน รอตรวจกับบัญชี",
      title: row.project.name,
      refs: `${row.project.projectNo} · ${row.contract.contractNo} · งวดที่ ${row.installment.seq}`,
      customer: row.project.customer?.fullName ?? null,
      reason: `แจ้งว่าโอนวันที่ ${paidOn} · ${ago(days, "แจ้งมา")}`,
      amount: Number(row.notice.amount),
      action: row.notice.slipStatus === "PASSED" ? "ยืนยันรับเงิน" : "ตรวจสลิป",
      href: `/projects/${row.project.id}?tab=contract&view=payments&contract=${row.contract.id}`,
      days,
      weight: 1,
    };
  });
}

function changeOrderItems(rows: Rows<"awaitingChangeOrders">, now: number): PendingItem[] {
  return rows.map((row) => {
    const days = row.changeOrder.sentAt ? daysSince(row.changeOrder.sentAt, now) : 0;
    return {
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
    };
  });
}

function unsignedContractItems(rows: Rows<"unsignedContracts">, now: number): PendingItem[] {
  return rows.map((row) => {
    const days = daysSince(row.contracts[0].createdAt, now);
    const amounts = row.contracts.map((c) => c.amount).filter((a): a is string => a != null);
    const several = row.contracts.length > 1;
    return {
      key: `unsigned-${row.project.id}`,
      level: agedLevel("watch", days, "soon"),
      category: "สัญญายังไม่ลงนาม",
      title: row.project.name,
      refs: `${row.project.projectNo} · ${row.contracts.map((c) => c.contractNo).join(", ")}`,
      customer: row.project.customer?.fullName ?? null,
      reason: several ? `ออกค้างไว้ ${row.contracts.length} ฉบับ · ${ago(days, "ออกมา")}` : ago(days, "ออกมา"),
      // หลายฉบับยอดเท่ากัน (ตัวเลือกของงานเดียวกัน) ใช้ฉบับสูงสุดฉบับเดียว ไม่บวกกัน · สัญญาเก่าไม่มียอด = null
      amount: amounts.length > 0 ? Math.max(...amounts.map(Number)) : null,
      action: several ? "เลือกฉบับแล้วลงนาม" : "ตามให้ลงนาม",
      href: `/projects/${row.project.id}?tab=contract&view=documents`,
      days,
      weight: 7,
    };
  });
}

function missingDueDateItems(rows: Rows<"missingDueDates">): PendingItem[] {
  return rows.map((row) => ({
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
  }));
}

function contactedLeadItems(rows: Rows<"contactedLeads">, now: number): PendingItem[] {
  return rows.map((row) => {
    const days = daysSince(row.lastActivityAt, now);
    const project = row.project;
    return {
      key: `contacted-${row.lead.id}`,
      level: agedLevel("watch", days, "soon"),
      category: "ติดต่อแล้วแต่ยังไม่เสนอราคา",
      title: row.lead.name,
      refs: project ? `${row.lead.phone} · ${project.projectNo}` : row.lead.phone,
      customer: null,
      reason: `${project ? "มีโครงการร่างแล้ว" : "ยังไม่ได้สร้างโครงการ"} · ${ago(days, "เงียบมา")}`,
      amount: null,
      action: project ? "ทำใบเสนอราคา" : "สร้างโครงการ",
      href: project ? `/projects/${project.id}` : "/leads",
      days,
      weight: 8,
    };
  });
}

/**
 * บันทึกรับเงินแล้วแต่ยังไม่มีใครตรวจกับบัญชีธนาคาร — ออกใบเสร็จไม่ได้ ลูกค้ายังไม่เห็น
 * ค้างเกิน 3 วัน = เร่ง (ยิ่งนานยิ่งจำไม่ได้ว่าเงินก้อนไหนเข้าวันไหน)
 */
function unverifiedPaymentItems(rows: Rows<"unverifiedPayments">, now: number): PendingItem[] {
  return rows.map((row) => {
    const days = daysSince(row.payment.createdAt, now);
    const recorded = row.payment.recordedByName ? `${row.payment.recordedByName} บันทึก` : "บันทึก";
    return {
      key: `verify-${row.payment.id}`,
      level: days > 3 ? "urgent" : "soon",
      category: "รับเงินรอยืนยันกับบัญชี",
      title: row.project.name,
      refs: `${row.project.projectNo} · ${row.contract.contractNo} · งวดที่ ${row.installment.seq}`,
      customer: row.project.customer?.fullName ?? null,
      reason: `${recorded} · ${ago(days, "รอมา")}`,
      amount: Number(row.payment.amount),
      action: "ตรวจกับบัญชี",
      href: `/projects/${row.project.id}?tab=contract`,
      days,
      weight: 2,
    };
  });
}

/** งวดถัดไปที่ต้องเร่งเก็บ (ไม่มี = เก็บครบแล้ว ให้ไปตรวจบิล) */
function cashShortfallReason(next: Rows<"cashShortfall">[number]["nextInstallment"]) {
  if (!next) return "เก็บครบทุกงวดแล้ว — ตรวจบิลที่บันทึก";
  const outstanding = next.outstanding.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  const noDue = next.dueOn ? "" : " (ยังไม่ได้ตั้งวันครบกำหนด)";
  return `งวดที่ ${next.seq} ยังค้าง ${outstanding} บาท${noDue}`;
}

/**
 * จ่ายออกมากกว่าเงินที่ลูกค้าจ่ายเข้า (รวม VAT) — เงินบริษัทจมอยู่ในงานนี้ ควรเร่งเก็บงวดถัดไป
 * งวดที่เลยกำหนดแล้วขึ้นหมวด "งวดถึงกำหนด" ของมันเองอยู่แล้ว ที่นี่บอกภาพรวมของโครงการ
 */
function cashShortfallItems(rows: Rows<"cashShortfall">): PendingItem[] {
  return rows.map((row) => ({
    key: `cash-${row.project.id}`,
    level: "soon",
    category: "ออกเงินแทนลูกค้า",
    title: row.project.name,
    refs: row.project.projectNo,
    customer: row.project.customer?.fullName ?? null,
    reason: cashShortfallReason(row.nextInstallment),
    amount: -row.net,
    action: "ดูเงินสดโครงการ",
    href: `/projects/${row.project.id}?tab=costs&cost=cash`,
    days: null,
    weight: 3,
  }));
}

/** ราคาในคลังขึ้นหลังเซ็นสัญญา และยังไม่ได้กดซื้อแล้ว/ล็อกราคาแล้ว — ติดตาม (ยังไม่ใช่เงินที่เสียไป) */
function priceDriftItems(rows: Rows<"priceDriftSigned">): PendingItem[] {
  return rows.map((row) => ({
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
  }));
}

export function buildPendingItems(data: PendingWorkDto, now = Date.now()): PendingItem[] {
  const items: PendingItem[] = [
    ...rejectedItems(data.rejectedQuotes, now),
    ...paymentItems(data.awaitingPayment),
    ...awaitingResponseItems(data.awaitingResponse, now),
    ...approvalItems(data.pendingApprovals, now),
    ...revisionItems(data.pendingRevisions, now),
    ...newLeadItems(data.newLeads, now),
    ...paymentNoticeItems(data.pendingPaymentNotices ?? [], now),
    ...changeOrderItems(data.awaitingChangeOrders, now),
    ...unsignedContractItems(data.unsignedContracts, now),
    ...missingDueDateItems(data.missingDueDates),
    ...contactedLeadItems(data.contactedLeads, now),
    ...unverifiedPaymentItems(data.unverifiedPayments ?? [], now),
    ...cashShortfallItems(data.cashShortfall ?? []),
    ...priceDriftItems(data.priceDriftSigned ?? []),
  ];
  return items.sort(
    (a, b) =>
      LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) ||
      a.weight - b.weight ||
      (b.days ?? -1) - (a.days ?? -1) ||
      (b.amount ?? 0) - (a.amount ?? 0),
  );
}
