-- ยืนยันรายการรับเงินกับบัญชีธนาคาร (คนที่สองตรวจ) — รายการเดิมเป็นรอยืนยันทั้งหมด (ไม่เคยมีใครตรวจจริง จึงไม่เติมให้)
-- AlterTable
ALTER TABLE "InstallmentPayment" ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT;
-- CreateIndex
CREATE INDEX "InstallmentPayment_verifiedAt_idx" ON "InstallmentPayment"("verifiedAt");
-- CreateIndex
CREATE INDEX "InstallmentPayment_verifiedById_idx" ON "InstallmentPayment"("verifiedById");
-- AddForeignKey
ALTER TABLE "InstallmentPayment" ADD CONSTRAINT "InstallmentPayment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
