import "./env";

import { app } from "./app";
import { sweepAuditLog } from "./lib/audit-log";
import { AUDIT_LOG_RETENTION_DAYS } from "./lib/audit-retention";
import { startBackupScheduler } from "./lib/backup/scheduler";
import { closePdfBrowser } from "./lib/pdf/browser";
import { sweepTrash } from "./modules/trash/trash.service";

const port = Number(process.env.PORT ?? 4000);

const server = app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});

// งานล้างอัตโนมัติรายวัน — รันครั้งแรก ~10 วิหลังบูต แล้วทุก 24 ชม.
//   1. ถังขยะ: ลบถาวรของที่ทิ้งไว้เกิน 30 วัน
//   2. AuditLog: ลบบันทึกที่เก่าเกินระยะเวลาเก็บตามนโยบายความเป็นส่วนตัว
// แยก try/catch กัน — ตัวหนึ่งพังต้องไม่ทำให้อีกตัวไม่ได้รัน
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
async function runSweep() {
  try {
    const purged = await sweepTrash();
    if (purged > 0) console.log(`trash auto-purge: ลบถาวร ${purged} รายการที่อยู่ในถังขยะเกิน 30 วัน`);
  } catch (err) {
    console.error("trash auto-purge failed:", err);
  }

  try {
    const removed = await sweepAuditLog();
    if (removed > 0) {
      console.log(`audit-log retention: ลบบันทึก ${removed} แถวที่เก่าเกิน ${AUDIT_LOG_RETENTION_DAYS} วัน`);
    }
  } catch (err) {
    console.error("audit-log retention sweep failed:", err);
  }
}
const firstSweep = setTimeout(runSweep, 10_000);
const sweepTimer = setInterval(runSweep, SWEEP_INTERVAL_MS);
// อย่าให้ timer กันโปรเซสปิด
firstSweep.unref?.();
sweepTimer.unref?.();

// สำรองข้อมูลอัตโนมัติรายวัน (ดู lib/backup/scheduler.ts) — ปิดได้ด้วย BACKUP_ENABLED=false
const stopBackups = startBackupScheduler();

async function shutdown() {
  stopBackups();
  clearTimeout(firstSweep);
  clearInterval(sweepTimer);
  await closePdfBrowser();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
