import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { attachmentsRouter } from "./modules/attachments/attachments.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { backupsRouter } from "./modules/backups/backups.routes";
import { twoFactorRouter } from "./modules/auth/twofactor.routes";
import { boqRouter } from "./modules/boq/boq.routes";
import { categoriesRouter } from "./modules/categories/categories.routes";
import { contractTemplatesRouter } from "./modules/contractTemplates/contractTemplates.routes";
import { contractsRouter } from "./modules/contracts/contracts.routes";
import { customersRouter } from "./modules/customers/customers.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { houseDesignsRouter, publicHouseDesignsRouter } from "./modules/houseDesigns/houseDesigns.routes";
import { leadsRouter, myLeadsRouter, publicLeadsRouter } from "./modules/leads/leads.routes";
import { materialsRouter } from "./modules/materials/materials.routes";
import { myContractsRouter } from "./modules/myContracts/myContracts.routes";
import { myQuotesRouter } from "./modules/myQuotes/myQuotes.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { portfolioRouter, publicPortfolioRouter } from "./modules/portfolio/portfolio.routes";
import { projectsRouter } from "./modules/projects/projects.routes";
import { quotesRouter } from "./modules/quotes/quotes.routes";
import { publicSettingsRouter, settingsRouter } from "./modules/settings/settings.routes";
import { projectTemplatesRouter, templatesRouter } from "./modules/templates/templates.routes";
import { trashRouter } from "./modules/trash/trash.routes";
import { UPLOADS_DIR, uploadsRouter } from "./modules/uploads/uploads.routes";
import { usersRouter } from "./modules/users/users.routes";
import { uploadUrlMiddleware } from "./lib/upload-urls";
import { attachUser } from "./middleware/auth";

const staffOrigin = process.env.CORS_ORIGIN_STAFF ?? "http://localhost:5173";
const clientOrigin = process.env.CORS_ORIGIN_CLIENT ?? "http://localhost:5174";

export const app = express();

// เมื่อ deploy หลัง reverse proxy (nginx/Render/…) ต้องตั้ง TRUST_PROXY เพื่อให้ req.ip เป็น IP
// จริงของ client (rate limiter + การล็อกบัญชี + audit log อิงค่านี้) ค่า: จำนวน hop (เช่น "1"),
// "true"/"false" หรือรายการ subnet ของ Express — ค่าเริ่มต้นคือไม่เชื่อ proxy เลย เพราะการเชื่อ
// X-Forwarded-For ทั้งที่ไม่มี proxy จะเปิดให้ client ปลอม IP ตัวเองเพื่อเลี่ยง rate limit ได้
function parseTrustProxy(value: string): number | boolean | string {
  const asNumber = Number(value);
  if (Number.isInteger(asNumber)) return asNumber;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  app.set("trust proxy", parseTrustProxy(trustProxy));
}

app.use(helmet());
app.use(
  cors({
    origin: [staffOrigin, clientOrigin],
    credentials: true,
  }),
);
app.use(express.json());
// รูปที่อัปโหลด: ฐานข้อมูลเก็บ /uploads/... ส่งออกเป็น URL เต็มตาม PUBLIC_UPLOAD_BASE_URL (ดู lib/upload-urls.ts)
app.use(uploadUrlMiddleware);
app.use(cookieParser());
app.use(attachUser);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ฝั่งพนักงาน (ควบคุมสิทธิ์ด้วย RBAC)
app.use("/api/auth/2fa", twoFactorRouter);
app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/customers", customersRouter);
app.use("/api/materials", materialsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/projects/:projectId/boq", boqRouter);
app.use("/api/projects/:projectId/quotes", quotesRouter);
app.use("/api/projects/:projectId/quotes/:quoteId/attachments", attachmentsRouter);
app.use("/api/projects/:projectId/contracts", contractsRouter);
app.use("/api/projects/:projectId/templates", projectTemplatesRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/contract-templates", contractTemplatesRouter);
app.use("/api/house-designs", houseDesignsRouter);
app.use("/api/portfolio", portfolioRouter);
app.use("/api/trash", trashRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/backups", backupsRouter);
app.use("/api/users", usersRouter);

// รูปภาพที่อัปโหลด (อ่านได้แบบสาธารณะ) การตั้ง CORP เป็น cross-origin ทำให้แอปพนักงาน/ลูกค้า
// ที่รันคนละพอร์ตโหลดรูปผ่าน <img> ได้ ไม่งั้น helmet จะตั้งค่าเริ่มต้นเป็น same-origin
app.use(
  "/uploads",
  (_req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(UPLOADS_DIR),
);

// ฝั่งลูกค้า (ควบคุมสิทธิ์ด้วย RBAC, เข้าถึงได้เฉพาะข้อมูลของตัวเอง)
app.use("/api/my/quotes", myQuotesRouter);
app.use("/api/my/contracts", myContractsRouter);
app.use("/api/my/leads", myLeadsRouter);

// ใช้ร่วมกัน (บทบาทใดก็ได้ที่ล็อกอินแล้ว — พนักงานหรือลูกค้า, เห็นเฉพาะการแจ้งเตือนของตัวเอง)
app.use("/api/notifications", notificationsRouter);

// สาธารณะ (ไม่ต้องล็อกอิน)
app.use("/api/public/house-designs", publicHouseDesignsRouter);
app.use("/api/public/portfolio", publicPortfolioRouter);
app.use("/api/public/leads", publicLeadsRouter);
app.use("/api/public/settings", publicSettingsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
