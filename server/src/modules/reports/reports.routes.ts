import { Router, type Response } from "express";

import { contentDisposition } from "../../lib/csv";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { sendXlsx } from "../../lib/excel/send-xlsx";
import { buildSalesTaxCsv, buildSalesTaxXlsx, getSalesTaxReport, SalesTaxReportError } from "./salesTax.service";

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

function sendReportError(res: Response, err: unknown): void {
  if (err instanceof SalesTaxReportError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  throw err;
}

/** ?month=YYYY-MM — ส่งมาหลายค่า/เป็นออบเจกต์ = ไม่ระบุ (เซอร์วิสตอบว่ารูปแบบเดือนไม่ถูกต้องเอง) */
const monthParam = (value: unknown): string => (typeof value === "string" ? value : "");

reportsRouter.get("/sales-tax", async (req, res) => {
  try {
    res.json(await getSalesTaxReport(monthParam(req.query.month)));
  } catch (err) {
    sendReportError(res, err);
  }
});

reportsRouter.get("/sales-tax.xlsx", async (req, res) => {
  const month = monthParam(req.query.month);
  try {
    sendXlsx(res, await buildSalesTaxXlsx(month), `รายงานภาษีขาย-${month}.xlsx`);
  } catch (err) {
    sendReportError(res, err);
  }
});

reportsRouter.get("/sales-tax.csv", async (req, res) => {
  const month = monthParam(req.query.month);
  try {
    const csv = await buildSalesTaxCsv(month);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", contentDisposition(`sales-tax-${month}.csv`, `รายงานภาษีขาย-${month}.csv`));
    res.send(csv);
  } catch (err) {
    sendReportError(res, err);
  }
});
