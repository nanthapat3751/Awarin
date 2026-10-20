-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('MARKUP', 'FACTOR_F');

-- AlterTable
ALTER TABLE "ProjectVersion" ADD COLUMN     "contingencyAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "contingencyPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "factorF" DECIMAL(6,4),
ADD COLUMN     "factorFAmt" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "factorFLabel" TEXT,
ADD COLUMN     "factorFTableId" TEXT,
ADD COLUMN     "pricingMode" "PricingMode" NOT NULL DEFAULT 'MARKUP';

-- CreateTable
CREATE TABLE "FactorFTable" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workType" TEXT NOT NULL,
    "advancePct" DECIMAL(5,2) NOT NULL,
    "retentionPct" DECIMAL(5,2) NOT NULL,
    "interestPct" DECIMAL(5,2) NOT NULL,
    "sourceNote" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FactorFTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactorFRow" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "directCost" DECIMAL(14,2) NOT NULL,
    "factorF" DECIMAL(6,4) NOT NULL,

    CONSTRAINT "FactorFRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FactorFTable_deletedAt_idx" ON "FactorFTable"("deletedAt");

-- CreateIndex
CREATE INDEX "FactorFRow_tableId_idx" ON "FactorFRow"("tableId");

-- CreateIndex
CREATE UNIQUE INDEX "FactorFRow_tableId_directCost_key" ON "FactorFRow"("tableId", "directCost");

-- CreateIndex
CREATE INDEX "ProjectVersion_factorFTableId_idx" ON "ProjectVersion"("factorFTableId");

-- AddForeignKey
ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_factorFTableId_fkey" FOREIGN KEY ("factorFTableId") REFERENCES "FactorFTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactorFTable" ADD CONSTRAINT "FactorFTable_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactorFRow" ADD CONSTRAINT "FactorFRow_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "FactorFTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- NOTE: this FK is pre-existing drift, not part of the Factor F work. The schema has always
-- declared it but no migration ever created it. Verified: 0 orphan rows, so adding it is safe.
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
