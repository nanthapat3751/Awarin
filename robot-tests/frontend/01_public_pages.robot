*** Settings ***
Documentation     หน้าบ้าน — หน้าสาธารณะที่ไม่ต้องเข้าสู่ระบบ
Resource          resource.robot
Suite Setup       Open Client App
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        frontend    module:Public Website


*** Test Cases ***
TC_WEB_001 เปิดหน้าแรก
    [Documentation]    Scenario: ผู้เยี่ยมชมเปิดหน้าแรกของเว็บไซต์
    ...    Pre: ไม่ต้องเข้าสู่ระบบ
    ...    Steps: 1. เปิด /
    ...    Data: URL: /
    ...    Expected: หน้าแรกแสดงหัวข้อ "บริการออกแบบและรับเหมาก่อสร้างบ้าน" และมีเมนูนำทาง
    [Tags]    priority:High
    Go To    ${CLIENT_URL}/
    Wait Until Element Contains    xpath=//h1    บริการออกแบบและรับเหมาก่อสร้างบ้าน
    Page Should Contain Element    xpath=//header//a[@href="/services"]
    ${h1}=    Get Text    xpath=//h1
    Record Actual    หัวข้อ "${h1}" และมีเมนูนำทาง

TC_WEB_002 เปิดหน้าบริการ
    [Documentation]    Scenario: ผู้เยี่ยมชมเปิดหน้าบริการ
    ...    Pre: ไม่ต้องเข้าสู่ระบบ
    ...    Steps: 1. เปิด /services
    ...    Data: URL: /services
    ...    Expected: ชื่อแท็บขึ้นต้น "บริการ" และหัวข้อหน้า "บริการ"
    [Tags]    priority:Medium
    Public Page Should Show    /services    บริการ    บริการ

TC_WEB_003 เปิดหน้าผลงาน
    [Documentation]    Scenario: ผู้เยี่ยมชมเปิดหน้าผลงาน
    ...    Pre: ไม่ต้องเข้าสู่ระบบ
    ...    Steps: 1. เปิด /portfolio
    ...    Data: URL: /portfolio
    ...    Expected: ชื่อแท็บขึ้นต้น "ผลงาน" และหัวข้อหน้า "ผลงานของเรา"
    [Tags]    priority:Medium
    Public Page Should Show    /portfolio    ผลงาน    ผลงานของเรา

TC_WEB_004 เปิดหน้าแบบบ้าน
    [Documentation]    Scenario: ผู้เยี่ยมชมเปิดหน้าแบบบ้าน
    ...    Pre: ไม่ต้องเข้าสู่ระบบ
    ...    Steps: 1. เปิด /house-designs
    ...    Data: URL: /house-designs
    ...    Expected: ชื่อแท็บขึ้นต้น "แบบบ้าน" และหัวข้อหน้า "แบบบ้าน"
    [Tags]    priority:Medium
    Public Page Should Show    /house-designs    แบบบ้าน    แบบบ้าน

TC_WEB_005 เปิดหน้าเกี่ยวกับเรา
    [Documentation]    Scenario: ผู้เยี่ยมชมเปิดหน้าเกี่ยวกับเรา
    ...    Pre: ไม่ต้องเข้าสู่ระบบ
    ...    Steps: 1. เปิด /about
    ...    Data: URL: /about
    ...    Expected: ชื่อแท็บขึ้นต้น "เกี่ยวกับเรา" และหัวข้อหน้าแนะนำบริษัท
    [Tags]    priority:Low
    Public Page Should Show    /about    เกี่ยวกับเรา    บริษัทรับเหมาก่อสร้าง

TC_WEB_006 เปิดหน้านโยบายความเป็นส่วนตัว
    [Documentation]    Scenario: ผู้เยี่ยมชมเปิดหน้านโยบายความเป็นส่วนตัว (PDPA) จากลิงก์ท้ายเว็บ
    ...    Pre: ไม่ต้องเข้าสู่ระบบ
    ...    Steps: 1. เปิดหน้าแรก | 2. กดลิงก์ "นโยบายความเป็นส่วนตัว" ท้ายหน้า
    ...    Data: URL: /privacy
    ...    Expected: เปิดหน้า /privacy หัวข้อ "นโยบายความเป็นส่วนตัวของข้อมูล"
    [Tags]    priority:Medium    pdpa
    Go To    ${CLIENT_URL}/
    Click Link    xpath=//footer//a[@href="/privacy"]
    Wait Until Location Contains    /privacy
    Wait Until Element Contains    xpath=//h1    นโยบายความเป็นส่วนตัวของข้อมูล
    Record Actual    กดลิงก์ท้ายหน้าแล้วเปิด /privacy หัวข้อ "นโยบายความเป็นส่วนตัวของข้อมูล"

TC_WEB_007 เมนูนำทางพาไปหน้าที่ถูกต้อง
    [Documentation]    Scenario: กดเมนูด้านบนจากหน้าแรกไปหน้าผลงานและหน้าติดต่อเรา
    ...    Pre: ไม่ต้องเข้าสู่ระบบ
    ...    Steps: 1. เปิดหน้าแรก | 2. กดเมนู "ผลงาน" | 3. กดเมนู "ติดต่อเรา"
    ...    Data: เมนู: ผลงาน, ติดต่อเรา
    ...    Expected: ไปที่ /portfolio และ /contact ตามลำดับ
    [Tags]    priority:Medium
    Go To    ${CLIENT_URL}/
    Click Link    xpath=//header//a[@href="/portfolio"]
    Wait Until Location Contains    /portfolio
    Click Link    xpath=//header//a[@href="/contact"]
    Wait Until Location Contains    /contact
    Record Actual    เมนู "ผลงาน" → /portfolio และ "ติดต่อเรา" → /contact

TC_WEB_008 เปิดที่อยู่ที่ไม่มีในเว็บไซต์
    [Documentation]    Scenario: ผู้เยี่ยมชมเปิดลิงก์ที่ไม่มีอยู่
    ...    Pre: ไม่ต้องเข้าสู่ระบบ
    ...    Steps: 1. เปิด /no-such-page-robot
    ...    Data: URL: /no-such-page-robot
    ...    Expected: แสดงหน้า "ไม่พบหน้าที่คุณเปิด" ไม่ใช่จอขาว
    [Tags]    priority:Low
    Go To    ${CLIENT_URL}/no-such-page-robot
    Wait Until Element Contains    xpath=//h1    ไม่พบหน้าที่คุณเปิด
    Record Actual    แสดงหัวข้อ "ไม่พบหน้าที่คุณเปิด"
