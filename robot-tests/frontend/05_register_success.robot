*** Settings ***
Documentation     หน้าบ้าน — สมัครสมาชิกสำเร็จจนเข้าพอร์ทัลครั้งแรก (UI-GAP-08): สมัคร → ยืนยันอีเมลด้วยรหัส 6 หลัก → เข้าสู่ระบบ
...
...               อีเมลใหม่ทุกรอบ (robot.reg.<รอบ>@example.com) · รหัสยืนยันอ่านจาก log ของ API ชุดทดสอบ (MailLog.py —
...               MAIL_TRANSPORT=console ไม่มีเมลออกไปจริง) · บัญชีที่สมัครค้างไว้ไม่ยืนยัน ระบบลบเองใน 7 วัน
Resource          resource.robot
Variables         ${CURDIR}/../results/ui-data.json
Suite Setup       Open Client App
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        frontend    module:Register Success


*** Variables ***
${REG_NAME}           ทดลองสมัคร โรบอท
${REG_PHONE}          0898765432
${REG_PASSWORD}       Sunset-Hill-58#
${REGISTER_BUTTON}    xpath=//form//button[@type="submit"][contains(., "สมัครสมาชิก")]
${VERIFY_BUTTON}      xpath=//form//button[@type="submit"][contains(., "ยืนยันอีเมล")]


*** Test Cases ***
TC_REG_OK_001 สมัครสมาชิกด้วยข้อมูลครบแล้วระบบส่งรหัสยืนยันไปที่อีเมล
    [Documentation]    Scenario: ลูกค้าใหม่กรอกฟอร์มสมัครครบทุกช่องถูกต้อง
    ...    Pre: ยังไม่ได้เข้าสู่ระบบ · อีเมลนี้ยังไม่เคยสมัคร
    ...    Steps: 1. เปิด /register | 2. กรอกชื่อ อีเมล เบอร์ รหัสผ่าน ยืนยันรหัส | 3. กด "สมัครสมาชิก"
    ...    Data: ชื่อ ทดลองสมัคร โรบอท · อีเมล robot.reg.<รอบ>@example.com · เบอร์ 0898765432 · รหัส Sunset-Hill-58#
    ...    Expected: ไปหน้า "ยืนยันอีเมล" ที่บอกอีเมลที่สมัคร · มีเมลรหัส 6 หลักส่งถึงอีเมลนั้น
    [Tags]    priority:High
    ${email}=    Set Variable    robot.reg.${SALES_RUN}@example.com
    Set Suite Variable    ${REG_EMAIL}    ${email}
    ${before}=    Mail Count To    ${email}
    Delete All Cookies
    Go To    ${CLIENT_URL}/register
    Wait Until Element Is Visible    id=reg-name
    Input Text        id=reg-name                ${REG_NAME}
    Input Text        id=reg-email               ${email}
    Input Text        id=reg-phone               ${REG_PHONE}
    Input Password    id=reg-password            ${REG_PASSWORD}
    Input Password    id=reg-password-confirm    ${REG_PASSWORD}
    Click Button    ${REGISTER_BUTTON}
    Wait Until Location Contains    /verify-email    15s
    Wait Until Element Is Visible    id=verify-code
    Page Should Contain    ${email}
    ${mail}=    Wait For Mail To    ${email}    after_count=${before}
    ${code}=    Six Digit Code In    ${mail}[text]
    Set Suite Variable    ${REG_CODE}    ${code}
    Record Actual    ไปหน้ายืนยันอีเมล (${email}) · ได้เมล "${mail}[subject]" มีรหัส 6 หลัก

TC_REG_OK_002 กรอกรหัสยืนยันผิดแล้วยังเข้าใช้งานไม่ได้
    [Documentation]    Scenario: ลูกค้าพิมพ์รหัสยืนยันผิดหนึ่งหลัก
    ...    Pre: อยู่หน้ายืนยันอีเมลจาก TC_REG_OK_001
    ...    Steps: 1. พิมพ์รหัส 6 หลักที่ไม่ใช่รหัสในเมล | 2. กด "ยืนยันอีเมล"
    ...    Data: รหัส = รหัสในเมลที่เปลี่ยนหลักสุดท้าย
    ...    Expected: แจ้ง "รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว" และยังอยู่หน้ายืนยันอีเมล
    [Tags]    priority:Medium
    Variable Should Exist    ${REG_CODE}    msg=ไม่มีรหัสจาก TC_REG_OK_001
    ${wrong}=    Evaluate    $REG_CODE[:5] + str((int($REG_CODE[5]) + 1) % 10)
    Input Text    id=verify-code    ${wrong}
    Click Button    ${VERIFY_BUTTON}
    Wait Until Page Contains    รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว
    Location Should Contain    /verify-email
    Record Actual    รหัส ${wrong} ถูกปฏิเสธ "รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว" ยังอยู่หน้ายืนยันอีเมล

TC_REG_OK_003 ยืนยันอีเมลด้วยรหัสที่ถูกต้องแล้วเข้าพอร์ทัลครั้งแรกได้
    [Documentation]    Scenario: ลูกค้ากรอกรหัสจากเมลแล้วเข้าสู่ระบบครั้งแรก
    ...    Pre: อยู่หน้ายืนยันอีเมล (TC_REG_OK_002)
    ...    Steps: 1. พิมพ์รหัสจากเมล | 2. กด "ยืนยันอีเมล" | 3. ระบบพาไปหน้าเข้าสู่ระบบ | 4. กรอกอีเมล/รหัสผ่าน แล้วเข้าสู่ระบบ
    ...    Data: รหัสจากเมล · อีเมลและรหัสผ่านที่สมัคร
    ...    Expected: ปุ่มเปลี่ยนเป็น "ยืนยันแล้ว" แล้วพาไปหน้าเข้าสู่ระบบ · เข้าสู่ระบบได้ เห็นเมนูบัญชีชื่อ "ทดลองสมัคร โรบอท"
    [Tags]    priority:High
    Variable Should Exist    ${REG_CODE}    msg=ไม่มีรหัสจาก TC_REG_OK_001
    Input Text    id=verify-code    ${REG_CODE}
    Click Button    ${VERIFY_BUTTON}
    Wait Until Location Contains    /login    15s
    Wait Until Element Is Visible    id=login-email
    Submit Customer Login    ${REG_EMAIL}    ${REG_PASSWORD}
    Wait Until Page Contains Element    xpath=//header//button[@aria-label="บัญชีของฉัน (${REG_NAME})"]    15s
    Record Actual    ยืนยันอีเมลสำเร็จ พาไปหน้าเข้าสู่ระบบ แล้วเข้าพอร์ทัลได้ในชื่อ "${REG_NAME}"
