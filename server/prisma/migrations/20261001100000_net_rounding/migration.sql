-- ปัดยอดสุทธิ: ทุกเวอร์ชันเดิมเริ่มที่ "ไม่ปัด" (roundingUnit = NULL, roundingAmt = 0)
-- ยอดเงินของเวอร์ชันเก่าและสัญญาที่ลงนามแล้วจึงไม่ขยับ
ALTER TABLE "ProjectVersion" ADD COLUMN "roundingUnit" INTEGER;
ALTER TABLE "ProjectVersion" ADD COLUMN "roundingAmt" DECIMAL(14,2) NOT NULL DEFAULT 0;
