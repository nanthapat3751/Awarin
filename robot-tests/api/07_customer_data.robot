*** Settings ***
Documentation     API — ข้อมูลลูกค้า: ไอพีเฉพาะ OWNER · ไฟล์ CSV (BOM + กันสูตร Excel) · ค้นหา/แบ่งหน้าค่าแปลก · ข้อมูลข้ามลูกค้า · ระงับบัญชี · ส่งออกข้อมูล (PDPA)
Resource          resource.robot
Library           ApiHelpers.py
Variables         ${CURDIR}/../results/api-data.json
Suite Setup       Prepare Customer Data Suite
Suite Teardown    Delete All Sessions
Force Tags        api    module:API Customer Data


*** Variables ***
${DEACT_EMAIL}       robot.deact@example.test
${DEACT_PASSWORD}    Robot-Deact-2026!


*** Test Cases ***
TC_API_CUST_001 ไอพีของลูกค้าเห็นเฉพาะ OWNER
    [Documentation]    Scenario: ประวัติการใช้งานของลูกค้ามีไอพี (ข้อมูลส่วนบุคคล) — ADMIN ต้องไม่เห็น
    ...    Pre: robot.apicust มีประวัติเข้าสู่ระบบ · เซสชัน OWNER และ ADMIN
    ...    Steps: 1. OWNER GET /api/customers/{id}/activity | 2. ADMIN GET แบบเดียวกัน
    ...    Data: customerId ของ robot.apicust
    ...    Expected: OWNER เห็นไอพีอย่างน้อยหนึ่งรายการ · ADMIN ได้รายการเดียวกันแต่ช่อง ip เป็นค่าว่างทั้งหมด
    [Tags]    priority:High    security    pdpa
    ${o}=    Call API    owner    GET    /api/customers/${API_CUSTOMER_ID}/activity
    ${a}=    Call API    admin    GET    /api/customers/${API_CUSTOMER_ID}/activity
    Status Should Be    ${o}    200    OWNER
    Status Should Be    ${a}    200    ADMIN
    ${owner_ips}=    Evaluate    [x.get("ip") for x in $o.json()["activity"] if x.get("ip")]
    ${admin_ips}=    Evaluate    [x.get("ip") for x in $a.json()["activity"] if x.get("ip")]
    Should Not Be Empty    ${owner_ips}    msg=OWNER ไม่เห็นไอพีเลย (ข้อมูลทดสอบอาจไม่มีไอพี)
    Should Be Empty    ${admin_ips}    msg=ADMIN เห็นไอพี: ${admin_ips}
    ${n}=    Get Length    ${owner_ips}
    Record Actual    OWNER เห็นไอพี ${n} รายการ · ADMIN ไม่เห็นไอพีเลย

TC_API_CUST_002 ไฟล์ CSV รายชื่อลูกค้าเปิดภาษาไทยใน Excel ได้
    [Documentation]    Scenario: ส่งออกรายชื่อลูกค้าเป็น CSV แล้วเปิดใน Excel บน Windows
    ...    Pre: เซสชัน OWNER
    ...    Steps: 1. GET /api/customers/directory.csv
    ...    Data: -
    ...    Expected: 200 · Content-Type text/csv · ไฟล์ขึ้นต้นด้วย BOM (EF BB BF) ภาษาไทยจึงไม่เพี้ยน
    [Tags]    priority:Low
    ${r}=    Call API    owner    GET    /api/customers/directory.csv
    Status Should Be    ${r}    200    CSV
    Should Contain    ${r.headers}[Content-Type]    text/csv
    ${bom}=    Evaluate    $r.content[:3].hex()
    Should Be Equal    ${bom}    efbbbf    msg=ไฟล์ไม่ได้ขึ้นต้นด้วย BOM
    Record Actual    200 · text/csv · ขึ้นต้นด้วย BOM

