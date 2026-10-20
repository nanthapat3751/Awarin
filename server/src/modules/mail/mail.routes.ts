import { looksLikeEmail, normalizeEmail, type MailTestResultDto } from "@systemboq/shared-types";
import { Router } from "express";
import { z } from "zod";

import { writeAuditLog } from "../../lib/audit-log";
import { composeMail } from "../../lib/mail-template";
import { describeSmtpError, mailStatus, sendMail, transportMode, verifyMailTransport } from "../../lib/mailer";
import { createRateLimiter } from "../../lib/rate-limit";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";

/**
 * สถานะการส่งอีเมล + ตรวจการเชื่อมต่อ + ส่งเมลทดสอบ — เฉพาะ OWNER
 *
 * ปลายทางของเมลทดสอบให้ OWNER พิมพ์เองได้ (อีเมลในบัญชีอาจเป็นกล่องที่ไม่มีใครเปิดอ่าน) จึงต้องกัน
 * ไม่ให้กลายเป็นช่องยิงเมลออกจากโดเมนบริษัท: เนื้อเมลตายตัว แก้ไม่ได้ + จำกัด 5 ฉบับ / 10 นาที
 * + บันทึกลง AuditLog ทุกครั้ง
 */
export const mailRouter = Router();

mailRouter.use(requireAuth, requireRole("OWNER"));

const testMailLimiter = createRateLimiter({ name: "test-mail", windowMs: 10 * 60_000, max: 5 });

const testMailSchema = z.object({ to: z.string().trim().min(1).max(254) });

mailRouter.get("/", async (_req, res) => {
  res.json(await mailStatus());
});

mailRouter.post("/verify", async (_req, res) => {
  await verifyMailTransport();
  res.json(await mailStatus());
});

function testMail(sentBy: string, to: string) {
  const when = new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
  return composeMail("ทดสอบการส่งอีเมล", {
    preheader: "ระบบส่งอีเมลของบริษัทใช้งานได้ตามปกติ",
    recipientName: null,
    account: to,
    topic: "ทดสอบการส่งอีเมลจากระบบ",
    paragraphs: [
      "ถ้าคุณได้รับอีเมลนี้ แสดงว่าระบบส่งอีเมลถึงผู้รับได้ตามปกติ",
      "อีเมลยืนยันการสมัครสมาชิกและอีเมลตั้งรหัสผ่านใหม่จะส่งผ่านช่องทางเดียวกันนี้",
    ],
    notes: [`สั่งส่งโดย ${sentBy} เมื่อ ${when} น.`],
  });
}

mailRouter.post("/test", testMailLimiter, async (req, res) => {
  const parsed = testMailSchema.safeParse(req.body);
  const to = parsed.success ? normalizeEmail(parsed.data.to) : "";
  if (!looksLikeEmail(to)) {
    res.status(400).json({ error: "รูปแบบอีเมลปลายทางไม่ถูกต้อง" });
    return;
  }

  const mode = transportMode();
  const sent = await sendMail({ to, ...(await testMail(req.user!.fullName, to)) });

  await writeAuditLog({
    userId: req.user!.id,
    action: "MAIL_TEST",
    entityType: "Mail",
    // เก็บแค่โดเมนปลายทาง — อีเมลเต็มของคนอื่นไม่จำเป็นต้องค้างอยู่ใน log หนึ่งปี
    details: { mode, sent, toDomain: to.slice(to.indexOf("@") + 1) },
    ip: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });

  if (!sent) {
    // sendMail บันทึกสาเหตุไว้ใน MailTransportCheck แล้ว — ส่งข้อความเดียวกันกลับไปให้หน้าเว็บ
    const problem = (await mailStatus()).lastCheck?.problem ?? describeSmtpError(null);
    res.status(502).json({ error: problem });
    return;
  }

  const result: MailTestResultDto = { mode, to, deliveredForReal: mode === "smtp" };
  res.json(result);
});
