*** Settings ***
Documentation     หลังบ้าน — ถังขยะ (UI-GAP-13): ลบ → อยู่ในถังขยะ → กู้คืน · OWNER ลบถาวร · ADMIN ลบถาวรไม่ได้
...
...               seed สร้างโครงการเปล่าสองโครงการ (ยังไม่มีใบเสนอราคา จึงลบได้): "ถังขยะ กู้คืน" และ "ถังขยะ ลบถาวร"
Resource          resource.robot
Variables         ${CURDIR}/../results/ui-data.json
Suite Setup       Prepare Trash Suite
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        backend    module:Trash


*** Variables ***
${DIALOG}             xpath=//*[self::dialog or @role="dialog" or @role="alertdialog"]
${PROJECT_SEARCH}     xpath=//input[starts-with(@placeholder, "ค้นหาจากชื่อโครงการ")]
${ADMIN_USER}         robot_admin
${ADMIN_PASSWORD}     Robot-Admin-2026!


*** Test Cases ***
TC_TRASH_001 ลบโครงการแล้วหายจากรายการโครงการ
    [Documentation]    Scenario: พนักงานลบโครงการที่สร้างผิดออกจากรายการ
    ...    Pre: โครงการ "ถังขยะ กู้คืน" ยังไม่มีใบเสนอราคา · เข้าสู่ระบบ robot_owner
    ...    Steps: 1. เปิด /projects ค้นชื่อโครงการ | 2. กด "ลบ" | 3. ยืนยัน "ลบ"
    ...    Data: [โรบอท] ทดสอบถังขยะ กู้คืน <รอบ>
    ...    Expected: ขึ้น "ย้ายโครงการไปถังขยะแล้ว" และโครงการหายจากรายการ
    [Tags]    priority:High
    Switch Browser    owner
    Delete Project From List    ${TRASH_RESTORE_NAME}
    Record Actual    ลบ "${TRASH_RESTORE_NAME}" แล้วหายจากรายการโครงการ

TC_TRASH_002 โครงการที่ลบอยู่ในถังขยะพร้อมวันที่จะถูกลบถาวร
    [Documentation]    Scenario: พนักงานเปิดเมนูถังขยะเพื่อหาโครงการที่เพิ่งลบ
    ...    Pre: ลบโครงการแล้ว (TC_TRASH_001)
    ...    Steps: 1. เปิด /trash
    ...    Data: (ไม่มี)
    ...    Expected: มีแถวของโครงการที่ลบ บอกจำนวนวันที่เหลือก่อนลบถาวร และมีปุ่ม "กู้คืน"
    [Tags]    priority:High
    Switch Browser    owner
    Open Trash Row    ${TRASH_RESTORE_NAME}
    ${left}=    Get Text    xpath=${TRASH_ROW}//td[contains(., "วัน")]
    Page Should Contain Element    xpath=${TRASH_ROW}//button[contains(., "กู้คืน")]
    Record Actual    อยู่ในถังขยะ เหลือ ${left} ก่อนลบถาวร พร้อมปุ่ม "กู้คืน"

TC_TRASH_003 กู้คืนโครงการจากถังขยะแล้วกลับมาในรายการโครงการ
    [Documentation]    Scenario: พนักงานลบผิดโครงการ จึงกู้คืน
    ...    Pre: โครงการอยู่ในถังขยะ (TC_TRASH_002)
    ...    Steps: 1. กด "กู้คืน" | 2. เปิด /projects ค้นชื่อ
    ...    Data: (โครงการจาก TC_TRASH_001)
    ...    Expected: ขึ้น "กู้คืน … แล้ว" แถวหายจากถังขยะ · โครงการกลับมาในรายการ
    [Tags]    priority:High
    Switch Browser    owner
    Open Trash Row    ${TRASH_RESTORE_NAME}
    Click Button    xpath=${TRASH_ROW}//button[contains(., "กู้คืน")]
    Wait Until Page Contains    แล้ว    10s
    Wait Until Page Does Not Contain Element    xpath=${TRASH_ROW}    15s
    Find Project In List    ${TRASH_RESTORE_NAME}
    Record Actual    กู้คืนแล้วหายจากถังขยะ และ "${TRASH_RESTORE_NAME}" กลับมาในรายการโครงการ

