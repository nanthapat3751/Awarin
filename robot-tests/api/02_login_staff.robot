*** Settings ***
Documentation     API — เข้าสู่ระบบฝั่งพนักงาน POST /api/auth/staff/login  {"username": "...", "password": "..."}
...
...               ครบทุกแบบ: สำเร็จ · ข้อมูลผิด/ขาด · ชนิดข้อมูลผิด · ข้อมูลอันตราย · ขนาดผิดปกติ · ล็อกบัญชี · คุกกี้/เซสชัน
...               ทุกเคสใช้ไอพีจำลองของตัวเอง (X-Forwarded-For) เพดาน 20 ครั้ง/15 นาที จึงไม่นับปนกัน — ตัวเพดานทดสอบที่ 99_rate_limit.robot
Resource          resource.robot
Library           ApiHelpers.py
Suite Setup       Create Session    anon    ${API_URL}    disable_warnings=1
Suite Teardown    Delete All Sessions
Force Tags        api    module:API Staff Login


*** Variables ***
${LOGIN}          /api/auth/staff/login
${GENERIC_401}    ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง


*** Test Cases ***
TC_API_LOGIN_S_001 เข้าสู่ระบบสำเร็จได้ข้อมูลผู้ใช้โดยไม่มีข้อมูลลับ
    [Documentation]    Scenario: พนักงานส่งชื่อผู้ใช้และรหัสผ่านที่ถูกต้อง
    ...    Pre: มีบัญชี robot_owner (OWNER ไม่เปิด 2FA)
    ...    Steps: 1. POST /api/auth/staff/login พร้อมชื่อผู้ใช้และรหัสผ่าน
    ...    Data: {"username": "robot_owner", "password": "Robot-Owner-2026!"}
    ...    Expected: 200 · user.username = robot_owner · role = OWNER · ไม่มี passwordHash/totpSecret/twoFactorBackupCodes ในคำตอบ
    [Tags]    priority:High
    ${resp}=    Staff Login Attempt    robot_owner    ${STAFF_PASSWORD}
    Status Should Be    ${resp}    200
    Should Be Equal    ${resp.json()}[user][username]    robot_owner
    Should Be Equal    ${resp.json()}[user][role]    OWNER
    ${leak}=    Contains Any Key    ${resp.json()}    passwordHash    totpSecret    twoFactorBackupCodes    sessionVersion
    Should Be Empty    ${leak}    msg=คำตอบมีข้อมูลลับ: ${leak}
    Record Actual    200 · role OWNER · ไม่พบข้อมูลลับในคำตอบ

TC_API_LOGIN_S_002 คุกกี้เซสชันตั้งค่าความปลอดภัยถูกต้อง
    [Documentation]    Scenario: ตรวจคุกกี้ที่ได้หลังเข้าสู่ระบบสำเร็จ
    ...    Pre: มีบัญชี robot_owner
    ...    Steps: 1. เข้าสู่ระบบสำเร็จ | 2. อ่าน Set-Cookie ของคุกกี้เซสชันพนักงาน
    ...    Data: คุกกี้ systemboq_staff_session
    ...    Expected: HttpOnly (สคริปต์ในหน้าอ่านไม่ได้) · SameSite=Lax (กันส่งข้ามเว็บ) · Path=/ · มีวันหมดอายุ
    [Tags]    priority:High    security
    ${resp}=    Staff Login Attempt    robot_owner    ${STAFF_PASSWORD}
    Status Should Be    ${resp}    200
    ${c}=    Cookie Attributes    ${resp}    systemboq_staff_session
    Should Not Be Empty    ${c}    msg=ไม่พบคุกกี้ systemboq_staff_session ใน Set-Cookie
    Should Be True    ${c}[httponly]    msg=คุกกี้ไม่ได้ตั้ง HttpOnly
    Should Be Equal    ${c}[samesite]    lax
    Should Be Equal    ${c}[path]    /
    Should Not Be Empty    ${c}[expires]
    Record Actual    HttpOnly · SameSite=lax · Path=/ · หมดอายุ ${c}[expires] · Secure=${c}[secure] (ระบบทดสอบใช้ http จึงยังไม่ตั้ง Secure)

