-- ข้อมูลโครงการเบื้องต้นจากคำขอลูกค้า (nullable ทั้งหมด) — ใช้เติม Project อัตโนมัติเมื่อ
-- พนักงานกด"สร้างโครงการจากคำขอ" ทุกคอลัมน์เพิ่มบนตารางเดิม จึงไม่ต้อง re-grant ให้ boq_app
ALTER TABLE "Lead" ADD COLUMN "siteAddress" TEXT;
ALTER TABLE "Lead" ADD COLUMN "areaSqm" DECIMAL(10,2);
ALTER TABLE "Lead" ADD COLUMN "desiredStartDate" DATE;
