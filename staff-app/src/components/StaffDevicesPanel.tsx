import type { MySessionDto, StaffUserDto } from "@systemboq/shared-types";
import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../lib/api";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { listStaffSessions, revokeAllStaffSessions, revokeStaffSession } from "../lib/users-api";
import { Button } from "./Button";
import { SessionList } from "./SessionsCard";
import { PanelSkeleton } from "./Skeleton";

/**
 * เครื่องที่พนักงานคนหนึ่งเข้าสู่ระบบอยู่ (เฉพาะ OWNER) — กางใต้แถวในหน้าจัดการผู้ใช้
 * ใช้ตอนพนักงานลาออก/ทำ iPad หาย: สั่งออกจากระบบได้ทันทีโดยไม่ต้องระงับบัญชี
 */
export function StaffDevicesPanel({
  staff,
  onChanged,
}: Readonly<{ staff: StaffUserDto; onChanged: () => void }>) {
  const toast = useToast();
  const confirm = useConfirm();
  const [sessions, setSessions] = useState<MySessionDto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const name = staff.fullName;

  const load = useCallback(async () => {
    try {
      setSessions(await listStaffSessions(staff.id));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "โหลดรายการเครื่องไม่สำเร็จ");
      setSessions([]);
    }
  }, [staff.id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(s: MySessionDto) {
    const ok = await confirm(`ออกจากระบบ ${s.browser} · ${s.os} ของ ${name}? เครื่องนั้นต้องเข้าสู่ระบบใหม่`, {
      confirmLabel: "ออกจากระบบ",
    });
    if (ok) await run(() => revokeStaffSession(staff.id, s.handle), "ออกจากระบบเครื่องนั้นแล้ว");
  }

  async function revokeAll() {
    const ok = await confirm(
      `ออกจากระบบทุกเครื่องของ ${name}? บัญชียังใช้ได้ตามปกติ เจ้าตัวเข้าสู่ระบบใหม่ได้ด้วยรหัสเดิม — ถ้าสงสัยว่ารหัสหลุด ให้รีเซ็ตรหัสด้วย`,
      { confirmLabel: "ออกจากระบบทุกเครื่อง" },
    );
    if (ok) await run(() => revokeAllStaffSessions(staff.id), `ออกจากระบบทุกเครื่องของ ${name} แล้ว`);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
      <p className="text-xs font-medium text-slate-600">เครื่องที่ {name} เข้าสู่ระบบอยู่</p>
      {sessions == null && <PanelSkeleton lines={2} />}
      {sessions?.length === 0 && <p className="text-sm text-slate-500">ไม่มีเครื่องที่เข้าสู่ระบบอยู่</p>}
      {sessions && sessions.length > 0 && (
        <>
          <SessionList sessions={sessions} busy={busy} onRevoke={revoke} />
          <div>
            <Button size="sm" variant="dangerQuiet" onClick={revokeAll} disabled={busy}>
              ออกจากระบบทุกเครื่อง ({sessions.length})
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
