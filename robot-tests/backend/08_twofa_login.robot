*** Settings ***
Documentation     หลังบ้าน — เข้าสู่ระบบด้วย 2FA (UI-GAP-06): รหัส 6 หลักจากแอป · รหัสสำรอง · กลับหน้าที่ตั้งใจเปิด
...
...               บัญชี robot_twofa เปิด 2FA ไว้แล้ว (seed ตั้ง secret และรหัสสำรอง 2 ชุดที่รู้ค่า) — Robot คำนวณรหัส 6 หลักเอง
...               (UiHelpers.Totp แบบเดียวกับแอป Authenticator) · รหัสจากแอปช่วงเวลาเดียวใช้ได้ครั้งเดียว (ระบบจดช่วงที่ใช้แล้ว)
...               เคสที่ใช้รหัสจากแอปซ้ำจึงรอช่วง 30 วินาทีถัดไปก่อน
Resource          resource.robot
Suite Setup       Open Staff App
Suite Teardown    Close All Browsers
Test Setup        Delete All Cookies
Test Teardown     Capture Evidence
Force Tags        backend    module:Two Factor Login


*** Variables ***
${TWOFA_USER}         robot_twofa
${TWOFA_PASSWORD}     Robot-TwoFaStaff-2026!
${TWOFA_FULLNAME}     โรบอท สองชั้น
${TWOFA_SECRET}       KRUGS4ZANFZSA5DFON2CA43FMNZGK5BB
${BACKUP_CODE}        RBTA-AAAA
${FIRST_DIGIT}        xpath=//input[@aria-label="หลักที่ 1"]
${LAST_STEP}          ${0}


*** Test Cases ***
TC_2FA_UI_001 รหัสผ่านถูกแล้วระบบถามรหัส 6 หลัก และรหัสผิดถูกปฏิเสธ
    [Documentation]    Scenario: พนักงานที่เปิด 2FA กรอกรหัสผ่านถูก แล้วพิมพ์รหัสจากแอปผิด
    ...    Pre: robot_twofa เปิด 2FA แล้ว · ยังไม่ได้เข้าสู่ระบบ
    ...    Steps: 1. กรอกชื่อผู้ใช้/รหัสผ่าน แล้วกดเข้าสู่ระบบ | 2. พิมพ์รหัส 6 หลักที่ผิด
    ...    Data: robot_twofa / Robot-TwoFaStaff-2026! · รหัส = รหัสจริงที่เปลี่ยนหลักสุดท้าย
    ...    Expected: ขึ้นขั้น "ยืนยันตัวตน 2 ชั้น" (ยังไม่เข้าระบบ) · รหัสผิดได้ "รหัสยืนยันไม่ถูกต้อง" และยังอยู่หน้าเข้าสู่ระบบ
    [Tags]    priority:High    security
    Password Step
    ${code}=    Totp    ${TWOFA_SECRET}
    ${wrong}=    Evaluate    $code[:5] + str((int($code[5]) + 1) % 10)
    Input Text    ${FIRST_DIGIT}    ${wrong}
    Wait Until Page Contains    รหัสยืนยันไม่ถูกต้อง    15s
    Location Should Contain    /login
    Record Actual    ขึ้นขั้น "ยืนยันตัวตน 2 ชั้น" · รหัสผิดได้ "รหัสยืนยันไม่ถูกต้อง" ยังไม่เข้าระบบ

TC_2FA_UI_002 เข้าสู่ระบบด้วยรหัส 6 หลักจากแอปได้
    [Documentation]    Scenario: พนักงานเปิดแอป Authenticator แล้วพิมพ์รหัสที่ขึ้นตอนนั้น
    ...    Pre: robot_twofa เปิด 2FA แล้ว
    ...    Steps: 1. กรอกชื่อผู้ใช้/รหัสผ่าน | 2. พิมพ์รหัส 6 หลักปัจจุบัน (กรอกครบแล้วส่งเอง)
    ...    Data: รหัสจาก secret ของ robot_twofa
    ...    Expected: ขึ้น "ยืนยันสำเร็จ" แล้วเข้าแดชบอร์ด "ยินดีต้อนรับ โรบอท สองชั้น"
    [Tags]    priority:High
    Password Step
    Type Fresh Totp
    Wait Until Page Contains    ยินดีต้อนรับ ${TWOFA_FULLNAME}    20s
    Record Actual    รหัสจากแอปถูกต้อง เข้าแดชบอร์ดในชื่อ ${TWOFA_FULLNAME}

