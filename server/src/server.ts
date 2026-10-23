import "./env";

import { app } from "./app";
import { sweepAuditLog } from "./lib/audit-log";
import { reportDeployConfig } from "./lib/deploy-check";
import { AUDIT_LOG_RETENTION_DAYS } from "./lib/audit-retention";
import { startBackupScheduler } from "./lib/backup/scheduler";
import { startGeoipUpdater } from "./lib/geoip";
import { startDraining } from "./lib/lifecycle";
import { reportMailOnStartup } from "./lib/mailer";
import { closePdfBrowser, warmUpPdfBrowser } from "./lib/pdf/browser";
import { prisma, reportDatabasePool } from "./lib/prisma";
import { LEAD_RETENTION_DAYS, sweepStaleLeads } from "./lib/lead-retention";
import { sweepRateLimitBuckets } from "./lib/rate-limit";
import { bangkokDay, claimScheduledRun, INSTANCE_ID, sweepScheduledRuns } from "./lib/scheduled-run";
import { sweepTrash } from "./modules/trash/trash.service";
import { purgeUnverifiedSignups } from "./lib/unverified-signups";

const port = Number(process.env.PORT ?? 4000);

// เซิร์ฟเวอร์จริง (NODE_ENV=production) ที่ค่าตั้งยังไม่พร้อม — ลิงก์ในเมลชี้ localhost, คุกกี้ไม่ secure,
// ไม่ได้ส่งเมลจริง — ไม่ยอมเปิด ดีกว่าเปิดแล้วพังเงียบจนลูกค้าโทรมาบ่น (ดู lib/deploy-check.ts)
if (reportDeployConfig()) process.exit(1);

const server = app.listen(port, () => {
  console.log(`server listening on http://localhost:${port} (${INSTANCE_ID})`);
  void reportMailOnStartup();
  void reportDatabasePool();
  warmUpPdfBrowser();
});

// keep-alive ต้องนานกว่าตัว LB/reverse proxy — ค่าเริ่มต้นของ Node คือ 5 วินาที สั้นกว่า nginx
// (60 วิ) และ LB ของผู้ให้บริการคลาวด์ส่วนใหญ่ ถ้า Node ตัดการเชื่อมต่อที่ว่างก่อน LB จังหวะที่ LB
// ส่งคำขอใหม่ลงการเชื่อมต่อที่เพิ่งถูกตัดพอดีจะได้ 502 แบบสุ่ม ๆ · headersTimeout ต้องมากกว่า keepAlive
server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS ?? 65_000);
server.headersTimeout = server.keepAliveTimeout + 1_000;

// งานล้างอัตโนมัติรายวัน — เช็คทุกชั่วโมง (ครั้งแรก ~10 วิหลังบูต) แต่ทำจริงวันละครั้ง: รอบของวันนั้น
// จองใน ScheduledRun ก่อน API หลายตัวหลัง load balancer จึงมีตัวเดียวที่ทำ (ดู lib/scheduled-run.ts)
//   1. ถังขยะ: ลบถาวรของที่ทิ้งไว้เกิน 30 วัน
//   2. AuditLog: ลบบันทึกที่เก่าเกินระยะเวลาเก็บตามนโยบายความเป็นส่วนตัว
//   3. บัญชีลูกค้าที่สมัครแล้วไม่ยืนยันอีเมลเกิน 7 วัน (ไม่มีของที่พนักงานผูกไว้)
//   4. คำขอติดต่อที่ไม่ได้เป็นโครงการ เกิน 2 ปีนับจากติดต่อครั้งสุดท้าย (ตามนโยบายความเป็นส่วนตัว)
//   5. ตัวนับ rate limit ที่หมดรอบแล้ว + ใบจองรอบที่เก่าเกิน 90 วัน
// แยก try/catch กัน — ตัวหนึ่งพังต้องไม่ทำให้อีกตัวไม่ได้รัน
const SWEEP_CHECK_MS = 60 * 60 * 1000;
async function runSweep() {
  try {
    if (!(await claimScheduledRun(`sweep:${bangkokDay()}`))) return;
  } catch (err) {
    console.error("daily sweep: จองรอบไม่ได้ ข้ามรอบนี้:", err);
    return;
  }

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

  try {
    const purged = await purgeUnverifiedSignups();
    if (purged > 0) console.log(`unverified signups: ลบบัญชีที่ไม่ยืนยันอีเมลเกินกำหนด ${purged} บัญชี`);
  } catch (err) {
    console.error("unverified-signup purge failed:", err);
  }

  try {
    const removed = await sweepStaleLeads();
    if (removed > 0) console.log(`lead retention: ลบคำขอติดต่อที่ไม่ได้ดำเนินการต่อเกิน ${LEAD_RETENTION_DAYS} วัน ${removed} รายการ`);
  } catch (err) {
    console.error("lead retention sweep failed:", err);
  }

  try {
    await sweepRateLimitBuckets();
    await sweepScheduledRuns();
  } catch (err) {
    console.error("rate-limit/scheduled-run sweep failed:", err);
  }
}
const firstSweep = setTimeout(runSweep, 10_000);
const sweepTimer = setInterval(runSweep, SWEEP_CHECK_MS);
// อย่าให้ timer กันโปรเซสปิด
firstSweep.unref?.();
sweepTimer.unref?.();

// สำรองข้อมูลอัตโนมัติรายวัน (ดู lib/backup/scheduler.ts) — ปิดได้ด้วย BACKUP_ENABLED=false
const stopBackups = startBackupScheduler();
// ฐานข้อมูลประเทศ/ผู้ให้บริการของไอพี อัปเดตเองทุกเดือน (ดู lib/geoip.ts) — ปิดได้ด้วย GEOIP_AUTO_UPDATE=false
const stopGeoip = startGeoipUpdater();

/**
 * ปิดแบบไม่ตัดคำขอที่ค้างอยู่ (SIGTERM จาก docker/systemd/LB ตอน deploy เวอร์ชันใหม่)
 *
 * 1. ready → 503 + ตอบ Connection: close — LB เลิกส่งคำขอใหม่มา
 * 2. รอ SHUTDOWN_DRAIN_MS ให้ LB เห็นสถานะใหม่ (ค่าเริ่มต้น 0 = dev ปิดทันที · production ตั้ง
 *    ราวสองเท่าของรอบตรวจสุขภาพของ LB)
 * 3. หยุดรับการเชื่อมต่อใหม่ ปิดการเชื่อมต่อที่ว่าง รอคำขอที่ค้างจบ
 * 4. เกิน SHUTDOWN_TIMEOUT_MS ยังไม่จบ = ปิดทิ้ง (กันค้างตลอดกาลเพราะ client ไม่ยอมปิด)
 */
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal}: กำลังปิด ${INSTANCE_ID}`);
  startDraining();
  stopBackups();
  stopGeoip();
  clearTimeout(firstSweep);
  clearInterval(sweepTimer);

  const drainMs = Number(process.env.SHUTDOWN_DRAIN_MS ?? 0);
  if (drainMs > 0) await new Promise((resolve) => setTimeout(resolve, drainMs));

  const forceExit = setTimeout(() => {
    console.error("ปิดไม่ทันเวลา — ตัดคำขอที่ยังค้างทิ้ง");
    process.exit(1);
  }, Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 30_000));
  forceExit.unref();

  server.close(async () => {
    await closePdfBrowser();
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  });
  server.closeIdleConnections();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
