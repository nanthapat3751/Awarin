import { Router } from "express";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import {
  createHouseDesignSchema,
  reorderFeaturedHouseDesignsSchema,
  updateHouseDesignSchema,
} from "./houseDesigns.schemas";
import {
  FEATURED_HOUSE_DESIGN_LIMIT,
  HouseDesignError,
  createHouseDesign,
  deleteHouseDesign,
  getHouseDesign,
  listFeaturedHouseDesigns,
  listHouseDesigns,
  reorderFeaturedHouseDesigns,
  updateHouseDesign,
} from "./houseDesigns.service";

export const houseDesignsRouter = Router();

houseDesignsRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

houseDesignsRouter.get("/", async (_req, res) => {
  const houseDesigns = await listHouseDesigns(false);
  res.json({ houseDesigns });
});

// จัดลำดับแบบบ้านแนะนำใหม่ (ลากเรียง) — ต้องมาก่อน "/:id"
houseDesignsRouter.patch("/featured/reorder", async (req, res) => {
  const parsed = reorderFeaturedHouseDesignsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    await reorderFeaturedHouseDesigns(parsed.data, req.user!.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof HouseDesignError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

houseDesignsRouter.post("/", async (req, res) => {
  const parsed = createHouseDesignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  const houseDesign = await createHouseDesign(parsed.data, req.user!.id);
  res.status(201).json({ houseDesign });
});

houseDesignsRouter.get("/:id", async (req, res) => {
  try {
    const houseDesign = await getHouseDesign(req.params.id, false);
    res.json({ houseDesign });
  } catch (err) {
    if (err instanceof HouseDesignError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

houseDesignsRouter.patch("/:id", async (req, res) => {
  const parsed = updateHouseDesignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    const houseDesign = await updateHouseDesign(req.params.id, parsed.data, req.user!.id);
    res.json({ houseDesign });
  } catch (err) {
    if (err instanceof HouseDesignError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

houseDesignsRouter.delete("/:id", async (req, res) => {
  try {
    await deleteHouseDesign(req.params.id, req.user!.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof HouseDesignError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export const publicHouseDesignsRouter = Router();

publicHouseDesignsRouter.get("/", async (_req, res) => {
  const houseDesigns = await listHouseDesigns(true);
  res.json({ houseDesigns });
});

// แบบบ้านแนะนำสำหรับหน้าแรก — ต้องมาก่อน "/:id"
publicHouseDesignsRouter.get("/featured", async (req, res) => {
  const raw = Number(req.query.limit);
  const limit =
    Number.isInteger(raw) && raw > 0 && raw <= FEATURED_HOUSE_DESIGN_LIMIT
      ? raw
      : FEATURED_HOUSE_DESIGN_LIMIT;
  const houseDesigns = await listFeaturedHouseDesigns(limit);
  res.json({ houseDesigns });
});

publicHouseDesignsRouter.get("/:id", async (req, res) => {
  try {
    const houseDesign = await getHouseDesign(req.params.id, true);
    res.json({ houseDesign });
  } catch (err) {
    if (err instanceof HouseDesignError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
