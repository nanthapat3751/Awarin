import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

// ต้องมาก่อน: ให้ error ใน handler แบบ async ไปถึงตัวจัดการ error แทนที่จะปิด process ทิ้ง
import "./lib/async-errors";

import { attachmentsRouter } from "./modules/attachments/attachments.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { backupsRouter } from "./modules/backups/backups.routes";
import { mailRouter } from "./modules/mail/mail.routes";
import { ipCheckRouter } from "./modules/system/ip-check.routes";
import { twoFactorRouter } from "./modules/auth/twofactor.routes";
import { boqRouter } from "./modules/boq/boq.routes";
import { categoriesRouter } from "./modules/categories/categories.routes";
import { contractTemplatesRouter } from "./modules/contractTemplates/contractTemplates.routes";
import { contractsRouter } from "./modules/contracts/contracts.routes";
import { projectCostsRouter } from "./modules/projectCosts/projectCosts.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { customersRouter } from "./modules/customers/customers.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { houseDesignsRouter, publicHouseDesignsRouter } from "./modules/houseDesigns/houseDesigns.routes";
import { leadsRouter, myLeadsRouter, publicLeadsRouter } from "./modules/leads/leads.routes";
import { materialsRouter } from "./modules/materials/materials.routes";
import { myContractsRouter } from "./modules/myContracts/myContracts.routes";
import { myPaymentsRouter } from "./modules/myContracts/myPayments.routes";
import { myQuotesRouter } from "./modules/myQuotes/myQuotes.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { portfolioRouter, publicPortfolioRouter } from "./modules/portfolio/portfolio.routes";
import { projectsRouter } from "./modules/projects/projects.routes";
import { quotesRouter } from "./modules/quotes/quotes.routes";
import { publicSettingsRouter, settingsRouter } from "./modules/settings/settings.routes";
import { sitemapRouter } from "./modules/sitemap/sitemap.routes";
import { projectTemplatesRouter, templatesRouter } from "./modules/templates/templates.routes";
import { trashRouter } from "./modules/trash/trash.routes";
import { UPLOADS_DIR, uploadsRouter } from "./modules/uploads/uploads.routes";
import { usersRouter } from "./modules/users/users.routes";
import { accountRouter } from "./modules/account/account.routes";
import { lifecycleHeaders, livenessHandler, readinessHandler } from "./lib/lifecycle";
import { requestId } from "./lib/request-id";
import { requestContext } from "./lib/request-context";
import { INSTANCE_ID } from "./lib/scheduled-run";
import { uploadUrlMiddleware } from "./lib/upload-urls";
import { attachUser } from "./middleware/auth";
import { blockUntilPasswordChanged } from "./middleware/must-change-password";

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
app.use(requestId);
// ตรวจสุขภาพสำหรับ load balancer — อยู่ก่อนตัวแปลง body/คุกกี้/session เพื่อไม่ให้ขึ้นกับอะไรเลย
// นอกจาก process เอง (ready เช็ค DB แยกต่างหาก) ดู lib/lifecycle.ts
app.use(lifecycleHeaders);
app.get("/api/health", livenessHandler);
app.get("/api/health/ready", readinessHandler);
app.use(
  cors({
    origin: [staffOrigin, clientOrigin],
    credentials: true,
  }),
);
// ยืนยันนำเข้า BOQ ส่งได้ถึง 2,000 บรรทัด (~500 KB) เกินค่าเริ่มต้น 100 KB — ขยายเฉพาะเส้นนี้
// ต้องอยู่ก่อนตัวแปลงรวม (ตัวที่แปลงแล้วจะตั้ง req._body ตัวถัดไปจึงข้าม) ปลายทางอื่นยังจำกัดเท่าเดิม
app.use("/api/projects/:projectId/boq/import", express.json({ limit: "2mb" }));
app.use(express.json());
// รูปที่อัปโหลด: ฐานข้อมูลเก็บ /uploads/... ส่งออกเป็น URL เต็มตาม PUBLIC_UPLOAD_BASE_URL (ดู lib/upload-urls.ts)
app.use(uploadUrlMiddleware);
app.use(cookieParser());
// ไอพี/อุปกรณ์ของคำขอนี้ให้ AuditLog หยิบไปเอง — หลังตัวแปลง body/คุกกี้ ก่อน router ทุกตัว
app.use(requestContext);
app.use(attachUser);
// ต้องอยู่หลัง attachUser (ต้องมี req.user ก่อน) และก่อน router ทุกตัว — บัญชีที่ยังใช้รหัสที่
// คนอื่นตั้งให้จะเรียกได้เฉพาะปลายทางที่จำเป็นต่อการเปลี่ยนรหัส
app.use(blockUntilPasswordChanged);

