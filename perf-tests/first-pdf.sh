#!/bin/sh
# วัดเวลา PDF ใบแรกหลังเปิด API ใหม่ — ใช้เทียบ "อุ่น Chromium ตอนเปิด" (PDF_WARMUP) เปิด/ปิด
#   sh perf-tests/first-pdf.sh <state.json> <off|on> <ไฟล์ผล.csv>
# ต้องมี API ที่เพิ่งเปิดใหม่ฟังพอร์ต 4000 อยู่แล้ว (สคริปต์นี้ไม่เปิด/ปิด API เอง)
# PROJECT_ID / QUOTE_ID = ใบเสนอราคาที่ใช้สร้าง PDF
set -eu
STATE="${1:?state.json}"
MODE="${2:?off|on}"
OUT="${3:?ไฟล์ผล.csv}"
API="${API:-http://localhost:4000}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

for i in $(seq 1 60); do curl -fs -m 2 "$API/api/health" >/dev/null && break; sleep 1; done
# อุ่นเปิดอยู่ = รอให้อุ่นเสร็จก่อน (เหมือนผู้ใช้คนแรกที่มาหลังเซิร์ฟเวอร์เปิดไปแล้วสักพัก)
[ "$MODE" = "on" ] && sleep 5

python -X utf8 -I -c "import json,sys;d=json.load(open(sys.argv[1],encoding='utf-8'));print(json.dumps({'username':d['username'],'password':d['password']}))" "$STATE" |
  curl -s -c "$JAR" -o /dev/null -H "Content-Type: application/json" --data @- "$API/api/auth/staff/login"
[ -f "$OUT" ] || echo "warmup,attempt,pdf_no,status,seconds,bytes" > "$OUT"
for n in 1 2 3; do
  curl -s -b "$JAR" -o /dev/null -w "$MODE,${ATTEMPT:-1},$n,%{http_code},%{time_total},%{size_download}\n" \
    "$API/api/projects/$PROJECT_ID/quotes/$QUOTE_ID/pdf" >> "$OUT"
done
tail -3 "$OUT"
