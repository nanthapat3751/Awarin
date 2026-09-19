import { Router, type Request } from "express";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import {
  applyTemplateSchema,
  saveTemplateSchema,
  updateTemplateItemSchema,
  updateTemplateSchema,
} from "./templates.schemas";
import {
  TemplateError,
  applyTemplateToProject,
  deleteTemplate,
  getTemplateDetail,
  listTemplates,
  saveProjectAsTemplate,
  updateTemplate,
  updateTemplateItemRecipe,
} from "./templates.service";

type ProjectParams = { projectId: string };

// ระดับบนสุด: /api/templates — แสดง/ลบ ไม่ผูกกับโปรเจกต์ใดโปรเจกต์หนึ่ง
export const templatesRouter = Router();

templatesRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

templatesRouter.get("/", async (_req, res) => {
  const templates = await listTemplates();
  res.json({ templates });
});

templatesRouter.get("/:id", async (req, res) => {
  try {
    const template = await getTemplateDetail(req.params.id);
    res.json({ template });
  } catch (err) {
    if (err instanceof TemplateError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

templatesRouter.patch("/:id", async (req, res) => {
  const parsed = updateTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const template = await updateTemplate(req.params.id, parsed.data, req.user!.id);
    res.json({ template });
  } catch (err) {
    if (err instanceof TemplateError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

templatesRouter.patch("/:id/items/:index", async (req, res) => {
  const parsed = updateTemplateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  const index = Number(req.params.index);

  try {
    const template = await updateTemplateItemRecipe(req.params.id, index, parsed.data, req.user!.id);
    res.json({ template });
  } catch (err) {
    if (err instanceof TemplateError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

templatesRouter.delete("/:id", async (req, res) => {
  try {
    await deleteTemplate(req.params.id, req.user!.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof TemplateError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ผูกกับโปรเจกต์: /api/projects/:projectId/templates — บันทึก BOQ ปัจจุบันเป็น template
// หรือนำโครงสร้างของ template ที่มีอยู่มาใส่ในโปรเจกต์ (ที่ยังว่าง) นี้
export const projectTemplatesRouter = Router({ mergeParams: true });

projectTemplatesRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

projectTemplatesRouter.post("/save-as", async (req: Request<ProjectParams>, res) => {
  const parsed = saveTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const template = await saveProjectAsTemplate(
      req.params.projectId,
      parsed.data.name,
      parsed.data.description ?? null,
      req.user!.id,
    );
    res.status(201).json({ template });
  } catch (err) {
    if (err instanceof TemplateError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

projectTemplatesRouter.post("/apply", async (req: Request<ProjectParams>, res) => {
  const parsed = applyTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await applyTemplateToProject(
      req.params.projectId,
      parsed.data.templateId,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    if (err instanceof TemplateError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
