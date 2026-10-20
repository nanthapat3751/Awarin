*** Settings ***
Documentation     ของที่ใช้ร่วมกันทั้งหน้าบ้านและหลังบ้าน: ที่อยู่ระบบทดสอบ บัญชีทดสอบ การเปิดเบราว์เซอร์ และการเก็บหลักฐาน
...
...               ระบบทดสอบเปิดด้วย ``node robot-tests/test-env.mjs`` — ชี้ฐานข้อมูลทดสอบ และเมลโหมด silent (ไม่ส่งจริง)
...               บัญชีทดสอบถูกสร้าง/รีเซ็ตทุกรอบโดย robot-tests/seed/seed-robot.ts (ค่าต้องตรงกัน)
Library           SeleniumLibrary    timeout=10s    run_on_failure=Capture Page Screenshot
Library           String
Library           DateTime


*** Variables ***
${BROWSER}                headlesschrome
${STAFF_URL}              http://localhost:5183
${CLIENT_URL}             http://localhost:5184

${STAFF_USER}             robot_owner
${STAFF_PASSWORD}         Robot-Owner-2026!
${STAFF_FULLNAME}         โรบอท เจ้าของ
${LOCK_USER}              robot_lock
${LOCK_PASSWORD}          Robot-Lock-2026!

${CUSTOMER_EMAIL}         robot.customer@example.test
${CUSTOMER_PASSWORD}      Robot-Cust-2026!
${CUSTOMER_FULLNAME}      ลูกค้า โรบอท
${UNVERIFIED_EMAIL}       robot.unverified@example.test
${UNVERIFIED_PASSWORD}    Robot-Unver-2026!


*** Keywords ***
Open Test Browser
    [Documentation]    เปิด Chrome แบบไม่มีหน้าต่าง (เปลี่ยนได้ด้วย ``--variable BROWSER:chrome``) ขนาดจอโน้ตบุ๊กทั่วไป
    [Arguments]    ${url}
    Open Browser    ${url}    ${BROWSER}    options=add_argument("--window-size=1366,900");add_argument("--lang=th-TH")
    Set Window Size    1366    900

Capture Evidence
    [Documentation]    ภาพหน้าจอท้ายทุกเคส (ผ่านหรือไม่ผ่าน) ชื่อไฟล์ = รหัสเคส ใช้เป็นหลักฐานในรายงาน
    ${id}=    Fetch From Left    ${TEST NAME}    ${SPACE}
    Run Keyword And Ignore Error    Capture Page Screenshot    evidence/${id}.png

Record Actual
    [Documentation]    บันทึก "ผลที่เกิดขึ้นจริง" ลงผลของเคส (อ่านไปเขียนคอลัมน์ Actual Result ในรายงาน)
    [Arguments]    ${text}
    Set Test Message    ${text}

Unique Suffix
    ${stamp}=    Get Current Date    result_format=%m%d%H%M%S
    RETURN    ${stamp}
