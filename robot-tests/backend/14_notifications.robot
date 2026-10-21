*** Settings ***
Documentation     หลังบ้าน — กระดิ่งการแจ้งเตือน (UI-GAP-14): ลูกค้าแจ้งโอน → กระดิ่งพนักงานขึ้นเลข → กดอ่าน → เลขลด → อ่านทั้งหมด
...
...               พนักงาน robot_bell (ADMIN — seed ล้างกระดิ่งทุกรอบ) · ลูกค้า robot.sales แจ้งโอนงวด 2 ของสัญญางานขาย
...               (backend/05_sales_flow.robot ลงนามสัญญาและยกเลิกใบแจ้งหนี้งวด 2 ไว้แล้ว — เคสนี้วางบิลงวด 2 ใหม่ก่อน)
...               ระบบดึงเลขกระดิ่งทุก 30 วินาที — ชุดนี้รีโหลดหน้าแทนการรอ
Resource          resource.robot
Resource          ../frontend/resource.robot
Library           OperatingSystem
Variables         ${CURDIR}/../results/ui-data.json
Variables         ${CURDIR}/../results/payment-data.json
Suite Setup       Prepare Bell Suite
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        backend    module:Notifications


*** Variables ***
${BELL_USER}          robot_bell
${BELL_PASSWORD}      Robot-Bell-2026!
${BELL_FULLNAME}      โรบอท กระดิ่ง
${BELL}               xpath=//header//button[@aria-label="การแจ้งเตือน"]
${ROW_2}              //main//tr[td[1][normalize-space(.)="2"]]
${PNG_1PX}            iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==


