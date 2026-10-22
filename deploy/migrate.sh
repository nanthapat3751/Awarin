#!/bin/sh
# รันครั้งเดียวก่อน API เปิด (service "migrate" ใน deploy/docker-compose.yml) — รันซ้ำได้ทุก deploy
#   1) สร้าง/อัปเดตตารางตาม migration
#   2) seed: ให้สิทธิ์ boq_app (AuditLog append-only) + สร้าง OWNER คนแรกถ้ายังไม่มี + ค่าตั้งเริ่มต้น
#   3) ให้สิทธิ์อ่านอย่างเดียวกับ boq_backup (ใช้สำรองข้อมูล)
# ต้องใช้ DATABASE_URL ของเจ้าของฐานข้อมูล (boq) — API ไม่ได้รับค่านี้
set -eu
cd /app/server

npx prisma migrate deploy

# seed พิมพ์รหัสผ่านสุ่มของ OWNER คนแรก — ตัดทิ้งไม่ให้ค้างใน docker logs
# ผู้ใช้ตั้งรหัสเองผ่านลิงก์ครั้งเดียว:  docker compose exec api npm run staff:recover -- owner
npx tsx prisma/seed.ts | sed '/password:/d'

npx tsx prisma/grant-backup-role.ts
echo "migrate เสร็จ"
