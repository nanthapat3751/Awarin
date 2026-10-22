import { Router } from "express";
import multer from "multer";

import {
  getCompanyLogos,
  LOGO_LIMITS,
  LogoError,
  resetCompanyLogo,
  saveCompanyLogo,
} from "../../lib/company-logo";
import { companyLogoDataUri } from "../../lib/pdf/letterhead";
import { requireAuth } from "../../middleware/auth";
import { isValidPromptPayId, promptPayQrDataUrl } from "../../lib/promptpay";
import { requireRole } from "../../middleware/rbac";
import { getTakeoffRules, saveTakeoffRules } from "../../lib/takeoff-rules";
import { slipProvider } from "../../lib/slip/provider";
import { takeoffRulesSchema, updateSettingsSchema } from "./settings.schemas";
import { getAllSettings, getPublicSettings, SettingsError, updateSettings } from "./settings.service";

export const settingsRouter = Router();

settingsRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

settingsRouter.get("/", async (_req, res) => {
  const settings = await getAllSettings();
  res.json({ settings });
});

/**
 * QR ทดสอบ 1 บาท — ให้เจ้าของสแกนด้วยแอปธนาคารของตัวเองก่อนใช้จริง ว่าชื่อผู้รับที่แอปแสดงถูกบัญชี
 * เลขพร้อมเพย์ผิดหนึ่งหลัก = เงินลูกค้าเข้าบัญชีคนอื่น · รับเลขทาง body (ไม่ใส่ใน URL — เป็นเบอร์มือถือได้)
 */
settingsRouter.post("/promptpay-preview", async (req, res) => {
  const promptPay = typeof req.body?.promptPay === "string" ? req.body.promptPay : "";
  if (!isValidPromptPayId(promptPay)) {
    res.status(400).json({ error: "พร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก (ขึ้นต้น 0) หรือเลขประจำตัวผู้เสียภาษี 13 หลัก" });
    return;
  }
  res.json({ amount: 1, dataUrl: await promptPayQrDataUrl(promptPay, 1) });
});

settingsRouter.patch("/", async (req, res) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    await updateSettings(parsed.data, { id: req.user!.id, role: req.user!.role });
  } catch (err) {
    // ตั้งแต่มีการแยกค่าดำเนินการกับกำไร เซอร์วิสนี้ปฏิเสธคำขอได้ (ค่าดำเนินการเกินอัตรารวม)
    if (err instanceof SettingsError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
  const settings = await getAllSettings();
  res.json({ settings });
});

// ---------- ชุดกฎการถอดปริมาณ (ชุดเสนอราคา / ชุดสั่งตัด) ----------
// อ่านได้ทุกคนฝั่งบริษัท (หน้าต่างคำนวณโครงสร้างต้องรู้ชุดเสนอราคา) · แก้ได้เฉพาะเจ้าของ
settingsRouter.get("/takeoff-rules", async (_req, res) => {
  res.json({ rules: await getTakeoffRules() });
});

settingsRouter.put("/takeoff-rules", requireRole("OWNER"), async (req, res) => {
  const parsed = takeoffRulesSchema.safeParse(req.body?.rules);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลชุดกฎไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  res.json({ rules: await saveTakeoffRules(parsed.data, req.user!.id) });
});

// ---------- โลโก้บนเอกสาร ----------
// หน้าจอย่อรูปเป็น PNG สองขนาดมาให้แล้ว (ใหญ่สำหรับหัวจดหมาย · เล็กสำหรับแถบท้ายทุกหน้า)
// เซิร์ฟเวอร์ไม่มีตัวย่อรูป จึงแค่ตรวจว่าเป็น PNG ขนาดไม่เกินเพดานจริง ๆ — ดู lib/company-logo.ts
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_LIMITS.large.maxBytes, files: 2 },
}).fields([
  { name: "logo", maxCount: 1 },
  { name: "logoSmall", maxCount: 1 },
]);

settingsRouter.get("/logo", async (_req, res) => {
  const { logo, custom } = await getCompanyLogos();
  // ส่งโลโก้ตั้งต้นมาด้วย ให้หน้าจอโชว์ตัวอย่างตอนกด "กลับไปใช้โลโก้เดิม" ได้ก่อนกดบันทึก
  res.json({ logo, custom, defaultLogo: companyLogoDataUri() });
});

// POST ให้ตรงกับ apiUpload ของหน้าจอ (อัปโหลดทุกที่ในแอปใช้ POST) — ผลคือแทนที่โลโก้เดิมทั้งคู่
settingsRouter.post("/logo", (req, res, next) => {
  logoUpload(req, res, async (err: unknown) => {
    if (err) {
      const message =
        err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
          ? `ไฟล์โลโก้ใหญ่เกิน ${Math.round(LOGO_LIMITS.large.maxBytes / 1024)} KB`
          : "อัปโหลดโลโก้ไม่สำเร็จ";
      res.status(400).json({ error: message });
      return;
    }
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const large = files?.logo?.[0];
    const small = files?.logoSmall?.[0];
    if (!large || !small) {
      res.status(400).json({ error: "ต้องส่งรูปโลโก้มาทั้งสองขนาด" });
      return;
    }
    try {
      await saveCompanyLogo(large.buffer, small.buffer, req.user!.id);
      const { logo, custom } = await getCompanyLogos();
      res.json({ logo, custom });
    } catch (e) {
      if (e instanceof LogoError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      next(e);
    }
  });
});

settingsRouter.delete("/logo", async (req, res) => {
  await resetCompanyLogo(req.user!.id);
  const { logo, custom } = await getCompanyLogos();
  res.json({ logo, custom });
});

export const publicSettingsRouter = Router();

publicSettingsRouter.get("/", async (_req, res) => {
  const settings = await getPublicSettings();
  // ระบบที่เปิดอยู่จริงบนเซิร์ฟเวอร์ — หน้านโยบายความเป็นส่วนตัวบอกผู้รับข้อมูลตามนี้ (ไม่เขียนถึงบริการที่ไม่ได้ใช้)
  res.json({ settings, features: { slipCheck: slipProvider() !== null } });
});
