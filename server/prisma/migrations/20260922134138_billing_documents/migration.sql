-- CreateEnum
CREATE TYPE "BillingDocType" AS ENUM ('INVOICE', 'RECEIPT');

-- CreateTable
CREATE TABLE "BillingDocument" (
    "id" TEXT NOT NULL,
    "type" "BillingDocType" NOT NULL,
    "docNo" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "paymentId" TEXT,
    "issuedOn" DATE NOT NULL,
    "dueOn" DATE,
    "contractNo" TEXT NOT NULL,
    "projectNo" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "milestone" TEXT NOT NULL,
    "customerName" TEXT,
    "customerAddress" TEXT,
    "customerIsCompany" BOOLEAN NOT NULL DEFAULT false,
    "customerTaxId" TEXT,
    "customerBranch" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "vatAmount" DECIMAL(14,2),
    "paidBefore" DECIMAL(14,2),
    "withholdingAmount" DECIMAL(14,2),
    "method" "PaymentMethod",
    "reference" TEXT,
    "issuedById" TEXT,
    "issuedByName" TEXT NOT NULL,
    "issuedByTitle" TEXT,
    "signaturePng" BYTEA,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingDocument_docNo_key" ON "BillingDocument"("docNo");

-- CreateIndex
CREATE INDEX "BillingDocument_contractId_idx" ON "BillingDocument"("contractId");

-- CreateIndex
CREATE INDEX "BillingDocument_installmentId_idx" ON "BillingDocument"("installmentId");

-- CreateIndex
CREATE INDEX "BillingDocument_paymentId_idx" ON "BillingDocument"("paymentId");

-- AddForeignKey
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "ContractInstallment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "InstallmentPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
