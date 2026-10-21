*** Settings ***
Documentation     หน้าบ้าน — ส่งคำขอจากฟอร์มติดต่อ (UI-GAP-04 ส่วนที่ 1): จุดเริ่มของงานทุกงาน
...
...               คำขอที่ส่งจากไฟล์นี้ ฝั่งหลังบ้านเปิดดูและสร้างโครงการต่อใน backend/06_lead_to_project.robot (รันทีหลัง)
...               ฟอร์มมี Cloudflare Turnstile — client-app ใช้ site key ทดสอบของ Cloudflare (ผ่านเสมอ) ถ้าไม่ได้ตั้ง
...               VITE_TURNSTILE_SITE_KEY · API ชุดทดสอบไม่ตั้ง TURNSTILE_SECRET_KEY จึงไม่ตรวจซ้ำฝั่งเซิร์ฟเวอร์
Resource          resource.robot
Variables         ${CURDIR}/../results/ui-data.json
Suite Setup       Open Client App
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        frontend    module:Contact Request


*** Variables ***
${LEAD_PHONE}         0811112222
${SEND}               xpath=//form//button[@type="submit"][contains(., "ส่งคำขอ")]


*** Test Cases ***
TC_LEAD_001 กรอกฟอร์มติดต่อครบแล้วส่งคำขอได้
    [Documentation]    Scenario: ผู้สนใจกรอกฟอร์มติดต่อเพื่อขอใบเสนอราคางานก่อสร้าง
    ...    Pre: ยังไม่ได้เข้าสู่ระบบ
    ...    Steps: 1. เปิด /contact | 2. กรอกชื่อ เบอร์ อีเมล บริการ ที่ตั้ง ช่วงพื้นที่ ข้อความ | 3. รอยืนยันว่าไม่ใช่บอท | 4. กด "ส่งคำขอ"
    ...    Data: ชื่อ คำขอ โรบอท <รอบเป็นตัวอักษร> · เบอร์ 0811112222 · อีเมล lead.<รอบ>@example.test · งานก่อสร้าง · พื้นที่ 100–200 ตร.ม.
    ...    Expected: ขึ้น "ส่งคำขอเรียบร้อยแล้ว"
    [Tags]    priority:High
    # ชื่อต้องเป็นตัวอักษรล้วน (ระบบไม่รับตัวเลขในชื่อ) — แปลงเลขรอบเป็นพยัญชนะ ให้ไม่ซ้ำกันทุกรอบ (backend/06 ใช้สูตรเดียวกัน)
    ${name}=    Evaluate    "คำขอ โรบอท " + "".join("กขคงจฉชซฌญ"[int(c)] for c in $SALES_RUN)
    Delete All Cookies
    Go To    ${CLIENT_URL}/contact
    Show Contact Form
    Input Text    id=name    ${name}
    Input Text    id=phone    ${LEAD_PHONE}
    Input Text    id=email    lead.${SALES_RUN}@example.test
    Select From List By Label    id=serviceType    งานก่อสร้าง
    # ช่องที่ตั้ง/พื้นที่กางออกหลังเลือกบริการ (มีจังหวะเลื่อนลง) — รอให้กางเสร็จก่อนพิมพ์
    Wait Until Element Is Visible    id=siteAddress    10s
    Wait Until Keyword Succeeds    5s    0.5s    Input Text    id=siteAddress    ที่ดินทดสอบโรบอท ${SALES_RUN}
    Click Element    xpath=//input[@name="areaRange"][@value="100_200"]/ancestor::label[1]
    Input Text    id=message    ทดสอบส่งคำขอจากชุดทดสอบอัตโนมัติ รอบ ${SALES_RUN}
    Wait Until Element Is Enabled    ${SEND}    30s    error=ปุ่มส่งยังกดไม่ได้ — วิดเจ็ตยืนยันว่าไม่ใช่บอท (Turnstile) ไม่ผ่านใน 30 วินาที
    Click Button    ${SEND}
    Wait Until Page Contains    ส่งคำขอเรียบร้อยแล้ว    15s
    Record Actual    ส่งคำขอ "${name}" ได้ ขึ้น "ส่งคำขอเรียบร้อยแล้ว"

TC_LEAD_002 ส่งฟอร์มติดต่อโดยไม่กรอกชื่อไม่ได้
    [Documentation]    Scenario: ผู้สนใจลืมกรอกชื่อแล้วกดส่ง
    ...    Pre: อยู่หน้า /contact
    ...    Steps: 1. กรอกทุกช่องยกเว้นชื่อ | 2. กด "ส่งคำขอ"
    ...    Data: ชื่อ (ว่าง)
    ...    Expected: ไม่ส่ง ยังอยู่หน้าฟอร์ม และช่องชื่อถูกบอกว่าต้องกรอก
    [Tags]    priority:Medium
    Go To    ${CLIENT_URL}/contact
    Show Contact Form
    Input Text    id=phone    ${LEAD_PHONE}
    Input Text    id=email    lead.empty.${SALES_RUN}@example.test
    Select From List By Label    id=serviceType    งานก่อสร้าง
    Wait Until Element Is Visible    xpath=//input[@name="areaRange"][@value="UNKNOWN"]/ancestor::label[1]    10s
    Click Element    xpath=//input[@name="areaRange"][@value="UNKNOWN"]/ancestor::label[1]
    Input Text    id=message    ไม่กรอกชื่อ
    Wait Until Element Is Enabled    ${SEND}    30s
    Click Button    ${SEND}
    Sleep    1s
    Page Should Not Contain    ส่งคำขอเรียบร้อยแล้ว
    ${missing}=    Execute Javascript    return document.getElementById('name').validity.valid === false || document.getElementById('name').getAttribute('aria-invalid') === 'true'
    Should Be True    ${missing}    msg=ไม่ได้ส่ง แต่ช่องชื่อไม่ถูกบอกว่าต้องกรอก
    Record Actual    ไม่ส่งคำขอ และช่องชื่อถูกบอกว่าต้องกรอก


*** Keywords ***
Show Contact Form
    [Documentation]    ฟอร์มอยู่ถัดจากส่วนหัวหน้าและค่อย ๆ ปรากฏเมื่อเลื่อนถึง (scroll-reveal) — เลื่อนไปที่ฟอร์มก่อน
    Wait Until Page Contains Element    id=name    15s
    Scroll Element Into View    id=name
    Wait Until Element Is Visible    id=name    10s
