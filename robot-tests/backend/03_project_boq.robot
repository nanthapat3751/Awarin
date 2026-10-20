*** Settings ***
Documentation     หลังบ้าน — สร้างโครงการ เพิ่มบรรทัด BOQ และการคิดราคา
...
...               ทุกเคสในไฟล์นี้ใช้โครงการเดียวที่ TC_PROJ_001 สร้างขึ้น ถ้าสร้างไม่สำเร็จ เคสที่เหลือจะถูกข้าม (Block)
Resource          resource.robot
Suite Setup       Prepare Project Suite
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        backend


*** Variables ***
${PROJECT_URL}        ${EMPTY}
${PROJECT_NAME}       ${EMPTY}
${BOQ_FORM}           xpath=//main//form
${CATEGORY_CODE}      R-01-01
${PROJECT_SEARCH}     xpath=//input[starts-with(@placeholder, "ค้นหาจากชื่อโครงการ")]


*** Test Cases ***
TC_PROJ_001 สร้างโครงการเปล่าแบบประเมินจากระบบ
    [Documentation]    Scenario: พนักงานสร้างโครงการใหม่เพื่อทำ BOQ
    ...    Pre: เข้าสู่ระบบด้วย robot_owner แล้ว · อยู่หน้า /projects
    ...    Steps: 1. กด "+ สร้างโครงการใหม่" | 2. เลือก "สร้างโครงการเปล่า (ประเมินจากระบบ)" | 3. กรอกชื่อโครงการ | 4. กด "สร้าง"
    ...    Data: ชื่อโครงการ: โครงการโรบอท <วันเวลา>
    ...    Expected: โครงการใหม่ขึ้นในรายการ สถานะ "ร่าง" และเปิดหน้ารายละเอียดได้
    [Tags]    module:Project    priority:High
    Go To    ${STAFF_URL}/projects
    Open Blank Project Form
    Input Text    xpath=//input[@placeholder="ชื่อโครงการ"]    ${PROJECT_NAME}
    Click Button    xpath=//main//button[normalize-space(.)="สร้าง"]
    Wait Until Page Contains Element    xpath=//a[normalize-space(.)="${PROJECT_NAME}"]
    Element Should Contain    xpath=//tr[.//a[normalize-space(.)="${PROJECT_NAME}"]]    ร่าง
    Click Link    xpath=//a[normalize-space(.)="${PROJECT_NAME}"]
    Wait Until Location Contains    /projects/
    ${url}=    Get Location
    Set Suite Variable    ${PROJECT_URL}    ${url}
    Wait Until Page Contains    ${PROJECT_NAME}
    Record Actual    สร้าง "${PROJECT_NAME}" สำเร็จ ขึ้นในรายการสถานะ "ร่าง" และเปิดหน้ารายละเอียดได้

TC_PROJ_002 สร้างโครงการโดยไม่กรอกชื่อ
    [Documentation]    Scenario: ตรวจสอบการสร้างโครงการเมื่อเว้นชื่อโครงการว่าง
    ...    Pre: เข้าสู่ระบบแล้ว · อยู่หน้า /projects
    ...    Steps: 1. กด "+ สร้างโครงการใหม่" | 2. เลือกโครงการเปล่า | 3. เว้นชื่อว่าง | 4. กด "สร้าง"
    ...    Data: ชื่อโครงการ: (ว่าง)
    ...    Expected: ไม่สร้างโครงการ และแจ้งผู้ใช้ว่าต้องกรอกชื่อโครงการ (แบบเดียวกับฟอร์ม BOQ ที่บอกว่าขาดช่องไหน)
    [Tags]    module:Project    priority:Low
    Go To    ${STAFF_URL}/projects
    Wait Until Page Contains    แสดง
    ${before}=    Get Text    xpath=//p[starts-with(normalize-space(.), "แสดง")]
    Open Blank Project Form
    Click Button    xpath=//main//button[normalize-space(.)="สร้าง"]
    Sleep    1.5s
    ${after}=    Get Text    xpath=//p[starts-with(normalize-space(.), "แสดง")]
    Should Be Equal    ${before}    ${after}    msg=จำนวนโครงการเปลี่ยน — ระบบสร้างโครงการที่ไม่มีชื่อ
    ${told}=    Run Keyword And Return Status    Page Should Contain    กรอกชื่อโครงการ
    IF    not ${told}
        Fail    ไม่สร้างโครงการ (จำนวนยังเป็น "${after}") แต่ไม่มีข้อความแจ้งใด ๆ — กดแล้วเงียบ ผู้ใช้ไม่รู้ว่าทำไมไม่เกิดอะไรขึ้น
    END
    Record Actual    ไม่สร้างโครงการ และแจ้งให้กรอกชื่อโครงการ

