*** Settings ***
Documentation     ของที่ใช้ร่วมกันทั้งหน้าบ้านและหลังบ้าน: ที่อยู่ระบบทดสอบ บัญชีทดสอบ การเปิดเบราว์เซอร์ และการเก็บหลักฐาน
...
...               ระบบทดสอบเปิดด้วย ``node robot-tests/test-env.mjs`` — ชี้ฐานข้อมูลทดสอบ และเมลโหมด console
...               (ไม่ส่งออกจริง พิมพ์เนื้อเมลลง log แทน — MailLog.py อ่านรหัสยืนยัน/ลิงก์ตั้งรหัสผ่านจากตรงนั้น)
...               บัญชีทดสอบถูกสร้าง/รีเซ็ตทุกรอบโดย robot-tests/seed/seed-robot.ts (ค่าต้องตรงกัน)
Library           SeleniumLibrary    timeout=10s    run_on_failure=Capture Page Screenshot
Library           String
Library           Collections
Library           DateTime
Library           ${CURDIR}/MailLog.py
Library           ${CURDIR}/UiHelpers.py


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

Open Browser For Test
    [Documentation]    เปิดเบราว์เซอร์แบบไม่มีหน้าต่างพร้อมตัวเลือกเพิ่ม (ชุดที่เพิ่มรอบ UI-GAP) — alias ใช้สลับระหว่างหลายเบราว์เซอร์
    ...                ในเคสเดียว (พนักงาน/ลูกค้า) · download_dir = โหลดไฟล์ลงโฟลเดอร์นี้ · mobile = จำลองมือถือจอสัมผัส
    [Arguments]    ${url}    ${alias}=${None}    ${width}=1366    ${height}=900    ${download_dir}=${None}
    ...    ${browser}=chrome    ${mobile}=${False}
    ${opts}=    Browser Options    ${browser}    ${width}    ${height}    ${download_dir}    ${mobile}
    Open Browser    ${url}    ${browser}    alias=${alias}    options=${opts}
    IF    not ${mobile}    Set Window Size    ${width}    ${height}

No Horizontal Scroll
    [Documentation]    หน้ากว้างไม่เกินจอ (ไม่มีแถบเลื่อนแนวนอน) — คืนความกว้างเนื้อหา/จอไว้รายงาน
    ${w}=    Execute Javascript    return [document.documentElement.scrollWidth, window.innerWidth]
    Should Be True    ${w}[0] <= ${w}[1] + 1    msg=เนื้อหากว้าง ${w}[0] px เกินจอ ${w}[1] px (มีแถบเลื่อนแนวนอน)
    RETURN    ${w}

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
