*** Settings ***
Documentation     API — เอกสาร: PDF ใบเสนอราคา/สัญญา/ใบแจ้งหนี้ · Excel ใบเสนอราคา · การเข้าถึงเอกสารของลูกค้าคนอื่น · path traversal
...
...               ใช้โครงการ/ใบเสนอราคา/สัญญาของชุด API (results/api-data.json) ซึ่งเป็นของ robot.apicust
Resource          resource.robot
Library           ApiHelpers.py
Variables         ${CURDIR}/../results/api-data.json
Variables         ${CURDIR}/../results/payment-data.json
Suite Setup       Prepare Documents Suite
Suite Teardown    Delete All Sessions
Force Tags        api    module:API Documents


*** Test Cases ***
TC_API_DOC_001 พนักงานดาวน์โหลด PDF ใบเสนอราคาได้
    [Documentation]    Scenario: พนักงานเปิด PDF ใบเสนอราคาของโครงการ
    ...    Pre: โครงการชุด API มีใบเสนอราคา (ยอมรับแล้ว) · เซสชัน OWNER
    ...    Steps: 1. GET /api/projects/{p}/quotes/{q}/pdf
    ...    Data: ใบเสนอราคาของโครงการชุด API
    ...    Expected: 200 · Content-Type application/pdf · เนื้อไฟล์ขึ้นต้น %PDF
    [Tags]    priority:High
    ${r}=    Call API    owner    GET    /api/projects/${API_PROJECT_ID}/quotes/${API_QUOTE_ID}/pdf    timeout=${120}
    Pdf Should Be Valid    ${r}
    ${kb}=    Evaluate    round(len($r.content) / 1024)
    Record Actual    200 · application/pdf · ${kb} KB ขึ้นต้น %PDF

TC_API_DOC_002 ลูกค้าเปิด PDF ใบเสนอราคาของตัวเองได้ แต่ของคนอื่นไม่ได้
    [Documentation]    Scenario: IDOR — ลูกค้าคนที่สองเดาเลขใบเสนอราคาของลูกค้าอีกคน
    ...    Pre: ใบเสนอราคาเป็นของ robot.apicust · เซสชัน robot.apicust และ robot.other
    ...    Steps: 1. เจ้าของ GET /api/my/quotes/{q}/pdf | 2. ลูกค้าคนอื่น GET แบบเดียวกัน | 3. ลูกค้าคนอื่น GET /api/my/quotes/{q}
    ...    Data: quoteId ของ robot.apicust
    ...    Expected: เจ้าของ → 200 PDF · คนอื่น → 404 ทั้ง PDF และรายละเอียด
    [Tags]    priority:High    security
    ${own}=    Call API    customer    GET    /api/my/quotes/${API_QUOTE_ID}/pdf    timeout=${120}
    Pdf Should Be Valid    ${own}
    ${o1}=    Call API    other    GET    /api/my/quotes/${API_QUOTE_ID}/pdf    timeout=${120}
    ${o2}=    Call API    other    GET    /api/my/quotes/${API_QUOTE_ID}
    Should Be Equal    ${{[${o1.status_code}, ${o2.status_code}]}}    ${{[404, 404]}}    msg=ลูกค้าคนอื่นได้ ${o1.status_code} / ${o2.status_code}
    Record Actual    เจ้าของ → 200 PDF · คนอื่น → 404 (PDF) / 404 (รายละเอียด)

TC_API_DOC_003 ลูกค้าเปิด PDF สัญญาของตัวเองได้ แต่ของคนอื่นไม่ได้
    [Documentation]    Scenario: IDOR — สัญญาจ้างเป็นเอกสารที่มีข้อมูลส่วนตัวและราคา
    ...    Pre: สัญญาเป็นของ robot.apicust
    ...    Steps: 1. เจ้าของ GET /api/my/contracts/{c}/pdf | 2. ลูกค้าคนอื่น GET แบบเดียวกัน
    ...    Data: contractId ของ robot.apicust
    ...    Expected: เจ้าของ → 200 PDF · คนอื่น → 404
    [Tags]    priority:High    security
    ${own}=    Call API    customer    GET    /api/my/contracts/${API_CONTRACT_ID}/pdf    timeout=${120}
    Pdf Should Be Valid    ${own}
    ${other}=    Call API    other    GET    /api/my/contracts/${API_CONTRACT_ID}/pdf    timeout=${120}
    Status Should Be    ${other}    404    ลูกค้าคนอื่น
    Record Actual    เจ้าของ → 200 PDF · คนอื่น → 404

