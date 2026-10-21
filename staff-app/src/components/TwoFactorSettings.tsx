import { Check, Copy, Download, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  activateTwoFactor,
  addTwoFactorDevice,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateBackupCodes,
  setupTwoFactor,
  type TwoFactorStatus,
} from "../lib/twofactor-api";
import { Button } from "./Button";
import { PanelSkeleton } from "./Skeleton";

// การ์ดยืดเต็มคอลัมน์ที่มันอยู่ — เดิม max-w-lg ตรึงไว้ 512px ทำให้ในโครงสองคอลัมน์เหลือที่ว่างซ้อนอีกชั้น
const CARD = "bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3";
const INPUT = "border border-slate-300 rounded-md px-2 py-1 text-sm";

function msg(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
}

/** รหัสลับสำหรับพิมพ์เข้าแอปเองเมื่อสแกน QR ไม่ได้ */
function SecretWithCopy({ secret }: Readonly<{ secret: string }>) {
  return (
    <div className="text-xs text-slate-500">
      ถ้าสแกนไม่ได้ ให้พิมพ์รหัสนี้เข้าแอปแทน:
      <div className="mt-1 flex items-center gap-2">
        <span className="font-mono text-slate-700 break-all bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
          {secret}
        </span>
        <Button size="sm" variant="ghost" onClick={() => copyText(secret)}>
          <Copy size={13} /> คัดลอก
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ enabled }: Readonly<{ enabled: boolean }>) {
  return enabled ? (
    <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
      <ShieldCheck size={12} /> เปิดใช้อยู่
    </span>
  ) : (
    <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
      <ShieldAlert size={12} /> ยังไม่เปิดใช้
    </span>
  );
}

