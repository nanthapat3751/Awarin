import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

import { Button } from "./Button";

/** ด้านของภาพที่ส่งขึ้นเซิร์ฟเวอร์ — เซิร์ฟเวอร์ย่อเหลือ 256 เอง ส่งเผื่อไว้สองเท่าให้คม */
const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("เปิดไฟล์รูปนี้ไม่ได้"));
    img.src = url;
  });
}

/**
 * ตัดเฉพาะกรอบที่เลือกออกมาเป็นสี่เหลี่ยมจัตุรัส (วงกลมเป็นแค่หน้ากากตอนเลือก — รูปจริงเก็บเป็น
 * จัตุรัส แล้วแต่ละที่ค่อยตัดมุมด้วย CSS) · การวาดลง canvas ทิ้ง EXIF ทั้งหมดไปในตัว
 */
async function cropToBlob(url: string, area: Area): Promise<Blob> {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้ย่อรูปไม่ได้");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  // Safari รุ่นเก่าเข้ารหัส WebP ไม่ได้ จะได้ PNG กลับมาแทน — เซิร์ฟเวอร์รับทั้งสองแบบ
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
  if (!blob) throw new Error("ย่อรูปไม่สำเร็จ");
  return blob;
}

/**
 * เลือกกรอบรูปโปรไฟล์ — ลากเพื่อเลื่อน · เลื่อนแถบ/ล้อเมาส์/สองนิ้วเพื่อซูม
 * ต้องมีขั้นนี้เพราะรูปที่คนอัปส่วนใหญ่ไม่ใช่จัตุรัส (รูปตั้ง/รูปเต็มตัว) ถ้าตัดกลางอัตโนมัติ
 * หน้าจะถูกตัดหรือเล็กจนมองไม่เห็น
 */
export function AvatarCropDialog({
  file,
  onCancel,
  onConfirm,
}: Readonly<{ file: File; onCancel: () => void; onConfirm: (image: Blob) => Promise<void> }>) {
  const [url, setUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  // เปิดไฟล์ไม่ได้ = ใช้ไฟล์นี้ต่อไม่ได้เลย · อัปโหลดพลาด = ลองกดใหม่ได้ กรอบที่จัดไว้ต้องยังอยู่
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    // ผลของรอบที่ถูกเก็บกวาดไปแล้วต้องไม่นับ: cleanup เพิกถอน URL ก่อนรูปโหลดเสร็จ → โหลดพลาด
    // → ขึ้น "เปิดไฟล์ไม่ได้" ทั้งที่ไฟล์ดี (เจอจริงตอน StrictMode รัน effect สองรอบ)
    let stale = false;
    setUrl(objectUrl);
    setLoadError(null);
    // ตรวจก่อนว่าเปิดได้จริง (เช่น HEIC จาก iPhone ที่ Chrome เปิดไม่ได้) จะได้บอกทันที ไม่ใช่ค้างจอดำ
    loadImage(objectUrl).catch(() => {
      if (!stale) setLoadError("เปิดไฟล์รูปนี้ไม่ได้ — ลองใช้ไฟล์ JPG หรือ PNG (รูป HEIC จาก iPhone ให้แปลงก่อน)");
    });
    return () => {
      stale = true;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  async function confirm() {
    if (!url || !area) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm(await cropToBlob(url, area));
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
      setSaving(false);
    }
  }

  const stepZoom = (delta: number) =>
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 10) / 10)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label="ปิด"
        onClick={() => !saving && onCancel()}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />
      <dialog open
        aria-modal="true"
        aria-label="ปรับกรอบรูปโปรไฟล์"
        className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-slate-800">ปรับกรอบรูปโปรไฟล์</h2>
        <p className="mt-0.5 text-sm text-slate-500">ลากรูปเพื่อจัดตำแหน่ง แล้วซูมให้หน้าอยู่กลางวง</p>

        <div className="relative mt-4 aspect-square w-full overflow-hidden rounded-md bg-slate-900">
          {url && !loadError && (
            <Cropper
              image={url}
              crop={crop}
              zoom={zoom}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setArea(pixels)}
            />
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => stepZoom(-0.2)}
            aria-label="ซูมออก"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <Minus size={16} />
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="ซูม"
            className="flex-1 accent-brand"
          />
          <button
            type="button"
            onClick={() => stepZoom(0.2)}
            aria-label="ซูมเข้า"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <Plus size={16} />
          </button>
        </div>

        {(loadError ?? error) && <p className="mt-3 text-sm text-red-600">{loadError ?? error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={confirm} disabled={saving || !area || loadError != null}>
            {saving ? "กำลังบันทึก..." : "ใช้รูปนี้"}
          </Button>
        </div>
      </dialog>
    </div>
  );
}
