*** Settings ***
Documentation     API — เงิน: บันทึกรับเงิน · ยืนยันกับบัญชี · ใบเสร็จ · การแจ้งโอนของลูกค้า (สลิปจำลอง) · การเข้าถึงข้ามสัญญา/ข้ามลูกค้า
...
...               ใช้สัญญาของชุด API (results/api-data.json — seed สร้างใหม่ทุกรอบ วางบิลงวด 1–3 ไว้)
...               ลำดับเคสสำคัญ: งวด 1 = ADMIN บันทึก · งวด 2 = ออกใบเสร็จ · งวด 3–4 = ลูกค้าแจ้งโอน
Resource          resource.robot
Library           ApiHelpers.py
Library           DateTime
Variables         ${CURDIR}/../results/api-data.json
Variables         ${CURDIR}/../results/payment-data.json
Suite Setup       Prepare Money Suite
Suite Teardown    Delete All Sessions
Force Tags        api    module:API Money


*** Variables ***
${NOTICE_ID}      ${EMPTY}


*** Test Cases ***
TC_API_MONEY_001 บันทึกรับเงินด้วยข้อมูลผิดถูกปฏิเสธ
    [Documentation]    Scenario: พนักงานพิมพ์ยอด/วันที่/ช่องทางผิด หรือมีคนยิง API ตรงด้วยค่าแปลก ๆ
    ...    Pre: สัญญาของชุด API ลงนามแล้ว · งวด 1 วางบิลแล้ว · เซสชัน OWNER
    ...    Steps: 1. POST /installments/{งวด1}/payments ด้วยข้อมูลผิดทีละแบบ (7 แบบ)
    ...    Data: amount 0 · -100 · "abc" · 2,000,000,000 · ไม่มี paidOn · paidOn "2026-13-45" · method "BITCOIN"
    ...    Expected: ทุกแบบได้ 400 และไม่มีรายการรับเงินเกิดขึ้น
    [Tags]    priority:High
    @{bad}=    Create List
    ...    ${{{"amount": 0, "paidOn": "${API_TODAY_ISO}"}}}
    ...    ${{{"amount": -100, "paidOn": "${API_TODAY_ISO}"}}}
    ...    ${{{"amount": "abc", "paidOn": "${API_TODAY_ISO}"}}}
    ...    ${{{"amount": 2000000000, "paidOn": "${API_TODAY_ISO}"}}}
    ...    ${{{"amount": 100}}}
    ...    ${{{"amount": 100, "paidOn": "2026-13-45"}}}
    ...    ${{{"amount": 100, "paidOn": "${API_TODAY_ISO}", "method": "BITCOIN"}}}
    @{got}=    Create List
    FOR    ${body}    IN    @{bad}
        ${r}=    Call API    owner    POST    ${BASE}/installments/${API_INSTALLMENT_1}/payments    ${body}
        Append To List    ${got}    ${r.status_code}
    END
    Should Be Equal    ${got}    ${{[400] * 7}}    msg=ได้ ${got}
    ${count}=    Payments Count    1
    Should Be Equal As Integers    ${count}    0
    Record Actual    ทั้ง 7 แบบได้ 400 · งวด 1 ยังไม่มีรายการรับเงิน

