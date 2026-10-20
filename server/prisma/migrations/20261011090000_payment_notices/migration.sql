-- CreateEnum
CREATE TYPE "PaymentNoticeStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "PaymentEvidence" ADD COLUMN     "noticeId" TEXT,
ALTER COLUMN "paymentId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PaymentNotice" (
    "id" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "status" "PaymentNoticeStatus" NOT NULL DEFAULT 'PENDING',
    "submittedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "paymentId" TEXT,

    CONSTRAINT "PaymentNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentNotice_paymentId_key" ON "PaymentNotice"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentNotice_installmentId_status_idx" ON "PaymentNotice"("installmentId", "status");

-- CreateIndex
CREATE INDEX "PaymentNotice_status_idx" ON "PaymentNotice"("status");

-- CreateIndex
CREATE INDEX "PaymentEvidence_noticeId_idx" ON "PaymentEvidence"("noticeId");

-- AddForeignKey
ALTER TABLE "PaymentEvidence" ADD CONSTRAINT "PaymentEvidence_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "PaymentNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotice" ADD CONSTRAINT "PaymentNotice_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "ContractInstallment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotice" ADD CONSTRAINT "PaymentNotice_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotice" ADD CONSTRAINT "PaymentNotice_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotice" ADD CONSTRAINT "PaymentNotice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "InstallmentPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ไฟล์หลักฐานต้องผูกกับอะไรสักอย่างเสมอ (รายการรับเงิน หรือการแจ้งโอน) — แถวลอยไม่มีเจ้าของ = ไฟล์ที่ไม่มีใครเปิดได้
ALTER TABLE "PaymentEvidence" ADD CONSTRAINT "PaymentEvidence_owner_check" CHECK ("paymentId" IS NOT NULL OR "noticeId" IS NOT NULL);
