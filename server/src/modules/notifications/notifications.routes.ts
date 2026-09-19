import { Router } from "express";

import { requireAuth } from "../../middleware/auth";
import { countUnread, listMyNotifications, markAllAsRead, markAsRead } from "./notifications.service";

// ไม่สนบทบาท — ผู้ใช้ที่ล็อกอินแล้วทุกคน (พนักงานหรือลูกค้า) มีการแจ้งเตือนของตัวเอง
// อ้างอิงด้วย userId ล้วน ๆ ทั้ง staff-app และ client-app เรียกใช้ route ชุดเดียวกันนี้
export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 50);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const unreadOnly = req.query.filter === "unread";
  const { notifications, total } = await listMyNotifications(req.user!.id, {
    limit,
    offset,
    unreadOnly,
  });
  res.json({ notifications, total });
});

notificationsRouter.get("/unread-count", async (req, res) => {
  const count = await countUnread(req.user!.id);
  res.json({ count });
});

notificationsRouter.post("/:id/read", async (req, res) => {
  await markAsRead(req.user!.id, req.params.id);
  res.status(204).end();
});

notificationsRouter.post("/mark-all-read", async (req, res) => {
  await markAllAsRead(req.user!.id);
  res.status(204).end();
});
