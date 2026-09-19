import { prisma } from "../../lib/prisma";

interface ListOptions {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}

export async function listMyNotifications(userId: string, opts: ListOptions = {}) {
  const { limit = 30, offset = 0, unreadOnly = false } = opts;
  const where = { userId, ...(unreadOnly ? { read: false } : {}) };
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({ where }),
  ]);
  return { notifications, total };
}

export async function countUnread(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}

export async function markAsRead(userId: string, id: string) {
  await prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
}

export async function markAllAsRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
}
