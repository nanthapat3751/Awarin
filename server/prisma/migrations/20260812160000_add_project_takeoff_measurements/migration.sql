-- ค่าวัดโครงการสำหรับถอดปริมาณ (Phase 2): พื้นที่ผนัง / ความยาวรอบรูป / ปริมาตรคอนกรีต
-- nullable ทั้งหมด บนตารางเดิม จึงไม่ต้อง re-grant ให้ boq_app
ALTER TABLE "Project" ADD COLUMN "wallAreaSqm" DECIMAL(12,2);
ALTER TABLE "Project" ADD COLUMN "perimeterM" DECIMAL(10,2);
ALTER TABLE "Project" ADD COLUMN "concreteVolumeM3" DECIMAL(12,3);
