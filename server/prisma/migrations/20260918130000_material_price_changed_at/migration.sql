-- เวลาที่ราคาในคลังเปลี่ยนจริง (แยกจาก updatedAt ที่ขยับตอนแก้ชื่อด้วย)
ALTER TABLE "Material" ADD COLUMN "priceChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- แถวเดิม: ไม่รู้ว่าราคาเปลี่ยนครั้งล่าสุดเมื่อไร — ใช้ updatedAt (ไม่เก่ากว่าเวลาเปลี่ยนราคาจริงแน่นอน
-- จึงเอียงไปทาง "เตือน" มากกว่า "เงียบ")
UPDATE "Material" SET "priceChangedAt" = "updatedAt";
