import "../src/env";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { copyDir, countRows, listBackups, readBackupConfig, readManifest, runBackup } from "../src/lib/backup/backup";
import { assertSafeIdentifier, parsePgUrl } from "../src/lib/backup/backup-plan";
import { restoreDump } from "../src/lib/backup/pg-tools";
import { prisma } from "../src/lib/prisma";
import { ATTACHMENTS_DIR } from "../src/modules/attachments/attachments.service";
import { UPLOADS_DIR } from "../src/modules/uploads/uploads.routes";

/**
 * กู้ข้อมูลจากชุดสำรอง
 *
 *   npm run backup:restore -w server                       ทดลองกู้ชุดล่าสุดลงฐานข้อมูลชั่วคราว แล้วเทียบจำนวนแถว (ไม่แตะของจริง)
 *   npm run backup:restore -w server -- <ชื่อชุด>          ทดลองกู้ชุดที่ระบุ
 *   npm run backup:restore -w server -- <ชื่อชุด> --into systemboq --force --with-files
 *                                                            กู้ทับของจริง (หยุดเซิร์ฟเวอร์ก่อน)
 *
 * ค่าเริ่มต้นคือ "ทดลองกู้" เสมอ — การกู้ทับของจริงต้องพิมพ์ทั้ง --into และ --force
 * และก่อนกู้ทับ ระบบสำรองสภาพปัจจุบันไว้อีกชุดหนึ่งเสมอ (กู้ผิดชุดยังย้อนกลับได้)
 *
 * ใช้ role เจ้าของฐานข้อมูล (DATABASE_URL = boq) — boq_backup อ่านได้อย่างเดียว กู้ไม่ได้
 */

interface Args {
  name: string | null;
  into: string | null;
  force: boolean;
  withFiles: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { name: null, into: null, force: false, withFiles: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--into") args.into = argv[++i] ?? null;
    else if (a === "--force") args.force = true;
    else if (a === "--with-files") args.withFiles = true;
    else if (!a.startsWith("--")) args.name = a;
    else throw new Error(`ไม่รู้จักตัวเลือก ${a}`);
  }
  return args;
}

function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** PrismaClient ของ role เจ้าของ ต่อไปยังฐานข้อมูลที่ระบุ */
function adminClient(adminUrl: string, database: string): PrismaClient {
  const u = new URL(adminUrl);
  u.pathname = `/${database}`;
  return new PrismaClient({ datasources: { db: { url: u.toString() } } });
}

/** ตารางที่ข้อมูลไหลเข้าตลอดเวลา (ล็อกอิน · บันทึก · แจ้งเตือน) นับต่างจาก manifest เล็กน้อยได้ */
const LIVE_TABLES = new Set(["Session", "AuditLog", "Notification"]);

function compareCounts(expected: Record<string, number>, actual: Record<string, number>) {
  const rows: { table: string; expected: number; actual: number; ok: boolean }[] = [];
  for (const table of Object.keys(expected).sort((a, b) => a.localeCompare(b))) {
    const e = expected[table];
    const a = actual[table] ?? -1;
    // ตารางที่ไหลตลอดยอมให้ "ในไฟล์มากกว่าตอนนับ" (เข้ามาระหว่างนับกับ dump) แต่ห้ามน้อยกว่า
    const ok = LIVE_TABLES.has(table) ? a >= e : a === e;
    rows.push({ table, expected: e, actual: a, ok });
  }
  return rows;
}

type BackupConfig = ReturnType<typeof readBackupConfig>;
type Manifest = NonNullable<ReturnType<typeof readManifest>>;

/** หาชุดสำรอง (ชื่อที่ระบุ หรือชุดล่าสุด) แล้วตรวจ checksum ก่อนใช้ */
function loadVerifiedBackup(cfg: BackupConfig, requested: string | null) {
  const name = requested ?? listBackups(cfg.dir)[0]?.name;
  if (!name) throw new Error(`ไม่พบชุดสำรองใน ${cfg.dir}`);
  const folder = path.isAbsolute(name) ? name : path.join(cfg.dir, name);
  const manifest = readManifest(folder);
  if (!manifest) throw new Error(`${folder} ไม่ใช่ชุดสำรองที่สมบูรณ์ (ไม่มี manifest.json)`);

  const dumpFile = path.join(folder, manifest.database.file);
  if (sha256(dumpFile) !== manifest.database.sha256) {
    throw new Error("ไฟล์ database.dump ไม่ตรงกับ checksum ใน manifest — ไฟล์เสียหรือถูกแก้ ห้ามใช้กู้");
  }
  return { folder, manifest, dumpFile };
}

type CountRow = ReturnType<typeof compareCounts>[number];

