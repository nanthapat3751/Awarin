import { PAYMENT_NOTICE_MAX_FILES } from "@systemboq/shared-types";
import { Router } from "express";
import { z } from "zod";

import { paymentAccountFrom } from "../../lib/company-fields";
import { getSettingsMap } from "../../lib/settings";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { decisionSchema } from "../contracts/change-orders.schemas";
import { ChangeOrderError, generateMyChangeOrderPdf, respondAsCustomer } from "../contracts/change-orders.service";
import { attachmentHeaders } from "../attachments/attachments.service";
import { ContractError } from "../contracts/contracts.service";
import { discardUploads, evidenceUpload, uploadErrorMessage } from "../contracts/payment-evidence.files";
import {
  cancelMyPaymentNotice,
  getMyNoticeEvidenceFile,
  SlipRejectedError,
  submitPaymentNotice,
} from "../contracts/payment-notices.service";
import {
  MyContractError,
  generateMyBillingDocPdf,
  generateMyContractPdf,
  listMyContracts,
} from "./myContracts.service";

export const myContractsRouter = Router();

myContractsRouter.use(requireAuth, requireRole("CUSTOMER"));

myContractsRouter.get("/", async (req, res) => {
  const [contracts, settings] = await Promise.all([listMyContracts(req.user!.id), getSettingsMap()]);
  // บัญชีรับเงินส่งมาก้อนเดียวต่อหน้า ไม่ใช่ติดไปกับทุกสัญญา — เป็นของบริษัท ไม่ใช่ของสัญญาฉบับใด
  // หน้าจอแสดงเฉพาะใต้สัญญาที่มีงวดค้างชำระ
  res.json({ contracts, payTo: paymentAccountFrom(settings) });
});

myContractsRouter.get("/:id/pdf", async (req, res) => {
  try {
    const bytes = await generateMyContractPdf(req.user!.id, req.params.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="contract.pdf"');
    res.send(Buffer.from(bytes));
  } catch (err) {
    if (err instanceof MyContractError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

myContractsRouter.get("/:id/documents/:docId/pdf", async (req, res) => {
  try {
    const { docNo, bytes } = await generateMyBillingDocPdf(req.user!.id, req.params.id, req.params.docId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${docNo}.pdf"`);
    res.send(Buffer.from(bytes));
  } catch (err) {
    if (err instanceof MyContractError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ใบงานเพิ่ม-ลด: ลูกค้ากดอนุมัติ/ไม่อนุมัติเอง (เฉพาะใบที่ส่งถึงแล้วและยังรอตอบ)
myContractsRouter.post("/:id/change-orders/:changeOrderId/respond", async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  try {
    await respondAsCustomer(req.user!.id, req.params.id, req.params.changeOrderId, parsed.data);
    const [contracts, settings] = await Promise.all([listMyContracts(req.user!.id), getSettingsMap()]);
    res.json({ contracts, payTo: paymentAccountFrom(settings) });
  } catch (err) {
    if (err instanceof ChangeOrderError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

myContractsRouter.get("/:id/change-orders/:changeOrderId/pdf", async (req, res) => {
  try {
    const { docNo, bytes } = await generateMyChangeOrderPdf(req.user!.id, req.params.id, req.params.changeOrderId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${docNo}.pdf"`);
    res.send(Buffer.from(bytes));
  } catch (err) {
    if (err instanceof ChangeOrderError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ---------- แจ้งโอนเงินพร้อมสลิป ----------

const noticeSchema = z.object({
  installmentId: z.string().min(1),
  paidOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ต้องเป็น ปปปป-ดด-วว"),
  amount: z.coerce.number().positive("ยอดที่โอนต้องมากกว่า 0").max(1_000_000_000),
  note: z.string().trim().max(500).optional(),
});

// multipart: files[] (สลิป 1-3 ไฟล์) + installmentId/paidOn/amount/note — ส่งก้อนเดียว
// ไม่มีจังหวะ "แจ้งแล้วแต่ยังไม่มีสลิป" ให้พนักงานงง
myContractsRouter.post("/:id/payment-notices", (req, res) => {
  evidenceUpload.array("files", PAYMENT_NOTICE_MAX_FILES)(req, res, async (err: unknown) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (err) {
      discardUploads(files);
      res.status(400).json({ error: uploadErrorMessage(err, PAYMENT_NOTICE_MAX_FILES) });
      return;
    }
    const parsed = noticeSchema.safeParse(req.body);
    if (!parsed.success) {
      discardUploads(files);
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
      return;
    }
    try {
      await submitPaymentNotice(req.user!.id, req.params.id, parsed.data, files);
      const [contracts, settings] = await Promise.all([listMyContracts(req.user!.id), getSettingsMap()]);
      res.json({ contracts, payTo: paymentAccountFrom(settings) });
    } catch (e) {
      // ระบบตรวจสลิปปฏิเสธ = การแจ้งถูกเก็บไว้พร้อมสลิปให้พนักงานเห็น — ห้ามลบไฟล์
      if (!(e instanceof SlipRejectedError)) discardUploads(files);
      if (e instanceof ContractError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      throw e;
    }
  });
});

// ยกเลิกการแจ้งของตัวเอง (แนบสลิปผิด/พิมพ์ยอดผิด) — ระหว่างที่บริษัทยังไม่ได้ตรวจ
myContractsRouter.post("/:id/payment-notices/:noticeId/cancel", async (req, res) => {
  try {
    await cancelMyPaymentNotice(req.user!.id, req.params.id, req.params.noticeId);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof ContractError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    throw e;
  }
});

// เปิดดูสลิปที่ตัวเองแนบ (navigate ตรง — path /api/my ใช้คุกกี้ลูกค้าเสมอ)
myContractsRouter.get("/:id/payment-notices/:noticeId/evidence/:evidenceId", async (req, res) => {
  try {
    const file = await getMyNoticeEvidenceFile(req.user!.id, req.params.id, req.params.noticeId, req.params.evidenceId);
    for (const [key, value] of Object.entries(attachmentHeaders(file, "inline"))) res.setHeader(key, value);
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(file.absPath);
  } catch (e) {
    if (e instanceof ContractError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    throw e;
  }
});
