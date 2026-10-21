*** Settings ***
Documentation     หน้าบ้าน — ลืมรหัสผ่าน (UI-GAP-07 ฝั่งลูกค้า): ขอรหัส → กรอกรหัส 6 หลักจากเมล → ตั้งรหัสใหม่ → เข้าสู่ระบบด้วยรหัสใหม่
...
...               บัญชี robot.forgot@example.test (seed ตั้งรหัสเดิมคืนและล้างลิงก์ค้างทุกรอบ)
...               เมลอ่านจาก log ของ API ชุดทดสอบ (MAIL_TRANSPORT=console — ไม่มีเมลออกไปจริง)
Resource          resource.robot
Variables         ${CURDIR}/../results/ui-data.json
Suite Setup       Open Client App
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        frontend    module:Customer Forgot Password


*** Variables ***
${FORGOT_EMAIL}       robot.forgot@example.test
${OLD_PASSWORD}       Robot-Forgot-2026!
${NEW_PASSWORD}       Lantern-Sky-2569!
${FORGOT_NAME}        ลูกค้าลืมรหัส โรบอท
${SUBMIT}             xpath=//form//button[@type="submit"]


*** Test Cases ***
TC_FORGOT_C_001 ขอรหัสตั้งรหัสผ่านใหม่แล้วได้เมลที่มีรหัส 6 หลักและลิงก์
    [Documentation]    Scenario: ลูกค้าจำรหัสผ่านไม่ได้ กด "ลืมรหัสผ่าน" แล้วกรอกอีเมลของตัวเอง
    ...    Pre: ยังไม่ได้เข้าสู่ระบบ · บัญชี robot.forgot ยืนยันอีเมลแล้ว
    ...    Steps: 1. เปิด /forgot-password | 2. กรอกอีเมล | 3. กด "ส่งรหัส"
    ...    Data: อีเมล robot.forgot@example.test
    ...    Expected: ขึ้นหน้า "ตรวจกล่องจดหมายของคุณ" พร้อมช่องกรอกรหัส · ได้เมลที่มีรหัส 6 หลักและลิงก์ /reset-password/…
    [Tags]    priority:High
    ${before}=    Mail Count To    ${FORGOT_EMAIL}
    Open Forgot Page
    Input Text    id=forgot-email    ${FORGOT_EMAIL}
    Click Button    ${SUBMIT}
    Wait Until Page Contains    ตรวจกล่องจดหมายของคุณ    15s
    Wait Until Element Is Visible    id=reset-code
    ${mail}=    Wait For Mail To    ${FORGOT_EMAIL}    after_count=${before}
    ${code}=    Six Digit Code In    ${mail}[text]
    ${link}=    Link In    ${mail}[text]    /reset-password/
    Set Suite Variable    ${RESET_CODE}    ${code}
    Record Actual    ขึ้นหน้า "ตรวจกล่องจดหมายของคุณ" · เมล "${mail}[subject]" มีรหัส 6 หลักและลิงก์ ${link.split("/reset-password/")[0]}/reset-password/…

TC_FORGOT_C_002 กรอกรหัสจากเมลแล้วตั้งรหัสผ่านใหม่ได้
    [Documentation]    Scenario: ลูกค้ากรอกรหัสจากเมลในหน้าที่เปิดค้างไว้ แล้วตั้งรหัสผ่านใหม่
    ...    Pre: อยู่หน้ากรอกรหัสจาก TC_FORGOT_C_001
    ...    Steps: 1. กรอกรหัส 6 หลัก | 2. กด "ยืนยันรหัส" | 3. กรอกรหัสผ่านใหม่สองช่อง | 4. กดตั้งรหัสผ่าน
    ...    Data: รหัสจากเมล · รหัสผ่านใหม่ Lantern-Sky-2569!
    ...    Expected: ไปหน้า "ตั้งรหัสผ่านใหม่" · บันทึกแล้วพากลับหน้าเข้าสู่ระบบ
    [Tags]    priority:High
    Variable Should Exist    ${RESET_CODE}    msg=ไม่มีรหัสจาก TC_FORGOT_C_001
    Input Text    id=reset-code    ${RESET_CODE}
    # กรอกครบ 6 หลักแล้วหน้าส่งให้เอง — กดปุ่ม "ยืนยันรหัส" เฉพาะถ้ายังไม่ไปต่อ
    ${moved}=    Run Keyword And Return Status    Wait Until Location Contains    /reset-password/    4s
    IF    not ${moved}    Click Button    xpath=//button[@type="submit"][contains(., "ยืนยันรหัส")]
    Wait Until Location Contains    /reset-password/    15s
    Wait Until Page Contains    ตั้งรหัสผ่านใหม่    15s
    # หน้านี้ตรวจลิงก์ก่อนแล้ววาดฟอร์มใหม่ (โหมด dev ตรวจซ้ำสองรอบ) — พิมพ์แล้วรอให้นิ่งก่อนกด ไม่ติดก็ทำใหม่ทั้งชุด
    Wait Until Keyword Succeeds    30s    1s    Set New Password And Submit
    Record Actual    ยืนยันรหัสแล้วไปหน้าตั้งรหัสผ่านใหม่ · บันทึกแล้วพากลับหน้าเข้าสู่ระบบ

