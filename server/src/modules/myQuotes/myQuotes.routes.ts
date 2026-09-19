import { Router, type Request, type Response } from "express";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import {
  AttachmentError,
  attachmentHeaders,
  getCustomerAttachmentFile,
} from "../attachments/attachments.service";
import { respondToQuoteSchema } from "./myQuotes.schemas";
import {
  MyQuoteError,
  generateMyQuotePdf,
  getMyQuote,
  listMyQuotes,
  recordQuoteAttachmentView,
  respondToQuote,
} from "./myQuotes.service";

export const myQuotesRouter = Router();

myQuotesRouter.use(requireAuth, requireRole("CUSTOMER"));

myQuotesRouter.get("/", async (req, res) => {
  const quotes = await listMyQuotes(req.user!.id);
  res.json({ quotes });
});

myQuotesRouter.get("/:id", async (req, res) => {
  try {
    const quote = await getMyQuote(req.user!.id, req.params.id);
    res.json({ quote });
  } catch (err) {
    if (err instanceof MyQuoteError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

myQuotesRouter.get("/:id/pdf", async (req, res) => {
  try {
    const bytes = await generateMyQuotePdf(req.user!.id, req.params.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="quote.pdf"');
    res.send(Buffer.from(bytes));
  } catch (err) {
    if (err instanceof MyQuoteError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ลูกค้าโหลดไฟล์แนบที่พนักงานเปิดให้เห็น (ตรวจสิทธิ์เจ้าของโปรเจกต์ + visibility=CUSTOMER ใน service)
// disposition=attachment คือบันทึกลงเครื่อง, inline คือเปิดดูในแท็บใหม่ (เฉพาะ PDF/รูป)
async function serveCustomerAttachment(
  req: Request<{ id: string; attachmentId: string }>,
  res: Response,
  disposition: "attachment" | "inline",
) {
  try {
    const file = await getCustomerAttachmentFile(req.user!.id, req.params.id, req.params.attachmentId);
    // นับว่าเปิดดูใบเสนอราคาด้วย — best-effort ห้ามทำให้โหลดไฟล์ไม่ได้ถ้าบันทึกพลาด
    // บันทึกชื่อไฟล์ไปด้วย เพราะ "โหลดแบบก่อสร้าง" กับ "โหลด BOQ" คนละเรื่องกันในสายตาพนักงาน
    await recordQuoteAttachmentView(req.user!.id, req.params.id, {
      attachmentId: req.params.attachmentId,
      fileName: file.fileName,
    }).catch(() => undefined);
    for (const [key, value] of Object.entries(attachmentHeaders(file, disposition))) {
      res.setHeader(key, value);
    }
    res.sendFile(file.absPath);
  } catch (err) {
    if (err instanceof AttachmentError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
}

myQuotesRouter.get("/:id/attachments/:attachmentId/download", (req, res) =>
  serveCustomerAttachment(req, res, "attachment"),
);

// เปิดดูในเบราว์เซอร์ — ลูกค้ากดดูแบบแปลน/ใบเสนอราคาได้เลยโดยไม่ต้องโหลดลงเครื่องก่อน
myQuotesRouter.get("/:id/attachments/:attachmentId/preview", (req, res) =>
  serveCustomerAttachment(req, res, "inline"),
);

myQuotesRouter.post("/:id/respond", async (req, res) => {
  const parsed = respondToQuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    const quote = await respondToQuote(req.user!.id, req.params.id, parsed.data);
    res.json({ quote });
  } catch (err) {
    if (err instanceof MyQuoteError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
