import { prisma } from "./prisma";

export interface NotifyInput {
  userId: string;
  message: string;
  link?: string | null;
}

export async function createNotification(input: NotifyInput): Promise<void> {
  await prisma.notification.create({
    data: { userId: input.userId, message: input.message, link: input.link ?? null },
  });
}

/** กระจายการแจ้งเตือนเดียวกันไปยังบัญชี OWNER/ADMIN ทุกคนที่มีอยู่ปัจจุบัน */
export async function notifyStaff(message: string, link?: string | null): Promise<void> {
  const staff = await prisma.user.findMany({
    where: { role: { in: ["OWNER", "ADMIN"] }, active: true },
    select: { id: true },
  });
  await prisma.notification.createMany({
    data: staff.map((s) => ({ userId: s.id, message, link: link ?? null })),
  });
}
