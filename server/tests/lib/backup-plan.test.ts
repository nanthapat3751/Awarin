import {
  assertSafeIdentifier,
  BACKUP_FOLDER_PATTERN,
  backupFolderName,
  isBackupStale,
  nextScheduledRun,
  parsePgUrl,
  selectBackupsToPrune,
} from "../../src/lib/backup/backup-plan";

const at = (iso: string) => new Date(iso);
const DAY = 24 * 60 * 60 * 1000;

describe("ชื่อชุดสำรอง", () => {
  it("ใช้เวลาไทย และเรียงตามตัวอักษร = เรียงตามเวลา", () => {
    // 19:30 UTC = 02:30 ของวันถัดไปตามเวลาไทย
    expect(backupFolderName(at("2026-09-17T19:30:05Z"))).toBe("systemboq-2026-09-18_023005");
    const a = backupFolderName(at("2026-09-18T01:00:00Z"));
    const b = backupFolderName(at("2026-10-02T01:00:00Z"));
    expect([b, a].sort()).toEqual([a, b]);
  });

  it("ตัวกรองรับเฉพาะชื่อที่ระบบสร้าง — ไฟล์อื่นในโฟลเดอร์ไม่ถูกลบตามอายุ", () => {
    expect(BACKUP_FOLDER_PATTERN.test("systemboq-2026-09-18_023005")).toBe(true);
    for (const name of ["systemboq-2026-09-18_023005.partial", "my-notes", "systemboq-latest"]) {
      expect(BACKUP_FOLDER_PATTERN.test(name)).toBe(false);
    }
  });
});

describe("ลบชุดเก่า", () => {
  const now = at("2026-09-30T00:00:00Z");
  const daysAgo = (n: number, name = `d${n}`) => ({ name, createdAt: new Date(now.getTime() - n * DAY) });

  it("ลบเฉพาะที่เก่ากว่าที่ตั้งไว้", () => {
    const list = [daysAgo(1), daysAgo(5), daysAgo(13), daysAgo(15), daysAgo(40)];
    expect(selectBackupsToPrune(list, now, 14, 3).sort()).toEqual(["d15", "d40"]);
  });

  it("ระบบสำรองหยุดไปนาน — ชุดล่าสุดต้องไม่ถูกลบจนเหลือศูนย์", () => {
    const list = [daysAgo(30), daysAgo(31), daysAgo(32), daysAgo(33)];
    expect(selectBackupsToPrune(list, now, 14, 3)).toEqual(["d33"]);
    expect(selectBackupsToPrune([daysAgo(90)], now, 14, 3)).toEqual([]);
  });
});

describe("เวลาสำรองอัตโนมัติรอบถัดไป (เวลาไทย)", () => {
  it("ยังไม่ถึงตีสองของวันนี้ = วันนี้ตีสอง", () => {
    // 01:00 ไทย = 18:00 UTC ของเมื่อวาน
    expect(nextScheduledRun(at("2026-09-17T18:00:00Z"), 2).toISOString()).toBe("2026-09-17T19:00:00.000Z");
  });

  it("เลยตีสองไปแล้ว = ตีสองของพรุ่งนี้", () => {
    // 10:00 ไทย = 03:00 UTC
    expect(nextScheduledRun(at("2026-09-18T03:00:00Z"), 2).toISOString()).toBe("2026-09-18T19:00:00.000Z");
  });

  it("ตรงเวลาพอดีนับเป็นรอบถัดไป (ไม่รันซ้ำทันที)", () => {
    expect(nextScheduledRun(at("2026-09-17T19:00:00Z"), 2).toISOString()).toBe("2026-09-18T19:00:00.000Z");
  });
});

describe("ชุดล่าสุดเก่าเกินไปหรือยัง", () => {
  const now = at("2026-09-18T12:00:00Z");
  it("ไม่เคยสำรองเลย = เก่าเกิน", () => {
    expect(isBackupStale(null, now, 36)).toBe(true);
  });
  it("เทียบกับจำนวนชั่วโมงที่ยอมให้", () => {
    expect(isBackupStale(at("2026-09-17T12:00:00Z"), now, 36)).toBe(false);
    expect(isBackupStale(at("2026-09-16T12:00:00Z"), now, 36)).toBe(true);
  });
});

describe("URL ฐานข้อมูลที่ส่งเข้า pg_dump", () => {
  it("แยกส่วนและถอดรหัสอักขระพิเศษในรหัสผ่าน", () => {
    expect(parsePgUrl("postgresql://boq_backup:p%40ss@db.internal:6543/systemboq?schema=public")).toEqual({
      user: "boq_backup",
      password: "p@ss",
      host: "db.internal",
      port: "6543",
      database: "systemboq",
    });
  });

  it("ปฏิเสธ URL ที่ไม่ใช่ postgres หรือไม่มีชื่อฐานข้อมูล", () => {
    expect(() => parsePgUrl("mysql://a:b@h/db")).toThrow();
    expect(() => parsePgUrl("postgresql://a:b@h/")).toThrow();
  });

  it("ชื่อที่ส่งเข้าคำสั่งภายนอกต้องเป็นตัวอักษรธรรมดาเท่านั้น", () => {
    expect(assertSafeIdentifier("systemboq_test", "db")).toBe("systemboq_test");
    for (const bad of ["a b", "x;drop", "-U", "db$(whoami)", ""]) {
      expect(() => assertSafeIdentifier(bad, "db")).toThrow();
    }
  });
});
