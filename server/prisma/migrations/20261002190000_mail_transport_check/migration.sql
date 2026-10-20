-- ผลตรวจ SMTP ล่าสุดใช้ร่วมกันทุก API (เดิมอยู่ในหน่วยความจำของแต่ละตัว)
--
-- ตารางใหม่ ไม่แตะข้อมูลเดิม · ได้สิทธิ์ boq_app อัตโนมัติจาก ALTER DEFAULT PRIVILEGES
-- CreateTable
CREATE TABLE "MailTransportCheck" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "ok" BOOLEAN NOT NULL,
    "problem" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailTransportCheck_pkey" PRIMARY KEY ("id")
);
