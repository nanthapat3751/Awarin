import { writeAuditLog } from "./audit-log";
import { syncLeadStatusForProject } from "../modules/leads/leads.service";
import { prisma } from "./prisma";
import {
  assertValidProjectTransition,
  InvalidTransitionError,
  type ProjectStatus,
} from "./project-state-machine";

/**
 * ผลลัพธ์ของใบเสนอราคาที่ควรดันสถานะโปรเจกต์ตามไปด้วย
 *
 * REVISED ไม่อยู่ในนี้โดยตั้งใจ — ลูกค้าขอปรับแก้แปลว่าดีลยังเดินอยู่ โปรเจกต์ยังเป็น "เสนอราคา"
 * เหมือนเดิม (งานที่ต้องทำต่อไปโผล่ในหน้า "งานที่รอดำเนินการ" หมวดขอแก้ไขอยู่แล้ว)
 */
export type QuoteOutcome = "ACCEPTED" | "REJECTED";

const OUTCOME_TARGET: Record<QuoteOutcome, ProjectStatus> = {
  ACCEPTED: "APPROVED",
  REJECTED: "REJECTED",
};

// สถานะของคำขอ (lead) ที่ควรวิ่งตามผลใบเสนอราคา
const OUTCOME_LEAD_STATUS = { ACCEPTED: "CLOSED", REJECTED: "REJECTED" } as const;

/**
 * ดันสถานะโปรเจกต์ตามผลของใบเสนอราคา — ใช้ร่วมกันทั้งตอนลูกค้ากดตอบเองในพอร์ทัล
 * (myQuotes.service) และตอนพนักงานบันทึกคำตอบให้ที่หน้าโครงการ (quotes.service)
 *
 * ทำไมต้องรวมไว้ที่เดียว: เดิมมีแค่ทางฝั่งลูกค้าที่ดันโปรเจกต์เป็น "อนุมัติแล้ว" ส่วนพนักงานที่กด
 * "บันทึกว่าลูกค้ายอมรับ" เอง โปรเจกต์ไม่ขยับเลย ทั้งที่การ์ดขั้นตอนถัดไปเขียนไว้ว่าบันทึกเองก็ได้
 * และไม่มีทางไหนเลยที่จัดการกรณี "ลูกค้าปฏิเสธ" — โปรเจกต์จึงค้างที่ "เสนอราคา" ตลอดไป
 * ทำให้การ์ดบอกว่ายังรอลูกค้าตอบ ทั้งที่ตอบไปแล้ว และมูลค่าดีลที่เสียไปยังถูกนับเป็นไปป์ไลน์
 *
 * ถ้าโปรเจกต์อยู่สถานะที่ไปต่อไม่ได้ (ยกเลิก/ปิดงานไปแล้ว) จะข้ามเงียบ ๆ — การบันทึกคำตอบของ
 * ลูกค้าไม่ควรล้มเพราะโปรเจกต์ถูกปิดไปก่อน
 */
export async function applyQuoteOutcomeToProject(
  projectId: string,
  outcome: QuoteOutcome,
  actorId: string,
): Promise<void> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const from = project.status as ProjectStatus;
  const to = OUTCOME_TARGET[outcome];

  if (from !== to) {
    try {
      assertValidProjectTransition(from, to, {
        hasAcceptedQuote: outcome === "ACCEPTED",
        hasRejectedQuote: outcome === "REJECTED",
      });
      await prisma.project.update({ where: { id: projectId }, data: { status: to } });
      await writeAuditLog({
        userId: actorId,
        action: "TRANSITION_PROJECT",
        entityType: "Project",
        entityId: projectId,
        details: { from, to, reason: `quote ${outcome.toLowerCase()}` },
      });
    } catch (err) {
      if (!(err instanceof InvalidTransitionError)) {
        throw err;
      }
    }
  }

  await syncLeadStatusForProject(projectId, OUTCOME_LEAD_STATUS[outcome]);
}
