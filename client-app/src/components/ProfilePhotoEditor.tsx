import { useRef, useState, type DragEvent } from "react";

import type { AuthenticatedUser } from "@systemboq/shared-types";

import { ApiError, apiFetch, apiUpload } from "../lib/api";
import { Avatar } from "./Avatar";
import { AvatarCropDialog } from "./AvatarCropDialog";
import { CameraIcon } from "./FieldIcons";

/** ขนาดไฟล์ที่ยอมให้เปิดเข้าหน้าครอป — ที่ส่งขึ้นจริงคือรูปที่ย่อแล้ว (ไม่กี่สิบ KB) ไม่ใช่ไฟล์นี้ */
const MAX_PICK_BYTES = 20 * 1024 * 1024;

type Status = { ok: boolean; text: string } | null;

/**
 * รูปโปรไฟล์ลูกค้า: กดที่รูป/ปุ่ม หรือลากไฟล์มาวาง → ครอปเป็นวงกลม → อัปโหลด
 * เซิร์ฟเวอร์สร้างไฟล์ใหม่ 256×256 WebP เอง (ตัด EXIF/GPS ทิ้ง) ไม่เก็บไฟล์ต้นฉบับ
 */
export function ProfilePhotoEditor({
  user,
  onUser,
}: Readonly<{
  user: AuthenticatedUser;
  onUser: (u: AuthenticatedUser) => void;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  function pick(file: File | undefined) {
    // ล้างค่าเสมอ ไม่งั้นเลือกไฟล์เดิมซ้ำ (หลังกดยกเลิก) จะไม่มี change event
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus({ ok: false, text: "เลือกได้เฉพาะไฟล์รูปภาพ" });
      return;
    }
    if (file.size > MAX_PICK_BYTES) {
      setStatus({ ok: false, text: "ไฟล์ใหญ่เกิน 20 MB" });
      return;
    }
    setStatus(null);
    setConfirmingRemove(false);
    setPicked(file);
  }

  async function upload(image: Blob) {
    const form = new FormData();
    // ชื่อไฟล์ไม่มีผล — เซิร์ฟเวอร์สร้างไฟล์ใหม่และตั้งชื่อเอง
    form.append("file", image, `avatar.${image.type === "image/webp" ? "webp" : "png"}`);
    try {
      const res = await apiUpload<{ user: AuthenticatedUser }>("/api/auth/me/avatar", form);
      onUser(res.user);
    } catch (err) {
      // โยนต่อให้กล่องครอปโชว์ข้อความ — กรอบที่จัดไว้ยังอยู่ กดลองใหม่ได้
      throw new Error(err instanceof ApiError ? err.message : "อัปโหลดไม่สำเร็จ");
    }
    setPicked(null);
    setStatus({ ok: true, text: "เปลี่ยนรูปโปรไฟล์แล้ว" });
  }

  async function remove() {
    setRemoving(true);
    try {
      const res = await apiFetch<{ user: AuthenticatedUser }>("/api/auth/me/avatar", { method: "DELETE" });
      onUser(res.user);
      setStatus({ ok: true, text: "ลบรูปโปรไฟล์แล้ว" });
    } catch (err) {
      setStatus({
        ok: false,
        text: err instanceof ApiError ? err.message : "ลบรูปไม่สำเร็จ",
      });
    } finally {
      setRemoving(false);
      setConfirmingRemove(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  }

  const hasPhoto = Boolean(user.avatarUrl);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`flex flex-col gap-4 rounded-xl border border-dashed p-4 transition-colors sm:flex-row sm:items-center sm:gap-5 ${
        dragging ? "border-brand bg-brand/[0.04]" : "border-transparent"
      } -m-4`}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={hasPhoto ? "เปลี่ยนรูปโปรไฟล์" : "อัปโหลดรูปโปรไฟล์"}
        className="group relative self-start rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Avatar name={user.fullName} src={user.avatarUrl} size={88} />
        <span
          aria-hidden
          className="absolute inset-0 hidden items-center justify-center rounded-full bg-slate-900/45 text-white group-hover:flex"
        >
          <CameraIcon className="h-6 w-6" />
        </span>
        <span
          aria-hidden
          className="absolute -right-0.5 -bottom-0.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-brand text-white shadow-sm"
        >
          <CameraIcon className="h-4 w-4" />
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-700">รูปโปรไฟล์</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
          JPG, PNG หรือ WEBP
          {/* มือถือลากไฟล์ไม่ได้ — บอกเฉพาะจอกว้าง */}
          <span className="hidden lg:inline"> · ลากไฟล์มาวางตรงนี้ก็ได้</span>
          <br />
          ระบบย่อรูปเหลือ 256×256 และลบข้อมูลตำแหน่ง (GPS) ในไฟล์ออกให้
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {confirmingRemove ? (
            <>
              <span className="text-sm text-slate-600">ลบรูปโปรไฟล์?</span>
              <button
                type="button"
                onClick={remove}
                disabled={removing}
                className="inline-flex min-h-11 items-center rounded-lg bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50 lg:min-h-9"
              >
                {removing ? "กำลังลบ..." : "ลบรูป"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRemove(false)}
                disabled={removing}
                className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100 lg:min-h-9"
              >
                ยกเลิก
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 lg:min-h-9"
              >
                {hasPhoto ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
              </button>
              {hasPhoto && (
                <button
                  type="button"
                  onClick={() => {
                    setStatus(null);
                    setConfirmingRemove(true);
                  }}
                  className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-red-700 hover:bg-red-50 lg:min-h-9"
                >
                  ลบรูป
                </button>
              )}
            </>
          )}
        </div>

        {status?.ok && <output className="mt-2 block text-sm text-emerald-700">{status.text}</output>}
        {status && !status.ok && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {status.text}
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {picked && <AvatarCropDialog file={picked} onCancel={() => setPicked(null)} onConfirm={upload} />}
    </div>
  );
}
