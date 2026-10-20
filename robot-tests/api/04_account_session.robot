*** Settings ***
Documentation     API — บัญชีของผู้ใช้เองและเซสชัน: 2FA · แก้โปรไฟล์ (กันแอบแก้บทบาท) · เปลี่ยนรหัสผ่าน · ลบบัญชี · รูปโปรไฟล์
...
...               ใช้บัญชีใช้แล้วทิ้ง (robot.twofa / robot.pwchange / robot.delete) — seed สร้างคืนทุกรอบ
Resource          resource.robot
Library           ApiHelpers.py
Suite Setup       Open API Sessions
Suite Teardown    Delete All Sessions
Force Tags        api    module:API Account & Session


*** Variables ***
${TWOFA_EMAIL}       robot.twofa@example.test
${TWOFA_PASSWORD}    Robot-TwoFa-2026!
${PW_EMAIL}          robot.pwchange@example.test
${PW_PASSWORD}       Robot-PwChange-2026!
${DEL_EMAIL}         robot.delete@example.test
${DEL_PASSWORD}      Robot-Delete-2026!


*** Test Cases ***
TC_API_ACC_001 ลูกค้าเปิด 2FA ให้บัญชีตัวเองผ่าน API ไม่ได้
    [Documentation]    Scenario: 2FA เป็นของบัญชีพนักงาน — พอร์ทัลลูกค้าไม่มีขั้นกรอกรหัส 2FA ถ้าลูกค้า (หรือคนที่ได้เซสชันลูกค้าไป) เปิดได้ เจ้าของบัญชีจะเข้าพอร์ทัลไม่ได้อีก
    ...    Pre: เข้าสู่ระบบด้วยลูกค้า robot.twofa@example.test
    ...    Steps: 1. POST /api/auth/2fa/setup | 2. (ถ้าผ่าน) POST /api/auth/2fa/activate ด้วยรหัส TOTP จาก secret | 3. (ถ้าผ่าน) เข้าสู่ระบบลูกค้าใหม่ แล้วเรียก /api/my/quotes
    ...    Data: บัญชี robot.twofa@example.test · รหัส TOTP คำนวณจาก secret ที่ได้
    ...    Expected: ขั้นที่ 1 ได้ 403 — ลูกค้าตั้ง 2FA ไม่ได้
    [Tags]    priority:High    security
    Customer Session    twofa    ${TWOFA_EMAIL}    ${TWOFA_PASSWORD}
    ${setup}=    Call API    twofa    POST    /api/auth/2fa/setup
    IF    ${setup.status_code} == 403
        ${again}=    Call API    twofa    GET    /api/my/quotes
        Should Be Equal As Integers    ${again.status_code}    200    msg=หลังโดนปฏิเสธ เซสชันลูกค้ายังต้องใช้พอร์ทัลได้ตามปกติ
        Record Actual    setup → 403 ลูกค้าตั้ง 2FA ไม่ได้ · เซสชันเดิมยังเปิด /api/my/quotes ได้ (200)
    ELSE
        Show 2FA Impact And Fail    ${setup}
    END

TC_API_ACC_002 ลูกค้าแอบแก้บทบาทหรืออีเมลผ่านการแก้โปรไฟล์ไม่ได้
    [Documentation]    Scenario: Mass assignment — ส่งช่องที่ไม่ควรแก้ได้แนบมากับการแก้ชื่อ
    ...    Pre: เข้าสู่ระบบด้วยลูกค้า robot.other@example.test
    ...    Steps: 1. PATCH /api/auth/me/profile พร้อม role/email/emailVerifiedAt | 2. GET /api/auth/me
    ...    Data: {"fullName": "ลูกค้าอื่น โรบอท", "role": "OWNER", "email": "hacked@example.test", "id": "x"}
    ...    Expected: บทบาทยังเป็น CUSTOMER และอีเมลไม่เปลี่ยน (ช่องที่ไม่รู้จักถูกตัดทิ้งหรือปฏิเสธ)
    [Tags]    priority:High    security
    &{body}=    Create Dictionary    fullName=ลูกค้าอื่น โรบอท    role=OWNER    email=hacked@example.test    id=x
    ${patch}=    Call API    other    PATCH    /api/auth/me/profile    ${body}
    Should Be True    ${patch.status_code} in (200, 400)    msg=ได้ ${patch.status_code}
    ${me}=    Call API    other    GET    /api/auth/me
    Should Be Equal    ${me.json()}[user][role]    CUSTOMER
    Should Be Equal    ${me.json()}[user][email]    ${OTHER_EMAIL}
    Record Actual    PATCH → ${patch.status_code} · บทบาทยังเป็น CUSTOMER · อีเมลยังเป็น ${OTHER_EMAIL}

