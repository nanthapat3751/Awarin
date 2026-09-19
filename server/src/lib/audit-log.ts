import type { Prisma } from "@prisma/client";

import { AUDIT_LOG_PURGE_FUNCTION, AUDIT_LOG_RETENTION_DAYS } from "./audit-retention";
import { prisma } from "./prisma";

export interface AuditLogInput {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/** แถวใน AuditLog เป็นแบบเพิ่มอย่างเดียว (append-only) — ที่นี่คือที่เดียวที่เขียนลงตารางนี้ */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      details: (input.details as Prisma.InputJsonValue | undefined) ?? undefined,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

/**
 * ลบแถว audit ที่เก่าเกินระยะเวลาเก็บ (ดู AUDIT_LOG_RETENTION_DAYS) — คืนจำนวนแถวที่ลบไป
 *
 * ต้องเรียกผ่านฟังก์ชันในฐานข้อมูลเท่านั้น เพราะ role ที่แอปใช้ (`boq_app`) ไม่มีสิทธิ์ DELETE
 * บน "AuditLog" โดยตั้งใจ — `prisma.auditLog.deleteMany()` จะโดนปฏิเสธด้วย permission denied
 * ฟังก์ชันนั้นไม่รับพารามิเตอร์ เส้นตายฝังอยู่ข้างใน แอปจึงลบแถวที่ยังไม่ถึงกำหนดไม่ได้เลย
 * (ดูเหตุผลเต็มใน prisma/grant-runtime-privileges.ts)
 */
export async function sweepAuditLog(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Record<string, bigint | number>[]>(
    `SELECT ${AUDIT_LOG_PURGE_FUNCTION.replace(/[^a-z_]/g, "")}() AS removed`,
  );
  const removed = Number(rows[0]?.removed ?? 0);
  if (removed > 0) {
    // บันทึกไว้ว่าลบไปกี่แถวเพราะเหตุใด — แถวนี้เพิ่งเกิด จึงไม่โดนรอบลบของตัวเอง
    await writeAuditLog({
      userId: null,
      action: "AUTO_PURGE_AUDIT_LOG",
      entityType: "AuditLog",
      details: { removed, retentionDays: AUDIT_LOG_RETENTION_DAYS },
    });
  }
  return removed;
}
