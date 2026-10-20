-- ลิงก์ตั้งรหัสผ่านใหม่ที่ลูกค้าขอเอง (หน้า "ลืมรหัสผ่าน")
--
-- ไม่มี usedAt โดยตั้งใจ: ใช้แล้วลบแถวทิ้งทันที แถวที่ยังอยู่จึงแปลว่า "ยังใช้ได้" เสมอ
-- เก็บเฉพาะแฮชของ token — ตัวจริงอยู่ในลิงก์ในอีเมลเท่านั้น

CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

ALTER TABLE "PasswordResetToken"
    ADD CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
