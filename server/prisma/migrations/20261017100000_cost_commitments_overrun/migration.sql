-- ยอดผูกพัน (สั่งแล้วยังไม่จ่าย) + สาเหตุที่ค่าใช้จ่ายเกินงบ + ผูกใบงานเพิ่ม-ลด
-- CreateEnum
CREATE TYPE "CostOverrunReason" AS ENUM ('CUSTOMER_CHANGE', 'PRICE_INCREASE', 'REWORK', 'TAKEOFF_SHORT', 'OTHER');
-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('OPEN', 'CLOSED');
-- AlterTable
ALTER TABLE "ProjectCost" ADD COLUMN     "changeOrderId" TEXT,
ADD COLUMN     "commitmentId" TEXT,
ADD COLUMN     "overrunNote" TEXT,
ADD COLUMN     "overrunReason" "CostOverrunReason",
ADD COLUMN     "voWaived" BOOLEAN NOT NULL DEFAULT false;
-- CreateTable
CREATE TABLE "ProjectCommitment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "committedOn" DATE NOT NULL,
    "categoryId" TEXT,
    "costType" "CostType" NOT NULL,
    "description" TEXT NOT NULL,
    "vendor" TEXT,
    "reference" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "overrunReason" "CostOverrunReason",
    "overrunNote" TEXT,
    "changeOrderId" TEXT,
    "voWaived" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectCommitment_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "ProjectCommitment_projectId_committedOn_idx" ON "ProjectCommitment"("projectId", "committedOn");
-- CreateIndex
CREATE INDEX "ProjectCommitment_categoryId_idx" ON "ProjectCommitment"("categoryId");
-- CreateIndex
CREATE INDEX "ProjectCommitment_changeOrderId_idx" ON "ProjectCommitment"("changeOrderId");
-- CreateIndex
CREATE INDEX "ProjectCommitment_recordedById_idx" ON "ProjectCommitment"("recordedById");
-- CreateIndex
CREATE INDEX "ProjectCost_commitmentId_idx" ON "ProjectCost"("commitmentId");
-- CreateIndex
CREATE INDEX "ProjectCost_changeOrderId_idx" ON "ProjectCost"("changeOrderId");
-- AddForeignKey
ALTER TABLE "ProjectCommitment" ADD CONSTRAINT "ProjectCommitment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ProjectCommitment" ADD CONSTRAINT "ProjectCommitment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WorkCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ProjectCommitment" ADD CONSTRAINT "ProjectCommitment_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ProjectCommitment" ADD CONSTRAINT "ProjectCommitment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "ProjectCommitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
