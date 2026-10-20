-- ใบถอดแบบรายบรรทัด (qtyBasis = 'SHEET') + ช่องเปิดประตู/หน้าต่างระดับโครงการ
--
-- ไม่แตะบรรทัด/โครงการเดิม: คอลัมน์ใหม่ว่างได้ทั้งหมด ตารางใหม่เริ่มว่าง ยอดเงินเดิมไม่ขยับ

ALTER TABLE "Project" ADD COLUMN "openingAreaSqm" DECIMAL(12,2);
ALTER TABLE "Project" ADD COLUMN "openings" JSONB;

CREATE TABLE "BoqTakeoffRow" (
    "id" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "count" DECIMAL(12,3) NOT NULL,
    "length" DECIMAL(12,4),
    "width" DECIMAL(12,4),
    "height" DECIMAL(12,4),
    "barDia" INTEGER,
    "deduct" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BoqTakeoffRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoqTakeoffRow_boqItemId_idx" ON "BoqTakeoffRow"("boqItemId");

ALTER TABLE "BoqTakeoffRow"
    ADD CONSTRAINT "BoqTakeoffRow_boqItemId_fkey"
    FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
