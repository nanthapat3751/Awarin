import type { PrismaClient } from "@prisma/client";

import { AUDIT_LOG_PURGE_FUNCTION, AUDIT_LOG_RETENTION_DAYS } from "../src/lib/audit-retention";

/**
 * ตั้งค่า role `boq_app` ที่จำกัดสิทธิ์ซึ่งแอปใช้เชื่อมต่อ โดยทำกับฐานข้อมูลที่ `prisma` กำลัง
 * เชื่อมต่ออยู่ในขณะนั้น ทำซ้ำได้ปลอดภัย (idempotent) — รันทุกครั้งได้ ใช้ร่วมกันระหว่าง
 * prisma/seed.ts (ฐานข้อมูล dev) กับ prisma/setup-test-db.ts (ฐานข้อมูลทดสอบ) เพื่อให้ทั้งคู่
 * ใช้กติกาสิทธิ์เดียวกันตรงกันเสมอ
 */
export async function grantRuntimeRolePrivileges(prisma: PrismaClient, databaseName: string) {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'boq_app') THEN
        CREATE ROLE boq_app WITH LOGIN PASSWORD 'boq_app_dev_password';
      END IF;
    END
    $$;
  `);
  await prisma.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${databaseName}" TO boq_app;`);
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO boq_app;`);
  await prisma.$executeRawUnsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO boq_app;`,
  );
  await prisma.$executeRawUnsafe(`
    ALTER DEFAULT PRIVILEGES FOR ROLE boq IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO boq_app;
  `);
  // บังคับให้เพิ่มได้อย่างเดียว (append-only): แอป INSERT แถว audit ได้ แต่แก้หรือลบไม่ได้เด็ดขาด
  await prisma.$executeRawUnsafe(`REVOKE UPDATE, DELETE ON "AuditLog" FROM boq_app;`);
  // ตาราง bookkeeping ของ Prisma ไม่ใช่ข้อมูลแอป — role รันแอปไม่ควรแตะประวัติ migration ได้เลย
  // (GRANT ... ON ALL TABLES ด้านบนเผลอเหมารวมมันมาด้วย จึงถอนคืนให้เหลือศูนย์สิทธิ์)
  await prisma.$executeRawUnsafe(`REVOKE ALL ON "_prisma_migrations" FROM boq_app;`);

  await createAuditLogPurgeFunction(prisma);
  await grantBackupRolePrivileges(prisma, databaseName);
}

/**
 * role `boq_backup` — อ่านได้อย่างเดียว ใช้กับ pg_dump ตอนสำรองข้อมูล (ดู src/lib/backup)
 *
 * ทำไมไม่ใช้ `boq_app`: มันถูกถอนสิทธิ์ `_prisma_migrations` ไว้โดยตั้งใจ (pg_dump จึงล้มทั้งไฟล์)
 * และถ้าให้เพิ่มเพื่อการสำรองก็เท่ากับขยายสิทธิ์ของแอปที่รันอยู่ตลอดเวลา
 * ทำไมไม่ใช้ `boq` (superuser): โปรเซสแอปที่ตั้งเวลาสำรองอัตโนมัติจะต้องถือรหัส superuser ไว้ —
 * แอปที่ถูกเจาะจะได้สิทธิ์ลบทั้งฐานข้อมูลไปด้วย · `boq_backup` อ่านได้ทุกตาราง แต่เขียนอะไรไม่ได้เลย
 */
