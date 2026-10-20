*** Settings ***
Documentation     หน้าบ้าน — การตรวจข้อมูลในฟอร์มสมัครสมาชิก
...
...               ทุกเคสในไฟล์นี้หยุดที่การตรวจในหน้าจอ (ข้อมูลไม่ครบจึงไม่ถูกส่งไปเซิร์ฟเวอร์)
...               จึงไม่สร้างบัญชีและไม่ส่งอีเมล
Resource          resource.robot
Suite Setup       Open Client App
Suite Teardown    Close All Browsers
Test Setup        Open Register Form
Test Teardown     Capture Evidence
Force Tags        frontend    module:Customer Registration


*** Variables ***
${VALID_NAME}        สมชาย ทดสอบ
${VALID_EMAIL}       somchai.robot@example.com
${VALID_PHONE}       0812345678
${VALID_PASSWORD}    Sunset-Hill-58#
${REGISTER_BUTTON}    xpath=//form//button[@type="submit"][contains(., "สมัครสมาชิก")]


*** Test Cases ***
TC_REG_001 กดสมัครโดยไม่กรอกข้อมูล
    [Documentation]    Scenario: กดปุ่มสมัครสมาชิกโดยเว้นทุกช่องว่าง
    ...    Pre: อยู่หน้า /register
    ...    Steps: 1. เปิด /register | 2. กดปุ่ม "สมัครสมาชิก" ทันที
    ...    Data: ทุกช่อง: (ว่าง)
    ...    Expected: ไม่สมัคร แสดงคำเตือนภาษาไทยใต้ช่องชื่อ อีเมล และเบอร์โทรศัพท์
    [Tags]    priority:Medium
    Click Button    ${REGISTER_BUTTON}
    Register Field Error Should Be    กรุณากรอกชื่อ-นามสกุล
    Page Should Contain    กรุณากรอกอีเมล
    Page Should Contain    กรุณากรอกเบอร์โทรศัพท์
    Record Actual    แสดง "กรุณากรอกชื่อ-นามสกุล" "กรุณากรอกอีเมล" "กรุณากรอกเบอร์โทรศัพท์" ยังอยู่หน้า /register

TC_REG_002 กรอกชื่อคำเดียวไม่มีนามสกุล
    [Documentation]    Scenario: ตรวจสอบช่องชื่อเมื่อกรอกแค่ชื่อ ไม่มีนามสกุล
    ...    Pre: อยู่หน้า /register
    ...    Steps: 1. กรอกชื่อคำเดียว | 2. กรอกช่องอื่นถูกต้อง | 3. กดสมัครสมาชิก
    ...    Data: ชื่อ: สมชาย · อีเมล: somchai.robot@example.com · เบอร์: 0812345678
    ...    Expected: ไม่สมัคร แสดง "กรุณากรอกทั้งชื่อและนามสกุล"
    [Tags]    priority:Medium
    Fill Register Form    สมชาย    ${VALID_EMAIL}    ${VALID_PHONE}    ${VALID_PASSWORD}    ${VALID_PASSWORD}
    Click Button    ${REGISTER_BUTTON}
    Register Field Error Should Be    กรุณากรอกทั้งชื่อและนามสกุล
    Record Actual    แสดง "กรุณากรอกทั้งชื่อและนามสกุล" ไม่สมัคร

TC_REG_003 กรอกอีเมลผิดรูปแบบ
    [Documentation]    Scenario: ตรวจสอบช่องอีเมลเมื่อพิมพ์ไม่ครบ
    ...    Pre: อยู่หน้า /register
    ...    Steps: 1. กรอกอีเมลที่ไม่มีโดเมน | 2. กรอกช่องอื่นถูกต้อง | 3. กดสมัครสมาชิก
    ...    Data: อีเมล: somchai.robot@
    ...    Expected: ไม่สมัคร แสดง "กรุณากรอกอีเมลให้ถูกต้อง"
    [Tags]    priority:Medium
    Fill Register Form    ${VALID_NAME}    somchai.robot@    ${VALID_PHONE}    ${VALID_PASSWORD}    ${VALID_PASSWORD}
    Click Button    ${REGISTER_BUTTON}
    Register Field Error Should Be    กรุณากรอกอีเมลให้ถูกต้อง
    Record Actual    แสดง "กรุณากรอกอีเมลให้ถูกต้อง" ไม่สมัคร