TC_API_MONEY_002 ADMIN ยืนยันรายการรับเงินที่ตัวเองบันทึกไม่ได้
    [Documentation]    Scenario: กันคนเดียวบันทึกเองยืนยันเอง (ต้องมีคนที่สองเทียบบัญชี) — และลูกค้ายังไม่เห็นเงินจนกว่าจะยืนยัน
    ...    Pre: งวด 1 วางบิลแล้ว · เซสชัน ADMIN และ OWNER
    ...    Steps: 1. ADMIN บันทึกรับเงินงวด 1 | 2. ลูกค้าดูประวัติการชำระ | 3. ADMIN กดยืนยันเอง | 4. OWNER ยืนยัน
    ...    Data: amount = ยอดงวด 1 · paidOn = วันนี้ · method TRANSFER
    ...    Expected: บันทึกได้ (รอยืนยัน) · ลูกค้ายังไม่เห็นในประวัติ · ADMIN ยืนยันเองได้ 403 · OWNER ยืนยันได้ 200
    [Tags]    priority:High    security
    &{body}=    Create Dictionary    amount=${{float(${API_AMOUNT_1})}}    paidOn=${API_TODAY_ISO}    method=TRANSFER
    ${rec}=    Call API    admin    POST    ${BASE}/installments/${API_INSTALLMENT_1}/payments    ${body}
    Status Should Be    ${rec}    200    ADMIN บันทึกรับเงิน
    ${pay}=    Payment Of    1
    Should Be Equal    ${pay}[verifiedAt]    ${None}
    ${mine}=    Call API    customer    GET    /api/my/payments
    ${seen}=    Evaluate    [h for h in $mine.json()["payments"]["history"] if h.get("installmentId") == "${API_INSTALLMENT_1}"]
    Should Be Empty    ${seen}    msg=ลูกค้าเห็นรายการที่ยังไม่ยืนยันแล้ว
    ${self}=    Call API    admin    POST    ${BASE}/payments/${pay}[id]/verify
    Status Should Be    ${self}    403    ADMIN ยืนยันรายการของตัวเอง
    ${own}=    Call API    owner    POST    ${BASE}/payments/${pay}[id]/verify
    Status Should Be    ${own}    200    OWNER ยืนยัน
    Record Actual    ADMIN บันทึก → 200 (รอยืนยัน) · ลูกค้ายังไม่เห็น · ADMIN ยืนยันเอง → 403 · OWNER ยืนยัน → 200

TC_API_MONEY_003 ยืนยันซ้ำไม่ทำให้ข้อมูลเปลี่ยน
    [Documentation]    Scenario: กดยืนยันซ้ำ (ดับเบิลคลิก/ยิงซ้ำ) ต้องไม่สร้างผลซ้ำหรือเปลี่ยนเวลายืนยัน
    ...    Pre: รายการรับเงินงวด 1 ยืนยันแล้ว (TC_API_MONEY_002)
    ...    Steps: 1. จดเวลายืนยันเดิม | 2. POST verify ซ้ำ | 3. อ่านเวลายืนยันใหม่
    ...    Data: รายการรับเงินงวด 1
    ...    Expected: ได้ 200 หรือ 409 · เวลายืนยัน (verifiedAt) ไม่เปลี่ยน
    [Tags]    priority:Medium
    ${before}=    Payment Of    1
    Skip If    "${before}[verifiedAt]" == "None"    งวด 1 ยังไม่ได้ยืนยัน (TC_API_MONEY_002 ไม่ผ่าน)
    ${again}=    Call API    owner    POST    ${BASE}/payments/${before}[id]/verify
    Should Be True    ${again.status_code} in (200, 409)    msg=ได้ ${again.status_code}
    ${after}=    Payment Of    1
    Should Be Equal    ${after}[verifiedAt]    ${before}[verifiedAt]
    Record Actual    ยืนยันซ้ำ → ${again.status_code} · verifiedAt ไม่เปลี่ยน (${after}[verifiedAt])

TC_API_MONEY_004 ออกใบเสร็จก่อนยืนยันเงินเข้าไม่ได้
    [Documentation]    Scenario: ออกใบเสร็จทั้งที่ยังไม่มีใครเทียบบัญชีว่าเงินเข้าจริง
    ...    Pre: งวด 2 วางบิลแล้ว
    ...    Steps: 1. OWNER บันทึกรับเงินงวด 2 | 2. POST receipt ทันที | 3. ยืนยัน | 4. POST receipt อีกครั้ง
    ...    Data: amount = ยอดงวด 2 · paidOn = วันนี้
    ...    Expected: ใบเสร็จก่อนยืนยัน → 409 · หลังยืนยัน → 200 ได้ใบเสร็จเลข RC-…
    [Tags]    priority:High
    &{body}=    Create Dictionary    amount=${{float(${API_AMOUNT_2})}}    paidOn=${API_TODAY_ISO}    method=TRANSFER
    ${rec}=    Call API    owner    POST    ${BASE}/installments/${API_INSTALLMENT_2}/payments    ${body}
    Status Should Be    ${rec}    200    บันทึกรับเงินงวด 2
    ${pay}=    Payment Of    2
    ${early}=    Call API    owner    POST    ${BASE}/payments/${pay}[id]/receipt
    Status Should Be    ${early}    409    ใบเสร็จก่อนยืนยัน
    Call API    owner    POST    ${BASE}/payments/${pay}[id]/verify
    ${ok}=    Call API    owner    POST    ${BASE}/payments/${pay}[id]/receipt
    Status Should Be    ${ok}    200    ใบเสร็จหลังยืนยัน
    ${docs}=    Installment Of    2
    ${receipts}=    Evaluate    [d["docNo"] for d in $docs["documents"] if d["type"] != "INVOICE"]
    Should Not Be Empty    ${receipts}
    Record Actual    ก่อนยืนยัน → 409 · หลังยืนยัน → 200 ได้ ${receipts}

