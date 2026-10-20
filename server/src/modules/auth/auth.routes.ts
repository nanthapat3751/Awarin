import { Router, type Response } from "express";

import { domainAcceptsMail } from "../../lib/email-domain";
import {
  changeSignupEmail,
  confirmEmailCode,
  findUnverifiedCustomer,
  sendVerificationCode,
} from "./email-verification.service";
import {
  inspectResetToken,
  requestPasswordReset,
  requestStaffPasswordReset,
  resetPassword,
  verifyResetCode,
} from "./password-reset.service";
import { rememberDevice } from "../../lib/known-device";
import { passwordIssueMessage } from "../../lib/password-field";
import { createRateLimiter } from "../../lib/rate-limit";
import {
  CUSTOMER_COOKIE_NAME,
  resolveCookieName,
  setSessionCookie,
  STAFF_COOKIE_NAME,
} from "../../lib/session-cookie";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { handleAvatarRemove, handleAvatarUpload } from "../account/account.routes";
import {
  AuthError,
  changePassword,
  deleteMyAccount,
  getAccessTokenInfo,
  getAuthenticatedUser,
  getCustomerProfile,
  getPasswordChangedAt,
  login,
  logout,
  redeemAccessToken,
  registerCustomer,
  updateCustomerProfile,
} from "./auth.service";
import {
  changePasswordSchema,
  deleteAccountSchema,
  customerLoginSchema,
  forgotPasswordSchema,
  staffForgotPasswordSchema,
  resetPasswordSchema,
  verifyResetCodeSchema,
  staffLoginSchema,
  redeemAccessSchema,
  registerCustomerSchema,
  resendCodeSchema,
  changeSignupEmailSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from "./auth.schemas";

const loginLimiter = createRateLimiter({ name: "login", windowMs: 15 * 60_000, max: 20 });
// การสมัครสมาชิกไม่มีตัวล็อกบัญชีรองรับเหมือนการล็อกอิน จึงต้องมีลิมิต (ที่หลวมกว่า) ของ
// ตัวเอง เพื่อกันการสแปม/การกวาดหาบัญชีผ่านการสมัคร
const registerLimiter = createRateLimiter({ name: "register", windowMs: 60 * 60_000, max: 10 });
// ลิงก์เข้าใช้เป็น token สุ่ม 256-bit อยู่แล้ว แต่ใส่ลิมิตกันการยิงสุ่ม/สแปมเปิดลิงก์ไว้ด้วย
const accessLinkLimiter = createRateLimiter({ name: "access-link", windowMs: 15 * 60_000, max: 30 });
// ยืนยันอีเมล: กรอกรหัสผิดมีเพดานรายบัญชีอยู่แล้ว ลิมิตต่อไอพีนี้กันการไล่ยิงข้ามหลายบัญชีพร้อมกัน
const verifyEmailLimiter = createRateLimiter({ name: "verify-email", windowMs: 15 * 60_000, max: 30 });
// ขอรหัสใหม่: มีช่วงพัก 60 วินาทีรายบัญชีอยู่แล้ว อันนี้กันใช้ระบบเรายิงเมลถล่มหลายอีเมลรวดเดียว
const resendCodeLimiter = createRateLimiter({ name: "resend-code", windowMs: 60 * 60_000, max: 10 });
/*
 * ลืมรหัสผ่าน — ใช้เพดานเดียวกับการล็อกอิน (20 ครั้ง/15 นาที/ไอพี)
 *
 * เดิมตั้งไว้ 10 ครั้ง/ชั่วโมง ซึ่งแน่นเกินไปจนใช้งานจริงไม่ได้: ลิมิตนับ "ต่อไอพี" ไม่ใช่ต่อคน
 * ออฟฟิศ มหาวิทยาลัย หรือเน็ตมือถือที่ออกเน็ตผ่านไอพีเดียวกัน จะใช้โควตาร่วมกันทั้งหมด
 * สิบครั้งต่อชั่วโมงหมดได้ด้วยคนไม่กี่คนที่กดผิดกดถูก
 *
 * ผ่อนได้เพราะด่านจริงอยู่ที่อื่นอยู่แล้ว: หนึ่งบัญชีได้เมลไม่เกิน 1 ฉบับต่อ 60 วินาที (ช่วงพักใน
 * password-reset.service) และคำตอบของปลายทางนี้เหมือนกันทุกกรณี การไล่ยิงจึงไม่ได้ข้อมูลอะไรกลับไป
 */
const forgotPasswordLimiter = createRateLimiter({ name: "forgot-password", windowMs: 15 * 60_000, max: 20 });
// ตั้งรหัสใหม่: token เดาไม่ได้อยู่แล้ว (256 บิต) ลิมิตนี้กันคนยิงรัวเพื่อกินทรัพยากรเครื่องเป็นหลัก
const avatarLimiter = createRateLimiter({ name: "avatar", windowMs: 60 * 60_000, max: 30 });
const resetPasswordLimiter = createRateLimiter({ name: "reset-password", windowMs: 15 * 60_000, max: 30 });

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
  const parsed = staffLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: passwordIssueMessage(parsed.error) ?? "ข้อมูลไม่ถูกต้อง",
      details: parsed.error.flatten(),
    });
    return;
  }

  try {
    const { user, token, expiresAt, twoFactorRequired } = await login({
      credential: { kind: "username", value: parsed.data.username },
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
    await rememberDevice(req, res, user, token);
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
    res.status(400).json({
      error: passwordIssueMessage(parsed.error) ?? "ข้อมูลไม่ถูกต้อง",
      details: parsed.error.flatten(),
    });
    return;
  }

  // ถาม DNS ว่าโดเมนรับเมลได้จริงไหม — ทำนอกสคีมาเพราะ safeParse เป็น sync
  // ปล่อยผ่านเมื่อ DNS ตอบไม่ได้ (ดูเหตุผลใน lib/email-domain.ts)
  if (!(await domainAcceptsMail(parsed.data.email))) {
    res.status(400).json({ error: "โดเมนของอีเมลนี้รับอีเมลไม่ได้ กรุณาตรวจสอบอีกครั้ง" });
    return;
  }

  try {
    const { user, signupTicket } = await registerCustomer(parsed.data);
    // สมัครแล้วยังเข้าระบบไม่ได้จนกว่าจะยืนยันอีเมล — ส่งรหัสทันทีตรงนี้
    // ส่งไม่ออกก็ยังตอบ 201 เพราะบัญชีถูกสร้างไปแล้วจริง ๆ หน้าเว็บจะพาไปหน้ากรอกรหัส
    // ที่มีปุ่ม "ส่งรหัสใหม่" ให้กดเองได้
    let codeSent = true;
    try {
      const result = await sendVerificationCode(user);
      codeSent = result.sent;
    } catch {
      codeSent = false;
    }
    // signupTicket: ให้เบราว์เซอร์ที่สมัครเก็บไว้ ใช้แก้อีเมลที่พิมพ์ผิดจากหน้ายืนยันได้
    res.status(201).json({ user, verificationRequired: true, codeSent, signupTicket });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

/**
 * ยืนยันอีเมลด้วยรหัส 6 หลัก — ผ่านแล้วบัญชีเข้าใช้งานได้ทันที (แต่ยังต้องล็อกอินเอง
 * ไม่ออก session ให้ตรงนี้ เพราะใครก็ยิงปลายทางนี้ได้โดยไม่ต้องรู้รหัสผ่าน)
 */
authRouter.post("/customer/verify-email", verifyEmailLimiter, async (req, res) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: passwordIssueMessage(parsed.error) ?? "ข้อมูลไม่ถูกต้อง",
      details: parsed.error.flatten(),
    });
    return;
  }
  try {
    await confirmEmailCode(parsed.data.email, parsed.data.code);
    res.json({ verified: true });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

/**
 * ขอรหัสใหม่ — ตอบเหมือนกันเสมอไม่ว่าอีเมลนั้นจะมีบัญชีที่รอยืนยันอยู่หรือไม่
 * ไม่งั้นปลายทางนี้กลายเป็นเครื่องมือไล่ถามว่าอีเมลไหนสมัครไว้แล้ว
 */
authRouter.post("/customer/verify-email/resend", resendCodeLimiter, async (req, res) => {
  const parsed = resendCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: passwordIssueMessage(parsed.error) ?? "ข้อมูลไม่ถูกต้อง",
      details: parsed.error.flatten(),
    });
    return;
  }
  const user = await findUnverifiedCustomer(parsed.data.email);
  if (!user) {
    res.json({ sent: true, retryAfterSeconds: 60 });
    return;
  }
  try {
    const result = await sendVerificationCode(user);
    res.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

/**
 * แก้อีเมลที่พิมพ์ผิดจากหน้ายืนยัน (ต้องมีตั๋วจากตอนสมัคร) — ถาม DNS แบบเดียวกับตอนสมัคร
 * ใช้เพดานเดียวกับปุ่ม "ส่งรหัสใหม่" เพราะทุกครั้งที่แก้คือการส่งรหัสไปอีเมลใหม่หนึ่งฉบับ
 */
authRouter.post("/customer/verify-email/change-email", resendCodeLimiter, async (req, res) => {
  const parsed = changeSignupEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  if (!(await domainAcceptsMail(parsed.data.newEmail))) {
    res.status(400).json({ error: "โดเมนของอีเมลนี้รับอีเมลไม่ได้ กรุณาตรวจสอบอีกครั้ง" });
    return;
  }
  try {
    res.json(await changeSignupEmail(parsed.data.email, parsed.data.ticket, parsed.data.newEmail));
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

authRouter.post("/customer/login", loginLimiter, async (req, res) => {
  const parsed = customerLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: passwordIssueMessage(parsed.error) ?? "ข้อมูลไม่ถูกต้อง",
      details: parsed.error.flatten(),
    });
    return;
  }

  try {
    const { user, token, expiresAt, twoFactorRequired } = await login({
      credential: { kind: "email", value: parsed.data.email },
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
    await rememberDevice(req, res, user, token);
    res.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      sendAuthError(res, err);
      return;
    }
    throw err;
  }
});

// ── ลืมรหัสผ่าน (public) ──

/*
 * ขอลิงก์ตั้งรหัสผ่านใหม่
 *
 * **ตอบเหมือนกันทุกกรณี และตอบก่อนลงมือทำจริง** — ถ้ารอส่งเมลเสร็จค่อยตอบ คำขอที่มีบัญชีจริง
 * จะช้ากว่าคำขอที่ไม่มีบัญชีอย่างเห็นได้ชัด กลายเป็นบอกใบ้ว่าอีเมลไหนเป็นลูกค้าเรา
 * งานหลังจากนี้จึงห้ามแตะ res อีกเลย และต้องกลืน error เองทั้งหมด
 */
authRouter.post("/customer/forgot-password", forgotPasswordLimiter, (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "รูปแบบอีเมลไม่ถูกต้อง" });
    return;
  }

  res.json({ ok: true });

  void requestPasswordReset(parsed.data.email, req.ip).catch((err: unknown) => {
    console.error("[forgot-password] ทำงานเบื้องหลังไม่สำเร็จ", err);
  });
});

