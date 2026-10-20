-- เงินประกันผลงาน (retention) + ต้นทุนจริงของโครงการ
--
-- ไม่แตะข้อมูลเดิม: สัญญาเดิมทั้งหมด retentionPct = null (ไม่มีเงินประกัน) · รายการรับเงินเดิมกันไว้ 0
-- ใบแจ้งหนี้/ใบเสร็จเดิมผูกงวดอยู่แล้ว installmentId จึงไม่มีแถวไหนเป็น null หลังย้าย
-- ตารางใหม่ได้สิทธิ์ boq_app อัตโนมัติจาก ALTER DEFAULT PRIVILEGES

-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('MATERIAL', 'LABOR', 'SUBCONTRACT', 'EQUIPMENT', 'OVERHEAD', 'OTHER');

-- AlterTable
ALTER TABLE "BillingDocument" ADD COLUMN     "forRetention" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retentionAmount" DECIMAL(14,2),
ADD COLUMN     "retentionReleaseId" TEXT,
ALTER COLUMN "installmentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "retentionDueOn" DATE,
ADD COLUMN     "retentionPct" DECIMAL(5,2),
ADD COLUMN     "retentionSetAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InstallmentPayment" ADD COLUMN     "retentionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RetentionRelease" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "withholdingAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "method" "PaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "reference" TEXT,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCost" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "spentOn" DATE NOT NULL,
    "categoryId" TEXT,
    "costType" "CostType" NOT NULL,
    "description" TEXT NOT NULL,
    "vendor" TEXT,
    "reference" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetentionRelease_contractId_paidOn_idx" ON "RetentionRelease"("contractId", "paidOn");

-- CreateIndex
CREATE INDEX "ProjectCost_projectId_spentOn_idx" ON "ProjectCost"("projectId", "spentOn");

-- CreateIndex
CREATE INDEX "ProjectCost_categoryId_idx" ON "ProjectCost"("categoryId");

-- CreateIndex
CREATE INDEX "BillingDocument_retentionReleaseId_idx" ON "BillingDocument"("retentionReleaseId");

-- AddForeignKey
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_retentionReleaseId_fkey" FOREIGN KEY ("retentionReleaseId") REFERENCES "RetentionRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionRelease" ADD CONSTRAINT "RetentionRelease_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionRelease" ADD CONSTRAINT "RetentionRelease_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WorkCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
