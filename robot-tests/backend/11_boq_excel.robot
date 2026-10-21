*** Settings ***
Documentation     หลังบ้าน — ส่งออก/นำเข้า Excel BOQ ผ่านหน้าจอ (UI-GAP-11) — ฟีเจอร์ที่เคยมีบั๊กจอขาว
...
...               โครงการ "ทดสอบ Excel" ของ seed มี BOQ 2 บรรทัด: ก = 4 × (1,000 + 500) · ข = 2 × (2,500 + 1,000) รวม 13,000.00
...               ส่งออกฉบับภายใน → แก้ปริมาณบรรทัด ก เป็น 6 ในไฟล์ (UiHelpers.Set Boq Quantity คงคอลัมน์รหัสบรรทัดที่ซ่อนไว้)
...               → นำเข้าไฟล์เดิมกลับ ระบบต้องรู้ว่าเป็นการแก้บรรทัดเดิม ไม่ใช่เพิ่มบรรทัดใหม่
Resource          resource.robot
Library           OperatingSystem
Variables         ${CURDIR}/../results/ui-data.json
Suite Setup       Prepare Excel Suite
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        backend    module:BOQ Excel


*** Variables ***
${ITEM_A}             งานทดสอบ Excel ก
${ITEM_B}             งานทดสอบ Excel ข


*** Test Cases ***
TC_BOQX_001 ส่งออก BOQ เป็น Excel ฉบับภายในได้ครบทุกบรรทัด
    [Documentation]    Scenario: พนักงานส่งออก BOQ ของโครงการเป็นไฟล์ Excel ไปตรวจหรือแก้ต่อ
    ...    Pre: โครงการทดสอบ Excel มี BOQ 2 บรรทัด · เข้าสู่ระบบ robot_owner
    ...    Steps: 1. แท็บ BOQ กด "ส่งออก Excel" | 2. เปิดไฟล์ที่ได้
    ...    Data: โครงการ [โรบอท] ทดสอบ Excel <รอบ>
    ...    Expected: ได้ไฟล์ .xlsx มีชีต "สรุป" + ชีตของหมวด และชีตซ่อนของระบบ · มีทั้งสองบรรทัดพร้อมชื่อโครงการ
    [Tags]    priority:High
    Empty Directory    ${DOWNLOADS}
    Open Boq Tab
    Click Button    xpath=//main//button[normalize-space(.)="ส่งออก Excel"]
    ${file}=    Wait For Download    ${DOWNLOADS}    .xlsx
    ${x}=    Xlsx Summary    ${file}
    Should Contain    ${x}[visible]    สรุป
    Should Not Be Empty    ${x}[hidden]    msg=ไม่มีชีตซ่อนของระบบ — นำไฟล์กลับเข้าไปแก้บรรทัดเดิมไม่ได้
    Should Contain    ${x}[text]    ${ITEM_A}
    Should Contain    ${x}[text]    ${ITEM_B}
    Should Contain    ${x}[text]    ${EXCEL_PROJECT_NAME}
    Set Suite Variable    ${EXPORTED}    ${file}
    Record Actual    ได้ไฟล์มีชีต ${x}[visible] (+ ชีตซ่อน ${x}[hidden]) มีบรรทัด "${ITEM_A}" และ "${ITEM_B}"

