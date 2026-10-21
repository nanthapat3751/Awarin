*** Settings ***
Documentation     เบราว์เซอร์อื่นนอกจาก Chrome (UI-GAP-15) — Microsoft Edge
...
...               Edge มีในเครื่องทดสอบ (Windows) · Selenium Manager ดาวน์โหลด msedgedriver ของ Microsoft ให้เองครั้งแรก
...               Firefox อยู่นอกขอบเขต (ผู้ใช้ตัดสินใจ 21 ต.ค. — ลูกค้าส่วนใหญ่ใช้ Chrome/Edge/Safari) จึงไม่มีเคสของ Firefox
...               ใช้ไฟล์เดียวทั้งสองฝั่ง (หน้าบ้าน + หลังบ้าน) เพราะเป็นเรื่องความเข้ากันได้ของเบราว์เซอร์ ไม่ใช่ฟีเจอร์
Resource          resource.robot
Resource          ../backend/resource.robot
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        frontend    module:Cross Browser


*** Test Cases ***
TC_XB_001 Edge เปิดหน้าแรกและหน้าบริการได้ครบ
    [Documentation]    Scenario: ลูกค้าที่ใช้ Microsoft Edge เปิดเว็บบริษัท
    ...    Pre: ติดตั้ง Microsoft Edge แล้ว
    ...    Steps: 1. เปิดหน้าแรกด้วย Edge | 2. กดเมนู "บริการ"
    ...    Data: (ไม่มี)
    ...    Expected: หน้าแรกขึ้นเมนูหลักครบ · หน้าบริการขึ้นหัวข้อ "บริการ" และไม่ล้นจอ
    [Tags]    priority:Medium
    Open Browser For Test    ${CLIENT_URL}/    alias=edge    browser=edge
    Wait Until Page Contains Element    xpath=//header//a[@href="/services"]    15s
    Click Element    xpath=//header//a[@href="/services"]
    Wait Until Element Contains    xpath=//h1    บริการ    15s
    No Horizontal Scroll
    ${ver}=    Execute Javascript    return navigator.userAgent.match(/Edg\\/[\\d.]+/)?.[0] || navigator.userAgent
    Record Actual    ${ver}: หน้าแรกและหน้าบริการแสดงครบ ไม่ล้นจอ

TC_XB_002 Edge ลูกค้าเข้าสู่ระบบแล้วเห็นหน้าการชำระเงิน
    [Documentation]    Scenario: ลูกค้าเข้าพอร์ทัลด้วย Edge
    ...    Pre: เปิด Edge จาก TC_XB_001
    ...    Steps: 1. เข้าสู่ระบบ | 2. เปิด /my/payments
    ...    Data: robot.customer@example.test
    ...    Expected: เข้าสู่ระบบได้ · เห็นแท็บ "ต้องชำระ"
    [Tags]    priority:Medium
    Switch Browser    edge
    Login As Customer
    Go To    ${CLIENT_URL}/my/payments
    Wait Until Page Contains Element    xpath=//main//*[@role="tab"][contains(., "ต้องชำระ")]    15s
    Record Actual    เข้าสู่ระบบด้วย Edge ได้ และเห็นหน้าการชำระเงิน
    [Teardown]    Run Keywords    Capture Evidence    AND    Delete All Cookies

TC_XB_003 Edge พนักงานเข้าสู่ระบบหลังบ้านได้
    [Documentation]    Scenario: พนักงานที่ใช้ Edge เข้าหลังบ้าน
    ...    Pre: ติดตั้ง Microsoft Edge แล้ว
    ...    Steps: 1. เปิด /login หลังบ้านด้วย Edge | 2. เข้าสู่ระบบ robot_owner
    ...    Data: robot_owner / Robot-Owner-2026!
    ...    Expected: ไปหน้าแดชบอร์ด "ยินดีต้อนรับ โรบอท เจ้าของ"
    [Tags]    priority:Medium
    Switch Browser    edge
    Login As Staff Owner
    Record Actual    เข้าหลังบ้านด้วย Edge ได้ เห็นแดชบอร์ด
    [Teardown]    Run Keywords    Capture Evidence    AND    Delete All Cookies
