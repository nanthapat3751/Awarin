*** Settings ***
Documentation     API — เข้าสู่ระบบฝั่งลูกค้า POST /api/auth/customer/login  {"email": "...", "password": "..."}
...
...               ทุกเคสใช้ไอพีจำลองของตัวเอง (X-Forwarded-For) — เพดาน 20 ครั้ง/15 นาทีทดสอบแยกที่ 99_rate_limit.robot
Resource          resource.robot
Library           ApiHelpers.py
Suite Teardown    Delete All Sessions
Force Tags        api    module:API Customer Login


*** Variables ***
${LOGIN}          /api/auth/customer/login
${GENERIC_401}    อีเมลหรือรหัสผ่านไม่ถูกต้อง


*** Test Cases ***
TC_API_LOGIN_C_001 ลูกค้าเข้าสู่ระบบสำเร็จ
    [Documentation]    Scenario: ลูกค้าที่ยืนยันอีเมลแล้วส่งอีเมลและรหัสผ่านถูกต้อง
    ...    Pre: มีบัญชี robot.customer@example.test (ยืนยันอีเมลแล้ว)
    ...    Steps: 1. POST /api/auth/customer/login
    ...    Data: {"email": "robot.customer@example.test", "password": "Robot-Cust-2026!"}
    ...    Expected: 200 · role = CUSTOMER · คุกกี้ systemboq_customer_session แบบ HttpOnly · ไม่มีข้อมูลลับในคำตอบ
    [Tags]    priority:High
    ${resp}=    Customer Login Attempt    ${CUSTOMER_EMAIL}    ${CUSTOMER_PASSWORD}
    Status Should Be    ${resp}    200
    Should Be Equal    ${resp.json()}[user][role]    CUSTOMER
    ${c}=    Cookie Attributes    ${resp}    systemboq_customer_session
    Should Be True    ${c}[httponly]
    ${leak}=    Contains Any Key    ${resp.json()}    passwordHash    totpSecret    twoFactorBackupCodes    signupTicketHash
    Should Be Empty    ${leak}    msg=คำตอบมีข้อมูลลับ: ${leak}
    Record Actual    200 · CUSTOMER · คุกกี้ HttpOnly · ไม่พบข้อมูลลับ

TC_API_LOGIN_C_002 อีเมลตัวพิมพ์ใหญ่และเว้นวรรคยังเข้าสู่ระบบได้
    [Documentation]    Scenario: ลูกค้าพิมพ์อีเมลขึ้นต้นตัวใหญ่ (มือถือเติมให้) หรือมีช่องว่างติดมา
    ...    Pre: มีบัญชี robot.customer@example.test
    ...    Steps: 1. POST ด้วยอีเมลตัวพิมพ์ใหญ่ปน | 2. POST ด้วยอีเมลมีช่องว่างหน้าหลัง
    ...    Data: "Robot.Customer@Example.TEST" · "  robot.customer@example.test  "
    ...    Expected: ทั้งสองแบบได้ 200 (อีเมลไม่สนตัวพิมพ์ใหญ่เล็กตามมาตรฐาน)
    [Tags]    priority:Medium
    ${r1}=    Customer Login Attempt    Robot.Customer@Example.TEST    ${CUSTOMER_PASSWORD}
    ${r2}=    Customer Login Attempt    ${SPACE}${SPACE}${CUSTOMER_EMAIL}${SPACE}${SPACE}    ${CUSTOMER_PASSWORD}
    Should Be Equal    ${{[${r1.status_code}, ${r2.status_code}]}}    ${{[200, 200]}}    msg=ได้ ${r1.status_code} / ${r2.status_code}
    Record Actual    ตัวพิมพ์ใหญ่ปน → 200 · มีช่องว่าง → 200

