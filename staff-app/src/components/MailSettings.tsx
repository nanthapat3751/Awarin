import { looksLikeEmail, type MailStatusDto } from "@systemboq/shared-types";
import { Mail } from "lucide-react";
import { useEffect, useState, type ReactNode, type SubmitEvent } from "react";

import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { getMailStatus, sendTestMail, verifyMail } from "../lib/mail-api";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";
import { Notice } from "./Notice";

const CARD = "bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** สรุปสถานะเป็นป้ายเดียว — ดูแวบเดียวต้องรู้ว่า "ลูกค้าได้รับเมลจริงไหม" */
function StatusBadge({ status }: Readonly<{ status: MailStatusDto }>) {
  let tone = "bg-amber-50 text-amber-800 ring-amber-200";
  let label = "โหมดทดสอบ — ยังไม่ส่งเมลออกจริง";
  if (status.mode === "smtp") {
    if (status.lastCheck?.ok) {
      tone = "bg-emerald-50 text-emerald-700 ring-emerald-200";
      label = "ส่งจริง · เชื่อมต่อได้";
    } else if (status.lastCheck) {
      tone = "bg-red-50 text-red-700 ring-red-200";
      label = "ส่งจริง · เชื่อมต่อไม่ได้";
    } else {
      tone = "bg-slate-100 text-slate-700 ring-slate-200";
      label = "ส่งจริง · ยังไม่ได้ตรวจการเชื่อมต่อ";
    }
  }
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${tone}`}>{label}</span>;
}

function Detail({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-40 shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm text-slate-800 wrap-anywhere">{children}</dd>
    </div>
  );
}

/**
 * การส่งอีเมล — เฉพาะ OWNER (ตัวเรียกเป็นคนตัดสินว่าจะแสดง)
 *
 * มีไว้ตอบคำถามเดียวก่อนเปิดให้ลูกค้าใช้: "ถ้าลูกค้ากดลืมรหัสผ่าน เมลจะไปถึงไหม" — ค่าการเชื่อมต่อ
 * อยู่ใน server/.env ไม่ได้แก้จากหน้านี้ (เป็นความลับ และต้องรีสตาร์ตเซิร์ฟเวอร์อยู่ดี)
 */
export function MailSettings() {
  const toast = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState<MailStatusDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [to, setTo] = useState(user?.email ?? "");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    getMailStatus()
      .then(setStatus)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "โหลดสถานะการส่งอีเมลไม่สำเร็จ"));
  }, []);

  async function checkNow() {
    setChecking(true);
    try {
      const next = await verifyMail();
      setStatus(next);
      if (next.lastCheck?.ok) toast.success("เชื่อมต่อเซิร์ฟเวอร์ส่งเมลได้");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ตรวจการเชื่อมต่อไม่สำเร็จ");
    } finally {
      setChecking(false);
    }
  }

  async function handleSend(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setSendError(null);
    const target = to.trim();
    if (!looksLikeEmail(target)) {
      setSendError("รูปแบบอีเมลปลายทางไม่ถูกต้อง");
      return;
    }
    setSending(true);
    try {
      const result = await sendTestMail(target);
      if (result.deliveredForReal) {
        toast.success(`ส่งเมลทดสอบไปที่ ${result.to} แล้ว — ถ้าไม่เจอในกล่องจดหมาย ลองดูโฟลเดอร์สแปม`);
      } else {
        toast.info("ระบบอยู่โหมดทดสอบ เมลถูกพิมพ์ลง log ของเซิร์ฟเวอร์ ไม่ได้ส่งออกไปจริง");
      }
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "ส่งเมลทดสอบไม่สำเร็จ");
    } finally {
      // ส่งไม่ออกมักแปลว่าค่าการเชื่อมต่อผิด — ดึงสถานะใหม่ให้ป้ายด้านบนตรงกับความจริง
      getMailStatus().then(setStatus).catch(() => undefined);
      setSending(false);
    }
  }

  const isLocalLink = status ? /localhost|127\.0\.0\.1/.test(status.linkBaseUrl) : false;
  // ส่งในนามบริษัทจากบัญชีอีเมลส่วนตัว — ใช้ได้ แต่เสี่ยงเข้าสแปม/โควตาต่ำ (เซิร์ฟเวอร์จริงก็เตือนใน log)
  const personalSender = status
    ? /@(gmail|googlemail|hotmail|outlook|live|yahoo|icloud)\.com>?\s*$/i.test(status.from.trim())
    : false;

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2">
        <Mail size={18} className="text-[#000099]" />
        <h2 className="text-sm font-semibold text-slate-800">การส่งอีเมล</h2>
      </div>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      {status && (
        <>
          <p className="text-xs text-slate-500">
            ระบบส่งเมลหาลูกค้า 3 กรณี: รหัสยืนยันอีเมลตอนสมัคร · ลิงก์ตั้งรหัสผ่านใหม่ · แจ้งว่ารหัสผ่านถูกเปลี่ยน
          </p>

          <div>
            <StatusBadge status={status} />
          </div>

          {status.mode !== "smtp" && (
            <Notice tone="amber">
              ตอนนี้เมลไม่ถูกส่งออกไปจริง ({status.mode === "console" ? "พิมพ์ลง log ของเซิร์ฟเวอร์แทน" : "ทิ้งเงียบ"})
              — ลูกค้าที่กดลืมรหัสผ่านจะไม่ได้รับอะไร · เปิดส่งจริงโดยตั้ง MAIL_TRANSPORT=smtp และ SMTP_* ในไฟล์
              server/.env แล้วรีสตาร์ตเซิร์ฟเวอร์
            </Notice>
          )}

          {status.lastCheck && !status.lastCheck.ok && status.lastCheck.problem && (
            <Notice tone="red">{status.lastCheck.problem}</Notice>
          )}

          <dl className="flex flex-col gap-2">
            <Detail label="ผู้ส่งที่ลูกค้าเห็น">{status.from}</Detail>
            {status.smtp && (
              <>
                <Detail label="เซิร์ฟเวอร์ส่งเมล">
                  {status.smtp.host ?? "ยังไม่ได้ตั้ง SMTP_HOST"}:{status.smtp.port}
                  <span className="ml-2 text-xs text-slate-500">
                    {status.smtp.secure ? "เข้ารหัส SSL/TLS" : "STARTTLS"}
                  </span>
                </Detail>
                <Detail label="บัญชีที่ใช้ล็อกอิน">{status.smtp.user ?? "ไม่ล็อกอิน"}</Detail>
              </>
            )}
            <Detail label="ลิงก์ในเมลชี้ไปที่">{status.linkBaseUrl}</Detail>
            {status.lastCheck && <Detail label="ตรวจการเชื่อมต่อล่าสุด">{formatWhen(status.lastCheck.at)}</Detail>}
          </dl>

          {status.mode === "smtp" && isLocalLink && (
            <Notice tone="amber">
              ลิงก์ในเมลยังชี้ไปที่เครื่องนี้ ({status.linkBaseUrl}) — กดได้เฉพาะบนเครื่องนี้ ตอนเปิดให้ลูกค้าใช้จริงต้องตั้ง
              CLIENT_BASE_URL เป็นที่อยู่เว็บจริง
            </Notice>
          )}

          {status.mode === "smtp" && personalSender && (
            <Notice tone="amber">
              ตอนนี้ส่งเมลจากบัญชีอีเมลส่วนตัว — ใช้ทดสอบได้ แต่ก่อนเปิดให้ลูกค้าใช้จริงควรเปลี่ยนเป็นอีเมลโดเมนบริษัท
              (เช่น no-reply@ชื่อโดเมนบริษัท) และตั้ง SPF/DKIM/DMARC ของโดเมน ไม่งั้นเมลมีโอกาสเข้าสแปม ลูกค้าไม่คุ้นชื่อผู้ส่ง
              และ Gmail ส่งได้ราว 500 ฉบับต่อวัน · ขั้นตอนอยู่ในไฟล์ server/.env.production.example
            </Notice>
          )}

          {status.mode === "smtp" && (
            <div>
              <Button variant="neutral" onClick={checkNow} disabled={checking}>
                {checking ? "กำลังตรวจ..." : "ตรวจการเชื่อมต่ออีกครั้ง"}
              </Button>
            </div>
          )}

          <form onSubmit={handleSend} className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <label htmlFor="mail-test-to" className="text-xs text-slate-700">
              ส่งเมลทดสอบไปที่
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="mail-test-to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="อีเมลที่คุณเปิดอ่านได้"
                autoComplete="email"
                aria-invalid={sendError ? true : undefined}
                aria-describedby={sendError ? "mail-test-error" : undefined}
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <Button type="submit" variant="brand" disabled={sending}>
                {sending ? "กำลังส่ง..." : "ส่งเมลทดสอบ"}
              </Button>
            </div>
            {sendError && (
              <p id="mail-test-error" role="alert" className="text-xs text-red-600">
                {sendError}
              </p>
            )}
            <p className="text-xs text-slate-500">เนื้อเมลเป็นข้อความทดสอบตายตัว ส่งได้ 5 ฉบับทุก 10 นาที</p>
          </form>
        </>
      )}
    </div>
  );
}