TC_API_MONEY_005 ลบรายการรับเงินที่ออกใบเสร็จแล้วไม่ได้
    [Documentation]    Scenario: ลบรายการที่มีเอกสารบัญชีออกไปแล้ว (ใบเสร็จต้องยกเลิกแทนลบ)
    ...    Pre: งวด 2 มีใบเสร็จแล้ว (TC_API_MONEY_004)
    ...    Steps: 1. DELETE /payments/{รายการงวด 2}
    ...    Data: รายการรับเงินงวด 2
    ...    Expected: 409 และรายการยังอยู่
    [Tags]    priority:High
    ${pay}=    Payment Of    2
    ${r}=    Call API    owner    DELETE    ${BASE}/payments/${pay}[id]
    Status Should Be    ${r}    409    ลบรายการที่มีใบเสร็จ
    ${count}=    Payments Count    2
    Should Be Equal As Integers    ${count}    1
    Record Actual    409 · รายการยังอยู่

TC_API_MONEY_006 เรียกสัญญาผ่านโครงการอื่นไม่ได้
    [Documentation]    Scenario: IDOR ฝั่งพนักงาน — ใส่เลขสัญญาของโครงการ A ไว้ใต้ URL ของโครงการ B
    ...    Pre: มีสองโครงการที่มีสัญญา (ชุด API และชุดหน้าจอชำระเงิน)
    ...    Steps: 1. GET /api/projects/{โครงการ B}/contracts/{สัญญาของ A}/payments | 2. POST บันทึกรับเงินแบบเดียวกัน
    ...    Data: projectId = โครงการชุดชำระเงิน · contractId = สัญญาชุด API
    ...    Expected: 404 ทั้งสองแบบ ไม่มีรายการรับเงินเกิดขึ้น
    [Tags]    priority:High    security
    ${wrong}=    Set Variable    /api/projects/${PAY_PROJECT_ID}/contracts/${API_CONTRACT_ID}
    ${r1}=    Call API    owner    GET    ${wrong}/payments
    &{body}=    Create Dictionary    amount=${100}    paidOn=${API_TODAY_ISO}
    ${r2}=    Call API    owner    POST    ${wrong}/installments/${API_INSTALLMENT_3}/payments    ${body}
    Should Be Equal    ${{[${r1.status_code}, ${r2.status_code}]}}    ${{[404, 404]}}    msg=ได้ ${r1.status_code} / ${r2.status_code}
    ${count}=    Payments Count    3
    Should Be Equal As Integers    ${count}    0
    Record Actual    GET → 404 · POST → 404 · งวด 3 ไม่มีรายการเกิดขึ้น

