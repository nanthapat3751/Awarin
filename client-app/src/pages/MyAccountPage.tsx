import { useEffect, useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router-dom";

import type { CustomerProfileDto, CustomerType } from "@systemboq/shared-types";

import { apiFetch } from "../lib/api";
import { ApiError, useAuth } from "../lib/auth-context";

export function MyAccountPage() {
  const { user, changePassword, deleteAccount } = useAuth();
  const navigate = useNavigate();

  // ข้อมูลติดต่อ (เบอร์โทร/ที่อยู่) — ที่อยู่ใช้พิมพ์ "ที่อยู่ผู้ว่าจ้าง" บนใบเสนอราคา/สัญญา
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  // ผู้ว่าจ้างที่เป็นนิติบุคคลต้องบอกเองได้ตั้งแต่ต้น ไม่ใช่รอให้พนักงานสังเกตแล้วมากรอกให้ทีหลัง —
  // ไม่งั้นใบเสนอราคาใบแรกจะออกในนามชื่อคนที่สมัคร ซึ่งฝ่ายบัญชีของบริษัทตั้งเบิกไม่ได้
  const [customerType, setCustomerType] = useState<CustomerType>("INDIVIDUAL");
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [branch, setBranch] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    apiFetch<{ profile: CustomerProfileDto }>("/api/auth/me/profile")
      .then((res) => applyProfile(res.profile))
      .catch(() => {
        // เงียบไว้ — โหลดโปรไฟล์ไม่สำเร็จไม่ควรบล็อกทั้งหน้า (ยังเปลี่ยนรหัสผ่านได้)
      })
      .finally(() => setProfileLoading(false));
  }, []);

  function applyProfile(profile: CustomerProfileDto) {
    setPhone(profile.phone ?? "");
    setAddress(profile.address ?? "");
    setCustomerType(profile.customerType);
    setCompanyName(profile.companyName ?? "");
    setTaxId(profile.taxId ?? "");
    setBranch(profile.branch ?? "");
    setContactPerson(profile.contactPerson ?? "");
  }

  async function handleSaveProfile(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileError(null);
    setProfileSaved(false);
    setProfileSaving(true);
    try {
      const res = await apiFetch<{ profile: CustomerProfileDto }>("/api/auth/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          phone: phone.trim() || undefined,
          // ส่ง null เพื่อ "ล้างที่อยู่" ให้ชัดเจน (undefined = ไม่แตะ)
          address: address.trim() === "" ? null : address.trim(),
          customerType,
          // กลับไปเป็นบุคคลธรรมดา = ล้างช่องของบริษัททิ้ง ไม่ใช่แค่ซ่อน ไม่งั้นวันหนึ่งติ๊กกลับมา
          // แล้วชื่อบริษัทเก่าจะโผล่ขึ้นเอกสารเงียบ ๆ
          companyName: customerType === "COMPANY" ? companyName.trim() : null,
          taxId: customerType === "COMPANY" ? taxId.trim() : null,
          branch: customerType === "COMPANY" ? branch.trim() : null,
          contactPerson: customerType === "COMPANY" ? contactPerson.trim() : null,
        }),
      });
      applyProfile(res.profile);
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ");
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleDeleteAccount(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      navigate("/", { replace: true });
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "ลบบัญชีไม่สำเร็จ");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">บัญชีของฉัน</h1>
        {user && <p className="text-sm text-slate-500 mt-1">{user.email}</p>}
      </div>

      <form
        onSubmit={handleSaveProfile}
        className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col gap-4"
      >
        <div>
          <h2 className="text-lg font-medium text-slate-800">ข้อมูลติดต่อ</h2>
          <p className="text-xs text-slate-500 mt-1">
            ชื่อและที่อยู่ตรงนี้จะถูกใช้พิมพ์เป็น "ผู้ว่าจ้าง" บนใบเสนอราคาและสัญญาของคุณ
          </p>
        </div>

        <label className="flex flex-col gap-1 text-sm text-slate-600">
          <span>เบอร์โทรศัพท์</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            disabled={profileLoading}
            onChange={(e) => setPhone(e.target.value)}
            className="border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm text-slate-600">ผู้ว่าจ้างในเอกสารคือ</legend>
          <div className="flex flex-wrap gap-4">
            {(
              [
                ["INDIVIDUAL", "ตัวฉันเอง (บุคคลธรรมดา)"],
                ["COMPANY", "บริษัท / นิติบุคคล"],
              ] as [CustomerType, string][]
            ).map(([value, label]) => (
              <label
                key={value}
                className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-700 lg:min-h-0"
              >
                <input
                  type="radio"
                  name="customerType"
                  className="accent-slate-800"
                  checked={customerType === value}
                  disabled={profileLoading}
                  onChange={() => setCustomerType(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {customerType === "COMPANY" && (
          <>
            <label className="flex flex-col gap-1 text-sm text-slate-600">
              <span>ชื่อนิติบุคคล</span>
              <input
                value={companyName}
                disabled={profileLoading}
                maxLength={200}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="ตามหนังสือรับรอง เช่น บริษัท ตัวอย่าง จำกัด"
                className="border border-slate-300 rounded px-3 py-2 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-slate-600">
                <span>เลขประจำตัวผู้เสียภาษี</span>
                <input
                  value={taxId}
                  inputMode="numeric"
                  maxLength={13}
                  disabled={profileLoading}
                  onChange={(e) => setTaxId(e.target.value.replace(/\D/g, ""))}
                  placeholder="13 หลัก"
                  className="border border-slate-300 rounded px-3 py-2 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-600">
                <span>สำนักงาน / สาขา</span>
                <input
                  value={branch}
                  disabled={profileLoading}
                  maxLength={100}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="เช่น สำนักงานใหญ่"
                  className="border border-slate-300 rounded px-3 py-2 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm text-slate-600">
              <span>ผู้ประสานงาน</span>
              <input
                value={contactPerson}
                disabled={profileLoading}
                maxLength={200}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder={user?.fullName ?? ""}
                className="border border-slate-300 rounded px-3 py-2 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
              />
              <span className="text-xs text-slate-500">เว้นว่างไว้จะใช้ชื่อบัญชีของคุณ</span>
            </label>
          </>
        )}

        <label className="flex flex-col gap-1 text-sm text-slate-600">
          <span>ที่อยู่</span>
          <textarea
            rows={3}
            value={address}
            disabled={profileLoading}
            maxLength={1000}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
            className="border border-slate-300 rounded px-3 py-2 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
          />
        </label>

        {profileError && <p className="text-sm text-red-600">{profileError}</p>}
        {profileSaved && <p className="text-sm text-emerald-600">บันทึกข้อมูลติดต่อเรียบร้อยแล้ว</p>}

        <button
          type="submit"
          disabled={profileLoading || profileSaving}
          className="mt-2 inline-flex min-h-11 items-center justify-center self-start rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 lg:min-h-0"
        >
          {profileSaving ? "กำลังบันทึก..." : "บันทึกข้อมูลติดต่อ"}
        </button>
      </form>

      <form
        onSubmit={handleChangePassword}
        className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col gap-4"
      >
        <h2 className="text-lg font-medium text-slate-800">เปลี่ยนรหัสผ่าน</h2>

        <label className="flex flex-col gap-1 text-sm text-slate-600">
          <span>รหัสผ่านปัจจุบัน</span>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-slate-600">
          <span>รหัสผ่านใหม่</span>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-slate-600">
          <span>ยืนยันรหัสผ่านใหม่</span>
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </label>

        {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
        {passwordSaved && <p className="text-sm text-emerald-600">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว</p>}

        <button
          type="submit"
          disabled={changingPassword}
          className="mt-2 bg-slate-800 text-white rounded py-2 font-medium disabled:opacity-50"
        >
          {changingPassword ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
        </button>
      </form>

      <div className="bg-white border border-red-200 rounded-lg p-6 flex flex-col gap-3">
        <h2 className="text-lg font-medium text-red-700">ลบบัญชีของฉัน</h2>
        <p className="text-sm text-slate-500">
          บัญชีของคุณจะถูกปิดใช้งานและข้อมูลส่วนตัว (ชื่อ อีเมล เบอร์โทร ที่อยู่) จะถูกลบออก
          ประวัติคำขอและใบเสนอราคาจะยังถูกเก็บไว้ตามข้อกำหนดทางกฎหมาย การลบบัญชีไม่สามารถย้อนกลับได้
        </p>

        {!confirmingDelete ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="inline-flex min-h-11 items-center self-start rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 lg:min-h-0"
          >
            ลบบัญชีของฉัน
          </button>
        ) : (
          <form onSubmit={handleDeleteAccount} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-slate-600">
              <span>กรอกรหัสผ่านเพื่อยืนยันการลบบัญชี</span>
              <input
                type="password"
                required
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </label>

            {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={deleting}
                className="bg-red-700 text-white rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {deleting ? "กำลังลบ..." : "ยืนยันลบบัญชี"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                  setDeletePassword("");
                  setDeleteError(null);
                }}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
