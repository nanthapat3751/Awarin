// แปลงงานค้าง + กระดานเงิน เป็น "สิ่งที่ต้องทำ" เรียงตามความเร่งด่วน
//
// แดชบอร์ดเดิมบอกว่าเกิดอะไรขึ้นแล้ว (ตัวเลขสรุป) แต่ไม่ได้บอกว่าต้องลงมือตรงไหน
// ที่นี่คือที่เดียวที่ตัดสินว่าอะไรเร่งกว่าอะไร ฝั่ง UI แค่วาดตามลำดับที่ได้
import type { DashboardCashDto, PendingWorkDto } from "@systemboq/shared-types";

import { quoteSignal, type SignalLevel } from "./quote-signal";

export type ActionLevel = SignalLevel;

export interface DashboardAction {
  key: string;
  level: ActionLevel;
  /** สิ่งที่เกิดขึ้น */
  headline: string;
  /** สิ่งที่ควรทำต่อ */
  action: string;
  href: string;
  /** จำนวนเงินที่เกี่ยวข้อง (ถ้ามี) — ใช้เรียงงานที่เร่งเท่ากันให้ก้อนใหญ่ขึ้นก่อน */
  amount?: number;
}

const LEVEL_ORDER: Record<ActionLevel, number> = {
  urgent: 0,
  opportunity: 1,
  watch: 2,
  unknown: 3,
  calm: 4,
};

const daysSince = (value: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));

/**
 * ใบที่รออนุมัติ — ขึ้นเฉพาะคนที่อนุมัติได้ (OWNER) เพราะรายการนี้คือ "สิ่งที่คุณต้องลงมือ"
 * ADMIN ทำอะไรกับมันไม่ได้ ใส่ไว้ก็เป็นแค่เสียงรบกวน · รอเกิน 1 วันถือว่าเร่ง (ลูกค้ารอราคาอยู่)
 */
function approvalActions(pendingWork: PendingWorkDto): DashboardAction[] {
  return (pendingWork.pendingApprovals ?? []).map((row) => {
    const days = daysSince(row.requestedAt);
    return {
      key: `approval-${row.quote.id}`,
      level: days >= 1 ? ("urgent" as const) : ("opportunity" as const),
      headline: `${row.project.name} — ${row.proposerName} ขออนุมัติใบเสนอราคา${waitedNote(days)}`,
      action: "ตรวจแล้วอนุมัติ หรือส่งกลับให้แก้",
      href: `/projects/${row.project.id}?tab=quotes`,
    };
  });
}

function quoteActions(pendingWork: PendingWorkDto): DashboardAction[] {
  const revisions = pendingWork.pendingRevisions.map((row) => ({
    key: `revision-${row.quote.id}`,
    level: "urgent" as const,
    headline: `${row.project.name} — ลูกค้าขอให้แก้ใบเสนอราคา`,
    action: "แก้ราคาแล้วออกใบใหม่ส่งกลับไป",
    href: `/projects/${row.project.id}?tab=quotes`,
  }));

  // ใบที่ส่งไปแล้วยังไม่ตอบ — ระดับความเร่งมาจากพฤติกรรมการเปิดดูของลูกค้า (ใช้ตัวเดียวกับหน้างานค้าง)
  const awaiting = pendingWork.awaitingResponse.map((row) => {
    const signal = quoteSignal(row.quote);
    return {
      key: `awaiting-${row.quote.id}`,
      level: signal.level,
      headline: `${row.project.name} — ${signal.headline}`,
      action: signal.action,
      href: `/projects/${row.project.id}?tab=quotes`,
    };
  });

  const rejected = pendingWork.rejectedQuotes.map((row) => ({
    key: `rejected-${row.quote.id}`,
    level: "watch" as const,
    headline: `${row.project.name} — ลูกค้าปฏิเสธใบเสนอราคา`,
    action: "ตัดสินใจว่าจะเสนอราคาใหม่หรือปิดดีลนี้",
    href: `/projects/${row.project.id}?tab=quotes`,
  }));

  return [...revisions, ...awaiting, ...rejected];
}

