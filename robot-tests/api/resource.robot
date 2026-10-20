*** Settings ***
Documentation     keyword ของชุดทดสอบ API — ยิงตรงไปที่ API ของระบบทดสอบ (พอร์ต 4100) ไม่ผ่านเบราว์เซอร์
...
...               เซสชันแยกต่อบทบาท (คุกกี้ไม่ปนกัน): anon · owner · admin · customer · other (ลูกค้าอีกคน)
...               บัญชีทดสอบมาจาก robot-tests/seed/seed-robot.ts
Library           RequestsLibrary
Library           Collections
Library           String
Library           ApiHelpers.py
Resource          ../common.robot


*** Variables ***
${API_URL}                http://localhost:4100
${ADMIN_USER}             robot_admin
${ADMIN_PASSWORD}         Robot-Admin-2026!
${LOCK_API_USER}          robot_lock_api
${LOCK_API_PASSWORD}      Robot-LockApi-2026!
${OTHER_EMAIL}            robot.other@example.test
${OTHER_PASSWORD}         Robot-Other-2026!
${API_CUST_EMAIL}         robot.apicust@example.test
${API_CUST_PASSWORD}      Robot-ApiCust-2026!
${LOCK_CUST_EMAIL}        robot.lock@example.test
${LOCK_CUST_PASSWORD}     Robot-LockCust-2026!
# ข้อความของตัวกั้นสิทธิ์ (requireAuth/requireRole) — ใช้แยก "ถูกกั้นเพราะไม่ได้เข้าสู่ระบบ" ออกจาก 401 อื่น เช่น รหัสผิด
${MSG_NEED_LOGIN}         ต้องเข้าสู่ระบบก่อนใช้งาน
&{EMPTY_JSON}


*** Keywords ***
Open API Sessions
    [Documentation]    เปิดเซสชันครบทุกบทบาท (เข้าสู่ระบบ 4 ครั้ง)
    ${ip}=    Ip Header
    Create Session    anon    ${API_URL}    headers=${ip}    disable_warnings=1
    Staff Session    owner    ${STAFF_USER}    ${STAFF_PASSWORD}
    Staff Session    admin    ${ADMIN_USER}    ${ADMIN_PASSWORD}
    # customer = เจ้าของสัญญาชุด API (robot.apicust) · other = ลูกค้าอีกคนที่ไม่มีงาน ใช้ตรวจการเข้าถึงข้ามลูกค้า
    Customer Session    customer    ${API_CUST_EMAIL}    ${API_CUST_PASSWORD}
    Customer Session    other    ${OTHER_EMAIL}    ${OTHER_PASSWORD}

Staff Session
    [Documentation]    เซสชันพนักงานจากไอพีจำลองของตัวเอง (เพดานเข้าสู่ระบบนับต่อไอพี — ดู ApiHelpers.fresh_ip)
    [Arguments]    ${alias}    ${username}    ${password}
    ${ip}=    Ip Header
    Create Session    ${alias}    ${API_URL}    headers=${ip}    disable_warnings=1
    &{body}=    Create Dictionary    username=${username}    password=${password}
    POST On Session    ${alias}    /api/auth/staff/login    json=${body}    expected_status=200

Customer Session
    [Arguments]    ${alias}    ${email}    ${password}
    ${ip}=    Ip Header
    Create Session    ${alias}    ${API_URL}    headers=${ip}    disable_warnings=1
    &{body}=    Create Dictionary    email=${email}    password=${password}
    POST On Session    ${alias}    /api/auth/customer/login    json=${body}    expected_status=200

Call API
    [Documentation]    ยิงด้วย method ใดก็ได้ ไม่ล้มเองเมื่อสถานะไม่ใช่ 2xx (ให้เคสตรวจเอง)
    [Arguments]    ${alias}    ${method}    ${url}    ${body}=${EMPTY_JSON}    &{kwargs}
    IF    "${method}" == "GET"
        ${resp}=    GET On Session    ${alias}    ${url}    expected_status=any    &{kwargs}
    ELSE
        ${resp}=    Run Keyword    ${method} On Session    ${alias}    ${url}    json=${body}    expected_status=any    &{kwargs}
    END
    RETURN    ${resp}

