-- CreateEnum
CREATE TYPE "SlipCheckStatus" AS ENUM ('PASSED', 'MISMATCH', 'UNCHECKED', 'FAKE', 'DUPLICATE', 'WRONG_ACCOUNT');

-- AlterTable
ALTER TABLE "PaymentNotice" ADD COLUMN     "slipFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "slipStatus" "SlipCheckStatus";

-- CreateTable
CREATE TABLE "SlipVerification" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "status" "SlipCheckStatus" NOT NULL,
    "transRef" TEXT,
    "activeRef" TEXT,
    "amount" DECIMAL(14,2),
    "transferredAt" TIMESTAMP(3),
    "senderName" TEXT,
    "senderBank" TEXT,
    "receiverName" TEXT,
    "receiverAccount" TEXT,
    "message" TEXT,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlipVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlipVerification_evidenceId_key" ON "SlipVerification"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "SlipVerification_activeRef_key" ON "SlipVerification"("activeRef");

-- CreateIndex
CREATE INDEX "SlipVerification_noticeId_idx" ON "SlipVerification"("noticeId");

-- AddForeignKey
ALTER TABLE "SlipVerification" ADD CONSTRAINT "SlipVerification_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "PaymentNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlipVerification" ADD CONSTRAINT "SlipVerification_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "PaymentEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