TC_API_MONEY_007 ลูกค้าอื่นดูงวดหรือแจ้งโอนในสัญญาของคนอื่นไม่ได้
    [Documentation]    Scenario: IDOR ฝั่งลูกค้า — ลูกค้าคนที่สองเดาเลขงวด/สัญญาของลูกค้าอีกคน
    ...    Pre: งวด 3 เป็นของ robot.apicust · เซสชัน robot.other
    ...    Steps: 1. GET /api/my/payments/{งวด 3} | 2. POST แจ้งโอนในสัญญานั้นพร้อมสลิป
    ...    Data: installmentId/contractId ของ robot.apicust
    ...    Expected: 404 ทั้งสองแบบ (เหมือนไม่มีอยู่จริง ไม่บอกว่ามีแต่ไม่ใช่ของคุณ)
    [Tags]    priority:High    security
    ${r1}=    Call API    other    GET    /api/my/payments/${API_INSTALLMENT_3}
    ${files}=    Slip Files    mockslip_${API_AMOUNT_3}_X${API_RUN}_${API_TODAY}_${API_ACCOUNT_NO}.png
    &{data}=    Create Dictionary    installmentId=${API_INSTALLMENT_3}    paidOn=${API_TODAY_ISO}    amount=${API_AMOUNT_3}
    ${r2}=    Post Multipart    other    /api/my/contracts/${API_CONTRACT_ID}/payment-notices    ${files}    ${data}
    Should Be Equal    ${{[${r1.status_code}, ${r2.status_code}]}}    ${{[404, 404]}}    msg=ได้ ${r1.status_code} / ${r2.status_code} ${r2.text[:100]}
    Record Actual    ดูงวด → 404 · แจ้งโอน → 404

TC_API_MONEY_008 แจ้งโอนด้วยข้อมูลหรือไฟล์ผิดถูกปฏิเสธ
    [Documentation]    Scenario: ลูกค้าส่งการแจ้งโอนผิดรูปแบบ — ยอดศูนย์/ติดลบ ไม่มีสลิป สลิปเกิน 3 ไฟล์ ไฟล์ไม่ใช่รูป ไฟล์ใหญ่ วันที่โอนในอนาคต
    ...    Pre: งวด 3 วางบิลแล้ว · เซสชัน robot.apicust
    ...    Steps: 1. POST /api/my/contracts/{สัญญา}/payment-notices ทีละแบบ (7 แบบ)
    ...    Data: amount 0 · amount -5 · ไม่มีไฟล์ · 4 ไฟล์ · slip.txt · ไฟล์ 11 MB · paidOn อีก 30 วัน
    ...    Expected: ทุกแบบได้ 400/413 และงวด 3 ยังไม่มีการแจ้งรอตรวจ
    [Tags]    priority:High    security
    ${future}=    Get Current Date    increment=30 days    result_format=%Y-%m-%d
    ${one}=    Slip Files    mockslip_${API_AMOUNT_3}_V${API_RUN}_${API_TODAY}_${API_ACCOUNT_NO}.png
    ${four}=    Slip Files    a.png    b.png    c.png    d.png
    ${txt}=    Text Bytes    not an image
    ${txtf}=    File Part    files    slip.txt    ${txt}    text/plain
    ${big}=    Big Bytes    11
    ${bigf}=    File Part    files    big.png    ${big}    image/png
    ${empty}=    Create List
    @{cases}=    Create List
    ...    ${{(0, $one, "${API_TODAY_ISO}")}}
    ...    ${{(-5, $one, "${API_TODAY_ISO}")}}
    ...    ${{(${API_AMOUNT_3}, $empty, "${API_TODAY_ISO}")}}
    ...    ${{(${API_AMOUNT_3}, $four, "${API_TODAY_ISO}")}}
    ...    ${{(${API_AMOUNT_3}, $txtf, "${API_TODAY_ISO}")}}
    ...    ${{(${API_AMOUNT_3}, $bigf, "${API_TODAY_ISO}")}}
    ...    ${{(${API_AMOUNT_3}, $one, $future)}}
    @{got}=    Create List
    FOR    ${case}    IN    @{cases}
        &{data}=    Create Dictionary    installmentId=${API_INSTALLMENT_3}    paidOn=${case}[2]    amount=${case}[0]
        ${r}=    Post Multipart    customer    /api/my/contracts/${API_CONTRACT_ID}/payment-notices    ${case}[1]    ${data}
        Append To List    ${got}    ${r.status_code}
    END
    ${ok}=    Evaluate    all(c in (400, 413) for c in $got)
    Should Be True    ${ok}    msg=ได้ ${got} (ลำดับ: ยอด 0 · ยอดติดลบ · ไม่มีไฟล์ · 4 ไฟล์ · .txt · 11 MB · วันที่อนาคต)
    ${inst}=    My Installment    3
    Should Be Equal    ${inst}[notice]    ${None}    msg=มีการแจ้งรอตรวจเกิดขึ้นแล้ว
    Record Actual    ได้ ${got} · งวด 3 ไม่มีการแจ้งเกิดขึ้น

