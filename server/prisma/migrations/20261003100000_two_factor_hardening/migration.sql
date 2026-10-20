-- ปิดช่องโหว่ขั้นกรอกรหัส 2FA
--   twoFactorFailedCount / twoFactorLockedUntil  เพดานกรอกผิดต่อบัญชี (เดิมมีแค่ต่อไอพี สลับไอพีเดาได้ไม่จำกัด)
--   totpLastStep                                 ช่วงเวลา 30 วิของรหัสจากแอปที่ใช้ล่าสุด — รหัสเดิมใช้ซ้ำไม่ได้
--   Session.twoFactorAttempts                    กรอกผิดในเซสชันครึ่งทางนี้กี่ครั้ง ครบแล้วต้องกรอกรหัสผ่านใหม่
--
-- เพิ่มคอลัมน์อย่างเดียว ค่าตั้งต้นเท่ากับ "ยังไม่เคยผิด/ยังไม่เคยใช้" ไม่กระทบใครที่เปิด 2FA อยู่
ALTER TABLE "User" ADD COLUMN "twoFactorFailedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "twoFactorLockedUntil" TIMESTAMP(3),
ADD COLUMN "totpLastStep" INTEGER;

ALTER TABLE "Session" ADD COLUMN "twoFactorAttempts" INTEGER NOT NULL DEFAULT 0;