TC_API_ACC_003 ADMIN แอบเลื่อนตัวเองเป็น OWNER ผ่านโปรไฟล์ไม่ได้
    [Documentation]    Scenario: Privilege escalation — พนักงาน ADMIN ส่ง role มากับการแก้โปรไฟล์ตัวเอง
    ...    Pre: เข้าสู่ระบบด้วย robot_admin
    ...    Steps: 1. PATCH /api/account/profile พร้อม role = OWNER | 2. GET /api/auth/me | 3. เรียก /api/users (เฉพาะ OWNER)
    ...    Data: {"fullName": "โรบอท แอดมิน", "role": "OWNER"}
    ...    Expected: บทบาทยังเป็น ADMIN และ /api/users ได้ 403
    [Tags]    priority:High    security
    &{body}=    Create Dictionary    fullName=โรบอท แอดมิน    role=OWNER
    ${patch}=    Call API    admin    PATCH    /api/account/profile    ${body}
    ${me}=    Call API    admin    GET    /api/auth/me
    Should Be Equal    ${me.json()}[user][role]    ADMIN
    ${users}=    Call API    admin    GET    /api/users
    Status Should Be    ${users}    403    /api/users
    Record Actual    PATCH → ${patch.status_code} · บทบาทยังเป็น ADMIN · /api/users → 403

TC_API_ACC_004 เปลี่ยนรหัสผ่านต้องรู้รหัสเดิมและผ่านกฎรหัสผ่าน
    [Documentation]    Scenario: คนที่ได้เซสชันไป (แต่ไม่รู้รหัส) พยายามเปลี่ยนรหัส และการตั้งรหัสอ่อน
    ...    Pre: เข้าสู่ระบบด้วยลูกค้า robot.pwchange@example.test
    ...    Steps: 1. POST /api/auth/change-password ด้วยรหัสเดิมผิด | 2. รหัสใหม่สั้น 4 ตัว | 3. รหัสใหม่เหมือนอีเมล
    ...    Data: currentPassword ผิด · newPassword "Ab1!" · newPassword = อีเมล
    ...    Expected: ทุกแบบถูกปฏิเสธ (4xx) และรหัสเดิมยังใช้เข้าสู่ระบบได้
    [Tags]    priority:High    security
    Customer Session    pw    ${PW_EMAIL}    ${PW_PASSWORD}
    &{b1}=    Create Dictionary    currentPassword=Wrong-Pass-999!    newPassword=Sunset-Hill-58#Zz
    &{b2}=    Create Dictionary    currentPassword=${PW_PASSWORD}    newPassword=Ab1!
    &{b3}=    Create Dictionary    currentPassword=${PW_PASSWORD}    newPassword=${PW_EMAIL}
    @{got}=    Create List
    FOR    ${body}    IN    ${b1}    ${b2}    ${b3}
        ${r}=    Call API    pw    POST    /api/auth/change-password    ${body}
        Append To List    ${got}    ${r.status_code}
        Should Be True    400 <= ${r.status_code} < 500    msg=ได้ ${r.status_code} ${r.text[:120]}
    END
    Customer Session    pw_check    ${PW_EMAIL}    ${PW_PASSWORD}
    Record Actual    รหัสเดิมผิด/สั้น/เหมือนอีเมล → ${got} · รหัสเดิมยังเข้าสู่ระบบได้

