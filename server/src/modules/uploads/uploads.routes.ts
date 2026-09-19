import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { Router } from "express";
import multer from "multer";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";

// รูปภาพที่อัปโหลดถูกเก็บบนดิสก์ของเซิร์ฟเวอร์ และเสิร์ฟกลับแบบ static
// (พอเหมาะสำหรับโปรเจกต์นี้ ถ้า deploy จริงควรเปลี่ยนไปใช้ object storage แทน)
// ตั้งที่อื่นได้ด้วย UPLOADS_DIR — เทสต์ใช้โฟลเดอร์ชั่วคราว ไม่งั้นไฟล์ทดสอบไปปนกับรูปจริง (ดู tests/setup-env.ts)
export const UPLOADS_DIR = path.resolve(process.cwd(), process.env.UPLOADS_DIR || "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });


const EXT_BY_MIME = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = EXT_BY_MIME.get(file.mimetype) ?? path.extname(file.originalname) ?? "";
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB (จำกัดขนาดไฟล์)
  fileFilter: (_req, file, cb) => {
    if (EXT_BY_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error("รองรับเฉพาะไฟล์ JPEG / PNG / WEBP"));
  },
});

export const uploadsRouter = Router();

uploadsRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

uploadsRouter.post("/", (req, res) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      let message = "อัปโหลดไม่สำเร็จ";
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") message = "ไฟล์ใหญ่เกิน 5 MB";
      else if (err instanceof Error) message = err.message;
      res.status(400).json({ error: message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "ไม่พบไฟล์ที่อัปโหลด" });
      return;
    }
    // ส่งเป็น path สัมพัทธ์ — middleware ต่อโดเมนให้ตอนส่งออก หน้าจอจึงยังได้ URL เต็มไปแสดงเหมือนเดิม
    // และค่าที่ถูกส่งกลับมาบันทึกจะถูกตัดโดเมนออกก่อนลงฐานข้อมูล (ดู lib/upload-urls.ts)
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});
