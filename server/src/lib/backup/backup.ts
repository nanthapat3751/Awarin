import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { ATTACHMENTS_DIR } from "../../modules/attachments/attachments.service";
import { UPLOADS_DIR } from "../../modules/uploads/uploads.routes";
import { prisma } from "../prisma";
import {
  BACKUP_FOLDER_PATTERN,
  backupFolderName,
  isBackupStale,
  selectBackupsToPrune,
} from "./backup-plan";
import { dumpDatabase, listDumpTables, type PgToolsConfig } from "./pg-tools";

/**
 * ระบบสำรองข้อมูล — หนึ่งชุด = หนึ่งโฟลเดอร์:
 *
 *   systemboq-2026-09-18_020000/
 *     database.dump       pg_dump แบบ custom format (กู้ด้วย pg_restore)
 *     files/uploads/      รูปที่อัปโหลด (แบบบ้าน ผลงาน รูปหน้าเว็บ)
 *     files/private-uploads/  ไฟล์แนบใบเสนอราคา (ไม่เปิดสาธารณะ)
 *     manifest.json       เวลา · จำนวนแถวรายตาราง · checksum — ใช้ตรวจตอนกู้
 *
 * ต้องได้ทั้งฐานข้อมูลและไฟล์ในจังหวะเดียวกัน: ฐานข้อมูลอ้างชื่อไฟล์ ถ้ากู้แค่ฐานข้อมูล รูปทุกรูปจะพัง
 *
 * เขียนลงโฟลเดอร์ชื่อ .partial ก่อนแล้วค่อยเปลี่ยนชื่อเมื่อครบ — ชุดที่พังกลางทางจึงไม่มีวันถูกนับ
 * ว่าเป็นชุดสำรองที่ใช้ได้ และไม่ไปดันชุดที่ดีจริงให้ถูกลบตามอายุ
 */

export interface BackupConfig {
  enabled: boolean;
  /** role อ่านอย่างเดียว (boq_backup) — ว่าง = ยังไม่ได้ตั้ง */
  databaseUrl: string | null;
  dir: string;
  /**
   * สำเนานอกเครื่อง (โฟลเดอร์ Google Drive / ไดรฟ์ USB) ได้หลายที่ — ว่าง = ไม่คัดลอก
   * แต่ละที่ต้องสร้างโฟลเดอร์ไว้เองก่อน ดู mirrorConnected
   */
  mirrorDirs: string[];
  keepDays: number;
  minKeep: number;
  /** ชั่วโมงที่สำรองอัตโนมัติทุกวัน (เวลาไทย) */
  hour: number;
  tools: PgToolsConfig;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const n = raw == null || raw.trim() === "" ? fallback : Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** คั่นหลายที่ด้วย ";" (แบบ PATH ของ Windows — path มีช่องว่างหรือจุลภาคได้ แต่มี ";" ไม่ได้) */
export function parseMirrorDirs(raw: string | undefined): string[] {
  const dirs = (raw ?? "")
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d !== "")
    .map((d) => path.resolve(process.cwd(), d));
  return [...new Set(dirs)];
}

export function readBackupConfig(): BackupConfig {
  const blank = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : null);
  return {
    enabled: process.env.BACKUP_ENABLED !== "false" && process.env.NODE_ENV !== "test",
    databaseUrl: blank(process.env.BACKUP_DATABASE_URL),
    dir: path.resolve(process.cwd(), blank(process.env.BACKUP_DIR) ?? "backups"),
    mirrorDirs: parseMirrorDirs(process.env.BACKUP_MIRROR_DIR),
    keepDays: intEnv("BACKUP_KEEP_DAYS", 14, 1, 3650),
    minKeep: intEnv("BACKUP_MIN_KEEP", 3, 1, 100),
    hour: intEnv("BACKUP_HOUR", 2, 0, 23),
    tools: {
      dockerContainer: blank(process.env.BACKUP_PG_DOCKER_CONTAINER),
      binDir: blank(process.env.BACKUP_PG_BIN_DIR),
    },
  };
}

export type BackupTrigger = "auto" | "manual" | "cli" | "pre-restore";

export interface BackupManifest {
  version: 1;
  name: string;
  createdAt: string;
  trigger: BackupTrigger;
  durationMs: number;
  database: {
    file: "database.dump";
    bytes: number;
    sha256: string;
    tablesInDump: number;
    pgDumpVersion: string;
    /** จำนวนแถวรายตาราง ณ ก่อนสำรอง — ใช้เทียบตอนทดลองกู้ */
    rowCounts: Record<string, number>;
    latestMigration: string | null;
  };
  files: { uploads: FolderStat; privateUploads: FolderStat };
}

interface FolderStat {
  count: number;
  bytes: number;
}

