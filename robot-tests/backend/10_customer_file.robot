*** Settings ***
Documentation     หลังบ้าน — แฟ้มลูกค้า (UI-GAP-10): ค้นหา · เรียง · ดูประวัติการใช้งาน · ส่งออก CSV
...
...               ค้นด้วย "example.test" = บัญชีลูกค้าทดสอบของ seed (ไม่เกินหนึ่งหน้า 15 แถว) จึงเทียบลำดับก่อน/หลังกดเรียงได้ทั้งชุด
...               ไฟล์ CSV ดาวน์โหลดลง results/downloads/customers (เบราว์เซอร์ไม่มีหน้าต่าง โหลดเงียบ ๆ)
Resource          resource.robot
Variables         ${CURDIR}/../results/payment-data.json
Suite Setup       Prepare Customer File Suite
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        backend    module:Customer File


*** Variables ***
${SEARCH}             xpath=//main//input[@type="search"]
${NAME_LINKS}         //main//table//tbody//a[contains(@href, "/customers/")]


*** Test Cases ***
TC_CUSTFILE_001 ค้นหาลูกค้าด้วยอีเมลแล้วเหลือแถวเดียว
    [Documentation]    Scenario: พนักงานหาลูกค้าที่โทรเข้ามาจากอีเมลที่ลูกค้าบอก
    ...    Pre: เข้าสู่ระบบ robot_owner · มีลูกค้า robot.sales
    ...    Steps: 1. เปิด /customers | 2. พิมพ์อีเมลในช่องค้นหา
    ...    Data: คำค้น robot.sales@example.test
    ...    Expected: ตารางเหลือ 1 แถวคือ "ลูกค้าขายงาน โรบอท" และแท็บ "รายชื่อ" นับ 1
    [Tags]    priority:High
    Search Customers    robot.sales@example.test
    Wait Until Keyword Succeeds    10s    0.5s    Name Count Should Be    1
    Element Should Contain    xpath=${NAME_LINKS}    ลูกค้าขายงาน โรบอท
    Element Should Contain    xpath=//main//button[starts-with(normalize-space(.), "รายชื่อ")]    1
    Record Actual    ค้นด้วยอีเมลแล้วเหลือแถวเดียว "ลูกค้าขายงาน โรบอท"

TC_CUSTFILE_002 กดหัวคอลัมน์ชื่อแล้วเรียงขึ้น กดอีกครั้งเรียงลง
    [Documentation]    Scenario: พนักงานเรียงรายชื่อลูกค้าตามชื่อเพื่อหาง่าย
    ...    Pre: ค้นด้วย "example.test" (บัญชีทดสอบไม่เกินหนึ่งหน้า)
    ...    Steps: 1. กดหัวคอลัมน์ "ชื่อ" | 2. จดลำดับ | 3. กดอีกครั้ง | 4. จดลำดับ
    ...    Data: คำค้น example.test
    ...    Expected: หัวคอลัมน์บอกว่าเรียงขึ้น (aria-sort=ascending) แล้วเรียงลง (descending) · ลำดับครั้งที่สองกลับด้านจากครั้งแรกพอดี
    [Tags]    priority:Medium
    Search Customers    example.test
    Wait Until Page Contains Element    xpath=${NAME_LINKS}    15s
    ${th}=    Set Variable    //main//th[.//button[normalize-space(.)="ชื่อ"]]
    ${first}=    Sort By Name Until    ${th}    ascending
    ${second}=    Sort By Name Until    ${th}    descending
    ${n}=    Get Length    ${first}
    Should Be True    ${n} >= 5    msg=มีลูกค้าทดสอบแค่ ${n} คน เทียบลำดับไม่ได้
    ${reversed}=    Evaluate    list(reversed($first))
    Should Be Equal    ${second}    ${reversed}    msg=ลำดับเรียงลงไม่ใช่การกลับด้านของเรียงขึ้น
    Record Actual    เรียงขึ้น/ลงตามชื่อได้ (${n} คน) แรกสุดเรียงขึ้น "${first}[0]" · แรกสุดเรียงลง "${second}[0]"

