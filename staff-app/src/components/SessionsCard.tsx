import { GEOIP_ATTRIBUTION, IP_KIND_LABEL, type IpGeo, type IpKind, type MySessionDto } from "@systemboq/shared-types";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { listMySessions, revokeMySession, revokeOtherSessions } from "../lib/account-api";
import { ApiError } from "../lib/api";
import { useConfirm } from "../lib/confirm-context";
import { timeAgo } from "../lib/notifications-format";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";
import { PanelSkeleton } from "./Skeleton";

const CARD = "bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3";
export const DEVICE_KIND_ICON = { desktop: Monitor, mobile: Smartphone, tablet: Tablet } as const;

const dateTime = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const timeOnly = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" });

/** "วันนี้ 21:54" ถ้าวันเดียวกัน ไม่งั้นวันที่เต็ม — เวลาหมดอายุของ session ส่วนใหญ่อยู่ในวันนี้ */
function shortDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? `วันนี้ ${timeOnly.format(d)}` : dateTime.format(d);
}

/**
 * มาจากไหน: ประเทศ · ผู้ให้บริการเน็ต (ฐานไอพีออฟไลน์) แล้วตามด้วยไอพี · ไอพีภายใน/เครื่องเซิร์ฟเวอร์บอกชนิดแทน
 * ไม่บอกจังหวัด/เมืองโดยตั้งใจ — ฐานข้อมูลฟรีเดาเมืองผิดบ่อย ตัวเลขที่ผิดแย่กว่าไม่มี
 */
export function whereText(ip: string | null, ipKind: IpKind | null, ipGeo: IpGeo | null): string | null {
  if (!ip) return null;
  const where = ipGeo
    ? [ipGeo.country, ipGeo.network].filter(Boolean).join(" · ")
    : (ipKind && IP_KIND_LABEL[ipKind]) || "";
  return where ? `${where} · IP ${ip}` : `IP ${ip}`;
}

