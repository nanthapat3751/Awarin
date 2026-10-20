import type { Role } from "@systemboq/shared-types";
import { Router, type Request, type Response } from "express";

import { sendXlsx } from "../../lib/excel/send-xlsx";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { exportCustomerBoq } from "../boq/boq-export.service";
import { BoqError } from "../boq/boq.service";
import {
  approveQuote,
  returnQuoteForChanges,
  submitQuoteForApproval,
  withdrawQuoteApproval,
} from "./quote-approval.service";
import { quoteValiditySchema, returnQuoteSchema, transitionQuoteSchema } from "./quotes.schemas";
import {
  QuoteError,
  createQuote,
  deleteQuote,
  generateQuotePdf,
  getQuote,
  listQuotes,
  setQuoteValidity,
  transitionQuote,
} from "./quotes.service";

type ProjectParams = { projectId: string };
type QuoteParams = { projectId: string; quoteId: string };

export const quotesRouter = Router({ mergeParams: true });

quotesRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

quotesRouter.get("/", async (req: Request<ProjectParams>, res) => {
  const quotes = await listQuotes(req.params.projectId);
  res.json({ quotes });
});

quotesRouter.post("/", async (req: Request<ProjectParams>, res) => {
  try {
    const quote = await createQuote(req.params.projectId, req.user!.id);
    res.status(201).json({ quote });
  } catch (err) {
    if (err instanceof QuoteError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

quotesRouter.get("/:quoteId", async (req: Request<QuoteParams>, res) => {
  try {
    const quote = await getQuote(req.params.projectId, req.params.quoteId);
    res.json({ quote });
  } catch (err) {
    if (err instanceof QuoteError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

quotesRouter.delete("/:quoteId", async (req: Request<QuoteParams>, res) => {
  try {
    await deleteQuote(req.params.projectId, req.params.quoteId, req.user!.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof QuoteError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

quotesRouter.post("/:quoteId/transition", async (req: Request<QuoteParams>, res) => {
  const parsed = transitionQuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const quote = await transitionQuote(
      req.params.projectId,
      req.params.quoteId,
      parsed.data.toStatus,
      req.user!.id,
    );
    res.json({ quote });
  } catch (err) {
    if (err instanceof QuoteError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

quotesRouter.patch("/:quoteId/validity", async (req: Request<QuoteParams>, res) => {
  const parsed = quoteValiditySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    const quote = await setQuoteValidity(
      req.params.projectId,
      req.params.quoteId,
      parsed.data.validUntil,
      req.user!.id,
    );
    res.json({ quote });
  } catch (err) {
    if (err instanceof QuoteError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

quotesRouter.get("/:quoteId/pdf", async (req: Request<QuoteParams>, res) => {
  try {
    const bytes = await generateQuotePdf(req.params.projectId, req.params.quoteId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="quote.pdf"');
    res.send(Buffer.from(bytes));
  } catch (err) {
    if (err instanceof QuoteError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// Excel ฉบับลูกค้า — ตัวเลขชุดเดียวกับใบเสนอราคา PDF ของลูกค้า ไม่มีราคาทุน
quotesRouter.get("/:quoteId/export.xlsx", async (req: Request<QuoteParams>, res) => {
  try {
    const file = await exportCustomerBoq(req.params.projectId, req.params.quoteId);
    sendXlsx(res, file.buffer, file.fileName);
  } catch (err) {
    if (err instanceof QuoteError || err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ─────────────── ขั้นอนุมัติก่อนส่ง (ดู quote-approval.service.ts) ───────────────

type ApprovalAction = (projectId: string, quoteId: string, actor: { id: string; role: Role }) => Promise<void>;

async function runApproval(req: Request<QuoteParams>, res: Response, action: ApprovalAction): Promise<void> {
  try {
    await action(req.params.projectId, req.params.quoteId, { id: req.user!.id, role: req.user!.role });
    res.status(204).end();
  } catch (err) {
    if (err instanceof QuoteError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
}

quotesRouter.post("/:quoteId/approval/submit", (req: Request<QuoteParams>, res) =>
  runApproval(req, res, submitQuoteForApproval),
);
quotesRouter.post("/:quoteId/approval/approve", (req: Request<QuoteParams>, res) =>
  runApproval(req, res, approveQuote),
);
quotesRouter.post("/:quoteId/approval/withdraw", (req: Request<QuoteParams>, res) =>
  runApproval(req, res, withdrawQuoteApproval),
);
quotesRouter.post("/:quoteId/approval/return", (req: Request<QuoteParams>, res) => {
  const parsed = returnQuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  return runApproval(req, res, (projectId, quoteId, actor) =>
    returnQuoteForChanges(projectId, quoteId, actor, parsed.data.note),
  );
});
