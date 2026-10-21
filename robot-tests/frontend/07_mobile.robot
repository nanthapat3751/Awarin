*** Settings ***
Documentation     หน้าบ้านบนจอมือถือ 390 px (UI-GAP-12 ฝั่งลูกค้า) — ลูกค้าส่วนใหญ่ใช้มือถือ
...
...               จำลองมือถือจอสัมผัส (Chrome mobile emulation: กว้าง 390 สูง 844 · user agent Android) ตรวจว่าไม่มีหน้าไหนล้นจอ
...               (แถบเลื่อนแนวนอน) · เมนูย่อเป็นลิ้นชักที่เปิด/ปิดได้ · พอร์ทัลลูกค้าใช้งานได้
Resource          resource.robot
Suite Setup       Open Browser For Test    ${CLIENT_URL}/    width=390    height=844    mobile=${True}
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        frontend    module:Mobile Layout


*** Variables ***
${MENU_BUTTON}        xpath=//header//button[@aria-label="เปิดเมนู"]
${DRAWER}             xpath=//dialog[@aria-label="เมนู"]


*** Test Cases ***
TC_MOB_001 หน้าแรกบนมือถือไม่ล้นจอและเมนูย่อเป็นปุ่มลิ้นชัก
    [Documentation]    Scenario: ลูกค้าเปิดเว็บจากมือถือครั้งแรก
    ...    Pre: จอมือถือ 390 × 844 · ยังไม่ได้เข้าสู่ระบบ
    ...    Steps: 1. เปิดหน้าแรก | 2. ดูแถบหัวเว็บ | 3. วัดความกว้างเนื้อหาเทียบจอ
    ...    Data: (ไม่มี)
    ...    Expected: เมนูข้อความถูกย่อเป็นปุ่ม "เปิดเมนู" · ไม่มีแถบเลื่อนแนวนอน
    [Tags]    priority:High
    Go To    ${CLIENT_URL}/
    Wait Until Element Is Visible    ${MENU_BUTTON}    15s
    Element Should Not Be Visible    xpath=//header//nav//a[normalize-space(.)="บริการ"]
    ${w}=    No Horizontal Scroll
    Record Actual    มีปุ่ม "เปิดเมนู" แทนเมนูข้อความ · เนื้อหากว้าง ${w}[0] px เท่ากับจอ ${w}[1] px

TC_MOB_002 ลิ้นชักเมนูเปิดได้ กดลิงก์แล้วไปหน้านั้นและลิ้นชักปิดเอง
    [Documentation]    Scenario: ลูกค้ากดปุ่มเมนูแล้วเลือก "ติดต่อเรา"
    ...    Pre: อยู่หน้าแรกบนมือถือ
    ...    Steps: 1. กด "เปิดเมนู" | 2. ดูรายการในลิ้นชัก | 3. กด "ติดต่อเรา"
    ...    Data: (ไม่มี)
    ...    Expected: ลิ้นชัก "เมนู" ขึ้นพร้อมลิงก์ทุกหน้า + "เข้าสู่ระบบ" · กดแล้วไป /contact และลิ้นชักปิด
    [Tags]    priority:High
    Go To    ${CLIENT_URL}/
    Wait Until Element Is Visible    ${MENU_BUTTON}    15s
    Click Button    ${MENU_BUTTON}
    Wait Until Element Is Visible    ${DRAWER}
    FOR    ${label}    IN    หน้าแรก    เกี่ยวกับเรา    บริการ    แบบบ้าน    ผลงาน    ติดต่อเรา    เข้าสู่ระบบ
        Page Should Contain Element    ${DRAWER}//a[normalize-space(.)="${label}"]
    END
    Click Element    ${DRAWER}//a[normalize-space(.)="ติดต่อเรา"]
    Wait Until Location Contains    /contact
    Wait Until Page Does Not Contain Element    ${DRAWER}
    Record Actual    ลิ้นชักมีลิงก์ 6 หน้า + "เข้าสู่ระบบ" · กด "ติดต่อเรา" แล้วไป /contact ลิ้นชักปิดเอง

TC_MOB_003 หน้าสาธารณะทุกหน้าบนมือถือไม่ล้นจอ
    [Documentation]    Scenario: ลูกค้าเลื่อนดูทุกหน้าของเว็บจากมือถือ
    ...    Pre: จอมือถือ 390 px
    ...    Steps: 1. เปิดทีละหน้า | 2. วัดความกว้างเนื้อหา
    ...    Data: / · /about · /services · /house-designs · /portfolio · /contact · /privacy · /login · /register
    ...    Expected: ทุกหน้าไม่มีแถบเลื่อนแนวนอน
    [Tags]    priority:Medium
    @{wide}=    Create List
    @{pages}=    Create List    /    /about    /services    /house-designs    /portfolio    /contact    /privacy    /login    /register
    FOR    ${path}    IN    @{pages}
        Go To    ${CLIENT_URL}${path}
        Wait Until Page Contains Element    xpath=//main    15s
        Sleep    1s    # รูป/อนิเมชันเข้าหน้า
        ${w}=    Execute Javascript    return [document.documentElement.scrollWidth, window.innerWidth]
        IF    ${w}[0] > ${w}[1] + 1    Append To List    ${wide}    ${path} กว้าง ${w}[0] px
    END
    Should Be Empty    ${wide}    msg=หน้าที่ล้นจอ: ${wide}
    Record Actual    ${pages.__len__()} หน้าไม่มีแถบเลื่อนแนวนอนที่จอ 390 px

TC_MOB_004 เข้าสู่ระบบบนมือถือแล้วเปิดหน้าการชำระเงินได้ไม่ล้นจอ
    [Documentation]    Scenario: ลูกค้าเข้าพอร์ทัลจากมือถือเพื่อดูยอดที่ต้องโอน
    ...    Pre: จอมือถือ 390 px · บัญชี robot.customer มีงวดที่วางบิลแล้ว
    ...    Steps: 1. เข้าสู่ระบบ | 2. เปิด /my/payments | 3. วัดความกว้าง
    ...    Data: robot.customer@example.test
    ...    Expected: เข้าสู่ระบบได้ · หน้าการชำระเงินแสดงแท็บ "ต้องชำระ" และไม่ล้นจอ
    [Tags]    priority:Medium
    Login As Customer
    Go To    ${CLIENT_URL}/my/payments
    Wait Until Page Contains Element    xpath=//main//*[@role="tab"][contains(., "ต้องชำระ")]    15s
    ${w}=    No Horizontal Scroll
    Record Actual    เข้าพอร์ทัลได้ · หน้าการชำระเงินกว้าง ${w}[0] px พอดีจอ ${w}[1] px
    [Teardown]    Run Keywords    Capture Evidence    AND    Delete All Cookies