TC_API_LOGIN_C_003 รหัสผ่านผิดและอีเมลที่ไม่มีอยู่ได้คำตอบเดียวกัน
    [Documentation]    Scenario: ผู้โจมตีไล่เดาว่าอีเมลไหนเป็นลูกค้า
    ...    Pre: มีบัญชี robot.customer@example.test · ไม่มี nobody.robot@example.test
    ...    Steps: 1. POST รหัสผิดของบัญชีจริง | 2. POST อีเมลที่ไม่มีอยู่
    ...    Data: Wrong-Pass-999!
    ...    Expected: 401 ทั้งคู่ ข้อความ "อีเมลหรือรหัสผ่านไม่ถูกต้อง" เหมือนกันทุกตัวอักษร
    [Tags]    priority:High    security
    ${r1}=    Customer Login Attempt    ${CUSTOMER_EMAIL}    Wrong-Pass-999!
    ${r2}=    Customer Login Attempt    nobody.robot@example.test    Wrong-Pass-999!
    Status Should Be    ${r1}    401
    Status Should Be    ${r2}    401
    Should Be Equal    ${r1.json()}[error]    ${r2.json()}[error]
    Should Be Equal    ${r1.json()}[error]    ${GENERIC_401}
    [Teardown]    Reset Customer Failed Count
    Record Actual    401 ทั้งคู่ ข้อความเหมือนกัน "${GENERIC_401}"

TC_API_LOGIN_C_004 บัญชีที่ยังไม่ยืนยันอีเมลบอกสถานะเฉพาะเมื่อรหัสถูก
    [Documentation]    Scenario: บัญชีสมัครไว้แต่ยังไม่ยืนยันอีเมล — ต้องไม่บอกคนนอกที่ไม่รู้รหัสว่าอีเมลนี้สมัครไว้
    ...    Pre: มีบัญชี robot.unverified@example.test (ยังไม่ยืนยัน)
    ...    Steps: 1. POST รหัสผิด | 2. POST รหัสถูก
    ...    Data: Wrong-Pass-999! · Robot-Unver-2026!
    ...    Expected: รหัสผิด → 401 ข้อความทั่วไป · รหัสถูก → 403 "ยังไม่ได้ยืนยันอีเมล…" และไม่ได้คุกกี้เซสชัน
    [Tags]    priority:High    security
    ${r1}=    Customer Login Attempt    ${UNVERIFIED_EMAIL}    Wrong-Pass-999!
    ${r2}=    Customer Login Attempt    ${UNVERIFIED_EMAIL}    ${UNVERIFIED_PASSWORD}
    Status Should Be    ${r1}    401
    Should Be Equal    ${r1.json()}[error]    ${GENERIC_401}
    Status Should Be    ${r2}    403
    Should Contain    ${r2.json()}[error]    ยังไม่ได้ยืนยันอีเมล
    ${c}=    Cookie Attributes    ${r2}    systemboq_customer_session
    Should Be Empty    ${c}
    Record Actual    รหัสผิด → 401 ข้อความทั่วไป · รหัสถูก → 403 "${r2.json()}[error]" ไม่ได้คุกกี้

TC_API_LOGIN_C_005 บัญชีพนักงานเข้าทางลูกค้าไม่ได้
    [Documentation]    Scenario: ใช้ชื่อผู้ใช้/รหัสของพนักงานกับปลายทางลูกค้า
    ...    Pre: มีบัญชีพนักงาน robot_owner
    ...    Steps: 1. POST ด้วย robot_owner ในช่อง email
    ...    Data: {"email": "robot_owner", "password": "Robot-Owner-2026!"}
    ...    Expected: 400 (อีเมลผิดรูปแบบ) หรือ 401 — ไม่ได้เซสชัน
    [Tags]    priority:High    security
    ${resp}=    Customer Login Attempt    robot_owner    ${STAFF_PASSWORD}
    Should Be True    ${resp.status_code} in (400, 401)    msg=ได้ ${resp.status_code}
    ${c}=    Cookie Attributes    ${resp}    systemboq_customer_session
    Should Be Empty    ${c}
    Record Actual    ${resp.status_code} ไม่ได้คุกกี้เซสชัน

TC_API_LOGIN_C_006 ข้อมูลขาดหรือชนิดผิด
    [Documentation]    Scenario: ส่งคำขอไม่ครบหรือผิดชนิด
    ...    Pre: -
    ...    Steps: 1. POST {} | 2. ไม่มีรหัส | 3. อีเมลไม่มี @ | 4. อีเมลเป็นตัวเลข | 5. รหัสเป็นอ็อบเจกต์ {"$ne": ""}
    ...    Data: {} · {"email": "x@example.test"} · {"email": "robot.customer", "password": "x"} · {"email": 123, ...} · {"password": {"$ne": ""}}
    ...    Expected: ทุกแบบได้ 400 ไม่มี 500
    [Tags]    priority:Medium    security
    &{ne}=    Create Dictionary    $ne=${EMPTY}
    &{b1}=    Create Dictionary
    &{b2}=    Create Dictionary    email=x@example.test
    &{b3}=    Create Dictionary    email=robot.customer    password=x
    &{b4}=    Create Dictionary    email=${123}    password=x
    &{b5}=    Create Dictionary    email=${CUSTOMER_EMAIL}    password=${ne}
    @{got}=    Create List
    FOR    ${body}    IN    ${b1}    ${b2}    ${b3}    ${b4}    ${b5}
        ${resp}=    Login Raw    ${LOGIN}    json=${body}
        Append To List    ${got}    ${resp.status_code}
    END
    Should Be Equal    ${got}    ${{[400, 400, 400, 400, 400]}}    msg=ได้ ${got}
    Record Actual    ทั้ง 5 แบบได้ 400

