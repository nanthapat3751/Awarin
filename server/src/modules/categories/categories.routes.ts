import { Router } from "express";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { createCategorySchema, updateCategorySchema } from "./categories.schemas";
import {
  CategoryError,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "./categories.service";

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

categoriesRouter.get("/", async (_req, res) => {
  const categories = await listCategories();
  res.json({ categories });
});

categoriesRouter.post("/", async (req, res) => {
  const parsed = createCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const category = await createCategory(parsed.data, req.user!.id);
    res.status(201).json({ category });
  } catch (err) {
    if (err instanceof CategoryError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

categoriesRouter.patch("/:id", async (req, res) => {
  const parsed = updateCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const category = await updateCategory(req.params.id, parsed.data, req.user!.id);
    res.json({ category });
  } catch (err) {
    if (err instanceof CategoryError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

categoriesRouter.delete("/:id", async (req, res) => {
  try {
    await deleteCategory(req.params.id, req.user!.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof CategoryError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
