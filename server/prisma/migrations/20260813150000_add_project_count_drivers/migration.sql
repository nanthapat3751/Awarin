-- ตัวขับแบบนับของ take-off ระดับโครงการ (nullable) — สุขภัณฑ์ตาม #ห้องน้ำ, บันไดตาม #ชั้น
ALTER TABLE "Project" ADD COLUMN "bathrooms" INTEGER;
ALTER TABLE "Project" ADD COLUMN "floors" INTEGER;
