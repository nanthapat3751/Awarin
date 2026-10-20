import { Router } from "express";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { MyContractError } from "./myContracts.service";
import { getMyPaymentDetail, listMyPayments } from "./myPayments.service";

/** หน้าการชำระเงินของลูกค้า — ดูได้อย่างเดียว · แจ้งโอนใช้ POST /api/my/contracts/:id/payment-notices */
export const myPaymentsRouter = Router();

myPaymentsRouter.use(requireAuth, requireRole("CUSTOMER"));

myPaymentsRouter.get("/", async (req, res) => {
  res.json({ payments: await listMyPayments(req.user!.id) });
});

myPaymentsRouter.get("/:installmentId", async (req, res) => {
  try {
    res.json({ payment: await getMyPaymentDetail(req.user!.id, req.params.installmentId) });
  } catch (err) {
    if (err instanceof MyContractError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
