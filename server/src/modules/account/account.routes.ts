import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";

import { SignatureImageError } from "../../lib/signature-image";
import { getPasswordChangedAt } from "../auth/auth.service";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { setRecoveryEmailSchema, updateMyProfileSchema, verifyRecoveryEmailSchema } from "./account.schemas";
import {
  AvatarError,
  getMySignature,
  listMySessions,
  removeMyAvatar,
  removeMySignature,
  revokeMySession,
  revokeOtherSessions,
  SessionError,
  setMyAvatar,
  setMySignature,
  updateMyProfile,
} from "./account.service";
import { getLoginHistory } from "./login-history.service";
import {
  RecoveryEmailError,
  resendRecoveryCode,
  setRecoveryEmail,
  verifyRecoveryEmail,
} from "./recovery-email.service";

// หน้า "บัญชีของฉัน" ของพนักงาน — แก้ได้เฉพาะบัญชีตัวเอง (ไม่มี :id ในเส้นทางเลย)
// ลูกค้ามีโปรไฟล์ของตัวเองแยกอยู่แล้วที่ /api/auth/me/profile
export const accountRouter = Router();
accountRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

// เก็บในหน่วยความจำ ไม่ลงดิสก์ — ไฟล์ที่อัปมาไม่ถูกเก็บเลย เก็บเฉพาะรูปที่ sharp สร้างใหม่
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) cb(null, true);
    else cb(new AvatarError("รองรับเฉพาะไฟล์ JPEG / PNG / WEBP"));
  },
});

const metaOf = (req: Request) => ({ ip: req.ip, userAgent: req.get("user-agent") });

// แถว "รหัสผ่าน · เปลี่ยนล่าสุด…" ในหมวดความปลอดภัย — null = บัญชีเก่าก่อนระบบเก็บเวลานี้ (หน้าจอไม่โชว์)
accountRouter.get("/security", async (req, res) => {
  const passwordChangedAt = await getPasswordChangedAt(req.user!.id);
  res.json({ passwordChangedAt: passwordChangedAt?.toISOString() ?? null });
});

accountRouter.patch("/profile", async (req, res) => {
  const parsed = updateMyProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      details: parsed.error.flatten(),
    });
    return;
  }
  const user = await updateMyProfile(req.user!.id, parsed.data, metaOf(req));
  res.json({ user });
});

function uploadErrorMessage(err: unknown, tooLarge = "ไฟล์ใหญ่เกิน 5 MB"): string {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") return tooLarge;
  if (err instanceof AvatarError || err instanceof SignatureImageError) return err.message;
  return "อัปโหลดไม่สำเร็จ";
}

/**
 * อัปโหลดรูปโปรไฟล์ของ "ตัวเอง" — ใช้ร่วมกันทั้งพนักงาน (/api/account/avatar) และลูกค้า
 * (/api/auth/me/avatar) ด่านสิทธิ์อยู่ที่ router ของแต่ละฝั่ง ตัวนี้ไม่ตรวจบทบาท
 */
export function handleAvatarUpload(req: Request, res: Response, next: NextFunction): void {
  avatarUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ error: uploadErrorMessage(err) });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "ไม่พบไฟล์ที่อัปโหลด" });
      return;
    }
    setMyAvatar(req.user!.id, req.file.buffer, metaOf(req))
      .then((user) => res.status(201).json({ user }))
      .catch((e: unknown) => {
        if (e instanceof AvatarError) res.status(400).json({ error: e.message });
        else next(e);
      });
  });
}

export async function handleAvatarRemove(req: Request, res: Response): Promise<void> {
  const user = await removeMyAvatar(req.user!.id, metaOf(req));
  res.json({ user });
}

accountRouter.post("/avatar", handleAvatarUpload);
accountRouter.delete("/avatar", handleAvatarRemove);

// ─────────────────────────── อุปกรณ์ที่เข้าสู่ระบบ ───────────────────────────

accountRouter.get("/sessions", async (req, res) => {
  res.json({ sessions: await listMySessions(req.user!.id, req.sessionId!) });
});

// ─────────────────────────── อีเมลกู้รหัสผ่าน ───────────────────────────

async function recoveryEmailRoute(res: Response, run: () => Promise<void>) {
  try {
    await run();
  } catch (err) {
    if (err instanceof RecoveryEmailError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
}

accountRouter.post("/email", (req, res) =>
  recoveryEmailRoute(res, async () => {
    const parsed = setRecoveryEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
      return;
    }
    res.json(await setRecoveryEmail(req.user!.id, parsed.data.email, parsed.data.currentPassword, metaOf(req)));
  }),
);

accountRouter.post("/email/send-code", (req, res) =>
  recoveryEmailRoute(res, async () => {
    res.json({ code: await resendRecoveryCode(req.user!.id) });
  }),
);

accountRouter.post("/email/verify", (req, res) =>
  recoveryEmailRoute(res, async () => {
    const parsed = verifyRecoveryEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
      return;
    }
    res.json({ user: await verifyRecoveryEmail(req.user!.id, parsed.data.code) });
  }),
);

// ประวัติการเข้าสู่ระบบ + ความปลอดภัย ย้อนหลัง 90 วัน หน้าละ 15 รายการ (?page=2)
accountRouter.get("/login-history", async (req, res) => {
  const page = typeof req.query.page === "string" ? Number(req.query.page) : 1;
  res.json(await getLoginHistory(req.user!.id, page));
});

// ต้องอยู่ก่อน /sessions/:handle ไม่งั้น "others" ถูกตีความเป็น handle
accountRouter.post("/sessions/revoke-others", async (req, res) => {
  const count = await revokeOtherSessions(req.user!.id, req.sessionId!, metaOf(req));
  res.json({ count });
});

accountRouter.delete("/sessions/:handle", async (req: Request<{ handle: string }>, res) => {
  try {
    await revokeMySession(req.user!.id, req.sessionId!, req.params.handle, metaOf(req));
    res.status(204).end();
  } catch (err) {
    if (err instanceof SessionError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ─────────────────────────── ลายเซ็น ───────────────────────────

const signatureUpload = multer({
  storage: multer.memoryStorage(),
  // 8,000,000 ไบต์ (8 MB ฐานสิบ) — เพดานที่ SonarQube ถือว่าปลอดภัย (S5693) · รูปลายเซ็นจริงเล็กกว่านี้มาก
  limits: { fileSize: 8_000_000, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) cb(null, true);
    else cb(new SignatureImageError("รองรับเฉพาะไฟล์ JPEG / PNG / WEBP"));
  },
});

accountRouter.get("/signature", async (req, res) => {
  res.json({ signature: await getMySignature(req.user!.id) });
});

accountRouter.post("/signature", (req, res, next) => {
  signatureUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ error: uploadErrorMessage(err, "ไฟล์ใหญ่เกิน 8 MB") });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "ไม่พบไฟล์ลายเซ็น" });
      return;
    }
    setMySignature(req.user!.id, req.file.buffer, metaOf(req))
      .then((signature) => res.json({ signature }))
      .catch((e: unknown) => {
        if (e instanceof SignatureImageError) res.status(400).json({ error: e.message });
        else next(e);
      });
  });
});

accountRouter.delete("/signature", async (req, res) => {
  await removeMySignature(req.user!.id, metaOf(req));
  res.status(204).end();
});
