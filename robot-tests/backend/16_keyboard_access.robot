*** Settings ***
Documentation     หลังบ้าน — ใช้คีย์บอร์ดล้วนและป้ายสำหรับโปรแกรมอ่านหน้าจอ (UI-GAP-16 ฝั่งพนักงาน)
...
...               กด Tab/Enter/Esc เท่านั้น · ตรวจว่าช่องกรอกมีชื่อ (label/aria-label) และปุ่มไอคอนมีป้าย (aria-label/title)
Resource          resource.robot
Variables         ${CURDIR}/../results/ui-data.json
Suite Setup       Open Staff App
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        backend    module:Keyboard Access


*** Variables ***
${DIALOG}             xpath=//*[self::dialog or @role="dialog" or @role="alertdialog"]
${PROJECT_SEARCH}     xpath=//input[starts-with(@placeholder, "ค้นหาจากชื่อโครงการ")]


*** Test Cases ***
TC_KEY_S_001 พนักงานเข้าสู่ระบบด้วยคีย์บอร์ดล้วน
    [Documentation]    Scenario: พนักงานที่ไม่ใช้เมาส์กด Tab ไปช่องชื่อผู้ใช้ พิมพ์ Tab ไปช่องรหัสผ่าน แล้วกด Enter
    ...    Pre: หน้าเข้าสู่ระบบหลังบ้าน ยังไม่ได้เข้าสู่ระบบ
    ...    Steps: 1. Tab จนถึงช่องชื่อผู้ใช้ | 2. พิมพ์ | 3. Tab ไปช่องรหัสผ่าน พิมพ์ | 4. Enter
    ...    Data: robot_owner / Robot-Owner-2026!
    ...    Expected: Tab ถึงช่องชื่อผู้ใช้ได้ · Tab ถัดไปคือช่องรหัสผ่าน · Enter แล้วเข้าแดชบอร์ด
    [Tags]    priority:Medium
    Go To Staff Login
    Execute Javascript    document.activeElement && document.activeElement.blur()
    ${tabs}=    Tab Until Focused    username
    Press Keys    None    ${STAFF_USER}
    Press Keys    None    TAB
    ${next}=    Execute Javascript    return document.activeElement.id
    Should Be Equal    ${next}    password    msg=Tab จากช่องชื่อผู้ใช้ไปที่ "${next}" แทนช่องรหัสผ่าน
    Press Keys    None    ${STAFF_PASSWORD}
    Press Keys    None    RETURN
    Staff Dashboard Should Be Open
    Record Actual    กด Tab ${tabs} ครั้งถึงช่องชื่อผู้ใช้ · Tab ถัดไปคือรหัสผ่าน · Enter แล้วเข้าแดชบอร์ด

TC_KEY_S_002 หน้าต่างยืนยันลบปิดด้วย Esc ได้โดยไม่ลบอะไร
    [Documentation]    Scenario: พนักงานกด "ลบ" โครงการโดยไม่ตั้งใจ แล้วกด Esc เพื่อยกเลิก
    ...    Pre: เข้าสู่ระบบแล้ว (TC_KEY_S_001) · โครงการทดสอบ Excel ยังไม่มีใบเสนอราคา (ลบได้)
    ...    Steps: 1. /projects ค้นโครงการ | 2. กด "ลบ" | 3. กด Esc
    ...    Data: [โรบอท] ทดสอบ Excel <รอบ>
    ...    Expected: หน้าต่างยืนยันขึ้นแล้วปิดด้วย Esc · โครงการยังอยู่ในรายการ
    [Tags]    priority:Medium
    Go To    ${STAFF_URL}/projects
    Wait Until Element Is Visible    ${PROJECT_SEARCH}    15s
    Input Text    ${PROJECT_SEARCH}    ${EXCEL_PROJECT_NAME}
    Wait Until Page Contains Element    xpath=//a[normalize-space(.)="${EXCEL_PROJECT_NAME}"]    15s
    Click Button    xpath=//tr[.//a[normalize-space(.)="${EXCEL_PROJECT_NAME}"]]//button[contains(., "ลบ")]
    Wait Until Element Is Visible    ${DIALOG}
    Press Keys    None    ESCAPE
    Wait Until Page Does Not Contain Element    ${DIALOG}    5s
    Sleep    1s
    Page Should Contain Element    xpath=//a[normalize-space(.)="${EXCEL_PROJECT_NAME}"]
    Page Should Not Contain    ย้ายโครงการไปถังขยะแล้ว
    Record Actual    หน้าต่างยืนยันลบปิดด้วย Esc · โครงการยังอยู่ ไม่มีอะไรถูกลบ

TC_KEY_S_003 ปุ่มไอคอนและช่องกรอกในหน้าหลักมีชื่อให้โปรแกรมอ่านหน้าจอ
    [Documentation]    Scenario: ผู้ใช้โปรแกรมอ่านหน้าจอเปิดแดชบอร์ด รายการโครงการ หน้าโครงการ และแฟ้มลูกค้า
    ...    Pre: เข้าสู่ระบบแล้ว
    ...    Steps: 1. เปิดทีละหน้า | 2. ตรวจปุ่มที่มองเห็นทุกปุ่มและช่องกรอกทุกช่อง
    ...    Data: / · /projects · /projects/{ทดสอบ Excel} · /customers
    ...    Expected: ทุกปุ่มมีข้อความ หรือ aria-label/title · ทุกช่องกรอกมี label หรือ aria-label/placeholder ที่บอกว่ากรอกอะไร
    [Tags]    priority:Low
    @{missing}=    Create List
    FOR    ${path}    IN    /    /projects    /projects/${EXCEL_PROJECT_ID}    /customers
        Go To    ${STAFF_URL}${path}
        Wait Until Page Contains Element    xpath=//main//*[self::button or self::a]    15s
        Sleep    1.5s
        ${bad}=    Unnamed Controls
        FOR    ${b}    IN    @{bad}
            Append To List    ${missing}    ${path}: ${b}
        END
    END
    Should Be Empty    ${missing}    msg=ปุ่ม/ช่องที่ไม่มีชื่อ: ${missing}
    Record Actual    4 หน้า: ทุกปุ่มและช่องกรอกที่มองเห็นมีชื่อให้โปรแกรมอ่านหน้าจอ


*** Keywords ***
Tab Until Focused
    [Arguments]    ${id}
    FOR    ${i}    IN RANGE    1    41
        Press Keys    None    TAB
        ${now}=    Execute Javascript    return document.activeElement ? document.activeElement.id : ""
        IF    "${now}" == "${id}"    RETURN    ${i}
    END
    Fail    กด Tab 40 ครั้งแล้วยังไปไม่ถึงช่อง ${id}

Unnamed Controls
    ${bad}=    Execute Javascript
    ...    const out = [];
    ...    const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    ...    for (const e of document.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea')) {
    ...      if (!visible(e)) continue;
    ...      const byFor = e.id && document.querySelector('label[for="' + e.id + '"]');
    ...      const named = byFor || e.closest('label') || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.title || e.placeholder;
    ...      if (!named) out.push((e.tagName + ' ' + (e.name || e.id || e.type)).toLowerCase());
    ...    }
    ...    for (const b of document.querySelectorAll('button, a[href]')) {
    ...      if (!visible(b)) continue;
    ...      if (!(b.innerText.trim() || b.getAttribute('aria-label') || b.getAttribute('aria-labelledby') || b.title)) out.push(b.tagName.toLowerCase() + ' ' + b.outerHTML.slice(0, 80));
    ...    }
    ...    return out;
    RETURN    ${bad}
