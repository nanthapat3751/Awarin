/**
 * ตัวตั้งเวลาสำรองข้อมูลรายวัน (backup/scheduler.ts) — แยกออกจากการสำรองจริงทั้งหมด:
 * ตัวสำรอง · การจองรอบ · ฐานข้อมูล ถูกแทนด้วยตัวปลอม และเวลาเดินด้วย fake timers
 *
 * สิ่งที่ต้องไม่พัง: ปิดไว้/ไม่ได้ตั้ง URL = ไม่ตั้งเวลา · ชุดล่าสุดเก่าเกิน 24 ชม. = สำรองชดเชยหลังบูต
 * หนึ่งนาที · เครื่องที่จองรอบไม่ได้ไม่สำรองซ้ำ · สำรองพัง = แจ้ง OWNER ทุกคนและคืนรอบให้ลองใหม่
 */
const runBackup = jest.fn();
const backupStatus = jest.fn();
const readBackupConfig = jest.fn();
jest.mock("../../src/lib/backup/backup", () => ({ runBackup, backupStatus, readBackupConfig }));

const claimScheduledRun = jest.fn();
const releaseScheduledRun = jest.fn();
jest.mock("../../src/lib/scheduled-run", () => ({
  ...jest.requireActual("../../src/lib/scheduled-run"),
  claimScheduledRun,
  releaseScheduledRun,
}));

const writeAuditLog = jest.fn();
jest.mock("../../src/lib/audit-log", () => ({ writeAuditLog }));

const findOwners = jest.fn();
const createNotifications = jest.fn();
jest.mock("../../src/lib/prisma", () => ({
  prisma: { user: { findMany: findOwners }, notification: { createMany: createNotifications } },
}));

import { startBackupScheduler } from "../../src/lib/backup/scheduler";

const HOUR = 60 * 60 * 1000;

describe("daily backup scheduler", () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-21T05:00:00Z")); // 12:00 เวลาไทย
    for (const m of [runBackup, backupStatus, readBackupConfig, claimScheduledRun, releaseScheduledRun, writeAuditLog, findOwners, createNotifications]) {
      m.mockReset();
    }
    readBackupConfig.mockReturnValue({ enabled: true, databaseUrl: "postgres://backup@localhost/db", hour: 2 });
    backupStatus.mockReturnValue({ backups: [] });
    claimScheduledRun.mockResolvedValue(true);
    releaseScheduledRun.mockResolvedValue(undefined);
    runBackup.mockResolvedValue({ name: "systemboq-2026-10-21_120100", database: { bytes: 1234 }, durationMs: 50 });
    findOwners.mockResolvedValue([{ id: "owner-1" }, { id: "owner-2" }]);
    createNotifications.mockResolvedValue({ count: 2 });
    log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    error = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("does nothing when backups are switched off", async () => {
    readBackupConfig.mockReturnValue({ enabled: false, databaseUrl: "x", hour: 2 });
    const stop = startBackupScheduler();
    await jest.advanceTimersByTimeAsync(48 * HOUR);
    expect(runBackup).not.toHaveBeenCalled();
    stop();
  });

  it("warns and does nothing when the backup database URL is missing", async () => {
    readBackupConfig.mockReturnValue({ enabled: true, databaseUrl: "", hour: 2 });
    const stop = startBackupScheduler();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("BACKUP_DATABASE_URL"));
    await jest.advanceTimersByTimeAsync(48 * HOUR);
    expect(runBackup).not.toHaveBeenCalled();
    stop();
  });

  it("catches up one minute after boot when there is no recent backup, and records it", async () => {
    const stop = startBackupScheduler();
    await jest.advanceTimersByTimeAsync(59_000);
    expect(runBackup).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2_000);
    expect(runBackup).toHaveBeenCalledWith("auto");
    expect(claimScheduledRun).toHaveBeenCalledWith("backup:catch-up:2026-10-21");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BACKUP_AUTO", details: expect.objectContaining({ reason: "catch-up", bytes: 1234 }) }),
    );
    stop();
  });

  it("skips the catch-up when the latest backup is recent, then runs daily at the set hour", async () => {
    backupStatus.mockReturnValue({ backups: [{ createdAt: new Date("2026-10-21T03:00:00Z").toISOString() }] });
    const stop = startBackupScheduler();
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    expect(runBackup).not.toHaveBeenCalled();

    // 02:00 เวลาไทยของวันถัดไป = 19:00 UTC วันนี้ → อีก 14 ชม.
    await jest.advanceTimersByTimeAsync(14 * HOUR + 1_000);
    expect(runBackup).toHaveBeenCalledTimes(1);
    expect(claimScheduledRun).toHaveBeenCalledWith(expect.stringMatching(/^backup:daily:/));

    // ตั้งรอบถัดไปเองหลังทำเสร็จ
    await jest.advanceTimersByTimeAsync(24 * HOUR);
    expect(runBackup).toHaveBeenCalledTimes(2);
    stop();
  });

  it("lets another server do the run when this one cannot claim it", async () => {
    claimScheduledRun.mockResolvedValue(false);
    const stop = startBackupScheduler();
    await jest.advanceTimersByTimeAsync(61_000);
    expect(runBackup).not.toHaveBeenCalled();
    stop();
  });

  it("skips the run when claiming fails outright", async () => {
    claimScheduledRun.mockRejectedValue(new Error("db down"));
    const stop = startBackupScheduler();
    await jest.advanceTimersByTimeAsync(61_000);
    expect(runBackup).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("จองรอบไม่ได้"), expect.any(Error));
    stop();
  });

  it("alerts every owner and gives the run back when the backup fails", async () => {
    runBackup.mockRejectedValue(new Error("pg_dump: connection refused"));
    const stop = startBackupScheduler();
    await jest.advanceTimersByTimeAsync(61_000);
    expect(createNotifications).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: "owner-1", link: "/settings?tab=backup" }),
        expect.objectContaining({ userId: "owner-2", message: expect.stringContaining("pg_dump: connection refused") }),
      ],
    });
    expect(releaseScheduledRun).toHaveBeenCalledWith("backup:catch-up:2026-10-21");
    expect(writeAuditLog).not.toHaveBeenCalled();
    stop();
  });

  it("stops both timers when asked", async () => {
    const stop = startBackupScheduler();
    stop();
    await jest.advanceTimersByTimeAsync(48 * HOUR);
    expect(runBackup).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