TC_API_MONEY_009 แจ้งโอนพร้อมสลิปที่ตรวจผ่าน
    [Documentation]    Scenario: ลูกค้าแจ้งโอนงวด 3 ด้วยสลิปที่ยอด/วันที่/บัญชีตรง
    ...    Pre: งวด 3 วางบิลแล้ว ยังไม่มีการแจ้ง
    ...    Steps: 1. POST แจ้งโอนพร้อมสลิปจำลอง | 2. GET /api/my/payments/{งวด 3} | 3. พนักงานดูงวด 3
    ...    Data: สลิป mockslip_<ยอดงวด 3>_P<รอบ>_<วันนี้>_7260851635.png
    ...    Expected: 200 · ลูกค้าเห็นการแจ้งสถานะรอตรวจ · พนักงานเห็นการแจ้ง 1 รายการ ผลตรวจสลิป PASSED
    [Tags]    priority:High
    ${files}=    Slip Files    mockslip_${API_AMOUNT_3}_P${API_RUN}_${API_TODAY}_${API_ACCOUNT_NO}.png
    &{data}=    Create Dictionary    installmentId=${API_INSTALLMENT_3}    paidOn=${API_TODAY_ISO}    amount=${API_AMOUNT_3}
    ${r}=    Post Multipart    customer    /api/my/contracts/${API_CONTRACT_ID}/payment-notices    ${files}    ${data}
    Status Should Be    ${r}    200    แจ้งโอน
    ${inst}=    My Installment    3
    Set Suite Variable    ${NOTICE_ID}    ${inst}[notice][id]
    ${staff}=    Installment Of    3
    ${n}=    Get Length    ${staff}[pendingNotices]
    Should Be Equal As Integers    ${n}    1
    Should Be Equal    ${staff}[pendingNotices][0][slipCheck][status]    PASSED
    Record Actual    200 · ลูกค้าเห็นการแจ้งรอตรวจ · พนักงานเห็น 1 รายการ slipStatus=PASSED

TC_API_MONEY_010 แจ้งซ้ำขณะยังรอตรวจไม่ได้
    [Documentation]    Scenario: ลูกค้ากดส่งซ้ำ (เน็ตช้า) หรือแจ้งงวดเดิมซ้ำระหว่างรอบริษัทตรวจ
    ...    Pre: งวด 3 มีการแจ้งรอตรวจ (TC_API_MONEY_009)
    ...    Steps: 1. POST แจ้งโอนงวด 3 อีกครั้งด้วยสลิปใบใหม่
    ...    Data: สลิป mockslip_<ยอด>_Q<รอบ>_….png
    ...    Expected: 409 และงวด 3 ยังมีการแจ้งรอตรวจรายการเดียว
    [Tags]    priority:Medium
    ${files}=    Slip Files    mockslip_${API_AMOUNT_3}_Q${API_RUN}_${API_TODAY}_${API_ACCOUNT_NO}.png
    &{data}=    Create Dictionary    installmentId=${API_INSTALLMENT_3}    paidOn=${API_TODAY_ISO}    amount=${API_AMOUNT_3}
    ${r}=    Post Multipart    customer    /api/my/contracts/${API_CONTRACT_ID}/payment-notices    ${files}    ${data}
    Status Should Be    ${r}    409    แจ้งซ้ำ
    ${staff}=    Installment Of    3
    ${n}=    Get Length    ${staff}[pendingNotices]
    Should Be Equal As Integers    ${n}    1
    Record Actual    409 · งวด 3 ยังมีการแจ้งรอตรวจรายการเดียว