*** Test Cases ***
TC_BELL_001 ลูกค้าแจ้งโอนแล้วกระดิ่งของพนักงานขึ้นเลขเพิ่มหนึ่ง
    [Documentation]    Scenario: ลูกค้าแจ้งโอนงวดใหม่ พนักงานต้องรู้จากกระดิ่งโดยไม่ต้องเปิดหน้าสัญญาเอง
    ...    Pre: สัญญางานขายลงนามแล้ว (backend/05) · เข้าสู่ระบบ robot_bell และลูกค้า robot.sales
    ...    Steps: 1. จดเลขบนกระดิ่ง | 2. พนักงานวางบิลงวด 2 | 3. ลูกค้าแจ้งโอนงวด 2 พร้อมสลิป | 4. พนักงานรีโหลดหน้า แล้วเปิดกระดิ่ง
    ...    Data: สลิปจำลองยอดเท่ายอดงวด 2
    ...    Expected: เลขบนกระดิ่งเพิ่มขึ้น 1 · รายการบนสุดคือ "ลูกค้าแจ้งโอนเงิน … งวดที่ 2 …" แสดงเป็นยังไม่อ่าน
    [Tags]    priority:High
    Switch Browser    bell
    ${before}=    Bell Count
    Set Suite Variable    ${BEFORE}    ${before}
    Go To    ${STAFF_URL}/projects/${SALES_PROJECT_ID}?tab=contract
    ${can_bill}=    Run Keyword And Return Status    Wait Until Page Contains Element    xpath=${ROW_2}//button[normalize-space(.)="วางบิล"]    15s
    Skip If    not ${can_bill}    ข้าม: งวด 2 ของสัญญางานขายวางบิลไม่ได้ (backend/05_sales_flow.robot ต้องผ่านก่อน)
    Click Button    xpath=${ROW_2}//button[normalize-space(.)="วางบิล"]
    Wait Until Element Is Visible    xpath=//main//button[normalize-space(.)="ออกใบแจ้งหนี้"]
    ${due}=    Set Variable    //main//label[contains(., "กำหนดชำระ")]//input
    ${value}=    Get Value    xpath=${due}
    IF    not $value
        ${today}=    Evaluate    (lambda d: f"{d.day:02d}/{d.month:02d}/{d.year + 543}")(datetime.date.today())    modules=datetime
        Input Text    xpath=${due}    ${today}
    END
    Click Button    xpath=//main//button[normalize-space(.)="ออกใบแจ้งหนี้"]
    Wait Until Page Contains Element    xpath=${ROW_2}//a[starts-with(normalize-space(.), "ใบแจ้งหนี้ INV-")]    15s
    Switch Browser    cust
    Send Transfer Notice    2
    Switch Browser    bell
    Reload Page
    Wait Until Keyword Succeeds    20s    2s    Bell Count Should Be    ${before + 1}
    Click Button    ${BELL}
    ${top}=    Set Variable    (//header//div[contains(@class, "w-80")]//button[contains(@class, "text-left")])[1]
    Wait Until Element Is Visible    xpath=${top}
    Element Should Contain    xpath=${top}    ลูกค้าแจ้งโอนเงิน
    Element Should Contain    xpath=${top}    งวดที่ 2
    ${msg}=    Get Text    xpath=${top}
    Record Actual    กระดิ่ง ${before} → ${before + 1} · รายการบนสุด: "${msg.splitlines()[0][:90]}…"

TC_BELL_002 กดการแจ้งเตือนแล้วไปหน้าสัญญาและเลขบนกระดิ่งลดลง
    [Documentation]    Scenario: พนักงานกดรายการแจ้งโอนในกระดิ่งเพื่อไปตรวจ
    ...    Pre: กระดิ่งมีรายการแจ้งโอนที่ยังไม่อ่าน (TC_BELL_001)
    ...    Steps: 1. เปิดกระดิ่ง | 2. กดรายการบนสุด
    ...    Data: (ไม่มี)
    ...    Expected: ไปหน้าโครงการงานขาย แท็บสัญญาและการเงิน · เลขบนกระดิ่งลดลง 1
    [Tags]    priority:Medium
    Variable Should Exist    ${BEFORE}    msg=ไม่มีผลจาก TC_BELL_001
    Switch Browser    bell
    Reload Page    # แผงกระดิ่งจากเคสก่อนยังกางอยู่ — เริ่มจากหน้าที่ปิดแผงแล้ว
    ${now}=    Bell Count
    Click Button    ${BELL}
    ${top}=    Set Variable    (//header//div[contains(@class, "w-80")]//button[contains(@class, "text-left")])[1]
    Wait Until Element Is Visible    xpath=${top}
    Click Button    xpath=${top}
    Wait Until Location Contains    /projects/${SALES_PROJECT_ID}    15s
    Location Should Contain    tab=contract
    Wait Until Keyword Succeeds    15s    1s    Bell Count Should Be    ${now - 1}
    Record Actual    กดแล้วไปหน้าสัญญาของโครงการงานขาย · กระดิ่ง ${now} → ${now - 1}

TC_BELL_003 กดอ่านทั้งหมดแล้วเลขบนกระดิ่งหายไป
    [Documentation]    Scenario: พนักงานจัดการเรื่องที่ค้างแล้ว จึงกด "อ่านทั้งหมด"
    ...    Pre: กระดิ่งยังมีรายการที่ยังไม่อ่าน (การแจ้งโอนของชุดหน้าบ้านในรอบเดียวกัน)
    ...    Steps: 1. เปิดกระดิ่ง | 2. กด "อ่านทั้งหมด" | 3. รีโหลดหน้า
    ...    Data: (ไม่มี)
    ...    Expected: เลขบนกระดิ่งหายไป และหลังรีโหลดก็ยังไม่มีเลข (บันทึกที่เซิร์ฟเวอร์แล้ว)
    [Tags]    priority:Medium
    Switch Browser    bell
    ${now}=    Bell Count
    Skip If    ${now} == 0    ข้าม: ไม่มีรายการที่ยังไม่อ่านเหลือให้ทดสอบ "อ่านทั้งหมด"
    Click Button    ${BELL}
    Wait Until Element Is Visible    xpath=//button[normalize-space(.)="อ่านทั้งหมด"]
    Click Button    xpath=//button[normalize-space(.)="อ่านทั้งหมด"]
    Wait Until Keyword Succeeds    10s    1s    Bell Count Should Be    0
    Reload Page
    Wait Until Page Contains Element    ${BELL}    15s
    Sleep    2s
    Bell Count Should Be    0
    Record Actual    กด "อ่านทั้งหมด" แล้วเลข ${now} หายไป และหลังรีโหลดก็ยังเป็น 0


*** Keywords ***
Prepare Bell Suite
    Open Browser For Test    ${STAFF_URL}/login    alias=bell
    Go To Staff Login
    Submit Staff Login    ${BELL_USER}    ${BELL_PASSWORD}
    Wait Until Page Contains    ยินดีต้อนรับ ${BELL_FULLNAME}    15s
    Open Browser For Test    ${CLIENT_URL}/    alias=cust
    Go To Customer Login
    Submit Customer Login    ${SALES_EMAIL}    ${SALES_PASSWORD}
    Wait Until Page Contains Element    xpath=//header//button[@aria-label="บัญชีของฉัน (${SALES_FULLNAME})"]    15s

Bell Count
    [Documentation]    เลขบนกระดิ่ง (ไม่มีป้าย = 0)
    Wait Until Page Contains Element    ${BELL}    15s
    Sleep    1s
    ${t}=    Execute Javascript    const b = document.querySelector('header button[aria-label="การแจ้งเตือน"] span'); return b ? b.textContent.trim() : "0";
    Should Not Be Equal    ${t}    99+    msg=กระดิ่งเกิน 99 นับเลขไม่ได้
    ${n}=    Convert To Integer    ${t}
    RETURN    ${n}

Bell Count Should Be
    [Arguments]    ${expected}
    ${n}=    Bell Count
    Should Be Equal As Integers    ${n}    ${expected}

Send Transfer Notice
    [Arguments]    ${seq}
    Go To    ${CLIENT_URL}/my/payments
    ${link}=    Set Variable    //main//a[contains(normalize-space(.), "งวดที่ ${seq} ")][contains(., "${SALES_PROJECT_NAME}")]
    Wait Until Page Contains Element    xpath=${link}    15s
    Click Element    xpath=${link}
    Wait Until Page Contains    รายละเอียดงวด    15s
    Wait Until Page Contains Element    xpath=//main//input[@type="file"]    15s
    ${amount}=    Get Value    xpath=//main//input[@type="number"]
    ${amount}=    Evaluate    f"{float($amount):.2f}"
    ${dir}=    Set Variable    ${OUTPUT DIR}${/}slips
    Create Directory    ${dir}
    ${name}=    Set Variable    mockslip_${amount}_B${SALES_RUN}${seq}_${PAY_TODAY}_${PAY_ACCOUNT_NO}.png
    ${bytes}=    Evaluate    base64.b64decode("${PNG_1PX}")    modules=base64
    Create Binary File    ${dir}${/}${name}    ${bytes}
    Choose File    xpath=//main//input[@type="file"]    ${dir}${/}${name}
    Wait Until Element Is Enabled    xpath=//main//button[@type="submit"][contains(., "ส่งแจ้งโอน")]
    Click Button    xpath=//main//button[@type="submit"][contains(., "ส่งแจ้งโอน")]
    Wait Until Page Contains    แจ้งโอนแล้ว รอตรวจ    15s
