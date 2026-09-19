-- เตือนราคาในคลังเปลี่ยน + เทียบเวอร์ชัน BOQ
-- ไม่เติมค่าย้อนหลัง: null = ไม่รู้ (ดูคอมเมนต์ใน schema.prisma)
ALTER TABLE "BoqItem" ADD COLUMN "pricedAt" TIMESTAMP(3);
ALTER TABLE "BoqItem" ADD COLUMN "sourceItemId" TEXT;
