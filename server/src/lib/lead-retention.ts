import { writeAuditLog } from "./audit-log";
import { prisma } from "./prisma";
import { collectUploadFilenames, deleteUploadedFiles } from "./uploaded-files";

/**
 * ระยะเวลาเก็บคำขอติดต่อ — ต้องตรงกับนโยบายความเป็นส่วนตัว (client-app PrivacyPage):
 * "คำขอติดต่อที่ไม่ได้ดำเนินการต่อ — 2 ปีนับจากวันที่ติดต่อครั้งสุดท้าย"
 * เปลี่ยนตัวเลขนี้ = ต้องแก้ข้อความในนโยบายด้วย
 */
export const LEAD_RETENTION_DAYS = 730;

/**
 * ลบคำขอติดต่อที่ "ไม่ได้ดำเนินการต่อ" เกินระยะเวลาเก็บ (ผู้ใช้สั่งทำ 18 ต.ค. — เดิมต้องลบด้วยมือ)
 *
 * - ไม่ได้ดำเนินการต่อ = ยังไม่ถูกสร้างเป็นโครงการ · คำขอที่เป็นโครงการแล้วเป็นส่วนหนึ่งของเอกสารโครงการ
 *   (ใบเสนอราคา/สัญญา เก็บ 5 ปีตามกฎหมายบัญชี) จึงไม่แตะเลย
 * - วันที่ติดต่อครั้งสุดท้าย = updatedAt (ตอบกลับ/เปลี่ยนสถานะ/แก้ไข ขยับค่านี้ทุกครั้ง และไม่ต่ำกว่า createdAt)
 * - ลบจริง (ไม่ใช่ย้ายเข้าถังขยะ) พร้อมไฟล์แนบ — ไฟล์แนบอาจมีข้อมูลส่วนบุคคลเหมือนตัวคำขอ
 * - AuditLog ไม่เก็บชื่อ/เบอร์ (ข้อมูลที่เพิ่งลบไม่ควรไปค้างอยู่ในบันทึก)
 */
export async function sweepStaleLeads(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - LEAD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const stale = await prisma.lead.findMany({
    where: { project: null, updatedAt: { lt: cutoff } },
    select: { id: true, attachments: true },
  });

  let removed = 0;
  for (const lead of stale) {
    try {
      await prisma.lead.delete({ where: { id: lead.id } });
      deleteUploadedFiles(collectUploadFilenames(lead.attachments));
      await writeAuditLog({
        userId: null,
        action: "AUTO_PURGE_LEAD_RETENTION",
        entityType: "Lead",
        entityId: lead.id,
        details: { retentionDays: LEAD_RETENTION_DAYS },
      });
      removed += 1;
    } catch {
      // best-effort: แถวหนึ่งพลาด (เช่น เพิ่งถูกสร้างเป็นโครงการพอดี) ไม่ควรล้มทั้งรอบ
    }
  }
  return removed;
}
