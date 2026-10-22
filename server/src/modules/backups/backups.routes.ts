import { Router } from "express";

import { writeAuditLog } from "../../lib/audit-log";
import { BackupError, backupStatus, runBackup } from "../../lib/backup/backup";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";

/**
 * สถานะการสำรองข้อมูล + สั่งสำรองทันที — เฉพาะ OWNER
 *
 * ไม่มีปุ่มดาวน์โหลดไฟล์สำรองทางเว็บโดยตั้งใจ: ไฟล์นั้นคือทั้งฐานข้อมูล (รหัสผ่านที่แฮชแล้ว ข้อมูลลูกค้า
 * ทุกคน ราคาทุน) บัญชี OWNER ที่รหัสหลุดบัญชีเดียวจะกลายเป็นการรั่วทั้งบริษัท — คัดลอกจากเครื่อง
 * เซิร์ฟเวอร์เอง หรือตั้ง BACKUP_MIRROR_DIR ให้ระบบคัดลอกไปไดรฟ์อื่นให้
 */
export const backupsRouter = Router();

backupsRouter.use(requireAuth, requireRole("OWNER"));

backupsRouter.get("/", (_req, res) => {
  res.json(backupStatus());
});

backupsRouter.post("/", async (req, res) => {
  try {
    const manifest = await runBackup("manual");
    await writeAuditLog({
      userId: req.user!.id,
      action: "BACKUP_MANUAL",
      entityType: "Backup",
      entityId: manifest.name,
      details: { bytes: manifest.database.bytes, durationMs: manifest.durationMs },
    });
    res.status(201).json(backupStatus());
  } catch (err) {
    const status = err instanceof BackupError ? err.status : 500;
    // อ่าน message ตรง ๆ ไม่พึ่ง instanceof Error — error จาก child_process บางจังหวะมาจากคนละ realm
    const message = (err as { message?: unknown } | null)?.message;
    res.status(status).json({ error: typeof message === "string" ? message : "สำรองข้อมูลไม่สำเร็จ" });
  }
});