Error Of
    [Documentation]    ข้อความ error ในคำตอบ (ว่างถ้าคำตอบไม่ใช่ JSON หรือไม่มีช่อง error)
    [Arguments]    ${resp}
    ${ok}    ${json}=    Run Keyword And Ignore Error    Set Variable    ${resp.json()}
    IF    "${ok}" != "PASS"    RETURN    ${EMPTY}
    ${is_dict}=    Evaluate    isinstance($json, dict)
    IF    not ${is_dict}    RETURN    ${EMPTY}
    ${err}=    Get From Dictionary    ${json}    error    default=${EMPTY}
    RETURN    ${err}

Fill Path Params
    [Documentation]    แทน :พารามิเตอร์ ด้วยไอดีที่ไม่มีอยู่จริง
    [Arguments]    ${path}
    ${url}=    Replace String Using Regexp    ${path}    :([A-Za-z]+)    robot-nonexistent-\\1
    RETURN    ${url}

Access Should Be Enforced
    [Documentation]    เส้นสาธารณะ: ไม่มีคุกกี้ต้องเรียกได้ (ไม่ถูกกั้นด้วยข้อความต้องเข้าสู่ระบบ ไม่ 403 ไม่ 5xx)
    ...                เส้นที่ต้องมีสิทธิ์: ทุกบทบาทใน deny ต้องถูกปฏิเสธ — ไม่มีคุกกี้ = 401 · บทบาทผิด = 403 · ห้าม 5xx
    ...                ตรวจครบทุกบทบาทก่อนแล้วค่อยสรุป เพื่อให้เห็นทุกจุดที่ผิดในเคสเดียว
    [Arguments]    ${method}    ${path}    ${kind}    ${deny}
    ${url}=    Fill Path Params    ${path}
    @{seen}=    Create List
    @{wrong}=    Create List
    IF    "${kind}" == "PUBLIC"
        ${resp}=    Call API    anon    ${method}    ${url}
        ${err}=    Error Of    ${resp}
        Append To List    ${seen}    ไม่มีคุกกี้ → ${resp.status_code}
        IF    ${resp.status_code} >= 500    Append To List    ${wrong}    ไม่มีคุกกี้ได้ ${resp.status_code} (ระบบล่ม)
        IF    ${resp.status_code} == 403    Append To List    ${wrong}    ไม่มีคุกกี้ได้ 403 ทั้งที่เป็นเส้นสาธารณะ
        IF    "${err}" == "${MSG_NEED_LOGIN}"    Append To List    ${wrong}    เส้นสาธารณะแต่ถูกบังคับให้เข้าสู่ระบบ
    ELSE
        @{roles}=    Split String    ${deny}    ,
        FOR    ${role}    IN    @{roles}
            ${expect}=    Set Variable If    "${role}" == "ANON"    ${401}    ${403}
            ${alias}=    Convert To Lower Case    ${role}
            ${resp}=    Call API    ${alias}    ${method}    ${url}
            Append To List    ${seen}    ${role} → ${resp.status_code}
            IF    ${resp.status_code} != ${expect}
                Append To List    ${wrong}    ${role} ได้ ${resp.status_code} (ควรได้ ${expect})
            END
        END
    END
    ${summary}=    Catenate    SEPARATOR=${SPACE}·${SPACE}    @{seen}
    IF    $wrong
        ${detail}=    Catenate    SEPARATOR=${SPACE}·${SPACE}    @{wrong}
        Fail    ${detail} — ผลทั้งหมด: ${summary}
    END
    Record Actual    ${summary}

Status Should Be
    [Arguments]    ${resp}    ${expected}    ${what}=${EMPTY}
    Should Be Equal As Integers    ${resp.status_code}    ${expected}
    ...    msg=${what} ได้ ${resp.status_code} (ควรได้ ${expected}) · ${resp.text[:200]}
