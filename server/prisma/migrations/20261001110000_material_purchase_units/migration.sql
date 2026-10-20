-- หน่วยซื้อของวัสดุ: ทุกช่องว่างได้ วัสดุเดิมทั้งหมด = ซื้อเป็นหน่วยเดียวกับที่ใช้ ทีละ 1
ALTER TABLE "Material" ADD COLUMN "purchaseUnit" TEXT;
ALTER TABLE "Material" ADD COLUMN "purchaseUnitSize" DECIMAL(14,4);
ALTER TABLE "Material" ADD COLUMN "purchaseMinQty" DECIMAL(14,3);
ALTER TABLE "Material" ADD COLUMN "purchaseStep" DECIMAL(14,3);