TC_PROJ_003 ค้นหาโครงการจากชื่อ
    [Documentation]    Scenario: ค้นหาโครงการในหน้ารายการด้วยชื่อโครงการ
    ...    Pre: มีโครงการที่ TC_PROJ_001 สร้างไว้
    ...    Steps: 1. เปิด /projects | 2. พิมพ์ชื่อโครงการในช่องค้นหา
    ...    Data: คำค้น: ชื่อโครงการที่สร้างใน TC_PROJ_001
    ...    Expected: ตารางเหลือเฉพาะโครงการที่ชื่อตรงกับคำค้น
    [Tags]    module:Project    priority:Medium
    Require Project
    Go To    ${STAFF_URL}/projects
    Wait Until Element Is Visible    ${PROJECT_SEARCH}
    Input Text    ${PROJECT_SEARCH}    ${PROJECT_NAME}
    Wait Until Page Contains    แสดง 1-1 จาก 1 โครงการ
    Page Should Contain Element    xpath=//a[normalize-space(.)="${PROJECT_NAME}"]
    Record Actual    ตารางเหลือ 1 แถว ("แสดง 1-1 จาก 1 โครงการ") คือ "${PROJECT_NAME}"

TC_BOQ_001 ยอดรวมของบรรทัดคิดทันทีขณะกรอก
    [Documentation]    Scenario: กรอกจำนวนและราคาในฟอร์มเพิ่มรายการ BOQ แล้วดูยอดรวมของบรรทัดก่อนบันทึก
    ...    Pre: อยู่แท็บ BOQ ของโครงการจาก TC_PROJ_001 · มีหมวดงาน R-01-01
    ...    Steps: 1. กด "+ เพิ่มรายการ" | 2. เลือกหมวดงาน R-01-01 | 3. กรอกชื่อ หน่วย จำนวน ค่าวัสดุ ค่าแรง
    ...    Data: ชื่อ: งานทดสอบโรบอท · หน่วย: ตร.ม. · จำนวน: 2 · ค่าวัสดุ: 100 · ค่าแรง: 50
    ...    Expected: "รวมบรรทัดนี้" = 2 × (100 + 50) = 300.00
    [Tags]    module:BOQ    priority:High
    Require Project
    Open BOQ Add Form
    Fill BOQ Line    งานทดสอบโรบอท    ตร.ม.    2    100    50
    ${total}=    Line Total In Form
    Should Be Equal    ${total}    300.00
    Record Actual    "รวมบรรทัดนี้" แสดง ${total}

TC_BOQ_002 กดบันทึกแล้วฟอร์มปิดและบรรทัดขึ้นในตาราง
    [Documentation]    Scenario: บันทึกบรรทัด BOQ ด้วยปุ่ม "บันทึก" (ไม่ใช่ "บันทึก + เพิ่มต่อ")
    ...    Pre: กรอกฟอร์มจาก TC_BOQ_001 ไว้แล้ว
    ...    Steps: 1. กดปุ่ม "บันทึก"
    ...    Data: (ข้อมูลจาก TC_BOQ_001)
    ...    Expected: ฟอร์มเพิ่มรายการปิดลง และตารางแสดงบรรทัด "งานทดสอบโรบอท" 2 ตร.ม. ยอด 300.00
    [Tags]    module:BOQ    priority:High
    Require Project
    Click Button    xpath=//main//form//button[@type="submit"][normalize-space(.)="บันทึก"]
    Wait Until Page Does Not Contain Element    ${BOQ_FORM}
    Wait Until Page Contains Element    xpath=//tr[.//td[contains(., "งานทดสอบโรบอท")]]
    Element Should Contain    xpath=//tr[.//td[contains(., "งานทดสอบโรบอท")]]    300.00
    Element Should Contain    xpath=//tr[.//td[contains(., "งานทดสอบโรบอท")]]    2 ตร.ม.
    Record Actual    ฟอร์มปิดลง ตารางแสดง "งานทดสอบโรบอท" 2 ตร.ม. ยอด 300.00

