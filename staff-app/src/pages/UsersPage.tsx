import { KeyRound, MonitorSmartphone, Power, UserPlus, Wand2 } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

import { type Role, type StaffUserDto, PASSWORD_HINT, passwordProblem } from "@systemboq/shared-types";

import { Button } from "../components/Button";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { PasswordRules, ThaiKeyboardHint } from "../components/PasswordHints";
import { ResetPasswordDialog } from "../components/ResetPasswordDialog";
import { StaffDevicesPanel } from "../components/StaffDevicesPanel";
import { generateTempPassword } from "../lib/temp-password";
import { timeAgo } from "../lib/notifications-format";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { badgeClass, type BadgeColor } from "../lib/status-badge";
import { createStaff, listStaff, setStaffActive } from "../lib/users-api";
import { TableSkeleton } from "../components/Skeleton";
import { RowMenu } from "../components/RowMenu";

type StaffRole = Extract<Role, "OWNER" | "ADMIN">;

const ROLE_LABEL: Record<StaffRole, string> = {
  OWNER: "เจ้าของ",
  ADMIN: "ผู้ดูแล",
};

const ROLE_COLOR: Record<StaffRole, BadgeColor> = {
  OWNER: "indigo",
  ADMIN: "slate",
};

const FIELD = "rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("th-TH");
}

const EMPTY_CREATE = {
  username: "",
  fullName: "",
  email: "",
  role: "ADMIN" as StaffRole,
  password: "",
};

/** ชื่อที่ใช้เรียกบัญชีพนักงานบนหน้าจอ — ชื่อผู้ใช้เป็นหลัก บัญชีเก่าที่ยังไม่มีให้ใช้อีเมลเดิมไปก่อน */
function staffLabel(u: { username: string | null; email: string | null }): string {
  return u.username ?? u.email ?? "—";
}

/** ชื่อผู้ใช้ + อีเมลกู้รหัส — ใช้ทั้งคอลัมน์ของมัน (คอม) และใต้ชื่อ (iPad) */
function UsernameLines({ u }: Readonly<{ u: StaffUserDto }>) {
  return (
    <>
      {staffLabel(u)}
      {u.email ? (
        <span
          className={`block text-xs ${u.emailVerified ? "text-slate-400" : "text-amber-700"}`}
          title={u.emailVerified ? "ยืนยันแล้ว — ลืมรหัสขอลิงก์ทางอีเมลได้เอง" : "ยังไม่ยืนยัน — ลืมรหัสต้องให้เจ้าของระบบรีเซ็ต"}
        >
          {u.email}
          {!u.emailVerified && " · ยังไม่ยืนยัน"}
        </span>
      ) : (
        <span className="block text-xs text-amber-700">ยังไม่มีอีเมลกู้รหัส</span>
      )}
    </>
  );
}

