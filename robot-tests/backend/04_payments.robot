*** Settings ***
Documentation     หลังบ้าน — การรับเงินรายงวด (ยืนยันการแจ้งโอน · บันทึกรับเงิน · ตรวจทาน · ยืนยันกับบัญชี · ออกใบเสร็จ)
...
...               ใช้สัญญาที่ seed สร้าง (results/payment-data.json) และการแจ้งโอนงวด 1 ที่ frontend/04_payments.robot ส่งไว้
...               (test-env.mjs รันฝั่งหน้าบ้านก่อนเสมอ) — ถ้าไม่มีการแจ้งโอน เคสที่ต้องใช้จะถูกข้าม (Block)
Resource          resource.robot
Variables         ${CURDIR}/../results/payment-data.json
Suite Setup       Prepare Staff Payment Suite
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        backend    module:Staff Payments


*** Variables ***
${DIALOG}         xpath=//*[@role="dialog" or @role="alertdialog"]


*** Test Cases ***
TC_PAY_STAFF_001 เห็นการแจ้งโอนของลูกค้าพร้อมผลตรวจสลิป
    [Documentation]    Scenario: พนักงานเปิดสัญญาที่ลูกค้าแจ้งโอนงวด 1 พร้อมสลิปที่ระบบตรวจผ่าน
    ...    Pre: ลูกค้าแจ้งโอนงวด 1 แล้ว (TC_PAY_CUS_003) · เข้าสู่ระบบด้วย robot_owner
    ...    Steps: 1. เปิดโครงการ แท็บ "สัญญาและการเงิน" | 2. ดูงวดที่ 1
    ...    Data: การแจ้งโอนงวด 1 ยอดเท่ายอดงวด พร้อมสลิปจำลองที่ยอด/วันที่/บัญชีตรง
    ...    Expected: เห็นการแจ้งโอนของลูกค้า ป้าย "ตรวจสลิปกับธนาคารแล้ว" และปุ่ม "ยืนยัน & ออกใบเสร็จ"
    [Tags]    priority:High
    Open Contract Payments
    Require Customer Notice
    Page Should Contain    ตรวจสลิปกับธนาคารแล้ว
    Page Should Contain Element    xpath=//main//button[contains(., "ยืนยัน & ออกใบเสร็จ")]
    Record Actual    เห็นการแจ้งโอนงวด 1 พร้อมป้าย "ตรวจสลิปกับธนาคารแล้ว" และปุ่ม "ยืนยัน & ออกใบเสร็จ"