TC_BOQ_003 สรุปราคา ต้นทุน กำไร VAT และราคาสุทธิ
    [Documentation]    Scenario: ตรวจตัวเลขสรุปราคาบนหัวโครงการหลังมีบรรทัด BOQ
    ...    Pre: โครงการมีบรรทัดเดียว ยอด 300.00 · ค่าดำเนินการ+กำไรมาตรฐาน 10% · VAT 7%
    ...    Steps: 1. ดูการ์ดสรุปราคาบนหน้าโครงการ
    ...    Data: ต้นทุน 300.00
    ...    Expected: ต้นทุน 300.00 · ค่าดำเนินการ+กำไร 30.00 · VAT 7% ของ 330.00 = 23.10 · ราคาสุทธิ 353.10
    [Tags]    module:BOQ Pricing    priority:High
    Require Project
    Reload Page
    Wait Until Page Contains    353.10
    ${text}=    Get Text    xpath=//main
    Should Contain    ${text}    300.00
    Should Contain    ${text}    30.00
    Should Contain    ${text}    23.10
    Should Contain    ${text}    353.10
    Record Actual    ต้นทุน 300.00 · ค่าดำเนินการ+กำไร 30.00 · VAT 23.10 · ราคาสุทธิ 353.10

TC_BOQ_004 บันทึกแล้วเพิ่มต่อ ฟอร์มยังเปิดและเก็บหมวดงานเดิม
    [Documentation]    Scenario: ใช้ปุ่ม "บันทึก + เพิ่มต่อ" เพื่อกรอกหลายบรรทัดติดกัน
    ...    Pre: อยู่แท็บ BOQ ของโครงการ
    ...    Steps: 1. กด "+ เพิ่มรายการ" | 2. เลือกหมวด R-01-01 แล้วกรอกบรรทัดที่สอง | 3. กด "บันทึก + เพิ่มต่อ"
    ...    Data: ชื่อ: งานทดสอบโรบอท 2 · หน่วย: ตร.ม. · จำนวน: 1 · ค่าวัสดุ: 10 · ค่าแรง: 0
    ...    Expected: บันทึกบรรทัดที่สอง ฟอร์มยังเปิด ช่องชื่อถูกล้างว่าง และหมวดงานยังเป็น R-01-01
    [Tags]    module:BOQ    priority:Medium
    Require Project
    Open BOQ Add Form
    Fill BOQ Line    งานทดสอบโรบอท 2    ตร.ม.    1    10    0
    Click Button    xpath=//main//form//button[contains(., "บันทึก + เพิ่มต่อ")]
    Wait Until Page Contains Element    xpath=//tr[.//td[contains(., "งานทดสอบโรบอท 2")]]
    Page Should Contain Element    ${BOQ_FORM}
    Textfield Value Should Be    xpath=//main//form//input[@placeholder="เช่น งานรื้อถอนผนังเดิม"]    ${EMPTY}
    Element Should Contain    ${BOQ_FORM}    ${CATEGORY_CODE}
    Record Actual    บันทึก "งานทดสอบโรบอท 2" แล้ว ฟอร์มยังเปิด ช่องชื่อว่าง หมวดงานยังเป็น ${CATEGORY_CODE}

TC_BOQ_005 บันทึกโดยไม่กรอกชื่อรายการ
    [Documentation]    Scenario: ตรวจสอบการบันทึกบรรทัด BOQ เมื่อไม่กรอกชื่อและไม่เลือกวัสดุจากคลัง
    ...    Pre: ฟอร์มเพิ่มรายการเปิดอยู่ หมวดงาน R-01-01
    ...    Steps: 1. เว้นชื่อรายการว่าง | 2. กด "บันทึก"
    ...    Data: ชื่อ: (ว่าง) · วัสดุจากคลัง: (ไม่เลือก)
    ...    Expected: ไม่บันทึก แสดง "กรอกชื่อรายการ หรือเลือกวัสดุจากคลัง" และฟอร์มยังเปิดอยู่
    [Tags]    module:BOQ    priority:Medium
    Require Project
    Ensure BOQ Form Open
    Clear Element Text    xpath=//main//form//input[@placeholder="เช่น งานรื้อถอนผนังเดิม"]
    Click Button    xpath=//main//form//button[@type="submit"][normalize-space(.)="บันทึก"]
    Wait Until Page Contains    กรอกชื่อรายการ หรือเลือกวัสดุจากคลัง
    Page Should Contain Element    ${BOQ_FORM}
    Record Actual    แสดง "กรอกชื่อรายการ หรือเลือกวัสดุจากคลัง" ฟอร์มยังเปิด ไม่มีบรรทัดใหม่

