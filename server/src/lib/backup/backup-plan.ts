/**
 * ส่วน "คิดล้วน" ของระบบสำรองข้อมูล — ไม่แตะดิสก์ ไม่เรียกโปรแกรมภายนอก จึงทดสอบได้ตรง ๆ
 * (ตัวที่ลงมือจริงอยู่ใน backup.ts)
 */

/** ชื่อโฟลเดอร์ของชุดสำรอง: systemboq-2026-09-18_0200 (เวลาไทย เรียงตามตัวอักษร = เรียงตามเวลา) */
export function backupFolderName(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `systemboq-${get("year")}-${get("month")}-${get("day")}_${get("hour")}${get("minute")}${get("second")}`;
}

/** ชื่อโฟลเดอร์ที่ระบบนี้สร้างเท่านั้น — ตัวกรองตอนลบของเก่า ห้ามแตะไฟล์อื่นที่ผู้ใช้วางไว้ในโฟลเดอร์เดียวกัน */
export const BACKUP_FOLDER_PATTERN = /^systemboq-\d{4}-\d{2}-\d{2}_\d{6}$/;

export interface BackupStamp {
  name: string;
  createdAt: Date;
}

/**
 * เลือกชุดสำรองที่ลบได้: เก่ากว่า keepDays วัน **และ** ไม่ใช่ minKeep ชุดล่าสุด
 *
 * minKeep กันกรณีระบบหยุดสำรองไปนาน (เช่น pg_dump พังเงียบ ๆ สามสัปดาห์) — ถ้าดูแค่อายุ
 * ชุดสำรองที่ดีชุดสุดท้ายจะถูกลบทิ้งไปด้วย เหลือศูนย์ชุดตอนที่ต้องใช้พอดี
 */
export function selectBackupsToPrune(
  backups: BackupStamp[],
  now: Date,
  keepDays: number,
  minKeep: number,
): string[] {
  const newestFirst = [...backups].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000;
  return newestFirst
    .slice(minKeep)
    .filter((b) => b.createdAt.getTime() < cutoff)
    .map((b) => b.name);
}

/**
 * เวลาถัดไปที่ต้องสำรองอัตโนมัติ: ทุกวันเวลา hour:00 ตามเวลาไทย (ประเทศไทยไม่มีเวลาออมแสง
 * จึงคิดเป็น UTC+7 คงที่ได้)
 */
export function nextScheduledRun(now: Date, hour: number): Date {
  const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + BKK_OFFSET_MS);
  const target = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, 0, 0, 0) -
      BKK_OFFSET_MS,
  );
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target;
}

/**
 * ชุดล่าสุดเก่าเกินไปแล้วหรือยัง — ใช้ทั้งตอนบูตเซิร์ฟเวอร์ (เครื่องปิดไปข้ามเวลาที่ตั้งไว้ → สำรองชดเชย)
 * และบนหน้าจอ (เตือนเจ้าของว่าระบบสำรองหยุดทำงาน)
 */
export function isBackupStale(latest: Date | null, now: Date, maxAgeHours: number): boolean {
  if (!latest) return true;
  return now.getTime() - latest.getTime() > maxAgeHours * 60 * 60 * 1000;
}

/** ชิ้นส่วนของ URL เชื่อมต่อ Postgres ที่ pg_dump ต้องใช้ */
export interface PgTarget {
  user: string;
  password: string;
  host: string;
  port: string;
  database: string;
}

export function parsePgUrl(url: string): PgTarget {
  const u = new URL(url);
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") {
    throw new Error("ต้องเป็น URL แบบ postgresql://");
  }
  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!database) throw new Error("URL ไม่ได้ระบุชื่อฐานข้อมูล");
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname,
    port: u.port || "5432",
    database,
  };
}

/** ชื่อฐานข้อมูล/ผู้ใช้ที่ส่งเข้าคำสั่งภายนอก — กันไว้ก่อนแม้ค่าจะมาจาก .env ของเราเอง */
export function assertSafeIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z_]\w{0,62}$/.test(value)) {
    throw new Error(`${label} มีอักขระที่ไม่อนุญาต: ${value}`);
  }
  return value;
}
