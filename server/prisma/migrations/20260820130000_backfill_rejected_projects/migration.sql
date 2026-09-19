-- เติมสถานะย้อนหลังให้โปรเจกต์ที่ลูกค้าปฏิเสธไปแล้วก่อนจะมีสถานะ REJECTED
--
-- แถวพวกนี้ค้างอยู่ที่ QUOTED เพราะตอนนั้นการปฏิเสธไม่ขยับสถานะโปรเจกต์เลย ถ้าไม่เติมย้อนหลัง
-- โปรเจกต์เก่าจะยังโชว์การ์ด "รอลูกค้าตอบกลับ" ต่อไป และมูลค่าของมันจะยังถูกนับเป็นไปป์ไลน์
--
-- เงื่อนไข: ใบเสนอราคาฉบับล่าสุดที่ส่งออกไปจริง (ไม่ใช่ร่าง) มีสถานะ REJECTED เท่านั้น —
-- ถ้ามีฉบับใหม่กว่าออกไปแล้วแปลว่าพนักงานตามงานต่อไปแล้ว ไม่ต้องดึงกลับมา
-- แยกเป็นคนละ migration กับตอน ADD VALUE เพราะ Postgres ใช้ค่า enum ที่เพิ่งเพิ่มภายใน
-- transaction เดียวกันไม่ได้
UPDATE "Project" p
SET "status" = 'REJECTED'
WHERE p."status" = 'QUOTED'
  AND p."deletedAt" IS NULL
  AND (
    SELECT q."status"
    FROM "Quote" q
    WHERE q."projectId" = p."id" AND q."status" <> 'DRAFT'
    ORDER BY q."revisionNo" DESC
    LIMIT 1
  ) = 'REJECTED';
