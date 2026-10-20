import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { Router, type Request, type Response } from "express";
import multer from "multer";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import {
  ATTACHMENTS_DIR,
  AttachmentError,
  MAX_ATTACHMENT_BYTES,
  attachmentHeaders,
  createAttachment,
  deleteAttachment,
  getStaffAttachmentFile,
  isAllowedAttachment,
  parseKind,
  parseKindPatch,
  parseVisibility,
  parseVisibilityPatch,
  updateAttachment,
} from "./attachments.service";

type QuoteParams = { projectId: string; quoteId: string };
type AttachmentParams = QuoteParams & { attachmentId: string };

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ATTACHMENTS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isAllowedAttachment(file.mimetype, file.originalname)) cb(null, true);
    else cb(new Error("รองรับเฉพาะไฟล์ PDF, Excel (.xlsx/.xls) หรือรูปภาพ"));
  },
});

// ลบไฟล์บนดิสก์แบบไม่ให้ล้ม ถ้าลบไม่ได้ก็ข้าม (ใช้เก็บกวาดไฟล์ที่ multer เขียนไว้แต่ผูก DB ไม่สำเร็จ)
function safeUnlink(filePath: string | undefined) {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ไฟล์อาจไม่มีอยู่แล้ว */
  }
}

// ส่งไฟล์ออกไป — header รองรับชื่อไฟล์ภาษาไทย (RFC 5987), ดู attachmentHeaders ว่าเลือกชนิดยังไง
function sendFile(
  res: Response,
  file: { absPath: string; fileName: string; mimeType: string },
  disposition: "attachment" | "inline",
) {
  for (const [key, value] of Object.entries(attachmentHeaders(file, disposition))) {
    res.setHeader(key, value);
  }
  res.sendFile(file.absPath);
}

export const attachmentsRouter = Router({ mergeParams: true });

attachmentsRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

// อัปโหลด + ผูกไฟล์เข้ากับใบเสนอราคาในคำขอเดียว (multipart: file, kind, visibility)
attachmentsRouter.post("/", (req: Request<QuoteParams>, res) => {
  upload.single("file")(req, res, async (err: unknown) => {
    if (err) {
      // เกินขนาดจะเขียนไฟล์บางส่วนไว้ก่อน error — เก็บกวาดทิ้ง
      safeUnlink(req.file?.path);
      let message = "อัปโหลดไม่สำเร็จ";
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") message = "ไฟล์ใหญ่เกิน 20 MB";
      else if (err instanceof Error) message = err.message;
      res.status(400).json({ error: message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "ไม่พบไฟล์ที่อัปโหลด" });
      return;
    }
    try {
      const attachment = await createAttachment({
        projectId: req.params.projectId,
        quoteId: req.params.quoteId,
        file: req.file,
        kind: parseKind(req.body?.kind),
        visibility: parseVisibility(req.body?.visibility),
        uploadedById: req.user!.id,
      });
      res.status(201).json({ attachment });
    } catch (e) {
      // ผูกกับ DB ไม่สำเร็จ (quote ไม่มี / เกินเพดาน / ฯลฯ) — ลบไฟล์ที่เขียนไปแล้วทิ้ง กัน orphan
      safeUnlink(req.file.path);
      if (e instanceof AttachmentError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      throw e;
    }
  });
});

// แก้ทีละช่องได้ — ช่องที่ไม่ส่งมาต้องไม่ถูกแตะ เดิมเติมค่าปริยายให้เสมอ หน้าเว็บที่ส่งมาแต่
// visibility จึงรีเซ็ตป้ายชนิดไฟล์เป็น "อื่นๆ" ทุกครั้งที่สลับสิทธิ์ (และทางกลับกันก็ดันเป็น INTERNAL)
attachmentsRouter.patch("/:attachmentId", async (req: Request<AttachmentParams>, res) => {
  try {
    const attachment = await updateAttachment(
      req.params.projectId,
      req.params.quoteId,
      req.params.attachmentId,
      { kind: parseKindPatch(req.body?.kind), visibility: parseVisibilityPatch(req.body?.visibility) },
      req.user!.id,
    );
    res.json({ attachment });
  } catch (e) {
    if (e instanceof AttachmentError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    throw e;
  }
});

attachmentsRouter.delete("/:attachmentId", async (req: Request<AttachmentParams>, res) => {
  try {
    await deleteAttachment(
      req.params.projectId,
      req.params.quoteId,
      req.params.attachmentId,
      req.user!.id,
    );
    res.status(204).end();
  } catch (e) {
    if (e instanceof AttachmentError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    throw e;
  }
});

attachmentsRouter.get("/:attachmentId/download", async (req: Request<AttachmentParams>, res) => {
  try {
    const file = await getStaffAttachmentFile(
      req.params.projectId,
      req.params.quoteId,
      req.params.attachmentId,
    );
    sendFile(res, file, "attachment");
  } catch (e) {
    if (e instanceof AttachmentError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    throw e;
  }
});

// เปิดดูในเบราว์เซอร์ (PDF/รูป) แทนการบังคับบันทึกลงเครื่อง — เป็น URL ที่เปิดตรงในแท็บใหม่ได้
// จึงไม่ต้องผ่าน fetch/blob (ดู resolveCookieName: การ navigate ระดับบนสุดไม่ส่ง header Origin)
attachmentsRouter.get("/:attachmentId/preview", async (req: Request<AttachmentParams>, res) => {
  try {
    const file = await getStaffAttachmentFile(
      req.params.projectId,
      req.params.quoteId,
      req.params.attachmentId,
    );
    sendFile(res, file, "inline");
  } catch (e) {
    if (e instanceof AttachmentError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    throw e;
  }
});
