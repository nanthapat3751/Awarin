-- ถอดฟีเจอร์ที่ผู้ใช้สั่งลบ (14 ต.ค. 2026): ความคืบหน้างาน + S-curve และโหมดราคากลางราชการ (Factor F)
-- ตอนลบ: ProgressReport 2 รอบ (ข้อมูลทดสอบ) · ตาราง Factor F ว่าง · ทุกเวอร์ชันเป็น MARKUP — ราคาไม่ขยับ
-- ค่าเผื่อเหลือเผื่อขาด (contingencyPct/contingencyAmt) ยังใช้กับงานเอกชน ไม่ได้ลบ
-- DropForeignKey
ALTER TABLE "FactorFRow" DROP CONSTRAINT "FactorFRow_tableId_fkey";

-- DropForeignKey
ALTER TABLE "FactorFTable" DROP CONSTRAINT "FactorFTable_createdById_fkey";

-- DropForeignKey
ALTER TABLE "ProgressEntry" DROP CONSTRAINT "ProgressEntry_boqItemId_fkey";

-- DropForeignKey
ALTER TABLE "ProgressEntry" DROP CONSTRAINT "ProgressEntry_reportId_fkey";

-- DropForeignKey
ALTER TABLE "ProgressReport" DROP CONSTRAINT "ProgressReport_createdById_fkey";

-- DropForeignKey
ALTER TABLE "ProgressReport" DROP CONSTRAINT "ProgressReport_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProgressReport" DROP CONSTRAINT "ProgressReport_versionId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectScheduleItem" DROP CONSTRAINT "ProjectScheduleItem_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectScheduleItem" DROP CONSTRAINT "ProjectScheduleItem_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectVersion" DROP CONSTRAINT "ProjectVersion_factorFTableId_fkey";

-- DropIndex
DROP INDEX "ProjectVersion_factorFTableId_idx";

-- AlterTable
ALTER TABLE "ProjectVersion" DROP COLUMN "factorF",
DROP COLUMN "factorFAmt",
DROP COLUMN "factorFLabel",
DROP COLUMN "factorFTableId",
DROP COLUMN "pricingMode";

-- DropTable
DROP TABLE "FactorFRow";

-- DropTable
DROP TABLE "FactorFTable";

-- DropTable
DROP TABLE "ProgressEntry";

-- DropTable
DROP TABLE "ProgressReport";

-- DropTable
DROP TABLE "ProjectScheduleItem";

-- DropEnum
DROP TYPE "PricingMode";

