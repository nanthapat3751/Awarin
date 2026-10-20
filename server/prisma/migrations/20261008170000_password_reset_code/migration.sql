-- ลืมรหัสผ่านแบบ "เมลเดียวมีทั้งปุ่มและรหัส": รหัส 6 หลักอยู่แถวเดียวกับลิงก์ ใช้อันไหนก่อนอีกอันตายตาม
-- เก็บแค่แฮชของรหัส (ผูกกับแฮชของลิงก์ในแถวนั้น) + จำนวนครั้งที่กรอกผิด ครบเพดานแล้วแถวถูกลบทิ้ง
ALTER TABLE "PasswordResetToken" ADD COLUMN "codeHash" TEXT;
ALTER TABLE "PasswordResetToken" ADD COLUMN "codeAttempts" INTEGER NOT NULL DEFAULT 0;
