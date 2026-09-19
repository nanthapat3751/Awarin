import { Router, type Request, type Response } from "express";

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
  recordPaymentSchema,
  setInstallmentDueSchema,
  updatePaymentSchema,
} from "./payments.schemas";
import {
  deletePayment,
  getContractPayments,
  recordPayment,
  setInstallmentDue,
  updatePayment,
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