export interface BackupSummary {
  name: string;
  createdAt: string;
  trigger: BackupTrigger;
  totalBytes: number;
  databaseBytes: number;
  fileCount: number;
}

// ---------- ช่วยจัดการไฟล์ ----------

function folderStat(dir: string): FolderStat {
  if (!fs.existsSync(dir)) return { count: 0, bytes: 0 };
  let count = 0;
  let bytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    count += 1;
    bytes += fs.statSync(path.join(entry.parentPath, entry.name)).size;
  }
  return { count, bytes };
}

/**
 * คัดลอกทั้งโฟลเดอร์ทีละไฟล์
 *
 * **ห้ามใช้ fs.cpSync** — Node 22 บน Windows ล้มทั้งโปรเซส (0xC0000409 ไม่มีข้อความ ไม่เข้า catch)
 * เมื่อ path มีอักษรไทย ซึ่งโฟลเดอร์โปรเจกต์นี้มี ("ปี4_1/ปัญหาพิเศษ") — เซิร์ฟเวอร์ทั้งตัวจะดับตอนสำรอง
 */
export function copyDir(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  if (!fs.existsSync(from)) return;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else if (entry.isFile()) fs.copyFileSync(src, dest);
  }
}

function copyFolder(from: string, to: string): FolderStat {
  copyDir(from, to);
  return folderStat(to);
}

/**
 * เปลี่ยนชื่อโฟลเดอร์ โดยลองซ้ำเมื่อ Windows ยังจับไฟล์ข้างในอยู่ (EPERM/EBUSY) — ตัวสแกนไวรัส
 * มักเปิดไฟล์ที่เพิ่งเขียนเสร็จไปอ่านสักครู่ ปล่อยเดี๋ยวเดียวก็เปลี่ยนได้
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if ((code !== "EPERM" && code !== "EBUSY") || attempt >= 20) throw err;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

/** จำนวนแถวรายตาราง — อ่านผ่าน role ของแอป (ตาราง _prisma_migrations ไม่ใช่ข้อมูลธุรกิจ จึงข้าม) */
export async function countRows(client = prisma): Promise<Record<string, number>> {
  const tables = await client.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
      ORDER BY table_name`,
  );
  const counts: Record<string, number> = {};
  for (const { table_name } of tables) {
    // ชื่อตารางมาจาก information_schema ไม่ใช่จากผู้ใช้ — ยังครอบด้วยเครื่องหมายคำพูดและกันอักขระแปลก
    if (!/^[A-Za-z_]\w*$/.test(table_name)) continue;
    const [row] = await client.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table_name}"`);
    counts[table_name] = Number(row.n);
  }
  return counts;
}

async function latestMigration(): Promise<string | null> {
  // boq_app อ่าน _prisma_migrations ไม่ได้โดยตั้งใจ — ชื่อ migration ล่าสุดดูจากโฟลเดอร์ในโค้ดแทน
  const dir = path.resolve(__dirname, "..", "..", "..", "prisma", "migrations");
  if (!fs.existsSync(dir)) return null;
  const names = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
  return names.at(-1) ?? null;
}

// ---------- รายการชุดสำรอง ----------

export function readManifest(folder: string): BackupManifest | null {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, "manifest.json"), "utf8")) as BackupManifest;
    return manifest.version === 1 ? manifest : null;
  } catch {
    return null;
  }
}

/** ชุดสำรองที่สมบูรณ์ (มี manifest อ่านได้) เรียงใหม่สุดก่อน */
export function listBackups(dir: string = readBackupConfig().dir): BackupSummary[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && BACKUP_FOLDER_PATTERN.test(e.name))
    .map((e) => readManifest(path.join(dir, e.name)))
    .filter((m): m is BackupManifest => m !== null)
    .map((m) => ({
      name: m.name,
      createdAt: m.createdAt,
      trigger: m.trigger,
      databaseBytes: m.database.bytes,
      fileCount: m.files.uploads.count + m.files.privateUploads.count,
      totalBytes: m.database.bytes + m.files.uploads.bytes + m.files.privateUploads.bytes,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** ลบชุดเก่าตามอายุ — แตะเฉพาะโฟลเดอร์ชื่อรูปแบบของเรา · คืนรายชื่อที่ลบ */
export function pruneBackups(dir: string, cfg: BackupConfig, now = new Date()): string[] {
  const stamps = listBackups(dir).map((b) => ({ name: b.name, createdAt: new Date(b.createdAt) }));
  const doomed = selectBackupsToPrune(stamps, now, cfg.keepDays, cfg.minKeep);
  for (const name of doomed) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
  // ชุดที่พังกลางทางจากครั้งก่อน (.partial) เก่าเกินวัน = ไม่มีใครกำลังเขียนอยู่แล้ว เก็บกวาดได้
  if (fs.existsSync(dir)) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || !e.name.endsWith(".partial")) continue;
      const full = path.join(dir, e.name);
      if (now.getTime() - fs.statSync(full).mtimeMs > 24 * 60 * 60 * 1000) {
        fs.rmSync(full, { recursive: true, force: true });
      }
    }
  }
  return doomed;
}

