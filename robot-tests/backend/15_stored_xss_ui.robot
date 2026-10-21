*** Settings ***
Documentation     หน้าจอ — Stored XSS (ส่วนหน้าจอของ Risk R-31): ชื่อลูกค้า/ชื่อโครงการ/ที่ตั้งที่มี HTML ต้องแสดงเป็นตัวอักษร ไม่รันสคริปต์
...
...               seed สร้างลูกค้า robot.xss ชื่อ "<img src=x onerror=…> โรบอท" และโครงการที่ชื่อ/ที่ตั้งมี <img>/<script>
...               ถ้าหน้าจอเอาค่าไปใส่เป็น HTML ดิบ <img src=x> จะโหลดไม่ขึ้นแล้ว onerror เรียก alert() — เคสจับจากกล่อง alert
...               และจากจำนวนแท็ก <img src="x"> ที่โผล่ในหน้า · ส่วน PDF ตรวจในชุด API (api/09_stored_xss.robot)
Resource          resource.robot
Resource          ../frontend/resource.robot
Variables         ${CURDIR}/../results/xss-data.json
Suite Setup       Run Keywords    Open Staff App    AND    Login As Staff Owner
Suite Teardown    Close All Browsers
Test Teardown     Capture Evidence
Force Tags        backend    module:Stored XSS UI


*** Variables ***
${XSS_EMAIL}          robot.xss@example.test
${XSS_PASSWORD}       Robot-Xss-2026!
${IMG_TAG}            <img src=x onerror="alert(1)">
${SCRIPT_TAG}         <script>alert(2)</script>


*** Test Cases ***
TC_XSS_UI_001 รายชื่อและแฟ้มลูกค้าแสดงชื่อที่มี HTML เป็นตัวอักษร
    [Documentation]    Scenario: พนักงานเปิดหน้ารายชื่อลูกค้าและแฟ้มของลูกค้าที่ชื่อมีโค้ด HTML (ข้อมูลเก่า/ข้อมูลนำเข้า)
    ...    Pre: มีลูกค้า robot.xss · เข้าสู่ระบบ robot_owner
    ...    Steps: 1. /customers ค้น robot.xss | 2. เปิดแฟ้มลูกค้า
    ...    Data: ชื่อลูกค้า <img src=x onerror="alert(1)"> โรบอท
    ...    Expected: เห็นชื่อเป็นตัวอักษรตามจริงทั้งสองหน้า · ไม่มีกล่อง alert · ไม่มีแท็ก <img src="x"> ในหน้า
    [Tags]    priority:High    security
    Go To    ${STAFF_URL}/customers
    Wait Until Element Is Visible    xpath=//main//input[@type="search"]    15s
    Input Text    xpath=//main//input[@type="search"]    ${XSS_EMAIL}
    Wait Until Page Contains Element    xpath=//main//table//a[contains(@href, "/customers/")]    15s
    Html Should Show As Text    ${IMG_TAG} โรบอท
    Click Element    xpath=//main//table//a[contains(@href, "/customers/")]
    Wait Until Page Contains    ${XSS_EMAIL}    15s
    Html Should Show As Text    ${IMG_TAG} โรบอท
    Record Actual    รายชื่อและแฟ้มลูกค้าแสดง "${IMG_TAG} โรบอท" เป็นตัวอักษร ไม่มี alert ไม่มีแท็ก img แปลกปลอม

