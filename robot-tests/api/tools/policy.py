"""
นโยบายสิทธิ์ "ตามหลักการ" ของ API ทุกเส้น + ตัวสร้างชุดทดสอบสิทธิ์ (01_access_matrix.robot)

    python -X utf8 robot-tests/api/tools/policy.py

อ่าน robot-tests/api/routes.json (จาก tools/inventory.ts = สิ่งที่โค้ดประกาศ) แล้ว
  1) จัดแต่ละเส้นเข้ากลุ่มตามหลักการ (ไม่ได้ลอกจากโค้ด) — PUBLIC / ANY / STAFF / OWNER / CUSTOMER
  2) บทบาทที่ "ต้องถูกปฏิเสธ" = ทุกบทบาทที่ไม่อยู่ใน (หลักการ ∩ โค้ด)
     · โค้ดเข้มกว่าหลักการ → เทสต์ยึดโค้ด (ถือเป็นเจตนาที่เข้มขึ้น) และบันทึกไว้ในชีต Endpoint Coverage
     · โค้ดหลวมกว่าหลักการ → เทสต์คาดหวังตามหลักการ จึงล้ม = ข้อบกพร่อง
  3) เขียน robot-tests/api/01_access_matrix.robot (หนึ่งเคสต่อหนึ่งเส้น) และ api/coverage.json ให้รายงาน
"""
from __future__ import annotations

import json
import re
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
ROLES = ["OWNER", "ADMIN", "CUSTOMER"]

# เส้นที่คนยังไม่เข้าสู่ระบบต้องใช้ได้ — ทางเข้าระบบ (เข้าสู่ระบบ/สมัคร/ยืนยันอีเมล/ลืมรหัส/ลิงก์เข้าใช้/ขั้น 2FA)
# และเนื้อหาเว็บไซต์สาธารณะ
PUBLIC_AUTH = re.compile(
    r"^/api/auth/("
    r"(staff|customer)/login"
    r"|customer/register"
    r"|(staff|customer)/forgot-password"
    r"|(staff|customer)/reset-password(/.*)?"
    r"|customer/verify-email(/.*)?"
    r"|access/:token"
    r"|2fa/verify"
    r"|logout"
    r")$"
)
# ต้องเข้าสู่ระบบ ใช้ได้ทั้งพนักงานและลูกค้า
ANY_AUTH = re.compile(r"^/api/(auth/me|auth/change-password|notifications(/.*)?)$")
# บัญชีของลูกค้าเอง: แก้ชื่อ/รูปโปรไฟล์ และขอลบบัญชี (PDPA)
CUSTOMER_SELF = re.compile(r"^/api/auth/(me/profile|me/avatar|delete-account)$")
# งานเฉพาะเจ้าของกิจการ (ตามกฎธุรกิจของระบบ): จัดการผู้ใช้ สำรองข้อมูล ตั้งค่าการส่งเมล ตรวจไอพี
OWNER_PREFIX = re.compile(r"^/api/(users|backups|mail|system)(/|$)")


def principle(method: str, path: str) -> tuple[str, str]:
    """(กลุ่ม, เหตุผล) ตามหลักการ"""
    if path.startswith("/api/health") or path.startswith("/api/public/"):
        return "PUBLIC", "เนื้อหาสาธารณะ / ตรวจสุขภาพระบบ"
    if PUBLIC_AUTH.match(path):
        return "PUBLIC", "ทางเข้าระบบ — คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้"
    if ANY_AUTH.match(path):
        return "ANY", "ข้อมูลของผู้ใช้ที่เข้าสู่ระบบอยู่ ใช้ได้ทั้งสองฝั่ง"
    if path.startswith("/api/auth/2fa/"):
        return "STAFF", "2FA เป็นของบัญชีพนักงานเท่านั้น"
    if path.startswith("/api/my/") or path == "/api/my":
        return "CUSTOMER", "พื้นที่ส่วนตัวของลูกค้า"
    if CUSTOMER_SELF.match(path):
        return "CUSTOMER", "หน้าบัญชีของลูกค้าเอง (ชื่อ/รูป/ลบบัญชี) — ฝั่งพนักงานใช้ /api/account"
    if OWNER_PREFIX.match(path):
        return "OWNER", "จัดการผู้ใช้/สำรองข้อมูล/ตั้งค่าเมล/ตรวจไอพี เป็นงานของเจ้าของกิจการ"
    if method == "DELETE" and path.startswith("/api/trash/"):
        return "OWNER", "ลบถาวรจากถังขยะ เฉพาะเจ้าของกิจการ"
    return "STAFF", "ระบบหลังบ้านของพนักงาน"


GROUP_ROLES = {
    "PUBLIC": set(ROLES) | {"ANON"},
    "ANY": set(ROLES),
    "STAFF": {"OWNER", "ADMIN"},
    "OWNER": {"OWNER"},
    "CUSTOMER": {"CUSTOMER"},
}


def plan(routes: list[dict]) -> list[dict]:
    out = []
    for r in routes:
        group, why = principle(r["method"], r["path"])
        expected = GROUP_ROLES[group]
        code = set(r["roles"]) if r["roles"] else (set(ROLES) if r["auth"] else set(ROLES) | {"ANON"})
        allowed = expected & code
        deny = [x for x in ["ANON", *ROLES] if x not in allowed]
        looser = sorted(code - expected)  # โค้ดยอมบทบาทที่หลักการไม่ยอม → เทสต์จะล้ม
        stricter = sorted(expected - code)
        out.append({**r, "group": group, "why": why, "deny": deny, "looser": looser, "stricter": stricter,
                    "public": group == "PUBLIC" and "ANON" in code})
    return out