TC_TRASH_004 ADMIN เห็นถังขยะแต่ลบถาวรไม่ได้
    [Documentation]    Scenario: พนักงาน ADMIN เปิดถังขยะ (การลบถาวรกู้ไม่ได้ ทำได้เฉพาะเจ้าของระบบ)
    ...    Pre: OWNER ลบโครงการ "ถังขยะ ลบถาวร" เข้าถังขยะ · เข้าสู่ระบบ robot_admin อีกเบราว์เซอร์
    ...    Steps: 1. OWNER ลบโครงการ | 2. ADMIN เปิด /trash
    ...    Data: [โรบอท] ทดสอบถังขยะ ลบถาวร <รอบ>
    ...    Expected: ADMIN เห็นแถวและปุ่ม "กู้คืน" แต่ไม่มีปุ่ม "ลบถาวร" และมีข้อความ "การลบถาวรทำได้เฉพาะเจ้าของระบบ (OWNER)"
    [Tags]    priority:High    security
    Switch Browser    owner
    Delete Project From List    ${TRASH_PURGE_NAME}
    Switch Browser    admin
    Open Trash Row    ${TRASH_PURGE_NAME}
    Page Should Contain Element    xpath=${TRASH_ROW}//button[contains(., "กู้คืน")]
    Page Should Not Contain Element    xpath=${TRASH_ROW}//button[contains(., "ลบถาวร")]
    Page Should Contain    การลบถาวรทำได้เฉพาะเจ้าของระบบ (OWNER)
    Record Actual    ADMIN เห็นแถวและปุ่ม "กู้คืน" ไม่มีปุ่ม "ลบถาวร" และเห็นข้อความว่าทำได้เฉพาะ OWNER

TC_TRASH_005 OWNER ลบถาวรแล้วหายทั้งจากถังขยะและรายการโครงการ
    [Documentation]    Scenario: เจ้าของกิจการลบโครงการทิ้งถาวร
    ...    Pre: โครงการ "ถังขยะ ลบถาวร" อยู่ในถังขยะ (TC_TRASH_004)
    ...    Steps: 1. OWNER เปิด /trash | 2. กด "ลบถาวร" | 3. ยืนยัน "ลบถาวร"
    ...    Data: (โครงการจาก TC_TRASH_004)
    ...    Expected: หน้าต่างเตือนว่ากู้คืนไม่ได้อีก · ยืนยันแล้วแถวหายจากถังขยะ และค้นในรายการโครงการไม่เจอ
    [Tags]    priority:High
    Switch Browser    owner
    Open Trash Row    ${TRASH_PURGE_NAME}
    Click Button    xpath=${TRASH_ROW}//button[contains(., "ลบถาวร")]
    Wait Until Element Is Visible    ${DIALOG}//button[normalize-space(.)="ลบถาวร"]
    Element Should Contain    ${DIALOG}    กู้คืนไม่ได้อีก
    Click Button    ${DIALOG}//button[normalize-space(.)="ลบถาวร"]
    Wait Until Page Does Not Contain Element    xpath=${TRASH_ROW}    15s
    Go To    ${STAFF_URL}/projects
    Wait Until Element Is Visible    ${PROJECT_SEARCH}    15s
    Input Text    ${PROJECT_SEARCH}    ${TRASH_PURGE_NAME}
    Sleep    1.5s
    Page Should Not Contain Element    xpath=//a[normalize-space(.)="${TRASH_PURGE_NAME}"]
    Record Actual    เตือน "กู้คืนไม่ได้อีก" · ลบถาวรแล้วหายจากถังขยะ และค้นในรายการโครงการไม่เจอ


*** Keywords ***
Prepare Trash Suite
    Open Browser For Test    ${STAFF_URL}/login    alias=owner
    Login As Staff Owner
    Open Browser For Test    ${STAFF_URL}/login    alias=admin
    Go To Staff Login
    Submit Staff Login    ${ADMIN_USER}    ${ADMIN_PASSWORD}
    Wait Until Page Contains    ยินดีต้อนรับ    15s
    Switch Browser    owner

Find Project In List
    [Arguments]    ${name}
    Go To    ${STAFF_URL}/projects
    Wait Until Element Is Visible    ${PROJECT_SEARCH}    15s
    Input Text    ${PROJECT_SEARCH}    ${name}
    Wait Until Page Contains Element    xpath=//a[normalize-space(.)="${name}"]    15s

Delete Project From List
    [Arguments]    ${name}
    Find Project In List    ${name}
    Click Button    xpath=//tr[.//a[normalize-space(.)="${name}"]]//button[contains(., "ลบ")]
    Wait Until Element Is Visible    ${DIALOG}//button[normalize-space(.)="ลบ"]
    Click Button    ${DIALOG}//button[normalize-space(.)="ลบ"]
    Wait Until Page Contains    ย้ายโครงการไปถังขยะแล้ว    10s
    Wait Until Page Does Not Contain Element    xpath=//a[normalize-space(.)="${name}"]    15s

Open Trash Row
    [Arguments]    ${name}
    Go To    ${STAFF_URL}/trash
    Set Test Variable    ${TRASH_ROW}    //main//tr[contains(., "${name}")]
    Wait Until Page Contains Element    xpath=${TRASH_ROW}    15s
