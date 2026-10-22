#!/bin/sh
# สร้าง .env (ค่าของ docker compose + รหัสผ่านฐานข้อมูลสุ่ม) และ app.env (ค่าตั้งของแอป) บน VPS
#   sh make-env.sh <ghcr image prefix> <โดเมนหลัก>
#   เช่น sh make-env.sh ghcr.io/nanthapat3751/awarin awarin.tech
# ไม่เขียนทับไฟล์ที่มีอยู่แล้ว — รหัสผ่านฐานข้อมูลต้องคงเดิมตลอดอายุ volume
# ค่า SMTP ใน app.env ว่างไว้ ต้องเติมเองทีหลัง (ห้าม cat ไฟล์นี้ขึ้นจอ)
set -eu

PREFIX="${1:?ใส่ image prefix เช่น ghcr.io/nanthapat3751/awarin}"
DOMAIN="${2:?ใส่โดเมนหลัก เช่น awarin.tech}"
cd "$(dirname "$0")"
umask 077

rand() { openssl rand -hex 24; }

if [ -e .env ]; then
  echo ".env มีอยู่แล้ว — ข้าม (รหัสผ่านฐานข้อมูลเดิมต้องคงไว้)"
else
  cat > .env <<EOF
API_IMAGE=${PREFIX}-api
WEB_IMAGE=${PREFIX}-web
TAG=latest
DB_OWNER_PASSWORD=$(rand)
APP_DB_PASSWORD=$(rand)
BACKUP_DB_PASSWORD=$(rand)
EOF
  echo "สร้าง .env แล้ว (image: ${PREFIX}-api / ${PREFIX}-web)"
fi

if [ -e app.env ]; then
  echo "app.env มีอยู่แล้ว — ข้าม"
else
  cat > app.env <<EOF
NODE_ENV=production
PORT=4000
CLIENT_BASE_URL=https://${DOMAIN}
STAFF_BASE_URL=https://staff.${DOMAIN}
CORS_ORIGIN_CLIENT=https://${DOMAIN}
CORS_ORIGIN_STAFF=https://staff.${DOMAIN}
COOKIE_SECURE=true
SESSION_COOKIE_NAME_STAFF=systemboq_staff_session
SESSION_COOKIE_NAME_CUSTOMER=systemboq_customer_session
SESSION_TTL_HOURS=12
# nginx บนเครื่อง = proxy ชั้นเดียว · ยืนยันผลในหน้าตั้งค่า → การรับ IP (ห้ามตั้ง true)
TRUST_PROXY=1

MAIL_TRANSPORT=smtp
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
EMAIL_MX_CHECK=on

BACKUP_DIR=backups
BACKUP_KEEP_DAYS=14
BACKUP_HOUR=2

GEOIP_AUTO_UPDATE=true
GEOIP_HOME_COUNTRY=TH

# ตรวจสลิปอัตโนมัติ — ว่าง = ปิด (พนักงานตรวจกับบัญชีเอง) · เปิดเมื่อได้ key บัญชีบริษัท
SLIP_PROVIDER=
SLIPOK_API_KEY=
SLIPOK_BRANCH_ID=
EOF
  echo "สร้าง app.env แล้ว (โดเมน ${DOMAIN}) — ยังต้องเติมค่า SMTP"
fi
