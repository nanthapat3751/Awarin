-- ใบงานเพิ่ม-ลด (Variation Order) หลังลงนามสัญญา
--
-- ไม่แตะข้อมูลเดิม: ตารางใหม่เริ่มว่าง · คอลัมน์ใหม่ของงวดเงินว่างได้ (null = งวดตามสัญญาเดิม ไม่เคยถูกปรับ)

-- CreateEnum
CREATE TYPE "ChangeOrderStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ContractInstallment" ADD COLUMN     "changeOrderId" TEXT,
ADD COLUMN     "originalAmount" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "ChangeOrder" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "docNo" TEXT NOT NULL,
    "status" "ChangeOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "note" TEXT,
    "extensionDays" INTEGER,
    "fromVersionId" TEXT NOT NULL,
    "toVersionId" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "addAmount" DECIMAL(14,2) NOT NULL,
    "deductAmount" DECIMAL(14,2) NOT NULL,
    "adjustAmount" DECIMAL(14,2) NOT NULL,
    "netBeforeVat" DECIMAL(14,2) NOT NULL,
    "vatAmount" DECIMAL(14,2) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "respondedVia" TEXT,
    "responseNote" TEXT,
    "installmentChanges" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrder_docNo_key" ON "ChangeOrder"("docNo");

-- CreateIndex
CREATE INDEX "ChangeOrder_projectId_idx" ON "ChangeOrder"("projectId");

-- CreateIndex
CREATE INDEX "ChangeOrder_toVersionId_idx" ON "ChangeOrder"("toVersionId");

-- CreateIndex
CREATE INDEX "ChangeOrder_fromVersionId_idx" ON "ChangeOrder"("fromVersionId");

-- CreateIndex
CREATE INDEX "ChangeOrder_status_idx" ON "ChangeOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrder_contractId_seq_key" ON "ChangeOrder"("contractId", "seq");

-- AddForeignKey
ALTER TABLE "ContractInstallment" ADD CONSTRAINT "ContractInstallment_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_fromVersionId_fkey" FOREIGN KEY ("fromVersionId") REFERENCES "ProjectVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_toVersionId_fkey" FOREIGN KEY ("toVersionId") REFERENCES "ProjectVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

