import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { ContractTemplateError } from "../contractTemplates/contractTemplates.service";
import {
  updateContractBodySchema,
  updateInstallmentsSchema,
} from "../contractTemplates/contractTemplates.schemas";
import {
  ContractError,
  createContract,
  generateContractPdf,
  getContract,
  listContracts,
  listInstallments,
  signContract,
  updateContractBody,
  updateInstallments,
} from "./contracts.service";
import {
  generateBillingDocPdf,
  issueInvoice,
  issueReceipt,
  issueRetentionInvoice,
  issueRetentionReceipt,
  voidBillingDoc,
} from "./billing-docs.service";
import {
  issueInvoiceSchema,
  issueRetentionInvoiceSchema,
  recordPaymentSchema,
  setInstallmentDueSchema,
  setRetentionSchema,
  updatePaymentSchema,
  voidBillingDocSchema,
} from "./payments.schemas";
import { BoqError } from "../boq/boq.service";
import { attachmentHeaders } from "../attachments/attachments.service";
import { discardUploads, evidenceUpload, uploadErrorMessage } from "./payment-evidence.files";
import {
  confirmNoticeBySlip,
  getStaffNoticeEvidenceFile,
  recheckNoticeSlips,
  rejectPaymentNotice,
} from "./payment-notices.service";
import { addPaymentEvidence, deletePaymentEvidence, getPaymentEvidenceFile } from "./payment-evidence.service";
import { changeOrderInputSchema, decisionSchema } from "./change-orders.schemas";
import {
  ChangeOrderError,
  cancelChangeOrder,
  createChangeOrder,
  generateChangeOrderPdf,
  listChangeOrders,
  previewChangeOrder,
  recordDecision,
  refreshChangeOrder,
  sendChangeOrder,
  updateChangeOrder,
} from "./change-orders.service";
import {
  deletePayment,
  deleteRetentionRelease,
  getContractPayments,
  recordPayment,
  recordRetentionRelease,
  setInstallmentDue,
  setRetention,
  updatePayment,
  updateRetentionRelease,
  verifyPayment,
} from "./payments.service";

type ProjectParams = { projectId: string };
type ContractParams = { projectId: string; contractId: string };

export const contractsRouter = Router({ mergeParams: true });

contractsRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

contractsRouter.get("/", async (req: Request<ProjectParams>, res) => {
  const contracts = await listContracts(req.params.projectId);
  res.json({ contracts });
});

