"""
รายงานผลทดสอบ API (Excel แยกไฟล์จากรายงานหน้าจอ)

    python -X utf8 robot-tests/build_api_report.py --out "D:/ปี4_1/ปัญหาพิเศษ/SystemBOQ-API-Test-Report.xlsx"

อ่านชุด "api" จาก robot-tests/results/output.xml + api/coverage.json (บัญชีรายชื่อ API ทุกเส้นและนโยบายสิทธิ์)
ใช้ฟังก์ชันวาดชีตชุดเดียวกับ build_report.py (Test Cases 16 คอลัมน์ 3 กลุ่ม · Defects · สรุปผล)
ชีตเพิ่ม: Endpoint Coverage · Risk Analysis · ช่องว่าง UI (สิ่งที่ควรเพิ่มในชุดหน้าจอ — ยังไม่ได้เขียนสคริปต์)
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

import build_report as br

HERE = Path(__file__).resolve().parent
API_DIR = HERE / "api"

API_DEFECTS_BASE = {
    "TC_API_ACC_001": {
        "id": "BUG-API-001",
        "severity": "Medium",
        "priority": "P2",
        "title": "บัญชีลูกค้าเรียก API ตั้งค่า 2FA ได้ (2FA เป็นของพนักงาน) — เปิดแล้วลูกค้าเข้าพอร์ทัลไม่ได้อีก",
        "impact": "ลูกค้า (หรือคนที่ได้เซสชันลูกค้าไป) เรียก /api/auth/2fa/setup + activate ได้สำเร็จ หลังจากนั้นการเข้าสู่ระบบลูกค้าตอบ "
        "twoFactorRequired แต่พอร์ทัลลูกค้าไม่มีขั้นกรอกรหัส 2FA → เจ้าของบัญชีถูกล็อกออกถาวรจนพนักงานช่วย",
        "fix": "ใส่ requireRole(\"OWNER\", \"ADMIN\") ที่ twoFactorRouter (ยกเว้น /verify ที่เป็นขั้นตอนเข้าสู่ระบบ) "
        "หรือให้การเข้าสู่ระบบลูกค้าไม่สนใจ totpEnabled",
        "where": "server/src/modules/auth/twofactor.routes.ts · server/src/app.ts (app.use(\"/api/auth/2fa\", twoFactorRouter))",
        "change": "twofactor.routes.ts: เพิ่ม staffOnly = [requireAuth, requireRole(\"OWNER\", \"ADMIN\")] ให้ /status /setup /activate "
        "/disable /add-device /backup-codes (/verify คงเดิมเพราะเป็นขั้นเข้าสู่ระบบ) → ลูกค้าได้ 403 · "
        "สคริปต์เคส: เปลี่ยน RETURN เป็น IF/ELSE (Robot ไม่ให้ใช้ RETURN ในเคส) และเช็คเพิ่มว่าเซสชันลูกค้ายังเปิดพอร์ทัลได้",
    },
    "TC_API_LOGIN_S_011": {
        "id": "BUG-API-002",
        "severity": "Low",
        "priority": "P3",
        "title": "ส่ง body ใหญ่เกินเพดาน (100 KB) ได้ 500 \"เกิดข้อผิดพลาดในระบบ\" แทน 413",
        "impact": "ทุกปลายทางที่รับ JSON: ผู้ใช้ได้ข้อความว่าระบบล่ม · log ฝั่งเซิร์ฟเวอร์เต็มไปด้วย error ปลอม (ใครก็ยิงเพิ่มได้) ทำให้มองไม่เห็น error จริง",
        "fix": "ตัวจัดการ error กลางใน app.ts ให้ใช้ err.status / err.statusCode ถ้ามี (body-parser ตั้ง 413 มาให้แล้ว) และไม่ console.error เป็น 500",
        "where": "server/src/app.ts (error handler ท้ายไฟล์)",
        "change": "app.ts: เพิ่ม clientErrorOf() — error ที่มี status 4xx และ expose=true (จาก body-parser) ตอบตาม status เดิม "
        "พร้อมข้อความไทย + requestId และบันทึกเป็น console.warn · error อื่นยังเป็น 500 เหมือนเดิม · เพิ่มเทสต์ jest ใน multi-instance.test.ts",
    },
    "TC_API_LOGIN_S_012": {
        "id": "BUG-API-003",
        "severity": "Low",
        "priority": "P3",
        "title": "ส่ง JSON ผิดรูปแบบได้ 500 แทน 400",
        "impact": "ต้นเหตุเดียวกับ BUG-API-002 (body-parser ตั้ง status 400 type entity.parse.failed แต่ตัวจัดการ error กลางตอบ 500) — ทุกปลายทางที่รับ JSON",
        "fix": "แก้ที่ตัวจัดการ error กลางจุดเดียวกับ BUG-API-002",
        "where": "server/src/app.ts (error handler ท้ายไฟล์)",
        "change": "แก้พร้อม BUG-API-002 (clientErrorOf) → JSON พังได้ 400 \"รูปแบบข้อมูลไม่ถูกต้อง\"",
    },
    "TC_API_CUST_004": {
        "id": "BUG-API-004",
        "severity": "Low",
        "priority": "P3",
        "title": "ค้นหาแฟ้มลูกค้าด้วยข้อความยาวเกิน 200 ตัวได้ 500 แทน 400",
        "impact": "GET /api/customers/directory?q=<ยาว> ใช้ schema.parse() ที่โยน ZodError ออกไปเป็น 500 · พนักงานที่วางข้อความยาว ๆ ลงช่องค้นหาเห็นว่าระบบล่ม",
        "fix": "ใช้ safeParse แล้วตอบ 400 (หรือ .catch ตัดเหลือ 200 ตัว) และไล่หาจุดอื่นที่ใช้ .parse(req.query) แบบเดียวกัน",
        "where": "server/src/modules/customers/customers.routes.ts (readDirectoryQuery)",
        "change": "customers.routes.ts: readDirectoryQuery ใช้ safeParse แล้วตอบ 400 \"คำค้นยาวเกิน 200 ตัวอักษร\" ทั้ง /directory และ /directory.csv · "
        "สคริปต์เคส: แก้เกณฑ์ pageSize จาก ≤100 (ตัวเลขที่ผู้ทดสอบตั้งเอง) เป็น ≤500 ตามเพดานที่ระบบออกแบบไว้ (CUSTOMER_PAGE_SIZE_MAX)",
    },
}

API_ROUND_LABELS = {1: "ก่อนแก้บัค"}

API_REMARKS = {
    "TC_API_LOGIN_S_005": "จับเวลาบนเครื่องเดียวกับเซิร์ฟเวอร์ — ระบบจริงผ่านเครือข่ายเวลาจะแกว่งกว่านี้",
    "TC_API_LOGIN_S_002": "ระบบจริงต้องตั้ง COOKIE_SECURE=true (HTTPS) — ระบบทดสอบเป็น http จึงยังไม่ Secure",
    "TC_API_MONEY_002": "OWNER ยืนยันรายการที่ตัวเองบันทึกได้ (บริษัทคนเดียว ตั้งใจ) — ความเสี่ยงคงเหลือ ดู Risk Analysis R-29",
    "TC_API_MONEY_009": "สลิปจำลอง (SLIP_PROVIDER=mock) ไม่ได้เรียก SlipOK จริง",
    "TC_API_RATE_001": "ระบบทดสอบตั้ง TRUST_PROXY=loopback เพื่อแยกไอพีด้วย X-Forwarded-For — ดู Risk Analysis R-07",
}

RISKS = [
    # (หมวด, สถานการณ์, ผลกระทบ, ระดับ, เคสที่ตรวจ, ผลที่พบ, คำแนะนำ)
    ("Security", "ลูกค้าตั้ง 2FA ให้บัญชีตัวเอง (หรือคนที่ขโมยเซสชันลูกค้าไปตั้งให้)", "เจ้าของบัญชีเข้าพอร์ทัลไม่ได้อีก (account lockout)", "Medium",
     "TC_API_ACC_001 · TC_API_ACL (2FA 6 เส้น)", "พบแล้วแก้ — BUG-API-001 (Closed)", "กั้นบทบาทที่ twoFactorRouter (ทำแล้ว)"),
    ("Security", "ข้ามสิทธิ์: ไม่ได้เข้าสู่ระบบ / ลูกค้าเรียก API พนักงาน / พนักงานเรียกพื้นที่ลูกค้า / ADMIN เรียกงานของ OWNER", "เข้าถึงหรือแก้ข้อมูลที่ไม่ใช่ของตัวเอง", "High",
     "TC_API_ACL_001–264 (ทุกเส้น)", "ไม่พบ นอกจาก 2FA", "เพิ่มเส้นใหม่ = รัน test-env.mjs --run ระบบสร้างเคสสิทธิ์ให้เอง"),
    ("Security", "IDOR ข้ามลูกค้า: เดาเลขใบเสนอราคา/สัญญา/ใบแจ้งหนี้/งวด/การแจ้งโอนของคนอื่น", "ข้อมูลส่วนบุคคลและราคารั่ว", "High",
     "TC_API_DOC_002–004 · TC_API_MONEY_007 · TC_API_MONEY_012 · TC_API_CUST_005", "ไม่พบ (ตอบ 404 เหมือนไม่มีอยู่)", "-"),
    ("Security", "IDOR ฝั่งพนักงาน: ใส่เลขสัญญา/เอกสารของโครงการหนึ่งใต้ URL ของอีกโครงการ", "บันทึกเงินผิดสัญญา / เปิดเอกสารผิดงาน", "Medium",
     "TC_API_MONEY_006 · TC_API_DOC_005", "ไม่พบ (404)", "-"),
    ("Security", "ไล่เดาว่าบัญชี/อีเมลไหนมีอยู่ (ข้อความ error และเวลาตอบ)", "ผู้โจมตีได้รายชื่อเป้าหมาย", "Medium",
     "TC_API_LOGIN_S_004–005 · TC_API_LOGIN_C_003–004", "ไม่พบ — ข้อความเหมือนกัน เวลาต่างกัน ~70 ms", "-"),
    ("Security", "เดารหัสผ่าน (brute force) ทั้งแบบเจาะบัญชีเดียวจากหลายไอพี และยิงรัวจากไอพีเดียว", "บัญชีถูกยึด", "High",
     "TC_API_LOGIN_S_016 · TC_API_LOGIN_C_008 · TC_API_RATE_001–002", "ป้องกันได้: ล็อกบัญชีครั้งที่ 6 (423) · ไอพีถูกบล็อกครั้งที่ 21 (429)", "-"),
    ("Security", "ปลอม X-Forwarded-For เพื่อหลบเพดานจำนวนครั้ง ถ้าตอน deploy ตั้ง TRUST_PROXY=true", "เพดานกันเดารหัสใช้ไม่ได้", "High",
     "ยังไม่ได้ทดสอบบนระบบจริง (ชุดทดสอบเองใช้ header นี้แยกเพดาน = ยืนยันว่าถ้าเชื่อ header ก็ปลอมได้)", "ความเสี่ยงคงเหลือตอน deploy",
     "ตั้ง TRUST_PROXY เป็นจำนวนชั้น proxy จริง (เช่น 1) ห้ามใช้ true · ทดสอบซ้ำบนเครื่องจริงหลัง deploy"),
    ("Security", "Mass assignment: แนบ role/email มากับการแก้โปรไฟล์", "เลื่อนสิทธิ์ตัวเองเป็น OWNER / ยึดบัญชี", "High",
     "TC_API_ACC_002–003", "ไม่พบ — ช่องที่ไม่รู้จักถูกตัดทิ้ง", "-"),
    ("Security", "เซสชันค้าง: ออกจากระบบ/เปลี่ยนรหัส/ถูกระงับแล้วคุกกี้เดิมยังใช้ได้ · โทเคนเดาได้หรือไม่เปลี่ยน", "คนที่ได้คุกกี้ไปใช้ต่อได้", "High",
     "TC_API_LOGIN_S_017–018 · TC_API_ACC_005 · TC_API_CUST_006", "ไม่พบ — ทุกกรณีตัดเซสชันที่เซิร์ฟเวอร์ · โทเคน 64 ตัว", "-"),
    ("Security", "คุกกี้ไม่ตั้งค่าความปลอดภัย", "สคริปต์อ่านคุกกี้ได้ / ส่งข้ามเว็บ", "Medium",
     "TC_API_LOGIN_S_002", "HttpOnly · SameSite=Lax ถูกต้อง · Secure ยังปิด (ระบบทดสอบเป็น http)", "ระบบจริงต้อง COOKIE_SECURE=true"),
    ("Security", "CSRF — ระบบไม่มี CSRF token พึ่ง SameSite=Lax + CORS", "เว็บอื่นสั่งทำรายการแทนผู้ใช้", "Low",
     "ยังไม่ได้ทดสอบโดยตรง", "ความเสี่ยงต่ำ: Lax ไม่ส่งคุกกี้กับ POST ข้ามเว็บ", "อย่าสร้าง GET ที่เปลี่ยนข้อมูล · เพิ่มเคสตรวจว่า GET ทุกเส้นไม่เปลี่ยนข้อมูล"),
    ("Security", "SQL / NoSQL injection / สคริปต์ในช่องข้อมูล", "อ่านหรือทำลายฐานข้อมูล", "High",
     "TC_API_LOGIN_S_008–009 · TC_API_LOGIN_C_006–007 · TC_API_CUST_004", "ไม่พบ (Prisma ใช้ parameter · zod ตรวจชนิด)", "-"),
    ("Security", "CSV / formula injection: ชื่อลูกค้าเป็นสูตร Excel", "สูตรทำงานบนเครื่องพนักงานตอนเปิดไฟล์", "Medium",
     "TC_API_CUST_003", "กันแล้ว — นำหน้าด้วย '", "-"),
    ("Security", "Path traversal ในที่อยู่ไฟล์หลักฐาน (../.env)", "รหัสฐานข้อมูล/คีย์รั่ว", "High",
     "TC_API_DOC_006", "ไม่พบ (404)", "-"),
    ("Security", "อัปโหลดไฟล์อันตราย: นามสกุลปลอม · SVG ฝังสคริปต์ · ไฟล์ใหญ่ · จำนวนเกิน", "XSS / ดิสก์เต็ม", "Medium",
     "TC_API_ACC_007 · TC_API_MONEY_008", "ปฏิเสธถูกต้องทุกแบบ (400)", "-"),
    ("Security", "คำตอบ API แนบข้อมูลลับ (passwordHash, totpSecret, รหัสสำรอง)", "แฮชรหัสผ่านรั่ว", "High",
     "TC_API_LOGIN_S_001 · TC_API_LOGIN_C_001", "ไม่พบ", "-"),
    ("Security / PDPA", "ไอพีของลูกค้า (ข้อมูลส่วนบุคคล) เห็นได้ทุกคน · ส่งออกข้อมูลลูกค้าผิดคน", "ละเมิด PDPA", "Medium",
     "TC_API_CUST_001 · TC_API_CUST_007", "ถูกต้อง: ไอพีเฉพาะ OWNER · ส่งออกเฉพาะ OWNER และมีข้อมูลคนเดียว", "-"),
    ("Security", "ไฟล์ Excel ที่ส่งลูกค้ามีต้นทุน/กำไรติดไป", "ลูกค้าเห็นต้นทุน", "Medium",
     "TC_API_DOC_007", "ไม่พบคำว่าต้นทุน/กำไรในไฟล์", "ตรวจเพิ่มถ้าเปลี่ยนแม่แบบไฟล์"),
    ("Edge case", "body ใหญ่เกิน / JSON เสีย / Content-Type ผิด", "ตอบ 500 · log เต็ม error ปลอม", "Low",
     "TC_API_LOGIN_S_011–012", "พบแล้วแก้ — BUG-API-002, BUG-API-003 (Closed)", "แก้ตัวจัดการ error กลาง (ทำแล้ว)"),
    ("Edge case", "query string ยาวเกินที่ schema รับ", "ตอบ 500", "Low",
     "TC_API_CUST_004", "พบแล้วแก้ — BUG-API-004 (Closed)", "safeParse ทุกจุดที่อ่าน query (แก้แล้วที่แฟ้มลูกค้า)"),
    ("Edge case", "ยอดเงิน 0 / ติดลบ / ตัวอักษร / เกินเพดาน · วันที่ผิดรูปแบบ · ช่องทางชำระที่ไม่มีจริง", "รายการเงินผิด", "High",
     "TC_API_MONEY_001 · TC_API_MONEY_008", "ปฏิเสธถูกต้อง (400)", "-"),
    ("Edge case", "วันที่โอนในอนาคต", "ยืนยันรายการที่ยังไม่เกิด", "Medium", "TC_API_MONEY_008", "ปฏิเสธ (400)", "-"),
    ("Edge case", "ขอ pageSize มหาศาลเพื่อดึงข้อมูลทั้งหมดในครั้งเดียว", "ระบบช้า/ข้อมูลรั่วทีละมาก", "Medium",
     "TC_API_CUST_004", "บีบเหลือไม่เกินเพดาน 500 รายการต่อหน้า (ส่งออกไฟล์วนขอทีละหน้า)", "-"),
    ("Edge case", "รหัสผ่านยาวมาก (บังคับให้แฮชนาน)", "ระบบช้า (DoS)", "Low", "TC_API_LOGIN_S_010", "ตอบภายใน 0.4 วินาที · body จำกัด 100 KB", "-"),
    ("User behavior", "ดับเบิลคลิก/ส่งซ้ำ: ยืนยันซ้ำ แจ้งโอนซ้ำ", "รายการซ้ำ ยอดเกิน", "Medium",
     "TC_API_MONEY_003 · TC_API_MONEY_010", "ไม่เกิดซ้ำ (409 / เวลายืนยันไม่เปลี่ยน)", "-"),
    ("User behavior", "ใช้สลิปใบเดิมแจ้งอีกงวด", "รับเงินซ้ำจากสลิปเดียว", "High", "TC_API_MONEY_011", "ปฏิเสธ (422 สลิปซ้ำ)", "-"),
    ("User behavior", "พิมพ์อีเมลตัวใหญ่ / มีช่องว่างติดมาจากการคัดลอก", "เข้าสู่ระบบไม่ได้ทั้งที่ถูก", "Low",
     "TC_API_LOGIN_C_002 · TC_API_LOGIN_S_015", "เข้าได้", "-"),
    ("User behavior", "ออกใบเสร็จก่อนเงินเข้าจริง · ลบรายการที่ออกใบเสร็จแล้ว", "เอกสารบัญชีผิด", "High",
     "TC_API_MONEY_004–005", "กั้นถูก (409)", "-"),
    ("User behavior", "คนเดียวบันทึกเองยืนยันเอง", "ทุจริต/พิมพ์ผิดไม่มีใครตรวจ", "Medium",
     "TC_API_MONEY_002", "ADMIN ยืนยันของตัวเองไม่ได้ (403) · OWNER ยืนยันของตัวเองได้ (ตั้งใจ)", "ถ้ามีพนักงานบัญชีเพิ่ม ควรห้าม OWNER ยืนยันของตัวเองด้วย"),
    ("ยังไม่ได้ทดสอบ", "สองคนกดยืนยัน/ออกใบเสร็จพร้อมกัน · เลขเอกสารชนกัน", "เลขเอกสารซ้ำ", "Medium",
     "ไม่มีใน Robot (jest มี document-sequence-concurrency)", "-", "เพิ่มเคสยิงพร้อมกันใน Robot"),
    ("ยังไม่ได้ทดสอบ", "Stored XSS: ชื่อลูกค้า/บันทึกเป็น HTML แล้วไปแสดงใน PDF หรือหน้าพนักงาน", "สคริปต์ทำงานบนเครื่องพนักงาน", "Medium",
     "ไม่มี", "-", "เพิ่มเคส: ตั้งชื่อเป็น <img onerror> แล้วเปิด PDF/หน้าแฟ้มลูกค้า"),
    ("ยังไม่ได้ทดสอบ", "ใช้ปลายทางส่งเมล (ลืมรหัส/ส่งรหัสยืนยัน) ยิงสแปมหาอีเมลคนอื่น", "ชื่อเสียงโดเมนเสีย / โควตา Gmail หมด", "Medium",
     "มีเพดาน 20 ครั้ง/15 นาที แต่ยังไม่มีเคส", "-", "เพิ่มเคสเพดานของ forgot-password และ resend"),
]

UI_GAPS = [
    # (ส่วน, สิ่งที่ควรเพิ่ม, เหตุผล, ระดับ)
    ("ใบเสนอราคา", "สร้าง → ส่ง → ลูกค้ายอมรับ/ปฏิเสธในพอร์ทัล → สถานะโครงการเปลี่ยนตาม", "เส้นทางหารายได้หลักยังไม่มีเคสหน้าจอเลย", "High"),
    ("สัญญา", "สร้างสัญญาจากใบเสนอราคาที่ยอมรับ · แก้งวด · ลงนาม · เปิด PDF", "ข้อมูลตั้งต้นของส่วนเงินทั้งหมด (ตอนนี้ seed สร้างผ่าน API)", "High"),
    ("วางบิล / เอกสาร", "กดวางบิลจากหน้าจอ · เปิด PDF ใบแจ้งหนี้และใบเสร็จ · ยกเลิกใบ", "เอกสารบัญชีที่ลูกค้าได้รับจริง", "High"),
    ("คำขอจากลูกค้า", "กรอกฟอร์มติดต่อหน้าบ้าน → พนักงานเห็นคำขอในหลังบ้าน → สร้างโครงการจากคำขอ", "จุดเริ่มของงานทุกงาน", "High"),
    ("สิทธิ์ในหน้าจอ", "ADMIN ไม่เห็นตัวเลขกำไร/ไอพีลูกค้าบนหน้าจอ (API กั้นแล้ว ต้องตรวจว่าหน้าจอไม่โชว์ช่องว่างแปลก ๆ)", "ข้อมูลที่ OWNER เท่านั้นเห็น", "High"),
    ("เข้าสู่ระบบ 2FA (หลังบ้าน)", "เปิด 2FA → เข้าสู่ระบบด้วยรหัส 6 หลัก/รหัสสำรอง → กลับหน้าที่ตั้งใจเปิด", "แก้กลับหน้าเดิมทางนี้แล้วแต่ยังไม่มีเคส", "Medium"),
    ("ลืมรหัสผ่าน", "ทั้งสองฝั่ง: ขอรหัส → อ่านรหัสจากเมลโหมด console → ตั้งรหัสใหม่", "ผู้ใช้ติดต่อบ่อยที่สุดเรื่องนี้", "Medium"),
    ("สมัครสมาชิกสำเร็จ", "สมัคร → ยืนยันอีเมลด้วยรหัส 6 หลัก → เข้าพอร์ทัลครั้งแรก", "ตอนนี้มีแค่เคสฟอร์มผิด", "Medium"),
    ("ประวัติการชำระ (ลูกค้า)", "ลูกค้าเห็นงวดเป็น \"ชำระแล้ว\" เฉพาะหลังพนักงานยืนยัน และเปิดใบเสร็จได้", "กฎสำคัญ: การแจ้งโอนไม่ใช่เงินเข้า", "Medium"),
    ("แฟ้มลูกค้า", "ค้นหา · เรียง · ดูประวัติการใช้งาน · ส่งออก CSV", "ใช้ทุกวัน", "Medium"),
    ("BOQ Excel", "นำเข้า/ส่งออก Excel BOQ ผ่านหน้าจอ", "ฟีเจอร์ที่เคยมีบั๊กจอขาว", "Medium"),
    ("จอมือถือ/iPad", "หน้าบ้านที่ 390 px · หลังบ้านบน iPad (รางไอคอน)", "ลูกค้าส่วนใหญ่ใช้มือถือ", "Medium"),
    ("ถังขยะ", "ลบ → เห็นในถังขยะ → กู้คืน · OWNER ลบถาวร", "ข้อมูลหายถ้าพลาด", "Low"),
    ("การแจ้งเตือน", "ลูกค้าแจ้งโอน → กระดิ่งพนักงานขึ้นเลข → อ่านแล้วเลขหาย", "พนักงานพึ่งกระดิ่งในการรู้ว่ามีงาน", "Low"),
    ("เบราว์เซอร์อื่น", "รันชุดเดิมบน Firefox / Edge (SeleniumLibrary เปลี่ยน BROWSER ได้)", "ตอนนี้ทดสอบแค่ Chrome", "Low"),
    ("การเข้าถึง (accessibility)", "ใช้คีย์บอร์ดล้วน (Tab/Enter/Esc) ในฟอร์มหลัก · ป้าย aria", "ผู้ใช้ที่ไม่ใช้เมาส์", "Low"),
]


def api_plan(rows, meta, cov):
    total = len(rows)
    groups = {}
    for c in cov:
        groups[c["group"]] = groups.get(c["group"], 0) + 1
    deep = total - len(cov)
    day = meta["start"].strftime("%d/%m/%Y")
    first_day = meta["history"][0]["start"].strftime("%d/%m/%Y") if meta.get("history") else day
    closed = sorted({x["defect"] for x in rows if x["defect_state"] == "Closed"})
    still_open = sorted({x["defect"] for x in rows if x["defect_state"] == "Open"})
    passed = sum(1 for x in rows if x["status"] == "Pass")
    if still_open:
        fix_status = "ค้าง " + ", ".join(still_open)
    elif closed:
        fix_status = f"เสร็จ {day} — แก้ {', '.join(closed)} แล้ว รันซ้ำทั้งชุดผ่าน {passed}/{total}"
    else:
        fix_status = "ไม่มีข้อบกพร่องให้แก้"
    return [
        ("1. วัตถุประสงค์", [
            "ทดสอบ API ของระบบ SystemBOQ ทุกเส้นแบบอัตโนมัติ โดยยิงตรงไปที่เซิร์ฟเวอร์ (ไม่ผ่านหน้าจอ) ด้วย Robot Framework + RequestsLibrary",
            "ยืนยันว่าทุกเส้นกั้นสิทธิ์ถูกต้อง และเส้นสำคัญ (เข้าสู่ระบบ เงิน เอกสาร ข้อมูลลูกค้า) รับมือข้อมูลผิดปกติ การโจมตี และพฤติกรรมผู้ใช้ที่มักถูกมองข้ามได้",
            "หาความเสี่ยงที่ QA มักมองข้าม (ชีต Risk Analysis) และบันทึกข้อบกพร่องด้วยรหัส BUG-API-###",
        ]),
        ("2. ขอบเขต", [
            ("ครบทุกเส้น (ขั้นต่ำ)", f"{len(cov)} เส้น — ทุกเส้นได้เคสตรวจสิทธิ์ 401/403 (TC_API_ACL_###) สร้างอัตโนมัติจากรายชื่อ route ในโค้ดทุกรอบที่รัน\n"
             f"แยกตามกลุ่มสิทธิ์: สาธารณะ {groups.get('PUBLIC', 0)} · ผู้ใช้ทุกบทบาท {groups.get('ANY', 0)} · ลูกค้า {groups.get('CUSTOMER', 0)} · "
             f"พนักงาน {groups.get('STAFF', 0)} · เฉพาะ OWNER {groups.get('OWNER', 0)}"),
            ("เส้นสำคัญ (ครบทุกแบบ)", f"{deep} เคส: เข้าสู่ระบบพนักงาน/ลูกค้า · บัญชีและเซสชัน · เงิน · เอกสาร · ข้อมูลลูกค้า · เพดานจำนวนครั้ง"),
            ("เส้นที่มีผลข้างเคียง", "สำรองข้อมูล/ลบถาวร/ส่งเมล ยิงในฐานข้อมูลทดสอบเท่านั้น · เมลโหมด silent · สำรองข้อมูลปิด · สลิปจำลอง"),
            ("นอกขอบเขต", "ทดสอบโหลด/ความเร็วภายใต้ผู้ใช้จำนวนมาก · ระบบจริงหลัง deploy · การต่อ SlipOK จริง · เนื้อหาอีเมล (มีใน jest)"),
        ]),
        ("3. สภาพแวดล้อม", [
            ("API", "http://localhost:4100 · ฐานข้อมูลทดสอบ (DATABASE_URL_TEST) · MAIL_TRANSPORT=silent · SLIP_PROVIDER=mock · TRUST_PROXY=loopback"),
            ("เครื่องมือ", "Python 3.13 · Robot Framework 7.5 · RequestsLibrary 0.9.7 · ตัวช่วย ApiHelpers.py (multipart, TOTP, คุกกี้, ไอพีจำลอง)"),
            ("บัญชีทดสอบ", "OWNER robot_owner · ADMIN robot_admin · ลูกค้าเจ้าของข้อมูล robot.apicust · ลูกค้าคนที่สอง robot.other · "
             "บัญชีใช้แล้วทิ้ง (ล็อก/2FA/เปลี่ยนรหัส/ลบบัญชี/ระงับ) — seed สร้างคืนทุกรอบ"),
        ]),
        ("4. เกณฑ์เริ่มและเกณฑ์จบ", [
            ("เกณฑ์เริ่ม", "seed สำเร็จ · บัญชีรายชื่อ API สร้างใหม่จากโค้ดปัจจุบัน · API /api/health ตอบ 200"),
            ("เกณฑ์จบ", "รันครบทุกเคส · ผลนิ่ง 2 รอบติด · ทุกเคสที่ไม่ผ่านวิเคราะห์แล้วออก BUG-API-### · แก้โค้ดระบบเฉพาะเมื่อผู้ใช้สั่ง (สั่งแก้ BUG-API-001–004 เมื่อ 20/10/2569) แล้วรันซ้ำทั้งชุด"),
        ]),
        ("5. ลำดับงาน", [("__table__", ["ขั้น", "งาน", "ผลลัพธ์", "สถานะ"]),
            ("1", "ทำบัญชีรายชื่อ API จากแอปที่รันจริง (tools/inventory.ts)", "api/routes.json", f"เสร็จ {first_day}"),
            ("2", "จัดกลุ่มสิทธิ์ตามหลักการ เทียบกับโค้ด (tools/policy.py)", "api/coverage.json + 01_access_matrix.robot", f"เสร็จ {first_day}"),
            ("3", "เขียนเคสเส้นสำคัญ (02–07, 99)", "robot-tests/api/*.robot", f"เสร็จ {first_day}"),
            ("4", "รันทั้งชุด 2 รอบ + วิเคราะห์เคสที่ไม่ผ่าน", "BUG-API-001–004", f"เสร็จ {first_day}"),
            ("5", "แก้ข้อบกพร่องแล้วรันซ้ำทั้งชุด (regression)", "เคสที่ไม่ผ่านกลายเป็น Pass", fix_status),
        ]),
    ]


def api_strategy():
    return [
        ("1. สองชั้นของการทดสอบ API", [("__table__", ["ชั้น", "ทำอะไร", "สร้างอย่างไร", "จำนวน"]),
            ("ตรวจสิทธิ์ทุกเส้น", "ยิงทุกเส้นด้วยทุกบทบาทที่ต้องถูกปฏิเสธ — ไม่มีคุกกี้ต้อง 401 · บทบาทผิดต้อง 403 · ห้าม 5xx · เส้นสาธารณะต้องเรียกได้",
             "สร้างอัตโนมัติจากโค้ดทุกรอบ (inventory → policy → 01_access_matrix.robot) เส้นใหม่ได้เคสเองไม่ต้องจำ", "1 เคส/เส้น"),
            ("เส้นสำคัญครบทุกแบบ", "สำเร็จ · ข้อมูลผิด/ขาด · ชนิดผิด · ค่าขอบ · การโจมตี · การเข้าถึงข้ามลูกค้า/ข้ามโครงการ · พฤติกรรมผู้ใช้",
             "เขียนมือ (02–07, 99) จากหลักการ ไม่ลอกค่าจากโค้ด", "หลายเคส/เส้น"),
        ]),
        ("2. ตั้งค่าที่คาดหวังจากหลักการ ไม่ใช่จากโค้ด", [
            "กลุ่มสิทธิ์ของแต่ละเส้นตั้งจากหน้าที่ของมัน (tools/policy.py) เช่น /api/my/* = ลูกค้าเท่านั้น · 2FA = พนักงานเท่านั้น · จัดการผู้ใช้/สำรองข้อมูล = OWNER",
            "บทบาทที่ต้องถูกปฏิเสธ = ทุกบทบาทที่ไม่อยู่ใน (หลักการ ∩ โค้ด): โค้ดเข้มกว่า → ยึดโค้ด · โค้ดหลวมกว่า → เคสล้ม = ข้อบกพร่อง (เจอแบบนี้ 6 เส้น = 2FA)",
            "เคสเส้นสำคัญตั้งค่าที่ควรได้ก่อน (เช่น JSON เสียต้อง 400 · body ใหญ่ต้อง 413 · วันที่โอนอนาคตต้องปฏิเสธ) แล้วจึงรัน — ไม่แก้ค่าคาดหวังตามผลที่ได้",
        ]),
        ("3. เทคนิคที่ใช้", [("__table__", ["เทคนิค", "ตัวอย่าง"]),
            ("Equivalence / Boundary", "ยอดเงิน 0 · ติดลบ · เกินเพดาน · รหัสผ่าน 4 ตัว · body 100 KB vs 200 KB · ไฟล์ 10 MB vs 11 MB · สลิป 3 vs 4 ไฟล์"),
            ("Negative / Type confusion", "ชนิดข้อมูลผิด (ตัวเลข/รายการ/อ็อบเจกต์/null) · JSON เสีย · Content-Type ผิด · method ผิด"),
            ("Security", "IDOR ข้ามลูกค้า/ข้ามโครงการ · mass assignment · injection · path traversal · CSV injection · enumeration (ข้อความ+เวลา) · brute force · session fixation/revocation"),
            ("State / Workflow", "ยืนยันก่อนออกใบเสร็จ · ลบรายการที่มีใบเสร็จ · แจ้งซ้ำขณะรอตรวจ · ยกเลิกแล้วแจ้งใหม่"),
            ("Idempotency", "ยืนยันซ้ำ · ส่งซ้ำ — ผลต้องไม่เกิดสองครั้ง"),
        ]),
        ("4. การจัดการข้อมูลและสภาพแวดล้อม", [
            ("เพดานเข้าสู่ระบบ", "ระบบนับ 20 ครั้ง/15 นาที/ไอพี — ทุกเซสชันและทุกเคสเข้าสู่ระบบใช้ไอพีจำลองของตัวเอง (X-Forwarded-For) จึงไม่นับปนกัน · ตัวเพดานเองทดสอบที่ 99_rate_limit.robot"),
            ("ข้อมูลแยกจากชุดหน้าจอ", "สัญญาชุด API เป็นของ robot.apicust ไม่ปนกับ robot.customer ของชุดหน้าจอ · บัญชีที่เทสต์ทำลาย (ล็อก/ลบ/ระงับ) แยกบัญชีต่อเคส"),
            ("ลำดับรัน", "หน้าบ้าน → เปิด API ใหม่ → หลังบ้าน → เปิด API ใหม่ → API — รวมผลด้วย rebot เป็น output.xml เดียว"),
            ("คำสั่ง", "node robot-tests/test-env.mjs --run · python -X utf8 robot-tests/build_api_report.py --out <ไฟล์.xlsx>"),
        ]),
        ("5. ระดับความรุนแรง", [("__table__", ["ระดับ", "ความหมาย"]),
            ("Critical / Blocker", "ข้ามสิทธิ์อ่าน/แก้ข้อมูลคนอื่นได้ · ระบบเงินผิด"),
            ("High", "ยึดบัญชีได้ · ข้อมูลส่วนบุคคลรั่ว"),
            ("Medium", "ผู้ใช้ถูกล็อกออก/ใช้งานไม่ได้ในกรณีเฉพาะ"),
            ("Low", "ตอบรหัสผิด (เช่น 500 แทน 4xx) ไม่กระทบข้อมูล"),
        ]),
    ]


def write_coverage(ws, cov, rows):
    ws.sheet_view.showGridLines = False
    status = {r["id"]: r["status"] for r in rows}
    cols = [("Test Case ID", 18), ("Method", 9), ("Endpoint", 58), ("กลุ่มตามหลักการ", 14), ("เหตุผล", 40),
            ("โค้ดประกาศสิทธิ์", 22), ("บทบาทที่ต้องถูกปฏิเสธ", 30), ("เทียบหลักการ", 30), ("Status", 10)]
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(cols))
    ws["A1"] = f"Endpoint Coverage — API ทุกเส้น {len(cov)} เส้น (จากแอปที่รันจริง) และผลตรวจสิทธิ์ของแต่ละเส้น"
    ws["A1"].font = br.f(12, True, br.NAVY)
    for i, (name, width) in enumerate(cols, start=1):
        c = ws.cell(2, i, name)
        c.font = br.f(10, True, "FFFFFF")
        c.fill = br.fill(br.NAVY)
        c.alignment = br.CENTER
        c.border = br.BORDER
        ws.column_dimensions[get_column_letter(i)].width = width
    th = {"ANON": "ไม่มีคุกกี้ (401)", "OWNER": "OWNER (403)", "ADMIN": "ADMIN (403)", "CUSTOMER": "ลูกค้า (403)"}
    for r, c in enumerate(cov, start=3):
        code = "สาธารณะ" if not c["auth"] else (", ".join(c["roles"]) if c["roles"] else "ต้องเข้าสู่ระบบ (ทุกบทบาท)")
        diff = []
        if c["looser"]:
            diff.append("โค้ดหลวมกว่า: ยอม " + ", ".join(c["looser"]))
        if c["stricter"]:
            diff.append("โค้ดเข้มกว่า: ไม่ยอม " + ", ".join(c["stricter"]))
        values = [c["tc"], c["method"], c["path"], c["group"], c["why"], code,
                  " · ".join(th[d] for d in c["deny"]) or "-", " · ".join(diff) or "ตรงกัน", status.get(c["tc"], "Untested")]
        for i, v in enumerate(values, start=1):
            cell = ws.cell(r, i, v)
            cell.font = br.f(9, bold=(i == 1))
            cell.alignment = br.WRAP_TOP
            cell.border = br.BORDER
        ws.cell(r, 9).alignment = br.CENTER
        ws.row_dimensions[r].height = 26
    last = len(cov) + 2
    ws.freeze_panes = "C3"
    ws.auto_filter.ref = f"A2:{get_column_letter(len(cols))}{last}"
    for word, bg, fg in [("Pass", "DCFCE7", "166534"), ("Fail", "FEE2E2", "B91C1C")]:
        ws.conditional_formatting.add(f"I3:I{last}", FormulaRule(formula=[f'$I3="{word}"'], fill=br.fill(bg),
                                                                 font=Font(name=br.FONT, bold=True, color=fg)))


def write_table(ws, title, cols, data, color, level_col=None):
    ws.sheet_view.showGridLines = False
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(cols))
    ws["A1"] = title
    ws["A1"].font = br.f(12, True, br.NAVY)
    for i, (name, width) in enumerate(cols, start=1):
        c = ws.cell(2, i, name)
        c.font = br.f(10, True, "FFFFFF")
        c.fill = br.fill(color)
        c.alignment = br.CENTER
        c.border = br.BORDER
        ws.column_dimensions[get_column_letter(i)].width = width
    for r, row in enumerate(data, start=3):
        lines = 1
        for i, v in enumerate(row, start=1):
            cell = ws.cell(r, i, v)
            cell.font = br.f(9, bold=(i == 1))
            cell.alignment = br.WRAP_TOP
            cell.border = br.BORDER
            lines = max(lines, br.est_lines(v, cols[i - 1][1] * 0.8))
        ws.row_dimensions[r].height = 13 * lines + 8
    ws.freeze_panes = "B3"
    if level_col:
        col = get_column_letter(level_col)
        last = len(data) + 2
        for word, bg, fg in [("High", "FEE2E2", "B91C1C"), ("Medium", "FEF3C7", "92400E"), ("Low", "E0F2FE", "075985")]:
            ws.conditional_formatting.add(f"{col}3:{col}{last}", FormulaRule(formula=[f'${col}3="{word}"'], fill=br.fill(bg),
                                                                            font=Font(name=br.FONT, bold=True, color=fg)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--label", default="ชุด API รอบแรก", help="ชื่อของรอบนี้ในตารางประวัติ")
    args = ap.parse_args()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    br.BASE_DIR = out.parent

    cov = json.loads((API_DIR / "coverage.json").read_text(encoding="utf-8"))
    # ข้อบกพร่องของเคสสิทธิ์ 2FA — รหัสเคสสร้างอัตโนมัติ จึงผูกด้วย path แทนการพิมพ์รหัสเคส
    defects = dict(API_DEFECTS_BASE)
    for c in cov:
        if c["path"].startswith("/api/auth/2fa/") and c["looser"]:
            defects[c["tc"]] = API_DEFECTS_BASE["TC_API_ACC_001"]
    br.DEFECTS = defects
    br.REMARKS = API_REMARKS
    br.EVIDENCE_PLACEHOLDER = "คำขอ/คำตอบทุกครั้งอยู่ใน log.html (testcase-evidence-api/)"
    br.TC_COLUMNS = [(n, 26 if n == "Screenshot / Evidence Link" else w) for n, w in br.TC_COLUMNS]
    br.ENVIRONMENT = "DEV (localhost:4100) · ฐานข้อมูลทดสอบ · RequestsLibrary"
    br.ENVIRONMENT_FULL = "DEV · API localhost:4100 · ฐานข้อมูลทดสอบ · เมล silent · สลิปจำลอง"
    br.TESTER = "Robot Framework 7.5 + RequestsLibrary (อัตโนมัติ)"

    br.FIXED_NOTE = "ผลก่อน/หลังแก้อยู่ในชีต Defects"
    round1 = out.parent / "testcase-evidence-api-round1"
    rows, meta = br.collect(round1, include=("api",), evidence_dir="testcase-evidence-api")
    # ประวัติ: ทุกโฟลเดอร์ testcase-evidence-api-round<N> (ผลรันจริงที่เก็บไว้) — นับเฉพาะชุด api
    history = []
    for d in out.parent.glob("testcase-evidence-api-round*"):
        m = re.fullmatch(r"testcase-evidence-api-round(\d+)", d.name)
        if not m:
            continue
        _, stats = br.read_round(d / "output.xml", ("api",))
        if stats:
            n = int(m.group(1))
            history.append({"n": n, "label": API_ROUND_LABELS.get(n, "รอบก่อนหน้า"), **stats})
    meta["history"] = sorted(history, key=lambda h: h["n"])
    meta["label"] = args.label
    meta["note"] = ""

    ev = out.parent / "testcase-evidence-api"
    if ev.exists():
        shutil.rmtree(ev)
    ev.mkdir()
    for name in ("log.html", "report.html", "output.xml", "output-api.xml"):
        if (br.RESULTS / name).exists():
            shutil.copy2(br.RESULTS / name, ev / name)
    for name in ("routes.json", "coverage.json"):
        shutil.copy2(API_DIR / name, ev / name)

    wb = Workbook()
    ws_sum = wb.active
    ws_sum.title = "สรุปผล"
    ws_plan = wb.create_sheet("แผนการทดสอบ")
    ws_strat = wb.create_sheet("กลยุทธ์การทดสอบ")
    ws_tc = wb.create_sheet("Test Cases")
    ws_cov = wb.create_sheet("Endpoint Coverage")
    ws_def = wb.create_sheet("Defects")
    ws_risk = wb.create_sheet("Risk Analysis")
    ws_gap = wb.create_sheet("ช่องว่าง UI")

    br.write_doc_sheet(ws_plan, "แผนการทดสอบ API (Test Plan)", "SystemBOQ — ทดสอบ API ทุกเส้นแบบอัตโนมัติ", api_plan(rows, meta, cov))
    br.write_doc_sheet(ws_strat, "กลยุทธ์การทดสอบ API (Test Strategy)", "ทดสอบอะไร ด้วยวิธีไหน และตั้งค่าที่คาดหวังอย่างไร", api_strategy())
    tc_last = br.write_test_cases(ws_tc, rows)
    write_coverage(ws_cov, cov, rows)
    br.write_defects(ws_def, rows)
    write_table(ws_risk, "Risk Analysis — Edge case · Security · User behavior ที่ QA มักมองข้าม (และสิ่งที่ยังไม่ได้ทดสอบ)",
                [("ID", 7), ("หมวด", 14), ("สถานการณ์", 46), ("ผลกระทบ", 30), ("ระดับ", 9), ("ตรวจด้วยเคส", 34), ("ผลที่พบ", 34), ("คำแนะนำ", 40)],
                [(f"R-{i:02d}", *row) for i, row in enumerate(RISKS, start=1)], "9A3412", level_col=5)
    write_table(ws_gap, "ช่องว่างของชุดทดสอบหน้าจอ (UI) — สิ่งที่ควรเพิ่ม (ยังไม่ได้เขียนสคริปต์ตามที่ตกลง)",
                [("ID", 10), ("ส่วนของระบบ", 22), ("เคสที่ควรเพิ่ม", 60), ("เหตุผล", 44), ("ระดับ", 9)],
                [(f"UI-GAP-{i:02d}", *row) for i, row in enumerate(UI_GAPS, start=1)], "1E3A8A", level_col=5)
    br.write_summary(ws_sum, rows, meta, tc_last)
    ws_sum["B2"] = "รายงานผลการทดสอบ API ระบบ SystemBOQ (Automated API Testing)"
    ws_sum["B3"] = f"API ทุกเส้น {len(cov)} เส้น — ตรวจสิทธิ์ทุกเส้น + เส้นสำคัญครบทุกแบบ · Robot Framework + RequestsLibrary"
    for r in range(5, 12):
        if ws_sum.cell(r, 2).value == "เครื่องมือ":
            ws_sum.cell(r, 3).value = "Robot Framework 7.5 + RequestsLibrary 0.9.7 (Python 3.13)"
        if ws_sum.cell(r, 2).value == "รายงานละเอียดของ Robot":
            ws_sum.cell(r, 3).value = "testcase-evidence-api/log.html"
            ws_sum.cell(r, 3).hyperlink = "testcase-evidence-api/log.html"

    for ws in wb.worksheets:
        ws.sheet_properties.tabColor = {"สรุปผล": br.NAVY, "Test Cases": "1E3A8A", "Defects": "9A3412",
                                        "Risk Analysis": "9A3412", "Endpoint Coverage": "065F46"}.get(ws.title, "6B7280")
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws_tc.print_title_rows = "1:2"
    wb.save(out)
    passed = sum(1 for x in rows if x["status"] == "Pass")
    failed = sum(1 for x in rows if x["status"] == "Fail")
    print(f"wrote {out} · {len(rows)} cases · pass {passed} · fail {failed} · endpoints {len(cov)} · risks {len(RISKS)} · ui gaps {len(UI_GAPS)}")


if __name__ == "__main__":
    main()
