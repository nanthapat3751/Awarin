import type { BackupMirrorDto, BackupStatusDto, BackupTrigger } from "@systemboq/shared-types";
import { AlertTriangle, DatabaseBackup } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ApiError } from "../lib/api";
import { getBackupStatus, runBackupNow } from "../lib/backups-api";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";

const CARD = "bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3";

const TRIGGER_LABEL: Record<BackupTrigger, string> = {
  auto: "อัตโนมัติ",
  manual: "สั่งจากหน้านี้",
  cli: "สั่งจากเครื่องเซิร์ฟเวอร์",
  "pre-restore": "ก่อนกู้ข้อมูล",
};

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * สถานะการสำรองข้อมูล — เฉพาะ OWNER (ตัวเรียกเป็นคนตัดสินว่าจะแสดง)
 *
 * หน้าที่หลักคือบอกให้รู้ตัวเมื่อ "ระบบสำรองหยุดทำงาน" ซึ่งปกติไม่มีใครสังเกตจนวันที่ต้องใช้
 * ไม่มีปุ่มดาวน์โหลดไฟล์สำรองโดยตั้งใจ — ดูเหตุผลใน server/src/modules/backups/backups.routes.ts
 */
export function BackupSettings() {
  const toast = useToast();
  const [status, setStatus] = useState<BackupStatusDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    getBackupStatus()
      .then(setStatus)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "โหลดสถานะการสำรองข้อมูลไม่สำเร็จ"));
  }, []);

  async function backupNow() {
    setRunning(true);
    try {
      setStatus(await runBackupNow());
      toast.success("สำรองข้อมูลเรียบร้อยแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "สำรองข้อมูลไม่สำเร็จ");
      getBackupStatus().then(setStatus).catch(() => undefined);
    } finally {
      setRunning(false);
    }
  }

  const latest = status?.backups[0] ?? null;
  const hour = status ? `${String(status.hour).padStart(2, "0")}:00 น.` : "";

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2">
        <DatabaseBackup size={18} className="text-[#000099]" />
        <h2 className="text-sm font-semibold text-slate-800">สำรองข้อมูล</h2>
      </div>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      {status && (
        <>
          <p className="text-xs text-slate-500">
            {status.scheduleEnabled
              ? `ระบบสำรองฐานข้อมูลพร้อมรูปและไฟล์แนบทุกวันเวลา ${hour} เก็บย้อนหลัง ${status.keepDays} วัน`
              : "ปิดการสำรองอัตโนมัติไว้ (BACKUP_ENABLED=false) — สำรองได้เฉพาะเมื่อกดเอง"}
          </p>

          {!status.configured ? (
            <Notice tone="red">
              ยังไม่ได้ตั้งค่าการสำรองข้อมูลบนเซิร์ฟเวอร์ (BACKUP_DATABASE_URL) — ตอนนี้ไม่มีการสำรองเลย
            </Notice>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">สำรองล่าสุด</p>
                {latest ? (
                  <p className={`text-sm font-medium ${status.stale ? "text-red-600" : "text-slate-800"}`}>
                    {formatWhen(latest.createdAt)}
                    <span className="ml-2 font-normal text-slate-500">
                      {formatSize(latest.totalBytes)} · {TRIGGER_LABEL[latest.trigger]}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm font-medium text-red-600">ยังไม่เคยสำรอง</p>
                )}
              </div>
              <Button variant="secondary" onClick={backupNow} disabled={running || status.running}>
                {running || status.running ? "กำลังสำรอง..." : "สำรองตอนนี้"}
              </Button>
            </div>
          )}

          {status.configured && status.stale && latest && (
            <Notice tone="red">ไม่ได้สำรองมาเกิน 36 ชั่วโมง — ระบบสำรองอัตโนมัติอาจหยุดทำงาน</Notice>
          )}
          {status.lastError && (
            <Notice tone="red">
              ครั้งล่าสุดล้มเหลว ({formatWhen(status.lastError.at)}): {status.lastError.message}
            </Notice>
          )}
          {status.configured && status.mirrors.length === 0 && (
            <Notice tone="amber">
              ชุดสำรองอยู่บนเครื่องเดียวกับระบบ — ถ้าเครื่องเสีย ชุดสำรองหายไปด้วย ควรตั้ง BACKUP_MIRROR_DIR
              ให้คัดลอกไปไดรฟ์อื่นหรือโฟลเดอร์ที่ซิงก์ขึ้นคลาวด์
            </Notice>
          )}
          {status.configured && status.mirrors.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-slate-500">สำเนานอกเครื่อง</p>
              <ul className="flex flex-col gap-1">
                {status.mirrors.map((m) => (
                  <MirrorRow key={m.label} mirror={m} latestLocal={latest?.createdAt ?? null} />
                ))}
              </ul>
            </div>
          )}

          {status.backups.length > 1 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-1 pr-3 font-medium">ชุดก่อนหน้า</th>
                    <th className="py-1 pr-3 font-medium">ที่มา</th>
                    <th className="py-1 text-right font-medium">ขนาด</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {status.backups.slice(1, 6).map((b) => (
                    <tr key={b.name} className="border-t border-slate-100">
                      <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">{formatWhen(b.createdAt)}</td>
                      <td className="py-1.5 pr-3 text-slate-500">{TRIGGER_LABEL[b.trigger]}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">{formatSize(b.totalBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {status.backups.length > 6 && (
                <p className="mt-1 text-xs text-slate-400">และอีก {status.backups.length - 6} ชุด</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const MIRROR_STALE_DAYS = 7;

/**
 * ไม่ได้ต่ออยู่ (ถอด USB ไว้) เป็นเรื่องปกติ ไม่ขึ้นแดง — เตือนเฉพาะเมื่อสำเนาล่าสุดเก่าเกิน 7 วัน
 * (ตอนไม่ได้ต่ออ่านโฟลเดอร์ไม่ได้ จึงบอกได้แค่ว่ายังไม่ได้ต่อ)
 */
function MirrorRow({ mirror, latestLocal }: Readonly<{ mirror: BackupMirrorDto; latestLocal: string | null }>) {
  const ageDays = mirror.latestAt ? (Date.now() - new Date(mirror.latestAt).getTime()) / 86_400_000 : null;
  const behind = mirror.connected && latestLocal !== null && mirror.latestAt !== latestLocal;
  const stale = mirror.connected && (ageDays === null || ageDays > MIRROR_STALE_DAYS);

  let detail: string;
  let tone = "text-slate-500";
  if (!mirror.connected) {
    detail = "ไม่ได้ต่ออยู่ — ต่อกลับมาแล้วกด สำรองตอนนี้ ระบบจะคัดลอกชุดที่ขาดไปให้ครบ";
    tone = "text-amber-700";
  } else if (!mirror.latestAt) {
    detail = "ยังไม่มีชุดสำรอง — กด สำรองตอนนี้ เพื่อคัดลอกครั้งแรก";
    tone = "text-amber-700";
  } else {
    detail = `ล่าสุด ${formatWhen(mirror.latestAt)} · ${mirror.count} ชุด${behind ? " · ยังไม่ได้ชุดล่าสุด" : ""}`;
    if (stale || behind) tone = "text-amber-700";
  }

  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <span
        className={`inline-block h-2 w-2 shrink-0 -translate-y-px rounded-full ${
          mirror.connected ? "bg-emerald-600" : "bg-slate-300"
        }`}
        aria-hidden
      />
      <span className="font-medium text-slate-800 wrap-anywhere">{mirror.label}</span>
      <span className={tone}>{detail}</span>
    </li>
  );
}

function Notice({ tone, children }: Readonly<{ tone: "red" | "amber"; children: ReactNode }>) {
  const cls =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <p className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${cls}`}>
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
