import fs from "node:fs";

import type { SlipData, SlipFileInput, SlipProvider, SlipReadResult } from "./provider";

/**
 * SlipOK — ส่งรูปสลิปให้อ่าน QR แล้วตรวจกับธนาคาร (อ้างอิง SlipOK API Guide v1.13, 28 ก.พ. 2026)
 *
 * POST https://api.slipok.com/api/line/apikey/<branch> · header x-authorization · multipart field `files`
 *
 * **ไม่ส่ง `log: true` และไม่ส่ง `amount`** — เอกสารบอกเองว่าถ้าไม่ส่ง log ผู้พัฒนาต้องตรวจซ้ำ/ยอด/บัญชีผู้รับ
 * เองจากฐานข้อมูล ซึ่งระบบเราทำอยู่แล้ว (slip-check.ts) และต้องทำเอง เพราะการกันซ้ำของ SlipOK จะตีกลับ
 * สลิปเดิมที่ลูกค้าแนบใหม่หลังพนักงานปฏิเสธ (เช่น เลือกงวดผิด) · ไม่ส่ง log = เสียโควตาเฉพาะสลิปที่ถูกต้อง
 *
 * **ไม่มีรหัสไหนแปลว่า "สลิปปลอม" แน่ ๆ** — 1011 คือ "QR หมดอายุ หรือไม่มีรายการอยู่จริง" สลิปจริงที่
 * เก่าเกินระยะที่ธนาคารให้ตรวจก็ได้รหัสนี้ จึงไม่ปฏิเสธลูกค้า (ตรวจไม่ได้ → พนักงานตรวจเอง)
 * สลิปที่แก้ตัวเลข/ก๊อป QR ของรายการอื่นมาใช้ ยังจับได้จากยอด/บัญชีผู้รับที่ธนาคารตอบกลับ
 */

/** ตั้งค่า SlipOK ผิด/แพ็กเกจหมด — ไม่ใช่เรื่องของลูกค้า แต่ทำให้ตรวจไม่ได้ทุกใบ ต้องบอกให้ชัด */
const CONFIG_PROBLEM: Record<number, string> = {
  1001: "ไม่พบสาขา — ตรวจค่า SLIPOK_BRANCH_ID",
  1002: "API key ไม่ถูกต้อง — ตรวจค่า SLIPOK_API_KEY",
  1003: "แพ็กเกจ SlipOK หมดอายุ",
  1004: "ใช้เกินโควตา SlipOK — ต่ออายุแพ็กเกจ",
  1015: "ไม่พบแพ็กเกจ SlipOK",
};

/** ข้อความถึงพนักงานตามรหัส — ไม่ได้ระบุ = ใช้ข้อความของ SlipOK */
const STAFF_MESSAGE: Record<number, string> = {
  1005: "ไฟล์ไม่ใช่รูปภาพที่ตรวจได้",
  1006: "รูปภาพไม่ถูกต้อง",
  1007: "ไม่พบ QR บนสลิป",
  1008: "QR นี้ไม่ใช่ QR ของสลิปโอนเงิน",
  1009: "ระบบธนาคารขัดข้องชั่วคราว — กด \"ตรวจสลิปอีกครั้ง\" ในอีกราว 15 นาที",
  1011: "ธนาคารไม่พบรายการ หรือสลิปเก่าเกินระยะที่ตรวจได้",
};

const TIMEOUT_MS = 15_000;

type Party = {
  displayName?: unknown;
  name?: unknown;
  account?: { value?: unknown } | null;
  proxy?: { value?: unknown } | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** "20261018" + "14:22:05" (เวลาไทย) → วันที่ + เวลา · มี transTimestamp (ISO) ใช้ตัวนั้นเป็นเวลา */
function parseWhen(transDate: unknown, transTime: unknown, transTimestamp: unknown): { date: string | null; at: Date | null } {
  const d = str(transDate);
  if (!d || !/^\d{8}$/.test(d)) return { date: null, at: null };
  const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const iso = str(transTimestamp);
  if (iso) {
    const at = new Date(iso);
    if (!Number.isNaN(at.getTime())) return { date, at };
  }
  const t = str(transTime);
  const at = t && /^\d{2}:\d{2}(:\d{2})?$/.test(t) ? new Date(`${date}T${withSeconds(t)}+07:00`) : null;
  return { date, at: at && !Number.isNaN(at.getTime()) ? at : null };
}

/** "14:05" → "14:05:00" · มีวินาทีอยู่แล้วคงเดิม */
const withSeconds = (t: string) => (t.length === 5 ? `${t}:00` : t);

/** แปลงข้อมูลสลิป — โครงไม่ครบ (ไม่มียอด/เลขอ้างอิง) ถือว่าตรวจไม่ได้ ไม่เดาค่า */
export function parseSlipOkSuccess(data: Record<string, unknown>): SlipData | null {
  const transRef = str(data.transRef);
  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);
  if (!transRef || !Number.isFinite(amount) || amount <= 0) return null;
  const sender = (data.sender ?? {}) as Party;
  const receiver = (data.receiver ?? {}) as Party;
  const when = parseWhen(data.transDate, data.transTime, data.transTimestamp);
  return {
    transRef,
    amount: Math.round(amount * 100) / 100,
    transDate: when.date,
    transferredAt: when.at,
    senderName: str(sender.displayName) ?? str(sender.name),
    senderBank: str(data.sendingBank),
    receiverName: str(receiver.displayName) ?? str(receiver.name),
    receiverAccount: str(receiver.account?.value),
    receiverProxy: str(receiver.proxy?.value),
  };
}

