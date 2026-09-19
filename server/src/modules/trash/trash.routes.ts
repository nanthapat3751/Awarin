import { Router } from "express";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import {
  isTrashType,
  listTrash,
  purgeTrashItem,
  restoreTrashItem,
  TRASH_RETENTION_DAYS,
  TrashError,
} from "./trash.service";

export const trashRouter = Router();

// ดู/กู้คืนถังขยะ = OWNER + ADMIN (เท่าที่ลบของได้อยู่แล้ว); ลบถาวรจำกัด OWNER (ดู DELETE ด้านล่าง)
trashRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

trashRouter.get("/", async (_req, res) => {
  const items = await listTrash();
  res.json({ items, retentionDays: TRASH_RETENTION_DAYS });
});

trashRouter.post("/:type/:id/restore", async (req, res) => {
  if (!isTrashType(req.params.type)) {
    res.status(404).json({ error: "ชนิดข้อมูลไม่ถูกต้อง" });
    return;
  }
  try {
    await restoreTrashItem(req.params.type, req.params.id, req.user!.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof TrashError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ลบถาวร (กู้ไม่ได้) — เฉพาะ OWNER
trashRouter.delete("/:type/:id", requireRole("OWNER"), async (req, res) => {
  if (!isTrashType(req.params.type)) {
    res.status(404).json({ error: "ชนิดข้อมูลไม่ถูกต้อง" });
    return;
  }
  try {
    await purgeTrashItem(req.params.type, req.params.id, req.user!.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof TrashError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
