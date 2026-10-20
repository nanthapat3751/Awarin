-- วันที่ส่งมอบโครงการ (สถานะ COMPLETED) — บันทึกตอนกดส่งมอบ
-- โครงการที่ส่งมอบไปก่อนหน้านี้คงเป็น NULL (ไม่มีวันที่จริงให้ใส่ ห้ามเดา)
ALTER TABLE "Project" ADD COLUMN "completedAt" TIMESTAMP(3);