TC_API_MONEY_011 สลิปใบเดิมใช้แจ้งงวดอื่นไม่ได้
    [Documentation]    Scenario: ลูกค้านำสลิปใบเดียวกันไปแจ้งอีกงวด (สลิปซ้ำ)
    ...    Pre: สลิปเลขอ้างอิง P<รอบ> ใช้แจ้งงวด 3 อยู่ · งวด 4 วางบิลแล้ว (เตรียมไว้ตอนเริ่มชุด)
    ...    Steps: 1. POST แจ้งโอนงวด 4 ด้วยสลิปที่เลขอ้างอิงเดียวกับงวด 3
    ...    Data: สลิป mockslip_<ยอดงวด 4>_P<รอบ>_….png
    ...    Expected: ถูกปฏิเสธ (4xx) ด้วยเหตุผลสลิปซ้ำ และงวด 4 ไม่มีการแจ้งรอตรวจ
    [Tags]    priority:High    security
    ${amount4}=    Due Amount    4
    ${files}=    Slip Files    mockslip_${amount4}_P${API_RUN}_${API_TODAY}_${API_ACCOUNT_NO}.png
    &{data}=    Create Dictionary    installmentId=${API_INSTALLMENT_4}    paidOn=${API_TODAY_ISO}    amount=${amount4}
    ${r}=    Post Multipart    customer    /api/my/contracts/${API_CONTRACT_ID}/payment-notices    ${files}    ${data}
    Should Be True    400 <= ${r.status_code} < 500    msg=ได้ ${r.status_code} ${r.text[:120]}
    ${staff}=    Installment Of    4
    ${n}=    Get Length    ${staff}[pendingNotices]
    Should Be Equal As Integers    ${n}    0
    Record Actual    ${r.status_code} "${r.json()}[error]" · งวด 4 ไม่มีการแจ้งรอตรวจ

TC_API_MONEY_012 ลูกค้าคนอื่นยกเลิกการแจ้งโอนของคนอื่นไม่ได้
    [Documentation]    Scenario: IDOR — ลูกค้าคนที่สองยกเลิกการแจ้งโอนของลูกค้าอีกคน
    ...    Pre: งวด 3 มีการแจ้งรอตรวจของ robot.apicust (TC_API_MONEY_009)
    ...    Steps: 1. robot.other POST /payment-notices/{id}/cancel | 2. เจ้าของการแจ้งยกเลิกเอง
    ...    Data: noticeId ของ robot.apicust
    ...    Expected: คนอื่น → 404 การแจ้งยังรอตรวจ · เจ้าของ → 200
    [Tags]    priority:High    security
    Skip If    "${NOTICE_ID}" == ""    ไม่มีการแจ้งจาก TC_API_MONEY_009
    ${r1}=    Call API    other    POST    /api/my/contracts/${API_CONTRACT_ID}/payment-notices/${NOTICE_ID}/cancel
    Status Should Be    ${r1}    404    คนอื่นยกเลิก
    ${staff}=    Installment Of    3
    ${n}=    Get Length    ${staff}[pendingNotices]
    Should Be Equal As Integers    ${n}    1
    ${r2}=    Call API    customer    POST    /api/my/contracts/${API_CONTRACT_ID}/payment-notices/${NOTICE_ID}/cancel
    Status Should Be    ${r2}    200    เจ้าของยกเลิก
    Record Actual    คนอื่นยกเลิก → 404 (การแจ้งยังอยู่) · เจ้าของยกเลิก → 200

