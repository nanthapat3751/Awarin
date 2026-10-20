-- "ซื้อแล้ว/ล็อกราคาแล้ว" ของบรรทัดที่ราคาในคลังเปลี่ยนหลังเซ็นสัญญา
-- CreateTable
CREATE TABLE "PriceDriftAck" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "materialUnitPrice" DECIMAL(14,2) NOT NULL,
    "laborUnitPrice" DECIMAL(14,2) NOT NULL,
    "ackedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceDriftAck_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "PriceDriftAck_boqItemId_idx" ON "PriceDriftAck"("boqItemId");
-- CreateIndex
CREATE INDEX "PriceDriftAck_ackedById_idx" ON "PriceDriftAck"("ackedById");
-- CreateIndex
CREATE UNIQUE INDEX "PriceDriftAck_projectId_boqItemId_key" ON "PriceDriftAck"("projectId", "boqItemId");
-- AddForeignKey
ALTER TABLE "PriceDriftAck" ADD CONSTRAINT "PriceDriftAck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PriceDriftAck" ADD CONSTRAINT "PriceDriftAck_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PriceDriftAck" ADD CONSTRAINT "PriceDriftAck_ackedById_fkey" FOREIGN KEY ("ackedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
