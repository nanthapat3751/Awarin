#!/bin/sh
# รันครั้งเดียวตอนสร้างฐานข้อมูลใหม่ (docker-entrypoint-initdb.d — volume เดิมจะไม่รันซ้ำ)
# สร้าง role จำกัดสิทธิ์ 2 ตัวด้วยรหัสผ่านจาก .env บนเซิร์ฟเวอร์ (ไม่ใช่รหัส dev ที่อยู่ใน git)
#   boq_app    = แอปที่รันจริงต่อผ่าน role นี้ (สิทธิ์ตารางให้ตอน seed — ดู prisma/grant-runtime-privileges.ts)
#   boq_backup = อ่านอย่างเดียว ใช้ pg_dump สำรองข้อมูล
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_pw="$APP_DB_PASSWORD" -v backup_pw="$BACKUP_DB_PASSWORD" <<'EOSQL'
CREATE ROLE boq_app WITH LOGIN PASSWORD :'app_pw';
CREATE ROLE boq_backup WITH LOGIN PASSWORD :'backup_pw';
GRANT CONNECT ON DATABASE systemboq TO boq_app, boq_backup;
GRANT USAGE ON SCHEMA public TO boq_app, boq_backup;
EOSQL
