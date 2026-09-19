-- ถังขยะ (Recycle Bin): soft-delete columns + index for Lead (คำขอลูกค้า)
-- ลบคำขอสแปม/ขยะไปพักในถังขยะก่อน กู้คืนได้; deletedAt != NULL = อยู่ในถังขยะ (กรองออกจากทุก read)

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- CreateIndex
CREATE INDEX "Lead_deletedAt_idx" ON "Lead"("deletedAt");
