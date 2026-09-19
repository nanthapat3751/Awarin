-- ค่าวัดถอดปริมาณระดับแบบบ้าน (nullable) ใช้ prefill ลงโครงการตอนสร้างจากแบบ
ALTER TABLE "HouseDesign" ADD COLUMN "wallAreaSqm" DECIMAL(12,2);
ALTER TABLE "HouseDesign" ADD COLUMN "perimeterM" DECIMAL(10,2);
ALTER TABLE "HouseDesign" ADD COLUMN "concreteVolumeM3" DECIMAL(12,3);
