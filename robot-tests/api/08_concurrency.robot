*** Settings ***
Documentation     API — กดพร้อมกัน (Risk R-30): สองคนกดวางบิล/ออกใบเสร็จรายการเดียวกันในวินาทีเดียว · เลขเอกสารต้องไม่ชนกัน
...
...               ยิงคำขอพร้อมกันจริงด้วย ApiHelpers.Parallel Calls (ปล่อยทุกเธรดพร้อมกันด้วย Barrier)
...               ใช้งวด 5–7 ของสัญญาชุด API (เคสอื่นใช้แค่งวด 1–4) และงวด 4–7 ของสัญญาชุด XSS (results/xss-data.json)
Resource          resource.robot
Library           ApiHelpers.py
Variables         ${CURDIR}/../results/api-data.json
Variables         ${CURDIR}/../results/xss-data.json
Suite Setup       Prepare Concurrency Suite
Suite Teardown    Delete All Sessions
Force Tags        api    module:API Concurrency


*** Test Cases ***
TC_API_CONC_001 สองคนกดวางบิลงวดเดียวกันพร้อมกันได้ใบแจ้งหนี้ใบเดียว
    [Documentation]    Scenario: OWNER กับ ADMIN เปิดหน้าสัญญาเดียวกันแล้วกด "วางบิล" งวดเดียวกันในวินาทีเดียว
    ...    Pre: งวด 7 ของสัญญาชุด API ยังไม่วางบิล · เซสชัน OWNER และ ADMIN
    ...    Steps: 1. POST /installments/{งวด7}/invoice จากสองเซสชันพร้อมกัน | 2. GET /payments ดูเอกสารของงวด 7
    ...    Data: {"dueOn": วันนี้} × 2 (ยิงพร้อมกัน)
    ...    Expected: สำเร็จแค่คำขอเดียว อีกคำขอได้ 409 (ไม่มี 500) · งวด 7 มีใบแจ้งหนี้ที่ใช้อยู่ใบเดียว
    [Tags]    priority:High    concurrency
    &{due}=    Create Dictionary    dueOn=${API_TODAY_ISO}
    ${url}=    Set Variable    ${BASE}/installments/${API_INSTALLMENT_7}/invoice
    @{r}=    Parallel Calls    ${{["owner", "POST", $url, $due]}}    ${{["admin", "POST", $url, $due]}}
    ${codes}=    Evaluate    sorted(x.status_code for x in $r)
    ${ok}=    Evaluate    sum(1 for c in $codes if c < 300)
    Should Be Equal As Integers    ${ok}    1    msg=สำเร็จ ${ok} คำขอ (ควรสำเร็จคำขอเดียว) — ได้ ${codes}
    Should Be True    max($codes) < 500    msg=มีคำขอที่ระบบล่ม ${codes}
    ${docs}=    Live Documents    ${API_INSTALLMENT_7}    INVOICE
    Length Should Be    ${docs}    1    msg=งวด 7 มีใบแจ้งหนี้ ${docs}
    Record Actual    ยิงพร้อมกัน 2 คำขอได้ ${codes} · งวด 7 มีใบแจ้งหนี้ใบเดียว (${docs}[0])

TC_API_CONC_002 วางบิลหลายงวดพร้อมกันได้เลขใบแจ้งหนี้ไม่ซ้ำกัน
    [Documentation]    Scenario: หลายคนวางบิลคนละงวด คนละสัญญา พร้อมกัน — ตัวนับเลขเอกสารต้องไม่แจกเลขเดียวกันซ้ำ
    ...    Pre: งวด 5–6 ของสัญญาชุด API และงวด 4–7 ของสัญญาชุด XSS ยังไม่วางบิล
    ...    Steps: 1. POST invoice 6 งวดพร้อมกัน (สลับ OWNER/ADMIN) | 2. อ่านเลขใบแจ้งหนี้ของทุกงวด
    ...    Data: {"dueOn": วันนี้} × 6 (ยิงพร้อมกัน)
    ...    Expected: สำเร็จครบ 6 · ได้เลขใบแจ้งหนี้ 6 เลขไม่ซ้ำกัน
    [Tags]    priority:High    concurrency
    &{due}=    Create Dictionary    dueOn=${API_TODAY_ISO}
    ${xss}=    Set Variable    /api/projects/${XSS_PROJECT_ID}/contracts/${XSS_CONTRACT_ID}
    @{r}=    Parallel Calls
    ...    ${{["owner", "POST", f"{$BASE}/installments/{$API_INSTALLMENT_5}/invoice", $due]}}
    ...    ${{["admin", "POST", f"{$BASE}/installments/{$API_INSTALLMENT_6}/invoice", $due]}}
    ...    ${{["owner", "POST", f"{$xss}/installments/{$XSS_INSTALLMENT_4}/invoice", $due]}}
    ...    ${{["admin", "POST", f"{$xss}/installments/{$XSS_INSTALLMENT_5}/invoice", $due]}}
    ...    ${{["owner", "POST", f"{$xss}/installments/{$XSS_INSTALLMENT_6}/invoice", $due]}}
    ...    ${{["admin", "POST", f"{$xss}/installments/{$XSS_INSTALLMENT_7}/invoice", $due]}}
    ${codes}=    Evaluate    [x.status_code for x in $r]
    Should Be Equal    ${codes}    ${{[200] * 6}}    msg=ผลการวางบิลพร้อมกัน ${codes} · ${r[0].text[:120]}
    ${nos}=    Evaluate    [x.json()["document"]["docNo"] for x in $r] if all("document" in x.json() for x in $r) else None
    IF    $nos is None
        ${nos}=    Invoice Numbers Of Concurrent Batch
    END
    ${unique}=    Evaluate    len(set($nos))
    Should Be Equal As Integers    ${unique}    6    msg=เลขใบแจ้งหนี้ซ้ำกัน: ${nos}
    Record Actual    วางบิล 6 งวดพร้อมกันสำเร็จครบ ได้เลขไม่ซ้ำ ${nos}

