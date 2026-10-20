*** Settings ***
Documentation     หลังบ้าน — การเข้าสู่ระบบของพนักงาน (ชื่อผู้ใช้ + รหัสผ่าน)
Resource          resource.robot
Suite Setup       Open Staff App
Suite Teardown    Close All Browsers
Test Setup        Logout Staff If Logged In
Test Teardown     Capture Evidence
Force Tags        backend    module:Staff Login


*** Test Cases ***
TC_STAFF_LOGIN_001 เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านที่ถูกต้อง
    [Documentation]    Scenario: พนักงานเข้าสู่ระบบด้วยบัญชีที่ถูกต้อง
    ...    Pre: มีบัญชีพนักงาน robot_owner (ไม่เปิด 2FA) · ยังไม่ได้เข้าสู่ระบบ
    ...    Steps: 1. เปิดหน้า /login ฝั่งบริษัท | 2. กรอกชื่อผู้ใช้ | 3. กรอกรหัสผ่าน | 4. กดปุ่มเข้าสู่ระบบ
    ...    Data: Username: robot_owner · Password: Robot-Owner-2026!
    ...    Expected: เข้าหน้าแดชบอร์ด (/) และแสดงข้อความ "ยินดีต้อนรับ โรบอท เจ้าของ"
    [Tags]    priority:High
    Go To Staff Login
    Submit Staff Login    ${STAFF_USER}    ${STAFF_PASSWORD}
    Staff Dashboard Should Be Open
    Record Actual    เข้าหน้าแดชบอร์ด / และแสดง "ยินดีต้อนรับ ${STAFF_FULLNAME}"

TC_STAFF_LOGIN_002 กรอกรหัสผ่านผิด
    [Documentation]    Scenario: ตรวจสอบการเข้าสู่ระบบเมื่อกรอกรหัสผ่านผิด
    ...    Pre: มีบัญชีพนักงาน robot_owner
    ...    Steps: 1. เปิดหน้า /login | 2. กรอกชื่อผู้ใช้ที่ถูกต้อง | 3. กรอกรหัสผ่านผิด | 4. กดเข้าสู่ระบบ
    ...    Data: Username: robot_owner · Password: Wrong-Pass-999!
    ...    Expected: ยังอยู่หน้า /login และแสดง "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
    [Tags]    priority:High
    Go To Staff Login
    Submit Staff Login    ${STAFF_USER}    Wrong-Pass-999!
    Staff Login Should Fail With    ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง
    Record Actual    ยังอยู่หน้า /login และแสดง "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"

TC_STAFF_LOGIN_003 ชื่อผู้ใช้ที่ไม่มีในระบบได้ข้อความเดียวกับรหัสผิด
    [Documentation]    Scenario: ระบบต้องไม่บอกว่าชื่อผู้ใช้นี้มีอยู่จริงหรือไม่ (กันการไล่เดาบัญชี)
    ...    Pre: ไม่มีบัญชีชื่อ no_such_user_robot
    ...    Steps: 1. เปิดหน้า /login | 2. กรอกชื่อผู้ใช้ที่ไม่มีในระบบ | 3. กรอกรหัสผ่านใด ๆ | 4. กดเข้าสู่ระบบ
    ...    Data: Username: no_such_user_robot · Password: Robot-Owner-2026!
    ...    Expected: แสดงข้อความเดียวกับรหัสผิด "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" ไม่ระบุว่าไม่พบบัญชี
    [Tags]    priority:High    security
    Go To Staff Login
    Submit Staff Login    no_such_user_robot    ${STAFF_PASSWORD}
    Staff Login Should Fail With    ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง
    Page Should Not Contain    ไม่พบบัญชี
    Record Actual    แสดง "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" เหมือนกรณีรหัสผิด ไม่บอกว่าไม่มีบัญชีนี้

TC_STAFF_LOGIN_004 ไม่กรอกชื่อผู้ใช้
    [Documentation]    Scenario: ตรวจสอบการเข้าสู่ระบบเมื่อเว้นช่องชื่อผู้ใช้ว่าง
    ...    Pre: อยู่หน้า /login
    ...    Steps: 1. เปิดหน้า /login | 2. เว้นชื่อผู้ใช้ว่าง | 3. กรอกรหัสผ่าน | 4. กดเข้าสู่ระบบ
    ...    Data: Username: (ว่าง) · Password: Robot-Owner-2026!
    ...    Expected: ฟอร์มไม่ถูกส่ง ยังอยู่หน้า /login และช่องชื่อผู้ใช้ถูกระบุว่าต้องกรอก
    [Tags]    priority:Medium
    Go To Staff Login
    Submit Staff Login    ${EMPTY}    ${STAFF_PASSWORD}
    ${missing}=    Execute JavaScript    return document.getElementById("username").validity.valueMissing
    Should Be True    ${missing}
    Location Should Contain    /login
    Record Actual    ฟอร์มไม่ถูกส่ง ช่องชื่อผู้ใช้ขึ้นว่าต้องกรอก (valueMissing) ยังอยู่หน้า /login

