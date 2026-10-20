-- ตัวคิดกระเบื้อง: ขนาดแผ่นในคลังวัสดุ + ค่าที่กรอกในตัวคิดติดบรรทัด BOQ (คอลัมน์ว่างได้ทั้งหมด ไม่กระทบแถวเดิม)
ALTER TABLE "Material" ADD COLUMN "tileWidthMm" INTEGER,
ADD COLUMN "tileLengthMm" INTEGER,
ADD COLUMN "tileThicknessMm" DECIMAL(4,1),
ADD COLUMN "tilePiecesPerBox" INTEGER;

ALTER TABLE "BoqItem" ADD COLUMN "tileCalc" JSONB;