TC_XSS_UI_002 หน้าโครงการแสดงชื่อโครงการและที่ตั้งที่มี HTML เป็นตัวอักษร
    [Documentation]    Scenario: พนักงานเปิดหน้าโครงการของลูกค้า robot.xss (ชื่อโครงการและที่ตั้งงานมีแท็ก)
    ...    Pre: โครงการ XSS ของ seed
    ...    Steps: 1. เปิด /projects/{XSS} | 2. เปิดแท็บสัญญาและการเงิน
    ...    Data: ที่ตั้ง "ที่ตั้ง <script>alert(2)</script> …"
    ...    Expected: ชื่อโครงการและที่ตั้งแสดงเป็นตัวอักษร · ไม่มี alert · ไม่มีแท็ก <img src="x">
    [Tags]    priority:High    security
    Go To    ${STAFF_URL}/projects/${XSS_PROJECT_ID}
    Wait Until Page Contains Element    xpath=//main//button[starts-with(normalize-space(.), "ภาพรวม")]    15s
    Html Should Show As Text    ${IMG_TAG}
    Html Should Show As Text    ${SCRIPT_TAG}
    Go To    ${STAFF_URL}/projects/${XSS_PROJECT_ID}?tab=contract
    Wait Until Page Contains    ${XSS_CONTRACT_NO}    15s
    Html Should Show As Text    ${IMG_TAG}
    Record Actual    หน้าโครงการและแท็บสัญญาแสดง <img …> และ <script> เป็นตัวอักษร ไม่มี alert

TC_XSS_UI_003 พอร์ทัลลูกค้าแสดงชื่อของตัวเองและชื่อโครงการที่มี HTML เป็นตัวอักษร
    [Documentation]    Scenario: ลูกค้า robot.xss เข้าพอร์ทัลแล้วดูใบเสนอราคาและสัญญาของตัวเอง
    ...    Pre: robot.xss มีใบเสนอราคาและสัญญา (seed)
    ...    Steps: 1. เข้าสู่ระบบ | 2. เปิด /my/quotes | 3. เปิด /my/contracts
    ...    Data: robot.xss@example.test
    ...    Expected: ปุ่มบัญชีมีชื่อตามจริง · ชื่อโครงการแสดงเป็นตัวอักษรทั้งสองหน้า · ไม่มี alert
    [Tags]    priority:High    security
    Open Browser For Test    ${CLIENT_URL}/    alias=xsscust
    Go To Customer Login
    Submit Customer Login    ${XSS_EMAIL}    ${XSS_PASSWORD}
    Wait Until Page Contains Element    xpath=//header//button[starts-with(@aria-label, "บัญชีของฉัน (")]    15s
    ${label}=    Get Element Attribute    xpath=//header//button[starts-with(@aria-label, "บัญชีของฉัน (")]    aria-label
    Should Contain    ${label}    ${IMG_TAG}
    Go To    ${CLIENT_URL}/my/quotes
    Wait Until Page Contains    ${XSS_PROJECT_NAME}    15s
    Html Should Show As Text    ${IMG_TAG}
    Go To    ${CLIENT_URL}/my/contracts
    Wait Until Page Contains    ${XSS_CONTRACT_NO}    15s
    Html Should Show As Text    ${IMG_TAG}
    Record Actual    พอร์ทัลแสดงชื่อลูกค้าและชื่อโครงการที่มี HTML เป็นตัวอักษร ไม่มี alert
    [Teardown]    Run Keywords    Capture Evidence    AND    Close Browser


*** Keywords ***
Html Should Show As Text
    [Documentation]    ข้อความ (ที่มีแท็ก) ต้องอยู่ในหน้าเป็นตัวอักษร ไม่มีกล่อง alert และไม่มี <img src="x"> ที่เกิดจากการตีเป็น HTML
    [Arguments]    ${text}
    Sleep    1s    # ให้รูปที่โหลดไม่ขึ้น (ถ้ามี) ได้เรียก onerror ก่อน
    Alert Should Not Be Present    timeout=1s
    Page Should Contain    ${text}
    ${imgs}=    Execute Javascript    return [...document.querySelectorAll('img')].filter(i => i.getAttribute('src') === 'x').length
    Should Be Equal As Integers    ${imgs}    0    msg=พบแท็ก <img src="x"> ${imgs} ตัว — ค่าถูกใส่ลงหน้าเป็น HTML
    ${scripts}=    Execute Javascript    return [...document.querySelectorAll('script')].filter(s => s.textContent.includes('alert(2)')).length
    Should Be Equal As Integers    ${scripts}    0    msg=พบแท็ก <script> จากข้อมูลลูกค้าในหน้า
