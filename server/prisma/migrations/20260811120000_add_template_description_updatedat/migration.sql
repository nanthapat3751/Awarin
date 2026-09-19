-- เพิ่มคำอธิบายแม่แบบ (nullable) + วันแก้ไขล่าสุด
ALTER TABLE "Template" ADD COLUMN "description" TEXT;
ALTER TABLE "Template" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- แม่แบบที่มีอยู่แล้ว: ให้ updatedAt เท่ากับ createdAt (ยังไม่เคยถูกแก้)
UPDATE "Template" SET "updatedAt" = "createdAt";
