*** Settings ***
Documentation     API — สิทธิ์การเข้าถึงของทุกเส้น (สร้างอัตโนมัติจาก tools/policy.py — ห้ามแก้มือ ให้แก้ที่ policy.py แล้วสร้างใหม่)
...
...               แต่ละเคส = หนึ่งเส้น: ยิงด้วยทุกบทบาทที่ "ต้องถูกปฏิเสธ" แล้วตรวจว่าได้ 401 (ยังไม่เข้าสู่ระบบ) หรือ 403 (บทบาทไม่ตรง)
...               เส้นสาธารณะ: ตรวจว่าคนที่ยังไม่เข้าสู่ระบบเรียกได้ และไม่ตอบ 5xx
...               พารามิเตอร์ใน path ใช้ไอดีที่ไม่มีอยู่จริง — ตัวกั้นสิทธิ์ต้องทำงานก่อนค้นข้อมูลเสมอ
Resource          resource.robot
Suite Setup       Open API Sessions
Suite Teardown    Delete All Sessions
Test Template     Access Should Be Enforced
Force Tags        api    module:API Access Control


*** Test Cases ***
TC_API_ACL_001 POST /api/auth/2fa/verify
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/2fa/verify — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง POST /api/auth/2fa/verify โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    POST    /api/auth/2fa/verify    PUBLIC    NONE

TC_API_ACL_002 GET /api/auth/access/:token
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/auth/access/:token — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง GET /api/auth/access/:token โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    GET    /api/auth/access/:token    PUBLIC    NONE

TC_API_ACL_003 POST /api/auth/access/:token
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/access/:token — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง POST /api/auth/access/:token โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    POST    /api/auth/access/:token    PUBLIC    NONE

TC_API_ACL_004 POST /api/auth/customer/forgot-password
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/customer/forgot-password — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง POST /api/auth/customer/forgot-password โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    POST    /api/auth/customer/forgot-password    PUBLIC    NONE

TC_API_ACL_005 POST /api/auth/customer/login
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/customer/login — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง POST /api/auth/customer/login โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    POST    /api/auth/customer/login    PUBLIC    NONE

TC_API_ACL_006 POST /api/auth/customer/register
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/customer/register — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง POST /api/auth/customer/register โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    POST    /api/auth/customer/register    PUBLIC    NONE

TC_API_ACL_007 POST /api/auth/customer/reset-password
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/customer/reset-password — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง POST /api/auth/customer/reset-password โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    POST    /api/auth/customer/reset-password    PUBLIC    NONE

TC_API_ACL_008 GET /api/auth/customer/reset-password/:token
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/auth/customer/reset-password/:token — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง GET /api/auth/customer/reset-password/:token โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    GET    /api/auth/customer/reset-password/:token    PUBLIC    NONE

TC_API_ACL_009 POST /api/auth/customer/reset-password/verify-code
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/customer/reset-password/verify-code — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง POST /api/auth/customer/reset-password/verify-code โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    POST    /api/auth/customer/reset-password/verify-code    PUBLIC    NONE

TC_API_ACL_010 POST /api/auth/customer/verify-email
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/customer/verify-email — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง POST /api/auth/customer/verify-email โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    POST    /api/auth/customer/verify-email    PUBLIC    NONE

TC_API_ACL_011 POST /api/auth/customer/verify-email/change-email
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/customer/verify-email/change-email — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง POST /api/auth/customer/verify-email/change-email โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    POST    /api/auth/customer/verify-email/change-email    PUBLIC    NONE

TC_API_ACL_012 POST /api/auth/customer/verify-email/resend
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/customer/verify-email/resend — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง POST /api/auth/customer/verify-email/resend โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    POST    /api/auth/customer/verify-email/resend    PUBLIC    NONE

TC_API_ACL_013 POST /api/auth/logout
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/logout — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง POST /api/auth/logout โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    POST    /api/auth/logout    PUBLIC    NONE

TC_API_ACL_014 POST /api/auth/staff/forgot-password
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/staff/forgot-password — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง POST /api/auth/staff/forgot-password โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    POST    /api/auth/staff/forgot-password    PUBLIC    NONE

TC_API_ACL_015 POST /api/auth/staff/login
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/staff/login — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง POST /api/auth/staff/login โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    POST    /api/auth/staff/login    PUBLIC    NONE

TC_API_ACL_016 POST /api/auth/staff/reset-password
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/staff/reset-password — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง POST /api/auth/staff/reset-password โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    POST    /api/auth/staff/reset-password    PUBLIC    NONE