ROLE_TH = {"ANON": "ยังไม่เข้าสู่ระบบ", "OWNER": "OWNER", "ADMIN": "ADMIN", "CUSTOMER": "ลูกค้า"}


def robot_file(items: list[dict]) -> str:
    lines = [
        "*** Settings ***",
        "Documentation     API — สิทธิ์การเข้าถึงของทุกเส้น (สร้างอัตโนมัติจาก tools/policy.py — ห้ามแก้มือ ให้แก้ที่ policy.py แล้วสร้างใหม่)",
        "...",
        "...               แต่ละเคส = หนึ่งเส้น: ยิงด้วยทุกบทบาทที่ \"ต้องถูกปฏิเสธ\" แล้วตรวจว่าได้ 401 (ยังไม่เข้าสู่ระบบ) หรือ 403 (บทบาทไม่ตรง)",
        "...               เส้นสาธารณะ: ตรวจว่าคนที่ยังไม่เข้าสู่ระบบเรียกได้ และไม่ตอบ 5xx",
        "...               พารามิเตอร์ใน path ใช้ไอดีที่ไม่มีอยู่จริง — ตัวกั้นสิทธิ์ต้องทำงานก่อนค้นข้อมูลเสมอ",
        "Resource          resource.robot",
        "Suite Setup       Open API Sessions",
        "Suite Teardown    Delete All Sessions",
        "Test Template     Access Should Be Enforced",
        "Force Tags        api    module:API Access Control",
        "",
        "",
        "*** Test Cases ***",
    ]
    for i, it in enumerate(items, start=1):
        tc = f"TC_API_ACL_{i:03d}"
        deny_txt = " · ".join(f"{ROLE_TH[d]} → {'401' if d == 'ANON' else '403'}" for d in it["deny"]) or "ไม่มีบทบาทที่ต้องถูกปฏิเสธ"
        if it["public"]:
            expected = "เรียกได้โดยไม่ต้องเข้าสู่ระบบ (ไม่ตอบ 401/403) และไม่ตอบ 5xx"
            steps = f"1. ยิง {it['method']} {it['path']} โดยไม่มีคุกกี้"
        else:
            expected = deny_txt + " · ทุกคำตอบต้องไม่ใช่ 5xx"
            steps = " | ".join(f"{n}. ยิงด้วย{('ไม่มีคุกกี้' if d == 'ANON' else 'เซสชัน ' + ROLE_TH[d])}" for n, d in enumerate(it["deny"], start=1))
        allowed_txt = ", ".join(sorted(set(["ANON", *ROLES]) - set(it["deny"]))) or "-"
        lines += [
            f"{tc} {it['method']} {it['path']}",
            f"    [Documentation]    Scenario: ตรวจสิทธิ์ {it['method']} {it['path']} — กลุ่ม {it['group']} ({it['why']})",
            f"    ...    Pre: มีเซสชันทดสอบของ OWNER · ADMIN · ลูกค้า และคำขอที่ไม่มีคุกกี้",
            f"    ...    Steps: {steps}",
            f"    ...    Data: body = {{}} · พารามิเตอร์ใน path = ไอดีที่ไม่มีอยู่จริง · บทบาทที่ยอม = {allowed_txt}",
            f"    ...    Expected: {expected}",
            f"    [Tags]    priority:{'High' if it['group'] in ('OWNER', 'CUSTOMER') or it['looser'] else 'Medium'}    group:{it['group']}",
            f"    {it['method']}    {it['path']}    {'PUBLIC' if it['public'] else 'PROTECTED'}    {','.join(it['deny']) or 'NONE'}",
            "",
        ]
    return "\n".join(lines)


def main():
    routes = json.loads((API_DIR / "routes.json").read_text(encoding="utf-8"))
    # ลำดับคงที่: ตามกลุ่มสิทธิ์ แล้วตาม path — รหัสเคสไม่สลับไปมาระหว่างรอบถ้าไม่มีเส้นใหม่
    order = {"PUBLIC": 0, "ANY": 1, "CUSTOMER": 2, "OWNER": 3, "STAFF": 4}
    items = sorted(plan(routes), key=lambda x: (order[x["group"]], x["path"], x["method"]))
    (API_DIR / "01_access_matrix.robot").write_text(robot_file(items), encoding="utf-8", newline="\n")
    for i, it in enumerate(items, start=1):
        it["tc"] = f"TC_API_ACL_{i:03d}"
    (API_DIR / "coverage.json").write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    looser = [i for i in items if i["looser"]]
    stricter = [i for i in items if i["stricter"]]
    print(f"{len(items)} routes · โค้ดหลวมกว่าหลักการ {len(looser)} · โค้ดเข้มกว่าหลักการ {len(stricter)}")
    for i in looser:
        print("  LOOSER", i["method"], i["path"], "code allows", i["looser"])
    for i in stricter:
        print("  STRICTER", i["method"], i["path"], "code denies", i["stricter"])


if __name__ == "__main__":
    main()
