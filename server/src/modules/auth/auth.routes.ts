import { Router, type Response } from "express";

import { createRateLimiter } from "../../lib/rate-limit";
import {
  CUSTOMER_COOKIE_NAME,
  resolveCookieName,
  setSessionCookie,
  STAFF_COOKIE_NAME,
} from "../../lib/session-cookie";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import {
  AuthError,
  changePassword,
  deleteMyAccount,
  getAccessTokenInfo,
  getCustomerProfile,
  login,
  logout,
  redeemAccessToken,
  registerCustomer,
  updateCustomerProfile,
} from "./auth.service";
import {
  changePasswordSchema,
  deleteAccountSchema,
  loginSchema,
  redeemAccessSchema,
  registerCustomerSchema,
  updateProfileSchema,
} from "./auth.schemas";

const loginLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 20 });
// การสมัครสมาชิกไม่มีตัวล็อกบัญชีรองรับเหมือนการล็อกอิน จึงต้องมีลิมิต (ที่หลวมกว่า) ของ
// ตัวเอง เพื่อกันการสแปม/การกวาดหาบัญชีผ่านการสมัคร
const registerLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 10 });
// ลิงก์เข้าใช้เป็น token สุ่ม 256-bit อยู่แล้ว แต่ใส่ลิมิตกันการยิงสุ่ม/สแปมเปิดลิงก์ไว้ด้วย
const accessLinkLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 30 });

// ตอบ error ของ auth: แนบ retryAfter (วินาที) + header Retry-After มาตรฐานเมื่อถูกล็อก เพื่อให้
// frontend นับถอยหลังได้ (ใช้ในเส้น login ที่มีสิทธิ์เจอสถานะ 423)
function sendAuthError(res: Response, err: AuthError): void {
  if (err.retryAfterSeconds != null) {
    res.setHeader("Retry-After", String(err.retryAfterSeconds));
    res.status(err.status).json({ error: err.message, retryAfter: err.retryAfterSeconds });
    return;
  }
  res.status(err.status).json({ error: err.message });
}

export const authRouter = Router();

authRouter.post("/staff/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const { user, token, expiresAt, twoFactorRequired } = await login({
      email: parsed.data.email,
      password: parsed.data.password,
      allowedRoles: ["OWNER", "ADMIN"],
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    setSessionCookie(res, STAFF_COOKIE_NAME, token, expiresAt);
    // เปิด 2FA ไว้ → ยังไม่คืน user (ยังไม่ถือว่าล็อกอินเต็ม) ให้ frontend ไปขั้นกรอกรหัส
    if (twoFactorRequired) {
      res.json({ twoFactorRequired: true });
      return;
    }
    res.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      sendAuthError(res, err);
      return;
    }
    throw err;
  }
});

authRouter.post("/customer/register", registerLimiter, async (req, res) => {
  const parsed = registerCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await registerCustomer(parsed.data);
    res.status(201).json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

authRouter.post("/customer/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const { user, token, expiresAt, twoFactorRequired } = await login({
      email: parsed.data.email,
      password: parsed.data.password,
      allowedRoles: ["CUSTOMER"],
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    setSessionCookie(res, CUSTOMER_COOKIE_NAME, token, expiresAt);
    if (twoFactorRequired) {
      res.json({ twoFactorRequired: true });
      return;
    }
    res.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      sendAuthError(res, err);
      return;
    }
    throw err;
  }
});

// ── ลิงก์เข้าใช้ครั้งเดียว (public — token ในลิงก์ทำหน้าที่พิสูจน์ตัวตน) ──

// เปิดลิงก์: แสดงชื่อ/อีเมลของบัญชีปลายทางเพื่อให้ลูกค้ายืนยันก่อนตั้งรหัส
authRouter.get("/access/:token", accessLinkLimiter, async (req, res) => {
  try {
    res.json(await getAccessTokenInfo(req.params.token));
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ตั้งรหัสผ่านผ่านลิงก์ → เข้าระบบทันที (ออก session ลูกค้าเต็ม)
authRouter.post("/access/:token", accessLinkLimiter, async (req, res) => {
  const parsed = redeemAccessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const { user, token, expiresAt } = await redeemAccessToken(
      req.params.token,
      parsed.data.password,
      { ip: req.ip, userAgent: req.get("user-agent") },
      parsed.data.address,
    );
    setSessionCookie(res, CUSTOMER_COOKIE_NAME, token, expiresAt);
    res.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

authRouter.post("/logout", async (req, res) => {
  const cookieName = resolveCookieName(req.headers.origin, req.cookies ?? {});
  const token = req.cookies?.[cookieName] as string | undefined;
  if (token) {
    await logout(token);
  }
  res.clearCookie(cookieName, { path: "/" });
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── โปรไฟล์ลูกค้า (ข้อมูลติดต่อ): ที่อยู่ใช้พิมพ์ "ที่อยู่ผู้ว่าจ้าง" บนใบเสนอราคา/สัญญา ──
authRouter.get("/me/profile", requireAuth, requireRole("CUSTOMER"), async (req, res) => {
  res.json({ profile: await getCustomerProfile(req.user!.id) });
});

authRouter.patch("/me/profile", requireAuth, requireRole("CUSTOMER"), async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    const profile = await updateCustomerProfile(req.user!.id, parsed.data);
    res.json({ profile });
  } catch (err) {
    // ตั้งแต่มีช่องของนิติบุคคล เซอร์วิสนี้ปฏิเสธคำขอได้ (เลือกนิติบุคคลแต่ไม่มีชื่อ) —
    // ก่อนหน้านี้ไม่มี error ทางธุรกิจเลย จึงไม่เคยมี try/catch
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const { token, expiresAt } = await changePassword(req.user!.id, {
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    setSessionCookie(res, req.authCookieName!, token, expiresAt);
    res.status(204).end();
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

authRouter.post("/delete-account", requireAuth, requireRole("CUSTOMER"), async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    await deleteMyAccount(req.user!.id, parsed.data.currentPassword);
    res.clearCookie(req.authCookieName!, { path: "/" });
    res.status(204).end();
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
