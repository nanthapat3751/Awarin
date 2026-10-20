-- CreateEnum
CREATE TYPE "QuoteSignerRole" AS ENUM ('PROPOSER', 'APPROVER');

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "approvalReturnNote" TEXT,
ADD COLUMN     "approvalReturnedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "QuoteSigner" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "role" "QuoteSignerRole" NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "phone" TEXT,
    "signaturePng" BYTEA,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteSigner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSignature" (
    "userId" TEXT NOT NULL,
    "png" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSignature_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteSigner_quoteId_role_key" ON "QuoteSigner"("quoteId", "role");

-- AddForeignKey
ALTER TABLE "QuoteSigner" ADD CONSTRAINT "QuoteSigner_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteSigner" ADD CONSTRAINT "QuoteSigner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSignature" ADD CONSTRAINT "UserSignature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