TC_API_ACL_017 GET /api/auth/staff/reset-password/:token
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/auth/staff/reset-password/:token — กลุ่ม PUBLIC (ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง GET /api/auth/staff/reset-password/:token โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    GET    /api/auth/staff/reset-password/:token    PUBLIC    NONE

TC_API_ACL_018 GET /api/health
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/health — กลุ่ม PUBLIC (เนื้อหาสาธารณะ / ตรวจสุขภาพระบบ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง GET /api/health โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    GET    /api/health    PUBLIC    NONE

TC_API_ACL_019 GET /api/health/ready
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/health/ready — กลุ่ม PUBLIC (เนื้อหาสาธารณะ / ตรวจสุขภาพระบบ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง GET /api/health/ready โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    GET    /api/health/ready    PUBLIC    NONE

TC_API_ACL_020 GET /api/public/house-designs
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/public/house-designs — กลุ่ม PUBLIC (เนื้อหาสาธารณะ / ตรวจสุขภาพระบบ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง GET /api/public/house-designs โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    GET    /api/public/house-designs    PUBLIC    NONE

TC_API_ACL_021 GET /api/public/house-designs/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/public/house-designs/:id — กลุ่ม PUBLIC (เนื้อหาสาธารณะ / ตรวจสุขภาพระบบ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง GET /api/public/house-designs/:id โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    GET    /api/public/house-designs/:id    PUBLIC    NONE

TC_API_ACL_022 GET /api/public/house-designs/featured
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/public/house-designs/featured — กลุ่ม PUBLIC (เนื้อหาสาธารณะ / ตรวจสุขภาพระบบ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง GET /api/public/house-designs/featured โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    GET    /api/public/house-designs/featured    PUBLIC    NONE

TC_API_ACL_023 POST /api/public/leads
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/public/leads — กลุ่ม PUBLIC (เนื้อหาสาธารณะ / ตรวจสุขภาพระบบ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง POST /api/public/leads โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    POST    /api/public/leads    PUBLIC    NONE

TC_API_ACL_024 GET /api/public/portfolio
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/public/portfolio — กลุ่ม PUBLIC (เนื้อหาสาธารณะ / ตรวจสุขภาพระบบ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง GET /api/public/portfolio โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    GET    /api/public/portfolio    PUBLIC    NONE

TC_API_ACL_025 GET /api/public/portfolio/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/public/portfolio/:id — กลุ่ม PUBLIC (เนื้อหาสาธารณะ / ตรวจสุขภาพระบบ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง GET /api/public/portfolio/:id โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    GET    /api/public/portfolio/:id    PUBLIC    NONE

TC_API_ACL_026 GET /api/public/portfolio/featured
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/public/portfolio/featured — กลุ่ม PUBLIC (เนื้อหาสาธารณะ / ตรวจสุขภาพระบบ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง GET /api/public/portfolio/featured โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    GET    /api/public/portfolio/featured    PUBLIC    NONE

TC_API_ACL_027 GET /api/public/settings
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/public/settings — กลุ่ม PUBLIC (เนื้อหาสาธารณะ / ตรวจสุขภาพระบบ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง GET /api/public/settings โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    GET    /api/public/settings    PUBLIC    NONE

TC_API_ACL_028 GET /api/public/sitemap.xml
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/public/sitemap.xml — กลุ่ม PUBLIC (เนื้อหาสาธารณะ / ตรวจสุขภาพระบบ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิง GET /api/public/sitemap.xml โดยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, ANON, CUSTOMER, OWNER
    ...    Expected: เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx
    [Tags]    priority:Medium    group:PUBLIC
    GET    /api/public/sitemap.xml    PUBLIC    NONE

TC_API_ACL_029 POST /api/auth/change-password
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/change-password — กลุ่ม ANY (ข้อมูลของผู้ใช้ที่เข้าสู่ระบบอยู่ ใช้ได้ทั้งสองฝั่ง)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, CUSTOMER, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:ANY
    POST    /api/auth/change-password    PROTECTED    ANON

TC_API_ACL_030 GET /api/auth/me
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/auth/me — กลุ่ม ANY (ข้อมูลของผู้ใช้ที่เข้าสู่ระบบอยู่ ใช้ได้ทั้งสองฝั่ง)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, CUSTOMER, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:ANY
    GET    /api/auth/me    PROTECTED    ANON

TC_API_ACL_031 GET /api/notifications
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/notifications — กลุ่ม ANY (ข้อมูลของผู้ใช้ที่เข้าสู่ระบบอยู่ ใช้ได้ทั้งสองฝั่ง)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, CUSTOMER, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:ANY
    GET    /api/notifications    PROTECTED    ANON

TC_API_ACL_032 POST /api/notifications/:id/read
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/notifications/:id/read — กลุ่ม ANY (ข้อมูลของผู้ใช้ที่เข้าสู่ระบบอยู่ ใช้ได้ทั้งสองฝั่ง)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, CUSTOMER, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:ANY
    POST    /api/notifications/:id/read    PROTECTED    ANON

TC_API_ACL_033 POST /api/notifications/mark-all-read
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/notifications/mark-all-read — กลุ่ม ANY (ข้อมูลของผู้ใช้ที่เข้าสู่ระบบอยู่ ใช้ได้ทั้งสองฝั่ง)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, CUSTOMER, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:ANY
    POST    /api/notifications/mark-all-read    PROTECTED    ANON

TC_API_ACL_034 GET /api/notifications/unread-count
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/notifications/unread-count — กลุ่ม ANY (ข้อมูลของผู้ใช้ที่เข้าสู่ระบบอยู่ ใช้ได้ทั้งสองฝั่ง)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, CUSTOMER, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:ANY
    GET    /api/notifications/unread-count    PROTECTED    ANON

TC_API_ACL_035 POST /api/auth/delete-account
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/delete-account — กลุ่ม CUSTOMER (หน้าบัญชีของลูกค้าเอง (ชื่อ/รูป/ลบบัญชี) — ฝั่งพนักงานใช้ /api/account)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    POST    /api/auth/delete-account    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_036 DELETE /api/auth/me/avatar
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/auth/me/avatar — กลุ่ม CUSTOMER (หน้าบัญชีของลูกค้าเอง (ชื่อ/รูป/ลบบัญชี) — ฝั่งพนักงานใช้ /api/account)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    DELETE    /api/auth/me/avatar    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_037 POST /api/auth/me/avatar
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/me/avatar — กลุ่ม CUSTOMER (หน้าบัญชีของลูกค้าเอง (ชื่อ/รูป/ลบบัญชี) — ฝั่งพนักงานใช้ /api/account)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    POST    /api/auth/me/avatar    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_038 GET /api/auth/me/profile
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/auth/me/profile — กลุ่ม CUSTOMER (หน้าบัญชีของลูกค้าเอง (ชื่อ/รูป/ลบบัญชี) — ฝั่งพนักงานใช้ /api/account)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    GET    /api/auth/me/profile    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_039 PATCH /api/auth/me/profile
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/auth/me/profile — กลุ่ม CUSTOMER (หน้าบัญชีของลูกค้าเอง (ชื่อ/รูป/ลบบัญชี) — ฝั่งพนักงานใช้ /api/account)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    PATCH    /api/auth/me/profile    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_040 GET /api/my/contracts
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/my/contracts — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    GET    /api/my/contracts    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_041 GET /api/my/contracts/:id/change-orders/:changeOrderId/pdf
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/my/contracts/:id/change-orders/:changeOrderId/pdf — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    GET    /api/my/contracts/:id/change-orders/:changeOrderId/pdf    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_042 POST /api/my/contracts/:id/change-orders/:changeOrderId/respond
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/my/contracts/:id/change-orders/:changeOrderId/respond — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    POST    /api/my/contracts/:id/change-orders/:changeOrderId/respond    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_043 GET /api/my/contracts/:id/documents/:docId/pdf
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/my/contracts/:id/documents/:docId/pdf — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    GET    /api/my/contracts/:id/documents/:docId/pdf    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_044 POST /api/my/contracts/:id/payment-notices
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/my/contracts/:id/payment-notices — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    POST    /api/my/contracts/:id/payment-notices    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_045 POST /api/my/contracts/:id/payment-notices/:noticeId/cancel
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/my/contracts/:id/payment-notices/:noticeId/cancel — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    POST    /api/my/contracts/:id/payment-notices/:noticeId/cancel    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_046 GET /api/my/contracts/:id/payment-notices/:noticeId/evidence/:evidenceId
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/my/contracts/:id/payment-notices/:noticeId/evidence/:evidenceId — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    GET    /api/my/contracts/:id/payment-notices/:noticeId/evidence/:evidenceId    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_047 GET /api/my/contracts/:id/pdf
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/my/contracts/:id/pdf — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    GET    /api/my/contracts/:id/pdf    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_048 GET /api/my/leads
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/my/leads — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    GET    /api/my/leads    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_049 GET /api/my/leads/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/my/leads/:id — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    GET    /api/my/leads/:id    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_050 GET /api/my/payments
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/my/payments — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    GET    /api/my/payments    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_051 GET /api/my/payments/:installmentId
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/my/payments/:installmentId — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    GET    /api/my/payments/:installmentId    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_052 GET /api/my/quotes
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/my/quotes — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    GET    /api/my/quotes    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_053 GET /api/my/quotes/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/my/quotes/:id — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    GET    /api/my/quotes/:id    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_054 GET /api/my/quotes/:id/attachments/:attachmentId/download
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/my/quotes/:id/attachments/:attachmentId/download — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    GET    /api/my/quotes/:id/attachments/:attachmentId/download    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_055 GET /api/my/quotes/:id/attachments/:attachmentId/preview
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/my/quotes/:id/attachments/:attachmentId/preview — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    GET    /api/my/quotes/:id/attachments/:attachmentId/preview    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_056 GET /api/my/quotes/:id/pdf
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/my/quotes/:id/pdf — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    GET    /api/my/quotes/:id/pdf    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_057 POST /api/my/quotes/:id/respond
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/my/quotes/:id/respond — กลุ่ม CUSTOMER (พื้นที่ส่วนตัวของลูกค้า)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน OWNER | 3. ยิงด้วยเซสชัน ADMIN
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = CUSTOMER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · OWNER → 403 · ADMIN → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:CUSTOMER
    POST    /api/my/quotes/:id/respond    PROTECTED    ANON,OWNER,ADMIN

TC_API_ACL_058 GET /api/backups
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/backups — กลุ่ม OWNER (จัดการผู้ใช้/สำรองข้อมูล/ตั้งค่าเมล/ตรวจไอพี เป็นงานของเจ้าของกิจการ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:OWNER
    GET    /api/backups    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_059 POST /api/backups
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/backups — กลุ่ม OWNER (จัดการผู้ใช้/สำรองข้อมูล/ตั้งค่าเมล/ตรวจไอพี เป็นงานของเจ้าของกิจการ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:OWNER
    POST    /api/backups    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_060 GET /api/mail
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/mail — กลุ่ม OWNER (จัดการผู้ใช้/สำรองข้อมูล/ตั้งค่าเมล/ตรวจไอพี เป็นงานของเจ้าของกิจการ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:OWNER
    GET    /api/mail    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_061 POST /api/mail/test
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/mail/test — กลุ่ม OWNER (จัดการผู้ใช้/สำรองข้อมูล/ตั้งค่าเมล/ตรวจไอพี เป็นงานของเจ้าของกิจการ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:OWNER
    POST    /api/mail/test    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_062 POST /api/mail/verify
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/mail/verify — กลุ่ม OWNER (จัดการผู้ใช้/สำรองข้อมูล/ตั้งค่าเมล/ตรวจไอพี เป็นงานของเจ้าของกิจการ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:OWNER
    POST    /api/mail/verify    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_063 GET /api/system/ip-check
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/system/ip-check — กลุ่ม OWNER (จัดการผู้ใช้/สำรองข้อมูล/ตั้งค่าเมล/ตรวจไอพี เป็นงานของเจ้าของกิจการ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:OWNER
    GET    /api/system/ip-check    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_064 DELETE /api/trash/:type/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/trash/:type/:id — กลุ่ม OWNER (ลบถาวรจากถังขยะ เฉพาะเจ้าของกิจการ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:OWNER
    DELETE    /api/trash/:type/:id    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_065 GET /api/users
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/users — กลุ่ม OWNER (จัดการผู้ใช้/สำรองข้อมูล/ตั้งค่าเมล/ตรวจไอพี เป็นงานของเจ้าของกิจการ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:OWNER
    GET    /api/users    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_066 POST /api/users
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/users — กลุ่ม OWNER (จัดการผู้ใช้/สำรองข้อมูล/ตั้งค่าเมล/ตรวจไอพี เป็นงานของเจ้าของกิจการ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:OWNER
    POST    /api/users    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_067 POST /api/users/:id/active
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/users/:id/active — กลุ่ม OWNER (จัดการผู้ใช้/สำรองข้อมูล/ตั้งค่าเมล/ตรวจไอพี เป็นงานของเจ้าของกิจการ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:OWNER
    POST    /api/users/:id/active    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_068 POST /api/users/:id/reset-password
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/users/:id/reset-password — กลุ่ม OWNER (จัดการผู้ใช้/สำรองข้อมูล/ตั้งค่าเมล/ตรวจไอพี เป็นงานของเจ้าของกิจการ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:OWNER
    POST    /api/users/:id/reset-password    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_069 GET /api/users/:id/sessions
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/users/:id/sessions — กลุ่ม OWNER (จัดการผู้ใช้/สำรองข้อมูล/ตั้งค่าเมล/ตรวจไอพี เป็นงานของเจ้าของกิจการ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:OWNER
    GET    /api/users/:id/sessions    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_070 DELETE /api/users/:id/sessions/:handle
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/users/:id/sessions/:handle — กลุ่ม OWNER (จัดการผู้ใช้/สำรองข้อมูล/ตั้งค่าเมล/ตรวจไอพี เป็นงานของเจ้าของกิจการ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:OWNER
    DELETE    /api/users/:id/sessions/:handle    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_071 POST /api/users/:id/sessions/revoke-all
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/users/:id/sessions/revoke-all — กลุ่ม OWNER (จัดการผู้ใช้/สำรองข้อมูล/ตั้งค่าเมล/ตรวจไอพี เป็นงานของเจ้าของกิจการ)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:High    group:OWNER
    POST    /api/users/:id/sessions/revoke-all    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_072 DELETE /api/account/avatar
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/account/avatar — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/account/avatar    PROTECTED    ANON,CUSTOMER

TC_API_ACL_073 POST /api/account/avatar
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/account/avatar — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/account/avatar    PROTECTED    ANON,CUSTOMER

TC_API_ACL_074 POST /api/account/email
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/account/email — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/account/email    PROTECTED    ANON,CUSTOMER

TC_API_ACL_075 POST /api/account/email/send-code
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/account/email/send-code — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/account/email/send-code    PROTECTED    ANON,CUSTOMER

TC_API_ACL_076 POST /api/account/email/verify
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/account/email/verify — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/account/email/verify    PROTECTED    ANON,CUSTOMER

TC_API_ACL_077 GET /api/account/login-history
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/account/login-history — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/account/login-history    PROTECTED    ANON,CUSTOMER

TC_API_ACL_078 PATCH /api/account/profile
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/account/profile — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/account/profile    PROTECTED    ANON,CUSTOMER

TC_API_ACL_079 GET /api/account/security
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/account/security — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/account/security    PROTECTED    ANON,CUSTOMER

TC_API_ACL_080 GET /api/account/sessions
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/account/sessions — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/account/sessions    PROTECTED    ANON,CUSTOMER

TC_API_ACL_081 DELETE /api/account/sessions/:handle
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/account/sessions/:handle — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/account/sessions/:handle    PROTECTED    ANON,CUSTOMER

TC_API_ACL_082 POST /api/account/sessions/revoke-others
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/account/sessions/revoke-others — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/account/sessions/revoke-others    PROTECTED    ANON,CUSTOMER

TC_API_ACL_083 DELETE /api/account/signature
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/account/signature — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/account/signature    PROTECTED    ANON,CUSTOMER

TC_API_ACL_084 GET /api/account/signature
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/account/signature — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/account/signature    PROTECTED    ANON,CUSTOMER

TC_API_ACL_085 POST /api/account/signature
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/account/signature — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/account/signature    PROTECTED    ANON,CUSTOMER

TC_API_ACL_086 POST /api/auth/2fa/activate
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/2fa/activate — กลุ่ม STAFF (2FA เป็นของบัญชีพนักงานเท่านั้น)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/auth/2fa/activate    PROTECTED    ANON,CUSTOMER

TC_API_ACL_087 POST /api/auth/2fa/add-device
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/2fa/add-device — กลุ่ม STAFF (2FA เป็นของบัญชีพนักงานเท่านั้น)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/auth/2fa/add-device    PROTECTED    ANON,CUSTOMER

TC_API_ACL_088 POST /api/auth/2fa/backup-codes
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/2fa/backup-codes — กลุ่ม STAFF (2FA เป็นของบัญชีพนักงานเท่านั้น)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/auth/2fa/backup-codes    PROTECTED    ANON,CUSTOMER

TC_API_ACL_089 POST /api/auth/2fa/disable
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/2fa/disable — กลุ่ม STAFF (2FA เป็นของบัญชีพนักงานเท่านั้น)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/auth/2fa/disable    PROTECTED    ANON,CUSTOMER

TC_API_ACL_090 POST /api/auth/2fa/setup
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/auth/2fa/setup — กลุ่ม STAFF (2FA เป็นของบัญชีพนักงานเท่านั้น)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/auth/2fa/setup    PROTECTED    ANON,CUSTOMER

TC_API_ACL_091 GET /api/auth/2fa/status
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/auth/2fa/status — กลุ่ม STAFF (2FA เป็นของบัญชีพนักงานเท่านั้น)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/auth/2fa/status    PROTECTED    ANON,CUSTOMER

TC_API_ACL_092 GET /api/categories
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/categories — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/categories    PROTECTED    ANON,CUSTOMER

TC_API_ACL_093 POST /api/categories
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/categories — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/categories    PROTECTED    ANON,CUSTOMER

TC_API_ACL_094 DELETE /api/categories/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/categories/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/categories/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_095 PATCH /api/categories/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/categories/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/categories/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_096 GET /api/contract-templates
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/contract-templates — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/contract-templates    PROTECTED    ANON,CUSTOMER

TC_API_ACL_097 POST /api/contract-templates
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/contract-templates — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/contract-templates    PROTECTED    ANON,CUSTOMER

TC_API_ACL_098 DELETE /api/contract-templates/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/contract-templates/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/contract-templates/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_099 GET /api/contract-templates/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/contract-templates/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/contract-templates/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_100 PATCH /api/contract-templates/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/contract-templates/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/contract-templates/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_101 POST /api/contract-templates/:id/default
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/contract-templates/:id/default — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/contract-templates/:id/default    PROTECTED    ANON,CUSTOMER

TC_API_ACL_102 GET /api/customers
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/customers — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/customers    PROTECTED    ANON,CUSTOMER

TC_API_ACL_103 GET /api/customers/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/customers/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/customers/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_104 PATCH /api/customers/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/customers/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/customers/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_105 POST /api/customers/:id/access-link
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/customers/:id/access-link — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/customers/:id/access-link    PROTECTED    ANON,CUSTOMER

TC_API_ACL_106 POST /api/customers/:id/active
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/customers/:id/active — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/customers/:id/active    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_107 GET /api/customers/:id/activity
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/customers/:id/activity — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/customers/:id/activity    PROTECTED    ANON,CUSTOMER

TC_API_ACL_108 GET /api/customers/:id/export
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/customers/:id/export — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/customers/:id/export    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_109 POST /api/customers/:id/notes
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/customers/:id/notes — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/customers/:id/notes    PROTECTED    ANON,CUSTOMER

TC_API_ACL_110 DELETE /api/customers/:id/notes/:noteId
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/customers/:id/notes/:noteId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/customers/:id/notes/:noteId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_111 PATCH /api/customers/:id/notes/:noteId
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/customers/:id/notes/:noteId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/customers/:id/notes/:noteId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_112 GET /api/customers/activity
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/customers/activity — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/customers/activity    PROTECTED    ANON,CUSTOMER

TC_API_ACL_113 GET /api/customers/activity.csv
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/customers/activity.csv — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/customers/activity.csv    PROTECTED    ANON,CUSTOMER

TC_API_ACL_114 GET /api/customers/directory
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/customers/directory — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/customers/directory    PROTECTED    ANON,CUSTOMER

TC_API_ACL_115 GET /api/customers/directory.csv
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/customers/directory.csv — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/customers/directory.csv    PROTECTED    ANON,CUSTOMER

TC_API_ACL_116 GET /api/dashboard/contract-cash
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/dashboard/contract-cash — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/dashboard/contract-cash    PROTECTED    ANON,CUSTOMER

TC_API_ACL_117 GET /api/dashboard/pending-work
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/dashboard/pending-work — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/dashboard/pending-work    PROTECTED    ANON,CUSTOMER

TC_API_ACL_118 GET /api/dashboard/pipeline
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/dashboard/pipeline — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/dashboard/pipeline    PROTECTED    ANON,CUSTOMER

TC_API_ACL_119 GET /api/dashboard/summary
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/dashboard/summary — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/dashboard/summary    PROTECTED    ANON,CUSTOMER

TC_API_ACL_120 GET /api/house-designs
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/house-designs — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/house-designs    PROTECTED    ANON,CUSTOMER

TC_API_ACL_121 POST /api/house-designs
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/house-designs — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/house-designs    PROTECTED    ANON,CUSTOMER

TC_API_ACL_122 DELETE /api/house-designs/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/house-designs/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/house-designs/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_123 GET /api/house-designs/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/house-designs/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/house-designs/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_124 PATCH /api/house-designs/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/house-designs/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/house-designs/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_125 PATCH /api/house-designs/featured/reorder
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/house-designs/featured/reorder — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/house-designs/featured/reorder    PROTECTED    ANON,CUSTOMER

TC_API_ACL_126 GET /api/leads
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/leads — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/leads    PROTECTED    ANON,CUSTOMER

TC_API_ACL_127 DELETE /api/leads/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/leads/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/leads/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_128 PATCH /api/leads/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/leads/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/leads/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_129 POST /api/leads/:id/create-project
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/leads/:id/create-project — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/leads/:id/create-project    PROTECTED    ANON,CUSTOMER

TC_API_ACL_130 PATCH /api/leads/:id/reply
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/leads/:id/reply — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/leads/:id/reply    PROTECTED    ANON,CUSTOMER

TC_API_ACL_131 GET /api/materials
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/materials — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/materials    PROTECTED    ANON,CUSTOMER

TC_API_ACL_132 POST /api/materials
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/materials — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/materials    PROTECTED    ANON,CUSTOMER

TC_API_ACL_133 DELETE /api/materials/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/materials/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/materials/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_134 PATCH /api/materials/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/materials/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/materials/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_135 GET /api/portfolio
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/portfolio — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/portfolio    PROTECTED    ANON,CUSTOMER

TC_API_ACL_136 POST /api/portfolio
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/portfolio — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/portfolio    PROTECTED    ANON,CUSTOMER

TC_API_ACL_137 DELETE /api/portfolio/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/portfolio/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/portfolio/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_138 GET /api/portfolio/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/portfolio/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/portfolio/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_139 PATCH /api/portfolio/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/portfolio/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/portfolio/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_140 PATCH /api/portfolio/featured/reorder
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/portfolio/featured/reorder — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/portfolio/featured/reorder    PROTECTED    ANON,CUSTOMER

TC_API_ACL_141 GET /api/projects
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects    PROTECTED    ANON,CUSTOMER

TC_API_ACL_142 POST /api/projects
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects    PROTECTED    ANON,CUSTOMER

TC_API_ACL_143 DELETE /api/projects/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/projects/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/projects/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_144 GET /api/projects/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_145 PATCH /api/projects/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/projects/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/projects/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_146 GET /api/projects/:id/activity
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:id/activity — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:id/activity    PROTECTED    ANON,CUSTOMER

TC_API_ACL_147 POST /api/projects/:id/custom-price
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:id/custom-price — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:id/custom-price    PROTECTED    ANON,CUSTOMER

TC_API_ACL_148 POST /api/projects/:id/customer-access-link
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:id/customer-access-link — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:id/customer-access-link    PROTECTED    ANON,CUSTOMER

TC_API_ACL_149 GET /api/projects/:id/customer-activity
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:id/customer-activity — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:id/customer-activity    PROTECTED    ANON,CUSTOMER

TC_API_ACL_150 POST /api/projects/:id/link-lead
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:id/link-lead — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:id/link-lead    PROTECTED    ANON,CUSTOMER

TC_API_ACL_151 PATCH /api/projects/:id/rates
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/projects/:id/rates — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/projects/:id/rates    PROTECTED    ANON,CUSTOMER

TC_API_ACL_152 POST /api/projects/:id/transition
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:id/transition — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:id/transition    PROTECTED    ANON,CUSTOMER

TC_API_ACL_153 GET /api/projects/:projectId/boq
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/boq — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/boq    PROTECTED    ANON,CUSTOMER

TC_API_ACL_154 GET /api/projects/:projectId/boq/export.xlsx
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/boq/export.xlsx — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/boq/export.xlsx    PROTECTED    ANON,CUSTOMER

TC_API_ACL_155 POST /api/projects/:projectId/boq/import
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/boq/import — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/boq/import    PROTECTED    ANON,CUSTOMER

TC_API_ACL_156 POST /api/projects/:projectId/boq/import/preview
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/boq/import/preview — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/boq/import/preview    PROTECTED    ANON,CUSTOMER

TC_API_ACL_157 GET /api/projects/:projectId/boq/import/template.xlsx
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/boq/import/template.xlsx — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/boq/import/template.xlsx    PROTECTED    ANON,CUSTOMER

TC_API_ACL_158 POST /api/projects/:projectId/boq/items
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/boq/items — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/boq/items    PROTECTED    ANON,CUSTOMER

TC_API_ACL_159 DELETE /api/projects/:projectId/boq/items/:itemId
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/projects/:projectId/boq/items/:itemId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/projects/:projectId/boq/items/:itemId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_160 PATCH /api/projects/:projectId/boq/items/:itemId
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/projects/:projectId/boq/items/:itemId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/projects/:projectId/boq/items/:itemId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_161 POST /api/projects/:projectId/boq/items/batch
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/boq/items/batch — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/boq/items/batch    PROTECTED    ANON,CUSTOMER

TC_API_ACL_162 PUT /api/projects/:projectId/boq/items/order
    [Documentation]    Scenario: ตรวจสิทธิ์ PUT /api/projects/:projectId/boq/items/order — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PUT    /api/projects/:projectId/boq/items/order    PROTECTED    ANON,CUSTOMER

TC_API_ACL_163 GET /api/projects/:projectId/boq/price-drift
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/boq/price-drift — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/boq/price-drift    PROTECTED    ANON,CUSTOMER

TC_API_ACL_164 POST /api/projects/:projectId/boq/price-drift/apply
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/boq/price-drift/apply — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/boq/price-drift/apply    PROTECTED    ANON,CUSTOMER

TC_API_ACL_165 POST /api/projects/:projectId/boq/price-drift/keep
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/boq/price-drift/keep — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/boq/price-drift/keep    PROTECTED    ANON,CUSTOMER

TC_API_ACL_166 GET /api/projects/:projectId/boq/rebar-bbs.xlsx
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/boq/rebar-bbs.xlsx — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/boq/rebar-bbs.xlsx    PROTECTED    ANON,CUSTOMER

TC_API_ACL_167 GET /api/projects/:projectId/boq/rebar-cutting
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/boq/rebar-cutting — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/boq/rebar-cutting    PROTECTED    ANON,CUSTOMER

TC_API_ACL_168 GET /api/projects/:projectId/boq/structural-compare
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/boq/structural-compare — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/boq/structural-compare    PROTECTED    ANON,CUSTOMER

TC_API_ACL_169 GET /api/projects/:projectId/boq/structural-members
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/boq/structural-members — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/boq/structural-members    PROTECTED    ANON,CUSTOMER

TC_API_ACL_170 DELETE /api/projects/:projectId/boq/structural-members/:key
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/projects/:projectId/boq/structural-members/:key — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/projects/:projectId/boq/structural-members/:key    PROTECTED    ANON,CUSTOMER

TC_API_ACL_171 PUT /api/projects/:projectId/boq/structural-members/:key
    [Documentation]    Scenario: ตรวจสิทธิ์ PUT /api/projects/:projectId/boq/structural-members/:key — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PUT    /api/projects/:projectId/boq/structural-members/:key    PROTECTED    ANON,CUSTOMER

TC_API_ACL_172 POST /api/projects/:projectId/boq/structural-members/recompute
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/boq/structural-members/recompute — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/boq/structural-members/recompute    PROTECTED    ANON,CUSTOMER

TC_API_ACL_173 POST /api/projects/:projectId/boq/takeoff/apply
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/boq/takeoff/apply — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/boq/takeoff/apply    PROTECTED    ANON,CUSTOMER

TC_API_ACL_174 GET /api/projects/:projectId/boq/versions/compare
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/boq/versions/compare — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/boq/versions/compare    PROTECTED    ANON,CUSTOMER

TC_API_ACL_175 GET /api/projects/:projectId/contracts
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/contracts — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/contracts    PROTECTED    ANON,CUSTOMER

TC_API_ACL_176 POST /api/projects/:projectId/contracts
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts    PROTECTED    ANON,CUSTOMER

TC_API_ACL_177 GET /api/projects/:projectId/contracts/:contractId
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/contracts/:contractId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/contracts/:contractId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_178 PATCH /api/projects/:projectId/contracts/:contractId/body
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/projects/:projectId/contracts/:contractId/body — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/projects/:projectId/contracts/:contractId/body    PROTECTED    ANON,CUSTOMER

TC_API_ACL_179 GET /api/projects/:projectId/contracts/:contractId/change-orders
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/contracts/:contractId/change-orders — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/contracts/:contractId/change-orders    PROTECTED    ANON,CUSTOMER

TC_API_ACL_180 POST /api/projects/:projectId/contracts/:contractId/change-orders
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/change-orders — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/change-orders    PROTECTED    ANON,CUSTOMER

TC_API_ACL_181 PATCH /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_182 POST /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId/cancel
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId/cancel — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId/cancel    PROTECTED    ANON,CUSTOMER

TC_API_ACL_183 POST /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId/decision
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId/decision — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId/decision    PROTECTED    ANON,CUSTOMER

TC_API_ACL_184 GET /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId/pdf
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId/pdf — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId/pdf    PROTECTED    ANON,CUSTOMER

TC_API_ACL_185 POST /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId/refresh
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId/refresh — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId/refresh    PROTECTED    ANON,CUSTOMER

TC_API_ACL_186 POST /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId/send
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId/send — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/change-orders/:changeOrderId/send    PROTECTED    ANON,CUSTOMER

TC_API_ACL_187 GET /api/projects/:projectId/contracts/:contractId/change-orders/preview
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/contracts/:contractId/change-orders/preview — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/contracts/:contractId/change-orders/preview    PROTECTED    ANON,CUSTOMER

TC_API_ACL_188 GET /api/projects/:projectId/contracts/:contractId/documents/:docId/pdf
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/contracts/:contractId/documents/:docId/pdf — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/contracts/:contractId/documents/:docId/pdf    PROTECTED    ANON,CUSTOMER

TC_API_ACL_189 POST /api/projects/:projectId/contracts/:contractId/documents/:docId/void
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/documents/:docId/void — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/documents/:docId/void    PROTECTED    ANON,CUSTOMER

TC_API_ACL_190 GET /api/projects/:projectId/contracts/:contractId/installments
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/contracts/:contractId/installments — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/contracts/:contractId/installments    PROTECTED    ANON,CUSTOMER

TC_API_ACL_191 PUT /api/projects/:projectId/contracts/:contractId/installments
    [Documentation]    Scenario: ตรวจสิทธิ์ PUT /api/projects/:projectId/contracts/:contractId/installments — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PUT    /api/projects/:projectId/contracts/:contractId/installments    PROTECTED    ANON,CUSTOMER

TC_API_ACL_192 PATCH /api/projects/:projectId/contracts/:contractId/installments/:installmentId/due
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/projects/:projectId/contracts/:contractId/installments/:installmentId/due — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/projects/:projectId/contracts/:contractId/installments/:installmentId/due    PROTECTED    ANON,CUSTOMER

TC_API_ACL_193 POST /api/projects/:projectId/contracts/:contractId/installments/:installmentId/invoice
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/installments/:installmentId/invoice — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/installments/:installmentId/invoice    PROTECTED    ANON,CUSTOMER

TC_API_ACL_194 POST /api/projects/:projectId/contracts/:contractId/installments/:installmentId/payments
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/installments/:installmentId/payments — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/installments/:installmentId/payments    PROTECTED    ANON,CUSTOMER

TC_API_ACL_195 POST /api/projects/:projectId/contracts/:contractId/payment-notices/:noticeId/confirm-slip
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/payment-notices/:noticeId/confirm-slip — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/payment-notices/:noticeId/confirm-slip    PROTECTED    ANON,CUSTOMER

TC_API_ACL_196 GET /api/projects/:projectId/contracts/:contractId/payment-notices/:noticeId/evidence/:evidenceId
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/contracts/:contractId/payment-notices/:noticeId/evidence/:evidenceId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/contracts/:contractId/payment-notices/:noticeId/evidence/:evidenceId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_197 POST /api/projects/:projectId/contracts/:contractId/payment-notices/:noticeId/recheck-slip
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/payment-notices/:noticeId/recheck-slip — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/payment-notices/:noticeId/recheck-slip    PROTECTED    ANON,CUSTOMER

TC_API_ACL_198 POST /api/projects/:projectId/contracts/:contractId/payment-notices/:noticeId/reject
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/payment-notices/:noticeId/reject — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/payment-notices/:noticeId/reject    PROTECTED    ANON,CUSTOMER

TC_API_ACL_199 GET /api/projects/:projectId/contracts/:contractId/payments
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/contracts/:contractId/payments — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/contracts/:contractId/payments    PROTECTED    ANON,CUSTOMER

TC_API_ACL_200 DELETE /api/projects/:projectId/contracts/:contractId/payments/:paymentId
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/projects/:projectId/contracts/:contractId/payments/:paymentId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/projects/:projectId/contracts/:contractId/payments/:paymentId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_201 PATCH /api/projects/:projectId/contracts/:contractId/payments/:paymentId
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/projects/:projectId/contracts/:contractId/payments/:paymentId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/projects/:projectId/contracts/:contractId/payments/:paymentId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_202 POST /api/projects/:projectId/contracts/:contractId/payments/:paymentId/evidence
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/payments/:paymentId/evidence — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/payments/:paymentId/evidence    PROTECTED    ANON,CUSTOMER

TC_API_ACL_203 DELETE /api/projects/:projectId/contracts/:contractId/payments/:paymentId/evidence/:evidenceId
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/projects/:projectId/contracts/:contractId/payments/:paymentId/evidence/:evidenceId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/projects/:projectId/contracts/:contractId/payments/:paymentId/evidence/:evidenceId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_204 GET /api/projects/:projectId/contracts/:contractId/payments/:paymentId/evidence/:evidenceId
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/contracts/:contractId/payments/:paymentId/evidence/:evidenceId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/contracts/:contractId/payments/:paymentId/evidence/:evidenceId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_205 POST /api/projects/:projectId/contracts/:contractId/payments/:paymentId/receipt
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/payments/:paymentId/receipt — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/payments/:paymentId/receipt    PROTECTED    ANON,CUSTOMER

TC_API_ACL_206 POST /api/projects/:projectId/contracts/:contractId/payments/:paymentId/verify
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/payments/:paymentId/verify — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/payments/:paymentId/verify    PROTECTED    ANON,CUSTOMER

TC_API_ACL_207 GET /api/projects/:projectId/contracts/:contractId/pdf
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/contracts/:contractId/pdf — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/contracts/:contractId/pdf    PROTECTED    ANON,CUSTOMER

TC_API_ACL_208 PATCH /api/projects/:projectId/contracts/:contractId/retention
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/projects/:projectId/contracts/:contractId/retention — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/projects/:projectId/contracts/:contractId/retention    PROTECTED    ANON,CUSTOMER

TC_API_ACL_209 POST /api/projects/:projectId/contracts/:contractId/retention/invoice
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/retention/invoice — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/retention/invoice    PROTECTED    ANON,CUSTOMER

TC_API_ACL_210 POST /api/projects/:projectId/contracts/:contractId/retention/releases
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/retention/releases — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/retention/releases    PROTECTED    ANON,CUSTOMER

TC_API_ACL_211 DELETE /api/projects/:projectId/contracts/:contractId/retention/releases/:releaseId
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/projects/:projectId/contracts/:contractId/retention/releases/:releaseId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/projects/:projectId/contracts/:contractId/retention/releases/:releaseId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_212 PATCH /api/projects/:projectId/contracts/:contractId/retention/releases/:releaseId
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/projects/:projectId/contracts/:contractId/retention/releases/:releaseId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/projects/:projectId/contracts/:contractId/retention/releases/:releaseId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_213 POST /api/projects/:projectId/contracts/:contractId/retention/releases/:releaseId/receipt
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/retention/releases/:releaseId/receipt — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/retention/releases/:releaseId/receipt    PROTECTED    ANON,CUSTOMER

TC_API_ACL_214 POST /api/projects/:projectId/contracts/:contractId/sign
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/contracts/:contractId/sign — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/contracts/:contractId/sign    PROTECTED    ANON,CUSTOMER

TC_API_ACL_215 GET /api/projects/:projectId/costs
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/costs — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/costs    PROTECTED    ANON,CUSTOMER

TC_API_ACL_216 POST /api/projects/:projectId/costs
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/costs — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/costs    PROTECTED    ANON,CUSTOMER

TC_API_ACL_217 DELETE /api/projects/:projectId/costs/:costId
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/projects/:projectId/costs/:costId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/projects/:projectId/costs/:costId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_218 PATCH /api/projects/:projectId/costs/:costId
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/projects/:projectId/costs/:costId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/projects/:projectId/costs/:costId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_219 PATCH /api/projects/:projectId/costs/:costId/vo
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/projects/:projectId/costs/:costId/vo — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/projects/:projectId/costs/:costId/vo    PROTECTED    ANON,CUSTOMER

TC_API_ACL_220 POST /api/projects/:projectId/costs/commitments
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/costs/commitments — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/costs/commitments    PROTECTED    ANON,CUSTOMER

TC_API_ACL_221 DELETE /api/projects/:projectId/costs/commitments/:commitmentId
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/projects/:projectId/costs/commitments/:commitmentId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/projects/:projectId/costs/commitments/:commitmentId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_222 PATCH /api/projects/:projectId/costs/commitments/:commitmentId
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/projects/:projectId/costs/commitments/:commitmentId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/projects/:projectId/costs/commitments/:commitmentId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_223 POST /api/projects/:projectId/costs/commitments/:commitmentId/status
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/costs/commitments/:commitmentId/status — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/costs/commitments/:commitmentId/status    PROTECTED    ANON,CUSTOMER

TC_API_ACL_224 PATCH /api/projects/:projectId/costs/commitments/:commitmentId/vo
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/projects/:projectId/costs/commitments/:commitmentId/vo — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/projects/:projectId/costs/commitments/:commitmentId/vo    PROTECTED    ANON,CUSTOMER

TC_API_ACL_225 DELETE /api/projects/:projectId/costs/price-drift/:itemId/ack
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/projects/:projectId/costs/price-drift/:itemId/ack — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/projects/:projectId/costs/price-drift/:itemId/ack    PROTECTED    ANON,CUSTOMER

TC_API_ACL_226 POST /api/projects/:projectId/costs/price-drift/:itemId/ack
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/costs/price-drift/:itemId/ack — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/costs/price-drift/:itemId/ack    PROTECTED    ANON,CUSTOMER

TC_API_ACL_227 GET /api/projects/:projectId/quotes
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/quotes — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/quotes    PROTECTED    ANON,CUSTOMER

TC_API_ACL_228 POST /api/projects/:projectId/quotes
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/quotes — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/quotes    PROTECTED    ANON,CUSTOMER

TC_API_ACL_229 DELETE /api/projects/:projectId/quotes/:quoteId
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/projects/:projectId/quotes/:quoteId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/projects/:projectId/quotes/:quoteId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_230 GET /api/projects/:projectId/quotes/:quoteId
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/quotes/:quoteId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/quotes/:quoteId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_231 POST /api/projects/:projectId/quotes/:quoteId/approval/approve
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/quotes/:quoteId/approval/approve — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/quotes/:quoteId/approval/approve    PROTECTED    ANON,CUSTOMER

TC_API_ACL_232 POST /api/projects/:projectId/quotes/:quoteId/approval/return
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/quotes/:quoteId/approval/return — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/quotes/:quoteId/approval/return    PROTECTED    ANON,CUSTOMER

TC_API_ACL_233 POST /api/projects/:projectId/quotes/:quoteId/approval/submit
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/quotes/:quoteId/approval/submit — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/quotes/:quoteId/approval/submit    PROTECTED    ANON,CUSTOMER

TC_API_ACL_234 POST /api/projects/:projectId/quotes/:quoteId/approval/withdraw
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/quotes/:quoteId/approval/withdraw — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/quotes/:quoteId/approval/withdraw    PROTECTED    ANON,CUSTOMER

TC_API_ACL_235 POST /api/projects/:projectId/quotes/:quoteId/attachments
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/quotes/:quoteId/attachments — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/quotes/:quoteId/attachments    PROTECTED    ANON,CUSTOMER

TC_API_ACL_236 DELETE /api/projects/:projectId/quotes/:quoteId/attachments/:attachmentId
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/projects/:projectId/quotes/:quoteId/attachments/:attachmentId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/projects/:projectId/quotes/:quoteId/attachments/:attachmentId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_237 PATCH /api/projects/:projectId/quotes/:quoteId/attachments/:attachmentId
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/projects/:projectId/quotes/:quoteId/attachments/:attachmentId — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/projects/:projectId/quotes/:quoteId/attachments/:attachmentId    PROTECTED    ANON,CUSTOMER

TC_API_ACL_238 GET /api/projects/:projectId/quotes/:quoteId/attachments/:attachmentId/download
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/quotes/:quoteId/attachments/:attachmentId/download — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/quotes/:quoteId/attachments/:attachmentId/download    PROTECTED    ANON,CUSTOMER

TC_API_ACL_239 GET /api/projects/:projectId/quotes/:quoteId/attachments/:attachmentId/preview
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/quotes/:quoteId/attachments/:attachmentId/preview — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/quotes/:quoteId/attachments/:attachmentId/preview    PROTECTED    ANON,CUSTOMER

TC_API_ACL_240 GET /api/projects/:projectId/quotes/:quoteId/export.xlsx
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/quotes/:quoteId/export.xlsx — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/quotes/:quoteId/export.xlsx    PROTECTED    ANON,CUSTOMER

TC_API_ACL_241 GET /api/projects/:projectId/quotes/:quoteId/pdf
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/projects/:projectId/quotes/:quoteId/pdf — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/projects/:projectId/quotes/:quoteId/pdf    PROTECTED    ANON,CUSTOMER

TC_API_ACL_242 POST /api/projects/:projectId/quotes/:quoteId/transition
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/quotes/:quoteId/transition — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/quotes/:quoteId/transition    PROTECTED    ANON,CUSTOMER

TC_API_ACL_243 PATCH /api/projects/:projectId/quotes/:quoteId/validity
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/projects/:projectId/quotes/:quoteId/validity — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/projects/:projectId/quotes/:quoteId/validity    PROTECTED    ANON,CUSTOMER

TC_API_ACL_244 POST /api/projects/:projectId/templates/apply
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/templates/apply — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/templates/apply    PROTECTED    ANON,CUSTOMER

TC_API_ACL_245 POST /api/projects/:projectId/templates/save-as
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/projects/:projectId/templates/save-as — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/projects/:projectId/templates/save-as    PROTECTED    ANON,CUSTOMER

TC_API_ACL_246 GET /api/reports/sales-tax
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/reports/sales-tax — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/reports/sales-tax    PROTECTED    ANON,CUSTOMER

TC_API_ACL_247 GET /api/reports/sales-tax.csv
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/reports/sales-tax.csv — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/reports/sales-tax.csv    PROTECTED    ANON,CUSTOMER

TC_API_ACL_248 GET /api/reports/sales-tax.xlsx
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/reports/sales-tax.xlsx — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/reports/sales-tax.xlsx    PROTECTED    ANON,CUSTOMER

TC_API_ACL_249 GET /api/settings
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/settings — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/settings    PROTECTED    ANON,CUSTOMER

TC_API_ACL_250 PATCH /api/settings
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/settings — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/settings    PROTECTED    ANON,CUSTOMER

TC_API_ACL_251 DELETE /api/settings/logo
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/settings/logo — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/settings/logo    PROTECTED    ANON,CUSTOMER

TC_API_ACL_252 GET /api/settings/logo
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/settings/logo — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/settings/logo    PROTECTED    ANON,CUSTOMER

TC_API_ACL_253 POST /api/settings/logo
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/settings/logo — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/settings/logo    PROTECTED    ANON,CUSTOMER

TC_API_ACL_254 POST /api/settings/promptpay-preview
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/settings/promptpay-preview — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/settings/promptpay-preview    PROTECTED    ANON,CUSTOMER

TC_API_ACL_255 GET /api/settings/takeoff-rules
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/settings/takeoff-rules — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/settings/takeoff-rules    PROTECTED    ANON,CUSTOMER

TC_API_ACL_256 PUT /api/settings/takeoff-rules
    [Documentation]    Scenario: ตรวจสิทธิ์ PUT /api/settings/takeoff-rules — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ADMIN | 3. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ADMIN → 403 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PUT    /api/settings/takeoff-rules    PROTECTED    ANON,ADMIN,CUSTOMER

TC_API_ACL_257 GET /api/templates
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/templates — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/templates    PROTECTED    ANON,CUSTOMER

TC_API_ACL_258 DELETE /api/templates/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ DELETE /api/templates/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    DELETE    /api/templates/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_259 GET /api/templates/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/templates/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/templates/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_260 PATCH /api/templates/:id
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/templates/:id — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/templates/:id    PROTECTED    ANON,CUSTOMER

TC_API_ACL_261 PATCH /api/templates/:id/items/:index
    [Documentation]    Scenario: ตรวจสิทธิ์ PATCH /api/templates/:id/items/:index — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    PATCH    /api/templates/:id/items/:index    PROTECTED    ANON,CUSTOMER

TC_API_ACL_262 GET /api/trash
    [Documentation]    Scenario: ตรวจสิทธิ์ GET /api/trash — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    GET    /api/trash    PROTECTED    ANON,CUSTOMER

TC_API_ACL_263 POST /api/trash/:type/:id/restore
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/trash/:type/:id/restore — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/trash/:type/:id/restore    PROTECTED    ANON,CUSTOMER

TC_API_ACL_264 POST /api/uploads
    [Documentation]    Scenario: ตรวจสิทธิ์ POST /api/uploads — กลุ่ม STAFF (ระบบหลังบ้านของพนักงาน)
    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้
    ...    Steps: 1. ยิงด้วยไม่มีคุกกี้ | 2. ยิงด้วยเซสชัน ลูกค้า
    ...    Data: body = {} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = ADMIN, OWNER
    ...    Expected: ยังไม่เข้าสู่ระบบ → 401 · ลูกค้า → 403 · ทุกคำตอบต้องไม่ใช่ 5xx
    [Tags]    priority:Medium    group:STAFF
    POST    /api/uploads    PROTECTED    ANON,CUSTOMER
