import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { backupFolderName } from "../../src/lib/backup/backup-plan";
import {
  backupStatus,
  listBackups,
  mirrorLabel,
  parseMirrorDirs,
  pruneBackups,
  readBackupConfig,
  readManifest,
  runBackup,
  syncMirrors,
} from "../../src/lib/backup/backup";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";

/**
 * สำรองข้อมูลจริง (pg_dump ของฐานข้อมูลทดสอบ ด้วย role boq_backup) ลงโฟลเดอร์ชั่วคราว
 * — setup-env.ts บังคับ BACKUP_DIR / BACKUP_DATABASE_URL ให้ไม่มีทางแตะของจริง
 */
describe("backups", () => {
  const cfg = readBackupConfig();
  const createdUserIds: string[] = [];
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;

  beforeAll(async () => {
    // กันพลาด: ถ้า setup-env ไม่ได้บังคับค่า เทสต์นี้จะไปสำรองฐานข้อมูลจริงลงโฟลเดอร์จริง
    expect(cfg.dir).toContain("systemboq-test-backups-");
    expect(cfg.databaseUrl).toContain("/systemboq_test");
    owner = await createAndLoginOwner("test-backup-owner");
    admin = await createAndLoginAdmin("test-backup-admin");
    createdUserIds.push(owner.userId, admin.userId);
  });

  afterAll(async () => {
    fs.rmSync(cfg.dir, { recursive: true, force: true });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("role สำรองอ่านได้ทุกตาราง (รวมประวัติ migration) แต่เขียนอะไรไม่ได้เลย", async () => {
    const backupRole = new PrismaClient({ datasources: { db: { url: cfg.databaseUrl! } } });
    try {
      await expect(backupRole.$queryRawUnsafe(`SELECT count(*) FROM "_prisma_migrations"`)).resolves.toBeDefined();
      await expect(backupRole.$queryRawUnsafe(`SELECT count(*) FROM "User"`)).resolves.toBeDefined();
      await expect(
        backupRole.$executeRawUnsafe(`INSERT INTO "Setting"(key, value) VALUES ('backup-role-probe', 'x')`),
      ).rejects.toThrow(/permission denied/i);
      await expect(backupRole.$executeRawUnsafe(`DELETE FROM "Setting" WHERE false`)).rejects.toThrow(
        /permission denied/i,
      );
      await expect(backupRole.$executeRawUnsafe(`UPDATE "User" SET "fullName" = "fullName" WHERE false`)).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await backupRole.$disconnect();
    }
  });

  it("เฉพาะ OWNER — ADMIN และลูกค้าเห็นสถานะหรือสั่งสำรองไม่ได้", async () => {
    expect((await admin.agent.get("/api/backups")).status).toBe(403);
    expect((await admin.agent.post("/api/backups")).status).toBe(403);
    const customer = await createAndLoginCustomer("test-backup-customer");
    expect([401, 403]).toContain((await customer.agent.get("/api/backups")).status);
    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  it("OWNER สั่งสำรองทันที → ได้ชุดที่สมบูรณ์ (ฐานข้อมูล + ไฟล์ + manifest) และขึ้นในสถานะ", async () => {
    const res = await owner.agent.post("/api/backups");
    expect({ status: res.status, error: res.body.error }).toEqual({ status: 201, error: undefined });
    expect(res.body.configured).toBe(true);
    expect(res.body.stale).toBe(false);
    expect(res.body.backups).toHaveLength(1);
    const [b] = res.body.backups;
    expect(b.trigger).toBe("manual");
    // หน้าจอไม่ได้รับ path เต็มของเครื่องเซิร์ฟเวอร์
    expect(JSON.stringify(res.body)).not.toContain(cfg.dir);

    const folder = path.join(cfg.dir, b.name);
    const manifest = readManifest(folder)!;
    expect(fs.statSync(path.join(folder, "database.dump")).size).toBe(manifest.database.bytes);
    expect(manifest.database.sha256).toMatch(/^[0-9a-f]{64}$/);
    // ทุกตารางของแอปอยู่ในไฟล์ (นับจากสารบัญของ pg_restore)
    expect(manifest.database.tablesInDump).toBeGreaterThanOrEqual(Object.keys(manifest.database.rowCounts).length);
    expect(manifest.database.rowCounts.User).toBeGreaterThanOrEqual(2);
    expect(fs.existsSync(path.join(folder, "files", "uploads"))).toBe(true);
    expect(fs.existsSync(path.join(folder, "files", "private-uploads"))).toBe(true);
    // ไม่มีโฟลเดอร์ค้างครึ่งทาง
    expect(fs.readdirSync(cfg.dir).filter((n) => n.endsWith(".partial"))).toEqual([]);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "BACKUP_MANUAL", entityId: b.name },
    });
    expect(audit?.userId).toBe(owner.userId);
  }, 120_000);

  it("สั่งซ้อนกันไม่ได้ — ครั้งที่สองได้ 409 ระหว่างที่ครั้งแรกยังไม่เสร็จ", async () => {
    const first = runBackup("manual", cfg);
    await expect(runBackup("manual", cfg)).rejects.toMatchObject({ status: 409 });
    await first;
  }, 120_000);

  it("สำเนานอกเครื่องหลายที่: ที่ต่ออยู่ได้ครบทุกชุด (รวมชุดที่ค้าง) · ที่ไม่ได้ต่อถูกข้าม ไม่สร้างโฟลเดอร์ให้", async () => {
    const drive = path.join(cfg.dir, "mirror-google-drive");
    const usb = path.join(cfg.dir, "mirror-usb-unplugged");
    fs.mkdirSync(drive, { recursive: true });
    const localBefore = listBackups(cfg.dir).map((b) => b.name);
    expect(localBefore.length).toBeGreaterThanOrEqual(1);

    const withMirrors = { ...cfg, mirrorDirs: parseMirrorDirs(` ${drive} ; ${usb} ;`) };
    expect(withMirrors.mirrorDirs).toEqual([drive, usb]);
    const m = await runBackup("manual", withMirrors);

    // ชุดใหม่ + ชุดเก่าที่มีอยู่ก่อนตั้งสำเนา ไปครบ และตรงกับต้นฉบับ
    const inDrive = listBackups(drive).map((b) => b.name);
    expect(inDrive.sort()).toEqual([...localBefore, m.name].sort());
    expect(fs.statSync(path.join(drive, m.name, "database.dump")).size).toBe(m.database.bytes);
    expect(fs.readdirSync(drive).filter((n) => n.endsWith(".partial"))).toEqual([]);
    // USB ไม่ได้เสียบ = ไม่ล้มเหลว และต้องไม่มีโฟลเดอร์โผล่มาบนดิสก์เครื่องนี้แทน
    expect(fs.existsSync(usb)).toBe(false);

    const status = backupStatus(withMirrors);
    expect(status.mirrors).toEqual([
      { label: mirrorLabel(drive), connected: true, count: inDrive.length, latestAt: m.createdAt },
      { label: mirrorLabel(usb), connected: false, count: 0, latestAt: null },
    ]);
    expect(JSON.stringify(status)).not.toContain(cfg.dir);

    // เสียบ USB กลับมา → รอบถัดไปได้ทุกชุดที่ขาด ไม่ใช่แค่ชุดล่าสุด
    fs.mkdirSync(usb);
    const results = await syncMirrors(withMirrors);
    expect(results.find((r) => r.dir === usb)?.copied.sort()).toEqual(listBackups(cfg.dir).map((b) => b.name).sort());
    expect(results.find((r) => r.dir === drive)?.copied).toEqual([]);
  }, 120_000);

  it("ชื่อสำเนาบนหน้าจอเป็นชื่อย่อ ไม่ใช่ path เต็ม", () => {
    expect(mirrorLabel(path.resolve("G:\\My Drive\\งาน\\systemboq-backups"))).toMatch(/^G:\\…\\systemboq-backups$/);
    expect(mirrorLabel(path.resolve("E:\\systemboq-backups"))).toBe("E:\\systemboq-backups");
  });

  it("ลบชุดเก่าตามอายุ แต่เหลือชุดล่าสุดไว้เสมอ และไม่แตะโฟลเดอร์อื่น", () => {
    const dir = path.join(cfg.dir, "prune-case");
    const now = new Date("2026-09-30T00:00:00Z");
    const make = (daysAgo: number) => {
      const createdAt = new Date(now.getTime() - daysAgo * 86_400_000);
      const name = backupFolderName(createdAt);
      fs.mkdirSync(path.join(dir, name), { recursive: true });
      fs.writeFileSync(
        path.join(dir, name, "manifest.json"),
        JSON.stringify({
          version: 1,
          name,
          createdAt: createdAt.toISOString(),
          trigger: "auto",
          database: { bytes: 1 },
          files: { uploads: { count: 0, bytes: 0 }, privateUploads: { count: 0, bytes: 0 } },
        }),
      );
      return name;
    };
    const fresh = [make(1), make(2)];
    const old = [make(20), make(30)];
    fs.mkdirSync(path.join(dir, "เอกสารของผู้ใช้"), { recursive: true });

    const removed = pruneBackups(dir, { ...cfg, keepDays: 14, minKeep: 3 }, now);
    // เก่าเกิน 14 วันสองชุด แต่ต้องเหลืออย่างน้อย 3 ชุด → ลบได้แค่ชุดที่เก่าที่สุด
    expect(removed).toEqual([old[1]]);
    const left = fs.readdirSync(dir).sort();
    expect(left).toEqual([...fresh, old[0], "เอกสารของผู้ใช้"].sort());
  });
});
