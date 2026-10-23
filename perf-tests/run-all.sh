#!/bin/sh
# รัน performance test ทุกรูปแบบต่อกันกับระบบในเครื่อง (API :4000) — k6 รันใน Docker ไม่ต้องติดตั้ง
#   sh perf-tests/run-all.sh <state.json ของบัญชีทดสอบ> <โฟลเดอร์ผล> [รูปแบบ...]
#   เช่น sh perf-tests/run-all.sh perf-user.json perf-results smoke load stress spike pdf
# state.json = {"username","password"} ของบัญชีพนักงานทดสอบ (ไม่พิมพ์รหัสขึ้นจอ)
# PROJECT_ID / QUOTE_ID = โครงการที่ใช้อ่าน BOQ และสร้าง PDF (ตั้งเป็น env ก่อนรัน)
set -eu

STATE="${1:?ใส่ state.json ของบัญชีทดสอบ}"
OUT="${2:?ใส่โฟลเดอร์เก็บผล}"
shift 2
TYPES="${*:-smoke load stress spike pdf}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"
OUT_ABS="$(cd "$OUT" && pwd -W 2>/dev/null || pwd)"

field() { python -X utf8 -I -c "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8'))[sys.argv[2]])" "$STATE" "$1"; }
STAFF_USER="$(field username)"
STAFF_PASS="$(field password)"

for TYPE in $TYPES; do
  echo "=== $TYPE เริ่ม $(date +%H:%M:%S)"
  rm -f "$OUT/.stop"
  powershell -NoProfile -ExecutionPolicy Bypass -File "$HERE/sample-resources.ps1" \
    -Out "$OUT_ABS\\$TYPE-resources.csv" -StopFile "$OUT_ABS\\.stop" &
  SAMPLER=$!
  # MSYS_NO_PATHCONV: กัน Git Bash แปลง /results เป็น path ของ Windows
  MSYS_NO_PATHCONV=1 docker run --rm -i \
    -v "$OUT_ABS:/results" \
    -e TEST_TYPE="$TYPE" -e PROJECT_ID="$PROJECT_ID" -e QUOTE_ID="$QUOTE_ID" \
    -e STAFF_USER="$STAFF_USER" -e STAFF_PASS="$STAFF_PASS" \
    grafana/k6:latest run --quiet --out "csv=/results/$TYPE-requests.csv" - < "$HERE/systemboq.k6.js" \
    > "$OUT/$TYPE-k6.log" 2>&1 || echo "  (k6 จบด้วยเกณฑ์ไม่ผ่านบางข้อ — ดูในรายงาน)"
  touch "$OUT/.stop"
  wait "$SAMPLER" 2>/dev/null || true
  echo "=== $TYPE จบ $(date +%H:%M:%S)"
  # พักให้ระบบกลับสู่สภาพปกติก่อนรูปแบบถัดไป
  sleep 20
done
rm -f "$OUT/.stop"
