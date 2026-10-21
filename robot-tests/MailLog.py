"""อ่านเมลที่ระบบทดสอบ "พิมพ์ลง log แทนการส่ง" (MAIL_TRANSPORT=console ใน test-env.mjs)

ไม่มีเมลออกไปจริงเด็ดขาด — API ของชุดทดสอบเขียนเนื้อเมลลง robot-tests/results/env-api*.log
(หนึ่งไฟล์ต่อหนึ่งช่วงที่ test-env.mjs เปิด API ใหม่) ไลบรารีนี้อ่านไฟล์ล่าสุดเพื่อหยิบรหัสยืนยัน 6 หลัก
และลิงก์ตั้งรหัสผ่านใหม่ — ฐานข้อมูลเก็บแต่แฮช อ่านย้อนจากตรงนั้นไม่ได้
"""
from __future__ import annotations

import re
import time
from pathlib import Path

RESULTS = Path(__file__).resolve().parent / "results"
RULE = "─" * 72
HEADER = "[เมลจำลอง] MAIL_TRANSPORT=console"


class MailLog:
    ROBOT_LIBRARY_SCOPE = "GLOBAL"

    def _log_file(self) -> Path:
        logs = sorted(RESULTS.glob("env-api*.log"), key=lambda p: p.stat().st_mtime)
        if not logs:
            raise AssertionError(f"ไม่พบ log ของ API ชุดทดสอบใน {RESULTS} — เปิดระบบด้วย test-env.mjs หรือยัง")
        return logs[-1]

    def mails_to(self, address: str) -> list[dict]:
        """เมลทุกฉบับถึงที่อยู่นี้ใน log ล่าสุด เรียงเก่า → ใหม่ (dict: to, subject, text)"""
        text = self._log_file().read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n")
        out = []
        for block in text.split(HEADER)[1:]:
            parts = block.split(RULE)
            # parts: [หัว(ถึง/จาก/เรื่อง), เนื้อเมล, ...]
            if len(parts) < 3:
                continue
            head, body = parts[0], parts[1]
            to = re.search(r"ถึง\s*:\s*(\S+)", head)
            subject = re.search(r"เรื่อง\s*:\s*(.+)", head)
            if to and to.group(1).lower() == address.lower():
                out.append({"to": to.group(1), "subject": subject.group(1).strip() if subject else "", "text": body.strip()})
        return out

    def mail_count_to(self, address: str) -> int:
        return len(self.mails_to(address))

    def wait_for_mail_to(self, address: str, after_count: int = 0, timeout: float = 15) -> dict:
        """รอจนมีเมลฉบับที่ after_count+1 ถึงที่อยู่นี้ (ระบบส่งเมลเบื้องหลัง หลังตอบคำขอไปแล้ว)"""
        until = time.time() + float(timeout)
        while time.time() < until:
            mails = self.mails_to(address)
            if len(mails) > int(after_count):
                return mails[-1]
            time.sleep(0.5)
        raise AssertionError(f"ไม่มีเมลใหม่ถึง {address} ภายใน {timeout} วินาที (มีอยู่ {int(after_count)} ฉบับ)")

    def six_digit_code_in(self, text: str) -> str:
        m = re.search(r"(?<!\d)(\d{6})(?!\d)", text)
        if not m:
            raise AssertionError(f"ไม่พบรหัส 6 หลักในเมล: {text[:200]}")
        return m.group(1)

    def link_in(self, text: str, contains: str) -> str:
        for url in re.findall(r"https?://\S+", text):
            if contains in url:
                return url.rstrip(").,")
        raise AssertionError(f"ไม่พบลิงก์ที่มี {contains!r} ในเมล: {text[:300]}")
