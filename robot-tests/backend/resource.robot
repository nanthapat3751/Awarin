*** Settings ***
Documentation     keyword ของหลังบ้าน (staff-app) — พนักงานเข้าสู่ระบบด้วยชื่อผู้ใช้ ไม่ใช่อีเมล
Resource          ../common.robot


*** Variables ***
${LOGIN_BUTTON}       xpath=//form//button[@type="submit"][contains(., "เข้าสู่ระบบ")]
${LOGOUT_BUTTON}      xpath=//button[@aria-label="ออกจากระบบ" or @title="ออกจากระบบ"]


*** Keywords ***
Open Staff App
    Open Test Browser    ${STAFF_URL}/login
    Staff Login Page Should Be Open

Go To Staff Login
    # ผ่านหน้าว่างก่อน: Go To ไป URL เดิม = รีเฟรช ซึ่งเก็บ "หน้าที่ตั้งใจเปิด" (state.from) จากเคสก่อนไว้
    # แล้วเข้าสู่ระบบจะถูกพาไปหน้านั้นแทนแดชบอร์ด — แต่ละเคสต้องเริ่มจากหน้าเข้าสู่ระบบเปล่า ๆ
    Go To    about:blank
    Go To    ${STAFF_URL}/login
    Staff Login Page Should Be Open

Staff Login Page Should Be Open
    Wait Until Element Is Visible    id=username
    Wait Until Element Is Visible    id=password
    Page Should Contain    เข้าสู่ระบบ — ฝั่งบริษัท

Submit Staff Login
    [Arguments]    ${username}    ${password}
    Input Text        id=username    ${username}
    Input Password    id=password    ${password}
    Click Button      ${LOGIN_BUTTON}

Login As Staff Owner
    Go To Staff Login
    Submit Staff Login    ${STAFF_USER}    ${STAFF_PASSWORD}
    Staff Dashboard Should Be Open

Staff Dashboard Should Be Open
    Wait Until Page Contains    ยินดีต้อนรับ ${STAFF_FULLNAME}    15s
    Location Should Be    ${STAFF_URL}/

Staff Login Should Fail With
    [Arguments]    ${message}
    Wait Until Page Contains    ${message}
    Location Should Contain    /login

Logout Staff If Logged In
    Delete All Cookies