export async function grantBackupRolePrivileges(prisma: PrismaClient, databaseName: string) {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'boq_backup') THEN
        CREATE ROLE boq_backup WITH LOGIN PASSWORD 'boq_backup_dev_password';
      END IF;
    END
    $$;
  `);
  await prisma.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${databaseName}" TO boq_backup;`);
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO boq_backup;`);
  await prisma.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO boq_backup;`);
  await prisma.$executeRawUnsafe(`GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO boq_backup;`);
  // ตารางที่ migration ในอนาคตสร้าง (ในนาม boq) ต้องติดอยู่ในไฟล์สำรองด้วยโดยไม่ต้องจำมาแก้ที่นี่
  await prisma.$executeRawUnsafe(`
    ALTER DEFAULT PRIVILEGES FOR ROLE boq IN SCHEMA public GRANT SELECT ON TABLES TO boq_backup;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER DEFAULT PRIVILEGES FOR ROLE boq IN SCHEMA public GRANT SELECT ON SEQUENCES TO boq_backup;
  `);
}

/**
 * ทางเดียวที่แอปจะลบแถว audit ได้ — และลบได้เฉพาะแถวที่เก่าเกินระยะเวลาเก็บเท่านั้น
 *
 * ปัญหา: นโยบายความเป็นส่วนตัวประกาศว่าเก็บบันทึกการเข้าใช้งานไว้ 1 ปี แต่ `boq_app` ถูก
 * REVOKE DELETE ไปแล้วด้านบน (append-only) จึงไล่ลบเองไม่ได้ ส่วนการ GRANT DELETE คืนก็เท่ากับ
 * ทิ้งหลักประกันทั้งหมด — แอปที่ถูกเจาะจะลบร่องรอยตัวเองได้ทันที
 *
 * ทางออก: ฟังก์ชัน SECURITY DEFINER ที่เจ้าของคือ `boq` (มีสิทธิ์ DELETE) แต่**ไม่รับพารามิเตอร์**
 * เส้นตายถูกฝังไว้ในตัวฟังก์ชัน แอปจึงสั่งได้แค่ "ลบของที่เกินกำหนด" สั่ง "ลบของเมื่อวาน" ไม่ได้
 * (ถ้ารับ cutoff เป็นพารามิเตอร์ แอปที่ถูกเจาะจะส่ง now() มาแล้วล้างทั้งตารางได้ — จึงห้ามทำ)
 *
 * `SET search_path` กันการสวมชื่อตาราง: ฟังก์ชัน SECURITY DEFINER ที่ไม่ตรึง search_path
 * เป็นช่องโหว่ยกระดับสิทธิ์แบบคลาสสิก
 *
 * ค่า retention มาจาก `AUDIT_LOG_RETENTION_DAYS` ที่เดียว และถูก CREATE OR REPLACE ทุกครั้งที่
 * รัน seed — แก้ตัวเลขในโค้ดแล้วรัน seed ใหม่ ฟังก์ชันในฐานข้อมูลจะตามทันที
 */
async function createAuditLogPurgeFunction(prisma: PrismaClient) {
  // ปลอดภัยจาก SQL injection: ทั้งคู่เป็นค่าคงที่ในโค้ด และบังคับชนิดซ้ำอีกชั้นก่อนต่อสตริง
  const days = Number(AUDIT_LOG_RETENTION_DAYS);
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`AUDIT_LOG_RETENTION_DAYS ต้องเป็นจำนวนเต็มบวก (ได้ ${AUDIT_LOG_RETENTION_DAYS})`);
  }
  const fn = AUDIT_LOG_PURGE_FUNCTION.replace(/[^a-z_]/g, "");

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION ${fn}()
    RETURNS bigint
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
    DECLARE removed bigint;
    BEGIN
      DELETE FROM "AuditLog" WHERE "createdAt" < now() - make_interval(days => ${days});
      GET DIAGNOSTICS removed = ROW_COUNT;
      RETURN removed;
    END;
    $fn$;
  `);
  // ค่าเริ่มต้นของ Postgres คือใครก็เรียกฟังก์ชันได้ — ถอนออกก่อน แล้วให้เฉพาะ role ที่แอปใช้
  await prisma.$executeRawUnsafe(`REVOKE ALL ON FUNCTION ${fn}() FROM PUBLIC;`);
  await prisma.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION ${fn}() TO boq_app;`);
}
