"""ตัวช่วยของชุดทดสอบ API ที่เขียนใน .robot ตรง ๆ แล้วอ่านยาก (ไฟล์ multipart, รหัส TOTP, คุกกี้, ไอพีจำลอง)"""
from __future__ import annotations

import base64
import hashlib
import hmac
import itertools
import random
import struct
import time
from http.cookies import SimpleCookie

# PNG 1×1 จุด — ผลตรวจสลิปจำลอง (SLIP_PROVIDER=mock) อ่านจากชื่อไฟล์ ไม่ใช่เนื้อรูป
PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
)

_ip_counter = itertools.count(1)
# ไอพีจำลองขึ้นต้นต่างกันทุกครั้งที่เปิด Robot — รันซ้ำกับ API ตัวเดิม (ไม่ได้เปิดใหม่) จะไม่ไปชนโควตาที่รอบก่อนใช้ไป
_ip_base = random.randrange(1, 250)


class ApiHelpers:
    ROBOT_LIBRARY_SCOPE = "GLOBAL"

    def fresh_ip(self) -> str:
        """ไอพีจำลองที่ไม่ซ้ำ (ส่งใน X-Forwarded-For) — เพดานเข้าสู่ระบบนับต่อไอพี แต่ละเคสจึงไม่กินโควตากัน
        ระบบทดสอบตั้ง TRUST_PROXY=loopback (เชื่อ header นี้เฉพาะคำขอที่มาจากเครื่องตัวเอง เหมือนมี nginx อยู่หน้า)"""
        n = next(_ip_counter)
        return f"10.{_ip_base}.{n // 250}.{n % 250 + 1}"

    def ip_header(self, ip: str | None = None) -> dict:
        return {"X-Forwarded-For": ip or self.fresh_ip()}

    def slip_files(self, *names: str, content: bytes | None = None, mime: str = "image/png") -> list:
        """ไฟล์แนบสำหรับช่อง files[] ของการแจ้งโอน (requests รับรายการ (ชื่อช่อง, (ชื่อไฟล์, เนื้อ, ชนิด)))"""
        body = PNG_1PX if content is None else content
        return [("files", (name, body, mime)) for name in names]

    def big_bytes(self, size_mb: float) -> bytes:
        """เนื้อไฟล์ขนาดตามต้องการ ขึ้นต้นด้วยหัว PNG (ทดสอบเพดานขนาดไฟล์ 10 MB)"""
        return PNG_1PX + b"\0" * int(size_mb * 1024 * 1024)

    def text_bytes(self, text: str) -> bytes:
        return text.encode("utf-8")

    def long_string(self, length: int, char: str = "a") -> str:
        return char * int(length)

    def totp(self, secret: str) -> str:
        """รหัส 6 หลักแบบแอป Authenticator (RFC 6238, 30 วินาที, SHA-1)"""
        key = base64.b32decode(secret.upper() + "=" * (-len(secret) % 8))
        h = hmac.new(key, struct.pack(">Q", int(time.time()) // 30), hashlib.sha1).digest()
        o = h[-1] & 15
        return str((struct.unpack(">I", h[o : o + 4])[0] & 0x7FFFFFFF) % 1_000_000).zfill(6)

    def cookie_attributes(self, response, name: str) -> dict:
        """คุณสมบัติของคุกกี้ชื่อนี้จาก Set-Cookie (httponly/samesite/path/secure/expires)"""
        # ระบบส่ง Set-Cookie หลายตัว (เซสชัน + คุกกี้เครื่อง) — requests รวมเป็นบรรทัดเดียวคั่นจุลภาค
        # ซึ่งแยกผิดได้เพราะวันหมดอายุมีจุลภาค จึงอ่านทีละ header จาก urllib3 แทน
        try:
            raws = response.raw.headers.getlist("Set-Cookie")
        except AttributeError:
            raws = [response.headers.get("Set-Cookie", "")]
        m = None
        for raw in raws:
            jar = SimpleCookie()
            jar.load(raw)
            if name in jar:
                m = jar[name]
                break
        if m is None:
            return {}
        return {
            "value": m.value,
            "httponly": bool(m["httponly"]),
            "secure": bool(m["secure"]),
            "samesite": (m["samesite"] or "").lower(),
            "path": m["path"],
            "expires": m["expires"],
        }

    def contains_any_key(self, data, *keys: str) -> list:
        """คืนรายการคีย์ต้องห้ามที่พบในข้อมูล (ค้นทุกชั้น) — ใช้ตรวจว่าคำตอบไม่รั่วข้อมูลลับ"""
        found = set()

        def walk(x):
            if isinstance(x, dict):
                for k, v in x.items():
                    if k in keys:
                        found.add(k)
                    walk(v)
            elif isinstance(x, list):
                for v in x:
                    walk(v)

        walk(data)
        return sorted(found)

    def elapsed_ms(self, response) -> float:
        return response.elapsed.total_seconds() * 1000

    def post_multipart(self, alias: str, url: str, files: list, data: dict | None = None):
        """POST multipart ผ่านเซสชันของ RequestsLibrary โดยตรง — keyword ของไลบรารีรับไฟล์เป็น dict
        จึงแนบหลายไฟล์ในช่องเดียวกัน (files[] ของการแจ้งโอน) ไม่ได้"""
        from robot.libraries.BuiltIn import BuiltIn

        lib = BuiltIn().get_library_instance("RequestsLibrary")
        session = lib._cache.switch(alias)
        return session.post(f"{session.url}{url}", files=files, data=data or {}, timeout=60)

    def file_part(self, field: str, filename: str, content: bytes, mime: str) -> list:
        return [(field, (filename, content, mime))]

    def parallel_calls(self, *calls) -> list:
        """ยิงหลายคำขอ "พร้อมกันจริง" (ปล่อยทุกเธรดด้วย Barrier เดียว) — จำลองสองคนกดปุ่มเดียวกันในวินาทีเดียว

        แต่ละรายการคือ [alias, method, url] หรือ [alias, method, url, body] ใช้คุกกี้/header ของเซสชันนั้น
        แต่เปิด requests.Session ใหม่ต่อเธรด (Session ตัวเดียวใช้ข้ามเธรดไม่ปลอดภัย) · คืน response ตามลำดับที่ส่งมา"""
        import threading

        import requests
        from robot.libraries.BuiltIn import BuiltIn

        lib = BuiltIn().get_library_instance("RequestsLibrary")
        barrier = threading.Barrier(len(calls))
        results: list = [None] * len(calls)

        def run(i, alias, method, url, body=None):
            src = lib._cache.switch(alias)
            s = requests.Session()
            s.headers.update(src.headers)
            s.cookies.update(src.cookies)
            barrier.wait()
            try:
                results[i] = s.request(method, f"{src.url}{url}", json=body if body is not None else {}, timeout=60)
            except Exception as err:  # เก็บไว้ให้เคสรายงาน ไม่ให้เธรดตายเงียบ
                results[i] = err

        threads = [threading.Thread(target=run, args=(i, *c)) for i, c in enumerate(calls)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(90)
        for i, r in enumerate(results):
            if not hasattr(r, "status_code"):
                raise AssertionError(f"คำขอที่ {i + 1} ไม่ได้คำตอบ: {r!r}")
        return results

    def pdf_text(self, response) -> str:
        """ข้อความทั้งหมดในไฟล์ PDF (ต่อบรรทัดที่ถูกตัดด้วยช่องว่าง) — ไว้ตรวจว่าข้อมูลออกมาเป็นตัวอักษรตามจริง"""
        import pymupdf

        body = response.content
        if body[:4] != b"%PDF":
            raise AssertionError(f"ไม่ใช่ไฟล์ PDF (สถานะ {response.status_code}): {body[:120]!r}")
        doc = pymupdf.open(stream=body, filetype="pdf")
        return " ".join(page.get_text() for page in doc).replace("\n", " ")
