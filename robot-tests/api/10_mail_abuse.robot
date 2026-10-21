*** Settings ***
Documentation     API — ใช้ปลายทางส่งเมลยิงสแปมใส่อีเมลคนอื่น (Risk R-32): ลืมรหัสผ่าน · ส่งรหัสยืนยันอีเมลใหม่
...
...               ตัวกันที่ระบบมี: ต่อบัญชี = ส่งได้ 1 ฉบับต่อ 60 วินาที · ต่อไอพี = ลืมรหัสผ่าน 20 ครั้ง/15 นาที
...               (ใช้ร่วมกันทั้งฝั่งพนักงานและลูกค้า) และส่งรหัสยืนยันใหม่ 10 ครั้ง/ชั่วโมง
...               นับเมลที่ "ออกจริง" จาก log ของ API ชุดทดสอบ (MAIL_TRANSPORT=console — ไม่มีเมลออกไปไหน ดู MailLog.py)
...               แต่ละเคสใช้บัญชีของตัวเอง (seed ล้างช่วงพักทุกรอบ): ยิงทีละครั้ง = robot.mailflood / robot.codeflood
...               ยิงพร้อมกัน = robot.mailburst / robot.codeburst — ไม่ให้ช่วงพัก 60 วินาทีของเคสหนึ่งไปบังผลอีกเคส
Resource          resource.robot
Library           ApiHelpers.py
Suite Teardown    Delete All Sessions
Force Tags        api    module:API Mail Abuse


*** Variables ***
${FLOOD_EMAIL}        robot.mailflood@example.test
${BURST_EMAIL}        robot.mailburst@example.test
${CODE_EMAIL}         robot.codeflood@example.test
${CODE_BURST_EMAIL}   robot.codeburst@example.test


*** Test Cases ***
TC_API_MAIL_001 ขอลืมรหัสผ่านซ้ำ ๆ ให้อีเมลเดียวได้เมลฉบับเดียว
    [Documentation]    Scenario: คนร้ายสลับไอพียิง "ลืมรหัสผ่าน" ใส่อีเมลของเหยื่อ 5 ครั้ง ห่างกันครั้งละ 1 วินาที (เพดานต่อไอพีจึงไม่ช่วย)
    ...    Pre: บัญชีลูกค้า robot.mailflood ยืนยันอีเมลแล้ว ไม่มีลิงก์ค้าง
    ...    Steps: 1. นับเมลถึงเหยื่อใน log | 2. POST /api/auth/customer/forgot-password 5 ครั้ง คนละไอพี ห่างกัน 1 วินาที | 3. นับใหม่
    ...    Data: {"email": "robot.mailflood@example.test"} × 5 จากไอพีจำลอง 5 ตัว
    ...    Expected: ทุกครั้งได้ 200 ข้อความเดียวกัน (ไม่บอกว่าถูกพัก) · เหยื่อได้เมลเพิ่มแค่ 1 ฉบับ
    [Tags]    priority:High    security
    ${before}=    Mail Count To    ${FLOOD_EMAIL}
    &{body}=    Create Dictionary    email=${FLOOD_EMAIL}
    @{codes}=    Create List
    @{texts}=    Create List
    FOR    ${i}    IN RANGE    5
        Anonymous Session    flood${i}
        ${r}=    POST On Session    flood${i}    /api/auth/customer/forgot-password    json=${body}    expected_status=any
        Append To List    ${codes}    ${r.status_code}
        Append To List    ${texts}    ${r.text}
        Sleep    1s    # ระบบตอบก่อนแล้วค่อยส่งเมลเบื้องหลัง — เว้นให้ครั้งก่อนบันทึกเสร็จ (ยิงพร้อมกันดู TC_API_MAIL_002)
    END
    Wait For Mail To    ${FLOOD_EMAIL}    after_count=${before}
    Sleep    2s
    ${after}=    Mail Count To    ${FLOOD_EMAIL}
    Should Be Equal    ${codes}    ${{[200] * 5}}    msg=ได้สถานะ ${codes}
    ${same}=    Evaluate    len(set($texts)) == 1
    Should Be True    ${same}    msg=คำตอบไม่เหมือนกันทุกครั้ง (บอกใบ้ว่าถูกพัก/มีบัญชี): ${texts}
    ${sent}=    Evaluate    ${after} - ${before}
    Should Be Equal As Integers    ${sent}    1    msg=ยิง 5 ครั้ง เหยื่อได้เมล ${sent} ฉบับ
    Record Actual    ยิง 5 ครั้ง (5 ไอพี ห่างกัน 1 วินาที) ได้ 200 ข้อความเดียวกันทุกครั้ง · เหยื่อได้เมลเพิ่ม 1 ฉบับ