TC_API_MONEY_013 ปฏิเสธการแจ้งโอนต้องมีเหตุผล
    [Documentation]    Scenario: พนักงานกด "ไม่ตรง" โดยไม่ใส่เหตุผล — ลูกค้าจะไม่รู้ว่าต้องแก้อะไร
    ...    Pre: งวด 3 ไม่มีการแจ้งค้าง (ยกเลิกแล้วใน TC_API_MONEY_012) → แจ้งใหม่ด้วยสลิปใบใหม่
    ...    Steps: 1. ลูกค้าแจ้งโอนงวด 3 ใหม่ | 2. พนักงาน POST reject โดยไม่มีเหตุผล | 3. POST reject ด้วยเหตุผลว่าง
    ...    Data: {} · {"reason": ""}
    ...    Expected: 400 ทั้งสองแบบ และการแจ้งยังรอตรวจ
    [Tags]    priority:Medium
    ${files}=    Slip Files    mockslip_${API_AMOUNT_3}_R${API_RUN}_${API_TODAY}_${API_ACCOUNT_NO}.png
    &{data}=    Create Dictionary    installmentId=${API_INSTALLMENT_3}    paidOn=${API_TODAY_ISO}    amount=${API_AMOUNT_3}
    ${r}=    Post Multipart    customer    /api/my/contracts/${API_CONTRACT_ID}/payment-notices    ${files}    ${data}
    Status Should Be    ${r}    200    แจ้งโอนใหม่
    ${inst}=    My Installment    3
    ${id}=    Set Variable    ${inst}[notice][id]
    ${e1}=    Call API    owner    POST    ${BASE}/payment-notices/${id}/reject
    &{blank}=    Create Dictionary    reason=${EMPTY}
    ${e2}=    Call API    owner    POST    ${BASE}/payment-notices/${id}/reject    ${blank}
    Should Be Equal    ${{[${e1.status_code}, ${e2.status_code}]}}    ${{[400, 400]}}    msg=ได้ ${e1.status_code} / ${e2.status_code}
    ${staff}=    Installment Of    3
    ${n}=    Get Length    ${staff}[pendingNotices]
    Should Be Equal As Integers    ${n}    1
    Record Actual    ไม่มีเหตุผล → 400 · เหตุผลว่าง → 400 · การแจ้งยังรอตรวจ


*** Keywords ***
Prepare Money Suite
    Open API Sessions
    Set Suite Variable    ${BASE}    /api/projects/${API_PROJECT_ID}/contracts/${API_CONTRACT_ID}
    # งวด 4 ใช้ทดสอบสลิปซ้ำ — ต้องวางบิลก่อนลูกค้าจึงแจ้งได้
    &{due}=    Create Dictionary    dueOn=${API_TODAY_ISO}
    ${r}=    Call API    owner    POST    ${BASE}/installments/${API_INSTALLMENT_4}/invoice    ${due}
    Should Be True    ${r.status_code} in (200, 201, 409)    msg=วางบิลงวด 4 ไม่สำเร็จ ${r.status_code} ${r.text[:120]}

Installment Of
    [Documentation]    ข้อมูลงวดที่ seq จากมุมพนักงาน
    [Arguments]    ${seq}
    ${v}=    Call API    owner    GET    ${BASE}/payments
    ${inst}=    Evaluate    next(i for i in $v.json()["installments"] if i["seq"] == ${seq})
    RETURN    ${inst}

Payments Count
    [Arguments]    ${seq}
    ${inst}=    Installment Of    ${seq}
    ${n}=    Get Length    ${inst}[payments]
    RETURN    ${n}

Payment Of
    [Documentation]    รายการรับเงินล่าสุดของงวด
    [Arguments]    ${seq}
    ${inst}=    Installment Of    ${seq}
    Should Not Be Empty    ${inst}[payments]    msg=งวด ${seq} ยังไม่มีรายการรับเงิน
    RETURN    ${inst}[payments][-1]

My Installment
    [Documentation]    ข้อมูลงวดจากมุมลูกค้า (GET /api/my/payments/:installmentId)
    [Arguments]    ${seq}
    ${id}=    Set Variable    ${API_INSTALLMENT_${seq}}
    ${r}=    Call API    customer    GET    /api/my/payments/${id}
    Status Should Be    ${r}    200    อ่านงวด ${seq} ของลูกค้า
    ${d}=    Set Variable    ${r.json()}
    ${inst}=    Evaluate    $d.get("payment", $d) if isinstance($d, dict) else $d
    RETURN    ${inst}

Due Amount
    [Arguments]    ${seq}
    ${m}=    Call API    customer    GET    /api/my/payments
    ${amt}=    Evaluate    f'{next(d["amountToPay"] for d in $m.json()["payments"]["due"] if d["seq"] == ${seq}):.2f}'
    RETURN    ${amt}
