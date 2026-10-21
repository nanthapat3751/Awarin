*** Settings ***
Documentation     หน้าบ้าน — ส่วนชำระเงินของลูกค้า (หน้าการชำระเงิน · แจ้งโอนพร้อมสลิป · ตรวจสลิปอัตโนมัติ · ยกเลิกการแจ้ง)
...
...               ข้อมูลมาจาก seed: โครงการ + สัญญาที่ลงนามแล้ว + วางบิลงวด 1–3 ของลูกค้าทดสอบ (results/payment-data.json)
...               สลิปเป็นไฟล์จำลอง (SLIP_PROVIDER=mock) ระบบอ่านยอด/เลขอ้างอิง/วันที่/บัญชีจากชื่อไฟล์ — ไม่เรียก SlipOK จริง
...               การแจ้งโอนงวด 1 ในไฟล์นี้ ฝั่งหลังบ้านใช้ต่อใน backend/04_payments.robot (รันหลังไฟล์นี้)
Resource          resource.robot
Library           OperatingSystem
Variables         ${CURDIR}/../results/payment-data.json
Suite Setup       Prepare Payment Suite
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        frontend    module:Customer Payments


*** Variables ***
${NOTICE_SUBMIT}      xpath=//main//button[@type="submit"][contains(., "ส่งแจ้งโอน")]
${SLIP_INPUT}         xpath=//main//input[@type="file"]
# PNG 1×1 จุด — ระบบตรวจชนิดไฟล์จากนามสกุลและเนื้อไฟล์ ผลการตรวจสลิปจำลองอ่านจากชื่อไฟล์
${PNG_1PX}            iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==


