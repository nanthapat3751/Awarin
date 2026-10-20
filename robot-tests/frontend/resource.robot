*** Settings ***
Documentation     keyword ของหน้าบ้าน (client-app) — ลูกค้าเข้าสู่ระบบด้วยอีเมล
Resource          ../common.robot


*** Variables ***
${CUSTOMER_LOGIN_BUTTON}    xpath=//form//button[@type="submit"][contains(., "เข้าสู่ระบบ")]
${PROFILE_BUTTON}           xpath=//header//button[contains(@aria-label, "บัญชีของฉัน")]


*** Keywords ***
Open Client App
    Open Test Browser    ${CLIENT_URL}/

Go To Customer Login
    # ผ่านหน้าว่างก่อน กัน state.from ของเคสก่อนค้างมา (ดูคำอธิบายที่ backend/resource.robot)
    Go To    about:blank
    Go To    ${CLIENT_URL}/login
    Wait Until Element Is Visible    id=login-email

Submit Customer Login
    [Arguments]    ${email}    ${password}
    Input Text        id=login-email       ${email}
    Input Password    id=login-password    ${password}
    Click Button      ${CUSTOMER_LOGIN_BUTTON}

Customer Should Be Logged In
    Wait Until Page Contains Element    xpath=//header//button[@aria-label="บัญชีของฉัน (${CUSTOMER_FULLNAME})"]    15s

Login As Customer
    Go To Customer Login
    Submit Customer Login    ${CUSTOMER_EMAIL}    ${CUSTOMER_PASSWORD}
    Customer Should Be Logged In

Public Page Should Show
    [Arguments]    ${path}    ${title_word}    ${heading_word}
    Go To    ${CLIENT_URL}${path}
    Wait Until Keyword Succeeds    10s    0.5s    Title Should Start With    ${title_word}
    Wait Until Element Contains    xpath=//h1    ${heading_word}
    ${h1}=    Get Text    xpath=//h1
    Record Actual    ชื่อแท็บขึ้นต้น "${title_word}" · หัวข้อหน้า "${h1}"

Title Should Start With
    [Arguments]    ${prefix}
    ${title}=    Get Title
    Should Start With    ${title}    ${prefix}

Register Field Error Should Be
    [Arguments]    ${message}
    Wait Until Page Contains    ${message}
    Location Should Contain    /register