TC_API_LOGIN_S_003 รหัสผ่านผิด
    [Documentation]    Scenario: ชื่อผู้ใช้ถูก รหัสผ่านผิด
    ...    Pre: มีบัญชี robot_owner
    ...    Steps: 1. POST ด้วยรหัสผ่านผิด
    ...    Data: {"username": "robot_owner", "password": "Wrong-Pass-999!"}
    ...    Expected: 401 · "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" · ไม่มีคุกกี้เซสชัน
    [Tags]    priority:High
    ${resp}=    Staff Login Attempt    robot_owner    Wrong-Pass-999!
    Status Should Be    ${resp}    401
    Should Be Equal    ${resp.json()}[error]    ${GENERIC_401}
    ${c}=    Cookie Attributes    ${resp}    systemboq_staff_session
    Should Be Empty    ${c}    msg=รหัสผิดแต่ได้คุกกี้เซสชัน
    [Teardown]    Reset Owner Failed Count
    Record Actual    401 · "${GENERIC_401}" · ไม่มีคุกกี้เซสชัน

TC_API_LOGIN_S_004 ชื่อผู้ใช้ที่ไม่มีในระบบได้คำตอบเหมือนรหัสผิด
    [Documentation]    Scenario: ผู้โจมตีไล่เดาชื่อผู้ใช้ (account enumeration)
    ...    Pre: ไม่มีบัญชี no_such_user_api
    ...    Steps: 1. POST ด้วยชื่อผู้ใช้ที่ไม่มีอยู่
    ...    Data: {"username": "no_such_user_api", "password": "Wrong-Pass-999!"}
    ...    Expected: 401 และข้อความเดียวกับรหัสผิดทุกตัวอักษร — แยกไม่ออกว่าบัญชีมีอยู่จริงหรือไม่
    [Tags]    priority:High    security
    ${resp}=    Staff Login Attempt    no_such_user_api    Wrong-Pass-999!
    Status Should Be    ${resp}    401
    Should Be Equal    ${resp.json()}[error]    ${GENERIC_401}
    Record Actual    401 · ข้อความเหมือนรหัสผิดทุกตัวอักษร

TC_API_LOGIN_S_005 เวลาตอบของชื่อผู้ใช้ที่มีจริงกับไม่มีจริงใกล้เคียงกัน
    [Documentation]    Scenario: ผู้โจมตีจับเวลาตอบเพื่อเดาว่าบัญชีไหนมีจริง (timing attack)
    ...    Pre: มีบัญชี robot_owner · ไม่มีบัญชี no_such_user_api
    ...    Steps: 1. ยิงรหัสผิดของบัญชีจริง 3 ครั้ง | 2. ยิงบัญชีที่ไม่มีจริง 3 ครั้ง | 3. เทียบค่ากลางของเวลาตอบ
    ...    Data: รหัสผ่าน Wrong-Pass-999! ทุกครั้ง
    ...    Expected: เวลาตอบสองแบบต่างกันไม่เกิน 150 ms (ระบบตรวจรหัสด้วย argon2 ทั้งสองทาง)
    [Tags]    priority:Medium    security
    @{real}=    Create List
    @{fake}=    Create List
    FOR    ${i}    IN RANGE    3
        ${a}=    Staff Login Attempt    robot_owner    Wrong-Pass-999!
        ${b}=    Staff Login Attempt    no_such_user_api    Wrong-Pass-999!
        ${ta}=    Elapsed Ms    ${a}
        ${tb}=    Elapsed Ms    ${b}
        Append To List    ${real}    ${ta}
        Append To List    ${fake}    ${tb}
    END
    ${mr}=    Evaluate    sorted($real)[1]
    ${mf}=    Evaluate    sorted($fake)[1]
    ${diff}=    Evaluate    abs(${mr} - ${mf})
    Should Be True    ${diff} <= 150    msg=บัญชีจริง ${mr} ms · ไม่มีจริง ${mf} ms ต่างกัน ${diff} ms — จับเวลาแยกได้ว่าบัญชีไหนมีอยู่
    [Teardown]    Reset Owner Failed Count
    Record Actual    ค่ากลาง: บัญชีจริง ${mr} ms · ไม่มีจริง ${mf} ms · ต่างกัน ${diff} ms

