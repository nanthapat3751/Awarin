*** Settings ***
Documentation     หลังบ้าน — พนักงานลืมรหัสผ่าน (UI-GAP-07 ฝั่งพนักงาน): ขอลิงก์ด้วยชื่อผู้ใช้ → ลิงก์ในเมล → ตั้งรหัสใหม่
...
...               บัญชี robot_forgot (ADMIN) มีอีเมลกู้รหัสผ่านที่ยืนยันแล้ว robot.staff.forgot@example.test
...               seed ตั้งรหัสเดิมคืนและล้างลิงก์ค้างทุกรอบ · เมลอ่านจาก log ของ API ชุดทดสอบ (ไม่ส่งจริง)
Resource          resource.robot
Suite Setup       Open Staff App
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        backend    module:Staff Forgot Password


*** Variables ***
${FORGOT_USER}        robot_forgot
${FORGOT_MAIL}        robot.staff.forgot@example.test
${FORGOT_FULLNAME}    โรบอท ลืมรหัส
${NEW_PASSWORD}       Harbor-Light-2569!
${SUBMIT}             xpath=//form//button[@type="submit"]


*** Test Cases ***
TC_FORGOT_S_001 ขอลิงก์ตั้งรหัสผ่านใหม่ด้วยชื่อผู้ใช้แล้วได้เมลที่อีเมลกู้รหัส
    [Documentation]    Scenario: พนักงานจำรหัสไม่ได้ กด "ลืมรหัสผ่าน?" แล้วกรอกชื่อผู้ใช้
    ...    Pre: robot_forgot มีอีเมลกู้รหัสผ่านที่ยืนยันแล้ว
    ...    Steps: 1. หน้าเข้าสู่ระบบ กด "ลืมรหัสผ่าน?" | 2. กรอกชื่อผู้ใช้ | 3. กด "ส่งลิงก์ตั้งรหัสผ่านใหม่"
    ...    Data: ชื่อผู้ใช้ robot_forgot
    ...    Expected: ขึ้น "ตรวจอีเมลของคุณ" · มีเมลถึง robot.staff.forgot@example.test พร้อมลิงก์ /reset-password/…
    [Tags]    priority:High
    ${before}=    Mail Count To    ${FORGOT_MAIL}
    Go To Staff Login
    Click Link    xpath=//a[contains(., "ลืมรหัสผ่าน")]
    Wait Until Element Is Visible    id=forgot-username    15s
    Input Text    id=forgot-username    ${FORGOT_USER}
    Click Button    ${SUBMIT}
    Wait Until Page Contains    ตรวจอีเมลของคุณ    15s
    ${mail}=    Wait For Mail To    ${FORGOT_MAIL}    after_count=${before}
    ${link}=    Link In    ${mail}[text]    /reset-password/
    Set Suite Variable    ${RESET_LINK}    ${link}
    Record Actual    ขึ้น "ตรวจอีเมลของคุณ" · ได้เมล "${mail}[subject]" ที่ ${FORGOT_MAIL} พร้อมลิงก์ตั้งรหัสผ่านใหม่

TC_FORGOT_S_002 เปิดลิงก์จากเมลแล้วตั้งรหัสใหม่ จากนั้นเข้าสู่ระบบด้วยรหัสใหม่ได้
    [Documentation]    Scenario: พนักงานกดลิงก์ในเมล ตั้งรหัสผ่านใหม่ แล้วเข้าสู่ระบบ
    ...    Pre: มีลิงก์จาก TC_FORGOT_S_001
    ...    Steps: 1. เปิดลิงก์ | 2. กรอกรหัสผ่านใหม่สองช่อง แล้วกดบันทึก | 3. เข้าสู่ระบบด้วยรหัสใหม่
    ...    Data: รหัสผ่านใหม่ Harbor-Light-2569!
    ...    Expected: ขึ้น "ตั้งรหัสผ่านใหม่แล้ว" · เข้าสู่ระบบด้วยรหัสใหม่ได้ เห็น "ยินดีต้อนรับ โรบอท ลืมรหัส"
    [Tags]    priority:High
    Variable Should Exist    ${RESET_LINK}    msg=ไม่มีลิงก์จาก TC_FORGOT_S_001
    Go To    ${RESET_LINK}
    Wait Until Element Is Visible    id=new-password    15s
    Wait Until Keyword Succeeds    30s    1s    Set New Staff Password
    Go To Staff Login
    Submit Staff Login    ${FORGOT_USER}    ${NEW_PASSWORD}
    Wait Until Page Contains    ยินดีต้อนรับ ${FORGOT_FULLNAME}    15s
    Record Actual    ตั้งรหัสผ่านใหม่ได้ ("ตั้งรหัสผ่านใหม่แล้ว") แล้วเข้าสู่ระบบด้วยรหัสใหม่ได้
    [Teardown]    Run Keywords    Capture Evidence    AND    Delete All Cookies

TC_FORGOT_S_003 ลิงก์ตั้งรหัสผ่านที่ใช้แล้วเปิดซ้ำไม่ได้
    [Documentation]    Scenario: มีคนเปิดเมลเก่าแล้วกดลิงก์ตั้งรหัสผ่านอีกครั้ง
    ...    Pre: ลิงก์ถูกใช้ตั้งรหัสแล้ว (TC_FORGOT_S_002)
    ...    Steps: 1. เปิดลิงก์เดิม
    ...    Data: ลิงก์จาก TC_FORGOT_S_001
    ...    Expected: ขึ้น "ลิงก์ใช้ไม่ได้" ไม่มีช่องให้ตั้งรหัสผ่าน
    [Tags]    priority:High    security
    Variable Should Exist    ${RESET_LINK}    msg=ไม่มีลิงก์จาก TC_FORGOT_S_001
    Go To    ${RESET_LINK}
    Wait Until Page Contains    ลิงก์ใช้ไม่ได้    15s
    Page Should Not Contain Element    id=new-password
    Record Actual    ลิงก์เดิมขึ้น "ลิงก์ใช้ไม่ได้" ไม่มีช่องตั้งรหัสผ่าน


*** Keywords ***
Set New Staff Password
    [Documentation]    หน้าตรวจลิงก์ก่อนแล้ววาดฟอร์ม — พิมพ์ รอให้นิ่ง ตรวจค่า แล้วกดบันทึก
    Input Password    id=new-password    ${NEW_PASSWORD}
    Input Password    id=confirm-password    ${NEW_PASSWORD}
    Sleep    1s
    ${a}=    Get Value    id=new-password
    ${b}=    Get Value    id=confirm-password
    Should Be True    $a == $NEW_PASSWORD and $b == $NEW_PASSWORD    msg=ช่องรหัสผ่านใหม่ยังว่าง (หน้ากำลังวาดใหม่)
    Click Button    ${SUBMIT}
    Wait Until Page Contains    ตั้งรหัสผ่านใหม่แล้ว    8s
