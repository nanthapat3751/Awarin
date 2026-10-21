*** Settings ***
Documentation     หน้าบ้าน — ใช้คีย์บอร์ดล้วนและป้ายสำหรับโปรแกรมอ่านหน้าจอ (UI-GAP-16 ฝั่งลูกค้า)
...
...               กด Tab/Enter/Esc เท่านั้น ไม่คลิกเมาส์ · ตรวจว่าช่องกรอกทุกช่องมีชื่อ (label/aria-label) และปุ่มไอคอนมีป้าย
Resource          resource.robot
Suite Setup       Open Client App
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        frontend    module:Keyboard Access


*** Test Cases ***
TC_KEY_C_001 เข้าสู่ระบบด้วยคีย์บอร์ดล้วน
    [Documentation]    Scenario: ลูกค้าที่ไม่ใช้เมาส์กด Tab ไปที่ช่องอีเมล พิมพ์ แล้ว Tab ไปช่องรหัสผ่าน และกด Enter
    ...    Pre: ยังไม่ได้เข้าสู่ระบบ · หน้า /login
    ...    Steps: 1. กด Tab จนโฟกัสอยู่ช่องอีเมล | 2. พิมพ์อีเมล | 3. Tab ไปช่องรหัสผ่าน แล้วพิมพ์ | 4. กด Enter
    ...    Data: robot.customer@example.test / Robot-Cust-2026!
    ...    Expected: ไปถึงช่องอีเมลได้ด้วย Tab · Tab ถัดไปคือช่องรหัสผ่าน · Enter ส่งฟอร์มแล้วเข้าสู่ระบบได้
    [Tags]    priority:Medium
    Go To Customer Login
    Execute Javascript    document.activeElement && document.activeElement.blur()
    ${tabs}=    Tab Until Focused    login-email
    Press Keys    None    ${CUSTOMER_EMAIL}
    Press Keys    None    TAB
    ${next}=    Execute Javascript    return document.activeElement.id
    Should Be Equal    ${next}    login-password    msg=Tab จากช่องอีเมลไปที่ "${next}" แทนช่องรหัสผ่าน
    Press Keys    None    ${CUSTOMER_PASSWORD}
    Press Keys    None    RETURN
    Customer Should Be Logged In
    Record Actual    กด Tab ${tabs} ครั้งถึงช่องอีเมล · Tab ถัดไปคือช่องรหัสผ่าน · Enter แล้วเข้าสู่ระบบได้
    [Teardown]    Run Keywords    Capture Evidence    AND    Delete All Cookies

TC_KEY_C_002 ลิ้นชักเมนูบนมือถือปิดได้ด้วย Esc
    [Documentation]    Scenario: ผู้ใช้คีย์บอร์ดบนจอแคบเปิดเมนูแล้วกด Esc เพื่อปิด
    ...    Pre: จอกว้าง 390 px
    ...    Steps: 1. โฟกัสปุ่ม "เปิดเมนู" แล้วกด Enter | 2. กด Esc
    ...    Data: (ไม่มี)
    ...    Expected: Enter เปิดลิ้นชัก "เมนู" · Esc ปิดลิ้นชัก
    [Tags]    priority:Low
    Set Window Size    390    844
    Go To    ${CLIENT_URL}/
    Wait Until Element Is Visible    xpath=//header//button[@aria-label="เปิดเมนู"]    15s
    Execute Javascript    document.querySelector('header button[aria-label="เปิดเมนู"]').focus()
    Press Keys    None    RETURN
    Wait Until Element Is Visible    xpath=//dialog[@aria-label="เมนู"]
    Press Keys    None    ESCAPE
    Wait Until Page Does Not Contain Element    xpath=//dialog[@aria-label="เมนู"]
    Record Actual    Enter เปิดลิ้นชัก "เมนู" · Esc ปิดลิ้นชัก
    [Teardown]    Run Keywords    Capture Evidence    AND    Set Window Size    1366    900

TC_KEY_C_003 ช่องกรอกในฟอร์มหลักมีชื่อให้โปรแกรมอ่านหน้าจออ่านได้ทุกช่อง
    [Documentation]    Scenario: ผู้ใช้โปรแกรมอ่านหน้าจอเข้าฟอร์มเข้าสู่ระบบ สมัครสมาชิก และติดต่อเรา
    ...    Pre: ยังไม่ได้เข้าสู่ระบบ
    ...    Steps: 1. เปิด /login /register /contact | 2. ตรวจช่องกรอกที่มองเห็นทุกช่อง และปุ่มทุกปุ่ม
    ...    Data: (ไม่มี)
    ...    Expected: ทุกช่องมี label ที่ผูกกัน หรือ aria-label/aria-labelledby · ทุกปุ่มมีข้อความหรือ aria-label
    [Tags]    priority:Low
    @{missing}=    Create List
    FOR    ${path}    IN    /login    /register    /contact
        Go To    ${CLIENT_URL}${path}
        Wait Until Page Contains Element    xpath=//main//form    15s
        ${bad}=    Unnamed Controls
        FOR    ${b}    IN    @{bad}
            Append To List    ${missing}    ${path}: ${b}
        END
    END
    Should Be Empty    ${missing}    msg=ช่อง/ปุ่มที่ไม่มีชื่อ: ${missing}
    Record Actual    ฟอร์ม /login /register /contact: ทุกช่องกรอกและปุ่มมีชื่อให้โปรแกรมอ่านหน้าจอ


*** Keywords ***
Tab Until Focused
    [Documentation]    กด Tab ทีละครั้ง (ไม่เกิน 40) จนโฟกัสถึง element id นี้ — คืนจำนวนครั้ง
    [Arguments]    ${id}
    FOR    ${i}    IN RANGE    1    41
        Press Keys    None    TAB
        ${now}=    Execute Javascript    return document.activeElement ? document.activeElement.id : ""
        IF    "${now}" == "${id}"    RETURN    ${i}
    END
    Fail    กด Tab 40 ครั้งแล้วยังไปไม่ถึงช่อง ${id}

Unnamed Controls
    [Documentation]    ช่องกรอก/ปุ่มที่มองเห็นแต่ไม่มีชื่อที่อ่านได้ (ชื่อตามกติกา accessible name แบบย่อ)
    ${bad}=    Execute Javascript
    ...    const out = [];
    ...    const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    ...    for (const e of document.querySelectorAll('main input:not([type=hidden]):not([type=file]), main select, main textarea')) {
    ...      if (!visible(e)) continue;
    ...      const byFor = e.id && document.querySelector('label[for="' + e.id + '"]');
    ...      const wrapped = e.closest('label');
    ...      const named = byFor || wrapped || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.title;
    ...      if (!named) out.push((e.tagName + ' ' + (e.name || e.id || e.type)).toLowerCase());
    ...    }
    ...    for (const b of document.querySelectorAll('main button')) {
    ...      if (!visible(b)) continue;
    ...      if (!(b.innerText.trim() || b.getAttribute('aria-label') || b.getAttribute('aria-labelledby') || b.title)) out.push('button ' + b.outerHTML.slice(0, 60));
    ...    }
    ...    return out;
    RETURN    ${bad}