TC_API_MAIL_002 ขอลืมรหัสผ่านพร้อมกันหลายครั้งให้อีเมลเดียวได้เมลฉบับเดียว
    [Documentation]    Scenario: คนร้ายยิง "ลืมรหัสผ่าน" ใส่อีเมลเหยื่อ 10 คำขอพร้อมกันจาก 10 ไอพี (ช่วงพัก 60 วินาทีต้องกันได้เหมือนยิงทีละครั้ง)
    ...    Pre: บัญชีลูกค้า robot.mailburst ยืนยันอีเมลแล้ว ไม่มีลิงก์ค้าง
    ...    Steps: 1. นับเมลถึงเหยื่อ | 2. POST /api/auth/customer/forgot-password 10 คำขอพร้อมกัน คนละไอพี | 3. รอ 4 วินาทีแล้วนับใหม่
    ...    Data: {"email": "robot.mailburst@example.test"} × 10 (ยิงพร้อมกัน)
    ...    Expected: ทุกคำขอได้ 200 · เหยื่อได้เมลเพิ่มแค่ 1 ฉบับ (ลิงก์ที่ใช้ได้มีชุดเดียว)
    [Tags]    priority:High    security    concurrency
    ${before}=    Mail Count To    ${BURST_EMAIL}
    &{body}=    Create Dictionary    email=${BURST_EMAIL}
    @{calls}=    Create List
    FOR    ${i}    IN RANGE    10
        Anonymous Session    burst${i}
        Append To List    ${calls}    ${{["burst" + str($i), "POST", "/api/auth/customer/forgot-password", $body]}}
    END
    @{r}=    Parallel Calls    @{calls}
    ${codes}=    Evaluate    [x.status_code for x in $r]
    Wait For Mail To    ${BURST_EMAIL}    after_count=${before}
    Sleep    4s
    ${after}=    Mail Count To    ${BURST_EMAIL}
    ${sent}=    Evaluate    ${after} - ${before}
    Should Be Equal    ${codes}    ${{[200] * 10}}    msg=ได้สถานะ ${codes}
    Should Be Equal As Integers    ${sent}    1
    ...    msg=ยิงพร้อมกัน 10 คำขอ ได้ ${codes} แต่เหยื่อได้เมล ${sent} ฉบับ (รหัส/ลิงก์คนละชุด ใช้ได้แค่ฉบับล่าสุด) — ช่วงพัก 60 วินาทีกันคำขอที่มาพร้อมกันไม่ได้
    Record Actual    ยิงพร้อมกัน 10 คำขอได้ 200 ทุกคำขอ · เหยื่อได้เมลเพิ่ม 1 ฉบับ

