*** Settings ***
Documentation     API — เพดานจำนวนครั้งเข้าสู่ระบบ (กันเดารหัสผ่านแบบยิงรัว / brute force) 20 ครั้ง/15 นาที/ไอพี
...
...               ยิงจากไอพีจำลองเดียวด้วยชื่อผู้ใช้ที่ไม่มีอยู่จริง (ไม่ให้บัญชีจริงถูกล็อกปน) แล้วดูว่าครั้งที่ 21 ถูกบล็อก
...               ระบบทดสอบตั้ง TRUST_PROXY=loopback จึงแยกไอพีจาก X-Forwarded-For ได้ — ดูความเสี่ยงเรื่องนี้ในชีต Risk Analysis
Resource          resource.robot
Library           ApiHelpers.py
Suite Teardown    Delete All Sessions
Force Tags        api    module:API Rate Limit


*** Test Cases ***
TC_API_RATE_001 ยิงเข้าสู่ระบบเกิน 20 ครั้งใน 15 นาทีถูกบล็อก
    [Documentation]    Scenario: บอทยิงเดารหัสผ่านรัว ๆ จากเครื่องเดียว
    ...    Pre: ไอพีจำลองใหม่ที่ยังไม่เคยยิง
    ...    Steps: 1. POST /api/auth/staff/login 21 ครั้งติดกันจากไอพีเดียว (ชื่อผู้ใช้ไม่มีอยู่จริง)
    ...    Data: {"username": "rate_limit_probe", "password": "Wrong-Pass-999!"} × 21
    ...    Expected: ครั้งที่ 1–20 ได้ 401 · ครั้งที่ 21 ได้ 429 พร้อม header Retry-After
    [Tags]    priority:High    security
    ${ip}=    Ip Header
    Create Session    burst    ${API_URL}    headers=${ip}    disable_warnings=1
    &{body}=    Create Dictionary    username=rate_limit_probe    password=Wrong-Pass-999!
    @{codes}=    Create List
    FOR    ${i}    IN RANGE    21
        ${r}=    POST On Session    burst    /api/auth/staff/login    json=${body}    expected_status=any
        Append To List    ${codes}    ${r.status_code}
    END
    ${first20}=    Evaluate    $codes[:20]
    Should Be Equal    ${first20}    ${{[401] * 20}}    msg=ครั้งที่ 1–20 ได้ ${first20}
    Should Be Equal As Integers    ${codes}[20]    429    msg=ครั้งที่ 21 ได้ ${codes}[20]
    ${retry}=    Evaluate    $r.headers.get("Retry-After")
    Should Not Be Equal    ${retry}    ${None}    msg=ไม่มี header Retry-After
    Record Actual    ครั้งที่ 1–20 → 401 · ครั้งที่ 21 → 429 Retry-After=${retry} วินาที

TC_API_RATE_002 เพดานนับแยกต่อไอพี และรวมทุกปลายทางเข้าสู่ระบบ
    [Documentation]    Scenario: ไอพีหนึ่งถูกบล็อกต้องไม่ทำให้ผู้ใช้คนอื่นเข้าไม่ได้ — และสลับไปยิงปลายทางลูกค้าก็ต้องยังถูกบล็อก
    ...    Pre: ไอพีจาก TC_API_RATE_001 ถูกบล็อกแล้ว
    ...    Steps: 1. ไอพีที่ถูกบล็อกยิง /api/auth/customer/login | 2. ไอพีใหม่เข้าสู่ระบบด้วยบัญชีถูกต้อง
    ...    Data: ไอพีเดิม · ไอพีใหม่ + robot_owner
    ...    Expected: ไอพีเดิม → 429 แม้เปลี่ยนเป็นปลายทางลูกค้า · ไอพีใหม่ → 200
    [Tags]    priority:Medium    security
    &{cust}=    Create Dictionary    email=rate.probe@example.test    password=Wrong-Pass-999!
    ${same}=    POST On Session    burst    /api/auth/customer/login    json=${cust}    expected_status=any
    Should Be Equal As Integers    ${same.status_code}    429    msg=ไอพีที่ถูกบล็อกเปลี่ยนไปปลายทางลูกค้าได้ ${same.status_code}
    Staff Session    fresh    ${STAFF_USER}    ${STAFF_PASSWORD}
    Record Actual    ไอพีเดิมยิงปลายทางลูกค้า → 429 · ไอพีใหม่เข้าสู่ระบบได้ 200