*** Test Cases ***
TC_PAY_CUS_001 หน้าการชำระเงินแสดงงวดที่ต้องชำระพร้อมยอด
    [Documentation]    Scenario: ลูกค้าเปิดหน้าการชำระเงินหลังบริษัทวางบิล 3 งวด
    ...    Pre: เข้าสู่ระบบด้วย robot.customer@example.test · สัญญาลงนามแล้ว และวางบิลงวด 1–3 (seed)
    ...    Steps: 1. เปิด /my/payments | 2. ดูแท็บ "ต้องชำระ"
    ...    Data: ยอดงวด 1–3 ตามสัญญาที่ seed สร้าง (เช่น 235,400.00 · 176,550.00 · 176,550.00)
    ...    Expected: แท็บ "ต้องชำระ" มี 3 งวด แต่ละงวดแสดงชื่อโครงการ เลขสัญญา ยอดที่ต้องโอน และปุ่ม "จ่ายเลย"
    [Tags]    priority:High
    Go To    ${CLIENT_URL}/my/payments
    Wait Until Page Contains    ${PAY_CONTRACT_NO}    15s
    Element Should Contain    xpath=//main//*[@role="tab"][contains(., "ต้องชำระ")]    3
    FOR    ${seq}    ${amount}    IN    1    ${PAY_AMOUNT_1}    2    ${PAY_AMOUNT_2}    3    ${PAY_AMOUNT_3}
        ${shown}=    Money    ${amount}
        Element Should Contain    xpath=//main//a[contains(normalize-space(.), "งวดที่ ${seq} ")]    ${shown}
    END
    Page Should Contain Element    xpath=(//main//a[contains(., "จ่ายเลย")])[3]
    ${a1}=    Money    ${PAY_AMOUNT_1}
    Record Actual    แท็บ "ต้องชำระ" มี 3 งวด ของสัญญา ${PAY_CONTRACT_NO} ยอดตรงตามสัญญา (งวด 1 = ${a1}) พร้อมปุ่ม "จ่ายเลย"

TC_PAY_CUS_002 แจ้งโอนโดยยังไม่แนบสลิป
    [Documentation]    Scenario: ลูกค้ากรอกฟอร์มแจ้งโอนแต่ยังไม่ได้แนบสลิป
    ...    Pre: อยู่หน้าชำระงวดที่ 1
    ...    Steps: 1. เปิดหน้าชำระงวดที่ 1 | 2. ไม่แนบสลิป | 3. ดูปุ่ม "ส่งแจ้งโอน"
    ...    Data: สลิป: (ไม่แนบ)
    ...    Expected: ปุ่ม "ส่งแจ้งโอน" กดไม่ได้ และบอกว่า "แนบสลิปก่อนจึงส่งได้"
    [Tags]    priority:Medium
    Open Installment    1
    Wait Until Page Contains Element    ${NOTICE_SUBMIT}    15s
    Element Should Be Disabled    ${NOTICE_SUBMIT}
    Page Should Contain    แนบสลิปก่อนจึงส่งได้
    Record Actual    ปุ่ม "ส่งแจ้งโอน" กดไม่ได้ และแสดง "แนบสลิปก่อนจึงส่งได้"

TC_PAY_CUS_003 แจ้งโอนพร้อมสลิปที่ยอดตรง
    [Documentation]    Scenario: ลูกค้าแจ้งโอนงวดที่ 1 พร้อมสลิปที่ยอด วันที่ และบัญชีปลายทางตรง
    ...    Pre: อยู่หน้าชำระงวดที่ 1 · ตั้งบัญชีรับเงินของบริษัทแล้ว
    ...    Steps: 1. เปิดหน้าชำระงวดที่ 1 (วันที่และยอดเติมให้แล้ว) | 2. แนบสลิป | 3. กด "ส่งแจ้งโอน"
    ...    Data: สลิปจำลอง: ยอด = ยอดงวด 1 · วันที่ = วันนี้ · บัญชี 7260851635
    ...    Expected: สถานะงวดเป็น "แจ้งโอนแล้ว รอตรวจ" และบอกว่า "ระบบตรวจสลิปกับธนาคารแล้ว รอบริษัทยืนยัน"
    [Tags]    priority:High
    Open Installment    1
    ${slip}=    Make Slip    mockslip_${PAY_AMOUNT_1}_R${PAY_RUN}A_${PAY_TODAY}_${PAY_ACCOUNT_NO}.png
    Wait Until Page Contains Element    ${SLIP_INPUT}    15s
    Choose File    ${SLIP_INPUT}    ${slip}
    Wait Until Element Is Enabled    ${NOTICE_SUBMIT}
    Click Button    ${NOTICE_SUBMIT}
    Wait Until Page Contains    ระบบตรวจสลิปกับธนาคารแล้ว รอบริษัทยืนยัน    15s
    Page Should Contain    แจ้งโอนแล้ว รอตรวจ
    Record Actual    สถานะ "แจ้งโอนแล้ว รอตรวจ" และแสดง "ระบบตรวจสลิปกับธนาคารแล้ว รอบริษัทยืนยัน"

TC_PAY_CUS_004 สลิปยอดไม่ตรงกับที่กรอก
    [Documentation]    Scenario: ลูกค้าแนบสลิปที่ยอดในสลิปไม่ตรงกับยอดที่พิมพ์ในฟอร์ม (เช่น แนบสลิปผิดใบ)
    ...    Pre: อยู่หน้าชำระงวดที่ 2
    ...    Steps: 1. เปิดหน้าชำระงวดที่ 2 (ยอดเติมให้ = ยอดงวด) | 2. แนบสลิปที่ยอดขาดศูนย์ไปหนึ่งตัว | 3. กด "ส่งแจ้งโอน"
    ...    Data: ยอดในฟอร์ม = ยอดงวด 2 · ยอดในสลิป = ยอดงวด 2 ÷ 10
    ...    Expected: ส่งได้ แต่ขึ้นกล่องเตือนทันที "ยอดในสลิปคือ … บาท ไม่ตรงกับที่คุณกรอก"
    [Tags]    priority:High
    Open Installment    2
    ${wrong}=    Evaluate    f"{float(${PAY_AMOUNT_2}) / 10:.2f}"
    ${slip}=    Make Slip    mockslip_${wrong}_R${PAY_RUN}B_${PAY_TODAY}_${PAY_ACCOUNT_NO}.png
    Wait Until Page Contains Element    ${SLIP_INPUT}    15s
    Choose File    ${SLIP_INPUT}    ${slip}
    Wait Until Element Is Enabled    ${NOTICE_SUBMIT}
    Click Button    ${NOTICE_SUBMIT}
    ${shown}=    Money    ${wrong}
    Wait Until Page Contains    ยอดในสลิปคือ ${shown} บาท ไม่ตรงกับที่คุณกรอก    15s
    Record Actual    ขึ้นกล่องเตือน "ยอดในสลิปคือ ${shown} บาท ไม่ตรงกับที่คุณกรอก"

TC_PAY_CUS_005 ยกเลิกการแจ้งโอนแล้วแจ้งใหม่ได้
    [Documentation]    Scenario: ลูกค้ายกเลิกการแจ้งโอนที่แนบสลิปผิด เพื่อแจ้งใหม่
    ...    Pre: งวดที่ 2 มีการแจ้งโอนรอตรวจ (จาก TC_PAY_CUS_004)
    ...    Steps: 1. เปิดหน้าชำระงวดที่ 2 | 2. กด "ยกเลิกการแจ้งนี้" | 3. ยืนยัน "ยกเลิกการแจ้ง"
    ...    Data: (การแจ้งจาก TC_PAY_CUS_004)
    ...    Expected: การแจ้งถูกยกเลิก ฟอร์มแจ้งโอนกลับมาให้แจ้งใหม่ได้ และกล่องเตือนยอดไม่ตรงหายไป
    [Tags]    priority:Medium
    Open Installment    2
    Wait Until Element Is Visible    xpath=//main//button[contains(., "ยกเลิกการแจ้งนี้")]
    Click Button    xpath=//main//button[contains(., "ยกเลิกการแจ้งนี้")]
    Wait Until Element Is Visible    xpath=//*[self::dialog or @role="dialog" or @role="alertdialog"]//button[normalize-space(.)="ยกเลิกการแจ้ง"]
    Click Button    xpath=//*[self::dialog or @role="dialog" or @role="alertdialog"]//button[normalize-space(.)="ยกเลิกการแจ้ง"]
    Wait Until Page Contains Element    ${NOTICE_SUBMIT}    15s
    Page Should Not Contain    ไม่ตรงกับที่คุณกรอก
    Record Actual    การแจ้งถูกยกเลิก ฟอร์ม "ส่งแจ้งโอน" กลับมา และกล่องเตือนยอดไม่ตรงหายไป


*** Keywords ***
Prepare Payment Suite
    Open Client App
    Login As Customer

Open Installment
    [Documentation]    เปิดหน้าชำระของงวดที่ระบุจากหน้าการชำระเงิน
    [Arguments]    ${seq}
    Go To    ${CLIENT_URL}/my/payments
    Wait Until Page Contains Element    xpath=//main//a[contains(normalize-space(.), "งวดที่ ${seq} ")]    15s
    Click Element    xpath=//main//a[contains(normalize-space(.), "งวดที่ ${seq} ")]
    Wait Until Location Contains    /my/payments/
    Wait Until Page Contains    รายละเอียดงวด    15s
    # ฟอร์มแจ้งโอน/กล่องการแจ้งโหลดตามหลังส่วนรายละเอียด — แต่ละเคสรอสิ่งที่ตัวเองใช้ก่อนเสมอ

Make Slip
    [Documentation]    ไฟล์สลิปจำลอง — ชื่อไฟล์บอกผลที่ตัวตรวจจำลองจะอ่านได้ (mockslip_<ยอด>_<อ้างอิง>_<YYYYMMDD>_<บัญชี>)
    [Arguments]    ${name}
    ${dir}=    Set Variable    ${OUTPUT DIR}${/}slips
    Create Directory    ${dir}
    ${bytes}=    Evaluate    base64.b64decode("${PNG_1PX}")    modules=base64
    Create Binary File    ${dir}${/}${name}    ${bytes}
    RETURN    ${dir}${/}${name}

Money
    [Arguments]    ${amount}
    ${text}=    Evaluate    f"{float(${amount}):,.2f}"
    RETURN    ${text}