type Body = { success?: unknown; code?: unknown; message?: unknown; data?: unknown } | null;

/** แปลงคำตอบของ SlipOK (ทั้งสำเร็จและไม่สำเร็จ) เป็นผลอ่านสลิป — แยกออกมาให้เทสต์ได้โดยไม่ต้องยิงจริง */
export function interpretSlipOkResponse(status: number, body: Body): SlipReadResult {
  const data = body?.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : null;
  if (status >= 200 && status < 300 && body?.success === true && data) {
    const slip = parseSlipOkSuccess(data);
    return slip ? { kind: "ok", slip } : { kind: "unreadable", message: "SlipOK ตอบกลับข้อมูลไม่ครบ" };
  }
  const code = typeof body?.code === "number" ? body.code : Number(body?.code);
  // 1012/1013/1014 (ซ้ำ/ยอด/บัญชีผู้รับ) มากับข้อมูลสลิปเต็ม — ไม่ได้ส่ง log/amount จึงไม่ควรเจอ
  // ถ้าเจอ (เช่น มีคนเปิดตั้งค่าฝั่ง SlipOK) ใช้ข้อมูลสลิปแล้วตัดสินด้วยกติกาของระบบเราเหมือนเดิม
  const slip = (code === 1012 || code === 1013 || code === 1014) && data ? parseSlipOkSuccess(data) : null;
  if (slip) return { kind: "ok", slip };
  return failureOf(status, code, str(body?.message), data);
}

/** คำตอบไม่สำเร็จของ SlipOK → ข้อความที่พนักงานอ่านแล้วรู้ว่าต้องทำอะไร */
function failureOf(status: number, code: number, providerText: string | null, data: Record<string, unknown> | null): SlipReadResult {
  const providerMessage = providerText ?? `SlipOK ตอบกลับ HTTP ${status}`;
  if (Number.isFinite(code) && CONFIG_PROBLEM[code]) {
    return { kind: "unreadable", message: `ระบบตรวจสลิปใช้งานไม่ได้: ${CONFIG_PROBLEM[code]}`, configProblem: true };
  }
  if (code === 1010) return { kind: "unreadable", message: waitMessage(data) };
  if (!Number.isFinite(code)) return { kind: "unreadable", message: providerMessage };
  return { kind: "unreadable", message: `${STAFF_MESSAGE[code] ?? providerMessage} (รหัส ${code})` };
}

/** สลิปกรุงเทพ/ไทยพาณิชย์ต้องรอหลังโอนก่อนธนาคารให้ตรวจ (data.delay = นาที) */
function waitMessage(data: Record<string, unknown> | null): string {
  const delay = data && Number(data.delay) > 0 ? Number(data.delay) : null;
  const bank = data ? str(data.bankName) : null;
  const which = bank ? `ธนาคาร${bank}` : "นี้";
  const wait = delay ? `ราว ${delay} นาที` : "สักครู่";
  return `สลิป${which}ต้องรอ${wait}หลังโอนถึงจะตรวจได้ — กด "ตรวจสลิปอีกครั้ง" ภายหลัง`;
}

export function slipOkProvider(config: { apiKey: string; branchId: string }): SlipProvider {
  const url = `https://api.slipok.com/api/line/apikey/${encodeURIComponent(config.branchId)}`;
  return {
    name: "slipok",
    async read(file: SlipFileInput): Promise<SlipReadResult> {
      let res: Response;
      let body: Body;
      try {
        const buf = await fs.promises.readFile(file.path);
        const form = new FormData();
        form.append("files", new Blob([buf], { type: file.mimetype }), file.originalname);
        res = await fetch(url, {
          method: "POST",
          headers: { "x-authorization": config.apiKey },
          body: form,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        body = (await res.json().catch(() => null)) as Body;
      } catch (err) {
        // เน็ตหลุด/หมดเวลา — ไม่ใช่ความผิดลูกค้า ให้พนักงานตรวจเอง
        return { kind: "unreadable", message: `ติดต่อ SlipOK ไม่ได้ (${err instanceof Error ? err.name : "error"})` };
      }
      const result = interpretSlipOkResponse(res.status, body);
      // ตั้งค่าผิด/แพ็กเกจหมด = ตรวจไม่ได้ทุกใบ — ให้คนดูแลระบบเห็นใน log ด้วย ไม่ใช่แค่ป้ายเทาในหน้าจอ
      if (result.kind === "unreadable" && result.configProblem) console.error(`[slipok] ${result.message}`);
      return result;
    },
  };
}