TC_REG_004 กรอกเบอร์โทรศัพท์บ้านแทนเบอร์มือถือ
    [Documentation]    Scenario: ตรวจสอบช่องเบอร์โทรเมื่อกรอกเบอร์บ้าน 9 หลัก
    ...    Pre: อยู่หน้า /register
    ...    Steps: 1. กรอกเบอร์ 02xxxxxxx | 2. กรอกช่องอื่นถูกต้อง | 3. กดสมัครสมาชิก
    ...    Data: เบอร์: 021234567
    ...    Expected: ไม่สมัคร แสดง "กรุณากรอกเบอร์มือถือ 10 หลัก"
    [Tags]    priority:Medium
    Fill Register Form    ${VALID_NAME}    ${VALID_EMAIL}    021234567    ${VALID_PASSWORD}    ${VALID_PASSWORD}
    Click Button    ${REGISTER_BUTTON}
    Register Field Error Should Be    กรุณากรอกเบอร์มือถือ 10 หลัก
    Record Actual    แสดง "กรุณากรอกเบอร์มือถือ 10 หลัก" ไม่สมัคร

TC_REG_005 รหัสผ่านสั้นกว่ากฎ
    [Documentation]    Scenario: ตรวจสอบกฎรหัสผ่านเมื่อรหัสสั้นกว่า 8 ตัวอักษร
    ...    Pre: อยู่หน้า /register · ช่องอื่นถูกต้องครบ
    ...    Steps: 1. กรอกรหัสผ่าน 4 ตัว ทั้งสองช่อง | 2. กดสมัครสมาชิก
    ...    Data: Password: Ab1!
    ...    Expected: ไม่สมัคร แสดง "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร"
    [Tags]    priority:High    security
    Fill Register Form    ${VALID_NAME}    ${VALID_EMAIL}    ${VALID_PHONE}    Ab1!    Ab1!
    Click Button    ${REGISTER_BUTTON}
    Register Field Error Should Be    รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร
    Record Actual    แสดง "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร" ไม่สมัคร

TC_REG_006 รหัสผ่านไม่มีตัวพิมพ์ใหญ่
    [Documentation]    Scenario: ตรวจสอบกฎรหัสผ่านเมื่อไม่มีตัวอักษรพิมพ์ใหญ่
    ...    Pre: อยู่หน้า /register · ช่องอื่นถูกต้องครบ
    ...    Steps: 1. กรอกรหัสผ่านตัวพิมพ์เล็กทั้งหมด ทั้งสองช่อง | 2. กดสมัครสมาชิก
    ...    Data: Password: sunset-hill-58#
    ...    Expected: ไม่สมัคร แสดง "รหัสผ่านต้องมีตัวพิมพ์ใหญ่ (A–Z) อย่างน้อย 1 ตัว"
    [Tags]    priority:High    security
    Fill Register Form    ${VALID_NAME}    ${VALID_EMAIL}    ${VALID_PHONE}    sunset-hill-58#    sunset-hill-58#
    Click Button    ${REGISTER_BUTTON}
    Register Field Error Should Be    รหัสผ่านต้องมีตัวพิมพ์ใหญ่
    Record Actual    แสดง "รหัสผ่านต้องมีตัวพิมพ์ใหญ่ (A–Z) อย่างน้อย 1 ตัว" ไม่สมัคร

TC_REG_007 ยืนยันรหัสผ่านไม่ตรงกัน
    [Documentation]    Scenario: ตรวจสอบเมื่อช่องยืนยันรหัสผ่านไม่ตรงกับช่องรหัสผ่าน
    ...    Pre: อยู่หน้า /register · ช่องอื่นถูกต้องครบ
    ...    Steps: 1. กรอกรหัสผ่าน | 2. กรอกยืนยันรหัสผ่านต่างกัน | 3. กดสมัครสมาชิก
    ...    Data: Password: Sunset-Hill-58# · Confirm: Sunset-Hill-59#
    ...    Expected: ไม่สมัคร แสดง "รหัสผ่านทั้งสองช่องไม่ตรงกัน"
    [Tags]    priority:High
    Fill Register Form    ${VALID_NAME}    ${VALID_EMAIL}    ${VALID_PHONE}    ${VALID_PASSWORD}    Sunset-Hill-59#
    Click Button    ${REGISTER_BUTTON}
    Register Field Error Should Be    รหัสผ่านทั้งสองช่องไม่ตรงกัน
    Record Actual    แสดง "รหัสผ่านทั้งสองช่องไม่ตรงกัน" ไม่สมัคร


*** Keywords ***
Open Register Form
    Delete All Cookies
    Go To    ${CLIENT_URL}/register
    Wait Until Element Is Visible    id=reg-name

Fill Register Form
    [Arguments]    ${name}    ${email}    ${phone}    ${password}    ${confirm}
    Input Text        id=reg-name                ${name}
    Input Text        id=reg-email               ${email}
    Input Text        id=reg-phone               ${phone}
    Input Password    id=reg-password            ${password}
    Input Password    id=reg-password-confirm    ${confirm}
