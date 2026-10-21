*** Settings ***
Documentation     เดินงานขายครบเส้นผ่านหน้าจอทั้งสองฝั่ง (UI-GAP-01 ใบเสนอราคา · 02 สัญญา · 03 วางบิล/เอกสาร · 09 ประวัติการชำระของลูกค้า)
...
...               seed สร้างโครงการร่างพร้อม BOQ ให้ลูกค้า robot.sales สองโครงการ (results/ui-data.json): "ขายงาน" เดินจนออกใบเสร็จ
...               และ "ปฏิเสธ" ให้ลูกค้าปฏิเสธ · นอกนั้นทำผ่านหน้าจอทั้งหมด: พนักงานใช้เบราว์เซอร์ staff ลูกค้าใช้เบราว์เซอร์ cust
...               เคสต่อกันเป็นลำดับ — ถ้าขั้นก่อนหน้าไม่สำเร็จ ขั้นถัดไปจะล้มตาม (ดูเคสแรกที่ล้มเป็นต้นเหตุ)
...               สลิปเป็นไฟล์จำลอง (SLIP_PROVIDER=mock) อ่านยอด/วันที่/บัญชีจากชื่อไฟล์ ไม่เรียก SlipOK จริง
Resource          resource.robot
Resource          ../frontend/resource.robot
Library           OperatingSystem
Variables         ${CURDIR}/../results/ui-data.json
Variables         ${CURDIR}/../results/payment-data.json
Suite Setup       Prepare Sales Suite
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        backend    module:Sales Flow


*** Variables ***
${DIALOG}             xpath=//*[self::dialog or @role="dialog" or @role="alertdialog"]
${ROW_1}              //main//tr[td[1][normalize-space(.)="1"]]
${ROW_2}              //main//tr[td[1][normalize-space(.)="2"]]
${NOTICE_SUBMIT}      xpath=//main//button[@type="submit"][contains(., "ส่งแจ้งโอน")]
${SLIP_INPUT}         xpath=//main//input[@type="file"]
${PNG_1PX}            iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==
${MILESTONE_1}        เซ็นสัญญา แล้วเสร็จ (ทดสอบแก้งวดโดยโรบอท)
${VOID_REASON}        ทดสอบยกเลิกใบโดยโรบอท


