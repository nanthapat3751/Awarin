-- ฐานคำนวณภาษีหัก ณ ที่จ่ายของสัญญาแต่ละฉบับ
--
-- ภาษีหัก ณ ที่จ่าย 3% คิดจาก "มูลค่างานก่อนภาษีมูลค่าเพิ่ม" ไม่ใช่ยอดรวมทั้งสิ้น แต่ Contract
-- เก็บไว้แค่ยอดรวม (amount) จึงแยกส่วนที่เป็น VAT ออกไม่ได้
--
-- ไปอ่าน vatAmt จาก "เวอร์ชันล่าสุดของโครงการ" ตอนพิมพ์ไม่ได้ ด้วยเหตุผลเดียวกับที่ amount ถูกตรึง
-- ไว้ตั้งแต่แรก: เวอร์ชันใหม่ที่สร้างหลังเซ็นสัญญาจะทำให้ตัวเลขบนสัญญาที่เซ็นไปแล้วเปลี่ยนตาม
ALTER TABLE "Contract" ADD COLUMN "vatAmount" DECIMAL(14,2);

-- เติมย้อนหลังเฉพาะกรณีที่ "ไม่ต้องเดา" เท่านั้น — มีเวอร์ชันของโครงการนั้นที่ยอดสุทธิตรงกับ
-- มูลค่าสัญญาพอดี และทุกเวอร์ชันที่ตรงกันให้ค่า VAT เท่ากันหมด
-- สัญญาเก่าที่หาไม่เจอจะเป็น null และเอกสารจะไม่พิมพ์ตัวเลขหัก ณ ที่จ่าย (ดีกว่าพิมพ์ตัวเลขที่เดาเอา)
UPDATE "Contract" c
SET "vatAmount" = v."vatAmt"
FROM "ProjectVersion" v
WHERE v."projectId" = c."projectId"
  AND c."amount" IS NOT NULL
  AND v."netPrice" = c."amount"
  AND (
    SELECT COUNT(DISTINCT v2."vatAmt")
    FROM "ProjectVersion" v2
    WHERE v2."projectId" = c."projectId" AND v2."netPrice" = c."amount"
  ) = 1;
