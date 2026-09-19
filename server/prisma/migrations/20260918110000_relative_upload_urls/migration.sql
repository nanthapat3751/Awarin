-- รูปที่อัปโหลด: เปลี่ยนจาก URL เต็มของเครื่อง dev (http://localhost:4000/uploads/...) เป็น path สัมพัทธ์ /uploads/...
-- โดเมนถูกต่อให้ตอนส่งออกจาก PUBLIC_UPLOAD_BASE_URL (server/src/lib/upload-urls.ts) — ย้ายโดเมนแล้วรูปไม่พัง
--
-- แปลงเฉพาะ URL ที่ชี้ localhost:4000 / 127.0.0.1:4000 เท่านั้น ลิงก์รูปจากเว็บอื่นไม่ถูกแตะ
-- ไม่แตะ "AuditLog" (เป็นประวัติ แก้ไม่ได้โดยตั้งใจ — ค่าเก่าในนั้นคือสิ่งที่เกิดขึ้นจริง ณ ตอนนั้น)

UPDATE "Setting"
   SET "value" = regexp_replace("value", '^https?://(localhost|127\.0\.0\.1):4000(/uploads/[A-Za-z0-9._-]+)$', '\2')
 WHERE "value" ~ '^https?://(localhost|127\.0\.0\.1):4000/uploads/[A-Za-z0-9._-]+$';

UPDATE "Portfolio"
   SET "images" = regexp_replace("images"::text, 'https?://(localhost|127\.0\.0\.1):4000/uploads/', '/uploads/', 'g')::jsonb
 WHERE "images"::text ~ 'https?://(localhost|127\.0\.0\.1):4000/uploads/';

UPDATE "HouseDesign"
   SET "exteriorImages" = regexp_replace("exteriorImages"::text, 'https?://(localhost|127\.0\.0\.1):4000/uploads/', '/uploads/', 'g')::jsonb
 WHERE "exteriorImages"::text ~ 'https?://(localhost|127\.0\.0\.1):4000/uploads/';

UPDATE "HouseDesign"
   SET "interiorImages" = regexp_replace("interiorImages"::text, 'https?://(localhost|127\.0\.0\.1):4000/uploads/', '/uploads/', 'g')::jsonb
 WHERE "interiorImages"::text ~ 'https?://(localhost|127\.0\.0\.1):4000/uploads/';

UPDATE "HouseDesign"
   SET "plans" = regexp_replace("plans"::text, 'https?://(localhost|127\.0\.0\.1):4000/uploads/', '/uploads/', 'g')::jsonb
 WHERE "plans"::text ~ 'https?://(localhost|127\.0\.0\.1):4000/uploads/';