// ---------- สำรองจริง ----------

let running: Promise<BackupManifest> | null = null;
let lastError: { at: string; message: string } | null = null;

export function backupRunning(): boolean {
  return running !== null;
}

export function lastBackupError() {
  return lastError;
}

export class BackupError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "BackupError";
    this.status = status;
  }
}

/**
 * สำรองหนึ่งชุด — เรียกซ้อนกันไม่ได้ (ครั้งที่สองได้ 409) เพราะสองชุดพร้อมกันแย่งดิสก์และได้ของซ้ำ
 */
export function runBackup(trigger: BackupTrigger, cfg: BackupConfig = readBackupConfig()): Promise<BackupManifest> {
  if (running) {
    return Promise.reject(new BackupError("กำลังสำรองข้อมูลอยู่ รอให้ชุดนี้เสร็จก่อน", 409));
  }
  running = doBackup(trigger, cfg)
    .then((m) => {
      lastError = null;
      return m;
    })
    .catch((err: unknown) => {
      lastError = { at: new Date().toISOString(), message: err instanceof Error ? err.message : String(err) };
      throw err;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

async function doBackup(trigger: BackupTrigger, cfg: BackupConfig): Promise<BackupManifest> {
  if (!cfg.databaseUrl) {
    throw new BackupError("ยังไม่ได้ตั้ง BACKUP_DATABASE_URL (role boq_backup) — สำรองข้อมูลไม่ได้", 503);
  }
  const started = new Date();
  const name = backupFolderName(started);
  fs.mkdirSync(cfg.dir, { recursive: true });
  const finalDir = path.join(cfg.dir, name);
  if (fs.existsSync(finalDir)) {
    throw new BackupError("มีชุดสำรองของวินาทีนี้อยู่แล้ว ลองใหม่อีกครั้ง", 409);
  }
  const work = `${finalDir}.partial`;
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });

  let manifest: BackupManifest;
  try {
    // นับแถวก่อน dump — ข้อมูลที่เข้ามาระหว่างนี้ (เซสชัน/บันทึก) ทำให้ต่างได้เล็กน้อย ตอนตรวจจึงเทียบแบบมีเกณฑ์
    const rowCounts = await countRows();
    const dumpFile = path.join(work, "database.dump");
    const pgDumpVersion = await dumpDatabase(cfg.tools, cfg.databaseUrl, dumpFile);
    const tablesInDump = await listDumpTables(cfg.tools, dumpFile);
    const expectedTables = Object.keys(rowCounts).length;
    // สารบัญต้องอ่านได้และมีทุกตาราง — ไฟล์ขาดหรือ role ขาดสิทธิ์บางตารางต้องรู้ตอนนี้ ไม่ใช่ตอนกู้
    if (tablesInDump < expectedTables) {
      throw new Error(`ไฟล์สำรองมีข้อมูล ${tablesInDump} ตาราง แต่ฐานข้อมูลมี ${expectedTables} ตาราง`);
    }

    const uploads = copyFolder(UPLOADS_DIR, path.join(work, "files", "uploads"));
    const privateUploads = copyFolder(ATTACHMENTS_DIR, path.join(work, "files", "private-uploads"));

    manifest = {
      version: 1,
      name,
      createdAt: started.toISOString(),
      trigger,
      durationMs: Date.now() - started.getTime(),
      database: {
        file: "database.dump",
        bytes: fs.statSync(dumpFile).size,
        sha256: await sha256File(dumpFile),
        tablesInDump,
        pgDumpVersion,
        rowCounts,
        latestMigration: await latestMigration(),
      },
      files: { uploads, privateUploads },
    };
    fs.writeFileSync(path.join(work, "manifest.json"), JSON.stringify(manifest, null, 2));
    await renameWithRetry(work, finalDir);
  } catch (err) {
    fs.rmSync(work, { recursive: true, force: true });
    throw err;
  }

  pruneBackups(cfg.dir, cfg);
  // ชุดหลักสำเร็จแล้ว — สำเนานอกเครื่องที่ล้มเหลวต้องบอก (ขึ้นแดง + แจ้ง OWNER) แต่ชุดหลักยังอยู่ครบ
  // ส่วนที่ "ไม่ได้ต่ออยู่" (ถอด USB ไว้) ไม่นับเป็นความล้มเหลว — หน้าตั้งค่าเตือนเองเมื่อสำเนาเก่าเกิน 7 วัน
  const failed = (await syncMirrors(cfg)).filter((r) => r.error);
  if (failed.length > 0) {
    throw new Error(
      `สำรองในเครื่องสำเร็จ แต่คัดลอกไปสำเนานอกเครื่องไม่ได้: ${failed
        .map((r) => `${mirrorLabel(r.dir)} (${r.error})`)
        .join(" · ")}`,
    );
  }
  return manifest;
}

// ---------- สำเนานอกเครื่อง ----------

/**
 * ต่ออยู่ไหม = โฟลเดอร์มีอยู่จริง · **ระบบไม่สร้างโฟลเดอร์ให้เอง** เพราะถ้าไดรฟ์ USB ไม่ได้เสียบ
 * (หรือ Google Drive ยังไม่ได้เปิด) การสร้างอัตโนมัติอาจไปสร้างบนดิสก์เครื่องเดิมแทน — ได้สำเนา
 * ที่ดูเหมือนอยู่นอกเครื่องแต่จริง ๆ พังไปพร้อมเครื่อง
 */
export function mirrorConnected(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** ชื่อย่อสำหรับหน้าจอ: ไดรฟ์ + โฟลเดอร์สุดท้าย (หน้าเว็บไม่ได้รับ path เต็มของเครื่อง) */
export function mirrorLabel(dir: string): string {
  const { root } = path.parse(dir);
  const base = path.basename(dir);
  if (!base) return root;
  return dir.slice(root.length) === base ? `${root}${base}` : `${root}…${path.sep}${base}`;
}

export interface MirrorSyncResult {
  dir: string;
  connected: boolean;
  /** ชุดที่คัดลอกไปรอบนี้ (รวมชุดที่ค้างจากตอนไดรฟ์ไม่ได้เสียบ) */
  copied: string[];
  error?: string;
}

/**
 * คัดลอกชุดสำรองในเครื่องที่สำเนายังไม่มีไปให้ครบ — ไดรฟ์ USB ที่ถอดไว้หลายวัน พอเสียบกลับมา
 * รอบถัดไปได้ทุกชุดที่ขาด ไม่ใช่แค่ชุดล่าสุด · คัดลอกลง .partial ก่อนเปลี่ยนชื่อ
 * (ดึงไดรฟ์ออกกลางทางแล้วต้องไม่เหลือชุดครึ่ง ๆ ที่ดูเหมือนใช้ได้)
 */
export async function syncMirrors(cfg: BackupConfig): Promise<MirrorSyncResult[]> {
  const local = listBackups(cfg.dir);
  const results: MirrorSyncResult[] = [];
  for (const dir of cfg.mirrorDirs) {
    const result: MirrorSyncResult = { dir, connected: mirrorConnected(dir), copied: [] };
    results.push(result);
    if (!result.connected) continue;
    if (path.resolve(dir) === path.resolve(cfg.dir)) {
      result.error = "เป็นโฟลเดอร์เดียวกับที่เก็บชุดหลัก";
      continue;
    }
    try {
      const have = new Set(listBackups(dir).map((b) => b.name));
      for (const b of local) {
        if (have.has(b.name)) continue;
        const target = path.join(dir, b.name);
        const work = `${target}.partial`;
        fs.rmSync(work, { recursive: true, force: true });
        copyDir(path.join(cfg.dir, b.name), work);
        await renameWithRetry(work, target);
        result.copied.push(b.name);
      }
      pruneBackups(dir, cfg);
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }
  }
  return results;
}

/** สถานะสำหรับหน้าจอ — ไม่ส่ง path เต็มของโฟลเดอร์ไปหน้าเว็บ สำเนานอกเครื่องบอกแค่ชื่อย่อ */
export function backupStatus(cfg: BackupConfig = readBackupConfig(), now = new Date()) {
  const backups = listBackups(cfg.dir);
  const latest = backups[0] ? new Date(backups[0].createdAt) : null;
  return {
    configured: cfg.databaseUrl !== null,
    scheduleEnabled: cfg.enabled,
    hour: cfg.hour,
    keepDays: cfg.keepDays,
    mirrors: cfg.mirrorDirs.map((dir) => {
      const connected = mirrorConnected(dir);
      const copies = connected ? listBackups(dir) : [];
      return { label: mirrorLabel(dir), connected, count: copies.length, latestAt: copies[0]?.createdAt ?? null };
    }),
    running: backupRunning(),
    lastError,
    // เกิน 36 ชม. = ข้ามรอบอัตโนมัติไปแล้วอย่างน้อยหนึ่งรอบ
    stale: isBackupStale(latest, now, 36),
    backups,
  };
}
