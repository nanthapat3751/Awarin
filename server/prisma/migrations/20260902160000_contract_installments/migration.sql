-- งวดการชำระเงิน (ข้อ 7 ของสัญญา) เก็บเป็นข้อมูลจริง ไม่ใช่ข้อความ
--
-- เดิมพนักงานพิมพ์ยอดแต่ละงวดลงในเนื้อสัญญาเอง ระบบไม่มีทางรู้ว่ารวมแล้วเท่ามูลค่าสัญญาหรือเปล่า
-- (ไฟล์ Word เดิมก็ไม่รู้เหมือนกัน) พอเป็นตารางจริงจึงตรวจยอดรวมให้ได้ และต่อยอดไปติดตาม
-- การชำระเงิน/หัก ณ ที่จ่ายรายงวดได้ในอนาคต
CREATE TABLE "ContractInstallment" (
  "id"         TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  -- ลำดับงวด 1..n ใช้เรียงและเป็นเลขที่พิมพ์บนเอกสาร
  "seq"        INTEGER NOT NULL,
  -- เงื่อนไขที่ต้องทำเสร็จก่อนเบิกงวดนี้ เช่น "ตอกเข็ม ทำฐานราก ทำคานชั้น 1 แล้วเสร็จ"
  "milestone"  TEXT NOT NULL,
  "amount"     DECIMAL(14,2) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractInstallment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContractInstallment_contractId_seq_key"
  ON "ContractInstallment"("contractId", "seq");
CREATE INDEX "ContractInstallment_contractId_idx" ON "ContractInstallment"("contractId");

ALTER TABLE "ContractInstallment"
  ADD CONSTRAINT "ContractInstallment_contractId_fkey" FOREIGN KEY ("contractId")
  REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- มูลค่าสัญญาถูกตรึงไว้กับฉบับนี้ตอนออกสัญญา
-- เดิมอ่านจาก "เวอร์ชันล่าสุดของโครงการ" ตอนพิมพ์ PDF ซึ่งขยับได้ถ้ามีการสร้างเวอร์ชันใหม่ทีหลัง
-- ยอดที่งวดเงินต้องรวมให้ได้จึงต้องเป็นค่าที่ตรึงแล้ว ไม่ใช่ค่าที่วิ่งตามโครงการ
ALTER TABLE "Contract" ADD COLUMN "amount" DECIMAL(14,2);