TC_CUSTFILE_003 เปิดแฟ้มลูกค้าเห็นประวัติการใช้งานของลูกค้าคนนั้น
    [Documentation]    Scenario: พนักงานเปิดแฟ้มลูกค้าเพื่อดูว่าลูกค้าเข้ามาดูอะไรบ้าง
    ...    Pre: ลูกค้า robot.customer เข้าสู่ระบบมาแล้วในชุดหน้าบ้าน
    ...    Steps: 1. ค้นหาแล้วกดชื่อ "ลูกค้า โรบอท" | 2. ดูส่วน "กิจกรรม"
    ...    Data: robot.customer@example.test
    ...    Expected: เปิดแฟ้มลูกค้าได้ เห็นโครงการ/สัญญาของลูกค้า และส่วน "กิจกรรม (N)" มีรายการ "เข้าสู่ระบบ"
    [Tags]    priority:Medium
    Search Customers    robot.customer@example.test
    Wait Until Keyword Succeeds    10s    0.5s    Name Count Should Be    1
    Click Element    xpath=${NAME_LINKS}
    Wait Until Location Contains    /customers/    15s
    Wait Until Page Contains    สัญญา (    15s
    Wait Until Element Is Visible    xpath=//main//*[starts-with(normalize-space(.), "กิจกรรม (")]
    ${head}=    Get Text    xpath=(//main//*[starts-with(normalize-space(.), "กิจกรรม (")])[1]
    Page Should Contain Element    xpath=//main//table//td[contains(., "เข้าสู่ระบบ")]
    Record Actual    แฟ้มลูกค้าเปิดได้ เห็นสัญญาของลูกค้า และ "${head}" มีรายการเข้าสู่ระบบ

TC_CUSTFILE_004 ส่งออกรายชื่อลูกค้าเป็น CSV ที่เปิดใน Excel ภาษาไทยได้
    [Documentation]    Scenario: เจ้าของกิจการดาวน์โหลดรายชื่อลูกค้าไปทำงานต่อใน Excel
    ...    Pre: ค้นด้วย "example.test"
    ...    Steps: 1. กด "ส่งออก CSV" | 2. เปิดไฟล์ที่ได้
    ...    Data: คำค้น example.test
    ...    Expected: ได้ไฟล์ .csv ขึ้นต้นด้วย BOM (Excel อ่านภาษาไทยถูก) มีหัวคอลัมน์ และมี robot.customer@example.test · ชื่อที่ขึ้นต้นด้วย = + - @ ไม่กลายเป็นสูตร
    [Tags]    priority:Medium
    Empty Directory    ${DOWNLOADS}
    Search Customers    example.test
    Wait Until Page Contains Element    xpath=${NAME_LINKS}    15s
    Click Button    xpath=//main//button[contains(., "ส่งออก CSV")]
    ${file}=    Wait For Download    ${DOWNLOADS}    .csv
    ${bom}=    File Starts With Bom    ${file}
    Should Be True    ${bom}    msg=ไฟล์ไม่มี BOM — Excel จะอ่านภาษาไทยเพี้ยน
    ${text}=    Read Text File    ${file}
    Should Contain    ${text}    robot.customer@example.test
    ${lines}=    Evaluate    $text.strip().splitlines()
    ${formula}=    Evaluate    [l for l in $lines[1:] if any(c.strip('"').startswith(("=", "+", "@")) for c in l.split(","))]
    Should Be Empty    ${formula}    msg=มีช่องที่ขึ้นต้นด้วยเครื่องหมายสูตร: ${formula}
    ${name}=    Evaluate    __import__("os").path.basename($file)
    ${rows}=    Evaluate    len($lines) - 1
    Record Actual    ได้ไฟล์ ${name} (${rows} แถว + หัวคอลัมน์) ขึ้นต้นด้วย BOM มี robot.customer และไม่มีช่องที่กลายเป็นสูตร


*** Keywords ***
Prepare Customer File Suite
    Set Suite Variable    ${DOWNLOADS}    ${OUTPUT DIR}${/}downloads${/}customers
    Open Browser For Test    ${STAFF_URL}/login    download_dir=${DOWNLOADS}
    Login As Staff Owner

Search Customers
    [Arguments]    ${text}
    Go To    ${STAFF_URL}/customers
    Wait Until Element Is Visible    ${SEARCH}    15s
    Input Text    ${SEARCH}    ${text}
    Sleep    1s    # ค้นที่เซิร์ฟเวอร์หลังหยุดพิมพ์

Name Count Should Be
    [Arguments]    ${n}
    ${count}=    Get Element Count    xpath=${NAME_LINKS}
    Should Be Equal As Integers    ${count}    ${n}

Sort By Name Until
    [Documentation]    กดหัวคอลัมน์ "ชื่อ" จนหัวคอลัมน์บอกทิศที่ต้องการ (ไม่เกิน 3 ครั้ง) แล้วคืนรายชื่อตามลำดับบนจอ
    [Arguments]    ${th}    ${direction}
    FOR    ${i}    IN RANGE    3
        Click Button    xpath=${th}//button
        Sleep    1.5s
        ${now}=    Get Element Attribute    xpath=${th}    aria-sort
        IF    "${now}" == "${direction}"    BREAK
    END
    Should Be Equal    ${now}    ${direction}    msg=กดหัวคอลัมน์ "ชื่อ" แล้ว aria-sort เป็น ${now}
    @{names}=    Create List
    ${els}=    Get WebElements    xpath=${NAME_LINKS}
    FOR    ${e}    IN    @{els}
        Append To List    ${names}    ${e.text}
    END
    RETURN    ${names}