// ฝั่งพนักงาน (ควบคุมสิทธิ์ด้วย RBAC)
app.use("/api/auth/2fa", twoFactorRouter);
app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/customers", customersRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/materials", materialsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/projects/:projectId/boq", boqRouter);
app.use("/api/projects/:projectId/quotes", quotesRouter);
app.use("/api/projects/:projectId/quotes/:quoteId/attachments", attachmentsRouter);
app.use("/api/projects/:projectId/contracts", contractsRouter);
app.use("/api/projects/:projectId/costs", projectCostsRouter);
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
app.use("/api/mail", mailRouter);
// ตรวจว่าไอพีที่บันทึกเป็นของคนใช้งานจริง (หลัง proxy/Docker) — เฉพาะ OWNER
app.use("/api/system", ipCheckRouter);
app.use("/api/users", usersRouter);
app.use("/api/account", accountRouter);

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
app.use("/api/my/payments", myPaymentsRouter);
app.use("/api/my/leads", myLeadsRouter);

// ใช้ร่วมกัน (บทบาทใดก็ได้ที่ล็อกอินแล้ว — พนักงานหรือลูกค้า, เห็นเฉพาะการแจ้งเตือนของตัวเอง)
app.use("/api/notifications", notificationsRouter);

// สาธารณะ (ไม่ต้องล็อกอิน)
app.use("/api/public/house-designs", publicHouseDesignsRouter);
app.use("/api/public/portfolio", publicPortfolioRouter);
app.use("/api/public/leads", publicLeadsRouter);
app.use("/api/public/settings", publicSettingsRouter);
app.use("/api/public/sitemap.xml", sitemapRouter);

// เลขอ้างอิง + ชื่อเครื่องใน log ไว้ไล่ย้อนจาก access log ของ nginx (ดู lib/request-id.ts)
// ส่งคำตอบไปบางส่วนแล้ว (เช่น กำลังสตรีม PDF) = ส่งต่อให้ Express ตัดการเชื่อมต่อ ตอบซ้ำไม่ได้
/**
 * error ที่เป็นความผิดของคำขอ ไม่ใช่ของระบบ — ตัวอ่าน JSON (body-parser) ตั้ง status 4xx + expose มาให้แล้ว
 * เช่น body ใหญ่เกิน (413) หรือ JSON เสีย (400) · เดิมตอบ 500 ทุกกรณีและ log เป็น error จริง
 * ใครก็ยิงเพิ่มได้จน log เต็ม error ปลอมและมองไม่เห็นของจริง (BUG-API-002/003)
 */
const CLIENT_ERROR_MESSAGES: Record<string, string> = {
  "entity.too.large": "ข้อมูลที่ส่งมามีขนาดใหญ่เกินกำหนด",
  "entity.parse.failed": "รูปแบบข้อมูลไม่ถูกต้อง",
  "encoding.unsupported": "รูปแบบการเข้ารหัสข้อมูลไม่รองรับ",
  "charset.unsupported": "รูปแบบการเข้ารหัสข้อมูลไม่รองรับ",
};

const numberOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);

function clientErrorOf(err: unknown): { status: number; message: string } | null {
  if (typeof err !== "object" || err === null) return null;
  const e = err as { status?: unknown; statusCode?: unknown; expose?: unknown; type?: unknown };
  const status = numberOrNull(e.status) ?? numberOrNull(e.statusCode);
  if (status === null || status < 400 || status >= 500 || e.expose !== true) return null;
  const message = (typeof e.type === "string" && CLIENT_ERROR_MESSAGES[e.type]) || "คำขอไม่ถูกต้อง";
  return { status, message };
}

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const clientError = clientErrorOf(err);
  if (clientError) {
    // คำขอผิดรูปแบบ — บันทึกสั้น ๆ ระดับเตือน ไม่ใช่ error ของระบบ
    console.warn(`[${req.requestId ?? "-"}] ${req.method} ${req.originalUrl} → ${clientError.status} ${clientError.message}`);
    if (res.headersSent) {
      next(err);
      return;
    }
    res.status(clientError.status).json({ error: clientError.message, requestId: req.requestId });
    return;
  }
  console.error(`[${req.requestId ?? "-"}] ${req.method} ${req.originalUrl} @${INSTANCE_ID}:`, err);
  if (res.headersSent) {
    next(err);
    return;
  }
  // ทั้งสองแอปโชว์ข้อความ error ตรง ๆ — ใส่รหัสอ้างอิง 8 ตัวแรกให้ผู้ใช้แจ้งมาได้ (ค้นด้วยต้นเลขใน log ก็เจอ)
  const ref = req.requestId?.slice(0, 8);
  res.status(500).json({
    error: `เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง หากยังไม่ได้ให้แจ้งทีมงานพร้อมรหัสอ้างอิง ${ref ?? "-"}`,
    requestId: req.requestId,
  });
});
