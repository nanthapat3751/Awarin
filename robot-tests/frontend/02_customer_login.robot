*** Settings ***
Documentation     หน้าบ้าน — การเข้าสู่ระบบของลูกค้า (อีเมล + รหัสผ่าน) และการเข้าถึงพื้นที่ลูกค้า
Resource          resource.robot
Suite Setup       Open Client App
Suite Teardown    Close All Browsers
Test Setup        Delete All Cookies
Test Teardown     Capture Evidence
Force Tags        frontend


*** Test Cases ***
TC_CUS_LOGIN_001 ลูกค้าเข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่ถูกต้อง
    [Documentation]    Scenario: ลูกค้าที่ยืนยันอีเมลแล้วเข้าสู่ระบบ
    ...    Pre: มีบัญชีลูกค้า robot.customer@example.test ที่ยืนยันอีเมลแล้ว · ยังไม่ได้เข้าสู่ระบบ
    ...    Steps: 1. เปิด /login | 2. กรอกอีเมล | 3. กรอกรหัสผ่าน | 4. กดเข้าสู่ระบบ
    ...    Data: Email: robot.customer@example.test · Password: Robot-Cust-2026!
    ...    Expected: เข้าสู่ระบบสำเร็จ แถบด้านบนแสดงปุ่มบัญชีของฉันพร้อมชื่อ "ลูกค้า โรบอท"
    [Tags]    module:Customer Login    priority:High
    Go To Customer Login
    Submit Customer Login    ${CUSTOMER_EMAIL}    ${CUSTOMER_PASSWORD}
    Customer Should Be Logged In
    Record Actual    เข้าสู่ระบบสำเร็จ แถบด้านบนแสดง "บัญชีของฉัน (${CUSTOMER_FULLNAME})"

TC_CUS_LOGIN_002 ลูกค้ากรอกรหัสผ่านผิด
    [Documentation]    Scenario: ตรวจสอบการเข้าสู่ระบบเมื่อกรอกรหัสผ่านผิด
    ...    Pre: มีบัญชีลูกค้า robot.customer@example.test
    ...    Steps: 1. เปิด /login | 2. กรอกอีเมลที่ถูกต้อง | 3. กรอกรหัสผ่านผิด | 4. กดเข้าสู่ระบบ
    ...    Data: Email: robot.customer@example.test · Password: Wrong-Pass-999!
    ...    Expected: ยังอยู่หน้า /login และแสดง "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
    [Tags]    module:Customer Login    priority:High
    Go To Customer Login
    Submit Customer Login    ${CUSTOMER_EMAIL}    Wrong-Pass-999!
    Wait Until Page Contains    อีเมลหรือรหัสผ่านไม่ถูกต้อง
    Location Should Contain    /login
    Record Actual    ยังอยู่หน้า /login และแสดง "อีเมลหรือรหัสผ่านไม่ถูกต้อง"

TC_CUS_LOGIN_003 บัญชีที่ยังไม่ยืนยันอีเมลถูกพาไปหน้ายืนยัน
    [Documentation]    Scenario: ลูกค้าสมัครไว้แต่ยังไม่ยืนยันอีเมล แล้วพยายามเข้าสู่ระบบ
    ...    Pre: มีบัญชี robot.unverified@example.test ที่ยังไม่ยืนยันอีเมล
    ...    Steps: 1. เปิด /login | 2. กรอกอีเมลและรหัสผ่านที่ถูกต้อง | 3. กดเข้าสู่ระบบ
    ...    Data: Email: robot.unverified@example.test · Password: Robot-Unver-2026!
    ...    Expected: เข้าพื้นที่ลูกค้าไม่ได้ ถูกพาไปหน้า /verify-email เพื่อกรอกรหัสยืนยัน
    [Tags]    module:Customer Login    priority:High    security
    Go To Customer Login
    Submit Customer Login    ${UNVERIFIED_EMAIL}    ${UNVERIFIED_PASSWORD}
    Wait Until Location Contains    /verify-email
    Page Should Not Contain Element    ${PROFILE_BUTTON}
    ${url}=    Get Location
    Record Actual    ถูกพาไปหน้า /verify-email และไม่ได้เข้าสู่ระบบ (ที่อยู่หน้าคือ ${url})