TC_API_ACC_005 เปลี่ยนรหัสผ่านแล้วเซสชันอื่นถูกตัด
    [Documentation]    Scenario: เจ้าของบัญชีสงสัยว่ามีคนแอบใช้ จึงเปลี่ยนรหัส — เครื่องอื่นต้องหลุดทันที
    ...    Pre: ลูกค้า robot.pwchange@example.test เข้าสู่ระบบไว้สองเครื่อง (A และ B)
    ...    Steps: 1. A เปลี่ยนรหัสผ่านสำเร็จ | 2. B เรียก /api/auth/me | 3. เข้าสู่ระบบด้วยรหัสใหม่
    ...    Data: รหัสใหม่ Sunset-Hill-58#Zz
    ...    Expected: เปลี่ยนสำเร็จ (2xx) · B ได้ 401 · รหัสใหม่เข้าสู่ระบบได้ · รหัสเดิมเข้าไม่ได้
    [Tags]    priority:High    security
    Customer Session    pw_a    ${PW_EMAIL}    ${PW_PASSWORD}
    Customer Session    pw_b    ${PW_EMAIL}    ${PW_PASSWORD}
    &{body}=    Create Dictionary    currentPassword=${PW_PASSWORD}    newPassword=Sunset-Hill-58#Zz
    ${r}=    Call API    pw_a    POST    /api/auth/change-password    ${body}
    Should Be True    200 <= ${r.status_code} < 300    msg=เปลี่ยนรหัสไม่สำเร็จ ${r.status_code} ${r.text[:120]}
    ${b}=    Call API    pw_b    GET    /api/auth/me
    Status Should Be    ${b}    401    เครื่อง B หลังเปลี่ยนรหัส
    Customer Session    pw_new    ${PW_EMAIL}    Sunset-Hill-58#Zz
    ${ip}=    Ip Header
    Create Session    pw_old    ${API_URL}    headers=${ip}    disable_warnings=1
    &{old}=    Create Dictionary    email=${PW_EMAIL}    password=${PW_PASSWORD}
    ${o}=    POST On Session    pw_old    /api/auth/customer/login    json=${old}    expected_status=any
    Status Should Be    ${o}    401    รหัสเดิม
    Record Actual    เปลี่ยนรหัส → ${r.status_code} · เครื่อง B → 401 · รหัสใหม่เข้าได้ · รหัสเดิม → 401

TC_API_ACC_006 ลบบัญชีต้องยืนยันด้วยรหัสผ่าน
    [Documentation]    Scenario: ลูกค้าขอลบบัญชีตัวเอง (PDPA) — คนที่ได้เซสชันไปลบบัญชีคนอื่นไม่ได้ถ้าไม่รู้รหัส
    ...    Pre: เข้าสู่ระบบด้วยลูกค้า robot.delete@example.test
    ...    Steps: 1. POST /api/auth/delete-account รหัสผิด | 2. POST ด้วยรหัสถูก | 3. เข้าสู่ระบบด้วยบัญชีเดิม
    ...    Data: currentPassword ผิด · Robot-Delete-2026!
    ...    Expected: รหัสผิด → 4xx บัญชียังอยู่ · รหัสถูก → 2xx · เข้าสู่ระบบด้วยบัญชีเดิมไม่ได้อีก (401)
    [Tags]    priority:High    security    pdpa
    Customer Session    del    ${DEL_EMAIL}    ${DEL_PASSWORD}
    &{wrong}=    Create Dictionary    currentPassword=Wrong-Pass-999!
    ${r1}=    Call API    del    POST    /api/auth/delete-account    ${wrong}
    Should Be True    400 <= ${r1.status_code} < 500    msg=รหัสผิดได้ ${r1.status_code}
    ${still}=    Call API    del    GET    /api/auth/me
    Status Should Be    ${still}    200    หลังลบด้วยรหัสผิด
    &{right}=    Create Dictionary    currentPassword=${DEL_PASSWORD}
    ${r2}=    Call API    del    POST    /api/auth/delete-account    ${right}
    Should Be True    200 <= ${r2.status_code} < 300    msg=รหัสถูกได้ ${r2.status_code} ${r2.text[:120]}
    ${ip}=    Ip Header
    Create Session    del_again    ${API_URL}    headers=${ip}    disable_warnings=1
    &{cred}=    Create Dictionary    email=${DEL_EMAIL}    password=${DEL_PASSWORD}
    ${r3}=    POST On Session    del_again    /api/auth/customer/login    json=${cred}    expected_status=any
    Status Should Be    ${r3}    401    เข้าสู่ระบบหลังลบบัญชี
    Record Actual    รหัสผิด → ${r1.status_code} บัญชียังอยู่ · รหัสถูก → ${r2.status_code} · เข้าสู่ระบบอีกครั้ง → 401

