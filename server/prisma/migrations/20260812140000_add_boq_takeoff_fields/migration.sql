-- เครื่องถอดปริมาณ (quantity take-off) บน BoqItem — คอลัมน์ใหม่ nullable/มี default จึงไม่ต้อง
-- re-grant ให้ boq_app; qtyBasis ค่าเดิมทุกแถวเป็น 'MANUAL' (พฤติกรรมเดิม ไม่กระทบราคาที่มีอยู่)
ALTER TABLE "BoqItem" ADD COLUMN "qtyBasis" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "BoqItem" ADD COLUMN "qtyCoefficient" DECIMAL(12,4);
ALTER TABLE "BoqItem" ADD COLUMN "wasteFactorPct" DECIMAL(5,2);
