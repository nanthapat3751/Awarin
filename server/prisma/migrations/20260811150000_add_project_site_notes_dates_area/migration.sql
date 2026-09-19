-- โครงการ: เพิ่มรายละเอียด, สถานที่ก่อสร้าง, พื้นที่, ช่วงเวลาก่อสร้าง (ทั้งหมด nullable)
ALTER TABLE "Project" ADD COLUMN "description" TEXT;
ALTER TABLE "Project" ADD COLUMN "siteAddress" TEXT;
ALTER TABLE "Project" ADD COLUMN "areaSqm" DECIMAL(10,2);
ALTER TABLE "Project" ADD COLUMN "startDate" DATE;
ALTER TABLE "Project" ADD COLUMN "targetEndDate" DATE;
