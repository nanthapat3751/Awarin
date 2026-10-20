-- ผู้ติดต่อ + เบอร์โทรของผู้ว่าจ้างบนใบแจ้งหนี้/ใบเสร็จ (ตามแบบฟอร์มของบริษัท) ใบเก่าเป็นค่าว่าง ไม่เติมย้อนหลัง
-- AlterTable
ALTER TABLE "BillingDocument" ADD COLUMN     "customerContactPerson" TEXT,
ADD COLUMN     "customerPhone" TEXT;
