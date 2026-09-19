import { Router, type Request } from "express";
import { z } from "zod";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { applyCatalogPrices, compareVersions, getPriceDrift, keepCurrentPrices } from "./boq-review.service";
import { createBoqItemSchema, updateBoqItemSchema } from "./boq.schemas";
import {
  BoqError,
  addBoqItem,
  deleteBoqItem,
  getBoqState,
  getMaterialSummary,
  reorderBoqItems,
  updateBoqItem,
} from "./boq.service";

type ProjectParams = { projectId: string };
type ItemParams = { projectId: string; itemId: string };

export const boqRouter = Router({ mergeParams: true });

boqRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

boqRouter.get("/", async (req: Request<ProjectParams>, res) => {
  try {
    const state = await getBoqState(req.params.projectId);
    res.json(state);
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// รายงานสรุปปริมาณวัสดุรวมทั้งโครงการ (ถอดปริมาณวัสดุ) — ต้นทุนวัสดุ ฝั่ง staff เท่านั้น
boqRouter.get("/material-summary", async (req: Request<ProjectParams>, res) => {
  try {
    const summary = await getMaterialSummary(req.params.projectId);
    res.json(summary);
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ราคาในคลังเปลี่ยนหลังตั้งราคาในโครงการ — ดู boq-review.service.ts
boqRouter.get("/price-drift", async (req: Request<ProjectParams>, res) => {
  try {
    res.json(await getPriceDrift(req.params.projectId));
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const itemIdsSchema = z.object({ itemIds: z.array(z.string().min(1)).min(1).max(1000) });

boqRouter.post("/price-drift/apply", async (req: Request<ProjectParams>, res) => {
  const parsed = itemIdsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await applyCatalogPrices(req.params.projectId, parsed.data.itemIds, req.user!.id));
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

boqRouter.post("/price-drift/keep", async (req: Request<ProjectParams>, res) => {
  const parsed = itemIdsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await keepCurrentPrices(req.params.projectId, parsed.data.itemIds, req.user!.id));
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const compareSchema = z.object({
  from: z.coerce.number().int().min(1),
  to: z.coerce.number().int().min(1),
});

boqRouter.get("/versions/compare", async (req: Request<ProjectParams>, res) => {
  const parsed = compareSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "ต้องระบุเวอร์ชันที่จะเทียบ (from, to)" });
    return;
  }
  try {
    res.json(await compareVersions(req.params.projectId, parsed.data.from, parsed.data.to));
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

boqRouter.post("/items", async (req: Request<ProjectParams>, res) => {
  const parsed = createBoqItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await addBoqItem(req.params.projectId, parsed.data, req.user!.id);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ส่งลำดับทั้งเวอร์ชัน — ดู reorderBoqItems
boqRouter.put("/items/order", async (req: Request<ProjectParams>, res) => {
  const parsed = itemIdsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await reorderBoqItems(req.params.projectId, parsed.data.itemIds, req.user!.id));
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

boqRouter.patch("/items/:itemId", async (req: Request<ItemParams>, res) => {
  const parsed = updateBoqItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await updateBoqItem(
      req.params.projectId,
      req.params.itemId,
      parsed.data,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

boqRouter.delete("/items/:itemId", async (req: Request<ItemParams>, res) => {
  try {
    const result = await deleteBoqItem(req.params.projectId, req.params.itemId, req.user!.id);
    res.json(result);
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
