-- แก้อีเมลจากหน้ายืนยัน (ลูกค้าที่สมัครเองแล้วพิมพ์อีเมลผิด)
-- ตั๋วผูกกับเบราว์เซอร์ที่เพิ่งสมัคร (เก็บแฮช) + นับจำนวนครั้งที่เปลี่ยน — ล้างทิ้งเมื่อยืนยันอีเมลสำเร็จ
ALTER TABLE "User" ADD COLUMN "signupTicketHash" TEXT;
ALTER TABLE "User" ADD COLUMN "signupEmailChanges" INTEGER NOT NULL DEFAULT 0;