TC_API_DOC_004 ลูกค้าเปิด PDF ใบแจ้งหนี้ของตัวเองได้ แต่ของคนอื่นไม่ได้
    [Documentation]    Scenario: IDOR — ใบแจ้งหนี้มียอดเงินและข้อมูลผู้ว่าจ้าง
    ...    Pre: งวด 1 ของสัญญาชุด API วางบิลแล้ว (seed)
    ...    Steps: 1. เจ้าของ GET /api/my/contracts/{c}/documents/{ใบแจ้งหนี้}/pdf | 2. ลูกค้าคนอื่น GET แบบเดียวกัน
    ...    Data: docId ใบแจ้งหนี้งวด 1
    ...    Expected: เจ้าของ → 200 PDF · คนอื่น → 404
    [Tags]    priority:High    security
    ${own}=    Call API    customer    GET    /api/my/contracts/${API_CONTRACT_ID}/documents/${INVOICE_ID}/pdf    timeout=${120}
    Pdf Should Be Valid    ${own}
    ${other}=    Call API    other    GET    /api/my/contracts/${API_CONTRACT_ID}/documents/${INVOICE_ID}/pdf    timeout=${120}
    Status Should Be    ${other}    404    ลูกค้าคนอื่น
    Record Actual    เจ้าของ → 200 PDF · คนอื่น → 404

TC_API_DOC_005 เอกสารของสัญญาหนึ่งเปิดผ่านสัญญาอื่นไม่ได้
    [Documentation]    Scenario: IDOR — ใส่เลขเอกสารของสัญญา A ใต้ URL ของสัญญา B (ทั้งฝั่งพนักงานและลูกค้า)
    ...    Pre: มีสองสัญญา: A = ชุด API (ของ robot.apicust) · B = ชุดหน้าจอชำระเงิน (ของ robot.customer)
    ...    Steps: 1. พนักงาน GET /api/projects/{โครงการ B}/contracts/{สัญญา B}/documents/{ใบแจ้งหนี้ของ A}/pdf | 2. ลูกค้า GET /api/my/contracts/{สัญญา B}/documents/{ใบแจ้งหนี้ของ A}/pdf
    ...    Data: สัญญา A = ชุด API · สัญญา B = ชุดหน้าจอชำระเงิน
    ...    Expected: 404 ทั้งสองฝั่ง
    [Tags]    priority:Medium    security
    ${r1}=    Call API    owner    GET    /api/projects/${PAY_PROJECT_ID}/contracts/${PAY_CONTRACT_ID}/documents/${INVOICE_ID}/pdf    timeout=${120}
    ${r2}=    Call API    customer    GET    /api/my/contracts/${PAY_CONTRACT_ID}/documents/${INVOICE_ID}/pdf    timeout=${120}
    Should Be Equal    ${{[${r1.status_code}, ${r2.status_code}]}}    ${{[404, 404]}}    msg=ได้ ${r1.status_code} / ${r2.status_code}
    Record Actual    พนักงาน → 404 · ลูกค้า → 404