/** นับไฟล์รูป/ไฟล์แนบในชุดสำรองเทียบกับ manifest — แถวที่ไม่ครบเติมลง bad */
function checkBackupFiles(folder: string, manifest: Manifest, bad: CountRow[]): void {
  const files = [
    ["uploads", manifest.files.uploads.count],
    ["private-uploads", manifest.files.privateUploads.count],
  ] as const;
  for (const [dir, expected] of files) {
    const dirPath = path.join(folder, "files", dir);
    const have = fs.existsSync(dirPath) ? fs.readdirSync(dirPath, { recursive: true }).length : 0;
    const ok = have >= expected;
    if (!ok) bad.push({ table: dir, expected, actual: have, ok });
    console.log(`  ${ok ? "ok  " : "FAIL"} files/${dir.padEnd(16)} ${String(have).padStart(7)} ไฟล์`);
  }
}

/** ทดลองกู้ (ค่าเริ่มต้น): กู้ลงฐานข้อมูลชั่วคราว นับแถวเทียบ manifest แล้วลบทิ้ง — ของจริงไม่ถูกแตะ */
async function trialRestore(cfg: BackupConfig, adminUrl: string, folder: string, manifest: Manifest, dumpFile: string) {
  const scratch = `systemboq_restore_check_${Date.now()}`;
  const root = adminClient(adminUrl, "postgres");
  await root.$executeRawUnsafe(`CREATE DATABASE "${assertSafeIdentifier(scratch, "ชื่อฐานข้อมูล")}"`);
  try {
    await restoreDump(cfg.tools, adminUrl, scratch, dumpFile, { clean: false });
    const client = adminClient(adminUrl, scratch);
    const actual = await countRows(client).finally(() => client.$disconnect());
    const rows = compareCounts(manifest.database.rowCounts, actual);
    const bad = rows.filter((r) => !r.ok);
    for (const r of rows) {
      const expectedNote = r.ok ? "" : ` (ควรเป็น ${r.expected})`;
      console.log(`  ${r.ok ? "ok  " : "FAIL"} ${r.table.padEnd(22)} ${String(r.actual).padStart(7)} แถว${expectedNote}`);
    }
    checkBackupFiles(folder, manifest, bad);
    if (bad.length > 0) throw new Error(`ทดลองกู้แล้วข้อมูลไม่ครบ ${bad.length} รายการ`);
    console.log(`\nทดลองกู้สำเร็จ — ชุดนี้ใช้กู้ได้จริง (ฐานข้อมูลชั่วคราวถูกลบแล้ว ของจริงไม่ถูกแตะ)`);
  } finally {
    await root.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`);
    await root.$disconnect();
  }
}

/** กู้ไฟล์รูป/ไฟล์แนบ — ไม่ลบของเดิม ย้ายไปพักไว้ข้าง ๆ ตรวจแล้วค่อยลบเอง */
function restoreFiles(folder: string): void {
  const stamp = Date.now();
  for (const [dir, live] of [
    ["uploads", UPLOADS_DIR],
    ["private-uploads", ATTACHMENTS_DIR],
  ] as const) {
    if (fs.existsSync(live)) fs.renameSync(live, `${live}.before-restore-${stamp}`);
    copyDir(path.join(folder, "files", dir), live);
    console.log(`กู้ไฟล์ ${dir} แล้ว (ของเดิมพักไว้ที่ ${path.basename(live)}.before-restore-${stamp})`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = readBackupConfig();
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) throw new Error("ต้องมี DATABASE_URL (role เจ้าของฐานข้อมูล) ใน server/.env");
  const mainDb = parsePgUrl(adminUrl).database;

  const { folder, manifest, dumpFile } = loadVerifiedBackup(cfg, args.name);
  console.log(`ชุดสำรอง ${manifest.name} (สร้างเมื่อ ${new Date(manifest.createdAt).toLocaleString("th-TH")}) · checksum ถูกต้อง`);

  // ---------- ทดลองกู้ (ค่าเริ่มต้น) ----------
  if (!args.into) {
    await trialRestore(cfg, adminUrl, folder, manifest, dumpFile);
    return;
  }

  // ---------- กู้ทับ ----------
  const target = assertSafeIdentifier(args.into, "ชื่อฐานข้อมูลปลายทาง");
  if (!args.force) {
    throw new Error(`การกู้ทับ ${target} จะแทนที่ข้อมูลทั้งหมดในนั้น — ใส่ --force ถ้าแน่ใจ`);
  }
  if (target === mainDb) {
    // ถอยกลับได้เสมอ: เก็บสภาพก่อนกู้ไว้หนึ่งชุด (ถ้าตั้ง role สำรองไว้)
    const before = await runBackup("pre-restore", { ...cfg, enabled: true });
    console.log(`สำรองสภาพก่อนกู้ไว้แล้ว: ${before.name}`);
  }
  await restoreDump(cfg.tools, adminUrl, target, dumpFile, { clean: true });
  console.log(`กู้ฐานข้อมูล ${target} จาก ${manifest.name} แล้ว`);

  if (args.withFiles) restoreFiles(folder);
  else console.log("ไม่ได้กู้ไฟล์รูป/ไฟล์แนบ — ใส่ --with-files ถ้าต้องการ");
}

main()
  .catch((err) => {
    console.error(`\n${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