export function UsersPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();

  const [users, setUsers] = useState<StaffUserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);

  // พนักงานที่กำลังรีเซ็ตรหัส (เปิดหน้าต่าง ResetPasswordDialog)
  const [resetTarget, setResetTarget] = useState<StaffUserDto | null>(null);

  // แถวที่กางดูเครื่องที่เข้าสู่ระบบอยู่ (ทีละคน)
  const [devicesId, setDevicesId] = useState<string | null>(null);

  // ตัวเลขจำนวนเครื่องในตารางขยับหลังสั่งออก — โหลดเงียบ ๆ ไม่ให้ตารางกลายเป็นโครงกระดูกทั้งหน้า
  async function refreshQuietly() {
    try {
      setUsers((await listStaff()).users);
    } catch {
      // ตัวเลขค้างไว้ก่อน ไม่ต้องเตือน — แผงด้านล่างบอกผลการสั่งแล้ว
    }
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listStaff();
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === "OWNER") refresh();
    else setLoading(false);
  }, [user?.role]);

  // ข้อมูลของบัญชีที่กำลังสร้าง — ห้ามเอามาตั้งเป็นรหัสผ่านของบัญชีนั้นเอง
  const createPersonal = [createForm.username, createForm.fullName];
  const createPasswordOk =
    createForm.password !== "" && passwordProblem(createForm.password, createPersonal) === null;

  async function submitCreate() {
    if (!createForm.username.trim() || !createForm.fullName.trim() || !createForm.email.trim() || !createPasswordOk) {
      return;
    }
    setCreating(true);
    try {
      await createStaff({
        username: createForm.username.trim().toLowerCase(),
        fullName: createForm.fullName.trim(),
        email: createForm.email.trim(),
        role: createForm.role,
        password: createForm.password,
      });
      setCreateForm(EMPTY_CREATE);
      setShowCreate(false);
      await refresh();
      toast.success(
        "เพิ่มพนักงานเรียบร้อยแล้ว — แจ้งชื่อผู้ใช้และรหัสผ่านเริ่มต้นให้พนักงาน ระบบจะบังคับให้เขาตั้งรหัสใหม่เองตอนเข้าครั้งแรก",
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เพิ่มพนักงานไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(target: StaffUserDto) {
    const turningOff = target.active;
    const ok = await confirm(
      turningOff
        ? `ระงับบัญชี ${staffLabel(target)}? ผู้ใช้จะถูกออกจากระบบและเข้าใช้ไม่ได้จนกว่าจะเปิดใหม่`
        : `เปิดใช้งานบัญชี ${staffLabel(target)} อีกครั้ง?`,
      { confirmLabel: turningOff ? "ระงับบัญชี" : "เปิดใช้งาน", variant: turningOff ? "danger" : "neutral" },
    );
    if (!ok) return;
    try {
      await setStaffActive(target.id, !target.active);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  if (user && user.role !== "OWNER") {
    return (
      <Layout>
        <PageHeader
          title="จัดการผู้ใช้"
          subtitle="หน้านี้เข้าถึงได้เฉพาะเจ้าของระบบ (OWNER) เท่านั้น"
        />
      </Layout>
    );
  }

  return (
    <Layout>
      {resetTarget && <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)} />}
      <PageHeader
        title="จัดการผู้ใช้"
        subtitle="บัญชีพนักงานที่เข้าใช้ระบบฝั่งบริษัท — เจ้าของระบบสามารถเพิ่มพนักงาน รีเซ็ตรหัสผ่าน ระงับบัญชี และเปิดคืนได้"
        action={
          <Button onClick={() => setShowCreate((v) => !v)}>
            <UserPlus size={15} /> เพิ่มพนักงาน
          </Button>
        }
      />

      {showCreate && (
        <form
          className="mb-4 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submitCreate();
          }}
        >
          <p className="text-sm font-medium text-slate-800">เพิ่มพนักงาน</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>ชื่อผู้ใช้ (ใช้เข้าระบบ)</span>
              <input
                autoFocus
                value={createForm.username}
                onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                className={FIELD}
                placeholder="เช่น somchai"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>ชื่อ-นามสกุล</span>
              <input
                value={createForm.fullName}
                onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))}
                className={FIELD}
                placeholder="เช่น สมชาย ใจดี"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>อีเมล (ใช้กู้รหัสผ่าน)</span>
              <input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                className={FIELD}
                placeholder="name@example.com"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>บทบาท</span>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as StaffRole }))}
                className={FIELD}
              >
                <option value="ADMIN">ผู้ดูแล (ADMIN)</option>
                <option value="OWNER">เจ้าของ (OWNER)</option>
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1 text-xs text-slate-600">
              <label htmlFor="new-staff-password">รหัสผ่านเริ่มต้น</label>
              {/* ช่องนี้เป็น type=text (ตั้งใจ — OWNER ต้องอ่านรหัสไปบอกต่อได้) จึงไม่ต้องมีคำเตือน Caps Lock */}
              <div className="flex gap-2">
                <input
                  id="new-staff-password"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  className={`${FIELD} min-w-0 flex-1 font-mono`}
                  placeholder={PASSWORD_HINT}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title="สุ่มรหัสที่ผ่านกฎให้"
                  onClick={() =>
                    setCreateForm((f) => ({ ...f, password: generateTempPassword([f.username, f.fullName]) }))
                  }
                >
                  <Wand2 size={14} /> สร้างให้
                </Button>
              </div>
              <ThaiKeyboardHint value={createForm.password} />
            </div>
            {/* บอกกฎตั้งแต่ก่อนกด ไม่งั้นจะรู้ว่าผิดตอนกดบันทึกแล้วถูกตีกลับ */}
            <div className="sm:col-span-2 sm:pt-5">
              <PasswordRules value={createForm.password} personal={createPersonal} show />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            แจ้งชื่อผู้ใช้และรหัสเริ่มต้นให้พนักงาน — ระบบจะให้ตั้งรหัสใหม่ของตัวเองตอนเข้าครั้งแรก ·
            เจ้าตัวต้องยืนยันอีเมลในหน้าบัญชีของฉันก่อน ถึงจะกดลืมรหัสผ่านแล้วได้ลิงก์ทางอีเมล
          </p>
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={
                creating ||
                !createForm.username.trim() ||
                !createForm.fullName.trim() ||
                !createForm.email.trim() ||
                !createPasswordOk
              }
            >
              บันทึก
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
              ยกเลิก
            </Button>
          </div>
        </form>
      )}

      {loading && <TableSkeleton rows={6} cols={5} />}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="@container overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {/* @container: แผงเครื่องที่กางใต้แถวกว้างเท่ากรอบที่เห็น (100cqw) ไม่ใช่เท่าตารางที่เลื่อนได้ —
            ไม่งั้นบน iPad ปุ่มออกจากระบบท้ายแผงหลุดไปอยู่นอกจอ */}
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
            <tr>
              {/* iPad (<1280): ชื่อผู้ใช้/เพิ่มเมื่อ ย้ายไปใต้ชื่อ · สถานะไปใต้บทบาท · ปุ่มรวมเป็น ⋯ (ผู้ใช้สั่ง 18 ต.ค.) */}
              <th className="px-3 py-2">ชื่อ</th>
              <th className="hidden px-3 py-2 xl:table-cell">ชื่อผู้ใช้</th>
              <th className="px-3 py-2">บทบาท</th>
              <th className="hidden px-3 py-2 xl:table-cell">สถานะ</th>
              <th className="px-3 py-2">เครื่องที่เข้าอยู่</th>
              <th className="hidden px-3 py-2 xl:table-cell">เพิ่มเมื่อ</th>
              <th className="px-3 py-2"><span className="sr-only">คำสั่ง</span></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const role = u.role as StaffRole;
              const isSelf = u.id === user?.id;
              return (
                <Fragment key={u.id}>
                <tr className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 text-slate-800">
                    {u.fullName}
                    {isSelf && <span className="ml-1 text-xs text-slate-500">(บัญชีคุณ)</span>}
                    {/* iPad: ชื่อผู้ใช้ + อีเมล + วันที่เพิ่ม อยู่ใต้ชื่อ (คอลัมน์ของมันซ่อนไว้) */}
                    <div className="mt-0.5 text-sm text-slate-700 xl:hidden">
                      <UsernameLines u={u} />
                      <span className="block text-xs text-slate-400">เพิ่มเมื่อ {formatDate(u.createdAt)}</span>
                    </div>
                  </td>
                  <td className="hidden px-3 py-2 text-slate-700 xl:table-cell">
                    <UsernameLines u={u} />
                  </td>
                  <td className="px-3 py-2">
                    <span className={badgeClass(ROLE_COLOR[role])}>{ROLE_LABEL[role]}</span>
                    <span className={`mt-1 block w-fit xl:hidden ${badgeClass(u.active ? "emerald" : "red")}`}>
                      {u.active ? "ใช้งาน" : "ปิดใช้งาน"}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2 xl:table-cell">
                    <span className={badgeClass(u.active ? "emerald" : "red")}>
                      {u.active ? "ใช้งาน" : "ปิดใช้งาน"}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {u.activeSessions === 0 ? (
                      <span className="text-slate-400">ไม่มี</span>
                    ) : (
                      <span className="flex flex-col">
                        <span className="text-slate-700">{u.activeSessions} เครื่อง</span>
                        {u.lastSeenAt && <span className="text-xs text-slate-400">ใช้ล่าสุด {timeAgo(u.lastSeenAt)}</span>}
                      </span>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 text-slate-500 whitespace-nowrap xl:table-cell">{formatDate(u.createdAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {isSelf ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="xl:hidden">
                          <RowMenu
                            label={`คำสั่งของ ${u.fullName}`}
                            items={[
                              {
                                key: "devices",
                                label: devicesId === u.id ? "ซ่อนอุปกรณ์" : "อุปกรณ์",
                                onSelect: () => setDevicesId((cur) => (cur === u.id ? null : u.id)),
                              },
                              { key: "reset", label: "รีเซ็ตรหัส", onSelect: () => setResetTarget(u) },
                              {
                                key: "active",
                                label: u.active ? "ระงับบัญชี" : "เปิดใช้งาน",
                                danger: u.active,
                                onSelect: () => void toggleActive(u),
                              },
                            ]}
                          />
                        </div>
                        <div className="hidden gap-2 xl:flex">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-expanded={devicesId === u.id}
                            onClick={() => setDevicesId((cur) => (cur === u.id ? null : u.id))}
                          >
                            <MonitorSmartphone size={14} /> อุปกรณ์
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setResetTarget(u)}>
                            <KeyRound size={14} /> รีเซ็ตรหัส
                          </Button>
                          <Button
                            variant={u.active ? "dangerQuiet" : "ghost"}
                            size="sm"
                            onClick={() => toggleActive(u)}
                          >
                            <Power size={14} /> {u.active ? "ระงับบัญชี" : "เปิดใช้งาน"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
                {devicesId === u.id && !isSelf && (
                  <tr>
                    <td colSpan={7} className="p-0">
                      <div className="sticky left-0 w-[100cqw] px-3 pb-3">
                        <StaffDevicesPanel staff={u} onChanged={refreshQuietly} />
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </Layout>
  );
}
