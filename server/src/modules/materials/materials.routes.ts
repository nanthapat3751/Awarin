import { Router } from "express";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { createMaterialSchema, updateMaterialSchema } from "./materials.schemas";
import {
  MaterialError,
  createMaterial,
  deleteMaterial,
  listMaterials,
  updateMaterial,
} from "./materials.service";

export const materialsRouter = Router();

materialsRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

materialsRouter.get("/", async (req, res) => {
  const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
  const materials = await listMaterials(categoryId);
  res.json({ materials });
});

materialsRouter.post("/", async (req, res) => {
  const parsed = createMaterialSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const material = await createMaterial(parsed.data, req.user!.id);
    res.status(201).json({ material });
  } catch (err) {
    if (err instanceof MaterialError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

materialsRouter.patch("/:id", async (req, res) => {
  const parsed = updateMaterialSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const material = await updateMaterial(req.params.id, parsed.data, req.user!.id);
    res.json({ material });
  } catch (err) {
    if (err instanceof MaterialError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

materialsRouter.delete("/:id", async (req, res) => {
  try {
    await deleteMaterial(req.params.id, req.user!.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof MaterialError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
