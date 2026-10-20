-- ถอด "ของชิ้นเดียว สั่งตาม BOQ" ออกพร้อมแท็บรายการซื้อของ (ผู้ใช้สั่ง 18 ต.ค. — งานจัดซื้ออยู่นอกขอบเขต)
-- AlterTable
ALTER TABLE "BoqItem" DROP COLUMN "purchaseAsIs";
