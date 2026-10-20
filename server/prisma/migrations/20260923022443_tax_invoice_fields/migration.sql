-- AlterTable
ALTER TABLE "BillingDocument" ADD COLUMN     "isTaxInvoice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "replacesDocNo" TEXT,
ADD COLUMN     "sellerAddress" TEXT,
ADD COLUMN     "sellerBranch" TEXT,
ADD COLUMN     "sellerName" TEXT,
ADD COLUMN     "sellerTaxId" TEXT;

-- CreateIndex
CREATE INDEX "BillingDocument_isTaxInvoice_issuedOn_idx" ON "BillingDocument"("isTaxInvoice", "issuedOn");