/** กล่องรหัสสำรอง — โชว์หลังเปิดใช้/สร้างใหม่ (ครั้งเดียว) มาก่อนทุกอย่าง */
function BackupCodesPanel({ codes, onDone }: Readonly<{ codes: string[]; onDone: () => void }>) {
  function downloadBackup() {
    const blob = new Blob([codes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "awarin-2fa-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3 border border-amber-300 bg-amber-50 rounded-lg p-3">
      <div>
        <p className="text-sm font-semibold text-amber-900">รหัสสำรอง (เก็บไว้ที่ปลอดภัย)</p>
        <p className="text-xs text-amber-700">
          ใช้แทนรหัสจากแอปได้ถ้าทำมือถือหาย · แต่ละรหัสใช้ได้ครั้งเดียว · จะแสดงเพียงครั้งนี้ครั้งเดียว
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1 font-mono text-sm text-slate-800">
        {codes.map((c) => (
          <span key={c} className="bg-white border border-amber-200 rounded-md px-2 py-1 text-center">
            {c}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => copyText(codes.join("\n"))}>
          <Copy size={13} /> คัดลอก
        </Button>
        <Button size="sm" variant="ghost" onClick={downloadBackup}>
          <Download size={13} /> ดาวน์โหลด
        </Button>
        <Button size="sm" onClick={onDone}>
          <Check size={13} /> ฉันเก็บรหัสแล้ว
        </Button>
      </div>
    </div>
  );
}

/** กำลังตั้งค่า: สแกน QR แล้วยืนยันรหัสเพื่อเปิดใช้ */
function SetupPanel({
  setup,
  token,
  onToken,
  busy,
  onConfirm,
  onCancel,
}: Readonly<{
  setup: { qrDataUrl: string; secret: string };
  token: string;
  onToken: (value: string) => void;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}>) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-slate-700">
        ขั้นที่ 1 — เปิดแอปในมือถือ กด "เพิ่มบัญชี" แล้วสแกน QR โค้ดนี้
      </p>
      <img src={setup.qrDataUrl} alt="QR สำหรับตั้งค่า 2FA" className="w-44 h-44 border border-slate-200 rounded-lg" />
      <SecretWithCopy secret={setup.secret} />
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        <span>ขั้นที่ 2 — ดูรหัส 6 หลักที่แอปแสดง แล้วพิมพ์ลงช่องนี้เพื่อยืนยัน</span>
        <input
          value={token}
          onChange={(e) => onToken(e.target.value)}
          inputMode="numeric"
          placeholder="เช่น 123456"
          className={`${INPUT} w-40 tracking-widest`}
        />
      </label>
      <p className="text-xs text-slate-400">
        รหัสไม่ผ่าน? ตรวจว่าเวลาในมือถือตั้งเป็น "อัตโนมัติ" และกรอกรหัสล่าสุด (เปลี่ยนทุก 30 วินาที)
      </p>
      <p className="flex items-start gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
        <ShieldAlert size={14} className="shrink-0 mt-0.5" />
        แค่สแกน QR ยังไม่พอ — ต้องพิมพ์รหัส 6 หลักแล้วกด "ยืนยันเปิดใช้" ให้สำเร็จ ถึงจะเปิดใช้จริง
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onConfirm} disabled={busy || token.trim().length < 6}>
          ยืนยันเปิดใช้
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}

/**
 * ป้ายเป็นคำว่า "รหัสผ่าน" คำเดียวตามที่แอปทั่วไปใช้กัน
 * ของเดิมเขียนว่า "ยืนยันรหัสผ่านปัจจุบัน" ซึ่งอ่านได้เป็น "รหัส...ปัจจุบัน"
 * = ตัวเลข 6 หลักที่แอปแสดงอยู่ตอนนี้ (ผู้ใช้เข้าใจผิดจริงมาแล้ว)
 *
 * บรรทัดกำกับใต้ช่องบอกว่า "ใช่อะไร" ไม่ใช่ "ไม่ใช่อะไร" — รอบก่อนเขียนว่า
 * "ไม่ใช่ตัวเลข 6 หลักจากแอป" แล้วผู้ใช้ย้อนถามว่า "แอปไหน" คือไปสร้าง
 * คำถามใหม่แทนที่จะตอบ. ประโยคบอกเล่าอ่านแล้วทำได้เลย และไม่ต้องเอ่ยชื่อแอป
 */
function PasswordField({ value, onChange }: Readonly<{ value: string; onChange: (value: string) => void }>) {
  return (
    <>
      <label className="flex flex-col gap-1 text-xs text-slate-700">
        <span>รหัสผ่าน</span>
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="current-password"
          className={`${INPUT} w-56`}
        />
      </label>
      <p className="text-xs text-slate-400">รหัสผ่านเดียวกับตอนเข้าสู่ระบบ</p>
    </>
  );
}

/** เพิ่มอุปกรณ์ (มือถือเครื่องอื่น) — โชว์ QR ของบัญชีเดิมซ้ำ เครื่องเก่ายังใช้ได้ */
function AddDevicePanel({
  qr,
  password,
  onPassword,
  busy,
  onSubmit,
  onClose,
}: Readonly<{
  qr: { qrDataUrl: string; secret: string } | null;
  password: string;
  onPassword: (value: string) => void;
  busy: boolean;
  onSubmit: () => void;
  onClose: () => void;
}>) {
  if (qr) {
    return (
      <div className="flex flex-col gap-2 border border-slate-200 rounded-lg p-3">
        <p className="text-sm font-medium text-slate-800">
          สแกน QR นี้ด้วยมือถือเครื่องใหม่ (แอป Authenticator กด “เพิ่มบัญชี”)
        </p>
        <img src={qr.qrDataUrl} alt="QR สำหรับเพิ่มอุปกรณ์" className="w-44 h-44 border border-slate-200 rounded-lg" />
        <SecretWithCopy secret={qr.secret} />
        <p className="flex items-start gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5">
          <Check size={14} className="shrink-0 mt-0.5" />
          เครื่องเดิมยังใช้ได้ตามปกติ — เครื่องใหม่จะแสดงรหัสชุดเดียวกัน ไม่ต้องยืนยันอะไรเพิ่ม
        </p>
        <div>
          <Button size="sm" onClick={onClose}>
            <Check size={13} /> เสร็จแล้ว
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 border border-slate-200 rounded-lg p-3">
      <p className="text-sm font-medium text-slate-800">เพิ่มมือถือเครื่องอื่น</p>
      <p className="text-xs text-slate-500">
        ใช้ตอนเปลี่ยนมือถือ หรือชื่อบัญชีในแอปไม่ตรงกับอีเมล — เครื่องเก่ายังใช้ได้
      </p>
      <PasswordField value={password} onChange={onPassword} />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onSubmit} disabled={busy || password.length < 1}>
          ดู QR
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}

function RegenPanel({
  token,
  onToken,
  busy,
  onSubmit,
  onCancel,
}: Readonly<{
  token: string;
  onToken: (value: string) => void;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}>) {
  return (
    <div className="flex flex-col gap-2 border border-slate-200 rounded-lg p-3">
      <p className="text-sm font-medium text-slate-800">สร้างรหัสสำรองชุดใหม่</p>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        <span>รหัสยืนยัน 6 หลักจากแอป Authenticator</span>
        <input
          value={token}
          onChange={(e) => onToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className={`${INPUT} w-40 tracking-[0.3em] text-center`}
        />
        <span className="font-normal text-slate-400">
          ตัวเลข 6 หลักที่แอปแสดงอยู่ตอนนี้ — ไม่ต้องตั้งเอง (เปลี่ยนทุก 30 วินาที)
        </span>
      </label>
      <p className="text-xs text-slate-400">
        เมื่อสร้างชุดใหม่ รหัสสำรองเดิมทั้งหมดจะถูกยกเลิกทันที และใช้ไม่ได้อีก
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onSubmit} disabled={busy || token.trim().length < 6}>
          สร้างรหัสสำรอง
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}

function DisablePanel({
  password,
  onPassword,
  busy,
  onSubmit,
  onCancel,
}: Readonly<{
  password: string;
  onPassword: (value: string) => void;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}>) {
  return (
    <div className="flex flex-col gap-2 border border-red-200 rounded-lg p-3">
      <p className="text-sm font-medium text-slate-800">ปิดการยืนยันสองขั้น</p>
      {/* ป้ายชุดเดียวกับช่องเพิ่มอุปกรณ์ — กำกวมแบบเดียวกันมาก่อน */}
      <PasswordField value={password} onChange={onPassword} />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="danger" onClick={onSubmit} disabled={busy || password.length < 1}>
          ปิด 2FA
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}

/** ยังไม่เปิด */
function NotEnabledPanel({ busy, onStart }: Readonly<{ busy: boolean; onStart: () => void }>) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-start gap-1.5 text-xs text-slate-500">
        <Smartphone size={14} className="shrink-0 mt-0.5" />
        ก่อนเริ่ม ให้โหลดแอป "Google Authenticator" ลงมือถือก่อน (ฟรี หาได้ใน App Store หรือ Play Store)
        — จะใช้ Authy, Microsoft Authenticator หรือ 1Password ก็ได้เหมือนกัน
      </p>
      <div>
        <Button size="sm" onClick={onStart} disabled={busy}>
          <ShieldCheck size={14} /> เปิดใช้ 2FA
        </Button>
      </div>
    </div>
  );
}

/**
 * collapsible = แถวในหมวด "ความปลอดภัย" ของหน้าบัญชี: พับเหลือบรรทัดสถานะ กด "จัดการ" แล้วค่อยกาง
 * (ระหว่างตั้งค่า/เพิ่งได้รหัสสำรอง กางค้างเสมอ ไม่ให้ข้อมูลสำคัญถูกพับหายไปกลางทาง)
 */
export function TwoFactorSettings({
  collapsible = false,
  defaultOpen = false,
}: Readonly<{ collapsible?: boolean; defaultOpen?: boolean }> = {}) {
  const { refresh } = useAuth();
  const [open, setOpen] = useState(defaultOpen);
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [activateToken, setActivateToken] = useState("");

  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const [showDisable, setShowDisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [showRegen, setShowRegen] = useState(false);
  const [regenToken, setRegenToken] = useState("");

  // เพิ่มอุปกรณ์ (มือถือเครื่องอื่น): กรอกรหัสผ่าน → ได้ QR ของ secret เดิมมาสแกนเครื่องใหม่
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [addDevicePassword, setAddDevicePassword] = useState("");
  const [addDeviceQr, setAddDeviceQr] = useState<{ qrDataUrl: string; secret: string } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    try {
      setStatus(await getTwoFactorStatus());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "โหลดสถานะ 2FA ไม่สำเร็จ");
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function beginSetup() {
    setError(null);
    setBusy(true);
    try {
      const res = await setupTwoFactor();
      setSetup({ qrDataUrl: res.qrDataUrl, secret: res.secret });
      setActivateToken("");
    } catch (err) {
      setError(msg(err, "เริ่มตั้งค่า 2FA ไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmActivate() {
    setError(null);
    setBusy(true);
    try {
      const res = await activateTwoFactor(activateToken.trim());
      setSetup(null);
      setActivateToken("");
      setBackupCodes(res.backupCodes);
      await loadStatus();
      await refresh(); // อัปเดตป้ายสถานะ 2FA ในเมนู
    } catch (err) {
      setError(msg(err, "รหัสยืนยันไม่ถูกต้อง"));
    } finally {
      setBusy(false);
    }
  }

  async function doDisable() {
    setError(null);
    setBusy(true);
    try {
      await disableTwoFactor(disablePassword);
      setShowDisable(false);
      setDisablePassword("");
      setBackupCodes(null);
      await loadStatus();
      await refresh(); // อัปเดตป้ายสถานะ 2FA ในเมนู
    } catch (err) {
      setError(msg(err, "ปิด 2FA ไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function doRegen() {
    setError(null);
    setBusy(true);
    try {
      const res = await regenerateBackupCodes(regenToken.trim());
      setShowRegen(false);
      setRegenToken("");
      setBackupCodes(res.backupCodes);
      await loadStatus();
    } catch (err) {
      setError(msg(err, "สร้างรหัสสำรองใหม่ไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function doAddDevice() {
    setError(null);
    setBusy(true);
    try {
      const res = await addTwoFactorDevice(addDevicePassword);
      setAddDeviceQr({ qrDataUrl: res.qrDataUrl, secret: res.secret });
      setAddDevicePassword("");
    } catch (err) {
      setError(msg(err, "เพิ่มอุปกรณ์ไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  function closeAddDevice() {
    setShowAddDevice(false);
    setAddDevicePassword("");
    setAddDeviceQr(null);
    setError(null);
  }

  function cancelSetup() {
    setSetup(null);
    setActivateToken("");
    setError(null);
  }

  function cancelRegen() {
    setShowRegen(false);
    setRegenToken("");
    setError(null);
  }

  function cancelDisable() {
    setShowDisable(false);
    setDisablePassword("");
    setError(null);
  }

  /** เนื้อหาหลักของการ์ด: รหัสสำรองที่เพิ่งได้ > กำลังตั้งค่า > กำลังโหลด > เปิดใช้อยู่ > ยังไม่เปิด */
  function renderBody(): ReactNode {
    if (backupCodes) {
      return <BackupCodesPanel codes={backupCodes} onDone={() => setBackupCodes(null)} />;
    }
    if (setup) {
      return (
        <SetupPanel
          setup={setup}
          token={activateToken}
          onToken={setActivateToken}
          busy={busy}
          onConfirm={confirmActivate}
          onCancel={cancelSetup}
        />
      );
    }
    if (status === null) {
      return <PanelSkeleton lines={3} />;
    }
    if (status.enabled) {
      return (
        <div className="flex flex-col gap-3">
          {/* แบบแถวมีสถานะในหัวแถวแล้ว ไม่ต้องพูดซ้ำ */}
          {!collapsible && (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700">
              <Check size={15} /> เปิดใช้งานอยู่ · รหัสสำรองเหลือ {status.backupCodesRemaining} ชุด
            </p>
          )}

          {showAddDevice ? (
            <AddDevicePanel
              qr={addDeviceQr}
              password={addDevicePassword}
              onPassword={setAddDevicePassword}
              busy={busy}
              onSubmit={doAddDevice}
              onClose={closeAddDevice}
            />
          ) : (
            <div>
              <Button size="sm" variant="ghost" onClick={() => setShowAddDevice(true)}>
                <Smartphone size={13} /> เพิ่มอุปกรณ์ (มือถือเครื่องอื่น)
              </Button>
            </div>
          )}

          {showRegen ? (
            <RegenPanel token={regenToken} onToken={setRegenToken} busy={busy} onSubmit={doRegen} onCancel={cancelRegen} />
          ) : (
            <div>
              <Button size="sm" variant="ghost" onClick={() => setShowRegen(true)}>
                สร้างรหัสสำรองใหม่
              </Button>
            </div>
          )}

          {showDisable ? (
            <DisablePanel
              password={disablePassword}
              onPassword={setDisablePassword}
              busy={busy}
              onSubmit={doDisable}
              onCancel={cancelDisable}
            />
          ) : (
            <div>
              <Button size="sm" variant="dangerQuiet" onClick={() => setShowDisable(true)}>
                ปิด 2FA
              </Button>
            </div>
          )}
        </div>
      );
    }
    return <NotEnabledPanel busy={busy} onStart={beginSetup} />;
  }

  const body = renderBody();

  if (collapsible) {
    const expanded = open || backupCodes != null || setup != null;
    let summary = "กำลังโหลด...";
    if (loadError) summary = loadError;
    else if (status?.enabled) summary = `รหัสสำรองเหลือ ${status.backupCodesRemaining} ชุด`;
    else if (status) summary = "ยังไม่เปิด — แนะนำให้เปิด กันคนที่รู้รหัสผ่านเข้าแทนคุณ";
    return (
      <div className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand" />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                ยืนยันตัวตน 2 ชั้น (2FA) {status && <StatusBadge enabled={status.enabled} />}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{summary}</p>
            </div>
          </div>
          {status && !backupCodes && !setup && (
            <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={expanded}>
              {toggleLabel(expanded, status.enabled)}
            </Button>
          )}
        </div>
        {expanded && (
          <div className="flex flex-col gap-3 pl-[30px]">
            <p className="text-xs text-slate-500">
              เวลาเข้าสู่ระบบ นอกจากรหัสผ่าน ต้องกรอกรหัส 6 หลักจากแอปในมือถือของคุณด้วย — ถึงจะมีคนรู้รหัสผ่าน
              ก็เข้าระบบแทนคุณไม่ได้
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {body}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-[#000099]" />
        <h2 className="text-sm font-semibold text-slate-800">การยืนยันตัวตน 2 ชั้น (2FA)</h2>
        {status && <StatusBadge enabled={status.enabled} />}
      </div>
      <p className="text-xs text-slate-500">
        ล็อกอินให้ปลอดภัยขึ้นอีกชั้น — เวลาเข้าสู่ระบบ นอกจากรหัสผ่าน จะต้องกรอกรหัส 6 หลักจากแอปในมือถือของคุณด้วย
        แบบนี้ถึงจะมีคนรู้รหัสผ่านของคุณ ก็เข้าระบบแทนคุณไม่ได้ เพราะไม่มีมือถือของคุณ
      </p>

      {loadError && <p className="text-red-600 text-sm">{loadError}</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {body}
    </div>
  );
}

function toggleLabel(expanded: boolean, enabled: boolean) {
  if (expanded) return "ซ่อน";
  return enabled ? "จัดการ" : "เปิดใช้";
}