TC_API_MAIL_003 ไอพีเดียวยิงลืมรหัสผ่านเกิน 20 ครั้งใน 15 นาทีถูกบล็อก
    [Documentation]    Scenario: บอทจากเครื่องเดียวไล่ยิง "ลืมรหัสผ่าน" ใส่อีเมลหลายร้อยที่อยู่ (สแปมแบบกว้าง)
    ...    Pre: ไอพีจำลองใหม่
    ...    Steps: 1. POST /api/auth/customer/forgot-password 21 ครั้งจากไอพีเดียว คนละอีเมล (ไม่มีบัญชี) | 2. ยิง /api/auth/staff/forgot-password ต่อจากไอพีเดิม
    ...    Data: {"email": "flood.<n>@example.test"} × 21 · {"username": "flood_probe"}
    ...    Expected: ครั้งที่ 1–20 ได้ 200 · ครั้งที่ 21 ได้ 429 · ปลายทางฝั่งพนักงานจากไอพีเดิมก็ได้ 429 (นับรวมกัน)
    [Tags]    priority:High    security
    Anonymous Session    spam
    @{codes}=    Create List
    FOR    ${i}    IN RANGE    21
        &{body}=    Create Dictionary    email=flood.${i}@example.test
        ${r}=    POST On Session    spam    /api/auth/customer/forgot-password    json=${body}    expected_status=any
        Append To List    ${codes}    ${r.status_code}
    END
    ${first20}=    Evaluate    $codes[:20]
    Should Be Equal    ${first20}    ${{[200] * 20}}    msg=ครั้งที่ 1–20 ได้ ${first20}
    Should Be Equal As Integers    ${codes}[20]    429    msg=ครั้งที่ 21 ได้ ${codes}[20]
    &{staff}=    Create Dictionary    username=flood_probe
    ${s}=    POST On Session    spam    /api/auth/staff/forgot-password    json=${staff}    expected_status=any
    Should Be Equal As Integers    ${s.status_code}    429    msg=เปลี่ยนไปยิงฝั่งพนักงานได้ ${s.status_code}
    Record Actual    ครั้งที่ 1–20 → 200 · ครั้งที่ 21 → 429 · ปลายทางพนักงานจากไอพีเดิม → 429

TC_API_MAIL_004 กดส่งรหัสยืนยันอีเมลซ้ำภายใน 60 วินาทีไม่ส่งเมลเพิ่ม
    [Documentation]    Scenario: กด "ส่งรหัสใหม่" ซ้ำที่หน้ายืนยันอีเมล (หรือยิง API ตรงใส่อีเมลคนอื่นที่สมัครค้างไว้) ทีละครั้ง
    ...    Pre: บัญชี robot.codeflood ยังไม่ยืนยันอีเมล ไม่มีรหัสค้าง
    ...    Steps: 1. POST /api/auth/customer/verify-email/resend | 2. ยิงซ้ำอีก 3 ครั้งคนละไอพี | 3. นับเมลใน log
    ...    Data: {"email": "robot.codeflood@example.test"} × 4
    ...    Expected: ครั้งแรก sent=true · ครั้งที่ 2–4 sent=false พร้อม retryAfterSeconds ≤ 60 · ได้เมลเพิ่ม 1 ฉบับ
    [Tags]    priority:Medium    security
    ${before}=    Mail Count To    ${CODE_EMAIL}
    &{body}=    Create Dictionary    email=${CODE_EMAIL}
    @{sent}=    Create List
    @{waits}=    Create List
    FOR    ${i}    IN RANGE    4
        Anonymous Session    code${i}
        ${r}=    POST On Session    code${i}    /api/auth/customer/verify-email/resend    json=${body}    expected_status=any
        Status Should Be    ${r}    200    ส่งรหัสครั้งที่ ${i + 1}
        Append To List    ${sent}    ${r.json()}[sent]
        Append To List    ${waits}    ${r.json()}[retryAfterSeconds]
    END
    Should Be Equal    ${sent}    ${{[True, False, False, False]}}    msg=ผล sent ของ 4 ครั้ง: ${sent}
    ${ok_wait}=    Evaluate    all(0 < w <= 60 for w in $waits[1:])
    Should Be True    ${ok_wait}    msg=retryAfterSeconds ${waits}
    Wait For Mail To    ${CODE_EMAIL}    after_count=${before}
    Sleep    1s
    ${after}=    Mail Count To    ${CODE_EMAIL}
    ${n}=    Evaluate    ${after} - ${before}
    Should Be Equal As Integers    ${n}    1    msg=กด 4 ครั้ง ได้เมล ${n} ฉบับ
    Record Actual    sent = ${sent} · รอ ${waits} วินาที · ได้เมลเพิ่ม 1 ฉบับ