TC_2FA_UI_003 เข้าสู่ระบบด้วยรหัสสำรองได้เมื่อไม่มีแอปอยู่กับตัว
    [Documentation]    Scenario: พนักงานลืมมือถือไว้ที่บ้าน จึงใช้รหัสสำรองที่จดไว้ตอนเปิด 2FA
    ...    Pre: robot_twofa มีรหัสสำรองที่ยังไม่ใช้
    ...    Steps: 1. กรอกชื่อผู้ใช้/รหัสผ่าน | 2. กด "ใช้รหัสสำรองแทน" | 3. พิมพ์รหัสสำรอง แล้วกด "ยืนยัน"
    ...    Data: รหัสสำรอง RBTA-AAAA
    ...    Expected: เข้าแดชบอร์ดได้
    [Tags]    priority:High
    Password Step
    Click Element    xpath=//button[contains(., "ใช้รหัสสำรองแทน")]
    Wait Until Element Is Visible    id=backupCode
    Input Text    id=backupCode    ${BACKUP_CODE}
    Click Button    xpath=//form//button[@type="submit"][contains(., "ยืนยัน")]
    Wait Until Page Contains    ยินดีต้อนรับ ${TWOFA_FULLNAME}    20s
    Record Actual    ใช้รหัสสำรอง ${BACKUP_CODE} เข้าแดชบอร์ดได้

TC_2FA_UI_004 รหัสสำรองที่ใช้ไปแล้วใช้ซ้ำไม่ได้
    [Documentation]    Scenario: มีคนเห็นรหัสสำรองที่ใช้ไปแล้ว แล้วลองใช้เข้าระบบอีกครั้ง
    ...    Pre: รหัสสำรอง RBTA-AAAA ถูกใช้แล้ว (TC_2FA_UI_003)
    ...    Steps: 1. กรอกชื่อผู้ใช้/รหัสผ่าน | 2. "ใช้รหัสสำรองแทน" | 3. พิมพ์รหัสสำรองเดิม
    ...    Data: รหัสสำรอง RBTA-AAAA (ใช้แล้ว)
    ...    Expected: ถูกปฏิเสธ "รหัสยืนยันไม่ถูกต้อง" ยังไม่เข้าระบบ
    [Tags]    priority:High    security
    Password Step
    Click Element    xpath=//button[contains(., "ใช้รหัสสำรองแทน")]
    Wait Until Element Is Visible    id=backupCode
    Input Text    id=backupCode    ${BACKUP_CODE}
    Click Button    xpath=//form//button[@type="submit"][contains(., "ยืนยัน")]
    Wait Until Page Contains    รหัสยืนยันไม่ถูกต้อง    15s
    Location Should Contain    /login
    Record Actual    รหัสสำรองที่ใช้แล้วถูกปฏิเสธ "รหัสยืนยันไม่ถูกต้อง"

TC_2FA_UI_005 เปิดหน้าที่ต้องเข้าสู่ระบบแล้วผ่าน 2FA กลับไปหน้าเดิม
    [Documentation]    Scenario: พนักงานกดลิงก์ไปหน้าแฟ้มลูกค้าจากเมล ระบบให้เข้าสู่ระบบก่อน (มี 2FA) แล้วต้องพากลับหน้านั้น
    ...    Pre: ยังไม่ได้เข้าสู่ระบบ
    ...    Steps: 1. เปิด /customers ตรง ๆ | 2. ถูกพาไปหน้าเข้าสู่ระบบ กรอกรหัสผ่าน | 3. พิมพ์รหัส 6 หลัก
    ...    Data: robot_twofa · รหัสจากแอปช่วงเวลาใหม่
    ...    Expected: หลังผ่าน 2FA ไปที่ /customers (ไม่ใช่แดชบอร์ด)
    [Tags]    priority:Medium
    Go To    about:blank
    Go To    ${STAFF_URL}/customers
    Wait Until Location Contains    /login    15s
    Staff Login Page Should Be Open
    Submit Staff Login    ${TWOFA_USER}    ${TWOFA_PASSWORD}
    Wait Until Page Contains    ยืนยันตัวตน 2 ชั้น    15s
    Type Fresh Totp
    Wait Until Location Is    ${STAFF_URL}/customers    20s
    Wait Until Page Contains    แฟ้มลูกค้า    15s
    Record Actual    เปิด /customers → เข้าสู่ระบบ + 2FA แล้วกลับมาที่ /customers


*** Keywords ***
Password Step
    Go To Staff Login
    Submit Staff Login    ${TWOFA_USER}    ${TWOFA_PASSWORD}
    Wait Until Page Contains    ยืนยันตัวตน 2 ชั้น    15s
    Wait Until Element Is Visible    ${FIRST_DIGIT}

Type Fresh Totp
    [Documentation]    รหัสจากช่วง 30 วินาทีที่ยังไม่เคยใช้ — ระบบไม่รับรหัสช่วงเดิมซ้ำ จึงรอช่วงถัดไปถ้าช่วงนี้ใช้ไปแล้ว
    ...                และถ้าช่วงนี้เหลือไม่ถึง 4 วินาที ให้รอช่วงใหม่ก่อน (กันรหัสเปลี่ยนระหว่างพิมพ์)
    FOR    ${i}    IN RANGE    70
        ${step}=    Evaluate    int(time.time()) // 30    modules=time
        ${left}=    Evaluate    30 - int(time.time()) % 30    modules=time
        IF    ${step} > ${LAST_STEP} and ${left} >= 4    BREAK
        Sleep    1s
    END
    ${code}=    Totp    ${TWOFA_SECRET}
    Set Suite Variable    ${LAST_STEP}    ${step}
    Input Text    ${FIRST_DIGIT}    ${code}