TC_FORGOT_C_003 เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้ แต่รหัสเดิมใช้ไม่ได้แล้ว
    [Documentation]    Scenario: หลังตั้งรหัสใหม่ ลูกค้าลองรหัสเดิมก่อน แล้วค่อยใช้รหัสใหม่
    ...    Pre: ตั้งรหัสใหม่แล้ว (TC_FORGOT_C_002)
    ...    Steps: 1. เข้าสู่ระบบด้วยรหัสเดิม | 2. เข้าสู่ระบบด้วยรหัสใหม่
    ...    Data: รหัสเดิม Robot-Forgot-2026! · รหัสใหม่ Lantern-Sky-2569!
    ...    Expected: รหัสเดิมถูกปฏิเสธ · รหัสใหม่เข้าพอร์ทัลได้
    [Tags]    priority:High
    Go To Customer Login
    Submit Customer Login    ${FORGOT_EMAIL}    ${OLD_PASSWORD}
    Wait Until Page Contains    อีเมลหรือรหัสผ่านไม่ถูกต้อง    15s
    Go To Customer Login
    Submit Customer Login    ${FORGOT_EMAIL}    ${NEW_PASSWORD}
    Wait Until Page Contains Element    xpath=//header//button[@aria-label="บัญชีของฉัน (${FORGOT_NAME})"]    15s
    Record Actual    รหัสเดิม → "อีเมลหรือรหัสผ่านไม่ถูกต้อง" · รหัสใหม่เข้าพอร์ทัลได้
    [Teardown]    Run Keywords    Capture Evidence    AND    Delete All Cookies

TC_FORGOT_C_004 ขอรหัสด้วยอีเมลที่ไม่มีบัญชีได้หน้าตาเดียวกันและไม่มีเมลออก
    [Documentation]    Scenario: มีคนลองกรอกอีเมลที่ไม่ได้สมัครไว้เพื่อหาว่าใครเป็นลูกค้า (ห้ามบอกว่าอีเมลไหนมีบัญชี)
    ...    Pre: ยังไม่ได้เข้าสู่ระบบ
    ...    Steps: 1. เปิด /forgot-password | 2. กรอกอีเมลที่ไม่มีบัญชี | 3. กด "ส่งรหัส"
    ...    Data: อีเมล nobody.<รอบ>@example.test
    ...    Expected: ขึ้นหน้า "ตรวจกล่องจดหมายของคุณ" แบบเดียวกับอีเมลที่มีบัญชี · ไม่มีเมลส่งไปที่อีเมลนั้น
    [Tags]    priority:Medium    security
    ${email}=    Set Variable    nobody.${SALES_RUN}@example.test
    Open Forgot Page
    Input Text    id=forgot-email    ${email}
    Click Button    ${SUBMIT}
    Wait Until Page Contains    ตรวจกล่องจดหมายของคุณ    15s
    Sleep    3s    # ระบบส่งเมลเบื้องหลังหลังตอบแล้ว — รอให้ถ้าจะส่งก็ส่งเสร็จก่อนนับ
    ${n}=    Mail Count To    ${email}
    Should Be Equal As Integers    ${n}    0    msg=มีเมลส่งไปที่อีเมลที่ไม่มีบัญชี ${n} ฉบับ
    Record Actual    ขึ้นหน้า "ตรวจกล่องจดหมายของคุณ" เหมือนอีเมลที่มีบัญชี · ไม่มีเมลออก


*** Keywords ***
Open Forgot Page
    Delete All Cookies
    Go To    about:blank
    Go To    ${CLIENT_URL}/forgot-password
    Wait Until Element Is Visible    id=forgot-email

Set New Password And Submit
    Input Password    id=reset-password    ${NEW_PASSWORD}
    Input Password    id=reset-confirm    ${NEW_PASSWORD}
    Sleep    1.5s
    ${a}=    Get Value    id=reset-password
    ${b}=    Get Value    id=reset-confirm
    Should Be True    $a == $NEW_PASSWORD and $b == $NEW_PASSWORD    msg=ช่องรหัสผ่านใหม่ยังว่าง (หน้ากำลังวาดใหม่)
    Click Button    xpath=//form//button[@type="submit"][contains(., "ตั้งรหัสผ่านใหม่")]
    Wait Until Location Contains    /login    8s
