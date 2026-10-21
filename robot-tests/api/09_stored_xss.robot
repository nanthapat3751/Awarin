*** Settings ***
Documentation     API — Stored XSS ในเอกสาร PDF (Risk R-31): ชื่อลูกค้า/ชื่อโครงการ/ที่ตั้งงานที่มี HTML ต้องพิมพ์ออกมาเป็นตัวอักษร
...
...               ระบบสร้าง PDF จากหน้า HTML (Puppeteer) — ถ้าไม่ escape ค่าก่อนแทรก แท็กจะถูกตีความ: <img onerror> รันสคริปต์ตอนเรนเดอร์
...               บนเซิร์ฟเวอร์ และข้อความหายไปจากเอกสาร · seed สร้างลูกค้า robot.xss ที่ชื่อ/โครงการ/ที่ตั้งมี HTML ตรงลงฐานข้อมูล
...               (เหมือนข้อมูลเก่าหรือข้อมูลนำเข้าที่ไม่ได้ผ่านกฎชื่อของหน้าสมัคร) พร้อมใบเสนอราคา สัญญา และใบแจ้งหนี้งวด 1
...               หน้าจอพนักงานตรวจแยกใน backend/13_stored_xss.robot (รายงานหน้าจอ)
Resource          resource.robot
Library           ApiHelpers.py
Variables         ${CURDIR}/../results/xss-data.json
Suite Setup       Prepare Xss Suite
Suite Teardown    Delete All Sessions
Force Tags        api    module:API Stored XSS


*** Variables ***
${XSS_EMAIL}          robot.xss@example.test
${XSS_PASSWORD}       Robot-Xss-2026!
${IMG_TAG}            <img src=x onerror="alert(1)">
${SCRIPT_TAG}         <script>alert(2)</script>


*** Test Cases ***
TC_API_XSS_001 PDF ฝั่งพนักงานพิมพ์ HTML ในชื่อลูกค้าและโครงการเป็นตัวอักษร
    [Documentation]    Scenario: ชื่อลูกค้า/ชื่อโครงการ/ที่ตั้งงานมีแท็ก HTML แล้วพนักงานเปิด PDF ใบเสนอราคา สัญญา และใบแจ้งหนี้
    ...    Pre: seed สร้างลูกค้า robot.xss (ชื่อ "<img src=x onerror=...> โรบอท") พร้อมใบเสนอราคา สัญญา และใบแจ้งหนี้งวด 1 · เซสชัน OWNER
    ...    Steps: 1. GET PDF ใบเสนอราคา | 2. GET PDF สัญญา | 3. GET PDF ใบแจ้งหนี้งวด 1 | 4. อ่านข้อความในไฟล์
    ...    Data: ชื่อลูกค้า <img src=x onerror="alert(1)"> โรบอท · ที่ตั้ง "ที่ตั้ง <script>alert(2)</script> …"
    ...    Expected: ทุกไฟล์มีข้อความ <img src=x onerror="alert(1)"> และ <script>alert(2)</script> ปรากฏตามตัวอักษร (ถูก escape ไม่ถูกตีเป็นแท็ก)
    [Tags]    priority:High    security
    ${p}=    Set Variable    /api/projects/${XSS_PROJECT_ID}
    ${c}=    Set Variable    ${p}/contracts/${XSS_CONTRACT_ID}
    ${inv}=    First Invoice Id    owner    ${c}/payments
    &{pdfs}=    Create Dictionary
    ...    ใบเสนอราคา=${p}/quotes/${XSS_QUOTE_ID}/pdf
    ...    สัญญา=${c}/pdf
    ...    ใบแจ้งหนี้=${c}/documents/${inv}/pdf
    ${seen}=    Html Should Print As Text    owner    ${pdfs}
    Record Actual    ${seen}

TC_API_XSS_002 PDF ในพอร์ทัลลูกค้าพิมพ์ HTML เป็นตัวอักษรเช่นกัน
    [Documentation]    Scenario: ลูกค้าเจ้าของงานเปิดเอกสารชุดเดียวกันจากพอร์ทัล (ปลายทางคนละชุดกับฝั่งพนักงาน)
    ...    Pre: เข้าสู่ระบบด้วย robot.xss@example.test
    ...    Steps: 1. GET /api/my/quotes/{q}/pdf | 2. GET /api/my/contracts/{c}/pdf | 3. GET /api/my/contracts/{c}/documents/{ใบแจ้งหนี้}/pdf
    ...    Data: (เอกสารของ robot.xss)
    ...    Expected: ทุกไฟล์มีข้อความแท็ก HTML ปรากฏตามตัวอักษร
    [Tags]    priority:High    security
    ${c}=    Set Variable    /api/projects/${XSS_PROJECT_ID}/contracts/${XSS_CONTRACT_ID}
    ${inv}=    First Invoice Id    owner    ${c}/payments
    &{pdfs}=    Create Dictionary
    ...    ใบเสนอราคา=/api/my/quotes/${XSS_QUOTE_ID}/pdf
    ...    สัญญา=/api/my/contracts/${XSS_CONTRACT_ID}/pdf
    ...    ใบแจ้งหนี้=/api/my/contracts/${XSS_CONTRACT_ID}/documents/${inv}/pdf
    ${seen}=    Html Should Print As Text    xss    ${pdfs}
    Record Actual    ${seen}

