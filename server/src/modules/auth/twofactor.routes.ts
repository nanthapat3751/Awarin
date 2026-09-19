import { Router } from "express";

import { createRateLimiter } from "../../lib/rate-limit";
import { resolveCookieName, setSessionCookie } from "../../lib/session-cookie";
import { requireAuth } from "../../middleware/auth";
import { AuthError } from "./auth.error";
import { completeTwoFactor } from "./auth.service";
import { deleteAccountSchema, twoFactorTokenSchema, verifyTwoFactorSchema } from "./auth.schemas";
import {
  activateTotp,
  disableTotp,
  getTwoFactorStatus,
  regenerateBackupCodes,
  revealTotpForNewDevice,
  startTotpSetup,
} from "./twofactor.service";

// จำกัดอัตราการยืนยันรหัส 2FA กันเดารหัสแบบยิงรัว (TOTP มี 1 ล้านค่า/รอบ + limiter ทำให้ brute
// force แทบเป็นไปไม่ได้)
const verifyLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 30 });

export const twoFactorRouter = Router();

function meta(req: import("express").Request) {
  return { ip: req.ip, userAgent: req.get("user-agent") };
}

// ── ขั้นที่สองของการล็อกอิน: ยืนยันรหัส 2FA ด้วย session ครึ่งทาง (ไม่ผ่าน requireAuth) ──
twoFactorRouter.post("/verify", verifyLimiter, async (req, res) => {
  const parsed = verifyTwoFactorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  const cookieName = resolveCookieName(req.headers.origin, req.cookies ?? {});
  const token = req.cookies?.[cookieName] as string | undefined;
  if (!token) {
    res.status(401).json({ error: "ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่" });
    return;
  }

  try {
    const { user, expiresAt } = await completeTwoFactor(token, parsed.data.code, meta(req));
    setSessionCookie(res, cookieName, token, expiresAt); // ต่ออายุ cookie เป็น session เต็ม
    res.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ── การจัดการ 2FA ของบัญชีตัวเอง (ต้องล็อกอินเต็มแล้ว) ──
twoFactorRouter.get("/status", requireAuth, async (req, res) => {
  res.json(await getTwoFactorStatus(req.user!.id));
});

twoFactorRouter.post("/setup", requireAuth, async (req, res) => {
  try {
    res.json(await startTotpSetup(req.user!.id, req.user!.email));
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

twoFactorRouter.post("/activate", requireAuth, async (req, res) => {
  const parsed = twoFactorTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await activateTotp(req.user!.id, parsed.data.token, meta(req)));
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

twoFactorRouter.post("/disable", requireAuth, async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body); // { currentPassword }
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    await disableTotp(req.user!.id, parsed.data.currentPassword, meta(req));
    res.status(204).end();
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// เพิ่มอุปกรณ์ (มือถือเครื่องอื่น): ยืนยันรหัสผ่าน แล้วโชว์ QR ของ secret เดิมซ้ำ (ไม่สร้างใหม่ →
// เครื่องเก่ายังใช้ได้)
twoFactorRouter.post("/add-device", requireAuth, async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body); // { currentPassword }
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    const result = await revealTotpForNewDevice(
      req.user!.id,
      req.user!.email,
      parsed.data.currentPassword,
      meta(req),
    );
    res.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

twoFactorRouter.post("/backup-codes", requireAuth, async (req, res) => {
  const parsed = twoFactorTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await regenerateBackupCodes(req.user!.id, parsed.data.token, meta(req)));
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
