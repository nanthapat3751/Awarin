import { Router } from "express";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import {
  createPortfolioSchema,
  reorderFeaturedSchema,
  updatePortfolioSchema,
} from "./portfolio.schemas";
import {
  FEATURED_LIMIT,
  PortfolioError,
  countPublishedPortfolio,
  createPortfolioItem,
  deletePortfolioItem,
  getPortfolioItem,
  listFeaturedPortfolio,
  listPortfolio,
  reorderFeatured,
  updatePortfolioItem,
} from "./portfolio.service";

export const portfolioRouter = Router();

portfolioRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

portfolioRouter.get("/", async (_req, res) => {
  const portfolio = await listPortfolio(false);
  res.json({ portfolio });
});

// จัดลำดับผลงานเด่นใหม่ (ลากเรียง) — ต้องมาก่อน "/:id"
portfolioRouter.patch("/featured/reorder", async (req, res) => {
  const parsed = reorderFeaturedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    await reorderFeatured(parsed.data, req.user!.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof PortfolioError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

portfolioRouter.post("/", async (req, res) => {
  const parsed = createPortfolioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  const item = await createPortfolioItem(parsed.data, req.user!.id);
  res.status(201).json({ item });
});

portfolioRouter.get("/:id", async (req, res) => {
  try {
    const item = await getPortfolioItem(req.params.id, false);
    res.json({ item });
  } catch (err) {
    if (err instanceof PortfolioError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

portfolioRouter.patch("/:id", async (req, res) => {
  const parsed = updatePortfolioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    const item = await updatePortfolioItem(req.params.id, parsed.data, req.user!.id);
    res.json({ item });
  } catch (err) {
    if (err instanceof PortfolioError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

portfolioRouter.delete("/:id", async (req, res) => {
  try {
    await deletePortfolioItem(req.params.id, req.user!.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof PortfolioError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export const publicPortfolioRouter = Router();

publicPortfolioRouter.get("/", async (req, res) => {
  const type =
    req.query.type === "DESIGN" || req.query.type === "CONSTRUCTION" ? req.query.type : undefined;
  const portfolio = await listPortfolio(true, type);
  res.json({ portfolio });
});

// ผลงานเด่นสำหรับโซนสำรวจผลงานของหน้าบริการ — ต้องมาก่อน "/:id"
publicPortfolioRouter.get("/featured", async (req, res) => {
  const raw = Number(req.query.limit);
  const limit = Number.isInteger(raw) && raw > 0 && raw <= FEATURED_LIMIT ? raw : FEATURED_LIMIT;
  const [portfolio, total] = await Promise.all([
    listFeaturedPortfolio(limit),
    countPublishedPortfolio(),
  ]);
  res.json({ portfolio, total });
});

publicPortfolioRouter.get("/:id", async (req, res) => {
  try {
    const item = await getPortfolioItem(req.params.id, true);
    res.json({ item });
  } catch (err) {
    if (err instanceof PortfolioError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
