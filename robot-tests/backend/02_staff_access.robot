*** Settings ***
Documentation     หลังบ้าน — สิทธิ์การเข้าถึงหน้าภายใน และหน้าที่ไม่มีอยู่
Resource          resource.robot
Suite Setup       Open Staff App
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        backend    module:Staff Access Control


*** Test Cases ***
TC_STAFF_ACCESS_001 ยังไม่เข้าสู่ระบบเปิดหน้าภายในไม่ได้
    [Documentation]    Scenario: คนที่ยังไม่เข้าสู่ระบบพิมพ์ที่อยู่หน้าภายในตรง ๆ
    ...    Pre: ยังไม่ได้เข้าสู่ระบบ (ไม่มีคุกกี้)
    ...    Steps: 1. ล้างคุกกี้ | 2. เปิด /projects | 3. เปิด /customers | 4. เปิด /settings
    ...    Data: URL: /projects, /customers, /settings
    ...    Expected: ทุกหน้าถูกพาไปหน้า /login และไม่เห็นข้อมูลภายใน
    [Tags]    priority:High    security
    Delete All Cookies
    FOR    ${path}    IN    /projects    /customers    /settings
        Go To    ${STAFF_URL}${path}
        Staff Login Page Should Be Open
        Location Should Contain    /login
    END
    Record Actual    ทั้ง /projects /customers /settings ถูกพาไปหน้า /login

TC_STAFF_ACCESS_002 บัญชีลูกค้าเข้าระบบหลังบ้านไม่ได้
    [Documentation]    Scenario: ลูกค้านำอีเมลและรหัสผ่านของพอร์ทัลลูกค้ามาเข้าระบบฝั่งบริษัท
    ...    Pre: มีบัญชีลูกค้า robot.customer@example.test ที่ยืนยันอีเมลแล้ว
    ...    Steps: 1. เปิดหน้า /login ฝั่งบริษัท | 2. กรอกอีเมลลูกค้าในช่องชื่อผู้ใช้ | 3. กรอกรหัสผ่านลูกค้า | 4. กดเข้าสู่ระบบ
    ...    Data: Username: robot.customer@example.test · Password: Robot-Cust-2026!
    ...    Expected: เข้าไม่ได้ แสดง "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
    [Tags]    priority:High    security
    Delete All Cookies
    Go To Staff Login
    Submit Staff Login    ${CUSTOMER_EMAIL}    ${CUSTOMER_PASSWORD}
    Staff Login Should Fail With    ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง
    Record Actual    เข้าไม่ได้ แสดง "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"

TC_STAFF_ACCESS_003 เปิดที่อยู่ที่ไม่มีในระบบ
    [Documentation]    Scenario: พนักงานพิมพ์ที่อยู่ผิดหรือเปิดลิงก์เก่าที่ไม่มีแล้ว
    ...    Pre: เข้าสู่ระบบด้วย robot_owner แล้ว
    ...    Steps: 1. เข้าสู่ระบบ | 2. เปิด /no-such-page-robot
    ...    Data: URL: /no-such-page-robot
    ...    Expected: แสดงหน้า "ไม่พบหน้านี้" ภายในกรอบระบบ ไม่ใช่จอขาว
    [Tags]    priority:Low
    Login As Staff Owner
    Go To    ${STAFF_URL}/no-such-page-robot
    Wait Until Page Contains    ไม่พบหน้านี้
    Page Should Contain Element    xpath=//a[@href="/projects"]
    Record Actual    แสดงหน้า "ไม่พบหน้านี้" พร้อมเมนูด้านข้างของระบบ

TC_STAFF_ACCESS_004 เข้าสู่ระบบแล้วกลับไปหน้าที่ตั้งใจเปิด
    [Documentation]    Scenario: พนักงานเปิดลิงก์หน้าภายใน (เช่น รายการโครงการที่กรองไว้) ตอนยังไม่ได้เข้าสู่ระบบ
    ...    Pre: ยังไม่ได้เข้าสู่ระบบ (ไม่มีคุกกี้) · มีบัญชีพนักงาน robot_owner
    ...    Steps: 1. เปิด /projects?status=DRAFT | 2. ถูกพาไปหน้า /login | 3. เข้าสู่ระบบ
    ...    Data: URL: /projects?status=DRAFT · Username: robot_owner · Password: Robot-Owner-2026!
    ...    Expected: หลังเข้าสู่ระบบ กลับไปที่ /projects?status=DRAFT (ทั้งหน้าและตัวกรอง) ไม่ใช่แดชบอร์ด
    [Tags]    priority:Medium
    Delete All Cookies
    Go To    about:blank
    Go To    ${STAFF_URL}/projects?status=DRAFT
    Staff Login Page Should Be Open
    Location Should Contain    /login
    Submit Staff Login    ${STAFF_USER}    ${STAFF_PASSWORD}
    Wait Until Element Is Visible    xpath=//input[starts-with(@placeholder, "ค้นหาจากชื่อโครงการ")]    15s
    Sleep    1s
    ${path}=    Execute JavaScript    return location.pathname + location.search
    Should Be Equal    ${path}    /projects?status=DRAFT
    ...    msg=หลังเข้าสู่ระบบถูกพาไป "${path}" แทน /projects?status=DRAFT
    Record Actual    กลับไปที่ /projects?status=DRAFT (หน้าโครงการพร้อมตัวกรองเดิม)