TC_API_CUST_003 ชื่อลูกค้าที่เป็นสูตร Excel ถูกกันไม่ให้ทำงานในไฟล์ CSV
    [Documentation]    Scenario: CSV / formula injection — ลูกค้าตั้งชื่อเป็นสูตร (=HYPERLINK, +, -, @) เมื่อพนักงานเปิด CSV ใน Excel สูตรจะทำงาน
    ...    Pre: เซสชัน OWNER · ลูกค้า robot.other
    ...    Steps: 1. ตั้งชื่อลูกค้าเป็นสูตร | 2. GET /api/customers/directory.csv?q=HYPERLINK | 3. คืนชื่อเดิม
    ...    Data: fullName = =HYPERLINK("http://evil.example","คลิก")
    ...    Expected: ในไฟล์ CSV ชื่อนั้นถูกนำหน้าด้วย ' (ไม่ขึ้นต้นด้วย = ตรง ๆ) Excel จึงแสดงเป็นข้อความ
    [Tags]    priority:High    security
    &{evil}=    Create Dictionary    fullName==HYPERLINK("http://evil.example","คลิก")
    ${p}=    Call API    owner    PATCH    /api/customers/${OTHER_ID}    ${evil}
    Status Should Be    ${p}    200    ตั้งชื่อเป็นสูตร
    &{q}=    Create Dictionary    q=HYPERLINK
    ${r}=    Call API    owner    GET    /api/customers/directory.csv    params=${q}
    ${line}=    Evaluate    next((l for l in $r.content.decode("utf-8-sig").splitlines() if "HYPERLINK" in l), "")
    Should Not Be Empty    ${line}    msg=ไม่พบลูกค้าที่ตั้งชื่อเป็นสูตรในไฟล์
    ${raw_formula}=    Evaluate    any(c.lstrip('"').startswith("=") for c in __import__("csv").reader([$line]).__next__())
    Should Not Be True    ${raw_formula}    msg=มีช่องที่ขึ้นต้นด้วย = ตรง ๆ: ${line}
    [Teardown]    Restore Other Name
    Record Actual    ช่องชื่อในไฟล์เป็น ${line[:80]} — ไม่ขึ้นต้นด้วย = ตรง ๆ