TC_API_LOGIN_S_006 ไม่ส่งชื่อผู้ใช้หรือรหัสผ่าน
    [Documentation]    Scenario: ส่งคำขอโดยขาดช่องที่จำเป็น
    ...    Pre: -
    ...    Steps: 1. POST {} | 2. POST ไม่มี username | 3. POST ไม่มี password | 4. POST ค่าว่าง
    ...    Data: {} · {"password": "x"} · {"username": "robot_owner"} · {"username": "", "password": ""}
    ...    Expected: ทุกแบบได้ 400 (ข้อมูลไม่ครบ) ไม่ใช่ 401/500
    [Tags]    priority:Medium
    &{b1}=    Create Dictionary
    &{b2}=    Create Dictionary    password=x
    &{b3}=    Create Dictionary    username=robot_owner
    &{b4}=    Create Dictionary    username=${EMPTY}    password=${EMPTY}
    @{got}=    Create List
    FOR    ${body}    IN    ${b1}    ${b2}    ${b3}    ${b4}
        ${resp}=    Login Raw    ${LOGIN}    json=${body}
        Append To List    ${got}    ${resp.status_code}
    END
    Should Be Equal    ${got}    ${{[400, 400, 400, 400]}}    msg=ได้ ${got}
    Record Actual    ทั้ง 4 แบบได้ 400

TC_API_LOGIN_S_007 ชนิดข้อมูลผิดไม่ทำให้ระบบล่ม
    [Documentation]    Scenario: ส่งชื่อผู้ใช้เป็นตัวเลข รายการ อ็อบเจกต์ หรือ null
    ...    Pre: -
    ...    Steps: 1. POST ด้วย username แต่ละชนิด
    ...    Data: 12345 · ["robot_owner"] · {"a": 1} · null · true
    ...    Expected: ทุกแบบได้ 400 ไม่มี 500
    [Tags]    priority:High    security
    @{got}=    Create List
    FOR    ${value}    IN    ${12345}    ${{["robot_owner"]}}    ${{{"a": 1}}}    ${None}    ${True}
        &{body}=    Create Dictionary    username=${value}    password=${STAFF_PASSWORD}
        ${resp}=    Login Raw    ${LOGIN}    json=${body}
        Append To List    ${got}    ${resp.status_code}
    END
    Should Be Equal    ${got}    ${{[400, 400, 400, 400, 400]}}    msg=ได้ ${got}
    Record Actual    ทั้ง 5 ชนิดได้ 400

TC_API_LOGIN_S_008 ตัวดำเนินการแบบ NoSQL injection ถูกปฏิเสธ
    [Documentation]    Scenario: ผู้โจมตีส่งอ็อบเจกต์ตัวดำเนินการแทนรหัสผ่าน เพื่อให้เงื่อนไขเป็นจริงเสมอ
    ...    Pre: มีบัญชี robot_owner
    ...    Steps: 1. POST ด้วย password เป็น {"$ne": ""} | 2. POST ด้วย username เป็น {"$gt": ""}
    ...    Data: {"username": "robot_owner", "password": {"$ne": ""}} · {"username": {"$gt": ""}, "password": "x"}
    ...    Expected: 400 ทั้งสองแบบ ไม่ได้เข้าสู่ระบบ
    [Tags]    priority:High    security
    &{ne}=    Create Dictionary    $ne=${EMPTY}
    &{gt}=    Create Dictionary    $gt=${EMPTY}
    &{b1}=    Create Dictionary    username=robot_owner    password=${ne}
    &{b2}=    Create Dictionary    username=${gt}    password=x
    ${r1}=    Login Raw    ${LOGIN}    json=${b1}
    ${r2}=    Login Raw    ${LOGIN}    json=${b2}
    Should Be Equal    ${{[${r1.status_code}, ${r2.status_code}]}}    ${{[400, 400]}}
    Record Actual    ได้ ${r1.status_code} และ ${r2.status_code} ไม่ได้เข้าสู่ระบบ