TC_CUS_LOGIN_004 กรอกอีเมลผิดรูปแบบ
    [Documentation]    Scenario: ตรวจสอบการเข้าสู่ระบบเมื่อกรอกอีเมลไม่มีโดเมน
    ...    Pre: อยู่หน้า /login
    ...    Steps: 1. กรอกอีเมลที่ไม่มี @โดเมน | 2. กรอกรหัสผ่าน | 3. กดเข้าสู่ระบบ
    ...    Data: Email: robot.customer · Password: Robot-Cust-2026!
    ...    Expected: ฟอร์มไม่ถูกส่ง ช่องอีเมลถูกระบุว่ารูปแบบไม่ถูกต้อง ยังอยู่หน้า /login
    [Tags]    module:Customer Login    priority:Medium
    Go To Customer Login
    Submit Customer Login    robot.customer    ${CUSTOMER_PASSWORD}
    ${bad}=    Execute JavaScript    return document.getElementById("login-email").validity.typeMismatch
    Should Be True    ${bad}
    Location Should Contain    /login
    Record Actual    ฟอร์มไม่ถูกส่ง ช่องอีเมลขึ้นว่ารูปแบบไม่ถูกต้อง (typeMismatch) ยังอยู่หน้า /login

TC_CUS_LOGIN_005 ลูกค้าออกจากระบบ
    [Documentation]    Scenario: ลูกค้าออกจากระบบจากเมนูรูปโปรไฟล์
    ...    Pre: เข้าสู่ระบบด้วย robot.customer@example.test แล้ว
    ...    Steps: 1. เข้าสู่ระบบ | 2. กดปุ่มบัญชีของฉันมุมขวาบน | 3. กด "ออกจากระบบ" | 4. เปิด /my/quotes
    ...    Data: Email: robot.customer@example.test · Password: Robot-Cust-2026!
    ...    Expected: ปุ่มบัญชีหายไป และเปิด /my/quotes แล้วถูกพาไปหน้า /login
    [Tags]    module:Customer Login    priority:High
    Login As Customer
    Click Button    ${PROFILE_BUTTON}
    Click Element    xpath=//header//*[self::button or self::a or @role="menuitem"][normalize-space(.)="ออกจากระบบ"]
    Wait Until Page Does Not Contain Element    ${PROFILE_BUTTON}
    Go To    ${CLIENT_URL}/my/quotes
    Wait Until Location Contains    /login
    Record Actual    ปุ่มบัญชีหายไป เปิด /my/quotes แล้วถูกพาไป /login

TC_CUS_ACCESS_001 ยังไม่เข้าสู่ระบบเปิดพื้นที่ลูกค้าไม่ได้
    [Documentation]    Scenario: คนที่ยังไม่เข้าสู่ระบบพิมพ์ที่อยู่หน้าพื้นที่ลูกค้าตรง ๆ
    ...    Pre: ยังไม่ได้เข้าสู่ระบบ (ไม่มีคุกกี้)
    ...    Steps: 1. ล้างคุกกี้ | 2. เปิด /my/quotes | 3. เปิด /my/contracts | 4. เปิด /my/account
    ...    Data: URL: /my/quotes, /my/contracts, /my/account
    ...    Expected: ทุกหน้าถูกพาไปหน้า /login
    [Tags]    module:Customer Access Control    priority:High    security
    FOR    ${path}    IN    /my/quotes    /my/contracts    /my/account
        Go To    ${CLIENT_URL}${path}
        Wait Until Location Contains    /login
    END
    Record Actual    ทั้ง /my/quotes /my/contracts /my/account ถูกพาไปหน้า /login

TC_CUS_ACCESS_002 เข้าสู่ระบบแล้วกลับไปหน้าที่ตั้งใจเปิด
    [Documentation]    Scenario: ลูกค้ากดลิงก์ใบเสนอราคาจากอีเมลแจ้งเตือนขณะยังไม่เข้าสู่ระบบ
    ...    Pre: ยังไม่ได้เข้าสู่ระบบ · มีบัญชีลูกค้าที่ยืนยันอีเมลแล้ว
    ...    Steps: 1. เปิด /my/quotes (เหมือนกดลิงก์จากอีเมล) | 2. ถูกพาไปหน้า /login | 3. เข้าสู่ระบบ
    ...    Data: URL: /my/quotes · Email: robot.customer@example.test · Password: Robot-Cust-2026!
    ...    Expected: หลังเข้าสู่ระบบ กลับไปที่ /my/quotes ซึ่งเป็นหน้าที่ลูกค้าตั้งใจเปิด
    [Tags]    module:Customer Access Control    priority:Medium
    Go To    ${CLIENT_URL}/my/quotes
    Wait Until Location Contains    /login
    Wait Until Element Is Visible    id=login-email
    Submit Customer Login    ${CUSTOMER_EMAIL}    ${CUSTOMER_PASSWORD}
    Customer Should Be Logged In
    Sleep    1.5s
    ${path}=    Execute JavaScript    return location.pathname
    Should Be Equal    ${path}    /my/quotes
    ...    msg=หลังเข้าสู่ระบบถูกพาไป "${path}" (หน้าแรก) แทน /my/quotes — ลูกค้าต้องหาใบเสนอราคาเองอีกรอบ
    Record Actual    กลับไปที่ /my/quotes