TC_PAY_STAFF_002 ยืนยันการแจ้งโอนและออกใบเสร็จในคลิกเดียว
    [Documentation]    Scenario: พนักงานยืนยันการแจ้งโอนที่ระบบตรวจสลิปผ่านแล้ว พร้อมออกใบเสร็จทันที
    ...    Pre: งวด 1 มีการแจ้งโอนที่ตรวจสลิปผ่าน (TC_PAY_STAFF_001)
    ...    Steps: 1. กด "ยืนยัน & ออกใบเสร็จ" | 2. ยืนยันในหน้าต่างถามซ้ำ
    ...    Data: (การแจ้งโอนงวด 1)
    ...    Expected: งวด 1 รับครบ มีใบเสร็จรับเงินเลขที่ RC-… และขึ้นว่ายืนยันกับบัญชีแล้ว
    [Tags]    priority:High
    Open Contract Payments
    Require Customer Notice
    Click Button    xpath=//main//button[contains(., "ยืนยัน & ออกใบเสร็จ")]
    Wait Until Element Is Visible    ${DIALOG}//button[contains(., "ยืนยัน & ออกใบเสร็จ")]
    Click Button    ${DIALOG}//button[contains(., "ยืนยัน & ออกใบเสร็จ")]
    Wait Until Element Contains    ${ROW_1}    ใบเสร็จรับเงิน RC-    15s
    Element Should Contain    ${ROW_1}    ยืนยันกับบัญชี
    Element Should Contain    ${ROW_1}    รับครบแล้ว
    ${receipt}=    Get Text    xpath=(${ROW_1}//*[contains(normalize-space(.), "RC-")])[last()]
    Record Actual    งวด 1 รับครบ ยืนยันกับบัญชีแล้ว และออกใบเสร็จ (${receipt})

TC_PAY_STAFF_003 บันทึกรับเงินยอดผิดหลายเท่าได้คำเตือนก่อนบันทึก
    [Documentation]    Scenario: พนักงานพิมพ์ยอดรับเงินเกินไปหนึ่งหลัก (พิมพ์ศูนย์เกิน)
    ...    Pre: งวด 2 วางบิลแล้ว ยังไม่ได้รับเงิน (ลูกค้ายกเลิกการแจ้งไปแล้วใน TC_PAY_CUS_005)
    ...    Steps: 1. กด "ลูกค้าจ่ายแล้ว" ที่งวด 2 | 2. กาง "รับไม่ครบ / เลขอ้างอิง / หมายเหตุ" | 3. แก้ยอดที่ชำระเป็น 10 เท่า | 4. กด "บันทึกรับเงิน"
    ...    Data: ยอดที่ชำระ = ยอดงวด 2 × 10
    ...    Expected: ยังไม่บันทึก ขึ้นขั้น "ตรวจทานก่อนบันทึก" พร้อมคำเตือน "…หลายเท่า — พิมพ์ศูนย์ขาดหรือเกินหรือเปล่า" และกด "กลับไปแก้" ได้
    [Tags]    priority:High
    Open Contract Payments
    Click Button    ${ROW_2}//button[normalize-space(.)="ลูกค้าจ่ายแล้ว"]
    Wait Until Element Is Visible    xpath=//main//button[contains(., "รับไม่ครบ / เลขอ้างอิง")]
    Click Button    xpath=//main//button[contains(., "รับไม่ครบ / เลขอ้างอิง")]
    ${tenfold}=    Evaluate    f"{float(${PAY_AMOUNT_2}) * 10:.2f}"
    Input Text    ${AMOUNT_INPUT}    ${tenfold}
    Click Button    xpath=//main//button[normalize-space(.)="บันทึกรับเงิน"]
    Wait Until Page Contains    ตรวจทานก่อนบันทึก
    Page Should Contain    พิมพ์ศูนย์ขาดหรือเกินหรือเปล่า
    Click Button    xpath=//main//button[normalize-space(.)="กลับไปแก้"]
    Wait Until Page Does Not Contain    พิมพ์ศูนย์ขาดหรือเกินหรือเปล่า
    Element Should Contain    ${ROW_2}    ยังไม่ได้รับ
    Record Actual    ขึ้นขั้นตรวจทานพร้อมคำเตือน "…หลายเท่า — พิมพ์ศูนย์ขาดหรือเกินหรือเปล่า" กด "กลับไปแก้" แล้วยังไม่มีอะไรถูกบันทึก

TC_PAY_STAFF_004 บันทึกรับเงินผ่านขั้นตรวจทาน แล้วรอยืนยันกับบัญชี
    [Documentation]    Scenario: พนักงานบันทึกรับเงินงวด 3 เต็มจำนวนโดยไม่มีสลิป
    ...    Pre: งวด 3 วางบิลแล้ว ยังไม่ได้รับเงิน
    ...    Steps: 1. กด "ลูกค้าจ่ายแล้ว" ที่งวด 3 | 2. กด "บันทึกรับเงิน" | 3. อ่านขั้นตรวจทาน | 4. กด "ยืนยันบันทึก"
    ...    Data: ยอด = ยอดงวด 3 (เติมให้) · ช่องทาง: โอนเงิน · สลิป: (ไม่แนบ)
    ...    Expected: ขั้นตรวจทานเตือน "ยังไม่ได้แนบสลิป" · บันทึกแล้วงวด 3 เป็น "รอยืนยันกับบัญชี" และยังออกใบเสร็จไม่ได้
    [Tags]    priority:High
    Open Contract Payments
    Click Button    ${ROW_3}//button[normalize-space(.)="ลูกค้าจ่ายแล้ว"]
    Wait Until Element Is Visible    xpath=//main//button[normalize-space(.)="บันทึกรับเงิน"]
    Click Button    xpath=//main//button[normalize-space(.)="บันทึกรับเงิน"]
    Wait Until Page Contains    ตรวจทานก่อนบันทึก
    Page Should Contain    ยังไม่ได้แนบสลิป
    Click Button    xpath=//main//button[normalize-space(.)="ยืนยันบันทึก"]
    Wait Until Element Contains    ${ROW_3}    รอยืนยันกับบัญชี    15s
    Element Should Not Contain    ${ROW_3}    ใบเสร็จรับเงิน RC-
    Page Should Contain Element    ${ROW_3}//button[normalize-space(.)="ยืนยันเงินเข้า"]
    Record Actual    ขั้นตรวจทานเตือน "ยังไม่ได้แนบสลิป" · บันทึกแล้วงวด 3 เป็น "รอยืนยันกับบัญชี" ปุ่มถัดไปคือ "ยืนยันเงินเข้า" ยังไม่มีใบเสร็จ

TC_PAY_STAFF_005 ยืนยันเงินเข้าแล้วจึงออกใบเสร็จได้
    [Documentation]    Scenario: เจ้าของกิจการเทียบบัญชีธนาคารแล้วยืนยันเงินเข้า จากนั้นออกใบเสร็จ
    ...    Pre: งวด 3 มีรายการรับเงินรอยืนยันกับบัญชี (TC_PAY_STAFF_004)
    ...    Steps: 1. กด "ยืนยันเงินเข้า" | 2. กด "ตรงกับบัญชีแล้ว" | 3. กด "ออกใบเสร็จ" | 4. ยืนยัน "ออกใบเสร็จ"
    ...    Data: (รายการรับเงินงวด 3)
    ...    Expected: งวด 3 ขึ้น "ยืนยันกับบัญชีโดย โรบอท เจ้าของ" แล้วออกใบเสร็จรับเงินเลขที่ RC-… ได้
    [Tags]    priority:High
    Open Contract Payments
    Wait Until Page Contains Element    ${ROW_3}//button[normalize-space(.)="ยืนยันเงินเข้า"]
    Click Button    ${ROW_3}//button[normalize-space(.)="ยืนยันเงินเข้า"]
    Wait Until Element Is Visible    ${DIALOG}//button[normalize-space(.)="ตรงกับบัญชีแล้ว"]
    Click Button    ${DIALOG}//button[normalize-space(.)="ตรงกับบัญชีแล้ว"]
    Wait Until Element Contains    ${ROW_3}    ยืนยันกับบัญชีโดย ${STAFF_FULLNAME}    15s
    Click Button    ${ROW_3}//button[normalize-space(.)="ออกใบเสร็จ"]
    Wait Until Element Is Visible    ${DIALOG}//button[normalize-space(.)="ออกใบเสร็จ"]
    Click Button    ${DIALOG}//button[normalize-space(.)="ออกใบเสร็จ"]
    Wait Until Element Contains    ${ROW_3}    ใบเสร็จรับเงิน RC-    15s
    ${receipt}=    Get Text    xpath=(${ROW_3}//*[contains(normalize-space(.), "RC-")])[last()]
    Record Actual    ยืนยันกับบัญชีโดย ${STAFF_FULLNAME} แล้วออกใบเสร็จ (${receipt})


*** Keywords ***
Prepare Staff Payment Suite
    Open Staff App
    Login As Staff Owner
    Set Suite Variable    ${ROW_1}    //main//tr[td[1][normalize-space(.)="1"]]
    Set Suite Variable    ${ROW_2}    //main//tr[td[1][normalize-space(.)="2"]]
    Set Suite Variable    ${ROW_3}    //main//tr[td[1][normalize-space(.)="3"]]
    Set Suite Variable    ${AMOUNT_INPUT}    //main//label[contains(., "ยอดที่ชำระ")]//input[@type="number"]

Open Contract Payments
    Go To    ${STAFF_URL}/projects/${PAY_PROJECT_ID}?tab=contract
    Wait Until Page Contains    การรับเงินรายงวด    15s
    Wait Until Page Contains Element    ${ROW_1}

Require Customer Notice
    ${has}=    Run Keyword And Return Status    Page Should Contain Element    xpath=//main//button[contains(., "ตรวจสลิป")]
    Skip If    not ${has}    ข้ามเพราะไม่มีการแจ้งโอนจากลูกค้า (TC_PAY_CUS_003 ต้องผ่านก่อน)
