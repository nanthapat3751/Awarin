*** Settings ***
Documentation     หลังบ้าน — คำขอจากหน้าเว็บ → โครงการ (UI-GAP-04 ส่วนที่ 2)
...
...               ใช้คำขอที่ frontend/08_contact_request.robot ส่งไว้ (ชื่อ "คำขอ โรบอท <รอบเป็นตัวอักษร>") — test-env.mjs รันฝั่งหน้าบ้านก่อนเสมอ
...               ถ้าไม่มีคำขอนั้น (เคสหน้าบ้านไม่ผ่าน) เคสในไฟล์นี้ถูกข้าม (Block)
Resource          resource.robot
Variables         ${CURDIR}/../results/ui-data.json
Suite Setup       Run Keywords    Open Staff App    AND    Login As Staff Owner
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        backend    module:Lead To Project


*** Variables ***
${LEAD_SEARCH}        xpath=//main//input[@type="search"]


*** Test Cases ***
TC_LEAD_STAFF_001 พนักงานเห็นคำขอที่ลูกค้าส่งจากหน้าเว็บในหน้าคำขอลูกค้า
    [Documentation]    Scenario: มีคนส่งฟอร์มติดต่อจากหน้าเว็บ พนักงานเปิดเมนู "คำขอลูกค้า" เพื่อโทรกลับ
    ...    Pre: TC_LEAD_001 ส่งคำขอแล้ว · เข้าสู่ระบบ robot_owner
    ...    Steps: 1. เปิด /leads | 2. ค้นหาชื่อผู้ส่ง
    ...    Data: คำค้น: คำขอ โรบอท <รอบเป็นตัวอักษร>
    ...    Expected: เห็นแถวคำขอพร้อมเบอร์ 0811112222 สถานะ "ใหม่" ป้าย "ถามพื้นที่ตอนโทรกลับ" ไม่ขึ้น (ลูกค้าเลือกช่วงพื้นที่แล้ว) และมีปุ่ม "สร้างโครงการ"
    [Tags]    priority:High
    Find Lead Row
    Element Should Contain    xpath=${LEAD_ROW}    0811112222
    ${status}=    Get Selected List Label    xpath=${LEAD_ROW}//select
    Should Be Equal    ${status}    ใหม่
    Page Should Contain Element    xpath=${LEAD_ROW}//button[normalize-space(.)="สร้างโครงการ"]
    Record Actual    เห็นคำขอ "${LEAD_NAME}" เบอร์ 0811112222 สถานะ "${status}" พร้อมปุ่ม "สร้างโครงการ"

TC_LEAD_STAFF_002 สร้างโครงการจากคำขอแล้วข้อมูลที่ลูกค้ากรอกตามไปที่โครงการ
    [Documentation]    Scenario: พนักงานโทรคุยแล้ว กด "สร้างโครงการ" จากคำขอเพื่อเริ่มทำ BOQ
    ...    Pre: มีคำขอจาก TC_LEAD_STAFF_001 ที่ยังไม่เป็นโครงการ
    ...    Steps: 1. กด "สร้างโครงการ" ที่แถวคำขอ | 2. กด "ไปที่โครงการ" | 3. ดูหน้าโครงการ
    ...    Data: (คำขอจาก TC_LEAD_001: ที่ตั้ง "ที่ดินทดสอบโรบอท <รอบ>")
    ...    Expected: ปุ่มในแถวเปลี่ยนเป็น "ไปที่โครงการ" · โครงการใหม่สถานะ "ร่าง" มีที่ตั้งตามที่ลูกค้ากรอก และบอกว่ามาจากคำขอนี้
    [Tags]    priority:High
    Find Lead Row
    Click Button    xpath=${LEAD_ROW}//button[normalize-space(.)="สร้างโครงการ"]
    Wait Until Page Contains Element    xpath=${LEAD_ROW}//a[normalize-space(.)="ไปที่โครงการ"]    15s
    Click Element    xpath=${LEAD_ROW}//a[normalize-space(.)="ไปที่โครงการ"]
    Wait Until Location Contains    /projects/    15s
    Wait Until Page Contains    ที่ดินทดสอบโรบอท ${SALES_RUN}    15s
    Element Should Contain    xpath=//main    ร่าง
    ${linked}=    Run Keyword And Return Status    Page Should Not Contain Element    xpath=//main//button[normalize-space(.)="ผูกกับคำขอ"]
    Should Be True    ${linked}    msg=โครงการที่สร้างจากคำขอยังมีปุ่ม "ผูกกับคำขอ" (ไม่ได้ผูกกับคำขอให้)
    ${url}=    Get Location
    Record Actual    สร้างโครงการจากคำขอได้ (${url.split("/projects/")[1]}) สถานะร่าง ที่ตั้ง "ที่ดินทดสอบโรบอท ${SALES_RUN}" และผูกกับคำขอแล้ว


*** Keywords ***
Find Lead Row
    ${name}=    Evaluate    "คำขอ โรบอท " + "".join("กขคงจฉชซฌญ"[int(c)] for c in $SALES_RUN)
    Set Test Variable    ${LEAD_NAME}    ${name}
    Go To    ${STAFF_URL}/leads
    Wait Until Element Is Visible    ${LEAD_SEARCH}    15s
    Input Text    ${LEAD_SEARCH}    ${LEAD_NAME}
    ${found}=    Run Keyword And Return Status    Wait Until Page Contains Element    xpath=//main//tr[contains(., "${LEAD_NAME}")]    10s
    Skip If    not ${found}    ข้าม: ไม่พบคำขอ "${LEAD_NAME}" (TC_LEAD_001 ฝั่งหน้าบ้านต้องผ่านก่อน)
    Set Test Variable    ${LEAD_ROW}    //main//tr[contains(., "${LEAD_NAME}")]
