import { writeAuditLog } from "../audit-log";
import { prisma } from "../prisma";
import { backupStatus, readBackupConfig, runBackup } from "./backup";
import { isBackupStale, nextScheduledRun } from "./backup-plan";

/**
 * สำรองอัตโนมัติทุกวันตามเวลาที่ตั้ง (BACKUP_HOUR เวลาไทย) — ไม่ใช้ cron ของระบบปฏิบัติการ
 * เพราะต้องทำงานเหมือนกันทั้งบน Windows (เครื่องตอนนี้) และเซิร์ฟเวอร์จริง
 *
 * เครื่องปิดข้ามเวลาที่ตั้งไว้ (เปิดเฉพาะเวลางาน) = รอบนั้นหายไปเลย จึงเช็คตอนบูตด้วย:
 * ชุดล่าสุดเก่ากว่า 24 ชม. → สำรองชดเชยทันทีหลังบูตหนึ่งนาที
 *
 * ล้มเหลว = แจ้งเตือน OWNER ทุกคน — ระบบสำรองที่พังเงียบ ๆ แย่กว่าไม่มี เพราะทุกคนนึกว่ามี
 */
async function notifyOwners(message: string) {
  const owners = await prisma.user.findMany({
    where: { role: "OWNER", active: true },
    select: { id: true },
  });
  await prisma.notification.createMany({
    data: owners.map((o) => ({ userId: o.id, message, link: "/settings?tab=security" })),
  });
}

async function scheduledRun(reason: "daily" | "catch-up") {
  try {
    const manifest = await runBackup("auto");
    await writeAuditLog({
      action: "BACKUP_AUTO",
      entityType: "Backup",
      entityId: manifest.name,
      details: { reason, bytes: manifest.database.bytes, durationMs: manifest.durationMs },
    });
    console.log(`backup: สำรองอัตโนมัติ ${manifest.name} สำเร็จ`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("backup: สำรองอัตโนมัติล้มเหลว:", message);
    await notifyOwners(`สำรองข้อมูลอัตโนมัติไม่สำเร็จ — ${message.slice(0, 200)}`).catch(() => undefined);
  }
}

export function startBackupScheduler(): () => void {
  const cfg = readBackupConfig();
  if (!cfg.enabled) return () => undefined;
  if (!cfg.databaseUrl) {
    console.warn("backup: ยังไม่ได้ตั้ง BACKUP_DATABASE_URL — ไม่มีการสำรองอัตโนมัติ");
    return () => undefined;
  }

  let timer: NodeJS.Timeout | null = null;
  const scheduleNext = () => {
    const delay = nextScheduledRun(new Date(), cfg.hour).getTime() - Date.now();
    timer = setTimeout(async () => {
      await scheduledRun("daily");
      scheduleNext();
    }, delay);
    timer.unref?.();
  };
  scheduleNext();

  const latest = backupStatus(cfg).backups[0];
  const latestAt = latest ? new Date(latest.createdAt) : null;
  const catchUp = isBackupStale(latestAt, new Date(), 24)
    ? setTimeout(() => void scheduledRun("catch-up"), 60_000)
    : null;
  catchUp?.unref?.();

  return () => {
    if (timer) clearTimeout(timer);
    if (catchUp) clearTimeout(catchUp);
  };
}