contractsRouter.post("/", async (req: Request<ProjectParams>, res) => {
  try {
    const templateId =
      typeof req.body?.templateId === "string" ? req.body.templateId : undefined;
    const contract = await createContract(req.params.projectId, req.user!.id, templateId);
    res.status(201).json({ contract });
  } catch (err) {
    // ต้องรับ ContractTemplateError ด้วย เพราะเส้นทางนี้เรียก resolveTemplateForContract()
    // ซึ่งโยนคนละคลาสกัน — ไม่รับไว้จะกลายเป็น 500 "Internal server error"
    // แทนที่จะบอกว่า "ไม่พบแม่แบบสัญญาที่ระบุ" (เกิดได้จริงเมื่อแม่แบบถูกลบไปหลังหน้าจอโหลดรายชื่อ)
    if (err instanceof ContractError || err instanceof ContractTemplateError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

contractsRouter.get("/:contractId", async (req: Request<ContractParams>, res) => {
  try {
    const contract = await getContract(req.params.projectId, req.params.contractId);
    res.json({ contract });
  } catch (err) {
    if (err instanceof ContractError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

contractsRouter.patch("/:contractId/body", async (req: Request<ContractParams>, res) => {
  const parsed = updateContractBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  try {
    const contract = await updateContractBody(
      req.params.projectId,
      req.params.contractId,
      parsed.data,
      req.user!.id,
    );
    res.json({ contract });
  } catch (err) {
    if (err instanceof ContractError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

contractsRouter.get("/:contractId/installments", async (req: Request<ContractParams>, res) => {
  try {
    res.json(await listInstallments(req.params.projectId, req.params.contractId));
  } catch (err) {
    if (err instanceof ContractError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

contractsRouter.put("/:contractId/installments", async (req: Request<ContractParams>, res) => {
  const parsed = updateInstallmentsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  try {
    const installments = await updateInstallments(
      req.params.projectId,
      req.params.contractId,
      parsed.data,
      req.user!.id,
    );
    res.json({ installments });
  } catch (err) {
    if (err instanceof ContractError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

contractsRouter.post("/:contractId/sign", async (req: Request<ContractParams>, res) => {
  try {
    const contract = await signContract(req.params.projectId, req.params.contractId, req.user!.id);
    res.json({ contract });
  } catch (err) {
    if (err instanceof ContractError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

contractsRouter.get("/:contractId/pdf", async (req: Request<ContractParams>, res) => {
  try {
    const bytes = await generateContractPdf(req.params.projectId, req.params.contractId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="contract.pdf"');
    res.send(Buffer.from(bytes));
  } catch (err) {
    if (err instanceof ContractError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ---------- ติดตามการจ่ายเงินรายงวด ----------
//
// ทุกเส้นทางด้านล่างทำงานเฉพาะสัญญาที่ลงนามแล้ว (เซอร์วิสเป็นคนบังคับ) ดูเหตุผลใน payments.service.ts

/** ยกข้อผิดพลาดทางธุรกิจของสัญญาออกเป็นคำตอบ — ปลายทางกลุ่มนี้ปฏิเสธคำขอได้หลายแบบ */
function sendPayments(
  res: Response,
  run: () => Promise<unknown>,
): Promise<void> {
  return run()
    .then((data) => {
      res.json(data);
    })
    .catch((err: unknown) => {
      if (err instanceof ContractError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      throw err;
    });
}

contractsRouter.get("/:contractId/payments", async (req: Request<ContractParams>, res) => {
  await sendPayments(res, () => getContractPayments(req.params.projectId, req.params.contractId));
});

contractsRouter.patch(
  "/:contractId/installments/:installmentId/due",
  async (req: Request<ContractParams & { installmentId: string }>, res) => {
    const parsed = setInstallmentDueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
      return;
    }
    await sendPayments(res, () =>
      setInstallmentDue(
        req.params.projectId,
        req.params.contractId,
        req.params.installmentId,
        parsed.data.dueOn,
        req.user!.id,
      ),
    );
  },
);

contractsRouter.post(
  "/:contractId/installments/:installmentId/payments",
  async (req: Request<ContractParams & { installmentId: string }>, res) => {
    const parsed = recordPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
      return;
    }
    await sendPayments(res, () =>
      recordPayment(
        req.params.projectId,
        req.params.contractId,
        req.params.installmentId,
        parsed.data,
        req.user!.id,
      ),
    );
  },
);

contractsRouter.patch(
  "/:contractId/payments/:paymentId",
  async (req: Request<ContractParams & { paymentId: string }>, res) => {
    const parsed = updatePaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
      return;
    }
    await sendPayments(res, () =>
      updatePayment(
        req.params.projectId,
        req.params.contractId,
        req.params.paymentId,
        parsed.data,
        { id: req.user!.id, role: req.user!.role },
      ),
    );
  },
);

contractsRouter.delete(
  "/:contractId/payments/:paymentId",
  async (req: Request<ContractParams & { paymentId: string }>, res) => {
    await sendPayments(res, () =>
      deletePayment(req.params.projectId, req.params.contractId, req.params.paymentId, {
        id: req.user!.id,
        role: req.user!.role,
      }),
    );
  },
);

contractsRouter.post(
  "/:contractId/payments/:paymentId/verify",
  async (req: Request<ContractParams & { paymentId: string }>, res) => {
    await sendPayments(res, () =>
      verifyPayment(req.params.projectId, req.params.contractId, req.params.paymentId, {
        id: req.user!.id,
        role: req.user!.role,
      }),
    );
  },
);

// ---------- หลักฐานการรับเงิน (สลิป/รูปเช็ค/สำเนาใบเสร็จ) ----------

type EvidenceParams = ContractParams & { paymentId: string };

contractsRouter.post("/:contractId/payments/:paymentId/evidence", (req: Request<EvidenceParams>, res) => {
  evidenceUpload.single("file")(req, res, async (err: unknown) => {
    if (err) {
      discardUploads(req.file ? [req.file] : []);
      res.status(400).json({ error: uploadErrorMessage(err, 1) });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "ไม่พบไฟล์ที่อัปโหลด" });
      return;
    }
    const file = req.file;
    try {
      res.json(
        await addPaymentEvidence(req.params.projectId, req.params.contractId, req.params.paymentId, file, req.user!.id),
      );
    } catch (e) {
      // ผูกกับ DB ไม่สำเร็จ (เกินเพดาน/ไม่พบรายการ) — ลบไฟล์ที่เขียนลงดิสก์ไปแล้วทิ้ง กัน orphan
      discardUploads([file]);
      if (e instanceof ContractError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      throw e;
    }
  });
});

contractsRouter.delete(
  "/:contractId/payments/:paymentId/evidence/:evidenceId",
  async (req: Request<EvidenceParams & { evidenceId: string }>, res) => {
    await sendPayments(res, () =>
      deletePaymentEvidence(
        req.params.projectId,
        req.params.contractId,
        req.params.paymentId,
        req.params.evidenceId,
        { id: req.user!.id, role: req.user!.role },
      ),
    );
  },
);

// เปิดดูในแท็บใหม่ (navigate ตรง ไม่ผ่าน fetch) — Content-Type ตัดสินจากนามสกุล ไม่เชื่อ mimeType ใน DB
contractsRouter.get(
  "/:contractId/payments/:paymentId/evidence/:evidenceId",
  async (req: Request<EvidenceParams & { evidenceId: string }>, res) => {
    try {
      const file = await getPaymentEvidenceFile(
        req.params.projectId,
        req.params.contractId,
        req.params.paymentId,
        req.params.evidenceId,
      );
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
  },
);

// ---------- ลูกค้าแจ้งโอน (ยืนยัน = บันทึกรับเงินพร้อม noticeId · ที่นี่คือปฏิเสธและเปิดสลิป) ----------

type NoticeParams = ContractParams & { noticeId: string };

const rejectNoticeSchema = z.object({
  reason: z.string().trim().min(1, "ระบุเหตุผลให้ลูกค้ารู้ว่าต้องทำอะไรต่อ").max(300, "เหตุผลยาวเกิน 300 ตัวอักษร"),
});

contractsRouter.post("/:contractId/payment-notices/:noticeId/reject", async (req: Request<NoticeParams>, res) => {
  const parsed = rejectNoticeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  await sendPayments(res, () =>
    rejectPaymentNotice(req.params.projectId, req.params.contractId, req.params.noticeId, parsed.data.reason, req.user!.id),
  );
});

// ยืนยัน & ออกใบเสร็จคลิกเดียว — เฉพาะการแจ้งที่ระบบตรวจสลิปผ่าน (ดู confirmNoticeBySlip)
contractsRouter.post("/:contractId/payment-notices/:noticeId/confirm-slip", async (req: Request<NoticeParams>, res) => {
  await sendPayments(res, () =>
    confirmNoticeBySlip(req.params.projectId, req.params.contractId, req.params.noticeId, {
      id: req.user!.id,
      role: req.user!.role,
    }),
  );
});

// ตรวจสลิปอีกครั้ง — การแจ้งที่รอตรวจและยังตรวจไม่ได้ (สลิปที่ธนาคารให้ตรวจหลังโอนหลายนาที ฯลฯ)
contractsRouter.post("/:contractId/payment-notices/:noticeId/recheck-slip", async (req: Request<NoticeParams>, res) => {
  await sendPayments(res, () =>
    recheckNoticeSlips(req.params.projectId, req.params.contractId, req.params.noticeId, req.user!.id),
  );
});

contractsRouter.get(
  "/:contractId/payment-notices/:noticeId/evidence/:evidenceId",
  async (req: Request<NoticeParams & { evidenceId: string }>, res) => {
    try {
      const file = await getStaffNoticeEvidenceFile(
        req.params.projectId,
        req.params.contractId,
        req.params.noticeId,
        req.params.evidenceId,
      );
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
  },
);

// ---------- ใบแจ้งหนี้ / ใบเสร็จรับเงิน ----------

contractsRouter.post(
  "/:contractId/installments/:installmentId/invoice",
  async (req: Request<ContractParams & { installmentId: string }>, res) => {
    const parsed = issueInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
      return;
    }
    await sendPayments(res, () =>
      issueInvoice(
        req.params.projectId,
        req.params.contractId,
        req.params.installmentId,
        parsed.data,
        req.user!.id,
      ),
    );
  },
);

contractsRouter.post(
  "/:contractId/payments/:paymentId/receipt",
  async (req: Request<ContractParams & { paymentId: string }>, res) => {
    await sendPayments(res, () =>
      issueReceipt(req.params.projectId, req.params.contractId, req.params.paymentId, req.user!.id),
    );
  },
);

contractsRouter.post(
  "/:contractId/documents/:docId/void",
  async (req: Request<ContractParams & { docId: string }>, res) => {
    const parsed = voidBillingDocSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
      return;
    }
    await sendPayments(res, () =>
      voidBillingDoc(req.params.projectId, req.params.contractId, req.params.docId, parsed.data.reason, {
        id: req.user!.id,
        role: req.user!.role,
      }),
    );
  },
);

contractsRouter.get(
  "/:contractId/documents/:docId/pdf",
  async (req: Request<ContractParams & { docId: string }>, res) => {
    try {
      const { docNo, bytes } = await generateBillingDocPdf(
        req.params.projectId,
        req.params.contractId,
        req.params.docId,
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${docNo}.pdf"`);
      res.send(Buffer.from(bytes));
    } catch (err) {
      if (err instanceof ContractError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      throw err;
    }
  },
);

// ---------- ใบงานเพิ่ม-ลด (ดู change-orders.service.ts) ----------

type ChangeOrderParams = ContractParams & { changeOrderId: string };

function sendChangeOrders(res: Response, run: () => Promise<unknown>): Promise<void> {
  return run()
    .then((data) => {
      res.json(data);
    })
    .catch((err: unknown) => {
      if (err instanceof ChangeOrderError || err instanceof BoqError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      throw err;
    });
}

contractsRouter.get("/:contractId/change-orders", async (req: Request<ContractParams>, res) => {
  await sendChangeOrders(res, () => listChangeOrders(req.params.projectId, req.params.contractId));
});

contractsRouter.get("/:contractId/change-orders/preview", async (req: Request<ContractParams>, res) => {
  await sendChangeOrders(res, () => previewChangeOrder(req.params.projectId, req.params.contractId));
});

contractsRouter.post("/:contractId/change-orders", async (req: Request<ContractParams>, res) => {
  const parsed = changeOrderInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  await sendChangeOrders(res, () =>
    createChangeOrder(req.params.projectId, req.params.contractId, parsed.data, req.user!.id),
  );
});

contractsRouter.patch("/:contractId/change-orders/:changeOrderId", async (req: Request<ChangeOrderParams>, res) => {
  const parsed = changeOrderInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  await sendChangeOrders(res, () =>
    updateChangeOrder(req.params.projectId, req.params.contractId, req.params.changeOrderId, parsed.data, req.user!.id),
  );
});

const CHANGE_ORDER_ACTIONS = {
  refresh: refreshChangeOrder,
  send: sendChangeOrder,
  cancel: cancelChangeOrder,
} as const;

for (const [action, run] of Object.entries(CHANGE_ORDER_ACTIONS)) {
  contractsRouter.post(`/:contractId/change-orders/:changeOrderId/${action}`, async (req: Request<ChangeOrderParams>, res) => {
    await sendChangeOrders(res, () =>
      run(req.params.projectId, req.params.contractId, req.params.changeOrderId, req.user!.id),
    );
  });
}

// บันทึกผลจากใบที่ลูกค้าเซ็นกระดาษ
contractsRouter.post("/:contractId/change-orders/:changeOrderId/decision", async (req: Request<ChangeOrderParams>, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  await sendChangeOrders(res, () =>
    recordDecision(req.params.projectId, req.params.contractId, req.params.changeOrderId, parsed.data, req.user!.id),
  );
});

contractsRouter.get("/:contractId/change-orders/:changeOrderId/pdf", async (req: Request<ChangeOrderParams>, res) => {
  try {
    const { docNo, bytes } = await generateChangeOrderPdf(req.params.projectId, req.params.contractId, req.params.changeOrderId);
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

// ---------- เงินประกันผลงาน ----------

type ReleaseParams = ContractParams & { releaseId: string };

contractsRouter.patch("/:contractId/retention", async (req: Request<ContractParams>, res) => {
  const parsed = setRetentionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  try {
    res.json(
      await setRetention(req.params.projectId, req.params.contractId, parsed.data, {
        id: req.user!.id,
        role: req.user!.role,
      }),
    );
  } catch (err) {
    if (err instanceof ContractError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

contractsRouter.post("/:contractId/retention/releases", async (req: Request<ContractParams>, res) => {
  const parsed = recordPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  await sendPayments(res, () =>
    recordRetentionRelease(req.params.projectId, req.params.contractId, parsed.data, req.user!.id),
  );
});

contractsRouter.patch("/:contractId/retention/releases/:releaseId", async (req: Request<ReleaseParams>, res) => {
  const parsed = updatePaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  await sendPayments(res, () =>
    updateRetentionRelease(req.params.projectId, req.params.contractId, req.params.releaseId, parsed.data, {
      id: req.user!.id,
      role: req.user!.role,
    }),
  );
});

contractsRouter.delete("/:contractId/retention/releases/:releaseId", async (req: Request<ReleaseParams>, res) => {
  await sendPayments(res, () =>
    deleteRetentionRelease(req.params.projectId, req.params.contractId, req.params.releaseId, {
      id: req.user!.id,
      role: req.user!.role,
    }),
  );
});

contractsRouter.post("/:contractId/retention/invoice", async (req: Request<ContractParams>, res) => {
  const parsed = issueRetentionInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  await sendPayments(res, () =>
    issueRetentionInvoice(req.params.projectId, req.params.contractId, parsed.data, req.user!.id),
  );
});

contractsRouter.post("/:contractId/retention/releases/:releaseId/receipt", async (req: Request<ReleaseParams>, res) => {
  await sendPayments(res, () =>
    issueRetentionReceipt(req.params.projectId, req.params.contractId, req.params.releaseId, req.user!.id),
  );
});
