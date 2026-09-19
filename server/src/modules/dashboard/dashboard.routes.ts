import { Router } from "express";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { getDashboardSummary, getPendingWork } from "./dashboard.service";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

dashboardRouter.get("/summary", async (_req, res) => {
  const summary = await getDashboardSummary();
  res.json({ summary });
});

dashboardRouter.get("/pending-work", async (_req, res) => {
  const pendingWork = await getPendingWork();
  res.json({ pendingWork });
});