TC_API_LOGIN_C_007 ข้อความอันตรายในอีเมลไม่ทำให้ล่ม
    [Documentation]    Scenario: ใส่ SQL injection / สคริปต์ / อักขระพิเศษในช่องอีเมล
    ...    Pre: -
    ...    Steps: 1. POST ด้วยอีเมลอันตราย 3 แบบ
    ...    Data: ' OR 1=1--@example.test · <script>alert(1)</script>@example.test · robot.customer@example.test%00
    ...    Expected: 400 หรือ 401 ทุกแบบ ไม่มี 200 ไม่มี 500
    [Tags]    priority:High    security
    @{got}=    Create List
    FOR    ${email}    IN    ' OR 1=1--@example.test    <script>alert(1)</script>@example.test    robot.customer@example.test\x00
        ${resp}=    Customer Login Attempt    ${email}    ${CUSTOMER_PASSWORD}
        Append To List    ${got}    ${resp.status_code}
        Should Be True    ${resp.status_code} in (400, 401)    msg=อีเมล ${email} ได้ ${resp.status_code}
    END
    Record Actual    ได้ ${got} — ไม่มีแบบไหนเข้าสู่ระบบหรือทำให้ล่ม

TC_API_LOGIN_C_008 ผิดครบ 5 ครั้งบัญชีลูกค้าถูกล็อก
    [Documentation]    Scenario: เดารหัสผ่านลูกค้าซ้ำจากหลายไอพี
    ...    Pre: บัญชี robot.lock@example.test ยังไม่เคยผิด (seed รีเซ็ตทุกรอบ)
    ...    Steps: 1. POST รหัสผิด 5 ครั้งจากไอพีต่างกัน | 2. ครั้งที่ 6 รหัสถูก
    ...    Data: robot.lock@example.test · Wrong-1..5 · Robot-LockCust-2026!
    ...    Expected: 1–5 → 401 · ครั้งที่ 6 → 423 พร้อม retryAfter ไม่ได้คุกกี้
    [Tags]    priority:High    security
    @{got}=    Create List
    FOR    ${i}    IN RANGE    1    6
        ${r}=    Customer Login Attempt    ${LOCK_CUST_EMAIL}    Wrong-${i}!
        Append To List    ${got}    ${r.status_code}
    END
    Should Be Equal    ${got}    ${{[401, 401, 401, 401, 401]}}    msg=ครั้งที่ 1–5 ได้ ${got}
    ${r}=    Customer Login Attempt    ${LOCK_CUST_EMAIL}    ${LOCK_CUST_PASSWORD}
    Status Should Be    ${r}    423
    Dictionary Should Contain Key    ${r.json()}    retryAfter
    Record Actual    1–5 → 401 · ครั้งที่ 6 (รหัสถูก) → 423 retryAfter=${r.json()}[retryAfter]


*** Keywords ***
Reset Customer Failed Count
    ${r}=    Customer Login Attempt    ${CUSTOMER_EMAIL}    ${CUSTOMER_PASSWORD}
    Should Be Equal As Integers    ${r.status_code}    200    msg=ล้างตัวนับไม่สำเร็จ: ${r.status_code}

Customer Login Attempt
    [Arguments]    ${email}    ${password}
    &{body}=    Create Dictionary    email=${email}    password=${password}
    ${resp}=    Login Raw    ${LOGIN}    json=${body}
    RETURN    ${resp}

Login Raw
    [Arguments]    ${url}    &{kwargs}
    ${headers}=    Ip Header
    Create Session    one    ${API_URL}    disable_warnings=1
    ${resp}=    POST On Session    one    ${url}    headers=${headers}    expected_status=any    &{kwargs}
    RETURN    ${resp}
