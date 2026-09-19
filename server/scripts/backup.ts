import "../src/env";

import { mirrorConnected, readBackupConfig, runBackup } from "../src/lib/backup/backup";
import { prisma } from "../src/lib/prisma";

/**
 * สำรองข้อมูลหนึ่งชุดทันที (ฐานข้อมูล + ไฟล์ที่อัปโหลด)
 *
 *   npm run backup -w server
 *
 * ใช้ค่าชุดเดียวกับที่เซิร์ฟเวอร์ใช้สำรองอัตโนมัติ (BACKUP_* ใน server/.env) — ดู README
 */
async function main() {
  const cfg = { ...readBackupConfig(), enabled: true };
  const m = await runBackup("cli", cfg);
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  console.log(`สำรองสำเร็จ: ${m.name}`);
  console.log(`  โฟลเดอร์     ${cfg.dir}`);
  console.log(`  ฐานข้อมูล    ${mb(m.database.bytes)} · ${m.database.tablesInDump} ตาราง · ${m.database.pgDumpVersion}`);
  console.log(`  รูปที่อัปโหลด ${m.files.uploads.count} ไฟล์ (${mb(m.files.uploads.bytes)})`);
  console.log(`  ไฟล์แนบ      ${m.files.privateUploads.count} ไฟล์ (${mb(m.files.privateUploads.bytes)})`);
  for (const dir of cfg.mirrorDirs) {
    const note = mirrorConnected(dir) ? "" : "  (ไม่ได้ต่ออยู่ — ข้ามไป จะคัดลอกให้ครบเมื่อต่อกลับมา)";
    console.log(`  สำเนานอกเครื่อง ${dir}${note}`);
  }
  console.log(`  ใช้เวลา      ${(m.durationMs / 1000).toFixed(1)} วินาที`);
}

main()
  .catch((err) => {
    console.error(`สำรองไม่สำเร็จ: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
