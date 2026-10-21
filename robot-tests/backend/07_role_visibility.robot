*** Settings ***
Documentation     หลังบ้าน — สิทธิ์บนหน้าจอ (UI-GAP-05): ข้อมูลที่ OWNER เห็นคนเดียว ต้องไม่โผล่ให้ ADMIN และไม่เหลือช่องว่างแปลก ๆ
...
...               API กั้นไว้แล้ว (ส่ง null ให้ ADMIN — ดูชุด API) ไฟล์นี้ตรวจว่าหน้าจอไม่วาดหัวคอลัมน์/ประโยค/ปุ่มค้างไว้
...               เปรียบเทียบสองบทบาทบนหน้าเดียวกัน: robot_owner (OWNER) กับ robot_admin (ADMIN)
...               ใช้โครงการ/ลูกค้าของชุดชำระเงิน (results/payment-data.json)
Resource          resource.robot
Variables         ${CURDIR}/../results/payment-data.json
Suite Setup       Prepare Role Suite
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        backend    module:Role Visibility


*** Variables ***
${ADMIN_USER}         robot_admin
${ADMIN_PASSWORD}     Robot-Admin-2026!
${ADMIN_FULLNAME}     โรบอท แอดมิน
${PROFIT_LINE}        กำไรที่ตั้งไว้ (เห็นเฉพาะเจ้าของ)


*** Test Cases ***
TC_ROLE_001 ADMIN ไม่เห็นเมนูจัดการผู้ใช้และเปิดหน้านั้นตรงไม่ได้
    [Documentation]    Scenario: พนักงานบทบาท ADMIN มองหาเมนูจัดการผู้ใช้ หรือพิมพ์ URL /users เอง
    ...    Pre: เข้าสู่ระบบ robot_admin (ADMIN) และ robot_owner (OWNER) คนละเบราว์เซอร์
    ...    Steps: 1. ดูเมนูซ้ายของทั้งสองบทบาท | 2. ADMIN เปิด /users ตรง ๆ
    ...    Data: (ไม่มี)
    ...    Expected: OWNER มีเมนู "จัดการผู้ใช้" · ADMIN ไม่มี · ADMIN เปิด /users ได้ข้อความ "หน้านี้เข้าถึงได้เฉพาะเจ้าของระบบ (OWNER) เท่านั้น" ไม่มีรายชื่อผู้ใช้
    [Tags]    priority:High    security
    Switch Browser    owner
    Go To    ${STAFF_URL}/
    Wait Until Page Contains Element    xpath=//nav//a[@href="/users"]    15s
    Switch Browser    admin
    Go To    ${STAFF_URL}/
    Wait Until Page Contains    ยินดีต้อนรับ ${ADMIN_FULLNAME}    15s
    Page Should Not Contain Element    xpath=//nav//a[@href="/users"]
    Go To    ${STAFF_URL}/users
    Wait Until Page Contains    หน้านี้เข้าถึงได้เฉพาะเจ้าของระบบ (OWNER) เท่านั้น    15s
    Page Should Not Contain    ${STAFF_USER}
    Record Actual    OWNER มีเมนู "จัดการผู้ใช้" · ADMIN ไม่มี และเปิด /users ได้ข้อความ "เฉพาะเจ้าของระบบ" ไม่เห็นรายชื่อ

TC_ROLE_002 ADMIN ไม่เห็นตัวเลขกำไรในแท็บต้นทุนจริง
    [Documentation]    Scenario: ADMIN เปิดแท็บ "ต้นทุนจริง" ของโครงการที่มีสัญญา
    ...    Pre: โครงการชุดชำระเงินมีสัญญาที่ลงนามแล้ว
    ...    Steps: 1. OWNER เปิด ?tab=costs | 2. ADMIN เปิดหน้าเดียวกัน
    ...    Data: โครงการ [โรบอท] ทดสอบชำระเงิน <รอบ>
    ...    Expected: OWNER เห็นบรรทัด "กำไรที่ตั้งไว้ (เห็นเฉพาะเจ้าของ)" · ADMIN ไม่เห็นบรรทัดนี้และไม่มีคำว่า "บริษัทจะได้กำไร"
    [Tags]    priority:High    security
    Switch Browser    owner
    Go To    ${STAFF_URL}/projects/${PAY_PROJECT_ID}?tab=costs
    Wait Until Page Contains    ${PROFIT_LINE}    15s
    Switch Browser    admin
    Go To    ${STAFF_URL}/projects/${PAY_PROJECT_ID}?tab=costs
    Wait Until Page Contains Element    xpath=//main//button[starts-with(normalize-space(.), "ต้นทุนจริง")]    15s
    Sleep    2s    # รอแท็บโหลดรายงานต้นทุนให้ครบก่อนตรวจว่าไม่มี
    Page Should Not Contain    ${PROFIT_LINE}
    Page Should Not Contain    บริษัทจะได้กำไร
    Record Actual    OWNER เห็น "${PROFIT_LINE}" · ADMIN ไม่เห็นบรรทัดกำไรเลย