TC_API_CUST_004 ค้นหาและแบ่งหน้าด้วยค่าแปลกไม่ทำให้ล่ม
    [Documentation]    Scenario: พิมพ์ค้นหาด้วยอักขระพิเศษ/ยาวมาก หรือแก้ URL หน้าเป็นค่าแปลก (ลิงก์เก่า/พิมพ์เอง)
    ...    Pre: เซสชัน OWNER
    ...    Steps: 1. GET /api/customers/directory ด้วย q และ page/pageSize แปลก ๆ ทีละแบบ (6 แบบ)
    ...    Data: q="%' OR 1=1--" · q=( * [ \ · q ยาว 5,000 ตัว · page=-1 · page=abc · pageSize=100000
    ...    Expected: ไม่มี 500 (คำค้นยาวเกินได้ 400) · pageSize ที่ขอเกินถูกบีบลงเหลือไม่เกินเพดานของระบบ 500 รายการต่อหน้า (CUSTOMER_PAGE_SIZE_MAX — ช่องเลือกลูกค้าฝั่งพนักงานขอ 500 ตามนี้)
    [Tags]    priority:Medium    security
    ${long}=    Long String    5000
    @{queries}=    Create List
    ...    ${{{"q": "%' OR 1=1--"}}}
    ...    ${{{"q": "( * [ \\\\"}}}
    ...    ${{{"q": $long}}}
    ...    ${{{"page": "-1"}}}
    ...    ${{{"page": "abc"}}}
    ...    ${{{"pageSize": "100000"}}}
    @{got}=    Create List
    FOR    ${q}    IN    @{queries}
        ${r}=    Call API    owner    GET    /api/customers/directory    params=${q}
        Append To List    ${got}    ${r.status_code}
        ${label}=    Evaluate    {k: (v if len(str(v)) < 40 else f"<ยาว {len(str(v))} ตัว>") for k, v in $q.items()}
        Should Be True    ${r.status_code} < 500    msg=${label} ได้ ${r.status_code}
    END
    ${r}=    Call API    owner    GET    /api/customers/directory    params=${{{"pageSize": "100000"}}}
    ${size}=    Evaluate    $r.json().get("pageSize")
    Should Be True    0 < ${size} <= 500    msg=ขอ 100,000 ได้ pageSize ${size}
    Record Actual    ได้ ${got} ไม่มี 500 · ขอ pageSize 100000 ได้จริง ${size}

TC_API_CUST_005 ลูกค้าเห็นเฉพาะใบเสนอราคาและสัญญาของตัวเอง
    [Documentation]    Scenario: รายการในพอร์ทัลต้องกรองตามเจ้าของ (กันข้อมูลข้ามลูกค้า)
    ...    Pre: ใบเสนอราคา/สัญญาชุด API เป็นของ robot.apicust · robot.other ไม่มีงาน
    ...    Steps: 1. robot.other GET /api/my/quotes | 2. GET /api/my/contracts | 3. GET /api/my/payments
    ...    Data: -
    ...    Expected: ไม่มีรายการของ robot.apicust ปนมาเลย (ไม่พบ quoteId/contractId ของชุด API)
    [Tags]    priority:High    security
    ${q}=    Call API    other    GET    /api/my/quotes
    ${c}=    Call API    other    GET    /api/my/contracts
    ${p}=    Call API    other    GET    /api/my/payments
    FOR    ${r}    IN    ${q}    ${c}    ${p}
        Status Should Be    ${r}    200    รายการของลูกค้าคนอื่น
        Should Not Contain    ${r.text}    ${API_QUOTE_ID}
        Should Not Contain    ${r.text}    ${API_CONTRACT_ID}
    END
    Record Actual    ใบเสนอราคา/สัญญา/การชำระของ robot.other ไม่มีข้อมูลของ robot.apicust

TC_API_CUST_006 ระงับบัญชีลูกค้าแล้วเซสชันเดิมใช้ไม่ได้ทันที
    [Documentation]    Scenario: OWNER ระงับบัญชีลูกค้า (เช่น ลูกค้าแจ้งว่าบัญชีถูกขโมย) — เซสชันที่เปิดค้างต้องหลุด
    ...    Pre: ลูกค้า robot.deact เข้าสู่ระบบค้างไว้ · เซสชัน OWNER
    ...    Steps: 1. OWNER POST /api/customers/{id}/active {"active": false} | 2. เซสชันลูกค้าเรียก /api/auth/me | 3. ลูกค้าเข้าสู่ระบบใหม่ | 4. เปิดบัญชีคืน
    ...    Data: {"active": false, "reason": "ทดสอบระงับ"} แล้ว {"active": true}
    ...    Expected: เซสชันเดิม → 401 · เข้าสู่ระบบใหม่ไม่ได้ (4xx) · เปิดคืนแล้วเข้าสู่ระบบได้
    [Tags]    priority:High    security
    Customer Session    deact    ${DEACT_EMAIL}    ${DEACT_PASSWORD}
    ${id}=    Customer Id    ${DEACT_EMAIL}
    &{off}=    Create Dictionary    active=${False}    reason=ทดสอบระงับ
    ${r}=    Call API    owner    POST    /api/customers/${id}/active    ${off}
    Status Should Be    ${r}    200    ระงับบัญชี
    ${me}=    Call API    deact    GET    /api/auth/me
    Status Should Be    ${me}    401    เซสชันเดิมหลังระงับ
    ${ip}=    Ip Header
    Create Session    deact_again    ${API_URL}    headers=${ip}    disable_warnings=1
    &{cred}=    Create Dictionary    email=${DEACT_EMAIL}    password=${DEACT_PASSWORD}
    ${l}=    POST On Session    deact_again    /api/auth/customer/login    json=${cred}    expected_status=any
    Should Be True    400 <= ${l.status_code} < 500    msg=บัญชีถูกระงับแต่เข้าสู่ระบบได้ ${l.status_code}
    &{on}=    Create Dictionary    active=${True}
    Call API    owner    POST    /api/customers/${id}/active    ${on}
    Customer Session    deact_back    ${DEACT_EMAIL}    ${DEACT_PASSWORD}
    Record Actual    ระงับ → เซสชันเดิม 401 · เข้าสู่ระบบใหม่ ${l.status_code} "${l.json()}[error]" · เปิดคืนแล้วเข้าสู่ระบบได้

TC_API_CUST_007 ส่งออกข้อมูลลูกค้า (PDPA) ได้เฉพาะ OWNER และมีข้อมูลของคนนั้นคนเดียว
    [Documentation]    Scenario: ลูกค้าขอสำเนาข้อมูลของตัวเองตาม PDPA — OWNER ส่งออกให้
    ...    Pre: เซสชัน OWNER และ ADMIN
    ...    Steps: 1. OWNER GET /api/customers/{robot.apicust}/export | 2. ADMIN GET แบบเดียวกัน
    ...    Data: customerId ของ robot.apicust
    ...    Expected: OWNER → 200 มีอีเมลของเจ้าของข้อมูล (robot.apicust) และไม่มีอีเมลของลูกค้าคนอื่น · ADMIN → 403
    [Tags]    priority:High    security    pdpa
    ${o}=    Call API    owner    GET    /api/customers/${API_CUSTOMER_ID}/export
    Status Should Be    ${o}    200    OWNER ส่งออก
    Should Contain    ${o.text}    ${API_CUST_EMAIL}
    Should Not Contain    ${o.text}    ${OTHER_EMAIL}
    ${a}=    Call API    admin    GET    /api/customers/${API_CUSTOMER_ID}/export
    Status Should Be    ${a}    403    ADMIN ส่งออก
    Record Actual    OWNER → 200 มีเฉพาะข้อมูลของ ${API_CUST_EMAIL} · ADMIN → 403


*** Keywords ***
Prepare Customer Data Suite
    Open API Sessions
    ${id}=    Customer Id    ${OTHER_EMAIL}
    Set Suite Variable    ${OTHER_ID}    ${id}

Customer Id
    [Arguments]    ${email}
    &{q}=    Create Dictionary    q=${email}
    ${r}=    Call API    owner    GET    /api/customers/directory    params=${q}
    ${rows}=    Evaluate    $r.json().get("customers") or $r.json().get("items") or $r.json().get("rows") or []
    ${id}=    Evaluate    next(c["id"] for c in $rows if c.get("email") == "${email}")
    RETURN    ${id}

Restore Other Name
    &{name}=    Create Dictionary    fullName=ลูกค้าอื่น โรบอท
    Call API    owner    PATCH    /api/customers/${OTHER_ID}    ${name}
