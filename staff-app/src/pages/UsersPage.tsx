import { KeyRound, Power, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import type { Role, StaffUserDto } from "@systemboq/shared-types";

import { Button } from "../components/Button";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { badgeClass, type BadgeColor } from "../lib/status-badge";
import { createStaff, listStaff, resetStaffPassword, setStaffActive } from "../lib/users-api";

type StaffRole = Extract<Role, "OWNER" | "ADMIN">;

const ROLE_LABEL: Record<StaffRole, string> = {
  OWNER: "เจ้าของ",
  ADMIN: "ผู้ดูแล",
};

const ROLE_COLOR: Record<StaffRole, BadgeColor> = {
  OWNER: "indigo",
  ADMIN: "slate",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("th-TH");
}

const EMPTY_CREATE = {
  email: "",
  fullName: "",
  role: "ADMIN" as StaffRole,
  password: "",
};

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

  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetting, setResetting] = useState(false);

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

  async function submitCreate() {
    if (!createForm.email.trim() || !createForm.fullName.trim() || createForm.password.length < 8) {
      return;
    }
    setCreating(true);
    try {
      await createStaff({
        email: createForm.email.trim(),
        fullName: createForm.fullName.trim(),
        role: createForm.role,
        password: createForm.password,
      });
      setCreateForm(EMPTY_CREATE);
      setShowCreate(false);
      await refresh();
      toast.success("เพิ่มพนักงานเรียบร้อยแล้ว — แจ้งอีเมลและรหัสผ่านเริ่มต้นให้พนักงาน แล้วให้เปลี่ยนรหัสเองภายหลัง");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เพิ่มพนักงานไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  }

  function openReset(id: string) {
    setResetId((cur) => (cur === id ? null : id));
    setResetPasswordValue("");
  }

  async function submitReset(target: StaffUserDto) {
    if (resetPasswordValue.length < 8) return;
    setResetting(true);
    try {
      await resetStaffPassword(target.id, resetPasswordValue);
      setResetId(null);
      setResetPasswordValue("");
      toast.success(
        `รีเซ็ตรหัสผ่านของ ${target.email} แล้ว — แจ้งรหัสใหม่ให้พนักงาน แล้วให้เปลี่ยนเองภายหลัง (อุปกรณ์เดิมถูกออกจากระบบทั้งหมด)`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "รีเซ็ตรหัสผ่านไม่สำเร็จ");
    } finally {
      setResetting(false);
    }
  }

  async function toggleActive(target: StaffUserDto) {
    const turningOff = target.active;
    const ok = await confirm(
      turningOff
        ? `ปิดใช้งานบัญชี ${target.email}? ผู้ใช้จะถูกออกจากระบบและเข้าใช้ไม่ได้จนกว่าจะเปิดใหม่`
        : `เปิดใช้งานบัญชี ${target.email} อีกครั้ง?`,
      { confirmLabel: turningOff ? "ปิดใช้งาน" : "เปิดใช้งาน", variant: turningOff ? "danger" : "primary" },
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
      <PageHeader
        title="จัดการผู้ใช้"
        subtitle="บัญชีพนักงานที่เข้าใช้ระบบฝั่งบริษัท — เจ้าของระบบสามารถเพิ่มพนักงาน รีเซ็ตรหัสผ่าน และเปิด/ปิดบัญชีได้"
        action={
          <Button onClick={() => setShowCreate((v) => !v)}>
            <UserPlus size={15} /> เพิ่มพนักงาน
          </Button>
        }
      />

      {showCreate && (
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end border border-dashed border-slate-300 rounded-lg p-3 bg-white">
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>อีเมล</span>
            <input
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              placeholder="staff@awarin.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>ชื่อ-นามสกุล</span>
            <input
              value={createForm.fullName}
              onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>บทบาท</span>
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as StaffRole }))}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            >
              <option value="ADMIN">ผู้ดูแล (ADMIN)</option>
              <option value="OWNER">เจ้าของ (OWNER)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>รหัสผ่านเริ่มต้น</span>
            <input
              type="text"
              value={createForm.password}
              onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              placeholder="อย่างน้อย 8 ตัว"
            />
          </label>
          <div className="sm:col-span-4 flex gap-2">
            <Button
              size="sm"
              onClick={submitCreate}
              disabled={
                creating ||
                !createForm.email.trim() ||
                !createForm.fullName.trim() ||
                createForm.password.length < 8
              }
            >
              บันทึก
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      )}

      {loading && <p className="text-slate-500">กำลังโหลด...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
            <tr>
              <th className="px-3 py-2">ชื่อ</th>
              <th className="px-3 py-2">อีเมล</th>
              <th className="px-3 py-2">บทบาท</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2">เพิ่มเมื่อ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const role = u.role as StaffRole;
              const isSelf = u.id === user?.id;
              return (
                <tr key={u.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 text-slate-800">
                    {u.fullName}
                    {isSelf && <span className="ml-1 text-xs text-slate-500">(บัญชีคุณ)</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{u.email}</td>
                  <td className="px-3 py-2">
                    <span className={badgeClass(ROLE_COLOR[role])}>{ROLE_LABEL[role]}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={badgeClass(u.active ? "emerald" : "red")}>
                      {u.active ? "ใช้งาน" : "ปิดใช้งาน"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {isSelf ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openReset(u.id)}>
                            <KeyRound size={14} /> รีเซ็ตรหัส
                          </Button>
                          <Button
                            variant={u.active ? "danger" : "primary"}
                            size="sm"
                            onClick={() => toggleActive(u)}
                          >
                            <Power size={14} /> {u.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                          </Button>
                        </div>
                        {resetId === u.id && (
                          <div className="flex items-center gap-2">
                            <input
                              autoFocus
                              type="text"
                              value={resetPasswordValue}
                              onChange={(e) => setResetPasswordValue(e.target.value)}
                              placeholder="รหัสใหม่ (อย่างน้อย 8 ตัว)"
                              className="border border-slate-300 rounded-md px-2 py-1 text-sm w-56"
                            />
                            <Button
                              size="sm"
                              onClick={() => submitReset(u)}
                              disabled={resetting || resetPasswordValue.length < 8}
                            >
                              ยืนยัน
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setResetId(null)}>
                              ยกเลิก
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