TC_API_LOGIN_S_009 ข้อความ SQL injection ไม่ทำให้เข้าสู่ระบบหรือล่ม
    [Documentation]    Scenario: ผู้โจมตีใส่คำสั่ง SQL ในช่องชื่อผู้ใช้และรหัสผ่าน
    ...    Pre: -
    ...    Steps: 1. POST ด้วยข้อความ SQL injection ที่พบบ่อย 3 แบบ
    ...    Data: ' OR '1'='1 · robot_owner'-- · "; DROP TABLE "User"; --
    ...    Expected: ทุกแบบได้ 401 (ชื่อหรือรหัสผิด) ไม่มี 200 ไม่มี 500
    [Tags]    priority:High    security
    @{got}=    Create List
    FOR    ${value}    IN    ' OR '1'='1    robot_owner'--    "; DROP TABLE "User"; --
        ${resp}=    Staff Login Attempt    ${value}    ${value}
        Append To List    ${got}    ${resp.status_code}
    END
    Should Be Equal    ${got}    ${{[401, 401, 401]}}    msg=ได้ ${got}
    Record Actual    ทั้ง 3 แบบได้ 401

TC_API_LOGIN_S_010 ชื่อผู้ใช้และรหัสผ่านยาวผิดปกติ
    [Documentation]    Scenario: ส่งข้อความยาวมากเพื่อทำให้ระบบช้าหรือล่ม (เช่น บังคับให้แฮชรหัสผ่านยาว ๆ)
    ...    Pre: มีบัญชี robot_owner
    ...    Steps: 1. POST ชื่อผู้ใช้ยาว 10,000 ตัว | 2. POST รหัสผ่านยาว 90,000 ตัว
    ...    Data: "a" × 10,000 · "a" × 90,000 (ต่ำกว่าเพดาน body 100 KB)
    ...    Expected: ไม่ 500 · ไม่ได้เข้าสู่ระบบ (400/401) · ตอบภายใน 3 วินาที
    [Tags]    priority:Medium    security
    ${long_user}=    Long String    10000
    ${long_pass}=    Long String    90000
    ${r1}=    Staff Login Attempt    ${long_user}    x
    ${r2}=    Staff Login Attempt    robot_owner    ${long_pass}
    FOR    ${r}    IN    ${r1}    ${r2}
        Should Be True    ${r.status_code} in (400, 401)    msg=ได้ ${r.status_code}
        ${ms}=    Elapsed Ms    ${r}
        Should Be True    ${ms} < 3000    msg=ใช้เวลา ${ms} ms
    END
    ${t1}=    Elapsed Ms    ${r1}
    ${t2}=    Elapsed Ms    ${r2}
    [Teardown]    Reset Owner Failed Count
    Record Actual    ชื่อยาว → ${r1.status_code} (${t1} ms) · รหัสยาว → ${r2.status_code} (${t2} ms)

TC_API_LOGIN_S_011 body ใหญ่เกินเพดานถูกปฏิเสธ
    [Documentation]    Scenario: ส่ง JSON ขนาดใหญ่กว่าที่ระบบรับ (100 KB)
    ...    Pre: -
    ...    Steps: 1. POST body ขนาดประมาณ 200 KB
    ...    Data: {"username": "robot_owner", "password": "a" × 200,000}
    ...    Expected: 413 (ใหญ่เกิน) ไม่ใช่ 500
    [Tags]    priority:Medium    security
    ${huge}=    Long String    200000
    ${resp}=    Staff Login Attempt    robot_owner    ${huge}
    Status Should Be    ${resp}    413
    Record Actual    413 · ${resp.text[:80]}