TC_API_XSS_003 API คืนชื่อที่มี HTML ตามจริงโดยไม่ตัดหรือแปลงข้อมูล
    [Documentation]    Scenario: ตรวจว่าระบบไม่ "แก้" ข้อมูลของลูกค้าเงียบ ๆ (การกัน XSS เป็นหน้าที่ตอนแสดงผล ไม่ใช่ตอนเก็บ)
    ...    Pre: เซสชัน OWNER และ robot.xss
    ...    Steps: 1. GET /api/customers/{id} (พนักงาน) | 2. GET /api/auth/me (ลูกค้า)
    ...    Data: (ลูกค้า robot.xss)
    ...    Expected: ทั้งสองปลายทางคืนชื่อเต็มตรงกับที่เก็บไว้ทุกตัวอักษร · Content-Type เป็น application/json (เบราว์เซอร์ไม่ตีเป็นหน้า HTML)
    [Tags]    priority:Medium    security
    ${staff}=    Call API    owner    GET    /api/customers/${XSS_CUSTOMER_ID}
    Status Should Be    ${staff}    200    แฟ้มลูกค้า
    Should Contain    ${staff.headers}[Content-Type]    application/json
    Should Contain    ${staff.text}    onerror=\\"alert(1)\\"
    ${me}=    Call API    xss    GET    /api/auth/me
    Should Be Equal    ${me.json()}[user][fullName]    ${IMG_TAG} โรบอท
    Should Contain    ${me.headers}[Content-Type]    application/json
    Record Actual    แฟ้มลูกค้าและ /api/auth/me คืนชื่อ "${IMG_TAG} โรบอท" ตามจริง เป็น application/json


*** Keywords ***
Prepare Xss Suite
    Open API Sessions
    Customer Session    xss    ${XSS_EMAIL}    ${XSS_PASSWORD}

First Invoice Id
    [Arguments]    ${alias}    ${url}
    ${v}=    Call API    ${alias}    GET    ${url}
    Status Should Be    ${v}    200    อ่านงวดของสัญญา
    ${id}=    Evaluate    next(d["id"] for i in $v.json()["installments"] if i["seq"] == 1 for d in i["documents"] if d["type"] == "INVOICE")
    RETURN    ${id}

Html Should Print As Text
    [Documentation]    เปิด PDF ทุกใบแล้วตรวจว่าแท็กปรากฏเป็นตัวอักษร — สรุปผลทุกใบก่อนค่อยตัดสิน ให้เห็นทุกใบที่พลาดในเคสเดียว
    [Arguments]    ${alias}    ${pdfs}
    @{seen}=    Create List
    @{wrong}=    Create List
    FOR    ${name}    ${url}    IN    &{pdfs}
        ${r}=    Call API    ${alias}    GET    ${url}    timeout=${120}
        IF    ${r.status_code} != 200
            Append To List    ${wrong}    ${name} ได้ ${r.status_code}
            CONTINUE
        END
        ${text}=    Pdf Text    ${r}
        ${img}=    Evaluate    $IMG_TAG in $text
        ${script}=    Evaluate    $SCRIPT_TAG in $text
        Append To List    ${seen}    ${name}: <img> ${{"เห็นเป็นตัวอักษร" if $img else "หาย"}} · <script> ${{"เห็นเป็นตัวอักษร" if $script else "หาย"}}
        IF    not ${img}    Append To List    ${wrong}    ${name}: ไม่พบข้อความ <img …> ในไฟล์ (อาจถูกตีเป็นแท็ก)
        # ใบแจ้งหนี้ไม่พิมพ์ที่ตั้งงาน — ตรวจ <script> เฉพาะใบที่มีที่ตั้ง
        IF    not ${script} and "${name}" != "ใบแจ้งหนี้"    Append To List    ${wrong}    ${name}: ไม่พบข้อความ <script> ในไฟล์
    END
    ${summary}=    Catenate    SEPARATOR=${SPACE}|${SPACE}    @{seen}
    IF    $wrong
        ${detail}=    Catenate    SEPARATOR=${SPACE}·${SPACE}    @{wrong}
        Fail    ${detail} — ${summary}
    END
    RETURN    ${summary}
