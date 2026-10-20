-- ชื่อผู้ใช้ของพนักงาน: ฝั่งบริษัทเลิกล็อกอินด้วยอีเมล
--
-- ระบบไม่เคยส่งอีเมลถึงพนักงาน (ไม่มีไลบรารีส่งเมลในโปรเจกต์เลย) อีเมลจึงทำหน้าที่แค่กุญแจ
-- เข้าระบบ ซึ่งยาวและจำยากโดยไม่จำเป็น ย้ายมาใช้ username แทน
--
-- ลูกค้าไม่แตะ: ยังล็อกอินด้วยอีเมลที่ใช้สมัครเหมือนเดิม (username เป็น NULL)

ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- เติมค่าให้บัญชีพนักงานที่มีอยู่ จากส่วนหน้า @ ของอีเมลเดิม
--   owner@awarin.co.th        -> owner
--   admin@awarin.co.th        -> admin
--   demo-owner@systemboq.local -> demo-owner
-- ถ้าในอนาคตมีพนักงานสองคนที่ส่วนหน้า @ ซ้ำกัน บรรทัดนี้จะล้มที่ UNIQUE ด้านล่าง
-- ซึ่งถูกต้องแล้ว — ต้องไปตั้งชื่อให้ต่างกันก่อน ไม่ใช่ปล่อยให้ชนกันเงียบ ๆ
UPDATE "User"
SET "username" = split_part("email", '@', 1)
WHERE "role" IN ('OWNER', 'ADMIN') AND "username" IS NULL AND "email" IS NOT NULL;

-- NULL ซ้ำกันได้ใน Postgres ลูกค้าทุกคนจึงเป็น NULL อยู่ร่วมกันได้
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- อีเมลไม่บังคับอีกต่อไป — พนักงานที่สร้างใหม่ไม่ต้องมีอีเมลก็ได้
-- (ลูกค้ายังบังคับที่ชั้นแอป: สมัครเอง/ทีมงานสร้างบัญชีให้ ต้องกรอกอีเมลเสมอ)
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
