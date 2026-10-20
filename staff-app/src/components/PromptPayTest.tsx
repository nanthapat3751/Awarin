import { QrCode } from "lucide-react";
import { useState } from "react";

import { ApiError } from "../lib/api";
import { previewPromptPayQr } from "../lib/settings-api";
import { Button } from "./Button";

/**
 * QR ทดสอบ 1 บาทในหน้าตั้งค่า — สแกนด้วยแอปธนาคารของตัวเองก่อนลูกค้าคนแรกจะใช้
 *
 * แอปธนาคารแสดงชื่อเจ้าของพร้อมเพย์ก่อนกดยืนยันเสมอ ถ้าชื่อไม่ใช่บริษัท = เลขผิด ต้องแก้ก่อน
 * (QR ชุดเดียวกันนี้ไปอยู่บนใบแจ้งหนี้และพอร์ทัลลูกค้า) · จะโอนจริง 1 บาทหรือกดยกเลิกในแอปก็ได้
 */
export function PromptPayTest({ promptPay, accountName }: Readonly<{ promptPay: string; accountName: string }>) {
  const [qr, setQr] = useState<{ dataUrl: string; for: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // เลขในช่องเปลี่ยนแล้ว QR เดิมใช้ทดสอบเลขใหม่ไม่ได้ — ซ่อนจนกว่าจะกดสร้างใหม่
  const current = qr?.for === promptPay ? qr : null;

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const res = await previewPromptPayQr(promptPay);
      setQr({ dataUrl: res.dataUrl, for: promptPay });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "สร้าง QR ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
      {current ? (
        <img src={current.dataUrl} alt="QR พร้อมเพย์ทดสอบ 1 บาท" className="h-36 w-36 rounded bg-white p-1" />
      ) : null}
      <div className="flex min-w-60 flex-1 flex-col gap-2 text-slate-600">
        <p className="font-medium text-slate-800">ทดสอบ QR พร้อมเพย์ก่อนใช้จริง</p>
        <p className="text-xs">
          QR นี้จะพิมพ์ลงใบแจ้งหนี้และขึ้นในหน้าสัญญาของลูกค้า — สแกน QR ทดสอบ 1 บาทด้วยแอปธนาคารของคุณ
          แล้วดูชื่อผู้รับที่แอปแสดง
          {accountName.trim() ? (
            <>
              {" "}ต้องเป็น <span className="font-medium text-slate-800">{accountName.trim()}</span>
            </>
          ) : null}
          {" "}ถ้าไม่ใช่ แปลว่าเลขพร้อมเพย์ผิด (จะโอนจริงหรือกดยกเลิกในแอปก็ได้)
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void make()}>
            <QrCode size={14} /> {current ? "สร้างใหม่" : "สร้าง QR ทดสอบ 1 บาท"}
          </Button>
        </div>
      </div>
    </div>
  );
}
