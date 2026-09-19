-- หมวดงาน: เพิ่มธงเปิด/ปิดใช้งาน (เก็บเข้ากรุแทนการลบ) + คำอธิบาย
ALTER TABLE "WorkCategory" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WorkCategory" ADD COLUMN "description" TEXT;
