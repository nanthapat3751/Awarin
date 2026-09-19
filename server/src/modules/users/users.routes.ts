import { Router, type Request } from "express";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import {
  createStaffSchema,
  resetStaffPasswordSchema,
  setStaffActiveSchema,
} from "./users.schemas";
import {
  UserError,
  createStaff,
  listStaff,
  resetStaffPassword,
  setStaffActive,
} from "./users.service";

export const usersRouter = Router();

// จัดการบัญชีพนักงานเป็นสิทธิ์ของ OWNER เท่านั้น (ADMIN ใช้ระบบได้แต่แตะบัญชีคนอื่นไม่ได้)
usersRouter.use(requireAuth, requireRole("OWNER"));

function meta(req: Request) {
  return { ip: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
}

usersRouter.get("/", async (_req, res) => {
  const users = await listStaff();
  res.json({ users });
});

usersRouter.post("/", async (req, res) => {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await createStaff(parsed.data, req.user!.id, meta(req));
    res.status(201).json({ user });
  } catch (err) {
    if (err instanceof UserError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

usersRouter.post("/:id/reset-password", async (req, res) => {
  const parsed = resetStaffPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    await resetStaffPassword(req.params.id, parsed.data.newPassword, req.user!.id, meta(req));
    res.status(204).end();
  } catch (err) {
    if (err instanceof UserError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

usersRouter.post("/:id/active", async (req, res) => {
  const parsed = setStaffActiveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    await setStaffActive(req.params.id, parsed.data.active, req.user!.id, meta(req));
    res.status(204).end();
  } catch (err) {
    if (err instanceof UserError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
