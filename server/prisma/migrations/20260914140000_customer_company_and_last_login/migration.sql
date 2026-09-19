-- ลูกค้านิติบุคคล + วันที่เข้าระบบล่าสุด
--
-- (1) ก่อนหน้านี้ CustomerProfile มีแค่ phone + address ระบบจึงรับได้แต่ "คน" เท่านั้น
--     เอกสารพิมพ์ได้แค่ "ผู้ว่าจ้าง: <ชื่อคน>" ยื่นให้ฝ่ายบัญชีของบริษัทลูกค้าไม่ได้ และคำนวณ
--     ภาษีหัก ณ ที่จ่าย 3% ไม่ได้เลย เพราะไม่รู้ว่าผู้ว่าจ้างเป็นนิติบุคคลหรือไม่
--     (companyTaxId ในหน้าตั้งค่าเป็นเลขภาษีของ *เรา* คนละตัวกับของลูกค้า)
--
-- (2) lastLoginAt เดิมคำนวณจาก AuditLog ทุกครั้งที่เปิดหน้ารายชื่อ (groupBy ข้ามลูกค้าทุกคน)
--     ซึ่งเรียงลำดับในฐานข้อมูลไม่ได้ และ **ผิดในระยะยาว** เพราะ AuditLog ถูกไล่ลบทุก 1 ปี
--     คอลัมน์นี้จึงเป็นทั้งของที่เรียงได้และของที่ถูกต้องกว่า

CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'COMPANY');

ALTER TABLE "CustomerProfile"
  ADD COLUMN "customerType"  "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
  -- ชื่อนิติบุคคลตามหนังสือรับรอง — ใช้เป็นชื่อ "ผู้ว่าจ้าง" บนเอกสารแทนชื่อคนที่สมัคร
  ADD COLUMN "companyName"   TEXT,
  -- เลขประจำตัวผู้เสียภาษีของลูกค้า 13 หลัก
  ADD COLUMN "taxId"         TEXT,
  -- "สำนักงานใหญ่" หรือ "สาขา 00001" — ใบกำกับภาษีต้องระบุ
  ADD COLUMN "branch"        TEXT,
  -- ผู้ประสานงานฝั่งลูกค้า (คนที่เราคุยด้วยจริง) ว่างไว้ = ใช้ชื่อเจ้าของบัญชี
  ADD COLUMN "contactPerson" TEXT;

ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- เติมย้อนหลังจากบันทึกการเข้าระบบที่มีอยู่จริง ไม่ใช่ค่าที่แต่งขึ้น
UPDATE "User" u
SET "lastLoginAt" = last_login.at
FROM (
  SELECT "userId", MAX("createdAt") AS at
  FROM "AuditLog"
  WHERE "action" = 'LOGIN_SUCCESS' AND "userId" IS NOT NULL
  GROUP BY "userId"
) AS last_login
WHERE u."id" = last_login."userId";

-- รายชื่อลูกค้าอ่านเป็น "เฉพาะ role CUSTOMER แล้วเรียงตามคอลัมน์ใดคอลัมน์หนึ่ง" เสมอ
CREATE INDEX "User_role_fullName_idx"    ON "User"("role", "fullName");
CREATE INDEX "User_role_createdAt_idx"   ON "User"("role", "createdAt");
CREATE INDEX "User_role_lastLoginAt_idx" ON "User"("role", "lastLoginAt");
