-- CreateTable
CREATE TABLE "MaterialComponent" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "componentMaterialId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qtyPerUnit" DECIMAL(12,4) NOT NULL,
    "wasteFactorPct" DECIMAL(5,2),
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MaterialComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoqItemComponent" (
    "id" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "componentMaterialId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qtyPerUnit" DECIMAL(12,4) NOT NULL,
    "wasteFactorPct" DECIMAL(5,2),
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BoqItemComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialComponent_materialId_idx" ON "MaterialComponent"("materialId");

-- CreateIndex
CREATE INDEX "BoqItemComponent_boqItemId_idx" ON "BoqItemComponent"("boqItemId");

-- AddForeignKey
ALTER TABLE "MaterialComponent" ADD CONSTRAINT "MaterialComponent_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialComponent" ADD CONSTRAINT "MaterialComponent_componentMaterialId_fkey" FOREIGN KEY ("componentMaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqItemComponent" ADD CONSTRAINT "BoqItemComponent_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqItemComponent" ADD CONSTRAINT "BoqItemComponent_componentMaterialId_fkey" FOREIGN KEY ("componentMaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