TC_API_DOC_006 path traversal ในที่อยู่ไฟล์สลิปเปิดไฟล์ระบบไม่ได้
    [Documentation]    Scenario: ผู้โจมตีใส่ ../ ในที่อยู่ไฟล์หลักฐานเพื่ออ่านไฟล์ตั้งค่าของเซิร์ฟเวอร์ (เช่น .env ที่มีรหัสฐานข้อมูล)
    ...    Pre: เซสชัน robot.apicust และ OWNER
    ...    Steps: 1. GET evidence ด้วย evidenceId = ../../.env (เข้ารหัส URL) | 2. แบบ ..%5C (Windows) | 3. ฝั่งพนักงานแบบเดียวกัน
    ...    Data: ..%2F..%2F..%2F.env · ..%5C..%5C..%5C.env
    ...    Expected: 400/404 ทุกแบบ และคำตอบไม่มีข้อความจากไฟล์ .env (เช่น DATABASE_URL)
    [Tags]    priority:High    security
    @{urls}=    Create List
    ...    /api/my/contracts/${API_CONTRACT_ID}/payment-notices/x/evidence/..%2F..%2F..%2F.env
    ...    /api/my/contracts/${API_CONTRACT_ID}/payment-notices/x/evidence/..%5C..%5C..%5C.env
    @{got}=    Create List
    FOR    ${u}    IN    @{urls}
        ${r}=    Call API    customer    GET    ${u}
        Append To List    ${got}    ${r.status_code}
        Should Be True    ${r.status_code} in (400, 404)    msg=${u} ได้ ${r.status_code}
        Should Not Contain    ${r.text}    DATABASE_URL
    END
    ${s}=    Call API    owner    GET    /api/projects/${API_PROJECT_ID}/contracts/${API_CONTRACT_ID}/payment-notices/x/evidence/..%2F..%2F..%2F.env
    Should Be True    ${s.status_code} in (400, 404)    msg=ฝั่งพนักงานได้ ${s.status_code}
    Should Not Contain    ${s.text}    DATABASE_URL
    Record Actual    ลูกค้า → ${got} · พนักงาน → ${s.status_code} · ไม่มีเนื้อไฟล์ระบบรั่ว

TC_API_DOC_007 ส่งออกใบเสนอราคาเป็น Excel ได้และไม่มีราคาทุนในไฟล์ลูกค้า
    [Documentation]    Scenario: พนักงานส่งออกใบเสนอราคาเป็น Excel เพื่อส่งลูกค้า — ไฟล์ต้องไม่มีต้นทุน/กำไร
    ...    Pre: โครงการชุด API มีใบเสนอราคา
    ...    Steps: 1. GET /api/projects/{p}/quotes/{q}/export.xlsx
    ...    Data: ใบเสนอราคาชุด API (ต้นทุน BOQ 1,000,000 · กำไร 10%)
    ...    Expected: 200 · เป็นไฟล์ xlsx (zip ขึ้นต้น PK) · ไม่มีคำว่า "ต้นทุน" หรือ "กำไร" ในไฟล์
    [Tags]    priority:Medium    security
    ${r}=    Call API    owner    GET    /api/projects/${API_PROJECT_ID}/quotes/${API_QUOTE_ID}/export.xlsx    timeout=${120}
    Status Should Be    ${r}    200    ส่งออก Excel
    ${magic}=    Evaluate    $r.content[:2]
    Should Be Equal    ${magic}    ${{b"PK"}}
    ${text}=    Evaluate    __import__("zipfile").ZipFile(__import__("io").BytesIO($r.content)).read("xl/sharedStrings.xml").decode("utf-8") if "xl/sharedStrings.xml" in __import__("zipfile").ZipFile(__import__("io").BytesIO($r.content)).namelist() else ""
    Should Not Contain    ${text}    ต้นทุน
    Should Not Contain    ${text}    กำไร
    Record Actual    200 · ไฟล์ xlsx · ไม่พบคำว่า "ต้นทุน"/"กำไร" ในข้อความของไฟล์


*** Keywords ***
Prepare Documents Suite
    Open API Sessions
    ${v}=    Call API    owner    GET    /api/projects/${API_PROJECT_ID}/contracts/${API_CONTRACT_ID}/payments
    ${id}=    Evaluate    next(d["id"] for i in $v.json()["installments"] if i["seq"] == 1 for d in i["documents"] if d["type"] == "INVOICE")
    Set Suite Variable    ${INVOICE_ID}    ${id}

Pdf Should Be Valid
    [Arguments]    ${resp}
    Status Should Be    ${resp}    200    PDF
    Should Contain    ${resp.headers}[Content-Type]    application/pdf
    ${magic}=    Evaluate    $resp.content[:4]
    Should Be Equal    ${magic}    ${{b"%PDF"}}
