/**
 * ดาวน์โหลด/อัปเดตฐานข้อมูลประเทศ + ผู้ให้บริการของไอพี (DB-IP Lite, CC BY 4.0) ลง server/data/geoip/
 *
 *   npm run geoip:update -w server            # มีของเดือนนี้แล้วไม่โหลดซ้ำ
 *   npm run geoip:update -w server -- --force # โหลดใหม่ทับ
 *
 * เซิร์ฟเวอร์อัปเดตเองทุกเดือนอยู่แล้ว (GEOIP_AUTO_UPDATE) — คำสั่งนี้ไว้ใช้ตอนติดตั้งครั้งแรก
 * หรือบนเครื่องที่ปิดการอัปเดตอัตโนมัติ (ออกเน็ตไม่ได้)
 */
import { GEOIP_DIR, updateGeoipDatabase } from "../src/lib/geoip";

updateGeoipDatabase({ force: process.argv.includes("--force") })
  .then((r) => {
    console.log(r.downloaded ? `ดาวน์โหลดข้อมูลเดือน ${r.month} ลง ${GEOIP_DIR} แล้ว` : `มีข้อมูลเดือน ${r.month} อยู่แล้ว (${GEOIP_DIR})`);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