*** Test Cases ***
TC_SALE_001 พนักงานสร้างใบเสนอราคา อนุมัติ และส่งให้ลูกค้า
    [Documentation]    Scenario: พนักงานทำ BOQ เสร็จแล้วออกใบเสนอราคาส่งลูกค้าจากหน้าโครงการ
    ...    Pre: โครงการ "ขายงาน" สถานะร่าง มี BOQ 1 บรรทัด ผูกลูกค้า robot.sales · เข้าสู่ระบบ robot_owner
    ...    Steps: 1. แท็บใบเสนอราคา กด "+ สร้างใบเสนอราคาใหม่" → "สร้าง" | 2. กด "อนุมัติ" → "อนุมัติ" | 3. กด "ส่งให้ลูกค้า" → "เปลี่ยนสถานะ"
    ...    Data: โครงการ [โรบอท] ทดสอบขายงาน <รอบ>
    ...    Expected: ใบเสนอราคาฉบับที่ 1 สถานะ "ส่งแล้ว" · สถานะโครงการเปลี่ยนเป็น "เสนอราคาแล้ว"
    [Tags]    priority:High    module:Quote
    Create And Send Quote    ${SALES_PROJECT_ID}
    Element Should Contain    xpath=//main    เสนอราคาแล้ว
    ${no}=    Get Text    xpath=(//main//tr[contains(., "ส่งแล้ว")]//td)[2]
    Set Suite Variable    ${QUOTE_NO}    ${no}
    Record Actual    สร้าง อนุมัติ และส่งใบเสนอราคา ${no} ได้ · สถานะ "ส่งแล้ว" · โครงการเป็น "เสนอราคาแล้ว"

TC_SALE_002 ลูกค้ายอมรับใบเสนอราคาในพอร์ทัลแล้วโครงการอนุมัติเอง
    [Documentation]    Scenario: ลูกค้าเปิดใบเสนอราคาที่ได้รับในพอร์ทัลแล้วกดยอมรับ
    ...    Pre: ใบเสนอราคาส่งแล้ว (TC_SALE_001) · เข้าสู่ระบบลูกค้า robot.sales
    ...    Steps: 1. ลูกค้าเปิด /my/quotes แล้วเปิดใบของโครงการ | 2. กด "ยอมรับใบเสนอราคา" → "ยอมรับ" | 3. พนักงานรีเฟรชหน้าโครงการ
    ...    Data: ใบเสนอราคาจาก TC_SALE_001
    ...    Expected: พอร์ทัลขึ้น "ยอมรับแล้ว" · ฝั่งพนักงานใบเป็น "ลูกค้ายอมรับ" และโครงการเป็น "อนุมัติแล้ว"
    [Tags]    priority:High    module:Quote
    Open Customer Quote    ${SALES_PROJECT_NAME}
    Click Button    xpath=//main//button[normalize-space(.)="ยอมรับใบเสนอราคา"]
    Click Dialog Button    ยอมรับ
    Wait Until Element Contains    xpath=//main    ยอมรับแล้ว    15s
    Switch Browser    staff
    Open Project Tab    ${SALES_PROJECT_ID}    quotes
    Wait Until Element Contains    xpath=//main    ลูกค้ายอมรับ    15s
    Element Should Contain    xpath=//main    อนุมัติแล้ว
    Record Actual    ลูกค้ากดยอมรับ พอร์ทัลขึ้น "ยอมรับแล้ว" · หลังบ้านใบเป็น "ลูกค้ายอมรับ" โครงการเป็น "อนุมัติแล้ว"

TC_SALE_003 ลูกค้าปฏิเสธใบเสนอราคาพร้อมเหตุผลแล้วโครงการเป็นลูกค้าปฏิเสธ
    [Documentation]    Scenario: ลูกค้าอีกงานเห็นว่าราคาสูงเกินงบ จึงปฏิเสธพร้อมเลือกเหตุผล
    ...    Pre: โครงการ "ปฏิเสธ" ของ robot.sales มี BOQ · พนักงานส่งใบเสนอราคาให้ในเคสนี้
    ...    Steps: 1. พนักงานสร้าง อนุมัติ และส่งใบเสนอราคา | 2. ลูกค้ากด "ปฏิเสธ" เลือก "ราคาสูงเกินงบที่ตั้งไว้" → "ยืนยันการปฏิเสธ" | 3. พนักงานดูหน้าโครงการ
    ...    Data: เหตุผล: ราคาสูงเกินงบที่ตั้งไว้
    ...    Expected: พอร์ทัลขึ้น "ปฏิเสธแล้ว" · ฝั่งพนักงานโครงการเป็น "ลูกค้าปฏิเสธ"
    [Tags]    priority:High    module:Quote
    Switch Browser    staff
    Create And Send Quote    ${REJECT_PROJECT_ID}
    Open Customer Quote    ${REJECT_PROJECT_NAME}
    Click Button    xpath=//main//button[normalize-space(.)="ปฏิเสธ"]
    Wait Until Element Is Visible    xpath=//input[@name="reject-reason"][@value="ราคาสูงเกินงบที่ตั้งไว้"]/ancestor::label[1]
    Click Element    xpath=//input[@name="reject-reason"][@value="ราคาสูงเกินงบที่ตั้งไว้"]/ancestor::label[1]
    Click Button    xpath=//main//button[normalize-space(.)="ยืนยันการปฏิเสธ"]
    Wait Until Element Contains    xpath=//main    ปฏิเสธ    15s
    Page Should Not Contain Element    xpath=//main//button[normalize-space(.)="ยอมรับใบเสนอราคา"]
    Switch Browser    staff
    Open Project Tab    ${REJECT_PROJECT_ID}    quotes
    Wait Until Element Contains    xpath=//main    ลูกค้าปฏิเสธ    15s
    ${why}=    Run Keyword And Return Status    Element Should Contain    xpath=//main    ราคาสูงเกินงบที่ตั้งไว้
    Record Actual    ลูกค้าปฏิเสธพร้อมเหตุผล ปุ่มยอมรับหายไป · หลังบ้านโครงการเป็น "ลูกค้าปฏิเสธ"${{" และเห็นเหตุผลที่ลูกค้าเลือก" if $why else ""}}

TC_SALE_004 สร้างสัญญาจากใบเสนอราคาที่ยอมรับแล้วแก้เงื่อนไขงวดได้
    [Documentation]    Scenario: พนักงานออกสัญญาให้โครงการที่ลูกค้ายอมรับ และแก้ข้อความเงื่อนไขของงวดแรกก่อนลงนาม
    ...    Pre: โครงการ "ขายงาน" อนุมัติแล้ว (TC_SALE_002)
    ...    Steps: 1. แท็บสัญญาและการเงิน กด "+ สร้างสัญญาใหม่" | 2. กด "แก้ข้อความและงวด" | 3. แก้เงื่อนไขงวดที่ 1 | 4. กด "บันทึกงวดเงิน" | 5. รีเฟรชแล้วเปิดดูอีกครั้ง
    ...    Data: เงื่อนไขงวด 1: เซ็นสัญญา แล้วเสร็จ (ทดสอบแก้งวดโดยโรบอท)
    ...    Expected: มีสัญญา CT-… สถานะ "ร่าง — ยังไม่ลงนาม" มูลค่าเท่าราคาสุทธิใบเสนอราคา · เงื่อนไขที่แก้ยังอยู่หลังรีเฟรช
    [Tags]    priority:High    module:Contract
    Switch Browser    staff
    Open Project Tab    ${SALES_PROJECT_ID}    contract
    Click Button    xpath=//main//button[normalize-space(.)="+ สร้างสัญญาใหม่"]
    Wait Until Element Contains    xpath=//main    ร่าง — ยังไม่ลงนาม    15s
    ${no}=    Get Text    xpath=(//main//td[starts-with(normalize-space(.), "CT-")])[1]
    Set Suite Variable    ${CONTRACT_NO}    ${no}
    Open Contract Editor
    ${first}=    Set Variable    xpath=(//main//input[@placeholder="ชำระเมื่อ ... แล้วเสร็จ"])[1]
    Input Text    ${first}    ${MILESTONE_1}
    Click Button    xpath=//main//button[normalize-space(.)="บันทึกงวดเงิน"]
    Sleep    1.5s
    Reload Page
    Wait Until Element Contains    xpath=//main    ${no}    15s
    Open Contract Editor
    ${saved}=    Get Value    ${first}
    Should Be Equal    ${saved}    ${MILESTONE_1}    msg=เงื่อนไขงวด 1 หลังรีเฟรชเป็น "${saved}"
    Record Actual    สร้างสัญญา ${no} (ร่าง) ได้ · แก้เงื่อนไขงวด 1 แล้วบันทึก รีเฟรชแล้วยังเป็น "${saved}"

TC_SALE_005 ลงนามสัญญาแล้วเปิด PDF สัญญาได้
    [Documentation]    Scenario: ลงนามสัญญาฉบับร่างแล้วเปิดสัญญาฉบับ PDF ส่งให้ลูกค้า
    ...    Pre: สัญญาร่างจาก TC_SALE_004
    ...    Steps: 1. กด "ลงนาม" → ยืนยัน "ลงนาม" | 2. กด "เปิดสัญญา (PDF)"
    ...    Data: (สัญญาจาก TC_SALE_004)
    ...    Expected: สัญญาขึ้น "ลงนาม …" พร้อมตารางงวด 7 งวด · หน้า PDF เปิดได้ (ชื่อแท็บมีเลขสัญญา)
    [Tags]    priority:High    module:Contract
    Switch Browser    staff
    Open Project Tab    ${SALES_PROJECT_ID}    contract
    Click Button    xpath=//main//button[normalize-space(.)="ลงนาม"]
    Click Dialog Button    ลงนาม
    Wait Until Page Contains Element    xpath=//main//a[contains(., "เปิดสัญญา (PDF)")]    15s
    Wait Until Page Contains Element    xpath=${ROW_1}
    Page Should Contain Element    xpath=//main//tr[td[1][normalize-space(.)="7"]]
    Element Should Contain    xpath=${ROW_1}    ${MILESTONE_1}
    ${href}=    Get Element Attribute    xpath=//main//a[contains(., "เปิดสัญญา (PDF)")]    href
    Pdf Viewer Should Open    ${href}    ${CONTRACT_NO}
    Record Actual    ลงนามสัญญา ${CONTRACT_NO} แล้วมีงวด 7 งวด (งวด 1 ใช้เงื่อนไขที่แก้) · เปิด PDF สัญญาได้

TC_SALE_006 วางบิลงวดแรกจากหน้าจอแล้วเปิด PDF ใบแจ้งหนี้ได้
    [Documentation]    Scenario: งานงวดแรกเสร็จ พนักงานกด "วางบิล" ให้ลูกค้า
    ...    Pre: สัญญาลงนามแล้ว (TC_SALE_005)
    ...    Steps: 1. กด "วางบิล" ที่งวด 1 | 2. กำหนดชำระวันนี้ แล้วกด "ออกใบแจ้งหนี้" | 3. กดลิงก์ "ใบแจ้งหนี้ INV-…"
    ...    Data: กำหนดชำระ: วันนี้
    ...    Expected: งวด 1 มีใบแจ้งหนี้ INV-… และปุ่มถัดไปเป็น "ลูกค้าจ่ายแล้ว" · หน้า PDF ใบแจ้งหนี้เปิดได้
    [Tags]    priority:High    module:Billing
    Switch Browser    staff
    Open Project Tab    ${SALES_PROJECT_ID}    contract
    Issue Invoice From Row    ${ROW_1}
    ${inv}=    Get Text    xpath=(${ROW_1}//a[starts-with(normalize-space(.), "ใบแจ้งหนี้ INV-")])[1]
    Page Should Contain Element    xpath=${ROW_1}//button[normalize-space(.)="ลูกค้าจ่ายแล้ว"]
    ${href}=    Get Element Attribute    xpath=(${ROW_1}//a[starts-with(normalize-space(.), "ใบแจ้งหนี้ INV-")])[1]    href
    ${docno}=    Evaluate    $inv.replace("ใบแจ้งหนี้", "").strip()
    Pdf Viewer Should Open    ${href}    ${docno}
    Record Actual    งวด 1 มี${inv} ปุ่มถัดไปคือ "ลูกค้าจ่ายแล้ว" · เปิด PDF ใบแจ้งหนี้ได้

TC_SALE_007 ยกเลิกใบแจ้งหนี้ที่ออกผิดพร้อมเหตุผล
    [Documentation]    Scenario: พนักงานวางบิลงวด 2 เร็วเกินไป จึงยกเลิกใบนั้น (เลขที่ใบไม่หาย มีตรายกเลิก)
    ...    Pre: งวด 1 วางบิลแล้ว (TC_SALE_006) ปุ่ม "วางบิล" จึงเลื่อนมาที่งวด 2
    ...    Steps: 1. วางบิลงวด 2 | 2. เมนู ⋯ ของงวด 2 → "ยกเลิกใบแจ้งหนี้ INV-…" | 3. พิมพ์เหตุผล แล้วกดยกเลิก
    ...    Data: เหตุผล: ทดสอบยกเลิกใบโดยโรบอท
    ...    Expected: ใบเดิมขึ้น "ยกเลิกแล้ว — ทดสอบยกเลิกใบโดยโรบอท" · งวด 2 กลับมามีปุ่ม "วางบิล" ให้ออกใบใหม่
    [Tags]    priority:Medium    module:Billing
    Switch Browser    staff
    Open Project Tab    ${SALES_PROJECT_ID}    contract
    Issue Invoice From Row    ${ROW_2}
    ${inv}=    Get Text    xpath=(${ROW_2}//a[starts-with(normalize-space(.), "ใบแจ้งหนี้ INV-")])[1]
    Click Button    xpath=//button[@aria-label="คำสั่งอื่นของงวดที่ 2"]
    Wait Until Element Is Visible    xpath=//*[@role="menuitem"][starts-with(normalize-space(.), "ยกเลิกใบแจ้งหนี้")]
    Click Element    xpath=//*[@role="menuitem"][starts-with(normalize-space(.), "ยกเลิกใบแจ้งหนี้")]
    Wait Until Element Is Visible    xpath=//main//input[starts-with(@placeholder, "เหตุผลที่ยกเลิก")]
    Input Text    xpath=//main//input[starts-with(@placeholder, "เหตุผลที่ยกเลิก")]    ${VOID_REASON}
    Click Button    xpath=//main//button[starts-with(normalize-space(.), "ยกเลิกใบแจ้งหนี้")]
    Wait Until Element Contains    xpath=${ROW_2}    ยกเลิกแล้ว — ${VOID_REASON}    15s
    Wait Until Page Contains Element    xpath=${ROW_2}//button[normalize-space(.)="วางบิล"]
    Record Actual    ${inv} ขึ้น "ยกเลิกแล้ว — ${VOID_REASON}" · งวด 2 กลับมามีปุ่ม "วางบิล"

TC_SALE_008 ลูกค้าแจ้งโอนแล้วงวดยังไม่ขึ้นว่าชำระแล้วจนกว่าบริษัทจะยืนยัน
    [Documentation]    Scenario: ลูกค้าโอนเงินงวด 1 แล้วแจ้งพร้อมสลิปในพอร์ทัล (การแจ้งโอนไม่ใช่เงินเข้า)
    ...    Pre: งวด 1 วางบิลแล้ว (TC_SALE_006) · เข้าสู่ระบบลูกค้า robot.sales
    ...    Steps: 1. ลูกค้าเปิด /my/payments → งวดที่ 1 | 2. แนบสลิปแล้วกด "ส่งแจ้งโอน" | 3. เปิดแท็บ "ประวัติการชำระ"
    ...    Data: สลิปจำลอง: ยอด = ยอดงวด 1 · วันที่ = วันนี้ · บัญชี 7260851635
    ...    Expected: งวด 1 เป็น "แจ้งโอนแล้ว รอตรวจ" · แท็บ "ประวัติการชำระ" ยังไม่มีงวด 1 (ยังไม่ถือว่าชำระแล้ว)
    [Tags]    priority:High    module:Customer Payment History
    Switch Browser    cust
    Open My Installment    ${SALES_PROJECT_NAME}    1
    Wait Until Page Contains Element    ${SLIP_INPUT}    15s
    ${amount}=    Get Value    xpath=//main//input[@type="number"]
    ${amount}=    Evaluate    f"{float($amount):.2f}"
    ${slip}=    Make Slip    mockslip_${amount}_S${SALES_RUN}A_${PAY_TODAY}_${PAY_ACCOUNT_NO}.png
    Choose File    ${SLIP_INPUT}    ${slip}
    Wait Until Element Is Enabled    ${NOTICE_SUBMIT}
    Click Button    ${NOTICE_SUBMIT}
    Wait Until Page Contains    แจ้งโอนแล้ว รอตรวจ    15s
    Go To    ${CLIENT_URL}/my/payments
    Click Payments Tab    ประวัติการชำระ
    ${listed}=    Run Keyword And Return Status    Element Should Contain    xpath=//main//section[@aria-label="ประวัติการชำระ"]    ${SALES_PROJECT_NAME}
    Should Not Be True    ${listed}    msg=งวดที่แค่แจ้งโอน (ยังไม่ยืนยัน) ไปขึ้นในประวัติการชำระแล้ว
    Set Suite Variable    ${SALES_AMOUNT_1}    ${amount}
    Record Actual    แจ้งโอนงวด 1 (${amount} บาท) แล้วขึ้น "แจ้งโอนแล้ว รอตรวจ" · ประวัติการชำระยังไม่มีงวดนี้

TC_SALE_009 บริษัทยืนยันแล้วลูกค้าเห็นงวดในประวัติการชำระและเปิดใบเสร็จได้
    [Documentation]    Scenario: พนักงานตรวจการแจ้งโอนแล้วกด "ยืนยัน & ออกใบเสร็จ" จากนั้นลูกค้าเปิดดูใบเสร็จ
    ...    Pre: งวด 1 มีการแจ้งโอนที่ตรวจสลิปผ่าน (TC_SALE_008)
    ...    Steps: 1. พนักงานกด "ยืนยัน & ออกใบเสร็จ" ที่งวด 1 → ยืนยัน | 2. ลูกค้าเปิด /my/payments แท็บ "ประวัติการชำระ" | 3. กดใบเสร็จ
    ...    Data: (การแจ้งโอนงวด 1)
    ...    Expected: หลังบ้านงวด 1 มีใบเสร็จ RC-… · พอร์ทัลมีงวด 1 ในประวัติการชำระพร้อมลิงก์ใบเสร็จ เปิดแล้วเป็นใบเลขเดียวกัน
    [Tags]    priority:High    module:Customer Payment History
    Switch Browser    staff
    Open Project Tab    ${SALES_PROJECT_ID}    contract
    Wait Until Page Contains Element    xpath=${ROW_1}//button[contains(., "ยืนยัน & ออกใบเสร็จ")]    15s
    Click Button    xpath=${ROW_1}//button[contains(., "ยืนยัน & ออกใบเสร็จ")]
    Click Dialog Button    ยืนยัน & ออกใบเสร็จ
    Wait Until Element Contains    xpath=${ROW_1}    ใบเสร็จรับเงิน RC-    15s
    ${staff_receipt}=    Get Text    xpath=(${ROW_1}//*[contains(normalize-space(.), "RC-")])[last()]
    ${docno}=    Evaluate    re.search(r"RC-[\\w-]+", $staff_receipt).group(0)    modules=re
    Switch Browser    cust
    Go To    ${CLIENT_URL}/my/payments
    Click Payments Tab    ประวัติการชำระ
    ${history}=    Set Variable    //main//section[@aria-label="ประวัติการชำระ"]
    Wait Until Element Contains    xpath=${history}    ${SALES_PROJECT_NAME}    15s
    ${row}=    Set Variable    ${history}//li[contains(., "${SALES_PROJECT_NAME}")]
    # ในพอร์ทัลลิงก์ใบเสร็จเขียนแค่ "ใบเสร็จรับเงิน" — ตรวจว่าเปิดแล้วเป็นใบเลขเดียวกับที่หลังบ้านออก
    ${receipt}=    Get Text    xpath=(${row}//a[contains(., "ใบเสร็จ")])[1]
    ${href}=    Get Element Attribute    xpath=(${row}//a[contains(., "ใบเสร็จ")])[1]    href
    Pdf Viewer Should Open    ${href}    ${docno}
    Record Actual    หลังบ้านออกใบเสร็จ ${docno} · พอร์ทัลมีงวด 1 ในประวัติการชำระพร้อมลิงก์ "${receipt}" เปิดแล้วเป็นใบ ${docno}


*** Keywords ***
Prepare Sales Suite
    Open Browser For Test    ${STAFF_URL}/login    alias=staff
    Login As Staff Owner
    Open Browser For Test    ${CLIENT_URL}/    alias=cust
    Go To Customer Login
    Submit Customer Login    ${SALES_EMAIL}    ${SALES_PASSWORD}
    Wait Until Page Contains Element    xpath=//header//button[@aria-label="บัญชีของฉัน (${SALES_FULLNAME})"]    15s
    Switch Browser    staff

Open Project Tab
    [Arguments]    ${project_id}    ${tab}
    Go To    ${STAFF_URL}/projects/${project_id}?tab=${tab}
    Wait Until Page Contains Element    xpath=//main//button[starts-with(normalize-space(.), "ภาพรวม")]    15s
    Sleep    1s    # แท็บโหลดข้อมูลของตัวเองตามหลังหัวหน้า

Click Dialog Button
    [Arguments]    ${label}
    Wait Until Element Is Visible    ${DIALOG}//button[normalize-space(.)="${label}"]
    Click Button    ${DIALOG}//button[normalize-space(.)="${label}"]

Create And Send Quote
    [Documentation]    สร้างใบเสนอราคาจากราคาปัจจุบัน → อนุมัติ (OWNER อนุมัติเองได้) → ส่งให้ลูกค้า
    [Arguments]    ${project_id}
    Switch Browser    staff
    Open Project Tab    ${project_id}    quotes
    Click Button    xpath=//main//button[normalize-space(.)="+ สร้างใบเสนอราคาใหม่"]
    Click Dialog Button    สร้าง
    Wait Until Page Contains Element    xpath=//main//button[normalize-space(.)="อนุมัติ"]    15s
    Click Button    xpath=//main//button[normalize-space(.)="อนุมัติ"]
    Click Dialog Button    อนุมัติ
    Wait Until Page Contains Element    xpath=//main//button[normalize-space(.)="ส่งให้ลูกค้า"]    15s
    Click Button    xpath=//main//button[normalize-space(.)="ส่งให้ลูกค้า"]
    Click Dialog Button    เปลี่ยนสถานะ
    Wait Until Page Contains Element    xpath=//main//tr[contains(., "ส่งแล้ว")]    15s

Open Customer Quote
    [Arguments]    ${project_name}
    Switch Browser    cust
    Go To    ${CLIENT_URL}/my/quotes
    Wait Until Page Contains Element    xpath=//main//a[contains(., "${project_name}")]    15s
    Click Element    xpath=//main//a[contains(., "${project_name}")]
    Wait Until Page Contains Element    xpath=//main//a[contains(., "เปิดใบเสนอราคา (PDF)")]    15s

Open Contract Editor
    Wait Until Page Contains Element    xpath=//main//button[starts-with(@aria-label, "แก้ข้อความและงวด")]    15s
    Click Button    xpath=//main//button[starts-with(@aria-label, "แก้ข้อความและงวด")]
    Wait Until Element Is Visible    xpath=(//main//input[@placeholder="ชำระเมื่อ ... แล้วเสร็จ"])[1]

Issue Invoice From Row
    [Documentation]    กด "วางบิล" ท้ายแถว → ใส่กำหนดชำระ = วันนี้ (ถ้ายังว่าง) → "ออกใบแจ้งหนี้"
    [Arguments]    ${row}
    Wait Until Page Contains Element    xpath=${row}//button[normalize-space(.)="วางบิล"]    15s
    Click Button    xpath=${row}//button[normalize-space(.)="วางบิล"]
    Wait Until Element Is Visible    xpath=//main//button[normalize-space(.)="ออกใบแจ้งหนี้"]
    ${due}=    Set Variable    //main//label[contains(., "กำหนดชำระ")]//input
    ${value}=    Get Value    xpath=${due}
    IF    not $value
        ${today}=    Evaluate    (lambda d: f"{d.day:02d}/{d.month:02d}/{d.year + 543}")(datetime.date.today())    modules=datetime
        Input Text    xpath=${due}    ${today}
    END
    Click Button    xpath=//main//button[normalize-space(.)="ออกใบแจ้งหนี้"]
    Wait Until Page Contains Element    xpath=${row}//a[starts-with(normalize-space(.), "ใบแจ้งหนี้ INV-")]    15s

Pdf Viewer Should Open
    [Documentation]    หน้าดูเอกสารของระบบ: iframe เต็มจอที่ชี้ไปที่ไฟล์ PDF (blob) และชื่อแท็บขึ้นต้นด้วยเลขเอกสาร
    ...                เปิดในแท็บเดียวกัน (ลิงก์จริงเปิดแท็บใหม่ — Robot เปิดด้วย Go To เพื่อไม่ต้องสลับหน้าต่าง)
    [Arguments]    ${href}    ${doc_no}
    ${back}=    Get Location
    Go To    ${href}
    Wait Until Page Contains Element    xpath=//iframe[starts-with(@src, "blob:")]    60s
    Wait Until Keyword Succeeds    15s    0.5s    Title Should Contain Text    ${doc_no}
    Go To    ${back}

Title Should Contain Text
    [Arguments]    ${text}
    ${title}=    Get Title
    Should Contain    ${title}    ${text}

Open My Installment
    [Arguments]    ${project_name}    ${seq}
    Go To    ${CLIENT_URL}/my/payments
    ${link}=    Set Variable    //main//a[contains(normalize-space(.), "งวดที่ ${seq} ")][contains(., "${project_name}")]
    Wait Until Page Contains Element    xpath=${link}    15s
    Click Element    xpath=${link}
    Wait Until Location Contains    /my/payments/
    Wait Until Page Contains    รายละเอียดงวด    15s

Click Payments Tab
    [Arguments]    ${label}
    Wait Until Page Contains Element    xpath=//main//*[@role="tab"][contains(., "${label}")]    15s
    Click Element    xpath=//main//*[@role="tab"][contains(., "${label}")]
    Sleep    0.5s

Make Slip
    [Documentation]    ไฟล์สลิปจำลอง — ชื่อไฟล์บอกผลที่ตัวตรวจจำลองจะอ่านได้ (mockslip_<ยอด>_<อ้างอิง>_<YYYYMMDD>_<บัญชี>)
    [Arguments]    ${name}
    ${dir}=    Set Variable    ${OUTPUT DIR}${/}slips
    Create Directory    ${dir}
    ${bytes}=    Evaluate    base64.b64decode("${PNG_1PX}")    modules=base64
    Create Binary File    ${dir}${/}${name}    ${bytes}
    RETURN    ${dir}${/}${name}
