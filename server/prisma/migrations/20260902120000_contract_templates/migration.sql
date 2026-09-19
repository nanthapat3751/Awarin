-- แม่แบบสัญญาที่แก้ถ้อยคำเองได้ (ไม่ต้องแก้โค้ด)
--
-- สองชั้นโดยตั้งใจ:
--   ContractTemplate = ถ้อยคำกลาง ใช้ร่วมกันทุกโครงการ แก้เมื่อไหร่ก็ได้
--   Contract.bodyJson = เนื้อสัญญาที่ "แช่แข็ง" ตอนออกฉบับนั้น (แทนค่าตัวแปรเรียบร้อยแล้ว)
-- ถ้าอ่านถ้อยคำจากแม่แบบตอนพิมพ์ PDF สัญญาที่ลูกค้าเซ็นไปแล้วจะเปลี่ยนตามการแก้แม่แบบย้อนหลัง
-- ซึ่งเป็นเรื่องใหญ่ทางกฎหมาย — จึงต้องคัดลอกมาเก็บไว้กับฉบับนั้นเสมอ
CREATE TABLE "ContractTemplate" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  -- หัวเรื่องบนหน้าปก เช่น "สัญญาเหมาทำการก่อสร้าง"
  "docTitle"    TEXT NOT NULL,
  -- อารัมภบท + ข้อสัญญา + ท้ายสัญญา เก็บเป็น JSON ชุดเดียว (แพตเทิร์นเดียวกับ Template.structure)
  "structure"   JSONB NOT NULL,
  -- แม่แบบตั้งต้นที่ระบบหยิบมาใช้เมื่อออกสัญญาโดยไม่ระบุแม่แบบ — มีได้ตัวเดียว
  "isDefault"   BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "deletedAt"   TIMESTAMP(3),
  "deletedById" TEXT,
  CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContractTemplate_deletedAt_idx" ON "ContractTemplate"("deletedAt");
-- บังคับให้มีแม่แบบตั้งต้นได้แค่ตัวเดียว ที่ระดับฐานข้อมูล ไม่ใช่แค่ในโค้ด
CREATE UNIQUE INDEX "ContractTemplate_one_default_idx"
  ON "ContractTemplate"("isDefault")
  WHERE "isDefault" AND "deletedAt" IS NULL;

ALTER TABLE "Contract"
  ADD COLUMN "templateId"   TEXT,
  ADD COLUMN "templateName" TEXT,
  ADD COLUMN "docTitle"     TEXT,
  ADD COLUMN "bodyJson"     JSONB;

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_templateId_fkey" FOREIGN KEY ("templateId")
  REFERENCES "ContractTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Contract_templateId_idx" ON "Contract"("templateId");
