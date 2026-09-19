-- วัสดุ: เพิ่มสเปก/รายละเอียด, ผู้จำหน่าย, ตัวคูณเผื่อเสีย (ทั้งหมด nullable — แถวเก่าไม่มีค่า)
ALTER TABLE "Material" ADD COLUMN "spec" TEXT;
ALTER TABLE "Material" ADD COLUMN "supplier" TEXT;
ALTER TABLE "Material" ADD COLUMN "wasteFactorPct" DECIMAL(5,2);
