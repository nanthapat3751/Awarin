/**
 * ระยะเวลาเก็บแถวใน "AuditLog" ก่อนถูกลบอัตโนมัติ
 *
 * ตัวเลขนี้ต้องตรงกับที่ประกาศไว้ในหน้านโยบายความเป็นส่วนตัวฝั่งลูกค้า
 * (`client-app/src/pages/PrivacyPage.tsx` → "บันทึกการเข้าใช้งานและหมายเลขไอพี — 1 ปี")
 * ถ้าจะเปลี่ยนตรงนี้ ต้องแก้ข้อความในนโยบายด้วย — นโยบายที่เขียนไว้แล้วไม่ทำตามคือความเสี่ยง
 *
 * อยู่ในไฟล์ของตัวเองเพราะถูก import จากสองฝั่งที่ไม่ควรลากกันมา:
 *   - `src/lib/audit-log.ts` (ตอนรันแอป)
 *   - `prisma/grant-runtime-privileges.ts` (ตอน seed — สร้างฟังก์ชันในฐานข้อมูลด้วยค่านี้)
 * ไฟล์นี้จึงต้องไม่ import อะไรเลย ไม่งั้นสคริปต์ seed จะพลอยเปิดการเชื่อมต่อ Prisma ตามมาด้วย
 */
export const AUDIT_LOG_RETENTION_DAYS = 365;

/** ชื่อฟังก์ชันในฐานข้อมูลที่ทำหน้าที่ลบจริง (SECURITY DEFINER — ดู grant-runtime-privileges.ts) */
export const AUDIT_LOG_PURGE_FUNCTION = "purge_expired_audit_log";