TC_STAFF_LOGIN_005 ไม่กรอกรหัสผ่าน
    [Documentation]    Scenario: ตรวจสอบการเข้าสู่ระบบเมื่อเว้นช่องรหัสผ่านว่าง
    ...    Pre: อยู่หน้า /login
    ...    Steps: 1. เปิดหน้า /login | 2. กรอกชื่อผู้ใช้ | 3. เว้นรหัสผ่านว่าง | 4. กดเข้าสู่ระบบ
    ...    Data: Username: robot_owner · Password: (ว่าง)
    ...    Expected: ฟอร์มไม่ถูกส่ง ยังอยู่หน้า /login และช่องรหัสผ่านถูกระบุว่าต้องกรอก
    [Tags]    priority:Medium
    Go To Staff Login
    Submit Staff Login    ${STAFF_USER}    ${EMPTY}
    ${missing}=    Execute JavaScript    return document.getElementById("password").validity.valueMissing
    Should Be True    ${missing}
    Location Should Contain    /login
    Record Actual    ฟอร์มไม่ถูกส่ง ช่องรหัสผ่านขึ้นว่าต้องกรอก (valueMissing) ยังอยู่หน้า /login

TC_STAFF_LOGIN_006 ปุ่มแสดง/ซ่อนรหัสผ่าน
    [Documentation]    Scenario: กดปุ่มรูปตาเพื่อดูรหัสผ่านที่พิมพ์ แล้วกดซ้ำเพื่อซ่อน
    ...    Pre: อยู่หน้า /login
    ...    Steps: 1. กรอกรหัสผ่าน | 2. กดปุ่มแสดงรหัสผ่าน | 3. กดปุ่มซ่อนรหัสผ่าน
    ...    Data: Password: Robot-Owner-2026!
    ...    Expected: กดครั้งแรกช่องเป็นตัวอักษรปกติ (type=text) กดครั้งที่สองกลับเป็นจุดซ่อน (type=password)
    [Tags]    priority:Low
    Go To Staff Login
    Input Password    id=password    ${STAFF_PASSWORD}
    Click Button    xpath=//button[@aria-label="แสดงรหัสผ่าน"]
    Element Attribute Value Should Be    id=password    type    text
    Click Button    xpath=//button[@aria-label="ซ่อนรหัสผ่าน"]
    Element Attribute Value Should Be    id=password    type    password
    Record Actual    แสดงรหัสผ่านเป็น type=text แล้วซ่อนกลับเป็น type=password ได้

TC_STAFF_LOGIN_007 กรอกรหัสผ่านผิด 5 ครั้งติดกันบัญชีถูกล็อก
    [Documentation]    Scenario: ป้องกันการเดารหัสผ่าน — ผิดครบ 5 ครั้งบัญชีถูกล็อกชั่วคราว 15 นาที แม้ครั้งถัดไปกรอกรหัสถูก
    ...    Pre: มีบัญชีพนักงาน robot_lock ที่ยังไม่เคยกรอกผิด (seed รีเซ็ตทุกรอบ)
    ...    Steps: 1. เปิดหน้า /login | 2. กรอกรหัสผ่านผิด 5 ครั้งติดกัน | 3. ครั้งที่ 6 กรอกรหัสผ่านที่ถูกต้อง
    ...    Data: Username: robot_lock · Password ผิด: Wrong-Pass-1! .. Wrong-Pass-5! · Password ถูก: Robot-Lock-2026!
    ...    Expected: ครั้งที่ 6 เข้าไม่ได้ แสดง "บัญชีถูกล็อกชั่วคราว…" พร้อมตัวนับถอยหลัง และปุ่มเข้าสู่ระบบกดไม่ได้
    [Tags]    priority:High    security
    Go To Staff Login
    FOR    ${i}    IN RANGE    1    6
        Submit Staff Login    ${LOCK_USER}    Wrong-Pass-${i}!
        Wait Until Page Contains    ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง
        Wait Until Element Is Enabled    ${LOGIN_BUTTON}
    END
    Submit Staff Login    ${LOCK_USER}    ${LOCK_PASSWORD}
    Wait Until Page Contains    บัญชีถูกล็อกชั่วคราว
    Element Should Contain    xpath=//form//button[@type="submit"]    ลองใหม่ได้ในอีก
    Element Should Be Disabled    xpath=//form//button[@type="submit"]
    Location Should Contain    /login
    Record Actual    ผิด 5 ครั้งได้ข้อความรหัสผิดทุกครั้ง ครั้งที่ 6 (รหัสถูก) เข้าไม่ได้ แสดง "บัญชีถูกล็อกชั่วคราว…" นับถอยหลัง และปุ่มกดไม่ได้

TC_STAFF_LOGIN_008 ออกจากระบบ
    [Documentation]    Scenario: พนักงานออกจากระบบแล้วเปิดหน้าภายในไม่ได้อีก
    ...    Pre: เข้าสู่ระบบด้วย robot_owner แล้ว
    ...    Steps: 1. เข้าสู่ระบบ | 2. กดปุ่มออกจากระบบ (มุมขวาบน) | 3. เปิดหน้า /projects ตรง ๆ
    ...    Data: Username: robot_owner · Password: Robot-Owner-2026!
    ...    Expected: กลับไปหน้า /login และเปิด /projects แล้วถูกพากลับมาหน้า /login
    [Tags]    priority:High
    Login As Staff Owner
    Click Button    ${LOGOUT_BUTTON}
    ${confirm}=    Run Keyword And Return Status    Wait Until Element Is Visible    xpath=//div[@role="dialog" or @role="alertdialog"]//button[contains(., "ออกจากระบบ")]    3s
    IF    ${confirm}    Click Button    xpath=//div[@role="dialog" or @role="alertdialog"]//button[contains(., "ออกจากระบบ")]
    Staff Login Page Should Be Open
    Go To    ${STAFF_URL}/projects
    Staff Login Page Should Be Open
    Location Should Contain    /login
    Record Actual    กลับหน้า /login และเปิด /projects แล้วถูกพากลับไปหน้า /login