TC_BOQX_002 แก้ปริมาณในไฟล์แล้วนำเข้ากลับ ระบบแก้บรรทัดเดิมและยอดรวมเปลี่ยนตาม
    [Documentation]    Scenario: พนักงานแก้ปริมาณใน Excel ที่ส่งออกไป แล้วนำไฟล์กลับเข้าโครงการ
    ...    Pre: มีไฟล์จาก TC_BOQX_001
    ...    Steps: 1. แก้ปริมาณบรรทัด ก จาก 4 เป็น 6 ในไฟล์ | 2. กด "นำเข้า Excel" แล้วเลือกไฟล์ | 3. ดูตัวอย่าง | 4. กด "อัปเดต 1 รายการ"
    ...    Data: ปริมาณบรรทัด "งานทดสอบ Excel ก" = 6
    ...    Expected: ตัวอย่างบอก "จะแก้/เพิ่ม 1" "ไม่เปลี่ยน 1" · หลังนำเข้า BOQ ยังมี 2 บรรทัด และรวมต้นทุนตรงเป็น 16,000.00
    [Tags]    priority:High
    Variable Should Exist    ${EXPORTED}    msg=ไม่มีไฟล์จาก TC_BOQX_001
    ${edited}=    Set Variable    ${DOWNLOADS}${/}boq-edited.xlsx
    ${n}=    Set Boq Quantity    ${EXPORTED}    ${edited}    ${ITEM_A}    ${6}
    Should Be Equal As Integers    ${n}    1    msg=หาบรรทัด ${ITEM_A} ในไฟล์ไม่เจอ
    Open Boq Tab
    Click Button    xpath=//main//button[normalize-space(.)="นำเข้า Excel"]
    Wait Until Page Contains Element    id=boq-import-file    15s
    Choose File    id=boq-import-file    ${edited}
    Wait Until Page Contains Element    xpath=//button[starts-with(normalize-space(.), "จะแก้/เพิ่ม 1")]    20s
    Page Should Contain Element    xpath=//button[starts-with(normalize-space(.), "ไม่เปลี่ยน 1")]
    Click Button    xpath=//button[normalize-space(.)="อัปเดต 1 รายการ"]
    # การ์ด "ต้นทุนตรง" หัวหน้าโครงการ = ผลรวมทุกบรรทัด (6 × 1,500 + 2 × 3,500)
    Wait Until Page Contains    16,000.00    20s
    Page Should Not Contain    13,000.00
    Element Should Contain    xpath=//main//button[starts-with(normalize-space(.), "BOQ")]    2
    Record Actual    ตัวอย่างบอก "จะแก้/เพิ่ม 1 · ไม่เปลี่ยน 1" · นำเข้าแล้ว BOQ ยัง 2 บรรทัด รวมต้นทุนตรง 16,000.00

TC_BOQX_003 นำเข้าไฟล์ที่ไม่ใช่ Excel ไม่ทำให้หน้าจอพัง
    [Documentation]    Scenario: พนักงานเลือกไฟล์ผิด (ไฟล์ข้อความที่ตั้งนามสกุลเป็น .xlsx)
    ...    Pre: อยู่แท็บ BOQ ของโครงการทดสอบ Excel
    ...    Steps: 1. กด "นำเข้า Excel" | 2. เลือกไฟล์ปลอม
    ...    Data: ไฟล์ข้อความ "not an excel file" นามสกุล .xlsx
    ...    Expected: มีข้อความบอกว่าอ่านไฟล์ไม่ได้ หน้าต่างนำเข้ายังอยู่ (ไม่จอขาว) และ BOQ ไม่เปลี่ยน
    [Tags]    priority:Medium
    ${fake}=    Set Variable    ${DOWNLOADS}${/}fake.xlsx
    Create File    ${fake}    not an excel file
    Open Boq Tab
    Click Button    xpath=//main//button[normalize-space(.)="นำเข้า Excel"]
    Wait Until Page Contains Element    id=boq-import-file    15s
    Choose File    id=boq-import-file    ${fake}
    Sleep    2s
    Page Should Contain Element    xpath=//*[self::dialog or @role="dialog"]//*[contains(., "นำเข้า BOQ จาก Excel")]
    ${msg}=    Get Text    xpath=//*[self::dialog or @role="dialog"]
    ${told}=    Evaluate    bool(re.search("อ่านไฟล์|ไม่ใช่ไฟล์|ไม่ถูกต้อง|ไม่ได้", $msg))    modules=re
    Should Be True    ${told}    msg=เลือกไฟล์ปลอมแล้วไม่มีข้อความบอกผู้ใช้
    Element Should Contain    xpath=//main    รวมต้นทุนตรงทั้งหมด
    Record Actual    เลือกไฟล์ปลอมแล้วมีข้อความเตือน หน้าต่างนำเข้ายังอยู่ ไม่จอขาว


*** Keywords ***
Prepare Excel Suite
    Set Suite Variable    ${DOWNLOADS}    ${OUTPUT DIR}${/}downloads${/}boq
    Open Browser For Test    ${STAFF_URL}/login    download_dir=${DOWNLOADS}
    Login As Staff Owner

Open Boq Tab
    Go To    ${STAFF_URL}/projects/${EXCEL_PROJECT_ID}?tab=boq
    Wait Until Page Contains Element    xpath=//main//button[normalize-space(.)="ส่งออก Excel"]    15s
    Wait Until Page Contains    รวมต้นทุนตรงทั้งหมด    15s