TC_API_ACC_007 อัปโหลดรูปโปรไฟล์ที่ไม่ใช่รูปจริงถูกปฏิเสธ
    [Documentation]    Scenario: แนบไฟล์อันตรายแทนรูปโปรไฟล์ (เปลี่ยนนามสกุล / SVG ที่ฝังสคริปต์)
    ...    Pre: เข้าสู่ระบบด้วยลูกค้า robot.other@example.test
    ...    Steps: 1. POST /api/auth/me/avatar ด้วยข้อความธรรมดาที่ตั้งชื่อ .png | 2. SVG ที่มี <script> | 3. ไฟล์ใหญ่ 6 MB
    ...    Data: avatar.png (เนื้อเป็นข้อความ) · avatar.svg · big.png 6 MB
    ...    Expected: ทุกแบบได้ 400/413 ไม่มี 500 และรูปโปรไฟล์ไม่ถูกเปลี่ยน
    [Tags]    priority:Medium    security
    ${fake}=    Text Bytes    นี่ไม่ใช่รูปภาพ
    ${svg}=    Text Bytes    <svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>
    ${big}=    Big Bytes    6
    ${f1}=    File Part    file    avatar.png    ${fake}    image/png
    ${f2}=    File Part    file    avatar.svg    ${svg}    image/svg+xml
    ${f3}=    File Part    file    big.png    ${big}    image/png
    @{got}=    Create List
    FOR    ${files}    IN    ${f1}    ${f2}    ${f3}
        ${r}=    Post Multipart    other    /api/auth/me/avatar    ${files}
        Append To List    ${got}    ${r.status_code}
        Should Be True    ${r.status_code} in (400, 413)    msg=ได้ ${r.status_code} ${r.text[:120]}
    END
    ${me}=    Call API    other    GET    /api/auth/me
    Should Be Equal    ${me.json()}[user][avatarUrl]    ${None}
    Record Actual    ข้อความแอบเป็น .png / SVG / 6 MB → ${got} · รูปโปรไฟล์ยังว่าง

*** Keywords ***
Show 2FA Impact And Fail
    [Documentation]    ระบบยอมให้ตั้ง — ไล่ต่อให้เห็นผลกระทบจริงก่อนสรุปว่าล้ม
    [Arguments]    ${setup}
    ${code}=    Totp    ${setup.json()}[secret]
    &{token}=    Create Dictionary    token=${code}
    ${act}=    Call API    twofa    POST    /api/auth/2fa/activate    ${token}
    ${ip}=    Ip Header
    Create Session    twofa_again    ${API_URL}    headers=${ip}    disable_warnings=1
    &{cred}=    Create Dictionary    email=${TWOFA_EMAIL}    password=${TWOFA_PASSWORD}
    ${relogin}=    POST On Session    twofa_again    /api/auth/customer/login    json=${cred}    expected_status=any
    ${portal}=    GET On Session    twofa_again    /api/my/quotes    expected_status=any
    Fail    ลูกค้าตั้ง 2FA ได้: setup → ${setup.status_code} · activate → ${act.status_code} (ได้รหัสสำรอง) · เข้าสู่ระบบใหม่ → ${relogin.status_code} ${relogin.text[:40]} · เปิด /api/my/quotes → ${portal.status_code} — พอร์ทัลลูกค้าไม่มีขั้นกรอก 2FA เจ้าของบัญชีจึงเข้าไม่ได้อีก