TC_ROLE_003 ADMIN ไม่เห็นคอลัมน์ไอพีในกิจกรรมของลูกค้า และไม่มีคอลัมน์ว่างค้าง
    [Documentation]    Scenario: ADMIN เปิดแฟ้มลูกค้าดูประวัติการเข้าระบบ (ไอพีเป็นข้อมูลส่วนบุคคล เห็นได้เฉพาะ OWNER)
    ...    Pre: ลูกค้า robot.customer มีประวัติเข้าสู่ระบบ
    ...    Steps: 1. OWNER เปิด /customers/{id} ดูหัวตารางกิจกรรม | 2. ADMIN เปิดหน้าเดียวกัน
    ...    Data: ลูกค้า โรบอท (robot.customer@example.test)
    ...    Expected: OWNER มีคอลัมน์ "ที่มา (IP)" และเห็นเลขไอพี · ADMIN ไม่มีหัวคอลัมน์นี้ หัวคอลัมน์น้อยกว่าหนึ่ง และไม่เห็นเลขไอพีเดียวกันบนหน้า
    [Tags]    priority:High    security
    Switch Browser    owner
    ${owner_cols}=    Activity Header Count
    Page Should Contain    ที่มา (IP)
    # ไอพีของแถวแรกที่มีค่า (127.0.0.1 หรือ ::1 แล้วแต่เบราว์เซอร์ต่อ localhost แบบไหน) — ADMIN ต้องไม่เห็นค่านี้
    ${ip}=    Execute Javascript    const m = document.querySelector('main').innerText.match(/(?:[0-9]{1,3}[.]){3}[0-9]{1,3}|::1/); return m ? m[0] : "";
    Should Not Be Empty    ${ip}    msg=OWNER ไม่เห็นเลขไอพีในกิจกรรมของลูกค้า
    Switch Browser    admin
    ${admin_cols}=    Activity Header Count
    Page Should Not Contain    ที่มา (IP)
    Page Should Not Contain    ${ip}
    ${diff}=    Evaluate    ${owner_cols} - ${admin_cols}
    Should Be Equal As Integers    ${diff}    1    msg=หัวตาราง OWNER ${owner_cols} คอลัมน์ ADMIN ${admin_cols} คอลัมน์
    Record Actual    OWNER ${owner_cols} คอลัมน์ (มี "ที่มา (IP)" เห็น ${ip}) · ADMIN ${admin_cols} คอลัมน์ ไม่เห็นไอพีและไม่มีคอลัมน์ว่าง

TC_ROLE_004 ADMIN ไม่เห็นปุ่มส่งออกข้อมูลส่วนบุคคลและปุ่มระงับบัญชีลูกค้า
    [Documentation]    Scenario: ADMIN เปิดแฟ้มลูกค้า (ส่งออกข้อมูลรวมไอพี และการระงับบัญชีเป็นอำนาจของเจ้าของระบบ)
    ...    Pre: ลูกค้า robot.customer
    ...    Steps: 1. OWNER เปิดแฟ้มลูกค้า | 2. ADMIN เปิดหน้าเดียวกัน
    ...    Data: (ไม่มี)
    ...    Expected: OWNER มีปุ่ม "ส่งออกข้อมูล" และ "ระงับบัญชี" · ADMIN ไม่มีทั้งสองปุ่ม แต่ยังมี "แก้ไข" และ "ออกลิงก์เข้าใช้งาน"
    [Tags]    priority:Medium    security
    Switch Browser    owner
    Open Customer File
    Page Should Contain Element    xpath=//main//button[contains(., "ส่งออกข้อมูล")]
    Page Should Contain Element    xpath=//main//button[contains(., "ระงับบัญชี")]
    Switch Browser    admin
    Open Customer File
    Page Should Not Contain Element    xpath=//main//button[contains(., "ส่งออกข้อมูล")]
    Page Should Not Contain Element    xpath=//main//button[contains(., "ระงับบัญชี")]
    Page Should Contain Element    xpath=//main//button[contains(., "ออกลิงก์เข้าใช้งาน")]
    Record Actual    OWNER มี "ส่งออกข้อมูล"/"ระงับบัญชี" · ADMIN ไม่มีทั้งสองปุ่ม แต่ยังแก้ไขและออกลิงก์เข้าใช้งานได้


*** Keywords ***
Prepare Role Suite
    Open Browser For Test    ${STAFF_URL}/login    alias=owner
    Login As Staff Owner
    Open Browser For Test    ${STAFF_URL}/login    alias=admin
    Go To Staff Login
    Submit Staff Login    ${ADMIN_USER}    ${ADMIN_PASSWORD}
    Wait Until Page Contains    ยินดีต้อนรับ ${ADMIN_FULLNAME}    15s

Open Customer File
    Go To    ${STAFF_URL}/customers/${PAY_CUSTOMER_ID}
    Wait Until Page Contains    robot.customer@example.test    15s
    Wait Until Page Contains Element    xpath=//main//th[normalize-space(.)="เวลา"]    15s

Activity Header Count
    Open Customer File
    ${n}=    Get Element Count    xpath=//main//table[.//th[normalize-space(.)="เวลา"]]//th
    RETURN    ${n}
