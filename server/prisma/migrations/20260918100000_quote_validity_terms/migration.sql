-- ยืนราคา + เงื่อนไขท้ายใบเสนอราคา — ตรึงลงใบตอนกดส่ง
-- ใบที่ส่งไปก่อนหน้านี้คงเป็น NULL (ไม่มีวันหมดอายุ) ไม่เติมย้อนหลัง เพราะลูกค้าไม่เคยได้รับเงื่อนไขนั้น
ALTER TABLE "Quote" ADD COLUMN "validUntil" DATE;
ALTER TABLE "Quote" ADD COLUMN "terms" TEXT;
