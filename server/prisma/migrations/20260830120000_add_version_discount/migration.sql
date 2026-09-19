-- ส่วนลดท้ายใบเสนอราคา เก็บที่ระดับเวอร์ชัน (ไม่ใช่ที่โครงการ) เพราะราคาทุกตัวถูก freeze
-- ต่อเวอร์ชันตาม BR-07 — ใบที่ส่งลูกค้าไปแล้วต้องคงส่วนลดเดิมไว้ แม้จะต่อรองใหม่ในเวอร์ชันถัดไป
--
-- discountPct = NULL แปลว่า "ลดเป็นจำนวนเงินคงที่" (หรือไม่ลดเลย) ส่วน discountAmt คือยอดจริง
-- ที่ถูกหักเสมอ ปลายน้ำ (PDF/สัญญา/แดชบอร์ด) อ่านแค่ discountAmt ก็พอ
ALTER TABLE "ProjectVersion"
  ADD COLUMN "discountPct"  DECIMAL(5,2),
  ADD COLUMN "discountAmt"  DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discountNote" TEXT;