TC_API_CONC_003 สองคนกดออกใบเสร็จรายการเดียวกันพร้อมกันได้ใบเสร็จใบเดียว
    [Documentation]    Scenario: รับเงินงวด 5 แล้ว OWNER กับ ADMIN กด "ออกใบเสร็จ" พร้อมกัน
    ...    Pre: งวด 5 วางบิลแล้ว (TC_API_CONC_002) · บันทึกรับเงินเต็มงวดและยืนยันกับบัญชีแล้ว
    ...    Steps: 1. OWNER บันทึกรับเงินงวด 5 + ยืนยัน | 2. POST /payments/{id}/receipt จากสองเซสชันพร้อมกัน | 3. ดูเอกสารของงวด 5
    ...    Data: amount = ยอดงวด 5 · paidOn = วันนี้ · method TRANSFER
    ...    Expected: ออกใบเสร็จสำเร็จคำขอเดียว อีกคำขอได้ 409 (ไม่มี 500) · งวด 5 มีใบเสร็จใบเดียว
    [Tags]    priority:High    concurrency
    ${inst}=    Installment Of    ${API_INSTALLMENT_5}
    &{body}=    Create Dictionary    amount=${{float($inst["amount"])}}    paidOn=${API_TODAY_ISO}    method=TRANSFER
    ${rec}=    Call API    owner    POST    ${BASE}/installments/${API_INSTALLMENT_5}/payments    ${body}
    Status Should Be    ${rec}    200    บันทึกรับเงินงวด 5
    ${inst}=    Installment Of    ${API_INSTALLMENT_5}
    ${pay}=    Set Variable    ${inst}[payments][-1][id]
    ${v}=    Call API    owner    POST    ${BASE}/payments/${pay}/verify
    Status Should Be    ${v}    200    ยืนยันกับบัญชี
    ${url}=    Set Variable    ${BASE}/payments/${pay}/receipt
    @{r}=    Parallel Calls    ${{["owner", "POST", $url]}}    ${{["admin", "POST", $url]}}
    ${codes}=    Evaluate    sorted(x.status_code for x in $r)
    ${ok}=    Evaluate    sum(1 for c in $codes if c < 300)
    Should Be Equal As Integers    ${ok}    1    msg=ออกใบเสร็จสำเร็จ ${ok} คำขอ (ควรสำเร็จคำขอเดียว) — ได้ ${codes}
    Should Be True    max($codes) < 500    msg=มีคำขอที่ระบบล่ม ${codes}
    ${receipts}=    Live Documents    ${API_INSTALLMENT_5}    RECEIPT
    Length Should Be    ${receipts}    1    msg=งวด 5 มีใบเสร็จ ${receipts}
    Record Actual    ยิงพร้อมกัน 2 คำขอได้ ${codes} · งวด 5 มีใบเสร็จใบเดียว (${receipts}[0])


*** Keywords ***
Prepare Concurrency Suite
    Open API Sessions
    Set Suite Variable    ${BASE}    /api/projects/${API_PROJECT_ID}/contracts/${API_CONTRACT_ID}

Installment Of
    [Arguments]    ${installment_id}    ${base}=${BASE}
    ${v}=    Call API    owner    GET    ${base}/payments
    Status Should Be    ${v}    200    อ่านงวดของสัญญา
    FOR    ${inst}    IN    @{v.json()}[installments]
        IF    "${inst}[id]" == "${installment_id}"    RETURN    ${inst}
    END
    Fail    ไม่พบงวด ${installment_id}

Live Documents
    [Documentation]    เลขเอกสารที่ยังไม่ถูกยกเลิกของงวด — type INVOICE = ใบแจ้งหนี้ · อย่างอื่น = ใบเสร็จ/ใบกำกับภาษี
    [Arguments]    ${installment_id}    ${type}    ${base}=${BASE}
    ${inst}=    Installment Of    ${installment_id}    ${base}
    ${want_invoice}=    Evaluate    $type == "INVOICE"
    @{nos}=    Create List
    FOR    ${d}    IN    @{inst}[documents]
        ${is_invoice}=    Evaluate    $d["type"] == "INVOICE"
        IF    not $d["voidedAt"] and ${is_invoice} == ${want_invoice}    Append To List    ${nos}    ${d}[docNo]
    END
    RETURN    ${nos}

Invoice Numbers Of Concurrent Batch
    [Documentation]    เลขใบแจ้งหนี้ของ 6 งวดใน TC_API_CONC_002 (อ่านจากหน้าสัญญา ถ้าคำตอบไม่ได้แนบเอกสารมา)
    ${xss}=    Set Variable    /api/projects/${XSS_PROJECT_ID}/contracts/${XSS_CONTRACT_ID}
    @{nos}=    Create List
    FOR    ${id}    IN    ${API_INSTALLMENT_5}    ${API_INSTALLMENT_6}
        ${d}=    Live Documents    ${id}    INVOICE
        Append To List    ${nos}    @{d}
    END
    FOR    ${id}    IN    ${XSS_INSTALLMENT_4}    ${XSS_INSTALLMENT_5}    ${XSS_INSTALLMENT_6}    ${XSS_INSTALLMENT_7}
        ${d}=    Live Documents    ${id}    INVOICE    ${xss}
        Append To List    ${nos}    @{d}
    END
    RETURN    ${nos}
