*** Settings ***
Documentation     หลังบ้านบน iPad (UI-GAP-12 ฝั่งพนักงาน): จอแคบกว่า 1280 px เมนูซ้ายเป็นรางไอคอน · กดขยายแล้วเมนูเต็มกางทับ
...
...               จำลองขนาดจอ iPad แนวตั้ง 1024 × 1366 (เบราว์เซอร์ Chrome ขนาดเท่ากัน) — ตรวจว่าเมนูใช้ได้และหน้าหลักไม่ล้นจอ
Resource          resource.robot
Variables         ${CURDIR}/../results/payment-data.json
Suite Setup       Prepare Ipad Suite
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        backend    module:iPad Layout


*** Variables ***
${NAV_LINKS}          //aside//nav//a


*** Test Cases ***
TC_IPAD_001 เมนูซ้ายบน iPad เป็นรางไอคอนที่มีชื่อเมนูทุกอัน
    [Documentation]    Scenario: พนักงานเปิดหลังบ้านบน iPad แนวตั้ง
    ...    Pre: จอ 1024 × 1366 · เข้าสู่ระบบ robot_owner
    ...    Steps: 1. เปิดแดชบอร์ด | 2. ดูเมนูซ้าย
    ...    Data: (ไม่มี)
    ...    Expected: เมนูเป็นรางแคบ (ไม่เกิน 80 px) แสดงเฉพาะไอคอน · ทุกไอคอนมีชื่อเมนู (title) ให้ชี้/โปรแกรมอ่านหน้าจอ · มีปุ่ม "ขยายเมนู"
    [Tags]    priority:Medium
    Go To    ${STAFF_URL}/
    Wait Until Page Contains Element    xpath=//button[@aria-label="ขยายเมนู"]    15s
    ${width}=    Execute Javascript    return Math.round(document.querySelector('aside').getBoundingClientRect().width)
    Should Be True    ${width} <= 80    msg=เมนูซ้ายกว้าง ${width} px (ควรเป็นรางไอคอน)
    ${links}=    Get WebElements    xpath=${NAV_LINKS}
    @{untitled}=    Create List
    FOR    ${a}    IN    @{links}
        ${title}=    Get Element Attribute    ${a}    title
        ${href}=    Get Element Attribute    ${a}    href
        IF    not $title    Append To List    ${untitled}    ${href}
    END
    Should Be Empty    ${untitled}    msg=ไอคอนที่ไม่มีชื่อเมนู: ${untitled}
    ${n}=    Get Length    ${links}
    Record Actual    รางเมนูกว้าง ${width} px มี ${n} ไอคอน ทุกอันมีชื่อเมนู (title) · มีปุ่ม "ขยายเมนู"

TC_IPAD_002 กดขยายเมนูแล้วเมนูเต็มกางทับ และปิดด้วย Esc ได้
    [Documentation]    Scenario: พนักงานจำไอคอนไม่ได้ จึงกดขยายเมนูเพื่อดูชื่อ
    ...    Pre: จอ 1024 px
    ...    Steps: 1. กด "ขยายเมนู" | 2. ดูชื่อเมนู | 3. กด Esc
    ...    Data: (ไม่มี)
    ...    Expected: เมนูเต็มกางทับเนื้อหา (เนื้อหาไม่ถูกดันให้แคบลง) เห็นชื่อ "โครงการ" "แฟ้มลูกค้า" · Esc แล้วกลับเป็นรางไอคอน
    [Tags]    priority:Medium
    Go To    ${STAFF_URL}/
    Wait Until Page Contains Element    xpath=//button[@aria-label="ขยายเมนู"]    15s
    ${main_before}=    Execute Javascript    return Math.round(document.querySelector('main').getBoundingClientRect().left)
    Click Button    xpath=//button[@aria-label="ขยายเมนู"]
    Wait Until Element Is Visible    xpath=${NAV_LINKS}\[normalize-space(.)="โครงการ"]
    Element Should Be Visible    xpath=${NAV_LINKS}\[normalize-space(.)="แฟ้มลูกค้า"]
    ${main_after}=    Execute Javascript    return Math.round(document.querySelector('main').getBoundingClientRect().left)
    Should Be Equal As Integers    ${main_before}    ${main_after}    msg=กางเมนูแล้วเนื้อหาถูกดัน (${main_before} → ${main_after} px)
    Press Keys    None    ESCAPE
    Wait Until Element Is Not Visible    xpath=${NAV_LINKS}\[normalize-space(.)="โครงการ"]
    Record Actual    กดขยายแล้วเห็นชื่อเมนู กางทับเนื้อหา (เนื้อหาไม่ขยับ ${main_before} px) · Esc แล้วกลับเป็นรางไอคอน

TC_IPAD_003 หน้าหลักของพนักงานบน iPad ไม่ล้นจอ
    [Documentation]    Scenario: พนักงานใช้ iPad เปิดหน้ารายการโครงการ แฟ้มลูกค้า และหน้าสัญญา
    ...    Pre: จอ 1024 px
    ...    Steps: 1. เปิดทีละหน้า | 2. วัดความกว้างของหน้า
    ...    Data: /projects · /customers · /leads · /projects/{โครงการชำระเงิน}?tab=contract · /trash
    ...    Expected: ทุกหน้าไม่มีแถบเลื่อนแนวนอนทั้งหน้า (ตารางกว้างเลื่อนในกรอบของตัวเองได้)
    [Tags]    priority:Medium
    @{wide}=    Create List
    @{pages}=    Create List    /projects    /customers    /leads    /projects/${PAY_PROJECT_ID}?tab=contract    /trash
    FOR    ${path}    IN    @{pages}
        Go To    ${STAFF_URL}${path}
        Wait Until Page Contains Element    xpath=//main//h1 | //main//table | //main//button    15s
        Sleep    1.5s
        ${w}=    Execute Javascript    return [document.documentElement.scrollWidth, window.innerWidth]
        IF    ${w}[0] > ${w}[1] + 1    Append To List    ${wide}    ${path} กว้าง ${w}[0] px
    END
    Should Be Empty    ${wide}    msg=หน้าที่ล้นจอ: ${wide}
    Record Actual    5 หน้าไม่มีแถบเลื่อนแนวนอนทั้งหน้าที่จอ 1024 px


*** Keywords ***
Prepare Ipad Suite
    Open Browser For Test    ${STAFF_URL}/login    width=1024    height=1366
    Login As Staff Owner
