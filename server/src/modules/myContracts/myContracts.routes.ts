import { Router } from "express";

import { paymentAccountFrom } from "../../lib/company-fields";
import { getSettingsMap } from "../../lib/settings";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { MyContractError, generateMyContractPdf, listMyContracts } from "./myContracts.service";

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
