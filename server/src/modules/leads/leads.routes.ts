import { Router } from "express";

import { createRateLimiter } from "../../lib/rate-limit";
import { verifyTurnstile } from "../../lib/turnstile";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { ProjectError } from "../projects/projects.service";
import { createLeadSchema, replyLeadSchema, updateLeadStatusSchema } from "./leads.schemas";
import {
  LeadError,
  createLead,
  createProjectFromLead,
  deleteLead,
  listLeads,
  listMyLeads,
  replyToLead,
  updateLeadStatus,
} from "./leads.service";

export const leadsRouter = Router();

leadsRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

leadsRouter.get("/", async (req, res) => {
  const status = updateLeadStatusSchema.shape.status.safeParse(req.query.status);
  const leads = await listLeads(status.success ? status.data : undefined);
  res.json({ leads });
});

leadsRouter.post("/:id/create-project", async (req, res) => {
  try {
    const project = await createProjectFromLead(req.params.id, req.user!.id);
    res.status(201).json({ project });
  } catch (err) {
    if (err instanceof LeadError || err instanceof ProjectError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

leadsRouter.patch("/:id", async (req, res) => {
  const parsed = updateLeadStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    const lead = await updateLeadStatus(req.params.id, parsed.data.status, req.user!.id);
    res.json({ lead });
  } catch (err) {
    if (err instanceof LeadError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ลบคำขอ → ย้ายเข้าถังขยะ (OWNER + ADMIN เหมือนการลบอื่น ๆ) กู้คืน/ลบถาวรได้ที่เมนูถังขยะ
leadsRouter.delete("/:id", async (req, res) => {
  try {
    await deleteLead(req.params.id, req.user!.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof LeadError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

leadsRouter.patch("/:id/reply", async (req, res) => {
  const parsed = replyLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    const lead = await replyToLead(req.params.id, parsed.data.reply, req.user!.id);
    res.json({ lead });
  } catch (err) {
    if (err instanceof LeadError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ฟอร์มคำขอสาธารณะ (ไม่ต้องล็อกอิน) — จำกัดอัตราเพื่อกันบอท/สแปมถล่มกล่องคำขอของพนักงาน + อัด
// ขยะลง DB (การสมัครสมาชิกมีลิมิตอยู่แล้ว ฟอร์มนี้ที่เปิดกว้างกว่าจึงต้องมีด้วย) ตั้ง max ผ่าน env
// ได้ เพื่อให้เทสต์ (ที่ยิงหลายครั้งในไฟล์เดียว) ไม่ชนลิมิต — ค่าเริ่มต้น 5 ครั้ง/15 นาที/IP
const createLeadLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: Number(process.env.PUBLIC_LEAD_RATELIMIT_MAX ?? 5),
});

export const publicLeadsRouter = Router();

publicLeadsRouter.post("/", createLeadLimiter, async (req, res) => {
  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  // ยืนยันว่าเป็นมนุษย์ด้วย Cloudflare Turnstile (ข้ามเมื่อยังไม่ตั้ง TURNSTILE_SECRET_KEY)
  const humanVerified = await verifyTurnstile(
    typeof req.body?.turnstileToken === "string" ? req.body.turnstileToken : undefined,
    req.ip,
  );
  if (!humanVerified) {
    res.status(400).json({ error: "การยืนยันว่าไม่ใช่บอทล้มเหลว กรุณาลองใหม่อีกครั้ง" });
    return;
  }
  const customerId = req.user?.role === "CUSTOMER" ? req.user.id : null;
  const lead = await createLead(parsed.data, customerId);
  res.status(201).json({ lead });
});

export const myLeadsRouter = Router();

myLeadsRouter.use(requireAuth, requireRole("CUSTOMER"));

myLeadsRouter.get("/", async (req, res) => {
  const leads = await listMyLeads(req.user!.id);
  res.json({ leads });
});