function moneyActions(pendingWork: PendingWorkDto, cash: DashboardCashDto | null): DashboardAction[] {
  const overdue = pendingWork.awaitingPayment.map((row) => ({
    key: `payment-${row.installment.id}`,
    level: (row.daysOverdue > 0 ? "urgent" : "watch") as ActionLevel,
    headline:
      row.daysOverdue > 0
        ? `${row.project.name} — งวด ${row.installment.seq} เลยกำหนด ${row.daysOverdue} วัน`
        : `${row.project.name} — งวด ${row.installment.seq} ครบกำหนดวันนี้`,
    action: "ทวงถามแล้วบันทึกเมื่อได้รับเงิน",
    href: `/projects/${row.project.id}?tab=contract&view=payments&contract=${row.contract.id}`,
    amount: row.remaining,
  }));

  if (!cash) return overdue;

  // สัญญาที่ออกแล้วยังไม่ลงนาม = ยังรับเงินไม่ได้เลย (ระบบล็อกไว้) จึงเป็นงานที่ต้องตาม
  //
  // โครงการหนึ่งออกสัญญาค้างไว้ได้หลายฉบับ ยอดเท่ากันหมด ต่างกันแค่ฉบับไหนถูกเซ็น (ดูโมดูลรับเงิน)
  // ถ้าแตกเป็นแถวละฉบับ งานเดียวจะกินรายการทั้งหน้าและยอดเงินจะดูเหมือนคูณจำนวนฉบับ
  // จึงยุบเป็นโครงการละแถว และใช้ยอดสูงสุดฉบับเดียว ไม่บวกกัน
  const unsignedByProject = new Map<string, { projectName: string; contractNos: string[]; amount: number }>();
  for (const c of cash.unsignedContracts) {
    const found = unsignedByProject.get(c.projectId) ?? { projectName: c.projectName, contractNos: [], amount: 0 };
    found.contractNos.push(c.contractNo);
    found.amount = Math.max(found.amount, c.amount ?? 0);
    unsignedByProject.set(c.projectId, found);
  }
  const unsigned = [...unsignedByProject.entries()].map(([projectId, group]) => ({
    key: `unsigned-${projectId}`,
    level: "watch" as const,
    headline:
      group.contractNos.length === 1
        ? `${group.projectName} — สัญญา ${group.contractNos[0]} ยังไม่ลงนาม`
        : `${group.projectName} — สัญญา ${group.contractNos.length} ฉบับยังไม่ลงนาม`,
    action:
      group.contractNos.length === 1
        ? "ตามให้ลงนาม แล้วบันทึกวันที่ลงนาม จึงจะเริ่มรับเงินได้"
        : `เลือกฉบับที่จะใช้จริงแล้วลงนาม (${group.contractNos.join(" · ")})`,
    href: `/projects/${projectId}?tab=contract&view=documents`,
    amount: group.amount || undefined,
  }));

  // งวดที่ไม่มีวันครบกำหนด = ระบบเตือนค้างชำระให้ไม่ได้เลย เป็นงานตั้งค่าที่ต้องเคลียร์ครั้งเดียว
  const noDueDate = cash.rows
    .filter((row) => row.installmentsWithoutDueDate > 0)
    .map((row) => ({
      key: `duedate-${row.contract.id}`,
      level: "watch" as const,
      headline: `${row.project.name} — ${row.installmentsWithoutDueDate} งวดยังไม่ได้ตั้งวันครบกำหนด`,
      action: "ตั้งวันครบกำหนด ระบบจะได้เตือนเมื่อถึงงวด",
      href: `/projects/${row.project.id}?tab=contract&view=payments&contract=${row.contract.id}`,
      amount: row.remaining,
    }));

  return [...overdue, ...unsigned, ...noDueDate];
}

function leadActions(pendingWork: PendingWorkDto): DashboardAction[] {
  return pendingWork.newLeads.map((lead) => ({
    key: `lead-${lead.id}`,
    level: (daysSince(lead.createdAt) >= 1 ? "urgent" : "opportunity") as ActionLevel,
    headline: `คำขอใหม่จาก ${lead.name} — ${leadAge(daysSince(lead.createdAt))}`,
    action: "ติดต่อกลับแล้วเปลี่ยนสถานะคำขอ",
    href: "/leads",
  }));
}

/** รวมทุกแหล่งแล้วเรียง: เร่งสุดขึ้นก่อน เท่ากันให้ก้อนเงินใหญ่กว่าขึ้นก่อน */
export function dashboardActions(
  pendingWork: PendingWorkDto,
  cash: DashboardCashDto | null,
  opts: { canApprove?: boolean } = {},
): DashboardAction[] {
  return [
    ...(opts.canApprove ? approvalActions(pendingWork) : []),
    ...quoteActions(pendingWork),
    ...moneyActions(pendingWork, cash),
    ...leadActions(pendingWork),
  ].sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || (b.amount ?? 0) - (a.amount ?? 0),
  );
}

function waitedNote(days: number) {
  return days >= 1 ? ` (รอมา ${days} วัน)` : "";
}

function leadAge(days: number) {
  return days >= 1 ? `รอมา ${days} วัน` : "เข้ามาวันนี้";
}
