-- ติดตามการจ่ายเงินรายงวด
--
-- เดิม ContractInstallment เก็บแค่ "แผน" (งวดไหน ทำอะไรเสร็จ เท่าไร) ระบบจึงตอบได้แค่ว่า
-- แผนมีกี่งวด ไม่ใช่เก็บเงินไปแล้วกี่งวด -- ดูคอมเมนต์ installmentCount ใน customerFile.service.ts
--
-- สองสิ่งที่เพิ่มเข้ามาเป็นคนละเหตุการณ์กันในโลกจริง และต้องแยกกัน:
--   1) งานถึงงวดแล้ว วางบิลไปแล้ว  -> "dueOn"
--   2) เงินเข้าแล้ว                 -> แถวใน "InstallmentPayment"
-- ถ้าเก็บแค่ธง "จ่ายแล้วหรือยัง" จะแยกไม่ออกระหว่างงวดที่ยังไม่ถึงคิว กับงวดที่ทวงไปแล้วสามสัปดาห์
-- ซึ่งเป็นคนละสถานการณ์และต้องการการกระทำคนละอย่าง

-- ช่องทางที่ได้รับเงิน -- เก็บไว้เพื่อให้ตามหารายการในสมุดบัญชี/สเตทเมนต์ได้ตอนกระทบยอด
CREATE TYPE "PaymentMethod" AS ENUM ('TRANSFER', 'CASH', 'CHEQUE', 'OTHER');

-- วันที่ถึงกำหนดชำระของงวด -- พนักงานเป็นคนกำหนดเมื่องานถึงงวดแล้ว ระบบไม่เดาให้
--
-- ไม่เติมย้อนหลัง: ระบบไม่เคยเก็บว่างวดเก่าถึงกำหนดวันไหน การคำนวณจากวันเซ็นสัญญา + ระยะเวลา
-- ก่อสร้างคือการแต่งวันที่ขึ้นมาเอง แล้วหน้าจอจะประกาศว่า "เกินกำหนด 40 วัน" จากวันที่ที่ไม่เคยมีจริง
-- NULL = ยังไม่ถึงงวด (หรือยังไม่ได้ระบุ) ซึ่งเป็นความจริง
ALTER TABLE "ContractInstallment" ADD COLUMN "dueOn" DATE;

-- หนึ่งงวดมีได้หลายรายการรับเงิน (จ่ายมัดจำก่อน จ่ายไม่ครบ ทยอยโอน) จึงเป็นตารางแยก
-- ไม่ใช่คอลัมน์ paidAmount บนแถวงวด -- สถานะของงวดคำนวณจากผลรวมของตารางนี้เสมอ ไม่เก็บซ้ำ
-- เพราะการเก็บสถานะซ้ำคือการเปิดช่องให้มันขัดกับยอดจริงได้
CREATE TABLE "InstallmentPayment" (
  "id"            TEXT NOT NULL,
  "installmentId" TEXT NOT NULL,
  -- วันที่ได้รับเงินจริง ไม่ใช่วันที่มานั่งบันทึก (บันทึกย้อนหลังได้ ดู createdAt ประกอบ)
  "paidOn"        DATE NOT NULL,
  -- ยอดที่ถือว่าชำระหนี้งวดนี้แล้ว = ยอดก่อนหักภาษี ณ ที่จ่าย
  "amount"        DECIMAL(14,2) NOT NULL,
  -- ภาษีหัก ณ ที่จ่ายที่ผู้ว่าจ้างหักไว้จากยอดข้างบน (0 = ไม่ได้หัก เช่น ลูกค้าบุคคลธรรมดา)
  --
  -- นี่คือเหตุผลที่ต้องมีสองช่อง: ลูกค้านิติบุคคลหัก 3% ไว้ เงินเข้าบัญชีจริงจึงน้อยกว่ายอดงวด
  -- ถ้าเก็บแค่ยอดที่โอนเข้ามา ระบบจะขึ้นว่างวดนี้ยังค้างอีก 3% ไปตลอดกาล ทั้งที่ลูกค้าจ่ายครบแล้ว
  -- เงินเข้าบัญชีจริง = amount - withholdingAmount  (ดู splitWithholding ใน lib/billing-party.ts)
  "withholdingAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "method"        "PaymentMethod" NOT NULL DEFAULT 'TRANSFER',
  -- เลขที่เช็ค / เลขอ้างอิงการโอน -- ช่องทางเดียวที่จะกระทบยอดกับสเตทเมนต์ธนาคารได้
  "reference"     TEXT,
  "note"          TEXT,
  -- null = บัญชีพนักงานที่บันทึกถูกลบไปแล้ว รายการรับเงินยังอยู่ (ห้าม CASCADE เด็ดขาด
  -- ไม่งั้นลบพนักงานหนึ่งคนแล้วประวัติการรับเงินหายยกชุด) -- แพตเทิร์นเดียวกับ CustomerNote
  "recordedById"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstallmentPayment_pkey" PRIMARY KEY ("id")
);

-- อ่านเสมอเป็น "รายการรับเงินของงวดนี้ เรียงตามวันที่รับ"
CREATE INDEX "InstallmentPayment_installmentId_paidOn_idx"
  ON "InstallmentPayment"("installmentId", "paidOn");

-- หน้างานค้างถามว่า "งวดไหนถึงกำหนดแล้วแต่ยังไม่ครบ" -> กรองด้วย dueOn ก่อนเสมอ
CREATE INDEX "ContractInstallment_dueOn_idx" ON "ContractInstallment"("dueOn");

ALTER TABLE "InstallmentPayment"
  ADD CONSTRAINT "InstallmentPayment_installmentId_fkey" FOREIGN KEY ("installmentId")
  REFERENCES "ContractInstallment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InstallmentPayment"
  ADD CONSTRAINT "InstallmentPayment_recordedById_fkey" FOREIGN KEY ("recordedById")
  REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
