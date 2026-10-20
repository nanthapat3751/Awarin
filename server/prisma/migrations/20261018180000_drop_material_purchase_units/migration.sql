-- ถอดหน่วยซื้อ/ขั้นต่ำ/ขั้นการสั่งของวัสดุ พร้อมชีตรายการสั่งซื้อใน Excel ภายใน (ผู้ใช้สั่ง 18 ต.ค. — งานจัดซื้ออยู่นอกขอบเขต)
-- AlterTable
ALTER TABLE "Material" DROP COLUMN "purchaseMinQty",
DROP COLUMN "purchaseStep",
DROP COLUMN "purchaseUnit",
DROP COLUMN "purchaseUnitSize";
