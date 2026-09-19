-- บันทึกการติดต่อลูกค้า
--
-- แฟ้มลูกค้าประกอบขึ้นจากสิ่งที่ระบบบันทึกไว้เองทั้งหมด (โครงการ ใบเสนอราคา สัญญา คำขอ บันทึกกิจกรรม)
-- สิ่งที่หายไปคือ "คุยอะไรกันไปบ้าง" ซึ่งไม่มีทางเดาจากข้อมูลในระบบ พนักงานจึงต้องจดใส่กระดาษหรือแชต
--
-- ไม่ยัดลง AuditLog เพราะตารางนั้นเป็น append-only (แก้/ลบไม่ได้เลย) และถูกไล่ลบทุก 1 ปี
-- บันทึกการคุยกับลูกค้าต้องแก้คำผิดได้ ลบของที่จดผิดคนได้ และอยู่ได้นานกว่าหนึ่งปี
CREATE TABLE "CustomerNote" (
  "id"          TEXT NOT NULL,
  "customerId"  TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  -- null = บัญชีพนักงานที่เขียนถูกลบไปแล้ว บันทึกยังอยู่แต่ไม่รู้ว่าใครเขียน
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- อ่านเสมอเป็น "บันทึกของลูกค้าคนนี้ เรียงใหม่สุดก่อน"
CREATE INDEX "CustomerNote_customerId_createdAt_idx" ON "CustomerNote"("customerId", "createdAt");

-- ลบบัญชีลูกค้า = บันทึกเกี่ยวกับเขาหายไปด้วย (เป็นข้อมูลส่วนบุคคลของคนคนนั้น)
ALTER TABLE "CustomerNote"
  ADD CONSTRAINT "CustomerNote_customerId_fkey" FOREIGN KEY ("customerId")
  REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ลบบัญชีพนักงาน = บันทึกยังอยู่ แค่ไม่รู้ว่าใครเขียน (ห้าม CASCADE ไม่งั้นประวัติการคุยหายยกชุด)
ALTER TABLE "CustomerNote"
  ADD CONSTRAINT "CustomerNote_createdById_fkey" FOREIGN KEY ("createdById")
  REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