// เปิดลิงก์: บอกว่ากำลังตั้งรหัสให้บัญชีไหน (อีเมลปิดบางส่วน) — ไม่เผา token ทิ้ง เพราะ
// โปรแกรมอ่านเมล/ตัวสแกนความปลอดภัยชอบกดลิงก์ล่วงหน้าเอง
authRouter.get("/customer/reset-password/:token", resetPasswordLimiter, async (req, res) => {
  try {
    res.json(await inspectResetToken(req.params.token));
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ยืนยันรหัส 6 หลักจากเมลแทนการกดลิงก์ — ถูกแล้วได้ลิงก์ใหม่ไปตั้งรหัสต่อในหน้าเดิม
// ข้อความผิดพลาดเหมือนกันทุกกรณี (รหัสผิด / หมดอายุ / ไม่มีบัญชีนี้) ดู CODE_INVALID
authRouter.post("/customer/reset-password/verify-code", resetPasswordLimiter, async (req, res) => {
  const parsed = verifyResetCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  try {
    res.json(await verifyResetCode(parsed.data.email, parsed.data.code));
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ตั้งรหัสผ่านใหม่ — ตั้งใจไม่ออก session ให้ ต้องไปล็อกอินเองด้วยรหัสใหม่
authRouter.post("/customer/reset-password", resetPasswordLimiter, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    // ส่งข้อความของ zod ตรง ๆ เพราะกติกาเดียวที่ตกได้คือ "รหัสผ่านสั้นเกินไป" ซึ่งต้องบอกให้รู้
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }

  try {
    await resetPassword(parsed.data.token, parsed.data.password, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ── ลืมรหัสผ่าน ฝั่งพนักงาน (public) — ขอด้วยชื่อผู้ใช้ ลิงก์ไปที่อีเมลที่ยืนยันแล้วของบัญชีนั้น ──
// หลักเดียวกับของลูกค้า: ตอบก่อนลงมือ และตอบเหมือนกันทุกกรณี (ไม่บอกว่าชื่อผู้ใช้ไหนมีจริง/มีอีเมลไหม)

authRouter.post("/staff/forgot-password", forgotPasswordLimiter, (req, res) => {
  const parsed = staffForgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }

  res.json({ ok: true });

  void requestStaffPasswordReset(parsed.data.username, req.ip).catch((err: unknown) => {
    console.error("[staff-forgot-password] ทำงานเบื้องหลังไม่สำเร็จ", err);
  });
});

authRouter.get("/staff/reset-password/:token", resetPasswordLimiter, async (req, res) => {
  try {
    res.json(await inspectResetToken(req.params.token, "staff"));
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ตั้งเสร็จต้องไปเข้าระบบเองด้วยรหัสใหม่ (+ 2FA ถ้าเปิดไว้) — ไม่ออก session ให้จากการกดลิงก์
authRouter.post("/staff/reset-password", resetPasswordLimiter, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  try {
    await resetPassword(parsed.data.token, parsed.data.password, { ip: req.ip, userAgent: req.get("user-agent") }, "staff");
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
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
    res.status(400).json({
      error: passwordIssueMessage(parsed.error) ?? "ข้อมูลไม่ถูกต้อง",
      details: parsed.error.flatten(),
    });
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
    await rememberDevice(req, res, user, token);
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
  const [profile, passwordChangedAt] = await Promise.all([
    getCustomerProfile(req.user!.id),
    getPasswordChangedAt(req.user!.id),
  ]);
  // แยกจาก profile เพราะไม่ใช่ข้อมูลติดต่อ และ PATCH ไม่ได้แก้ค่านี้ — ใช้โชว์ "เปลี่ยนรหัสผ่านล่าสุด…"
  res.json({ profile, passwordChangedAt: passwordChangedAt?.toISOString() ?? null });
});

authRouter.patch("/me/profile", requireAuth, requireRole("CUSTOMER"), async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: passwordIssueMessage(parsed.error) ?? "ข้อมูลไม่ถูกต้อง",
      details: parsed.error.flatten(),
    });
    return;
  }
  try {
    const profile = await updateCustomerProfile(req.user!.id, parsed.data);
    const user = await getAuthenticatedUser(req.user!.id);
    res.json({ profile, user });
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

// รูปโปรไฟล์ลูกค้า — ตัวจัดการเดียวกับพนักงาน (sharp สร้างใหม่ 256×256 WebP ตัด EXIF/GPS ทิ้ง)
// จำกัดจำนวนครั้งเพราะฝั่งลูกค้าใครก็สมัครได้ และการแปลงรูปกิน CPU ทุกครั้ง
authRouter.post("/me/avatar", requireAuth, requireRole("CUSTOMER"), avatarLimiter, handleAvatarUpload);
authRouter.delete("/me/avatar", requireAuth, requireRole("CUSTOMER"), handleAvatarRemove);

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: passwordIssueMessage(parsed.error) ?? "ข้อมูลไม่ถูกต้อง",
      details: parsed.error.flatten(),
    });
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
    res.status(400).json({
      error: passwordIssueMessage(parsed.error) ?? "ข้อมูลไม่ถูกต้อง",
      details: parsed.error.flatten(),
    });
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
