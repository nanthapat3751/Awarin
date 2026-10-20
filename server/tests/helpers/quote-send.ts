import type { Test } from "supertest";

import { prisma } from "../../src/lib/prisma";

/**
 * ตั้งแต่มีขั้นอนุมัติ ใบเสนอราคาต้องมีผู้อนุมัติก่อนถึงจะส่งได้ — เทสต์ของฟีเจอร์อื่น (ส่วนลด สัญญา
 * แดชบอร์ด ฯลฯ) แค่ต้องการ "ใบที่ส่งแล้ว" เป็นฉากตั้งต้น จึงใส่คนเซ็นให้ตรง ๆ แล้วส่งผ่าน endpoint จริง
 * ตัวขั้นอนุมัติเองถูกทดสอบเต็ม ๆ ที่ quote-approval.test.ts
 */
export async function approveForTest(quoteId: string): Promise<void> {
  for (const role of ["PROPOSER", "APPROVER"] as const) {
    await prisma.quoteSigner.upsert({
      where: { quoteId_role: { quoteId, role } },
      create: { quoteId, role, name: "ผู้ทดสอบ" },
      update: {},
    });
  }
}

type Agent = { post: (url: string) => Test };

export async function sendQuote(agent: Agent, projectId: string, quoteId: string) {
  await approveForTest(quoteId);
  return agent.post(`/api/projects/${projectId}/quotes/${quoteId}/transition`).send({ toStatus: "SENT" });
}