TC_BOQ_006 บันทึกเมื่อจำนวนเป็นศูนย์
    [Documentation]    Scenario: ตรวจสอบการบันทึกบรรทัด BOQ เมื่อกรอกจำนวน 0
    ...    Pre: ฟอร์มเพิ่มรายการเปิดอยู่ หมวดงาน R-01-01
    ...    Steps: 1. กรอกชื่อและหน่วย | 2. กรอกจำนวน 0 | 3. กด "บันทึก"
    ...    Data: ชื่อ: งานจำนวนศูนย์ · หน่วย: ตร.ม. · จำนวน: 0 · ค่าวัสดุ: 100
    ...    Expected: ไม่บันทึก แสดง "กรอกจำนวน (มากกว่า 0)"
    [Tags]    module:BOQ    priority:Medium
    Require Project
    Ensure BOQ Form Open
    Fill BOQ Line    งานจำนวนศูนย์    ตร.ม.    0    100    0
    Click Button    xpath=//main//form//button[@type="submit"][normalize-space(.)="บันทึก"]
    Wait Until Page Contains    กรอกจำนวน (มากกว่า 0)
    Page Should Not Contain Element    xpath=//tr[.//td[contains(., "งานจำนวนศูนย์")]]
    Record Actual    แสดง "กรอกจำนวน (มากกว่า 0)" และไม่มีบรรทัด "งานจำนวนศูนย์" ในตาราง


*** Keywords ***
Prepare Project Suite
    Open Staff App
    Login As Staff Owner
    ${suffix}=    Unique Suffix
    Set Suite Variable    ${PROJECT_NAME}    โครงการโรบอท ${suffix}

Require Project
    Skip If    "${PROJECT_URL}" == ""    ข้ามเพราะ TC_PROJ_001 สร้างโครงการไม่สำเร็จ

Open Blank Project Form
    Click Button    xpath=//main//button[contains(., "สร้างโครงการใหม่")]
    Click Button    xpath=//main//button[.//p[contains(., "สร้างโครงการเปล่า")]]
    Wait Until Element Is Visible    xpath=//input[@placeholder="ชื่อโครงการ"]

Open BOQ Add Form
    ${here}=    Get Location
    IF    "tab=boq" not in """${here}"""
        Go To    ${PROJECT_URL}?tab=boq
    END
    Wait Until Element Is Visible    xpath=//main//button[normalize-space(.)="+ เพิ่มรายการ"]
    ${open}=    Run Keyword And Return Status    Page Should Contain Element    ${BOQ_FORM}
    IF    not ${open}    Click Button    xpath=//main//button[normalize-space(.)="+ เพิ่มรายการ"]
    Wait Until Element Is Visible    ${BOQ_FORM}
    Select BOQ Category    ${CATEGORY_CODE}

Ensure BOQ Form Open
    ${open}=    Run Keyword And Return Status    Page Should Contain Element    ${BOQ_FORM}
    IF    not ${open}    Open BOQ Add Form

Select BOQ Category
    [Arguments]    ${code}
    ${already}=    Run Keyword And Return Status    Element Should Contain    xpath=(//main//form//label[starts-with(normalize-space(.), "หมวดงาน")]//button)[1]    ${code}
    IF    ${already}    RETURN
    Click Button    xpath=(//main//form//label[starts-with(normalize-space(.), "หมวดงาน")]//button)[1]
    Input Text    xpath=//main//form//input[@placeholder="พิมพ์เพื่อค้นหา..."]    ${code}
    Click Button    xpath=//main//form//li/button[contains(., "${code} —")]

Fill BOQ Line
    [Arguments]    ${name}    ${unit}    ${qty}    ${material}    ${labor}
    Input Text    xpath=//main//form//input[@placeholder="เช่น งานรื้อถอนผนังเดิม"]    ${name}
    Input Text    xpath=//main//form//input[@role="combobox"]    ${unit}
    Click Element    xpath=//main//form//input[@placeholder="เช่น งานรื้อถอนผนังเดิม"]
    Input Text    xpath=//main//form//label[starts-with(normalize-space(text()), "จำนวน")]//input    ${qty}
    Input Text    xpath=//main//form//label[normalize-space(text())="ค่าวัสดุ"]//input    ${material}
    Input Text    xpath=//main//form//label[normalize-space(text())="ค่าแรง"]//input    ${labor}

Line Total In Form
    ${total}=    Execute JavaScript
    ...    const m = document.querySelector("main form").innerText.match(/รวมบรรทัดนี้\\s*([\\d,]+\\.\\d{2})/); return m ? m[1] : "ไม่พบ";
    RETURN    ${total}
