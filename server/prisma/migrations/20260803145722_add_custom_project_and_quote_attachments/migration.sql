-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('ESTIMATE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('DESIGN', 'QUOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "AttachmentVisibility" AS ENUM ('INTERNAL', 'CUSTOMER');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "type" "ProjectType" NOT NULL DEFAULT 'ESTIMATE';

-- CreateTable
CREATE TABLE "QuoteAttachment" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'OTHER',
    "visibility" "AttachmentVisibility" NOT NULL DEFAULT 'INTERNAL',
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteAttachment_quoteId_idx" ON "QuoteAttachment"("quoteId");

-- AddForeignKey
ALTER TABLE "QuoteAttachment" ADD CONSTRAINT "QuoteAttachment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteAttachment" ADD CONSTRAINT "QuoteAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
