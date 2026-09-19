-- ตัวขับพื้นที่ตั้งอาคาร (PER_FOOTPRINT) สำหรับงานหลังคา/ฐานราก — คอลัมน์ nullable ทั้งคู่
-- (แบบ/โครงการเก่าไม่มีค่า → บรรทัดที่อ้างค่าที่ยังว่างจะยังไม่คิดปริมาณจนกว่าจะกรอก)
-- เป็นการเพิ่มคอลัมน์ NULLABLE ล้วน จึงไม่ต้อง re-grant สิทธิ์ให้ boq_app
ALTER TABLE "HouseDesign" ADD COLUMN "footprintSqm" DECIMAL(12,2);
ALTER TABLE "Project" ADD COLUMN "footprintSqm" DECIMAL(12,2);