TC_API_LOGIN_S_012 JSON เสียและ Content-Type ผิด
    [Documentation]    Scenario: ส่ง body ที่ไม่ใช่ JSON ที่ถูกต้อง
    ...    Pre: -
    ...    Steps: 1. POST JSON ไม่ปิดวงเล็บ (application/json) | 2. POST ข้อความธรรมดา (text/plain)
    ...    Data: {"username": "robot_owner", · username=robot_owner&password=x
    ...    Expected: ทั้งสองแบบได้ 400 พร้อมข้อความ error ไม่ใช่ 500 หรือหน้า HTML ที่เผยรายละเอียดระบบ
    [Tags]    priority:Medium    security
    ${ip1}=    Fresh Ip
    ${ip2}=    Fresh Ip
    &{json_h}=    Create Dictionary    Content-Type=application/json    X-Forwarded-For=${ip1}
    &{text_h}=    Create Dictionary    Content-Type=text/plain    X-Forwarded-For=${ip2}
    ${r1}=    POST On Session    anon    ${LOGIN}    data={"username": "robot_owner",    headers=${json_h}    expected_status=any
    ${r2}=    POST On Session    anon    ${LOGIN}    data=username=robot_owner&password=x    headers=${text_h}    expected_status=any
    Should Be Equal    ${{[${r1.status_code}, ${r2.status_code}]}}    ${{[400, 400]}}    msg=ได้ ${r1.status_code} / ${r2.status_code}
    Should Not Contain    ${r1.text}    at JSON.parse    msg=คำตอบเผย stack trace
    Should Not Contain    ${r1.text}    node_modules    msg=คำตอบเผยโครงสร้างไฟล์ระบบ
    Record Actual    JSON เสีย → ${r1.status_code} · text/plain → ${r2.status_code} · ไม่เผย stack trace

TC_API_LOGIN_S_013 เรียกด้วย method อื่น
    [Documentation]    Scenario: ใช้ GET กับปลายทางเข้าสู่ระบบ (เช่น ใส่รหัสผ่านใน URL)
    ...    Pre: -
    ...    Steps: 1. GET /api/auth/staff/login?username=robot_owner&password=...
    ...    Data: รหัสผ่านใน query string
    ...    Expected: 404/405 ไม่เข้าสู่ระบบ ไม่ได้คุกกี้ (ระบบต้องไม่รับรหัสผ่านทาง URL)
    [Tags]    priority:Low    security
    &{query}=    Create Dictionary    username=robot_owner    password=${STAFF_PASSWORD}
    ${resp}=    GET On Session    anon    ${LOGIN}    params=${query}    expected_status=any
    Should Be True    ${resp.status_code} in (404, 405)    msg=ได้ ${resp.status_code}
    ${c}=    Cookie Attributes    ${resp}    systemboq_staff_session
    Should Be Empty    ${c}
    Record Actual    ${resp.status_code} ไม่ได้คุกกี้เซสชัน

TC_API_LOGIN_S_014 บัญชีลูกค้าเข้าทางพนักงานไม่ได้
    [Documentation]    Scenario: ใช้อีเมลและรหัสผ่านของลูกค้ากับปลายทางพนักงาน
    ...    Pre: มีบัญชีลูกค้า robot.customer@example.test
    ...    Steps: 1. POST ด้วยอีเมลลูกค้าในช่อง username
    ...    Data: {"username": "robot.customer@example.test", "password": "Robot-Cust-2026!"}
    ...    Expected: 401 ข้อความทั่วไป
    [Tags]    priority:High    security
    ${resp}=    Staff Login Attempt    ${CUSTOMER_EMAIL}    ${CUSTOMER_PASSWORD}
    Status Should Be    ${resp}    401
    Should Be Equal    ${resp.json()}[error]    ${GENERIC_401}
    Record Actual    401 · "${GENERIC_401}"

TC_API_LOGIN_S_015 เว้นวรรคหน้าหลังชื่อผู้ใช้ (คัดลอกมาจากแชต)
    [Documentation]    Scenario: พนักงานคัดลอกชื่อผู้ใช้จาก LINE มามีช่องว่างติดมา
    ...    Pre: มีบัญชี robot_owner
    ...    Steps: 1. POST ด้วยชื่อผู้ใช้ที่มีช่องว่างหน้าและหลัง
    ...    Data: {"username": "  robot_owner  ", "password": "Robot-Owner-2026!"}
    ...    Expected: 200 เข้าสู่ระบบได้ (ตัดช่องว่างให้)
    [Tags]    priority:Low
    ${resp}=    Staff Login Attempt    ${SPACE}${SPACE}robot_owner${SPACE}${SPACE}    ${STAFF_PASSWORD}
    Status Should Be    ${resp}    200
    Record Actual    200 · ตัดช่องว่างแล้วเข้าสู่ระบบได้

TC_API_LOGIN_S_016 ผิดครบ 5 ครั้งบัญชีถูกล็อกแม้รหัสถูก
    [Documentation]    Scenario: เดารหัสผ่านซ้ำจากหลายไอพี — ล็อกต้องผูกกับบัญชี ไม่ใช่ไอพี
    ...    Pre: บัญชี robot_lock_api ยังไม่เคยผิด (seed รีเซ็ตทุกรอบ)
    ...    Steps: 1. POST รหัสผิด 5 ครั้ง แต่ละครั้งจากไอพีต่างกัน | 2. ครั้งที่ 6 รหัสถูก
    ...    Data: username robot_lock_api · รหัสผิด Wrong-1..5 · รหัสถูก Robot-LockApi-2026!
    ...    Expected: ครั้งที่ 1–5 ได้ 401 · ครั้งที่ 6 ได้ 423 พร้อมเวลารอ (retryAfter) และไม่ได้คุกกี้
    [Tags]    priority:High    security
    @{got}=    Create List
    FOR    ${i}    IN RANGE    1    6
        ${r}=    Staff Login Attempt    ${LOCK_API_USER}    Wrong-${i}!
        Append To List    ${got}    ${r.status_code}
    END
    Should Be Equal    ${got}    ${{[401, 401, 401, 401, 401]}}    msg=ครั้งที่ 1–5 ได้ ${got}
    ${r}=    Staff Login Attempt    ${LOCK_API_USER}    ${LOCK_API_PASSWORD}
    Status Should Be    ${r}    423
    ${body}=    Set Variable    ${r.json()}
    Dictionary Should Contain Key    ${body}    retryAfter
    ${c}=    Cookie Attributes    ${r}    systemboq_staff_session
    Should Be Empty    ${c}
    Record Actual    ครั้งที่ 1–5 → 401 · ครั้งที่ 6 (รหัสถูก) → 423 retryAfter=${body}[retryAfter] วินาที ไม่ได้คุกกี้

TC_API_LOGIN_S_017 เข้าสู่ระบบแต่ละครั้งได้เซสชันใหม่
    [Documentation]    Scenario: กันการตรึงเซสชัน (session fixation) — เข้าสู่ระบบซ้ำต้องได้โทเคนใหม่ทุกครั้ง
    ...    Pre: มีบัญชี robot_owner
    ...    Steps: 1. เข้าสู่ระบบ | 2. เข้าสู่ระบบอีกครั้ง | 3. เทียบค่าคุกกี้
    ...    Data: robot_owner สองครั้ง
    ...    Expected: ค่าคุกกี้สองครั้งต่างกัน และยาวพอเดาไม่ได้ (≥ 32 ตัวอักษร)
    [Tags]    priority:Medium    security
    ${r1}=    Staff Login Attempt    robot_owner    ${STAFF_PASSWORD}
    ${r2}=    Staff Login Attempt    robot_owner    ${STAFF_PASSWORD}
    ${c1}=    Cookie Attributes    ${r1}    systemboq_staff_session
    ${c2}=    Cookie Attributes    ${r2}    systemboq_staff_session
    Should Not Be Equal    ${c1}[value]    ${c2}[value]
    ${len}=    Get Length    ${c1}[value]
    Should Be True    ${len} >= 32    msg=โทเคนยาวแค่ ${len} ตัว
    Record Actual    ได้โทเคนใหม่ทุกครั้ง · ยาว ${len} ตัวอักษร

TC_API_LOGIN_S_018 ออกจากระบบแล้วโทเคนเดิมใช้ไม่ได้
    [Documentation]    Scenario: คนที่เก็บคุกกี้ไว้ (เช่น เครื่องสาธารณะ) นำมาใช้หลังเจ้าของออกจากระบบ
    ...    Pre: มีบัญชี robot_owner
    ...    Steps: 1. เข้าสู่ระบบ เก็บค่าคุกกี้ | 2. POST /api/auth/logout | 3. GET /api/auth/me ด้วยคุกกี้เดิม
    ...    Data: คุกกี้ systemboq_staff_session ก่อนออกจากระบบ
    ...    Expected: หลังออกจากระบบ คุกกี้เดิมได้ 401 (เซสชันถูกยกเลิกที่เซิร์ฟเวอร์ ไม่ใช่แค่ลบคุกกี้ในเบราว์เซอร์)
    [Tags]    priority:High    security
    ${r}=    Staff Login Attempt    robot_owner    ${STAFF_PASSWORD}
    ${c}=    Cookie Attributes    ${r}    systemboq_staff_session
    &{jar}=    Create Dictionary    systemboq_staff_session=${c}[value]
    Create Session    replay    ${API_URL}    cookies=${jar}    disable_warnings=1
    ${before}=    GET On Session    replay    /api/auth/me    expected_status=any
    Status Should Be    ${before}    200    ก่อนออกจากระบบ
    POST On Session    replay    /api/auth/logout    expected_status=any
    Create Session    replay2    ${API_URL}    cookies=${jar}    disable_warnings=1
    ${after}=    GET On Session    replay2    /api/auth/me    expected_status=any
    Status Should Be    ${after}    401    หลังออกจากระบบ
    Record Actual    ก่อนออก /api/auth/me → 200 · หลังออกใช้คุกกี้เดิม → 401


*** Keywords ***
Reset Owner Failed Count
    [Documentation]    เข้าสู่ระบบสำเร็จหนึ่งครั้ง = ล้างตัวนับรหัสผิดของบัญชี (ไม่งั้นเคสถัดไปเจอบัญชีถูกล็อก)
    ${r}=    Staff Login Attempt    robot_owner    ${STAFF_PASSWORD}
    Should Be Equal As Integers    ${r.status_code}    200    msg=ล้างตัวนับไม่สำเร็จ: ${r.status_code}

Staff Login Attempt
    [Documentation]    เข้าสู่ระบบจากไอพีจำลองใหม่ทุกครั้ง (ไม่ใช้คุกกี้ของเซสชันเดิม)
    [Arguments]    ${username}    ${password}
    &{body}=    Create Dictionary    username=${username}    password=${password}
    ${resp}=    Login Raw    ${LOGIN}    json=${body}
    RETURN    ${resp}

Login Raw
    [Arguments]    ${url}    &{kwargs}
    ${headers}=    Ip Header
    Create Session    one    ${API_URL}    disable_warnings=1
    ${resp}=    POST On Session    one    ${url}    headers=${headers}    expected_status=any    &{kwargs}
    RETURN    ${resp}