TC_API_MAIL_005 กดส่งรหัสยืนยันอีเมลพร้อมกันหลายครั้งได้เมลฉบับเดียว
    [Documentation]    Scenario: ยิง "ส่งรหัสใหม่" ใส่อีเมลที่สมัครค้างไว้ 10 คำขอพร้อมกันจาก 10 ไอพี
    ...    Pre: บัญชี robot.codeburst ยังไม่ยืนยันอีเมล ไม่มีรหัสค้าง
    ...    Steps: 1. นับเมล | 2. POST /api/auth/customer/verify-email/resend 10 คำขอพร้อมกัน | 3. นับเมลใหม่
    ...    Data: {"email": "robot.codeburst@example.test"} × 10 (ยิงพร้อมกัน)
    ...    Expected: มีคำขอเดียวที่ sent=true ที่เหลือ sent=false · ได้เมลเพิ่ม 1 ฉบับ
    [Tags]    priority:Medium    security    concurrency
    ${before}=    Mail Count To    ${CODE_BURST_EMAIL}
    &{body}=    Create Dictionary    email=${CODE_BURST_EMAIL}
    @{calls}=    Create List
    FOR    ${i}    IN RANGE    10
        Anonymous Session    codeburst${i}
        Append To List    ${calls}    ${{["codeburst" + str($i), "POST", "/api/auth/customer/verify-email/resend", $body]}}
    END
    @{r}=    Parallel Calls    @{calls}
    ${sent}=    Evaluate    [x.json().get("sent", f"{x.status_code} {x.text[:60]}") for x in $r]
    Wait For Mail To    ${CODE_BURST_EMAIL}    after_count=${before}
    Sleep    2s
    ${after}=    Mail Count To    ${CODE_BURST_EMAIL}
    ${n}=    Evaluate    ${after} - ${before}
    Should Be Equal As Integers    ${n}    1
    ...    msg=ยิงพร้อมกัน 10 คำขอ ได้ sent = ${sent} และได้เมล ${n} ฉบับ (รหัสคนละตัว ใช้ได้แค่ตัวล่าสุด) — ช่วงพัก 60 วินาทีกันคำขอที่มาพร้อมกันไม่ได้
    Record Actual    ยิงพร้อมกัน 10 คำขอ ได้ sent = ${sent} · ได้เมลเพิ่ม 1 ฉบับ

TC_API_MAIL_006 ไอพีเดียวขอส่งรหัสยืนยันใหม่เกิน 10 ครั้งต่อชั่วโมงถูกบล็อก
    [Documentation]    Scenario: บอทเครื่องเดียวไล่ยิง "ส่งรหัสใหม่" ใส่อีเมลหลายที่อยู่
    ...    Pre: ไอพีจำลองใหม่
    ...    Steps: 1. POST /api/auth/customer/verify-email/resend 11 ครั้งจากไอพีเดียว คนละอีเมล (ไม่มีบัญชี)
    ...    Data: {"email": "code.<n>@example.test"} × 11
    ...    Expected: ครั้งที่ 1–10 ได้ 200 (ตอบเหมือนส่งแล้ว ไม่บอกว่ามีบัญชีไหม) · ครั้งที่ 11 ได้ 429
    [Tags]    priority:Medium    security
    Anonymous Session    codespam
    @{codes}=    Create List
    FOR    ${i}    IN RANGE    11
        &{body}=    Create Dictionary    email=code.${i}@example.test
        ${r}=    POST On Session    codespam    /api/auth/customer/verify-email/resend    json=${body}    expected_status=any
        Append To List    ${codes}    ${r.status_code}
    END
    ${first10}=    Evaluate    $codes[:10]
    Should Be Equal    ${first10}    ${{[200] * 10}}    msg=ครั้งที่ 1–10 ได้ ${first10}
    Should Be Equal As Integers    ${codes}[10]    429    msg=ครั้งที่ 11 ได้ ${codes}[10]
    Record Actual    ครั้งที่ 1–10 → 200 · ครั้งที่ 11 → 429


*** Keywords ***
Anonymous Session
    [Documentation]    เซสชันไม่เข้าสู่ระบบจากไอพีจำลองใหม่
    [Arguments]    ${alias}
    ${ip}=    Ip Header
    Create Session    ${alias}    ${API_URL}    headers=${ip}    disable_warnings=1