export function GeoCredit({ show }: Readonly<{ show: boolean }>) {
  // สัญญาอนุญาต CC BY ของ DB-IP บังคับให้แสดงเครดิตทุกที่ที่ใช้ข้อมูลประเทศ/ผู้ให้บริการ
  if (!show) return null;
  return (
    <p className="text-right text-[11px] text-slate-400">
      ประเทศ/ผู้ให้บริการ:{" "}
      <a href={GEOIP_ATTRIBUTION.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        {GEOIP_ATTRIBUTION.text}
      </a>
    </p>
  );
}

function SessionRow({
  session,
  busy,
  onRevoke,
  onNotMe,
}: Readonly<{
  session: MySessionDto;
  busy: boolean;
  onRevoke: (s: MySessionDto) => void;
  onNotMe?: (s: MySessionDto) => void;
}>) {
  const Icon = DEVICE_KIND_ICON[session.kind];
  const where = whereText(session.ip, session.ipKind, session.ipGeo);
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3">
      <Icon size={20} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
          {session.browser} · {session.os}
          {session.current && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              อุปกรณ์นี้
            </span>
          )}
          {session.newDevice && (
            <span
              title="บัญชีนี้ไม่เคยเข้าจากเบราว์เซอร์นี้มาก่อน — ระบบแจ้งเตือนไปแล้วตอนเข้าสู่ระบบ"
              className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
            >
              เครื่องใหม่
            </span>
          )}
          {session.ipGeo?.foreign && (
            <span
              title="เข้าจากนอกประเทศ — ถ้าไม่ได้อยู่ต่างประเทศ อาจมีคนอื่นใช้บัญชีนี้"
              className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
            >
              ต่างประเทศ
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500">
          {/* อัปเดตไม่ถี่กว่า 5 นาที — เครื่องนี้กำลังใช้อยู่แน่ ๆ จึงไม่โชว์เวลาที่อาจช้ากว่าจริง */}
          {session.current ? "ใช้งานอยู่ตอนนี้" : `ใช้งานล่าสุด ${timeAgo(session.lastSeenAt)}`}
          {where && ` · ${where}`}
        </p>
        <p className="text-xs text-slate-400">
          เข้าสู่ระบบเมื่อ {dateTime.format(new Date(session.createdAt))} · ออกเองอัตโนมัติ{" "}
          {shortDateTime(session.expiresAt)}
        </p>
      </div>
      {!session.current && (
        <div className="flex shrink-0 gap-2 pl-8 sm:pl-0">
          {onNotMe && (
            <Button size="sm" variant="dangerQuiet" onClick={() => onNotMe(session)} disabled={busy}>
              ไม่ใช่ฉัน
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onRevoke(session)} disabled={busy}>
            ออกจากระบบ
          </Button>
        </div>
      )}
    </li>
  );
}

/** รายการเครื่อง — ใช้ทั้งหน้าบัญชีของตัวเอง และหน้าจัดการผู้ใช้ที่ OWNER ดูเครื่องของพนักงาน */
export function SessionList({
  sessions,
  busy,
  onRevoke,
  onNotMe,
}: Readonly<{
  sessions: MySessionDto[];
  busy: boolean;
  onRevoke: (s: MySessionDto) => void;
  onNotMe?: (s: MySessionDto) => void;
}>) {
  return (
    <>
      <ul className="divide-y divide-slate-100">
        {sessions.map((s) => (
          <SessionRow key={s.handle} session={s} busy={busy} onRevoke={onRevoke} onNotMe={onNotMe} />
        ))}
      </ul>
      <GeoCredit show={sessions.some((s) => s.ipGeo)} />
    </>
  );
}

/**
 * อุปกรณ์ที่เข้าสู่ระบบบัญชีนี้อยู่ — เห็นแล้วไม่คุ้น (ลืมออกจากเครื่องที่ไซต์งาน / เครื่องที่ไม่รู้จัก)
 * สั่งออกได้เลย เครื่องนั้นหลุดทันทีในคำขอถัดไป · "ไม่ใช่ฉัน" = สั่งออก + พาไปเปลี่ยนรหัสผ่านต่อทันที
 * (แบบเดียวกับ Google/Facebook — คนที่เข้าเครื่องนั้นได้แปลว่ารู้รหัสแล้ว ออกอย่างเดียวไม่พอ)
 */
export function SessionsCard() {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<MySessionDto[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSessions(await listMySessions());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "โหลดรายการอุปกรณ์ไม่สำเร็จ");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await load();
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ทำรายการไม่สำเร็จ");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function revoke(s: MySessionDto) {
    const ok = await confirm(`ออกจากระบบ ${s.browser} · ${s.os}? เครื่องนั้นต้องเข้าสู่ระบบใหม่`, {
      confirmLabel: "ออกจากระบบ",
    });
    if (ok) await run(() => revokeMySession(s.handle), "ออกจากระบบเครื่องนั้นแล้ว");
  }

  async function notMe(s: MySessionDto) {
    const ok = await confirm(
      `ออกจากระบบ ${s.browser} · ${s.os} แล้วไปเปลี่ยนรหัสผ่าน? คนที่เข้าเครื่องนั้นได้รู้รหัสผ่านของคุณแล้ว — เปลี่ยนรหัสจะออกจากระบบทุกเครื่องให้ด้วย`,
      { confirmLabel: "ออกจากระบบและเปลี่ยนรหัส" },
    );
    if (ok && (await run(() => revokeMySession(s.handle), "ออกจากระบบเครื่องนั้นแล้ว — ตั้งรหัสผ่านใหม่ต่อได้เลย"))) {
      navigate("/account#password");
    }
  }

  async function revokeOthers() {
    const ok = await confirm("ออกจากระบบทุกเครื่องยกเว้นเครื่องนี้?", { confirmLabel: "ออกจากระบบทั้งหมด" });
    if (ok) await run(revokeOtherSessions, "ออกจากระบบอุปกรณ์อื่นทั้งหมดแล้ว");
  }

  const others = sessions?.filter((s) => !s.current).length ?? 0;

  return (
    <section id="devices" className={`${CARD} scroll-mt-20`}>
      <div>
        <p className="text-sm font-medium text-slate-800">อุปกรณ์ที่เข้าสู่ระบบ</p>
        <p className="mt-0.5 text-xs text-slate-500">
          เห็นเครื่องที่ไม่คุ้น กด "ไม่ใช่ฉัน" เพื่อออกจากระบบเครื่องนั้นแล้วเปลี่ยนรหัสผ่าน
        </p>
      </div>
      {sessions == null ? (
        <PanelSkeleton lines={3} />
      ) : (
        <SessionList sessions={sessions} busy={busy} onRevoke={revoke} onNotMe={notMe} />
      )}
      {others > 0 && (
        <div>
          <Button size="sm" variant="dangerQuiet" onClick={revokeOthers} disabled={busy}>
            ออกจากระบบอุปกรณ์อื่นทั้งหมด ({others})
          </Button>
        </div>
      )}
    </section>
  );
}
