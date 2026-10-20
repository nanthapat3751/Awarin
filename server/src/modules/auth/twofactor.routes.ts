import { Router } from "express";

import { rememberDevice } from "../../lib/known-device";
import { createRateLimiter } from "../../lib/rate-limit";
import { resolveCookieName, setSessionCookie } from "../../lib/session-cookie";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
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

// จำกัดอัตราการยืนยันรหัส 2FA ต่อไอพี — ชั้นแรกกันยิงรัว · เพดานจริงอยู่ที่บัญชี (reserveTwoFactorAttempt)
// เพราะคนที่รู้รหัสผ่านแล้วสลับไอพีได้
const verifyLimiter = createRateLimiter({ name: "2fa-verify", windowMs: 15 * 60_000, max: 30 });

/**
 * ชื่อบัญชีที่โชว์ในแอป Authenticator — พนักงานใช้ชื่อผู้ใช้ (ไม่มีอีเมลแล้ว)
 * ลูกค้ายังเป็นอีเมล · เหลือชื่อ-นามสกุลเป็นทางสุดท้ายเพื่อไม่ให้ป้ายว่าง
 */
function totpLabel(user: { username: string | null; email: string | null; fullName: string }): string {
  return user.username ?? user.email ?? user.fullName;
}

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
    await rememberDevice(req, res, user, token);
    res.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      // ถูกระงับ → บอกเวลารอ · เซสชันครึ่งทางถูกทิ้ง → บอกให้หน้าล็อกอินกลับไปขั้นกรอกรหัสผ่าน
      if (err.retryAfterSeconds != null) res.setHeader("Retry-After", String(err.retryAfterSeconds));
      res.status(err.status).json({
        error: err.message,
        ...(err.retryAfterSeconds != null && { retryAfter: err.retryAfterSeconds }),
        ...(err.restartLogin && { restartLogin: true }),
      });
      return;
    }
    throw err;
  }
});

// ── การจัดการ 2FA ของบัญชีตัวเอง (ต้องล็อกอินเต็มแล้ว) ──
// เฉพาะพนักงาน (BUG-API-001): พอร์ทัลลูกค้าไม่มีขั้นกรอกรหัส 2FA — ถ้าลูกค้า (หรือคนที่ได้เซสชันลูกค้าไป)
// เปิด 2FA ได้ การเข้าสู่ระบบครั้งถัดไปจะติดขั้นที่หน้าเว็บลูกค้าทำไม่ได้ เจ้าของบัญชีจึงเข้าไม่ได้อีก
const staffOnly = [requireAuth, requireRole("OWNER", "ADMIN")];

twoFactorRouter.get("/status", ...staffOnly, async (req, res) => {
  res.json(await getTwoFactorStatus(req.user!.id));
});

twoFactorRouter.post("/setup", ...staffOnly, async (req, res) => {
  try {
    res.json(await startTotpSetup(req.user!.id, totpLabel(req.user!)));
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

twoFactorRouter.post("/activate", ...staffOnly, async (req, res) => {
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

twoFactorRouter.post("/disable", ...staffOnly, async (req, res) => {
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
twoFactorRouter.post("/add-device", ...staffOnly, async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body); // { currentPassword }
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    const result = await revealTotpForNewDevice(
      req.user!.id,
      totpLabel(req.user!),
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

twoFactorRouter.post("/backup-codes", ...staffOnly, async (req, res) => {
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
