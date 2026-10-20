-- ลูกค้ายกเลิกการแจ้งโอนของตัวเองก่อนบริษัทตรวจ · ADD VALUE ต้องแยก migration (ใช้ค่าใหม่ใน migration เดียวกันไม่ได้)
ALTER TYPE "PaymentNoticeStatus" ADD VALUE 'CANCELLED';
