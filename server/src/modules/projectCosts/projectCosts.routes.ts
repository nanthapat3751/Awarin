import { Router, type Request, type Response } from "express";
import type { z, ZodTypeAny } from "zod";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import {
  commitmentStatusSchema,
  projectCommitmentSchema,
  projectCostSchema,
  voResolutionSchema,
} from "./projectCosts.schemas";
import {
  ackPriceDrift,
  createCommitment,
  createCost,
  deleteCommitment,
  deleteCost,
  getCostReport,
  ProjectCostError,
  resolveVo,
  setCommitmentStatus,
  unackPriceDrift,
  updateCommitment,
  updateCost,
} from "./projectCosts.service";

type ProjectParams = { projectId: string };
type CostParams = ProjectParams & { costId: string };
type CommitmentParams = ProjectParams & { commitmentId: string };
type DriftParams = ProjectParams & { itemId: string };

export const projectCostsRouter = Router({ mergeParams: true });

projectCostsRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

async function send(res: Response, run: () => Promise<unknown>) {
  try {
    res.json(await run());
  } catch (err) {
    if (err instanceof ProjectCostError) {
      // code ให้หน้าจอรู้ว่าต้องเปิดช่องเลือกสาเหตุ (OVERRUN_REASON_REQUIRED) ไม่ต้องเดาจากข้อความ
      res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
      return;
    }
    throw err;
  }
}

/** ตรวจ body ด้วย schema — ผิดตอบ 400 ข้อความแรก · ผ่านคืนค่าที่แปลงแล้ว */
function parse<S extends ZodTypeAny>(schema: S, req: Request, res: Response): z.infer<S> | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return null;
  }
  return parsed.data;
}

const actorOf = (req: Request<ProjectParams>) => ({ id: req.user!.id, role: req.user!.role });

projectCostsRouter.get("/", async (req: Request<ProjectParams>, res) => {
  await send(res, () => getCostReport(req.params.projectId, actorOf(req)));
});

// ---------- ยอดผูกพัน (ต้องอยู่ก่อน /:costId) ----------

projectCostsRouter.post("/commitments", async (req: Request<ProjectParams>, res) => {
  const data = parse(projectCommitmentSchema, req, res);
  if (data) await send(res, () => createCommitment(req.params.projectId, data, actorOf(req)));
});

projectCostsRouter.patch("/commitments/:commitmentId", async (req: Request<CommitmentParams>, res) => {
  const data = parse(projectCommitmentSchema, req, res);
  if (data) {
    await send(res, () => updateCommitment(req.params.projectId, req.params.commitmentId, data, actorOf(req)));
  }
});

projectCostsRouter.post("/commitments/:commitmentId/status", async (req: Request<CommitmentParams>, res) => {
  const data = parse(commitmentStatusSchema, req, res);
  if (data) {
    await send(res, () => setCommitmentStatus(req.params.projectId, req.params.commitmentId, data.status, actorOf(req)));
  }
});

projectCostsRouter.patch("/commitments/:commitmentId/vo", async (req: Request<CommitmentParams>, res) => {
  const data = parse(voResolutionSchema, req, res);
  if (data) {
    await send(res, () =>
      resolveVo(req.params.projectId, { kind: "commitment", id: req.params.commitmentId }, data, actorOf(req)),
    );
  }
});

projectCostsRouter.delete("/commitments/:commitmentId", async (req: Request<CommitmentParams>, res) => {
  await send(res, () => deleteCommitment(req.params.projectId, req.params.commitmentId, actorOf(req)));
});

// ---------- ราคาในคลังเปลี่ยนหลังเซ็นสัญญา: ซื้อแล้ว/ล็อกราคาแล้ว ----------

projectCostsRouter.post("/price-drift/:itemId/ack", async (req: Request<DriftParams>, res) => {
  await send(res, () => ackPriceDrift(req.params.projectId, req.params.itemId, actorOf(req)));
});

projectCostsRouter.delete("/price-drift/:itemId/ack", async (req: Request<DriftParams>, res) => {
  await send(res, () => unackPriceDrift(req.params.projectId, req.params.itemId, actorOf(req)));
});

// ---------- บิลที่จ่ายจริง ----------

projectCostsRouter.post("/", async (req: Request<ProjectParams>, res) => {
  const data = parse(projectCostSchema, req, res);
  if (data) await send(res, () => createCost(req.params.projectId, data, actorOf(req)));
});

projectCostsRouter.patch("/:costId/vo", async (req: Request<CostParams>, res) => {
  const data = parse(voResolutionSchema, req, res);
  if (data) {
    await send(res, () => resolveVo(req.params.projectId, { kind: "cost", id: req.params.costId }, data, actorOf(req)));
  }
});

projectCostsRouter.patch("/:costId", async (req: Request<CostParams>, res) => {
  const data = parse(projectCostSchema, req, res);
  if (data) await send(res, () => updateCost(req.params.projectId, req.params.costId, data, actorOf(req)));
});

projectCostsRouter.delete("/:costId", async (req: Request<CostParams>, res) => {
  await send(res, () => deleteCost(req.params.projectId, req.params.costId, actorOf(req)));
});
